import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { supabase } from './supabase.js';
import { decrypt } from './crypto.js';

// In-memory clients mapping
export const activeClients = new Map(); // userId -> { client, lastActive }
export const pendingLogins = new Map(); // userId -> { client, apiId, apiHash, phone, phoneCodeHash }

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
