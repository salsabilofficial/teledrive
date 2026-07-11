import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { supabase } from './supabase.js';
import { decrypt } from './crypto.js';

// In-memory clients mapping
export const activeClients = new Map(); // userId -> { client, lastActive, state, reconnectAttempts }
export const pendingLogins = new Map(); // userId -> { client, apiId, apiHash, phone, phoneCodeHash }

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity = disconnect
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Perform a quick health check on a Telegram client.
 * Returns true if the client is responsive and authenticated.
 */
async function checkClientHealth(client) {
  if (!client || !client.connected) return false;
  try {
    // A fast, cached, low-overhead API call to verify the connection
    const me = await client.getMe();
    return !!me;
  } catch (err) {
    console.error(`[ClientManager] Healthcheck ping failed:`, err.message);
    
    // If the session is revoked/invalid, we should clean up
    if (err.message.includes('AUTH_KEY_UNREGISTERED') || err.message.includes('SESSION_REVOKED')) {
      return 'revoked';
    }
    return false;
  }
}

/**
 * Handle reconnection backoff for a user client.
 */
async function handleReconnectBackoff(userId) {
  const entry = activeClients.get(userId);
  if (!entry) return;

  if (entry.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[ClientManager] ❌ Max reconnect attempts reached for user ${userId.slice(0, 8)}. Disconnecting...`);
    entry.state = 'failed';
    await removeClient(userId);
    return;
  }

  entry.reconnectAttempts++;
  entry.state = 'connecting';
  
  const delay = Math.min(1000 * Math.pow(2, entry.reconnectAttempts), 30000); // exponential backoff up to 30s
  console.log(`[ClientManager] 🔄 Reconnecting client for user ${userId.slice(0, 8)} in ${delay}ms... (Attempt ${entry.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  setTimeout(async () => {
    // Re-verify if client hasn't been removed in the meantime
    const currentEntry = activeClients.get(userId);
    if (!currentEntry) return;

    try {
      if (!currentEntry.client.connected) {
        await currentEntry.client.connect();
      }
      const healthy = await checkClientHealth(currentEntry.client);
      if (healthy === true) {
        console.log(`[ClientManager] ✅ Successfully reconnected client for user ${userId.slice(0, 8)}`);
        currentEntry.state = 'connected';
        currentEntry.reconnectAttempts = 0;
      } else if (healthy === 'revoked') {
        console.error(`[ClientManager] ❌ Session revoked during reconnect for user ${userId.slice(0, 8)}. Removing...`);
        await removeClient(userId);
      } else {
        // Retry backoff again
        handleReconnectBackoff(userId);
      }
    } catch (e) {
      console.error(`[ClientManager] Reconnect attempt failed for user ${userId.slice(0, 8)}:`, e.message);
      handleReconnectBackoff(userId);
    }
  }, delay);
}

/**
 * Retrieve or dynamically initialize the TelegramClient for a given user.
 * @param {string} userId - The Supabase user UUID.
 * @returns {Promise<TelegramClient|null>}
 */
export async function getClientForUser(userId) {
  if (activeClients.has(userId)) {
    const entry = activeClients.get(userId);
    entry.lastActive = Date.now();

    // If client is disconnected but state is not failed, attempt to connect
    if (!entry.client.connected && entry.state !== 'connecting') {
      try {
        entry.state = 'connecting';
        await entry.client.connect();
        entry.state = 'connected';
        entry.reconnectAttempts = 0;
      } catch (err) {
        console.error(`[ClientManager] Failed to quick-connect client for user ${userId.slice(0, 8)}:`, err.message);
        handleReconnectBackoff(userId);
      }
    }
    return entry.client;
  }

  // Fetch session details from Supabase
  const { data: sessionData, error } = await supabase
    .from('telegram_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error(`[ClientManager] Database error loading session for user ${userId}:`, error);
    return null;
  }

  if (!sessionData) {
    return null; // User has not linked a Telegram account yet
  }

  try {
    const apiId = sessionData.api_id;
    const apiHash = decrypt(sessionData.api_hash_encrypted);
    const sessionString = decrypt(sessionData.session_string_encrypted);

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: true,
      autoReconnect: true
    });

    await client.connect();

    const entry = {
      client,
      lastActive: Date.now(),
      state: 'connected',
      reconnectAttempts: 0
    };

    activeClients.set(userId, entry);

    // Setup reactive disconnection listener
    client.on('disconnected', () => {
      console.warn(`[ClientManager] ⚠️ Client for user ${userId.slice(0, 8)} disconnected from Telegram network`);
      if (activeClients.has(userId) && activeClients.get(userId).state === 'connected') {
        handleReconnectBackoff(userId);
      }
    });

    console.log(`[ClientManager] ✅ Connected new client for user ${userId.slice(0, 8)}... (${activeClients.size} total active)`);
    return client;
  } catch (e) {
    console.error(`[ClientManager] Error connecting client for user ${userId}:`, e);
    // If auth key is unregistered, clean it up from Supabase to prevent infinite retry loops
    if (e.message?.includes('AUTH_KEY_UNREGISTERED') || e.message?.includes('SESSION_REVOKED')) {
      console.warn(`[ClientManager] Revoking invalid Telegram session in database for user ${userId.slice(0, 8)}`);
      await supabase.from('telegram_sessions').delete().eq('user_id', userId).catch(() => {});
    }
    return null;
  }
}

/**
 * Terminate connection and clean up client from active map.
 * @param {string} userId 
 */
export async function removeClient(userId) {
  const entry = activeClients.get(userId);
  if (entry) {
    entry.state = 'disconnected';
    try {
      await entry.client.disconnect();
    } catch (e) {
      console.error(`[ClientManager] Error disconnecting user ${userId}:`, e);
    }
    activeClients.delete(userId);
  }
  pendingLogins.delete(userId);
}

/**
 * Returns stats about active connections with their states.
 */
export function getStats() {
  const clients = [];
  for (const [userId, entry] of activeClients.entries()) {
    clients.push({
      userId: userId.slice(0, 8),
      state: entry.state,
      reconnectAttempts: entry.reconnectAttempts,
      idleMinutes: Math.round((Date.now() - entry.lastActive) / 60000)
    });
  }
  return {
    activeConnections: activeClients.size,
    pendingLogins: pendingLogins.size,
    clients
  };
}

// ===== HEALTH CHECK & CLEANUP =====
// Run every 10 minutes. 
// Checks health of active clients and disconnects idle ones.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();
  let cleaned = 0;
  let healthyCount = 0;
  let unhealthyCount = 0;

  for (const [userId, entry] of activeClients.entries()) {
    const idleMs = now - entry.lastActive;
    
    // 1) Idle cleanup
    if (idleMs > IDLE_TIMEOUT_MS) {
      console.log(`[ClientManager] 🧹 Removing idle client for user ${userId.slice(0, 8)}... (idle ${Math.round(idleMs / 60000)}m)`);
      await removeClient(userId);
      cleaned++;
      continue;
    }

    // 2) Active health check ping
    const healthy = await checkClientHealth(entry.client);
    if (healthy === true) {
      healthyCount++;
    } else {
      unhealthyCount++;
      if (healthy === 'revoked') {
        console.error(`[ClientManager] ⚠️ Healthcheck found revoked session for user ${userId.slice(0, 8)}. Removing...`);
        await removeClient(userId);
        cleaned++;
      } else {
        console.warn(`[ClientManager] ⚠️ Healthcheck found unhealthy client for user ${userId.slice(0, 8)}. Attempting reconnect...`);
        handleReconnectBackoff(userId);
      }
    }
  }

  if (cleaned > 0 || unhealthyCount > 0) {
    console.log(`[ClientManager] Healthcheck/Cleanup done. Healthy: ${healthyCount}, Unhealthy: ${unhealthyCount}, Cleaned: ${cleaned}. Active: ${activeClients.size}`);
  }
}, CLEANUP_INTERVAL_MS);
