import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

let db;

export function initDb(path = 'data.db') {
  db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      api_id INTEGER,
      session_data TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      is_public INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      folder_id INTEGER,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT,
      file_ext TEXT,
      created_at TEXT,
      FOREIGN KEY(folder_id) REFERENCES folders(id)
    );
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      folder_id INTEGER,
      message_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      password_salt TEXT,
      expires_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function getDb() {
  return db;
}
