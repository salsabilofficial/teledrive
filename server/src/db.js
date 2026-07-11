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
  // Normalize folderId to null if it's 'null' or undefined
  const targetFolderId = (folderId === 'null' || folderId === undefined) ? null : folderId;
  return dbData.files.filter(f => {
    const fFolderId = (f.folder_id === 'null' || f.folder_id === undefined) ? null : f.folder_id;
    return fFolderId === targetFolderId;
  });
}

export function getAllFiles() {
  return dbData.files;
}

export function searchFiles(query = '') {
  const q = query.toLowerCase();
  return dbData.files.filter(f => f.name.toLowerCase().includes(q));
}

/**
 * Advanced query with filters, sorting, and pagination.
 * Options:
 *   folderId: filter by folder (null = root, undefined = all folders)
 *   search: case-insensitive name search
 *   mimeType: filter by mime prefix (e.g. 'image/', 'video/', 'application/pdf')
 *   dateFrom: ISO string, files created on or after
 *   dateTo: ISO string, files created on or before
 *   sizeMin: minimum file size in bytes
 *   sizeMax: maximum file size in bytes
 *   sort: 'name' | 'size' | 'date' (default 'date')
 *   order: 'asc' | 'desc' (default 'desc')
 *   limit: max results (default 200)
 *   offsetId: message id to start after (for pagination)
 */
export function queryFiles(options = {}) {
  const {
    folderId,
    search,
    mimeType,
    dateFrom,
    dateTo,
    sizeMin,
    sizeMax,
    sort = 'date',
    order = 'desc',
    limit = 200,
    offsetId = 0
  } = options;

  let files = dbData.files;

  // Filter by folder (skip if folderId is explicitly undefined = "all folders")
  if (folderId !== undefined) {
    const targetFolderId = (folderId === 'null' || folderId === null) ? null : folderId;
    files = files.filter(f => {
      const fFolderId = (f.folder_id === 'null' || f.folder_id === undefined) ? null : f.folder_id;
      return fFolderId === targetFolderId;
    });
  }

  // Filter by search term
  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f => f.name.toLowerCase().includes(q));
  }

  // Filter by mime type (prefix match: 'image/' matches 'image/jpeg', 'image/png', etc.)
  if (mimeType) {
    const m = mimeType.toLowerCase();
    files = files.filter(f => f.mime_type && f.mime_type.toLowerCase().startsWith(m));
  }

  // Filter by date range
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    files = files.filter(f => new Date(f.created_at).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    files = files.filter(f => new Date(f.created_at).getTime() <= to);
  }

  // Filter by size range
  if (sizeMin !== undefined && sizeMin !== null) {
    files = files.filter(f => (f.size || 0) >= sizeMin);
  }
  if (sizeMax !== undefined && sizeMax !== null) {
    files = files.filter(f => (f.size || 0) <= sizeMax);
  }

  // Sort
  files = [...files].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'name':
        cmp = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'size':
        cmp = (a.size || 0) - (b.size || 0);
        break;
      case 'date':
      default:
        cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        break;
    }
    return order === 'asc' ? cmp : -cmp;
  });

  // Pagination via offsetId
  let startIdx = 0;
  if (offsetId > 0) {
    const idx = files.findIndex(f => f.id === offsetId);
    if (idx !== -1) {
      startIdx = idx + 1;
    } else {
      return { files: [], nextOffsetId: null, hasMore: false, total: files.length };
    }
  }

  const paginatedFiles = files.slice(startIdx, startIdx + limit);
  const hasMore = (startIdx + limit) < files.length;
  const nextOffsetId = hasMore ? paginatedFiles[paginatedFiles.length - 1]?.id ?? null : null;

  return { files: paginatedFiles, nextOffsetId, hasMore, total: files.length };
}

export function saveFile(file) {
  const targetFolderId = (file.folder_id === 'null' || file.folder_id === undefined) ? null : file.folder_id;
  const existingIdx = dbData.files.findIndex(f => {
    const fFolderId = (f.folder_id === 'null' || f.folder_id === undefined) ? null : f.folder_id;
    return f.id === file.id && fFolderId === targetFolderId;
  });
  
  const normalizedFile = {
    ...file,
    folder_id: targetFolderId
  };

  if (existingIdx !== -1) {
    dbData.files[existingIdx] = normalizedFile;
  } else {
    dbData.files.push(normalizedFile);
  }
  saveDb();
}

export function deleteFile(id, folderId) {
  const targetFolderId = (folderId === 'null' || folderId === undefined) ? null : folderId;
  dbData.files = dbData.files.filter(f => {
    const fFolderId = (f.folder_id === 'null' || f.folder_id === undefined) ? null : f.folder_id;
    return !(f.id === id && fFolderId === targetFolderId);
  });
  saveDb();
}

export function renameFile(id, folderId, name) {
  const targetFolderId = (folderId === 'null' || folderId === undefined) ? null : folderId;
  const file = dbData.files.find(f => {
    const fFolderId = (f.folder_id === 'null' || f.folder_id === undefined) ? null : f.folder_id;
    return f.id === id && fFolderId === targetFolderId;
  });
  if (file) {
    file.name = name;
    saveDb();
  }
}
