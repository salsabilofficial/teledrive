use std::sync::Arc;
use grammers_client::{Client, Config, SignInError};
use grammers_client::types::{LoginToken, PasswordToken};
use grammers_session::storages::SqliteSession;
use grammers_mtsender::SenderPool;
use tokio::sync::Mutex;

use crate::state::AppState;
use crate::models::AuthResult;

pub async fn ensure_client(
    state: &AppState,
    api_id: i32,
    session_path: &str,
) -> Result<Client, String> {
    let mut client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        return Ok(client.clone());
    }

    log::info!("Initializing Telegram client with API ID: {}", api_id);

    let mut session = SqliteSession::open(session_path)
        .map_err(|e| format!("Failed to open session: {}", e))?;

    if !session.is_authorized() {
        session.delete();
        session = SqliteSession::open(session_path)
            .map_err(|e| format!("Failed to reopen session: {}", e))?;
    }

    let client = Client::connect(Config {
        session: session.clone(),
        api_id,
        api_hash: String::new(),
        params: Default::default(),
    })
    .await
    .map_err(|e| format!("Connection failed: {}", e))?;

    {
        let mut path = state.session_path.lock().await;
        *path = Some(session_path.to_string());
    }

    if !client.is_authorized().await {
        log::info!("Client connected but not authorized");
        *client_guard = Some(client.clone());
        return Ok(client);
    }

    log::info!("Client authorized, starting update loop");
    tokio::spawn({
        let c = client.clone();
        async move {
            let mut stream = c.iter_updates();
            loop {
                match stream.next().await {
                    Ok(_update) => {}
                    Err(e) => {
                        log::error!("Update stream error: {}", e);
                        break;
                    }
                }
            }
        }
    });

    *client_guard = Some(client.clone());
    Ok(client)
}

pub async fn request_auth_code(
    state: &AppState,
    phone: &str,
    api_id: i32,
) -> AuthResult {
    let session_path = format!("telegram.session");
    let client = match ensure_client(state, api_id, &session_path).await {
        Ok(c) => c,
        Err(e) => return AuthResult {
            success: false,
            next_step: None,
            error: Some(e),
        },
    };

    if client.is_authorized().await {
        return AuthResult {
            success: true,
            next_step: Some("dashboard".into()),
            error: None,
        };
    }

    match client.request_login_code(phone).await {
        Ok(token) => {
            let mut login_token = state.login_token.lock().await;
            *login_token = Some(token);
            AuthResult {
                success: true,
                next_step: Some("code".into()),
                error: None,
            }
        }
        Err(e) => AuthResult {
            success: false,
            next_step: None,
            error: Some(e.to_string()),
        },
    }
}

pub async fn sign_in_with_code(
    state: &AppState,
    code: &str,
) -> AuthResult {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return AuthResult {
            success: false,
            next_step: None,
            error: Some("Client not initialized".into()),
        },
    };
    drop(client_guard);

    let token = {
        let mut t = state.login_token.lock().await;
        t.take()
    };

    let token = match token {
        Some(t) => t,
        None => return AuthResult {
            success: false,
            next_step: None,
            error: Some("No login token. Request code first.".into()),
        },
    };

    match client.sign_in(&token, code).await {
        Ok(_) => AuthResult {
            success: true,
            next_step: Some("dashboard".into()),
            error: None,
        },
        Err(SignInError::PasswordRequired(password_token)) => {
            let mut pt = state.password_token.lock().await;
            *pt = Some(password_token);
            AuthResult {
                success: true,
                next_step: Some("password".into()),
                error: None,
            }
        }
        Err(e) => AuthResult {
            success: false,
            next_step: None,
            error: Some(e.to_string()),
        },
    }
}

pub async fn check_password(
    state: &AppState,
    password: &str,
) -> AuthResult {
    let client_guard = state.client.lock().await;
    let client = match client_guard.as_ref() {
        Some(c) => c.clone(),
        None => return AuthResult {
            success: false,
            next_step: None,
            error: Some("Client not initialized".into()),
        },
    };
    drop(client_guard);

    let token = {
        let mut t = state.password_token.lock().await;
        t.take()
    };

    let token = match token {
        Some(t) => t,
        None => return AuthResult {
            success: false,
            next_step: None,
            error: Some("No password token".into()),
        },
    };

    match client.check_password(&token, password).await {
        Ok(_) => AuthResult {
            success: true,
            next_step: Some("dashboard".into()),
            error: None,
        },
        Err(e) => AuthResult {
            success: false,
            next_step: None,
            error: Some(e.to_string()),
        },
    }
}

pub async fn check_connection(state: &AppState) -> bool {
    let client_guard = state.client.lock().await;
    match client_guard.as_ref() {
        Some(client) => client.is_authorized().await,
        None => false,
    }
}

pub async fn logout(state: &AppState) -> Result<(), String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        let _ = client.sign_out().await;
    }
    drop(client_guard);

    let mut c = state.client.lock().await;
    *c = None;

    {
        let mut cache = state.peer_cache.write().await;
        cache.clear();
    }

    let path = state.session_path.lock().await;
    if let Some(p) = path.as_ref() {
        let _ = std::fs::remove_file(p);
    }

    Ok(())
}
