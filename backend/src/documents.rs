use std::io::Cursor;
use std::path::{Path as StdPath, PathBuf};
use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use tokio::fs;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    models::{DocumentDto, DocumentTagDto},
    AppState,
};

pub async fn init_storage_dirs(storage_root: &str) -> AppResult<()> {
    let root = PathBuf::from(storage_root);
    fs::create_dir_all(root.join("persons"))
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create persons storage dir: {}", e)))?;
    fs::create_dir_all(root.join("unions"))
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create unions storage dir: {}", e)))?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadDocQuery {
    pub person_id: Option<Uuid>,
    pub union_id: Option<Uuid>,
    pub category: Option<String>,
    pub description: Option<String>,
}

fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "document".to_string()
    } else if out.len() > 100 {
        out[..100].to_string()
    } else {
        out
    }
}

pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Query(query): Query<UploadDocQuery>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    if query.person_id.is_none() && query.union_id.is_none() {
        return Err(AppError::BadRequest(
            "Either personId or unionId must be provided".to_string(),
        ));
    }

    let root = PathBuf::from(&state.config.storage_path);
    let (folder_path, rel_prefix) = if let Some(pid) = query.person_id {
        let exists: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM persons WHERE id = $1")
                .bind(pid)
                .fetch_optional(&state.pool)
                .await?;
        if exists.is_none() {
            return Err(AppError::NotFound(format!("Person {} not found", pid)));
        }
        (
            root.join("persons").join(pid.to_string()),
            format!("persons/{}", pid),
        )
    } else {
        let uid = query.union_id.unwrap();
        let union_pair: Option<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT partner1_id, partner2_id FROM unions WHERE id = $1",
        )
        .bind(uid)
        .fetch_optional(&state.pool)
        .await?;

        let (p1, p2) =
            union_pair.ok_or_else(|| AppError::NotFound(format!("Union {} not found", uid)))?;
        let mut sorted = [p1.to_string(), p2.to_string()];
        sorted.sort();
        let folder_name = format!("{}_{}", sorted[0], sorted[1]);
        (
            root.join("unions").join(&folder_name),
            format!("unions/{}", folder_name),
        )
    };

    fs::create_dir_all(&folder_path)
        .await
        .map_err(|e| AppError::Internal(format!("Cannot create folder: {}", e)))?;

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut original_name = "document.bin".to_string();
    let mut mime_type = "application/octet-stream".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        if field.name() == Some("file") || file_bytes.is_none() {
            if let Some(fname) = field.file_name() {
                original_name = fname.to_string();
            }
            if let Some(ct) = field.content_type() {
                mime_type = ct.to_string();
            } else {
                mime_type = mime_guess::from_path(&original_name)
                    .first_or_octet_stream()
                    .to_string();
            }
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed reading file bytes: {}", e)))?;
            file_bytes = Some(data.to_vec());
            break;
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file uploaded".to_string()))?;

    let ext = StdPath::new(&original_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();
    let stem = StdPath::new(&original_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("doc");
    let clean_stem = sanitize_filename(stem);
    let short_uuid = &Uuid::new_v4().to_string()[..8];
    let unique_filename = format!("{}_{}{}", clean_stem, short_uuid, ext);

    let full_path = folder_path.join(&unique_filename);
    fs::write(&full_path, &bytes)
        .await
        .map_err(|e| AppError::Internal(format!("Failed writing file: {}", e)))?;

    let storage_path = format!("{}/{}", rel_prefix, unique_filename);
    let category = query
        .category
        .as_deref()
        .unwrap_or("OTHER")
        .trim()
        .to_uppercase();

    let doc = sqlx::query_as::<_, DocumentDto>(
        r#"
        INSERT INTO documents (person_id, union_id, filename, mime_type, storage_path, category, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, person_id, union_id, filename, mime_type, storage_path, category::text AS category, description, created_at
        "#,
    )
    .bind(query.person_id)
    .bind(query.union_id)
    .bind(&original_name)
    .bind(&mime_type)
    .bind(&storage_path)
    .bind(&category)
    .bind(query.description.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(doc))
}

pub async fn get_documents_by_person(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(person_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let docs = sqlx::query_as::<_, DocumentDto>(
        r#"
        SELECT id, person_id, union_id, filename, mime_type, storage_path, category::text AS category, description, created_at
        FROM documents
        WHERE person_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(person_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(docs))
}

pub async fn get_documents_by_union(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(union_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let docs = sqlx::query_as::<_, DocumentDto>(
        r#"
        SELECT id, person_id, union_id, filename, mime_type, storage_path, category::text AS category, description, created_at
        FROM documents
        WHERE union_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(union_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(docs))
}

pub async fn download_or_view_document(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
    inline: bool,
) -> AppResult<Response> {
    let doc = sqlx::query_as::<_, DocumentDto>(
        r#"
        SELECT id, person_id, union_id, filename, mime_type, storage_path, category::text AS category, description, created_at
        FROM documents
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Document not found".to_string()))?;

    let abs_path = PathBuf::from(&state.config.storage_path).join(&doc.storage_path);
    let bytes = fs::read(&abs_path)
        .await
        .map_err(|_| AppError::NotFound("File not found on disk".to_string()))?;

    let disposition = if inline {
        format!("inline; filename=\"{}\"", doc.filename.replace('"', ""))
    } else {
        format!("attachment; filename=\"{}\"", doc.filename.replace('"', ""))
    };

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, doc.mime_type),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        Body::from(bytes),
    )
        .into_response())
}

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let doc = sqlx::query_as::<_, DocumentDto>(
        r#"
        SELECT id, person_id, union_id, filename, mime_type, storage_path, category::text AS category, description, created_at
        FROM documents
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Document not found".to_string()))?;

    let abs_path = PathBuf::from(&state.config.storage_path).join(&doc.storage_path);
    let _ = fs::remove_file(&abs_path).await;

    sqlx::query("DELETE FROM documents WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "message": "Document deleted successfully"
    })))
}

// ─── Profile Photo Endpoints (With Native Rust WebP Conversion) ────

pub async fn upload_profile_photo(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(person_id): Path<Uuid>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM persons WHERE id = $1")
            .bind(person_id)
            .fetch_optional(&state.pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!("Person {} not found", person_id)));
    }

    let folder_path = PathBuf::from(&state.config.storage_path)
        .join("persons")
        .join(person_id.to_string());
    fs::create_dir_all(&folder_path)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create folder: {}", e)))?;

    // Remove existing profile.* files
    if let Ok(mut entries) = fs::read_dir(&folder_path).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("profile.") {
                    let _ = fs::remove_file(entry.path()).await;
                }
            }
        }
    }

    let mut original_name = "profile.jpg".to_string();
    let mut bytes_opt: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        if let Some(fname) = field.file_name() {
            original_name = fname.to_string();
        }
        let b = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Read error: {}", e)))?;
        bytes_opt = Some(b.to_vec());
        break;
    }

    let bytes = bytes_opt.ok_or_else(|| AppError::BadRequest("No photo file provided".to_string()))?;

    // Convert & resize to ultra-lightweight WebP (320x320 max) using the `image` crate
    let (profile_filename, final_bytes) = match image::load_from_memory(&bytes) {
        Ok(img) => {
            let thumb = img.thumbnail(320, 320);
            let mut webp_buf = Vec::new();
            if thumb
                .write_to(&mut Cursor::new(&mut webp_buf), image::ImageFormat::WebP)
                .is_ok()
            {
                ("profile.webp".to_string(), webp_buf)
            } else {
                let ext = StdPath::new(&original_name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                    .unwrap_or_else(|| "jpg".to_string());
                (format!("profile.{}", ext), bytes)
            }
        }
        Err(_) => {
            let ext = StdPath::new(&original_name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_else(|| "jpg".to_string());
            (format!("profile.{}", ext), bytes)
        }
    };

    let file_path = folder_path.join(&profile_filename);
    fs::write(&file_path, &final_bytes)
        .await
        .map_err(|e| AppError::Internal(format!("Failed saving profile photo: {}", e)))?;

    sqlx::query("UPDATE persons SET has_profile_photo = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1")
        .bind(person_id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "personId": person_id,
        "filename": profile_filename,
        "storagePath": format!("persons/{}/{}", person_id, profile_filename)
    })))
}

pub async fn has_profile_photo(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(person_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let found = find_profile_photo_path(&state.config.storage_path, person_id)
        .await
        .is_some();
    Ok(ApiSuccess::new(serde_json::json!({ "exists": found })))
}

pub async fn get_profile_photo(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(person_id): Path<Uuid>,
) -> AppResult<Response> {
    let path = find_profile_photo_path(&state.config.storage_path, person_id)
        .await
        .ok_or_else(|| AppError::NotFound("Profile photo not found".to_string()))?;

    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();
    let bytes = fs::read(&path)
        .await
        .map_err(|_| AppError::NotFound("Profile photo unreadable".to_string()))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
        ],
        Body::from(bytes),
    )
        .into_response())
}

async fn find_profile_photo_path(storage_root: &str, person_id: Uuid) -> Option<PathBuf> {
    let folder = PathBuf::from(storage_root)
        .join("persons")
        .join(person_id.to_string());
    let mut entries = fs::read_dir(&folder).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with("profile.") {
                return Some(entry.path());
            }
        }
    }
    None
}

// ─── Group Photo / Vital Record Face & Name Tagging ────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentTagPayload {
    pub person_id: Uuid,
    pub x_pct: f64,
    pub y_pct: f64,
    pub w_pct: f64,
    pub h_pct: f64,
    pub label: Option<String>,
}

pub async fn get_document_tags(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(document_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let tags = sqlx::query_as::<_, DocumentTagDto>(
        r#"
        SELECT
            dt.id,
            dt.document_id,
            dt.person_id,
            p.given_names AS person_given_names,
            COALESCE(p.usage_surname, p.birth_surname) AS person_surname,
            dt.x_pct,
            dt.y_pct,
            dt.w_pct,
            dt.h_pct,
            dt.label,
            dt.created_at
        FROM document_tags dt
        INNER JOIN persons p ON p.id = dt.person_id
        WHERE dt.document_id = $1
        ORDER BY dt.created_at ASC
        "#,
    )
    .bind(document_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(tags))
}

pub async fn create_document_tag(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(document_id): Path<Uuid>,
    Json(payload): Json<CreateDocumentTagPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let (tag_id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO document_tags (document_id, person_id, x_pct, y_pct, w_pct, h_pct, label)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(document_id)
    .bind(payload.person_id)
    .bind(payload.x_pct.clamp(0.0, 100.0))
    .bind(payload.y_pct.clamp(0.0, 100.0))
    .bind(payload.w_pct.clamp(1.0, 100.0))
    .bind(payload.h_pct.clamp(1.0, 100.0))
    .bind(payload.label.as_deref())
    .fetch_one(&state.pool)
    .await?;

    let tag = sqlx::query_as::<_, DocumentTagDto>(
        r#"
        SELECT
            dt.id,
            dt.document_id,
            dt.person_id,
            p.given_names AS person_given_names,
            COALESCE(p.usage_surname, p.birth_surname) AS person_surname,
            dt.x_pct,
            dt.y_pct,
            dt.w_pct,
            dt.h_pct,
            dt.label,
            dt.created_at
        FROM document_tags dt
        INNER JOIN persons p ON p.id = dt.person_id
        WHERE dt.id = $1
        "#,
    )
    .bind(tag_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(tag))
}

pub async fn delete_document_tag(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(tag_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    sqlx::query("DELETE FROM document_tags WHERE id = $1")
        .bind(tag_id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}
