import fs from 'fs';
import path from 'path';

let dataFilePath = 'data.json';
let dbData = {
  sessions: [],
  folders: [],
  files: [],
  shared_links: []
};

export function initDb(filePath = 'data.json') {
  dataFilePath = filePath;
  try {
    if (fs.existsSync(dataFilePath)) {
      const content = fs.readFileSync(dataFilePath, 'utf8');
      dbData = JSON.parse(content);
      // Ensure all tables exist in the object
      dbData.sessions = dbData.sessions || [];
      dbData.folders = dbData.folders || [];
      dbData.files = dbData.files || [];
      dbData.shared_links = dbData.shared_links || [];
    } else {
      saveDb();
    }
  } catch (e) {
    console.error("Failed to load JSON database, using empty state:", e);
    saveDb();
  }
}

function saveDb() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to write to JSON database:", e);
  }
}

// ===== Session Helpers =====
export function getSession(apiId) {
  return dbData.sessions.find(s => s.api_id === apiId);
}

export function saveSession(apiId, sessionData) {
  const existing = getSession(apiId);
  if (existing) {
    existing.session_data = sessionData;
    existing.created_at = Date.now();
  } else {
    dbData.sessions.push({
      id: apiId.toString(),
      api_id: apiId,
      session_data: sessionData,
      created_at: Date.now()
    });
  }
  saveDb();
}

export function deleteSession(apiId) {
  dbData.sessions = dbData.sessions.filter(s => s.api_id !== apiId);
  saveDb();
}

// ===== Folder Helpers =====
export function getFolders() {
  return dbData.folders;
}

export function saveFolder(id, name, username = null, isPublic = false) {
  const existingIdx = dbData.folders.findIndex(f => f.id === id);
  const folder = { id, name, username, is_public: isPublic ? 1 : 0 };
  if (existingIdx !== -1) {
    dbData.folders[existingIdx] = folder;
  } else {
    dbData.folders.push(folder);
  }
  saveDb();
}

export function deleteFolder(id) {
  dbData.folders = dbData.folders.filter(f => f.id !== id);
  dbData.files = dbData.files.filter(f => f.folder_id !== id);
  saveDb();
}

export function renameFolder(id, name) {
  const folder = dbData.folders.find(f => f.id === id);
  if (folder) {
    folder.name = name;
    saveDb();
  }
}

// ===== File Helpers =====
export function getFiles(folderId = null) {
  if (folderId !== null) {
    return dbData.files.filter(f => f.folder_id === folderId);
  }
  return dbData.files;
}

export function saveFile(file) {
  const existingIdx = dbData.files.findIndex(f => f.message_id === file.message_id && f.folder_id === file.folder_id);
  if (existingIdx !== -1) {
    dbData.files[existingIdx] = file;
  } else {
    dbData.files.push(file);
  }
  saveDb();
}

export function deleteFile(messageId, folderId) {
  dbData.files = dbData.files.filter(f => !(f.message_id === messageId && f.folder_id === folderId));
  saveDb();
}

export function renameFile(messageId, folderId, name) {
  const file = dbData.files.find(f => f.message_id === messageId && f.folder_id === folderId);
  if (file) {
    file.name = name;
    saveDb();
  }
}
