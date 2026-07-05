import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import * as tg from './telegram.js';
import { supabase } from './supabase.js';
import { decrypt } from './crypto.js';
import { getClientForUser, getStats } from './clientManager.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// ===== CORS WHITELIST =====
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, mobile apps) or whitelisted origins (including wildcard *)
    if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} is not allowed`));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
}));
app.use(express.json());

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
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    activeConnections: stats.activeConnections,
    timestamp: new Date().toISOString()
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

app.get('/api/files', checkAuth, async (req, res) => {
  const folderId = req.query.folder_id;
  const search = req.query.search || '';
  const offsetId = parseInt(req.query.offset_id || '0');

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.listFiles(client, folderId, search, offsetId);

    res.json({
      data: result.files,
      nextOffsetId: result.nextOffsetId,
      hasMore: result.hasMore
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/search', checkAuth, async (req, res) => {
  const folderId = req.query.folder_id;
  const q = req.query.search || '';

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.listFiles(client, folderId, q);
    res.json({ data: result.files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/:id', checkAuth, async (req, res) => {
  const messageId = req.params.id;
  const folderId = req.query.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const { files } = await tg.listFiles(client, folderId);
    const file = files.find(f => f.id === parseInt(messageId));
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
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/files/:id', checkAuth, async (req, res) => {
  res.json({ success: true });
});

app.post('/api/files/upload', checkAuth, uploadLimiter, async (req, res) => {
  let folderId = req.query.folder_id || '';

  const client = await getClientForUser(req.user.id).catch(() => null);
  if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

  let tempFilePath = '';
  let writeStream = null;
  let fileName = 'upload';
  let mimeType = 'application/octet-stream';
  let totalBytes = 0;
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB hard limit

  const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE } });

  bb.on('field', (name, value) => {
    if (name === 'folder_id') folderId = value;
  });

  bb.on('file', (_fieldname, fileStream, info) => {
    fileName = info.filename || 'upload';
    mimeType = info.mimeType || 'application/octet-stream';

    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempFilePath = path.join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.tmp`);
    writeStream = fs.createWriteStream(tempFilePath);

    fileStream.on('data', (chunk) => {
      if (writeStream) {
        writeStream.write(chunk);
        totalBytes += chunk.length;
      }
    });

    fileStream.on('end', () => {
      if (writeStream) {
        writeStream.end();
      }
    });

    fileStream.on('limit', () => {
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

      const result = await tg.uploadFileFromPath(client, folderId, tempFilePath, fileName, mimeType);
      res.json(result);
    } catch (e) {
      console.error('Upload error:', e);
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
    }
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Telegram Drive server running on http://0.0.0.0:${PORT}`);
});
