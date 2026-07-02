mod state;
mod models;
mod db;
mod telegram;
mod files;
mod upload;

use std::sync::Arc;
use actix_web::{web, App, HttpServer, HttpResponse, Responder, get, post, delete, patch};
use actix_cors::Cors;
use actix_multipart::Multipart;
use futures::TryStreamExt;
use tokio::io::AsyncWriteExt;

use state::AppState;
use models::AuthResult;

struct AppContext {
    state: AppState,
    db: db::DbPool,
}

#[derive(serde::Deserialize)]
struct ConnectRequest {
    api_id: i32,
}

#[derive(serde::Deserialize)]
struct CodeRequest {
    phone: String,
    api_id: i32,
}

#[derive(serde::Deserialize)]
struct SignInRequest {
    code: String,
}

#[derive(serde::Deserialize)]
struct PasswordRequest {
    password: String,
}

#[derive(serde::Deserialize)]
struct FolderCreateRequest {
    name: String,
}

#[derive(serde::Deserialize)]
struct FolderRenameRequest {
    name: String,
}

#[derive(serde::Deserialize)]
struct FileRenameRequest {
    name: String,
    folder_id: Option<i64>,
}

#[derive(serde::Deserialize)]
struct FileDeleteRequest {
    folder_id: Option<i64>,
}

#[derive(serde::Deserialize)]
struct ListFilesQuery {
    folder_id: Option<i64>,
    page: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
}

#[derive(serde::Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

// ===== Auth Routes =====

#[get("/api/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".into(),
        version: "1.0.0".into(),
    })
}

#[post("/api/auth/connect")]
async fn auth_connect(
    ctx: web::Data<Arc<AppContext>>,
    body: web::Json<ConnectRequest>,
) -> impl Responder {
    let state = &ctx.state;
    let session_path = "telegram.session";
    match telegram::ensure_client(state, body.api_id, session_path).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[post("/api/auth/code")]
async fn auth_code(
    ctx: web::Data<Arc<AppContext>>,
    body: web::Json<CodeRequest>,
) -> impl Responder {
    let result = telegram::request_auth_code(&ctx.state, &body.phone, body.api_id).await;
    HttpResponse::Ok().json(result)
}

#[post("/api/auth/sign-in")]
async fn auth_sign_in(
    ctx: web::Data<Arc<AppContext>>,
    body: web::Json<SignInRequest>,
) -> impl Responder {
    let result = telegram::sign_in_with_code(&ctx.state, &body.code).await;
    HttpResponse::Ok().json(result)
}

#[post("/api/auth/password")]
async fn auth_password(
    ctx: web::Data<Arc<AppContext>>,
    body: web::Json<PasswordRequest>,
) -> impl Responder {
    let result = telegram::check_password(&ctx.state, &body.password).await;
    HttpResponse::Ok().json(result)
}

#[post("/api/auth/logout")]
async fn auth_logout(ctx: web::Data<Arc<AppContext>>) -> impl Responder {
    match telegram::logout(&ctx.state).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[get("/api/auth/status")]
async fn auth_status(ctx: web::Data<Arc<AppContext>>) -> impl Responder {
    let ok = telegram::check_connection(&ctx.state).await;
    HttpResponse::Ok().json(serde_json::json!({ "authenticated": ok }))
}

// ===== File Routes =====

#[get("/api/files")]
async fn list_files(
    ctx: web::Data<Arc<AppContext>>,
    query: web::Query<ListFilesQuery>,
) -> impl Responder {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20).min(100);
    match files::list_files(&ctx.state, query.folder_id, page, limit, query.search.clone(), None, None).await {
        Ok(data) => HttpResponse::Ok().json(serde_json::json!({ "data": data, "page": page, "limit": limit })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[get("/api/files/search")]
async fn search_files(
    ctx: web::Data<Arc<AppContext>>,
    query: web::Query<ListFilesQuery>,
) -> impl Responder {
    let q = query.search.clone().unwrap_or_default();
    match files::search_files(&ctx.state, &q, query.folder_id).await {
        Ok(data) => HttpResponse::Ok().json(serde_json::json!({ "data": data })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[get("/api/files/{id}")]
async fn get_file(
    ctx: web::Data<Arc<AppContext>>,
    path: web::Path<i64>,
    query: web::Query<ListFilesQuery>,
) -> impl Responder {
    let msg_id = path.into_inner();
    match files::get_file_detail(&ctx.state, msg_id, query.folder_id).await {
        Ok(file) => HttpResponse::Ok().json(file),
        Err(e) => HttpResponse::NotFound().json(serde_json::json!({ "error": e })),
    }
}

#[delete("/api/files/{id}")]
async fn delete_file_route(
    ctx: web::Data<Arc<AppContext>>,
    path: web::Path<i64>,
    query: web::Query<FileDeleteRequest>,
) -> impl Responder {
    let msg_id = path.into_inner();
    match files::delete_file(&ctx.state, msg_id, query.folder_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[patch("/api/files/{id}")]
async fn rename_file_route(
    ctx: web::Data<Arc<AppContext>>,
    path: web::Path<i64>,
    body: web::Json<FileRenameRequest>,
) -> impl Responder {
    let msg_id = path.into_inner();
    match files::rename_file(&ctx.state, msg_id, &body.name, body.folder_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[post("/api/files/upload")]
async fn upload_file_route(
    ctx: web::Data<Arc<AppContext>>,
    mut payload: Multipart,
) -> impl Responder {
    let mut file_data: Vec<u8> = Vec::new();
    let mut file_name = String::from("uploaded_file");
    let mut folder_id: Option<i64> = None;

    while let Ok(Some(mut field)) = payload.try_next().await {
        let disposition = field.content_disposition().clone();
        let field_name = disposition.get_name().unwrap_or("").to_string();

        match field_name.as_str() {
            "folder_id" => {
                let mut data = Vec::new();
                while let Ok(Some(chunk)) = field.try_next().await {
                    data.extend_from_slice(&chunk);
                }
                if let Ok(id) = String::from_utf8_lossy(&data).trim().parse::<i64>() {
                    folder_id = Some(id);
                }
            }
            "file" => {
                file_name = disposition
                    .get_filename()
                    .map(|f| f.to_string())
                    .unwrap_or_else(|| "uploaded_file".to_string());
                while let Ok(Some(chunk)) = field.try_next().await {
                    file_data.extend_from_slice(&chunk);
                }
            }
            _ => {}
        }
    }

    if file_data.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "No file data received" }));
    }

    match upload::upload_from_bytes(&ctx.state, file_data, &file_name, "", folder_id).await {
        Ok(id) => HttpResponse::Ok().json(serde_json::json!({ "id": id, "name": file_name })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

// ===== Folder Routes =====

#[get("/api/folders")]
async fn list_folders(ctx: web::Data<Arc<AppContext>>) -> impl Responder {
    match files::list_folders(&ctx.state).await {
        Ok(data) => HttpResponse::Ok().json(serde_json::json!({ "data": data })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[post("/api/folders")]
async fn create_folder_route(
    ctx: web::Data<Arc<AppContext>>,
    body: web::Json<FolderCreateRequest>,
) -> impl Responder {
    match files::create_folder(&ctx.state, &body.name).await {
        Ok(folder) => HttpResponse::Ok().json(folder),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[delete("/api/folders/{id}")]
async fn delete_folder_route(
    ctx: web::Data<Arc<AppContext>>,
    path: web::Path<i64>,
) -> impl Responder {
    let folder_id = path.into_inner();
    match files::delete_folder(&ctx.state, folder_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[patch("/api/folders/{id}")]
async fn rename_folder_route(
    ctx: web::Data<Arc<AppContext>>,
    path: web::Path<i64>,
    body: web::Json<FolderRenameRequest>,
) -> impl Responder {
    let folder_id = path.into_inner();
    match files::rename_folder(&ctx.state, folder_id, &body.name).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let app_state = Arc::new(AppContext {
        state: AppState::new(),
        db: db::init_db("telegram_drive.db").expect("Failed to init DB"),
    });

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);
    log::info!("Starting Telegram Drive server on {}", bind_addr);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(app_state.clone()))
            .service(health)
            .service(auth_connect)
            .service(auth_code)
            .service(auth_sign_in)
            .service(auth_password)
            .service(auth_logout)
            .service(auth_status)
            .service(list_files)
            .service(search_files)
            .service(get_file)
            .service(delete_file_route)
            .service(rename_file_route)
            .service(upload_file_route)
            .service(list_folders)
            .service(create_folder_route)
            .service(delete_folder_route)
            .service(rename_folder_route)
    })
    .bind(&bind_addr)?
    .run()
    .await
}
