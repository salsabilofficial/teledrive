use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMetadata {
    pub id: i64,
    pub folder_id: Option<i64>,
    pub name: String,
    pub size: u64,
    pub mime_type: Option<String>,
    pub file_ext: Option<String>,
    pub created_at: String,
    pub icon_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderMetadata {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub username: Option<String>,
    pub is_public: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResult {
    pub success: bool,
    pub next_step: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShareInfo {
    pub id: String,
    pub folder_id: Option<i64>,
    pub message_id: i64,
    pub file_name: String,
    pub file_size: i64,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub revoked: bool,
    pub has_password: bool,
    pub link: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadProgress {
    pub id: String,
    pub percent: f64,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
}
