use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use grammers_client::Client;
use grammers_client::types::{LoginToken, PasswordToken, Peer};

#[derive(Clone)]
pub struct AppState {
    pub client: Arc<Mutex<Option<Client>>>,
    pub login_token: Arc<Mutex<Option<LoginToken>>>,
    pub password_token: Arc<Mutex<Option<PasswordToken>>>,
    pub api_id: Arc<Mutex<Option<i32>>>,
    pub session_path: Arc<Mutex<Option<String>>>,
    pub peer_cache: Arc<RwLock<HashMap<i64, Peer>>>,
    pub cancelled_transfers: Arc<RwLock<HashSet<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            login_token: Arc::new(Mutex::new(None)),
            password_token: Arc::new(Mutex::new(None)),
            api_id: Arc::new(Mutex::new(None)),
            session_path: Arc::new(Mutex::new(None)),
            peer_cache: Arc::new(RwLock::new(HashMap::new())),
            cancelled_transfers: Arc::new(RwLock::new(HashSet::new())),
        }
    }
}
