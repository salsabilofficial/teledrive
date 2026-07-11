import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { rateLimit } from 'express-rate-limit';
import * as tg from './telegram.js';
import { supabase } from './supabase.js';
import { decrypt } from './crypto.js';
import { getClientForUser, getStats } from './clientManager.js';
import { uploadTracker } from './uploadTracker.js';
import * as db from './db.js';
import * as mediaCache from './mediaCache.js';
import { bgQueue } from './queue.js';

// Initialize the database persistence layer
db.initDb(path.join(process.cwd(), 'data.json'));

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// ===== CORS WHITELIST =====
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, callback) => {
    const isTauri = origin && (origin.startsWith('tauri://') || origin.includes('tauri.localhost'));
    if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*') || isTauri) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} is not allowed`));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
}));
app.use(express.json());

// ===== UPLOAD PROGRESS SSE & CANCEL =====
app.get('/api/files/upload/progress', checkAuth, (req, res) => {
  const uploadId = req.query.upload_id;
  if (!uploadId) {
    return res.status(400).json({ error: 'Missing upload_id' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  uploadTracker.addSseClient(uploadId, res);

  req.on('close', () => {
    uploadTracker.removeSseClient(uploadId, res);
  });
});

app.post('/api/files/upload/:uploadId/cancel', checkAuth, (req, res) => {
  const uploadId = req.params.uploadId;
  const cancelled = uploadTracker.cancel(uploadId);
  if (cancelled) {
    res.json({ success: true, message: 'Upload cancelled successfully' });
  } else {
    res.status(400).json({ error: 'Upload not active or already finished' });
  }
});

// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute window
  max: 120,                   // Max 120 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute window
  max: 10,                    // Max 10 uploads per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please wait a moment.' }
});

app.use('/api/', limiter);

// JWT Authentication middleware using Supabase
async function checkAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ===== AUTH ROUTES =====

app.get('/api/health', (req, res) => {
  const stats = getStats();
  res.json({
    status: 'ok',
    version: '1.0.1',
    uptime: Math.floor(process.uptime()),
    activeConnections: stats.activeConnections,
    timestamp: new Date().toISOString()
  });
});

// Internal debug endpoint for queue & client state
app.get('/api/debug/queue', (req, res) => {
  const clientStats = getStats();
  const queueStats = bgQueue.getQueueStats();
  const jobs = bgQueue.getJobs();

  res.json({
    status: 'ok',
    queue: queueStats,
    activeConnections: clientStats.activeConnections,
    pendingLogins: clientStats.pendingLogins,
    activeClients: clientStats.clients,
    jobs
  });
});

app.post('/api/auth/register-invite', async (req, res) => {
  const { email, password, token } = req.body;
  if (!email || !password || !token) {
    return res.status(400).json({ error: 'Email, password, and invite token are required' });
  }

  try {
    // 1. Verify token in public.invitations table
    const { data: invite, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .maybeSingle();

    if (inviteError || !invite) {
      return res.status(400).json({ error: 'Invite token is invalid or has already been used' });
    }

    // 2. Create user in Supabase Auth using Admin API
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // Confirm email automatically
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    // 3. Mark invitation token as used
    const { error: updateError } = await supabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);

    if (updateError) {
      console.error('Failed to mark invitation token as used:', updateError);
    }

    res.json({ success: true, message: 'Account created successfully! You can now log in.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/connect', checkAuth, async (req, res) => {
  const { api_id, api_hash } = req.body;
  if (!api_id) return res.status(400).json({ error: 'api_id required' });

  try {
    await tg.initClientForUser(req.user.id, api_id, api_hash || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/code', checkAuth, async (req, res) => {
  const { phone, api_id, api_hash } = req.body;
  if (!phone || !api_id) return res.status(400).json({ error: 'phone and api_id required' });

  try {
    const result = await tg.requestCode(req.user.id, phone, api_id, api_hash || '');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/sign-in', checkAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  try {
    const result = await tg.signIn(req.user.id, code);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/password', checkAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });

  try {
    const result = await tg.checkPassword(req.user.id, password);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', checkAuth, async (req, res) => {
  try {
    const result = await tg.logout(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/qr/start', checkAuth, async (req, res) => {
  const { api_id, api_hash } = req.body;
  if (!api_id || !api_hash) {
    return res.status(400).json({ error: 'api_id and api_hash required' });
  }

  try {
    const result = await tg.startQrLogin(req.user.id, api_id, api_hash);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/qr/status', checkAuth, async (req, res) => {
  try {
    const result = await tg.checkQrStatus(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/status', checkAuth, async (req, res) => {
  try {
    const client = await getClientForUser(req.user.id);
    const isConnected = await tg.checkConnection(client);
    res.json({ authenticated: isConnected });
  } catch (e) {
    res.json({ authenticated: false });
  }
});

app.get('/api/auth/telegram-credentials', checkAuth, async (req, res) => {
  try {
    const { data: session, error } = await supabase
      .from('telegram_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !session) {
      return res.status(404).json({ error: 'No Telegram session found' });
    }

    const apiHash = decrypt(session.api_hash_encrypted);
    res.json({
      api_id: session.api_id,
      api_hash: apiHash
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== FOLDER ROUTES =====

app.get('/api/folders', checkAuth, async (req, res) => {
  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const folders = await tg.listFolders(client);
    res.json({ data: folders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/folders', checkAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const newFolder = await tg.createFolder(client, name);
    res.json(newFolder);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/folders/:id', checkAuth, async (req, res) => {
  const folderId = req.params.id;
  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.deleteFolder(client, folderId);
    
    // Invalidate all cached media for this folder
    mediaCache.invalidateFolder(folderId);
    
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/folders/:id', checkAuth, async (req, res) => {
  const folderId = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.renameFolder(client, folderId, name);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== FILE ROUTES =====

// Background synchronization helper via queue
function syncFolderFilesBackground(client, folderId, priority = 5) {
  const srcFolderId = (folderId === 'null' || folderId === 'undefined' || !folderId) ? null : Number(folderId);
  const jobName = `sync_folder_${srcFolderId ?? 'root'}`;
  
  if (bgQueue.hasJob(jobName)) {
    console.log(`[sync] Sync job for folder ${srcFolderId ?? 'root'} is already queued/running. Skipping enqueue.`);
    return;
  }

  bgQueue.add(jobName, async () => {
    console.log(`[sync] starting background file sync for folder: ${srcFolderId || 'root'}`);
    let hasMore = true;
    let offsetId = 0;
    const allFetchedFiles = [];

    // Paginate through Telegram to get all active files in this folder
    while (hasMore) {
      const result = await tg.listFiles(client, srcFolderId, '', offsetId);
      allFetchedFiles.push(...result.files);
      if (result.hasMore && result.nextOffsetId) {
        offsetId = result.nextOffsetId;
      } else {
        hasMore = false;
      }
    }

    // Get current files in local DB for this folder
    const localFiles = db.getFiles(srcFolderId);
    const fetchedIds = new Set(allFetchedFiles.map(f => f.id));

    // Save/update fetched files
    for (const file of allFetchedFiles) {
      db.saveFile(file);
    }

    // Prune files that no longer exist in Telegram
    for (const localFile of localFiles) {
      if (!fetchedIds.has(localFile.id)) {
        db.deleteFile(localFile.id, srcFolderId);
        mediaCache.invalidate(srcFolderId, localFile.id);
      }
    }

    console.log(`[sync] background sync finished for folder: ${srcFolderId || 'root'}. Local count: ${db.getFiles(srcFolderId).length}`);

    // Pre-cache thumbnails for images/videos in this folder (low priority)
    const currentFiles = db.getFiles(srcFolderId);
    const pendingThumbJobs = bgQueue.getJobs(1000).filter(j => j.name.startsWith('pre_cache_thumb_')).length;
    const mediaToPreCache = currentFiles
      .filter(f => {
        const isMedia = f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/');
        return isMedia && !mediaCache.hasThumb(srcFolderId, f.id);
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 24);

    if (pendingThumbJobs > 100) {
      console.log(`[sync] Thumbnail queue already busy (${pendingThumbJobs} pending/active). Skipping pre-cache for folder ${srcFolderId ?? 'root'}.`);
      return;
    }

    if (mediaToPreCache.length > 0) {
      console.log(`[sync] Queuing ${mediaToPreCache.length} thumbnail pre-cache jobs for folder ${srcFolderId ?? 'root'}`);
      for (const file of mediaToPreCache) {
        const thumbJobName = `pre_cache_thumb_${srcFolderId ?? 'root'}_${file.id}`;

        if (bgQueue.hasJob(thumbJobName)) continue;

        bgQueue.add(thumbJobName, async () => {
          // Verify if file still exists in db
          const checkFiles = db.getFiles(srcFolderId);
          if (!checkFiles.some(f => f.id === file.id)) return;

          // Call download to cache
          const { message, isDocument, isPhoto } = await tg.resolveMessageMedia(client, srcFolderId, file.id);
          
          if (isDocument) {
            let thumbToDownload = 0;
            const doc = message.media.document;
            if (doc?.thumbs?.length > 0) {
              const mThumb = doc.thumbs.find(t => t.type === 'm');
              const xThumb = doc.thumbs.find(t => t.type === 'x');
              const iThumb = doc.thumbs.find(t => t.type === 'i');
              thumbToDownload = mThumb || xThumb || iThumb || doc.thumbs[doc.thumbs.length - 1] || 0;
            }
            const buffer = await client.downloadMedia(message.media, { thumb: thumbToDownload });
            if (buffer && buffer.length > 0) {
              mediaCache.saveThumb(srcFolderId, file.id, buffer);
            }
          } else if (isPhoto) {
            const buffer = await client.downloadMedia(message.media);
            if (buffer && buffer.length > 0) {
              mediaCache.saveThumb(srcFolderId, file.id, buffer);
            }
          }
        }, { priority: 1, maxRetries: 2 });
      }
    }
  }, { priority, maxRetries: 3 });
}

function enqueueTempCleanupJob() {
  // Prevent duplicate cleanup jobs piling up
  if (bgQueue.hasJob('cleanup_temp_uploads')) {
    return;
  }

  bgQueue.add('cleanup_temp_uploads', async () => {
    const tempDir = os.tmpdir();
    const files = fs.readdirSync(tempDir).filter(f => f.startsWith('upload_') && f.endsWith('.tmp'));
    const now = Date.now();
    let removed = 0;

    for (const file of files) {
      const fp = path.join(tempDir, file);
      try {
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fp);
          removed++;
        }
      } catch (err) {
        console.error(`[temp-cleanup] Failed checking/removing ${fp}:`, err.message);
      }
    }

    if (removed > 0) {
      console.log(`[temp-cleanup] Removed ${removed} stale temp upload file(s) from ${tempDir}`);
    }
  }, { priority: 2, maxRetries: 1 });
}

app.get('/api/files', checkAuth, async (req, res) => {
  const folderId = req.query.folder_id;
  const search = req.query.search || '';
  const offsetId = parseInt(req.query.offset_id || '0');
  const mimeType = req.query.mime_type || undefined;
  const dateFrom = req.query.date_from || undefined;
  const dateTo = req.query.date_to || undefined;
  const sizeMin = req.query.size_min ? parseInt(req.query.size_min) : undefined;
  const sizeMax = req.query.size_max ? parseInt(req.query.size_max) : undefined;
  const sort = req.query.sort || 'date';
  const order = req.query.order || 'desc';

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    // Normalize folder ID
    const srcFolderId = (folderId === 'null' || folderId === 'undefined' || !folderId) ? null : Number(folderId);

    // Trigger background sync
    syncFolderFilesBackground(client, folderId);

    // Query files from local DB with filters, sorting, pagination
    const result = db.queryFiles({
      folderId: srcFolderId,
      search: search || undefined,
      mimeType,
      dateFrom,
      dateTo,
      sizeMin,
      sizeMax,
      sort,
      order,
      limit: 200,
      offsetId
    });

    res.json({
      data: result.files,
      nextOffsetId: result.nextOffsetId,
      hasMore: result.hasMore,
      total: result.total
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/search', checkAuth, async (req, res) => {
  const folderId = req.query.folder_id;
  const q = req.query.search || '';
  const mimeType = req.query.mime_type || undefined;
  const sort = req.query.sort || 'date';
  const order = req.query.order || 'desc';

  try {
    const srcFolderId = (folderId === 'null' || folderId === 'undefined' || !folderId) ? null : Number(folderId);
    
    const result = db.queryFiles({
      folderId: folderId ? srcFolderId : undefined,
      search: q || undefined,
      mimeType,
      sort,
      order,
      limit: 500
    });
    
    res.json({ data: result.files, total: result.total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/:id', checkAuth, async (req, res) => {
  const messageId = parseInt(req.params.id);
  const folderId = req.query.folder_id;

  try {
    const srcFolderId = (folderId === 'null' || folderId === 'undefined' || !folderId) ? null : Number(folderId);
    
    // Read from local DB
    const localFiles = db.getFiles(srcFolderId);
    let file = localFiles.find(f => f.id === messageId);
    
    // Fallback: Telegram listFiles sync if not in database cache yet
    if (!file) {
      const client = await getClientForUser(req.user.id);
      if (client) {
        const { files } = await tg.listFiles(client, srcFolderId);
        file = files.find(f => f.id === messageId);
        if (file) {
          db.saveFile(file);
        }
      }
    }

    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/files/:id', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.deleteFile(client, folderId, messageId);
    
    // Sync with local DB cache
    const targetFolderId = (!folderId || folderId === 'null' || folderId === 'undefined') ? null : Number(folderId);
    db.deleteFile(parseInt(messageId), targetFolderId);
    
    // Invalidate cached thumbnail/preview
    mediaCache.invalidate(targetFolderId, messageId);

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/files/:id', checkAuth, async (req, res) => {
  const messageId = parseInt(req.params.id);
  const { name, folder_id: targetFolderIdQuery } = req.body;
  const sourceFolderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    // Normalize source & target folder IDs
    const srcFolderId = (sourceFolderId === 'null' || sourceFolderId === 'undefined' || !sourceFolderId) ? null : Number(sourceFolderId);
    let dstFolderId = srcFolderId;
    if (targetFolderIdQuery !== undefined) {
      dstFolderId = (targetFolderIdQuery === 'null' || targetFolderIdQuery === 'undefined' || targetFolderIdQuery === null) ? null : Number(targetFolderIdQuery);
    }

    // Get current file from database
    const localFiles = db.getFiles(srcFolderId);
    let file = localFiles.find(f => f.id === messageId);
    
    // Fallback: fetch from Telegram if not in local index yet
    if (!file) {
      const { files: fetchedFiles } = await tg.listFiles(client, srcFolderId);
      file = fetchedFiles.find(f => f.id === messageId);
      if (file) {
        db.saveFile(file);
      }
    }

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 1) MOVE OPERATION (if target folder is specified and different)
    let finalMessageId = messageId;
    let finalFolderId = srcFolderId;

    if (targetFolderIdQuery !== undefined && srcFolderId !== dstFolderId) {
      console.log(`[move] moving file ${messageId} from folder ${srcFolderId} to folder ${dstFolderId}`);
      
      const moveResult = await tg.moveFile(client, srcFolderId, dstFolderId, messageId);
      
      // Update local DB: delete old record, save new record
      db.deleteFile(messageId, srcFolderId);
      
      // Invalidate old cache entry
      mediaCache.invalidate(srcFolderId, messageId);
      
      const updatedFile = {
        ...file,
        id: moveResult.id,
        folder_id: dstFolderId
      };
      db.saveFile(updatedFile);
      
      finalMessageId = moveResult.id;
      finalFolderId = dstFolderId;
    }

    // 2) RENAME OPERATION (if name is specified and different)
    if (name && name !== file.name) {
      console.log(`[rename] renaming file ${finalMessageId} in folder ${finalFolderId} to "${name}"`);
      db.renameFile(finalMessageId, finalFolderId, name);
    }

    res.json({ success: true, id: finalMessageId });
  } catch (e) {
    console.error('PATCH file error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/upload', checkAuth, uploadLimiter, async (req, res) => {
  let folderId = req.query.folder_id || '';
  const uploadId = req.query.upload_id || `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const client = await getClientForUser(req.user.id).catch(() => null);
  if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

  let tempFilePath = '';
  let writeStream = null;
  let fileName = 'upload';
  let mimeType = 'application/octet-stream';
  let totalBytes = 0;
  let trackerInfo = null;
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB hard limit

  const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE } });

  bb.on('field', (name, value) => {
    if (name === 'folder_id') folderId = value;
  });

  bb.on('file', (_fieldname, fileStream, info) => {
    fileName = info.filename || 'upload';
    mimeType = info.mimeType || 'application/octet-stream';

    // Get total size from content-length if possible or default to file size limit representation
    const expectedTotalSize = parseInt(req.headers['content-length'] || '0');
    trackerInfo = uploadTracker.create(uploadId, req.user.id, fileName, expectedTotalSize);
    uploadTracker.update(uploadId, { status: 'uploading_to_server' });

    // Set up local cancel listener
    trackerInfo.abortController.signal.addEventListener('abort', () => {
      if (writeStream) {
        try {
          writeStream.destroy();
        } catch (_) {}
      }
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (_) {}
      if (!res.headersSent) {
        res.status(499).json({ error: 'Upload cancelled by user' });
      }
    });

    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempFilePath = path.join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.tmp`);
    writeStream = fs.createWriteStream(tempFilePath);

    fileStream.on('data', (chunk) => {
      if (trackerInfo?.abortController.signal.aborted) return;
      if (writeStream) {
        writeStream.write(chunk);
        totalBytes += chunk.length;
        uploadTracker.update(uploadId, { serverBytes: totalBytes });
      }
    });

    fileStream.on('end', () => {
      if (writeStream) {
        writeStream.end();
      }
    });

    fileStream.on('limit', () => {
      uploadTracker.update(uploadId, { status: 'failed', error: 'File exceeds 2GB limit' });
      if (writeStream) {
        writeStream.end();
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (_) {}
      }
      res.status(413).json({ error: 'File exceeds 2GB limit' });
      bb.destroy();
    });
  });

  bb.on('finish', async () => {
    if (res.headersSent) return;
    if (trackerInfo?.abortController.signal.aborted) return;

    try {
      if (!tempFilePath || !fs.existsSync(tempFilePath)) {
        throw new Error("No file was uploaded or file stream failed.");
      }

      if (writeStream) {
        await new Promise((resolve) => {
          writeStream.on('finish', resolve);
          if (writeStream.writableFinished) {
            resolve();
          }
        });
      }

      uploadTracker.update(uploadId, { status: 'uploading_to_tg', tgBytes: 0, totalBytes: totalBytes });

      const result = await tg.uploadFileFromPath(
        client,
        folderId,
        tempFilePath,
        fileName,
        mimeType,
        (progress) => {
          if (trackerInfo?.abortController.signal.aborted) {
            throw new Error('Upload aborted');
          }
          uploadTracker.update(uploadId, { tgBytes: progress });
        }
      );

      // Save file metadata to database local cache
      const targetFolderId = (!folderId || folderId === 'null' || folderId === 'undefined') ? null : Number(folderId);
      const fileData = {
        id: result.id,
        folder_id: targetFolderId,
        name: fileName,
        size: Number(totalBytes),
        mime_type: mimeType,
        file_ext: fileName.includes('.') ? fileName.split('.').pop() : '',
        created_at: new Date().toISOString(),
        icon_type: 'file'
      };
      db.saveFile(fileData);

      uploadTracker.update(uploadId, { status: 'done', tgBytes: totalBytes });
      res.json(result);
    } catch (e) {
      console.error('Upload error:', e);
      if (trackerInfo && !trackerInfo.abortController.signal.aborted) {
        uploadTracker.update(uploadId, { status: 'failed', error: e.message });
      }
      if (!res.headersSent) {
        res.status(500).json({ error: e.message });
      }
    } finally {
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (err) {
        console.error('Failed to delete temp file:', err);
      }
      // Auto cleanup tracker session in 10 seconds to save memory
      setTimeout(() => {
        uploadTracker.remove(uploadId);
      }, 10000);
    }
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
    uploadTracker.update(uploadId, { status: 'failed', error: err.message || 'Upload failed' });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  req.pipe(bb);
});

app.get('/api/files/:id/download', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    await tg.downloadFile(client, folderId, messageId, req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/:id/thumbnail', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    console.log('[media] thumbnail request', { messageId, folderId: folderId || null, userId: req.user.id });
    await tg.thumbnailHandler(client, folderId, messageId, req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/:id/preview', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    console.log('[media] preview request', { messageId, folderId: folderId || null, userId: req.user.id });
    await tg.previewFileHandler(client, folderId, messageId, req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/:id/stream', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    console.log('[media] stream request', {
      messageId,
      folderId: folderId || null,
      userId: req.user.id,
      hasRange: Boolean(req.headers.range)
    });
    await tg.streamFileHandler(client, folderId, messageId, req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Telegram Drive server running on http://0.0.0.0:${PORT}`);
  
  // Warm-up database index cache in background for active users
  try {
    const sessions = await supabase.from('telegram_sessions').select('user_id');
    if (sessions.data && sessions.data.length > 0) {
      console.log(`[startup-sync] warming up cache for ${sessions.data.length} user session(s)...`);
      for (const session of sessions.data) {
        const client = await getClientForUser(session.user_id).catch(() => null);
        if (client) {
          // Sync root folder in background
          syncFolderFilesBackground(client, null);
          
          // Sync existing subfolders
          const folders = await tg.listFolders(client).catch(() => []);
          for (const folder of folders) {
            syncFolderFilesBackground(client, folder.id);
          }
        }
      }
    }
    
    // Clean up stale cache entries (>30 days old)
    mediaCache.cleanupStale();
    enqueueTempCleanupJob();
    
    const cacheStats = mediaCache.stats();
    console.log(`[startup] media cache: ${cacheStats.thumbCount} thumbnails (${(cacheStats.thumbSize / 1024).toFixed(1)} KB), ${cacheStats.previewCount} previews (${(cacheStats.previewSize / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('[startup-sync] failed to warm up caches:', err.message);
  }
});

// Periodic orphan temp file cleanup every 6 hours
setInterval(() => {
  enqueueTempCleanupJob();
}, 6 * 60 * 60 * 1000);
