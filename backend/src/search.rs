use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::IntoResponse,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppResult},
    utils::{normalize_text, parse_optional_date, parse_tree_id},
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub tree_id: Option<String>,
    pub q: Option<String>,
    pub place: Option<String>,
    pub gender: Option<String>,
    pub birth_date_from: Option<String>,
    pub birth_date_to: Option<String>,
    pub death_date_from: Option<String>,
    pub death_date_to: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SearchPersonRow {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub usage_surname: Option<String>,
    pub birth_surname: Option<String>,
    pub given_names: String,
    pub gender: String,
    pub birth_date: Option<NaiveDate>,
    pub birth_place_id: Option<Uuid>,
    pub birth_place: Option<String>,
    pub death_date: Option<NaiveDate>,
    pub death_place_id: Option<Uuid>,
    pub death_place: Option<String>,
    pub professions: Vec<String>,
    pub notes: Option<String>,
    pub is_root_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub similarity: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub persons: Vec<SearchPersonRow>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
}

pub async fn search_persons(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let q_raw = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let q_norm = q_raw.map(normalize_text).filter(|s| !s.is_empty());
    let place_filter = query
        .place
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let gender_filter = query
        .gender
        .as_deref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| matches!(s.as_str(), "MALE" | "FEMALE" | "OTHER" | "UNKNOWN"));

    let birth_from = parse_optional_date(query.birth_date_from.as_deref());
    let birth_to = parse_optional_date(query.birth_date_to.as_deref());
    let death_from = parse_optional_date(query.death_date_from.as_deref());
    let death_to = parse_optional_date(query.death_date_to.as_deref());

    let has_criteria = q_raw.is_some()
        || place_filter.is_some()
        || gender_filter.is_some()
        || birth_from.is_some()
        || birth_to.is_some()
        || death_from.is_some()
        || death_to.is_some();

    if !has_criteria {
        return Ok(ApiSuccess::new(SearchResponse {
            persons: vec![],
            total: 0,
            page,
            limit,
        }));
    }

    let like_raw = q_raw.map(|q| format!("%{}%", q));
    let like_norm = q_norm.as_deref().map(|q| format!("%{}%", q));
    let like_place = place_filter.map(|p| format!("%{}%", p));

    let rows = sqlx::query_as::<_, SearchPersonRow>(
        r#"
        SELECT
            p.id,
            p.tree_id,
            p.usage_surname,
            p.birth_surname,
            p.given_names,
            p.gender::text AS gender,
            p.birth_date,
            p.birth_place_id,
            CASE WHEN bp.id IS NULL THEN NULL
                 ELSE NULLIF(concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country), '')
            END AS birth_place,
            p.death_date,
            p.death_place_id,
            CASE WHEN dp.id IS NULL THEN NULL
                 ELSE NULLIF(concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country), '')
            END AS death_place,
            p.professions,
            p.notes,
            p.is_root_default,
            p.created_at,
            p.updated_at,
            CASE WHEN $2::text IS NOT NULL THEN
                GREATEST(
                    COALESCE(similarity(p.primary_name_normalized, $3), 0),
                    COALESCE(similarity(p.surname_normalized, $3), 0),
                    COALESCE(similarity(p.given_names_normalized, $3), 0),
                    COALESCE(similarity(p.given_names, $2), 0),
                    COALESCE(similarity(p.birth_surname, $2), 0),
                    COALESCE(similarity(p.usage_surname, $2), 0),
                    COALESCE(similarity(concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country), $2), 0),
                    COALESCE(similarity(concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country), $2), 0)
                )::double precision
            ELSE 0.0::double precision END AS similarity
        FROM persons p
        LEFT JOIN places bp ON bp.id = p.birth_place_id
        LEFT JOIN places dp ON dp.id = p.death_place_id
        WHERE p.tree_id = $1
          AND (
              $2::text IS NULL
              OR p.primary_name_normalized % $3
              OR p.surname_normalized % $3
              OR p.given_names_normalized % $3
              OR p.primary_name_normalized ILIKE $5
              OR p.surname_normalized ILIKE $5
              OR p.given_names_normalized ILIKE $5
              OR p.birth_year::text = $3
              OR p.death_year::text = $3
              OR p.given_names % $2
              OR p.birth_surname % $2
              OR p.usage_surname % $2
              OR p.given_names ILIKE $4
              OR p.birth_surname ILIKE $4
              OR p.usage_surname ILIKE $4
              OR concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country) ILIKE $4
              OR concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country) ILIKE $4
              OR p.notes ILIKE $4
              OR EXISTS (
                  SELECT 1 FROM unnest(p.professions) prof WHERE prof ILIKE $4
              )
          )
          AND (
              $6::text IS NULL
              OR concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country) ILIKE $6
              OR concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country) ILIKE $6
          )
          AND ($7::text IS NULL OR p.gender::text = $7)
          AND ($8::date IS NULL OR p.birth_date >= $8)
          AND ($9::date IS NULL OR p.birth_date <= $9)
          AND ($10::date IS NULL OR p.death_date >= $10)
          AND ($11::date IS NULL OR p.death_date <= $11)
        ORDER BY similarity DESC, p.updated_at DESC
        LIMIT $12 OFFSET $13
        "#,
    )
    .bind(tree_id)
    .bind(q_raw)
    .bind(q_norm.as_deref())
    .bind(like_raw.as_deref())
    .bind(like_norm.as_deref())
    .bind(like_place.as_deref())
    .bind(gender_filter.as_deref())
    .bind(birth_from)
    .bind(birth_to)
    .bind(death_from)
    .bind(death_to)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let (total,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM persons p
        LEFT JOIN places bp ON bp.id = p.birth_place_id
        LEFT JOIN places dp ON dp.id = p.death_place_id
        WHERE p.tree_id = $1
          AND (
              $2::text IS NULL
              OR p.primary_name_normalized % $3
              OR p.surname_normalized % $3
              OR p.given_names_normalized % $3
              OR p.primary_name_normalized ILIKE $5
              OR p.surname_normalized ILIKE $5
              OR p.given_names_normalized ILIKE $5
              OR p.birth_year::text = $3
              OR p.death_year::text = $3
              OR p.given_names % $2
              OR p.birth_surname % $2
              OR p.usage_surname % $2
              OR p.given_names ILIKE $4
              OR p.birth_surname ILIKE $4
              OR p.usage_surname ILIKE $4
              OR concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country) ILIKE $4
              OR concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country) ILIKE $4
              OR p.notes ILIKE $4
              OR EXISTS (
                  SELECT 1 FROM unnest(p.professions) prof WHERE prof ILIKE $4
              )
          )
          AND (
              $6::text IS NULL
              OR concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country) ILIKE $6
              OR concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country) ILIKE $6
          )
          AND ($7::text IS NULL OR p.gender::text = $7)
          AND ($8::date IS NULL OR p.birth_date >= $8)
          AND ($9::date IS NULL OR p.birth_date <= $9)
          AND ($10::date IS NULL OR p.death_date >= $10)
          AND ($11::date IS NULL OR p.death_date <= $11)
        "#,
    )
    .bind(tree_id)
    .bind(q_raw)
    .bind(q_norm.as_deref())
    .bind(like_raw.as_deref())
    .bind(like_norm.as_deref())
    .bind(like_place.as_deref())
    .bind(gender_filter.as_deref())
    .bind(birth_from)
    .bind(birth_to)
    .bind(death_from)
    .bind(death_to)
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(SearchResponse {
        persons: rows,
        total,
        page,
        limit,
    }))
}
