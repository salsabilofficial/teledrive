import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as tg from './telegram.js';
import { supabase } from './supabase.js';
import { getClientForUser } from './clientManager.js';
import fs from 'fs';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const upload = multer({ dest: 'uploads/' });

app.use(cors({
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
}));
app.use(express.json());

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
  res.json({ status: 'ok', version: '1.0.0' });
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

app.get('/api/auth/status', checkAuth, async (req, res) => {
  try {
    const client = await getClientForUser(req.user.id);
    const isConnected = await tg.checkConnection(client);
    res.json({ authenticated: isConnected });
  } catch (e) {
    res.json({ authenticated: false });
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
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '20');

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const files = await tg.listFiles(client, folderId, search);

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedFiles = files.slice(startIndex, startIndex + limit);

    res.json({
      data: paginatedFiles,
      page,
      limit,
      total: files.length
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

    const results = await tg.listFiles(client, folderId, q);
    res.json({ data: results });
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

    const files = await tg.listFiles(client, folderId);
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

app.post('/api/files/upload', checkAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const folderId = req.body.folder_id;

  try {
    const client = await getClientForUser(req.user.id);
    if (!client) return res.status(400).json({ error: 'Telegram account not connected' });

    const result = await tg.uploadFile(client, folderId, req.file.path, req.file.originalname);
    
    // Cleanup temporary file after successful upload
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (e) {
    // Cleanup temporary file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: e.message });
  }
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
