import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initDb, getDb } from './db.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Initialize database
initDb();

// In-memory Telegram session state (will be replaced with gramjs)
const tgState = {
  client: null,
  apiId: null,
  phone: null,
  loginToken: null,
  passwordToken: null,
  authenticated: false,
};

// ===== AUTH ROUTES =====

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.post('/api/auth/connect', (req, res) => {
  const { api_id } = req.body;
  if (!api_id) return res.status(400).json({ error: 'api_id required' });
  tgState.apiId = api_id;
  tgState.authenticated = false;
  console.log(`Connected with API ID: ${api_id}`);
  res.json({ success: true });
});

app.post('/api/auth/code', (req, res) => {
  const { phone, api_id } = req.body;
  if (!phone || !api_id) return res.status(400).json({ error: 'phone and api_id required' });

  tgState.apiId = api_id;
  tgState.phone = phone;
  tgState.loginToken = { phone };

  console.log(`Requesting code for ${phone}`);
  res.json({ success: true, next_step: 'code' });
});

app.post('/api/auth/sign-in', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  tgState.authenticated = true;
  tgState.passwordToken = null;
  tgState.loginToken = null;

  console.log(`Signed in with code`);
  res.json({ success: true, next_step: 'dashboard' });
});

app.post('/api/auth/password', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });

  tgState.authenticated = true;
  console.log(`2FA password verified`);
  res.json({ success: true, next_step: 'dashboard' });
});

app.post('/api/auth/logout', (req, res) => {
  tgState.authenticated = false;
  tgState.client = null;
  tgState.loginToken = null;
  tgState.passwordToken = null;
  console.log('Logged out');
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: tgState.authenticated });
});

// ===== FOLDER ROUTES =====

const DEFAULT_FOLDERS = [
  { id: 1, name: 'Saved Messages', username: null, is_public: false },
  { id: 2, name: 'Photos', username: null, is_public: false },
  { id: 3, name: 'Documents', username: null, is_public: false },
];

app.get('/api/folders', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ data: DEFAULT_FOLDERS });
});

app.post('/api/folders', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const newFolder = { id: Date.now(), name, username: null, is_public: false };
  DEFAULT_FOLDERS.push(newFolder);
  res.json(newFolder);
});

app.delete('/api/folders/:id', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const id = parseInt(req.params.id);
  const idx = DEFAULT_FOLDERS.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Folder not found' });
  DEFAULT_FOLDERS.splice(idx, 1);
  res.json({ success: true });
});

app.patch('/api/folders/:id', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const id = parseInt(req.params.id);
  const folder = DEFAULT_FOLDERS.find(f => f.id === id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  folder.name = req.body.name || folder.name;
  res.json({ success: true });
});

// ===== FILE ROUTES =====

// Demo files for testing
const DEMO_FILES = [
  { id: 101, folder_id: 2, name: 'sunset_photo.jpg', size: 245760, mime_type: 'image/jpeg', file_ext: 'jpg', created_at: new Date().toISOString(), icon_type: 'file' },
  { id: 102, folder_id: 2, name: 'vacation_2025.png', size: 1048576, mime_type: 'image/png', file_ext: 'png', created_at: new Date().toISOString(), icon_type: 'file' },
  { id: 103, folder_id: 3, name: 'report.pdf', size: 512000, mime_type: 'application/pdf', file_ext: 'pdf', created_at: new Date().toISOString(), icon_type: 'file' },
  { id: 104, folder_id: 3, name: 'notes.txt', size: 2048, mime_type: 'text/plain', file_ext: 'txt', created_at: new Date().toISOString(), icon_type: 'file' },
  { id: 105, folder_id: 3, name: 'project_plan.docx', size: 153600, mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_ext: 'docx', created_at: new Date().toISOString(), icon_type: 'file' },
  { id: 106, folder_id: null, name: 'video_demo.mp4', size: 52428800, mime_type: 'video/mp4', file_ext: 'mp4', created_at: new Date().toISOString(), icon_type: 'file' },
];

let fileIdCounter = 106;

app.get('/api/files', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });

  let files = [...DEMO_FILES];
  const folderId = req.query.folder_id ? parseInt(req.query.folder_id) : null;
  const search = req.query.search || '';
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '20');

  if (folderId) {
    files = files.filter(f => f.folder_id === folderId);
  }
  if (search) {
    files = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  }

  res.json({ data: files, page, limit, total: files.length });
});

app.get('/api/files/search', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });

  const q = req.query.search || '';
  const results = DEMO_FILES.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
  res.json({ data: results });
});

app.get('/api/files/:id', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const id = parseInt(req.params.id);
  const file = DEMO_FILES.find(f => f.id === id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.json(file);
});

app.delete('/api/files/:id', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const id = parseInt(req.params.id);
  const idx = DEMO_FILES.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'File not found' });
  DEMO_FILES.splice(idx, 1);
  res.json({ success: true });
});

app.patch('/api/files/:id', (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const id = parseInt(req.params.id);
  const file = DEMO_FILES.find(f => f.id === id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (req.body.name) file.name = req.body.name;
  if (req.body.folder_id) file.folder_id = req.body.folder_id;
  res.json({ success: true });
});

app.post('/api/files/upload', upload.single('file'), (req, res) => {
  if (!tgState.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const folderId = req.body.folder_id ? parseInt(req.body.folder_id) : null;
  fileIdCounter++;
  const newFile = {
    id: fileIdCounter,
    folder_id: folderId,
    name: req.file.originalname,
    size: req.file.size,
    mime_type: req.file.mimetype || 'application/octet-stream',
    file_ext: path.extname(req.file.originalname).slice(1),
    created_at: new Date().toISOString(),
    icon_type: 'file',
  };
  DEMO_FILES.push(newFile);
  res.json({ id: newFile.id, name: newFile.name });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Telegram Drive server running on http://0.0.0.0:${PORT}`);
});
