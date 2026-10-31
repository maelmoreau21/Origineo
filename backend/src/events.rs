use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    utils::{parse_optional_date, parse_tree_id},
    AppState,
};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventParticipantDto {
    pub id: Uuid,
    pub event_id: Uuid,
    pub person_id: Uuid,
    pub person_name: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDetailDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    #[serde(rename = "type")]
    pub event_type: String,
    pub date: Option<NaiveDate>,
    pub date_raw: Option<String>,
    pub notes: Option<String>,
    pub place_id: Option<Uuid>,
    pub place_name: Option<String>,
    pub participants: Vec<EventParticipantDto>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct EventDbRow {
    id: Uuid,
    tree_id: Uuid,
    event_type: String,
    date: Option<NaiveDate>,
    date_raw: Option<String>,
    notes: Option<String>,
    place_id: Option<Uuid>,
    place_name: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPersonQuery {
    pub tree_id: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

pub async fn get_events_by_person(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(person_id): Path<Uuid>,
    Query(query): Query<EventPersonQuery>,
) -> AppResult<impl IntoResponse> {
    let limit = query.limit.unwrap_or(80).clamp(1, 200);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let rows = sqlx::query_as::<_, EventDbRow>(
        r#"
        SELECT e.id, e.tree_id, e.type AS event_type, e.date, e.date_raw, e.notes, e.place_id,
               pl.name AS place_name, e.created_at, e.updated_at
        FROM events e
        INNER JOIN event_participants ep ON ep.event_id = e.id
        LEFT JOIN places pl ON pl.id = e.place_id
        WHERE ep.person_id = $1
        ORDER BY e.date ASC NULLS LAST, e.created_at ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(person_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let event_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    let all_participants: Vec<EventParticipantDto> = if !event_ids.is_empty() {
        sqlx::query_as::<_, EventParticipantDto>(
            r#"
            SELECT ep.id, ep.event_id, ep.person_id,
                   concat_ws(' ', p.given_names, COALESCE(p.usage_surname, p.birth_surname, '')) AS person_name,
                   ep.role, ep.created_at
            FROM event_participants ep
            INNER JOIN persons p ON p.id = ep.person_id
            WHERE ep.event_id = ANY($1)
            ORDER BY ep.role ASC, ep.created_at ASC
            "#,
        )
        .bind(&event_ids)
        .fetch_all(&state.pool)
        .await?
    } else {
        vec![]
    };

    let events: Vec<EventDetailDto> = rows
        .into_iter()
        .map(|r| {
            let parts: Vec<EventParticipantDto> = all_participants
                .iter()
                .filter(|p| p.event_id == r.id)
                .cloned()
                .collect();

            EventDetailDto {
                id: r.id,
                tree_id: r.tree_id,
                event_type: r.event_type,
                date: r.date,
                date_raw: r.date_raw,
                notes: r.notes,
                place_id: r.place_id,
                place_name: r.place_name,
                participants: parts,
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        })
        .collect();

    Ok(ApiSuccess::new(events))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventParticipantInput {
    pub person_id: Uuid,
    pub role: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrUpdateEventPayload {
    pub tree_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    pub date: Option<String>,
    pub date_raw: Option<String>,
    pub notes: Option<String>,
    pub place_name: Option<String>,
    pub participants: Option<Vec<EventParticipantInput>>,
}

pub async fn create_event(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(dto): Json<CreateOrUpdateEventPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(dto.tree_id.as_deref())?;
    let event_type = dto.event_type.as_deref().unwrap_or("AUTRE").trim().to_uppercase();
    let date = parse_optional_date(dto.date.as_deref());

    let place_id = if let Some(pname) = dto.place_name.as_deref() {
        crate::persons::find_or_create_place_id(&state.pool, &state.pool, Some(pname)).await?
    } else {
        None
    };

    let ev = sqlx::query_as::<_, EventDbRow>(
        r#"
        WITH inserted AS (
            INSERT INTO events (tree_id, type, date, date_raw, notes, place_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        )
        SELECT i.id, i.tree_id, i.type AS event_type, i.date, i.date_raw, i.notes, i.place_id,
               pl.name AS place_name, i.created_at, i.updated_at
        FROM inserted i
        LEFT JOIN places pl ON pl.id = i.place_id
        "#,
    )
    .bind(tree_id)
    .bind(&event_type)
    .bind(date)
    .bind(dto.date_raw.as_deref())
    .bind(dto.notes.as_deref())
    .bind(place_id)
    .fetch_one(&state.pool)
    .await?;

    let mut parts = Vec::new();
    if let Some(participants) = dto.participants {
        for p in participants {
            let role = p.role.as_deref().unwrap_or("SUBJECT").trim().to_uppercase();
            let participant_row = sqlx::query_as::<_, EventParticipantDto>(
                r#"
                WITH inserted AS (
                    INSERT INTO event_participants (event_id, person_id, role)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (event_id, person_id) DO UPDATE SET role = EXCLUDED.role
                    RETURNING *
                )
                SELECT i.id, i.event_id, i.person_id,
                       concat_ws(' ', pr.given_names, COALESCE(pr.usage_surname, pr.birth_surname, '')) AS person_name,
                       i.role, i.created_at
                FROM inserted i
                INNER JOIN persons pr ON pr.id = i.person_id
                "#,
            )
            .bind(ev.id)
            .bind(p.person_id)
            .bind(&role)
            .fetch_one(&state.pool)
            .await?;

            parts.push(participant_row);
        }
    }

    Ok(ApiSuccess::new(EventDetailDto {
        id: ev.id,
        tree_id: ev.tree_id,
        event_type: ev.event_type,
        date: ev.date,
        date_raw: ev.date_raw,
        notes: ev.notes,
        place_id: ev.place_id,
        place_name: ev.place_name,
        participants: parts,
        created_at: ev.created_at,
        updated_at: ev.updated_at,
    }))
}

pub async fn update_event(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(dto): Json<CreateOrUpdateEventPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let event_type = dto.event_type.as_deref().unwrap_or("AUTRE").trim().to_uppercase();
    let date = parse_optional_date(dto.date.as_deref());

    let place_id = if let Some(pname) = dto.place_name.as_deref() {
        crate::persons::find_or_create_place_id(&state.pool, &state.pool, Some(pname)).await?
    } else {
        None
    };

    let ev = sqlx::query_as::<_, EventDbRow>(
        r#"
        UPDATE events
        SET type = $1, date = $2, date_raw = $3, notes = $4, place_id = COALESCE($5, place_id), updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING id, tree_id, type AS event_type, date, date_raw, notes, place_id,
                  (SELECT name FROM places WHERE id = events.place_id) AS place_name,
                  created_at, updated_at
        "#,
    )
    .bind(&event_type)
    .bind(date)
    .bind(dto.date_raw.as_deref())
    .bind(dto.notes.as_deref())
    .bind(place_id)
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    if let Some(participants) = dto.participants {
        // Replace participants for this event
        sqlx::query("DELETE FROM event_participants WHERE event_id = $1")
            .bind(id)
            .execute(&state.pool)
            .await?;

        for p in participants {
            let role = p.role.as_deref().unwrap_or("SUBJECT").trim().to_uppercase();
            sqlx::query(
                r#"
                INSERT INTO event_participants (event_id, person_id, role)
                VALUES ($1, $2, $3)
                ON CONFLICT (event_id, person_id) DO UPDATE SET role = EXCLUDED.role
                "#,
            )
            .bind(id)
            .bind(p.person_id)
            .bind(&role)
            .execute(&state.pool)
            .await?;
        }
    }

    let parts = sqlx::query_as::<_, EventParticipantDto>(
        r#"
        SELECT ep.id, ep.event_id, ep.person_id,
               concat_ws(' ', pr.given_names, COALESCE(pr.usage_surname, pr.birth_surname, '')) AS person_name,
               ep.role, ep.created_at
        FROM event_participants ep
        INNER JOIN persons pr ON pr.id = ep.person_id
        WHERE ep.event_id = $1
        ORDER BY ep.role ASC, ep.created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(EventDetailDto {
        id: ev.id,
        tree_id: ev.tree_id,
        event_type: ev.event_type,
        date: ev.date,
        date_raw: ev.date_raw,
        notes: ev.notes,
        place_id: ev.place_id,
        place_name: ev.place_name,
        participants: parts,
        created_at: ev.created_at,
        updated_at: ev.updated_at,
    }))
}

pub async fn delete_event(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let res = sqlx::query("DELETE FROM events WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("Événement introuvable".to_string()));
    }

    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}
