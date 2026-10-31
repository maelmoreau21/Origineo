use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    utils::parse_tree_id,
    AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    pub repo_type: String,
    pub website_url: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SourceDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub repository_id: Option<Uuid>,
    pub repository_name: Option<String>,
    pub title: String,
    pub author: Option<String>,
    pub call_number: Option<String>,
    pub source_type: String,
    pub reliability: String,
    pub url: Option<String>,
    pub text_extract: Option<String>,
    pub notes: Option<String>,
    pub citation_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CitationDto {
    pub id: Uuid,
    pub source_id: Uuid,
    pub source_title: String,
    pub call_number: Option<String>,
    pub reliability: String,
    pub source_url: Option<String>,
    pub person_id: Option<Uuid>,
    pub union_id: Option<Uuid>,
    pub page_folio: Option<String>,
    pub confidence: i32,
    pub transcription: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeQuery {
    pub tree_id: Option<String>,
    pub search: Option<String>,
}

// ----------------- REPOSITORIES -----------------

pub async fn list_repositories(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<TreeQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let rows = sqlx::query_as::<_, RepositoryDto>(
        r#"
        SELECT id, tree_id, name, type AS repo_type, website_url, address, notes, created_at, updated_at
        FROM repositories
        WHERE tree_id = $1
        ORDER BY name ASC
        LIMIT 200
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRepositoryPayload {
    pub tree_id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub repo_type: Option<String>,
    pub website_url: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_repository(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(payload): Json<CreateRepositoryPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;
    let tree_id = parse_tree_id(payload.tree_id.as_deref())?;

    let row = sqlx::query_as::<_, RepositoryDto>(
        r#"
        INSERT INTO repositories (tree_id, name, type, website_url, address, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tree_id, name, type AS repo_type, website_url, address, notes, created_at, updated_at
        "#,
    )
    .bind(tree_id)
    .bind(payload.name.trim())
    .bind(payload.repo_type.as_deref().unwrap_or("ARCHIVES_DEPARTEMENTALES"))
    .bind(payload.website_url.as_deref())
    .bind(payload.address.as_deref())
    .bind(payload.notes.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(row))
}

// ----------------- SOURCES -----------------

pub async fn list_sources(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<TreeQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let search = query.search.as_deref().unwrap_or("").trim();

    let rows = if search.is_empty() {
        sqlx::query_as::<_, SourceDto>(
            r#"
            SELECT s.id, s.tree_id, s.repository_id, r.name AS repository_name,
                   s.title, s.author, s.call_number, s.source_type, s.reliability,
                   s.url, s.text_extract, s.notes,
                   COUNT(c.id) AS citation_count,
                   s.created_at, s.updated_at
            FROM sources s
            LEFT JOIN repositories r ON r.id = s.repository_id
            LEFT JOIN citations c ON c.source_id = s.id
            WHERE s.tree_id = $1
            GROUP BY s.id, r.name
            ORDER BY s.updated_at DESC
            LIMIT 250
            "#,
        )
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?
    } else {
        let pattern = format!("%{}%", search);
        sqlx::query_as::<_, SourceDto>(
            r#"
            SELECT s.id, s.tree_id, s.repository_id, r.name AS repository_name,
                   s.title, s.author, s.call_number, s.source_type, s.reliability,
                   s.url, s.text_extract, s.notes,
                   COUNT(c.id) AS citation_count,
                   s.created_at, s.updated_at
            FROM sources s
            LEFT JOIN repositories r ON r.id = s.repository_id
            LEFT JOIN citations c ON c.source_id = s.id
            WHERE s.tree_id = $1 AND (s.title ILIKE $2 OR s.call_number ILIKE $2 OR s.author ILIKE $2)
            GROUP BY s.id, r.name
            ORDER BY s.updated_at DESC
            LIMIT 250
            "#,
        )
        .bind(tree_id)
        .bind(&pattern)
        .fetch_all(&state.pool)
        .await?
    };

    Ok(ApiSuccess::new(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSourcePayload {
    pub tree_id: Option<String>,
    pub repository_id: Option<Uuid>,
    pub title: String,
    pub author: Option<String>,
    pub call_number: Option<String>,
    pub source_type: Option<String>,
    pub reliability: Option<String>,
    pub url: Option<String>,
    pub text_extract: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_source(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(payload): Json<CreateSourcePayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;
    let tree_id = parse_tree_id(payload.tree_id.as_deref())?;

    let row = sqlx::query_as::<_, SourceDto>(
        r#"
        WITH inserted AS (
            INSERT INTO sources (
                tree_id, repository_id, title, author, call_number,
                source_type, reliability, url, text_extract, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        )
        SELECT i.id, i.tree_id, i.repository_id, r.name AS repository_name,
               i.title, i.author, i.call_number, i.source_type, i.reliability,
               i.url, i.text_extract, i.notes,
               0::bigint AS citation_count,
               i.created_at, i.updated_at
        FROM inserted i
        LEFT JOIN repositories r ON r.id = i.repository_id
        "#,
    )
    .bind(tree_id)
    .bind(payload.repository_id)
    .bind(payload.title.trim())
    .bind(payload.author.as_deref())
    .bind(payload.call_number.as_deref())
    .bind(payload.source_type.as_deref().unwrap_or("REGISTRE_PAROISSIAL"))
    .bind(payload.reliability.as_deref().unwrap_or("PRIMARY"))
    .bind(payload.url.as_deref())
    .bind(payload.text_extract.as_deref())
    .bind(payload.notes.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(row))
}

pub async fn delete_source(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;
    let res = sqlx::query("DELETE FROM sources WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("Source introuvable".to_string()));
    }
    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}

// ----------------- CITATIONS -----------------

pub async fn list_citations_by_person(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(person_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let rows = sqlx::query_as::<_, CitationDto>(
        r#"
        SELECT c.id, c.source_id, s.title AS source_title, s.call_number, s.reliability, s.url AS source_url,
               c.person_id, c.union_id, c.page_folio, c.confidence, c.transcription, c.created_at
        FROM citations c
        INNER JOIN sources s ON s.id = c.source_id
        WHERE c.person_id = $1
        ORDER BY c.created_at DESC
        "#,
    )
    .bind(person_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCitationPayload {
    pub source_id: Uuid,
    pub person_id: Option<Uuid>,
    pub union_id: Option<Uuid>,
    pub page_folio: Option<String>,
    pub confidence: Option<i32>,
    pub transcription: Option<String>,
}

pub async fn create_citation(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(payload): Json<CreateCitationPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let row = sqlx::query_as::<_, CitationDto>(
        r#"
        WITH inserted AS (
            INSERT INTO citations (source_id, person_id, union_id, page_folio, confidence, transcription)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        )
        SELECT i.id, i.source_id, s.title AS source_title, s.call_number, s.reliability, s.url AS source_url,
               i.person_id, i.union_id, i.page_folio, i.confidence, i.transcription, i.created_at
        FROM inserted i
        INNER JOIN sources s ON s.id = i.source_id
        "#,
    )
    .bind(payload.source_id)
    .bind(payload.person_id)
    .bind(payload.union_id)
    .bind(payload.page_folio.as_deref())
    .bind(payload.confidence.unwrap_or(3).clamp(0, 4))
    .bind(payload.transcription.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(row))
}

pub async fn delete_citation(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;
    let res = sqlx::query("DELETE FROM citations WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("Citation introuvable".to_string()));
    }
    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}
