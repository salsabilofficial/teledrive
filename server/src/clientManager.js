import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { supabase } from './supabase.js';
import { decrypt } from './crypto.js';

// In-memory clients mapping
export const activeClients = new Map(); // userId -> { client, lastActive }
export const pendingLogins = new Map(); // userId -> { client, apiId, apiHash, phone, phoneCodeHash }

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity = disconnect

/**
 * Retrieve or dynamically initialize the TelegramClient for a given user.
 * @param {string} userId - The Supabase user UUID.
 * @returns {Promise<TelegramClient|null>}
 */
export async function getClientForUser(userId) {
  if (activeClients.has(userId)) {
    const entry = activeClients.get(userId);
    entry.lastActive = Date.now();

    if (!entry.client.connected) {
      await entry.client.connect();
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
      connectionRetries: 10,
      useWSS: true,
    });

    await client.connect();

    activeClients.set(userId, {
      client,
      lastActive: Date.now()
    });

    console.log(`[ClientManager] ✅ Connected new client for user ${userId.slice(0, 8)}... (${activeClients.size} total active)`);
    return client;
  } catch (e) {
    console.error(`[ClientManager] Error connecting client for user ${userId}:`, e);
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
 * Returns basic stats about the current state of active connections.
 * Safe to expose publicly — contains no sensitive data.
 */
export function getStats() {
  return {
    activeConnections: activeClients.size,
    pendingLogins: pendingLogins.size,
  };
}

// ===== IDLE CLIENT CLEANUP =====
// Run every 10 minutes. Disconnects any client that has been idle for > 30 minutes.
// This prevents RAM from filling up with stale connections on a long-running server.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

setInterval(async () => {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, entry] of activeClients.entries()) {
    const idleMs = now - entry.lastActive;
    if (idleMs > IDLE_TIMEOUT_MS) {
      console.log(`[ClientManager] 🧹 Removing idle client for user ${userId.slice(0, 8)}... (idle ${Math.round(idleMs / 60000)}m)`);
      await removeClient(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[ClientManager] Cleanup done. Removed ${cleaned} idle client(s). Active: ${activeClients.size}`);
  }
}, CLEANUP_INTERVAL_MS);
