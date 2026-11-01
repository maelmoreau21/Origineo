pub mod audit_map;
pub mod auth;
pub mod config;
pub mod documents;
pub mod duplicates;
pub mod error;
pub mod events;
pub mod gedcom;
pub mod models;
pub mod persons;
pub mod search;
pub mod sources;
pub mod tree;
pub mod utils;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderValue, Method},
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    auth::OidcRuntime,
    config::AppConfig,
    gedcom::GedcomSessionStore,
};

pub struct AppState {
    pub pool: sqlx::PgPool,
    pub config: AppConfig,
    pub oidc: OidcRuntime,
    pub gedcom_sessions: GedcomSessionStore,
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "origineo-rust-api",
        "version": "2.0.0"
    }))
}

async fn download_doc_handler(
    state: State<Arc<AppState>>,
    user: auth::AuthUser,
    path: Path<Uuid>,
) -> error::AppResult<axum::response::Response> {
    documents::download_or_view_document(state, user, path, false).await
}

async fn view_doc_handler(
    state: State<Arc<AppState>>,
    user: auth::AuthUser,
    path: Path<Uuid>,
) -> error::AppResult<axum::response::Response> {
    documents::download_or_view_document(state, user, path, true).await
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "origineo_api=info,tower_http=info".into()),
        )
        .init();

    let config = AppConfig::from_env();
    tracing::info!("🌳 Starting Origineo v2.0 (Rust + Axum + SQLx)");

    documents::init_storage_dirs(&config.storage_path).await?;

    let pool = PgPoolOptions::new()
        .max_connections(15)
        .connect(&config.database_url)
        .await?;

    // Run embedded migrations automatically on startup
    sqlx::migrate!("./migrations").run(&pool).await?;
    tracing::info!("✅ PostgreSQL migrations applied & pg_trgm ready");

    let state = Arc::new(AppState {
        pool,
        config: config.clone(),
        oidc: OidcRuntime::new(),
        gedcom_sessions: GedcomSessionStore::new(),
    });

    let api_router = Router::new()
        .route("/health", get(health_check))
        // Auth & OIDC SSO
        .route("/auth/oidc/config", get(auth::get_oidc_config))
        .route("/auth/oidc/login", get(auth::oidc_login))
        .route("/auth/oidc/callback", get(auth::oidc_callback))
        .route("/auth/me", get(auth::get_me))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/users", get(auth::list_users))
        // Persons & Branches
        .route(
            "/persons",
            get(persons::list_persons)
                .post(persons::create_person)
                .delete(persons::delete_all_persons),
        )
        .route("/persons/root", get(persons::get_root_person))
        .route(
            "/persons/{id}",
            get(persons::get_person_by_id)
                .patch(persons::update_person)
                .delete(persons::delete_person),
        )
        .route("/persons/{id}/relatives", post(persons::create_relative))
        .route("/persons/{id}/branch", delete(persons::delete_branch))
        // Relationships & Unions
        .route("/relationships", post(persons::create_relationship))
        .route("/relationships/{id}", delete(persons::delete_relationship))
        .route("/unions", post(persons::create_union))
        .route("/unions/{id}", delete(persons::delete_union))
        // Dynamic Tree, Bidirectional BFS Relationship Path & Fragments
        .route("/tree/fragments", get(tree::get_tree_fragments))
        .route("/tree/{id}", get(tree::get_tree_window))
        .route(
            "/tree/relationship/{person_a_id}/{person_b_id}",
            get(tree::get_relationship_path),
        )
        // Trigram Fuzzy Search
        .route("/search", get(search::search_persons))
        // GEDCOM Import / Export / Selective Merge
        .route("/gedcom/import", post(gedcom::import_gedcom))
        .route("/gedcom/export", get(gedcom::export_gedcom))
        .route("/gedcom/merge/analyze", post(gedcom::analyze_merge_gedcom))
        .route("/gedcom/merge/apply", post(gedcom::apply_merge_gedcom))
        // Documents & Photos
        .route("/documents/upload", post(documents::upload_document))
        .route(
            "/documents/person/{person_id}",
            get(documents::get_documents_by_person),
        )
        .route(
            "/documents/union/{union_id}",
            get(documents::get_documents_by_union),
        )
        .route("/documents/{id}/download", get(download_doc_handler))
        .route("/documents/{id}/view", get(view_doc_handler))
        .route("/documents/{id}", delete(documents::delete_document))
        .route(
            "/documents/profile-photo/{person_id}",
            get(documents::get_profile_photo).post(documents::upload_profile_photo),
        )
        .route(
            "/documents/profile-photo/{person_id}/exists",
            get(documents::has_profile_photo),
        )
        .route(
            "/documents/{id}/tags",
            get(documents::get_document_tags).post(documents::create_document_tag),
        )
        .route(
            "/documents/tags/{tag_id}",
            delete(documents::delete_document_tag),
        )
        // Migration Map & Places
        .route("/places/map", get(audit_map::get_family_map))
        .route("/places/{id}/coords", patch(audit_map::update_place_coords))
        // Genealogical Anomalies & Audit Log (with 1-Click Undo)
        .route("/audit/anomalies", get(audit_map::detect_anomalies))
        .route("/audit/logs", get(audit_map::list_audit_logs))
        .route("/audit/logs/{id}/undo", post(audit_map::undo_audit_log))
        // Events / Timeline & Participants (Témoins, Parrains, etc.)
        .route(
            "/events/person/{person_id}",
            get(events::get_events_by_person),
        )
        .route("/events", post(events::create_event))
        .route(
            "/events/{id}",
            patch(events::update_event).delete(events::delete_event),
        )
        // Professional Repositories, Sources & Citations
        .route(
            "/repositories",
            get(sources::list_repositories).post(sources::create_repository),
        )
        .route(
            "/sources",
            get(sources::list_sources).post(sources::create_source),
        )
        .route("/sources/{id}", delete(sources::delete_source))
        .route(
            "/citations/person/{person_id}",
            get(sources::list_citations_by_person),
        )
        .route("/citations", post(sources::create_citation))
        .route("/citations/{id}", delete(sources::delete_citation))
        // Smart Duplicates & Fusion
        .route("/duplicates/candidates", get(duplicates::find_duplicate_candidates))
        .route("/duplicates/merge", post(duplicates::merge_two_persons))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024)); // 50 MB upload limit

    // Static SPA fallback for SvelteKit build
    let static_path = PathBuf::from(&config.static_dir);
    let index_html = static_path.join("index.html");
    let spa_service = ServeDir::new(&static_path).not_found_service(ServeFile::new(index_html));

    let cors = CorsLayer::new()
        .allow_origin(
            config
                .frontend_url
                .parse::<HeaderValue>()
                .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:5173")),
        )
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
            header::COOKIE,
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/api", api_router)
        .fallback_service(spa_service)
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    tracing::info!("🚀 Origineo server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
