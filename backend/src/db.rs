use std::sync::{Arc, Mutex};

pub type DbPool = Arc<Mutex<sqlite::Connection>>;

pub fn init_db(db_path: &str) -> Result<DbPool, String> {
    let conn = sqlite::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS shared_links (
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
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color_hex TEXT DEFAULT '#3B82F6',
            display_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS folder_metadata (
            channel_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT,
            is_public INTEGER NOT NULL DEFAULT 0,
            display_order INTEGER NOT NULL DEFAULT 0,
            group_id INTEGER,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
        );"
    ).map_err(|e| e.to_string())?;

    log::info!("Database initialized at {}", db_path);
    Ok(Arc::new(Mutex::new(conn)))
}
