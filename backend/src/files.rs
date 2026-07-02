use std::sync::Arc;
use std::collections::HashMap;
use grammers_client::Client;
use grammers_client::types::{Media, Peer};
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use tokio::sync::RwLock;

use crate::state::AppState;
use crate::models::FileMetadata;

pub async fn resolve_peer(
    client: &Client,
    folder_id: Option<i64>,
    peer_cache: &Arc<RwLock<HashMap<i64, Peer>>>,
) -> Result<Peer, String> {
    if let Some(fid) = folder_id {
        {
            let cache = peer_cache.read().await;
            if let Some(peer) = cache.get(&fid) {
                return Ok(peer.clone());
            }
        }

        let mut discovered = HashMap::new();
        let mut dialogs = client.iter_dialogs();
        let mut found: Option<Peer> = None;

        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            let peer_id = match &dialog.peer {
                Peer::Channel(c) => Some(c.raw.id),
                Peer::User(u) => Some(u.raw.id()),
                _ => None,
            };
            if let Some(id) = peer_id {
                discovered.insert(id, dialog.peer.clone());
                if id == fid {
                    found = Some(dialog.peer.clone());
                }
            }
        }

        {
            let mut cache = peer_cache.write().await;
            cache.extend(discovered);
        }

        found.ok_or_else(|| format!("Folder {} not found", fid))
    } else {
        match client.get_me().await {
            Ok(me) => Ok(Peer::User(me)),
            Err(e) => Err(e.to_string()),
        }
    }
}

pub async fn list_files(
    state: &AppState,
    folder_id: Option<i64>,
    page: i64,
    limit: i64,
    search: Option<String>,
    sort: Option<String>,
    order: Option<String>,
) -> Result<Vec<FileMetadata>, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let mut messages = client.iter_messages(&peer);
    messages.limit(limit as i32);

    let search_term = search.as_deref().unwrap_or("").to_lowercase();
    let mut files = Vec::new();
    let mut count = 0;
    let offset = ((page - 1) * limit) as i32;

    while let Some(msg) = messages.next().await.map_err(|e| e.to_string())? {
        let media = match msg.media() {
            Some(m) => m,
            None => continue,
        };

        let (name, size, mime) = match media {
            Media::Document(d) => {
                let name = d.name().unwrap_or("unknown").to_string();
                let mime = d.mime_type().unwrap_or("application/octet-stream").to_string();
                let size = d.size() as u64;
                (name, size, Some(mime))
            }
            Media::Photo(_) => {
                let name = format!("photo_{}.jpg", msg.id());
                (name, 0, Some("image/jpeg".into()))
            }
            _ => continue,
        };

        if !search_term.is_empty() && !name.to_lowercase().contains(&search_term) {
            continue;
        }

        if count < offset {
            count += 1;
            continue;
        }

        let ext = std::path::Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        files.push(FileMetadata {
            id: msg.id(),
            folder_id,
            name,
            size,
            mime_type: mime,
            file_ext: ext,
            created_at: chrono::DateTime::from_timestamp(msg.date() as i64, 0)
                .map(|d| d.to_rfc3339())
                .unwrap_or_default(),
            icon_type: "file".into(),
        });

        if files.len() >= limit as usize {
            break;
        }
    }

    Ok(files)
}

pub async fn get_file_detail(
    state: &AppState,
    message_id: i64,
    folder_id: Option<i64>,
) -> Result<FileMetadata, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let msg = client.get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    let media = msg.media().ok_or_else(|| "No media in message".to_string())?;
    let (name, size, mime) = match media {
        Media::Document(d) => {
            let name = d.name().unwrap_or("unknown").to_string();
            (name, d.size() as u64, d.mime_type().map(|s| s.to_string()))
        }
        Media::Photo(_) => {
            (format!("photo_{}.jpg", msg.id()), 0, Some("image/jpeg".into()))
        }
        _ => return Err("Unsupported media type".into()),
    };

    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    Ok(FileMetadata {
        id: msg.id(),
        folder_id,
        name,
        size,
        mime_type: mime,
        file_ext: ext,
        created_at: chrono::DateTime::from_timestamp(msg.date() as i64, 0)
            .map(|d| d.to_rfc3339())
            .unwrap_or_default(),
        icon_type: "file".into(),
    })
}

pub async fn delete_file(
    state: &AppState,
    message_id: i64,
    folder_id: Option<i64>,
) -> Result<(), String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    client.delete_messages(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn rename_file(
    state: &AppState,
    message_id: i64,
    new_name: &str,
    folder_id: Option<i64>,
) -> Result<(), String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, folder_id, &state.peer_cache).await?;
    let msg = client.get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    client.edit_message(&peer, message_id, &InputMessage::text(new_name).reply_to(msg.id()))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn list_folders(state: &AppState) -> Result<Vec<crate::models::FolderMetadata>, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let mut folders = Vec::new();
    let mut dialogs = client.iter_dialogs();
    let mut discovered = HashMap::new();

    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        match &dialog.peer {
            Peer::Channel(ch) => {
                discovered.insert(ch.raw.id, dialog.peer.clone());
                folders.push(crate::models::FolderMetadata {
                    id: ch.raw.id,
                    parent_id: None,
                    name: dialog.name().to_string(),
                    username: ch.username().map(|u| u.to_string()),
                    is_public: ch.username().is_some(),
                });
            }
            _ => {}
        }
    }

    {
        let mut cache = state.peer_cache.write().await;
        cache.extend(discovered);
    }

    Ok(folders)
}

pub async fn create_folder(
    state: &AppState,
    name: &str,
) -> Result<crate::models::FolderMetadata, String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let ch = client.create_channel(name, "")
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::models::FolderMetadata {
        id: ch.raw.id,
        parent_id: None,
        name: name.to_string(),
        username: ch.username().map(|u| u.to_string()),
        is_public: ch.username().is_some(),
    })
}

pub async fn delete_folder(
    state: &AppState,
    folder_id: i64,
) -> Result<(), String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, Some(folder_id), &state.peer_cache).await?;
    client.delete_channel(&peer)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn rename_folder(
    state: &AppState,
    folder_id: i64,
    new_name: &str,
) -> Result<(), String> {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return Err("Client not initialized".into()),
    };
    drop(client_guard);

    let peer = resolve_peer(&client, Some(folder_id), &state.peer_cache).await?;
    client.edit_channel_title(&peer, new_name)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn search_files(
    state: &AppState,
    query: &str,
    folder_id: Option<i64>,
) -> Result<Vec<FileMetadata>, String> {
    list_files(state, folder_id, 1, 50, Some(query.to_string()), None, None).await
}
