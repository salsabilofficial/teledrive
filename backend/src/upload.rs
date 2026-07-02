use std::sync::Arc;
use grammers_client::Client;
use grammers_client::types::Peer;
use grammers_client::InputMessage;
use tokio::sync::RwLock;
use std::collections::HashMap;

use crate::state::AppState;
use crate::files::resolve_peer;

pub async fn upload_file(
    state: &AppState,
    file_path: &str,
    file_name: &str,
    folder_id: Option<i64>,
    transfer_id: &str,
) -> Result<i64, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let file_data = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let message = client
        .send_message(&peer, InputMessage::text(file_name).file(file_data))
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;

    Ok(message.id())
}

pub async fn upload_from_bytes(
    state: &AppState,
    data: Vec<u8>,
    file_name: &str,
    mime_type: &str,
    folder_id: Option<i64>,
) -> Result<i64, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;

    let message = client
        .send_message(&peer, InputMessage::text(file_name).file(data))
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;

    Ok(message.id())
}
