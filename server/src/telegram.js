import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { pendingLogins, activeClients, removeClient } from './clientManager.js';
import { encrypt } from './crypto.js';
import { supabase } from './supabase.js';
import bigInt from 'big-integer';

// ===== AUTH FLOWS FOR USER PORTAL =====

/**
 * Checks if a given client is authorized.
 */
export async function checkConnection(client) {
  if (!client) return false;
  try {
    if (!client.connected) {
      await client.connect();
    }
    const authorized = await client.isUserAuthorized();
    return authorized;
  } catch (e) {
    console.error("Check connection failed:", e);
    return false;
  }
}

/**
 * Initialize a new TelegramClient in memory for a user logging in.
 */
export async function initClientForUser(userId, apiId, apiHash) {
  const currentApiId = parseInt(apiId);

  // Clear existing pending login if any
  const existing = pendingLogins.get(userId);
  if (existing) {
    try {
      await existing.client.disconnect();
    } catch {}
    pendingLogins.delete(userId);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, currentApiId, apiHash, {
    connectionRetries: 10,
    useWSS: true,
  });

  const context = {
    client,
    apiId: currentApiId,
    apiHash,
    phone: null,
    phoneCodeHash: null
  };

  pendingLogins.set(userId, context);
  return client;
}

/**
 * Request an OTP code from Telegram.
 */
export async function requestCode(userId, phone, apiId, apiHash) {
  const client = await initClientForUser(userId, apiId, apiHash);
  await client.connect();

  const result = await client.sendCode({
    apiId: parseInt(apiId),
    apiHash: apiHash
  }, phone);

  const context = pendingLogins.get(userId);
  if (context) {
    context.phone = phone;
    context.phoneCodeHash = result.phoneCodeHash;
  }

  return { success: true, next_step: 'code' };
}

/**
 * Sign in using OTP code.
 */
export async function signIn(userId, code) {
  const context = pendingLogins.get(userId);
  if (!context) throw new Error("API ID and API Hash configuration context not found.");

  const { client, apiId, apiHash, phone, phoneCodeHash } = context;
  if (!client.connected) await client.connect();

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: code
      })
    );

    const sessionString = client.session.save();

    // Encrypt sensitive details
    const apiHashEncrypted = encrypt(apiHash);
    const sessionStringEncrypted = encrypt(sessionString);

    // Save session to Supabase
    const { error } = await supabase
      .from('telegram_sessions')
      .upsert({
        user_id: userId,
        api_id: apiId,
        api_hash_encrypted: apiHashEncrypted,
        session_string_encrypted: sessionStringEncrypted,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`Failed to save Telegram session to database: ${error.message}`);
    }

    // Promote to active map
    activeClients.set(userId, {
      client,
      lastActive: Date.now()
    });
    pendingLogins.delete(userId);

    return { success: true, next_step: 'dashboard' };
  } catch (e) {
    if (e.message && e.message.includes('SESSION_PASSWORD_NEEDED')) {
      return { success: false, next_step: 'password' };
    }
    throw e;
  }
}

/**
 * Verify 2FA password.
 */
export async function checkPassword(userId, password) {
  const context = pendingLogins.get(userId);
  if (!context) throw new Error("Session context not found.");

  const { client, apiId, apiHash } = context;
  if (!client.connected) await client.connect();

  await client.signInWithPassword({
    apiId: apiId,
    apiHash: apiHash
  }, {
    password: () => password
  });

  const sessionString = client.session.save();
  const apiHashEncrypted = encrypt(apiHash);
  const sessionStringEncrypted = encrypt(sessionString);

  // Save session to Supabase
  const { error } = await supabase
    .from('telegram_sessions')
    .upsert({
      user_id: userId,
      api_id: apiId,
      api_hash_encrypted: apiHashEncrypted,
      session_string_encrypted: sessionStringEncrypted,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Failed to save Telegram session: ${error.message}`);
  }

  // Promote to active map
  activeClients.set(userId, {
    client,
    lastActive: Date.now()
  });
  pendingLogins.delete(userId);

  return { success: true, next_step: 'dashboard' };
}

/**
 * Sign out from Telegram and delete DB sessions.
 */
export async function logout(userId) {
  // Delete from database
  await supabase
    .from('telegram_sessions')
    .delete()
    .eq('user_id', userId);

  const entry = activeClients.get(userId);
  if (entry) {
    try {
      await entry.client.logOut();
    } catch (e) {
      console.error("Error during Telegram signout:", e);
    }
  }

  await removeClient(userId);
  return { success: true };
}

// ===== FOLDERS =====

export async function listFolders(client) {
  const dialogs = await client.getDialogs();
  const folders = [];

  for (const dialog of dialogs) {
    if (dialog.isChannel || dialog.isGroup) {
      const name = dialog.title || '';
      const entity = dialog.entity;

      if (name.toLowerCase().includes('[td]')) {
        const cleanName = name.replace(/\s*\[td\]/i, '').trim();
        const username = (entity && entity.username) ? entity.username : null;
        folders.push({
          id: Number(dialog.id),
          name: cleanName,
          username: username,
          is_public: username ? 1 : 0
        });
      }
    }
  }
  return folders;
}

export async function createFolder(client, name) {
  const result = await client.invoke(
    new Api.channels.CreateChannel({
      title: `${name} [TD]`,
      about: "Telegram Drive Storage Folder\n[telegram-drive-folder]",
      broadcast: true,
      megagroup: false
    })
  );

  const channel = result.chats.find(chat => chat instanceof Api.Channel);
  if (!channel) throw new Error("Failed to retrieve created channel metadata.");

  return {
    id: Number(channel.id),
    name: name,
    username: channel.username || null,
    is_public: channel.username ? 1 : 0
  };
}

export async function deleteFolder(client, folderId) {
  const entity = await client.getInputEntity(folderId);
  await client.invoke(
    new Api.channels.DeleteChannel({
      channel: entity
    })
  );
  return { success: true };
}

export async function renameFolder(client, folderId, newName) {
  const entity = await client.getInputEntity(folderId);
  await client.invoke(
    new Api.channels.EditTitle({
      channel: entity,
      title: `${newName} [TD]`
    })
  );
  return { success: true };
}

// ===== FILES =====

export async function listFiles(client, folderId, search = '') {
  const targetId = (!folderId || folderId === 'null' || folderId === 'undefined') ? 'me' : folderId;
  const entity = await client.getInputEntity(targetId);
  const messages = await client.getMessages(entity, { limit: 100 });
  const files = [];

  for (const msg of messages) {
    if (msg.media && msg.media instanceof Api.MessageMediaDocument) {
      const doc = msg.media.document;
      const fileAttr = doc.attributes.find(attr => attr instanceof Api.DocumentAttributeFilename);
      const originalName = fileAttr ? fileAttr.fileName : `file_${msg.id}`;

      if (search && !originalName.toLowerCase().includes(search.toLowerCase())) {
        continue;
      }

      files.push({
        id: msg.id,
        folder_id: (targetId === 'me') ? null : Number(targetId),
        name: originalName,
        size: Number(doc.size),
        mime_type: doc.mimeType,
        file_ext: originalName.split('.').pop() || '',
        created_at: new Date(msg.date * 1000).toISOString(),
        icon_type: 'file'
      });
    }
  }
  return files;
}

export async function deleteFile(client, folderId, messageId) {
  const targetId = (!folderId || folderId === 'null' || folderId === 'undefined') ? 'me' : folderId;
  const entity = await client.getInputEntity(targetId);
  await client.deleteMessages(entity, [parseInt(messageId)], { revoke: true });
  return { success: true };
}

export async function uploadFile(client, folderId, filePath, fileName) {
  const targetId = (!folderId || folderId === 'null' || folderId === 'undefined') ? 'me' : folderId;
  const entity = await client.getInputEntity(targetId);

  const message = await client.sendFile(entity, {
    file: filePath,
    forceDocument: true,
    attributes: [
      new Api.DocumentAttributeFilename({
        fileName: fileName
      })
    ]
  });

  return {
    id: message.id,
    name: fileName
  };
}

/**
 * Upload a file directly from a Buffer (no disk I/O).
 */
export async function uploadFileFromBuffer(client, folderId, buffer, fileName, mimeType) {
  const targetId = (!folderId || folderId === 'null' || folderId === 'undefined') ? 'me' : folderId;
  const entity = await client.getInputEntity(targetId);

  const message = await client.sendFile(entity, {
    file: buffer,
    forceDocument: true,
    workers: 4,
    attributes: [
      new Api.DocumentAttributeFilename({
        fileName: fileName
      })
    ]
  });

  return {
    id: message.id,
    name: fileName
  };
}

export async function downloadFile(client, folderId, messageId, req, res) {
  const targetId = (!folderId || folderId === 'null' || folderId === 'undefined') ? 'me' : folderId;
  const entity = await client.getInputEntity(targetId);
  const messages = await client.getMessages(entity, { ids: [parseInt(messageId)] });
  const message = messages[0];

  if (!message || !message.media || !(message.media instanceof Api.MessageMediaDocument)) {
    throw new Error("File not found on Telegram");
  }

  const doc = message.media.document;
  const fileAttr = doc.attributes.find(attr => attr instanceof Api.DocumentAttributeFilename);
  const fileName = fileAttr ? fileAttr.fileName : `file_${messageId}`;
  const fileSize = Number(doc.size);

  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).send('Requested range not satisfiable');
    }

    const chunksize = (end - start) + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunksize.toString());

    try {
      // Telegram requires requestSize to be a multiple of 1MB (1048576)
      const REQUEST_SIZE = 1024 * 1024; // 1MB chunks
      // Align start offset to 1MB boundary for iterDownload
      const alignedStart = Math.floor(start / REQUEST_SIZE) * REQUEST_SIZE;
      const skipBytes = start - alignedStart;

      const fileStream = client.iterDownload({
        file: message.media,
        offset: bigInt(alignedStart),
        limit: chunksize + skipBytes,
        requestSize: REQUEST_SIZE
      });

      let skipped = 0;
      for await (const chunk of fileStream) {
        if (skipped < skipBytes) {
          const remaining = skipBytes - skipped;
          if (chunk.length <= remaining) {
            skipped += chunk.length;
            continue;
          }
          res.write(chunk.slice(remaining));
          skipped = skipBytes;
        } else {
          res.write(chunk);
        }
      }
      res.end();
    } catch (streamError) {
      console.error("Streaming range download failed:", streamError);
      if (!res.headersSent) {
        res.status(500).send("Stream error");
      }
    }
  } else {
    res.setHeader('Content-Length', fileSize.toString());

    try {
      const fileStream = client.iterDownload({
        file: message.media,
        requestSize: 1024 * 1024 // 1MB chunks
      });

      for await (const chunk of fileStream) {
        res.write(chunk);
      }
      res.end();
    } catch (streamError) {
      console.error("Streaming full download failed:", streamError);
      if (!res.headersSent) {
        res.status(500).send("Stream error");
      }
    }
  }
}
