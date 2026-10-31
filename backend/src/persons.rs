use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    models::{PersonDto, PersonWithPlaceRow, RelationshipDto, UnionDto},
    utils::{build_normalized_person_fields, parse_optional_date, parse_tree_id},
    AppState,
};

pub const PERSON_SELECT_SQL: &str = r#"
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
        END AS birth_place_formatted,
        p.death_date,
        p.death_place_id,
        CASE WHEN dp.id IS NULL THEN NULL
             ELSE NULLIF(concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country), '')
        END AS death_place_formatted,
        p.professions,
        p.notes,
        p.nickname,
        p.title,
        p.baptism_date,
        p.baptism_place,
        p.burial_date,
        p.burial_place,
        p.death_cause,
        p.religion,
        p.physical_description,
        p.nationality,
        p.education,
        p.residences,
        p.military_regiment,
        p.military_serial,
        p.nobility_coat_of_arms,
        p.signature_status,
        p.birth_republican,
        p.death_republican,
        p.has_profile_photo,
        p.is_root_default,
        p.created_at,
        p.updated_at
    FROM persons p
    LEFT JOIN places bp ON bp.id = p.birth_place_id
    LEFT JOIN places dp ON dp.id = p.death_place_id
"#;

pub async fn find_or_create_place_id<'e, E>(
    executor: E,
    pool_fallback: &sqlx::PgPool,
    raw_place: Option<&str>,
) -> AppResult<Option<Uuid>>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    let raw = match raw_place.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(v) => v,
        None => return Ok(None),
    };

    let parts: Vec<&str> = raw
        .split(',')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return Ok(None);
    }

    let name = parts[0].to_string();
    let subdivision = if parts.len() >= 4 {
        Some(parts[1].to_string())
    } else {
        None
    };
    let region = if parts.len() == 3 {
        Some(parts[1].to_string())
    } else if parts.len() >= 4 {
        Some(parts[2..parts.len() - 1].join(", "))
    } else {
        None
    };
    let country = if parts.len() >= 2 {
        Some(parts[parts.len() - 1].to_string())
    } else {
        None
    };

    let existing: Option<(Uuid,)> = sqlx::query_as(
        r#"
        SELECT id FROM places
        WHERE name = $1
          AND subdivision IS NOT DISTINCT FROM $2
          AND region IS NOT DISTINCT FROM $3
          AND country IS NOT DISTINCT FROM $4
        LIMIT 1
        "#,
    )
    .bind(&name)
    .bind(&subdivision)
    .bind(&region)
    .bind(&country)
    .fetch_optional(executor)
    .await?;

    if let Some((id,)) = existing {
        return Ok(Some(id));
    }

    let coords = crate::audit_map::infer_coordinates(
        &name,
        region.as_deref(),
        country.as_deref(),
    );

    let created: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO places (name, subdivision, region, country, latitude, longitude)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(&name)
    .bind(&subdivision)
    .bind(&region)
    .bind(&country)
    .bind(coords.map(|(lat, _)| lat))
    .bind(coords.map(|(_, lng)| lng))
    .fetch_one(pool_fallback)
    .await?;

    Ok(Some(created.0))
}

pub async fn ensure_tree_exists(pool: &sqlx::PgPool, tree_id: Uuid) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO trees (id, title, description)
        VALUES ($1, 'Arbre Généalogique', 'Arbre créé automatiquement')
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(tree_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn ensure_root_default_exists(pool: &sqlx::PgPool, tree_id: Uuid) -> AppResult<Option<Uuid>> {
    let existing: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM persons WHERE tree_id = $1 AND is_root_default = true LIMIT 1",
    )
    .bind(tree_id)
    .fetch_optional(pool)
    .await?;

    if let Some((id,)) = existing {
        return Ok(Some(id));
    }

    let first: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM persons WHERE tree_id = $1 ORDER BY created_at ASC LIMIT 1",
    )
    .bind(tree_id)
    .fetch_optional(pool)
    .await?;

    if let Some((id,)) = first {
        sqlx::query("UPDATE persons SET is_root_default = true WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        return Ok(Some(id));
    }

    Ok(None)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPersonsQuery {
    pub tree_id: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedPersonsResponse {
    pub data: Vec<PersonDto>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

pub async fn list_persons(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<ListPersonsQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    ensure_tree_exists(&state.pool, tree_id).await?;

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(25).clamp(1, 500);
    let offset = (page - 1) * limit;

    let sql = format!(
        "{} WHERE p.tree_id = $1 ORDER BY p.updated_at DESC, p.given_names ASC LIMIT $2 OFFSET $3",
        PERSON_SELECT_SQL
    );

    let rows = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(tree_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?;

    let (total,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM persons WHERE tree_id = $1")
            .bind(tree_id)
            .fetch_one(&state.pool)
            .await?;

    let total_pages = ((total as f64) / (limit as f64)).ceil() as i64;

    Ok(ApiSuccess::new(PaginatedPersonsResponse {
        data: rows.into_iter().map(|r| r.into_dto(None)).collect(),
        total,
        page,
        limit,
        total_pages,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeIdQuery {
    pub tree_id: Option<String>,
}

pub async fn get_root_person(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<TreeIdQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    ensure_tree_exists(&state.pool, tree_id).await?;

    let root_id = ensure_root_default_exists(&state.pool, tree_id).await?;
    let Some(root_id) = root_id else {
        return Ok(ApiSuccess::new(Option::<PersonDto>::None));
    };

    let sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let row = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(root_id)
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?;

    Ok(ApiSuccess::new(row.map(|r| r.into_dto(Some(1)))))
}

pub async fn get_person_by_id(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<TreeIdQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    let sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let row = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(id)
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Person {} not found", id)))?;

    Ok(ApiSuccess::new(row.into_dto(None)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrUpdatePersonPayload {
    pub tree_id: Option<String>,
    pub given_names: Option<String>,
    pub usage_surname: Option<String>,
    pub birth_surname: Option<String>,
    pub nickname: Option<String>,
    pub title: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
    pub birth_place: Option<String>,
    pub baptism_date: Option<String>,
    pub baptism_place: Option<String>,
    pub death_date: Option<String>,
    pub death_place: Option<String>,
    pub burial_date: Option<String>,
    pub burial_place: Option<String>,
    pub death_cause: Option<String>,
    pub religion: Option<String>,
    pub physical_description: Option<String>,
    pub nationality: Option<String>,
    pub education: Option<String>,
    pub military_regiment: Option<String>,
    pub military_serial: Option<String>,
    pub nobility_coat_of_arms: Option<String>,
    pub signature_status: Option<String>,
    pub birth_republican: Option<String>,
    pub death_republican: Option<String>,
    pub professions: Option<Vec<String>>,
    pub residences: Option<Vec<String>>,
    pub notes: Option<String>,
    pub is_root_default: Option<bool>,
}

pub async fn create_person(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(dto): Json<CreateOrUpdatePersonPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(dto.tree_id.as_deref())?;
    ensure_tree_exists(&state.pool, tree_id).await?;

    let given_names = dto
        .given_names
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("givenNames is required".to_string()))?
        .to_string();

    let birth_date = parse_optional_date(dto.birth_date.as_deref());
    let death_date = parse_optional_date(dto.death_date.as_deref());
    let baptism_date = parse_optional_date(dto.baptism_date.as_deref());
    let burial_date = parse_optional_date(dto.burial_date.as_deref());

    if let (Some(b), Some(d)) = (birth_date, death_date) {
        if d < b {
            return Err(AppError::BadRequest(
                "La date de décès ne peut pas précéder la date de naissance / Death date cannot precede birth date"
                    .to_string(),
            ));
        }
    }

    let birth_place_id = find_or_create_place_id(
        &state.pool,
        &state.pool,
        dto.birth_place.as_deref(),
    )
    .await?;
    let death_place_id = find_or_create_place_id(
        &state.pool,
        &state.pool,
        dto.death_place.as_deref(),
    )
    .await?;

    let norm = build_normalized_person_fields(
        &given_names,
        dto.usage_surname.as_deref(),
        dto.birth_surname.as_deref(),
        birth_date,
        death_date,
    );

    let is_root = dto.is_root_default.unwrap_or(false);
    if is_root {
        sqlx::query("UPDATE persons SET is_root_default = false WHERE tree_id = $1 AND is_root_default = true")
            .bind(tree_id)
            .execute(&state.pool)
            .await?;
    }

    let gender = dto
        .gender
        .as_deref()
        .unwrap_or("UNKNOWN")
        .trim()
        .to_uppercase();

    let (new_id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO persons (
            tree_id, given_names, usage_surname, birth_surname, gender,
            birth_date, birth_place_id, death_date, death_place_id,
            professions, residences, notes, nickname, title,
            baptism_date, baptism_place, burial_date, burial_place,
            death_cause, religion, physical_description, nationality, education,
            military_regiment, military_serial, nobility_coat_of_arms, signature_status,
            birth_republican, death_republican,
            given_names_normalized, surname_normalized, primary_name_normalized,
            birth_year, death_year, is_root_default
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29,
            $30, $31, $32,
            $33, $34, $35
        )
        RETURNING id
        "#,
    )
    .bind(tree_id)
    .bind(&given_names)
    .bind(dto.usage_surname.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.birth_surname.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&gender)
    .bind(birth_date)
    .bind(birth_place_id)
    .bind(death_date)
    .bind(death_place_id)
    .bind(dto.professions.unwrap_or_default())
    .bind(dto.residences.unwrap_or_default())
    .bind(dto.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.nickname.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.title.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(baptism_date)
    .bind(dto.baptism_place.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(burial_date)
    .bind(dto.burial_place.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.death_cause.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.religion.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.physical_description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.nationality.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.education.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.military_regiment.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.military_serial.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.nobility_coat_of_arms.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.signature_status.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.birth_republican.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(dto.death_republican.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(norm.given_names_normalized)
    .bind(norm.surname_normalized)
    .bind(norm.primary_name_normalized)
    .bind(norm.birth_year)
    .bind(norm.death_year)
    .bind(is_root)
    .fetch_one(&state.pool)
    .await?;

    let _ = ensure_root_default_exists(&state.pool, tree_id).await?;

    let sql = format!("{} WHERE p.id = $1", PERSON_SELECT_SQL);
    let row = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(new_id)
        .fetch_one(&state.pool)
        .await?;

    let created_dto = row.into_dto(None);
    let label = format!(
        "{} {}",
        created_dto.given_names,
        created_dto
            .usage_surname
            .as_deref()
            .or(created_dto.birth_surname.as_deref())
            .unwrap_or("")
    )
    .trim()
    .to_string();
    crate::audit_map::record_audit_log(
        &state.pool,
        tree_id,
        &user,
        "CREATE_PERSON",
        "PERSON",
        Some(new_id),
        Some(&label),
        None,
        serde_json::to_value(&created_dto).ok(),
    )
    .await;

    Ok(ApiSuccess::new(created_dto))
}

pub async fn update_person(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<TreeIdQuery>,
    Json(dto): Json<CreateOrUpdatePersonPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref().or(dto.tree_id.as_deref()))?;
    let select_sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let existing = sqlx::query_as::<_, PersonWithPlaceRow>(&select_sql)
        .bind(id)
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Person {} not found", id)))?;
    let before_dto = existing.clone().into_dto(None);

    let next_given = dto
        .given_names
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or(existing.given_names);

    let next_usage = match dto.usage_surname {
        Some(ref s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.usage_surname,
    };

    let next_birth_surname = match dto.birth_surname {
        Some(ref s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.birth_surname,
    };

    let next_gender = dto
        .gender
        .as_deref()
        .map(|g| g.trim().to_uppercase())
        .unwrap_or(existing.gender);

    let next_birth_date = match dto.birth_date {
        Some(ref d) => parse_optional_date(Some(d)),
        None => existing.birth_date,
    };

    let next_death_date = match dto.death_date {
        Some(ref d) => parse_optional_date(Some(d)),
        None => existing.death_date,
    };

    if let (Some(b), Some(d)) = (next_birth_date, next_death_date) {
        if d < b {
            return Err(AppError::BadRequest(
                "La date de décès ne peut pas précéder la date de naissance / Death date cannot precede birth date"
                    .to_string(),
            ));
        }
    }

    let next_birth_place_id = match dto.birth_place {
        Some(ref p) => find_or_create_place_id(&state.pool, &state.pool, Some(p)).await?,
        None => existing.birth_place_id,
    };

    let next_death_place_id = match dto.death_place {
        Some(ref p) => find_or_create_place_id(&state.pool, &state.pool, Some(p)).await?,
        None => existing.death_place_id,
    };

    let next_professions = dto.professions.unwrap_or(existing.professions);
    let next_residences = dto.residences.unwrap_or(existing.residences);

    let next_notes = match dto.notes {
        Some(ref n) => {
            let t = n.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.notes,
    };

    let next_nickname = match dto.nickname {
        Some(ref n) => {
            let t = n.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.nickname,
    };

    let next_title = match dto.title {
        Some(ref n) => {
            let t = n.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.title,
    };

    let next_baptism_date = match dto.baptism_date {
        Some(ref d) => parse_optional_date(Some(d)),
        None => existing.baptism_date,
    };

    let next_baptism_place = match dto.baptism_place {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.baptism_place,
    };

    let next_burial_date = match dto.burial_date {
        Some(ref d) => parse_optional_date(Some(d)),
        None => existing.burial_date,
    };

    let next_burial_place = match dto.burial_place {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.burial_place,
    };

    let next_death_cause = match dto.death_cause {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.death_cause,
    };

    let next_religion = match dto.religion {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.religion,
    };

    let next_physical = match dto.physical_description {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.physical_description,
    };

    let next_nationality = match dto.nationality {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.nationality,
    };

    let next_education = match dto.education {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.education,
    };

    let next_military_regiment = match dto.military_regiment {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.military_regiment,
    };

    let next_military_serial = match dto.military_serial {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.military_serial,
    };

    let next_nobility = match dto.nobility_coat_of_arms {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.nobility_coat_of_arms,
    };

    let next_signature = match dto.signature_status {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.signature_status,
    };

    let next_birth_republican = match dto.birth_republican {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.birth_republican,
    };

    let next_death_republican = match dto.death_republican {
        Some(ref p) => {
            let t = p.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => existing.death_republican,
    };

    let next_root = dto.is_root_default.unwrap_or(existing.is_root_default);
    if next_root && !existing.is_root_default {
        sqlx::query(
            "UPDATE persons SET is_root_default = false WHERE tree_id = $1 AND id != $2 AND is_root_default = true",
        )
        .bind(tree_id)
        .bind(id)
        .execute(&state.pool)
        .await?;
    }

    let norm = build_normalized_person_fields(
        &next_given,
        next_usage.as_deref(),
        next_birth_surname.as_deref(),
        next_birth_date,
        next_death_date,
    );

    sqlx::query(
        r#"
        UPDATE persons SET
            given_names = $1,
            usage_surname = $2,
            birth_surname = $3,
            gender = $4,
            birth_date = $5,
            birth_place_id = $6,
            death_date = $7,
            death_place_id = $8,
            professions = $9,
            residences = $10,
            notes = $11,
            nickname = $12,
            title = $13,
            baptism_date = $14,
            baptism_place = $15,
            burial_date = $16,
            burial_place = $17,
            death_cause = $18,
            religion = $19,
            physical_description = $20,
            nationality = $21,
            education = $22,
            military_regiment = $23,
            military_serial = $24,
            nobility_coat_of_arms = $25,
            signature_status = $26,
            birth_republican = $27,
            death_republican = $28,
            given_names_normalized = $29,
            surname_normalized = $30,
            primary_name_normalized = $31,
            birth_year = $32,
            death_year = $33,
            is_root_default = $34,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $35 AND tree_id = $36
        "#,
    )
    .bind(&next_given)
    .bind(&next_usage)
    .bind(&next_birth_surname)
    .bind(&next_gender)
    .bind(next_birth_date)
    .bind(next_birth_place_id)
    .bind(next_death_date)
    .bind(next_death_place_id)
    .bind(&next_professions)
    .bind(&next_residences)
    .bind(&next_notes)
    .bind(&next_nickname)
    .bind(&next_title)
    .bind(next_baptism_date)
    .bind(&next_baptism_place)
    .bind(next_burial_date)
    .bind(&next_burial_place)
    .bind(&next_death_cause)
    .bind(&next_religion)
    .bind(&next_physical)
    .bind(&next_nationality)
    .bind(&next_education)
    .bind(&next_military_regiment)
    .bind(&next_military_serial)
    .bind(&next_nobility)
    .bind(&next_signature)
    .bind(&next_birth_republican)
    .bind(&next_death_republican)
    .bind(norm.given_names_normalized)
    .bind(norm.surname_normalized)
    .bind(norm.primary_name_normalized)
    .bind(norm.birth_year)
    .bind(norm.death_year)
    .bind(next_root)
    .bind(id)
    .bind(tree_id)
    .execute(&state.pool)
    .await?;

    let updated = sqlx::query_as::<_, PersonWithPlaceRow>(&select_sql)
        .bind(id)
        .bind(tree_id)
        .fetch_one(&state.pool)
        .await?;

    let updated_dto = updated.into_dto(None);
    let label = format!(
        "{} {}",
        updated_dto.given_names,
        updated_dto
            .usage_surname
            .as_deref()
            .or(updated_dto.birth_surname.as_deref())
            .unwrap_or("")
    )
    .trim()
    .to_string();
    crate::audit_map::record_audit_log(
        &state.pool,
        tree_id,
        &user,
        "UPDATE_PERSON",
        "PERSON",
        Some(id),
        Some(&label),
        serde_json::to_value(&before_dto).ok(),
        serde_json::to_value(&updated_dto).ok(),
    )
    .await;

    Ok(ApiSuccess::new(updated_dto))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelativePersonInput {
    pub given_names: String,
    pub usage_surname: Option<String>,
    pub birth_date: Option<String>,
    pub birth_place: Option<String>,
    pub gender: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelativePayload {
    pub link_type: String, // FATHER, MOTHER, SPOUSE, CHILD
    pub person: RelativePersonInput,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelativeResponse {
    pub link_type: String,
    pub anchor_person_id: Uuid,
    pub created_person: PersonDto,
    pub relationship: Option<RelationshipDto>,
    pub union: Option<UnionDto>,
}

pub async fn create_relative(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(anchor_id): Path<Uuid>,
    Query(query): Query<TreeIdQuery>,
    Json(dto): Json<CreateRelativePayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let select_sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let _anchor = sqlx::query_as::<_, PersonWithPlaceRow>(&select_sql)
        .bind(anchor_id)
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Anchor person not found".to_string()))?;

    let given_names = dto.person.given_names.trim();
    if given_names.is_empty() {
        return Err(AppError::BadRequest(
            "Le prénom du proche est obligatoire / Relative given name is required".to_string(),
        ));
    }

    let link_type = dto.link_type.trim().to_uppercase();
    let gender = match link_type.as_str() {
        "FATHER" => "MALE".to_string(),
        "MOTHER" => "FEMALE".to_string(),
        _ => dto
            .person
            .gender
            .as_deref()
            .unwrap_or("UNKNOWN")
            .trim()
            .to_uppercase(),
    };

    let usage_surname = dto
        .person
        .usage_surname
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let birth_date = parse_optional_date(dto.person.birth_date.as_deref());
    let birth_place_id = find_or_create_place_id(
        &state.pool,
        &state.pool,
        dto.person.birth_place.as_deref(),
    )
    .await?;

    let norm = build_normalized_person_fields(
        given_names,
        usage_surname,
        usage_surname,
        birth_date,
        None,
    );

    let (created_id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO persons (
            tree_id, given_names, usage_surname, birth_surname, gender,
            birth_date, birth_place_id,
            given_names_normalized, surname_normalized, primary_name_normalized, birth_year
        )
        VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        "#,
    )
    .bind(tree_id)
    .bind(given_names)
    .bind(usage_surname)
    .bind(&gender)
    .bind(birth_date)
    .bind(birth_place_id)
    .bind(norm.given_names_normalized)
    .bind(norm.surname_normalized)
    .bind(norm.primary_name_normalized)
    .bind(norm.birth_year)
    .fetch_one(&state.pool)
    .await?;

    let mut relationship: Option<RelationshipDto> = None;
    let mut union_dto: Option<UnionDto> = None;

    match link_type.as_str() {
        "FATHER" | "MOTHER" => {
            let rel = sqlx::query_as::<_, RelationshipDto>(
                r#"
                INSERT INTO relationships (tree_id, parent_id, child_id, type)
                VALUES ($1, $2, $3, 'BIOLOGICAL')
                ON CONFLICT (parent_id, child_id) DO UPDATE SET type = EXCLUDED.type
                RETURNING id, parent_id, child_id, type::text AS rel_type, created_at
                "#,
            )
            .bind(tree_id)
            .bind(created_id)
            .bind(anchor_id)
            .fetch_one(&state.pool)
            .await?;
            relationship = Some(rel);
        }
        "CHILD" => {
            let rel = sqlx::query_as::<_, RelationshipDto>(
                r#"
                INSERT INTO relationships (tree_id, parent_id, child_id, type)
                VALUES ($1, $2, $3, 'BIOLOGICAL')
                ON CONFLICT (parent_id, child_id) DO UPDATE SET type = EXCLUDED.type
                RETURNING id, parent_id, child_id, type::text AS rel_type, created_at
                "#,
            )
            .bind(tree_id)
            .bind(anchor_id)
            .bind(created_id)
            .fetch_one(&state.pool)
            .await?;
            relationship = Some(rel);
        }
        "SPOUSE" => {
            let u = sqlx::query_as::<_, UnionDto>(
                r#"
                INSERT INTO unions (tree_id, partner1_id, partner2_id, type)
                VALUES ($1, $2, $3, 'MARRIAGE')
                RETURNING id, tree_id, partner1_id, partner2_id, type::text AS union_type,
                          start_date, start_place, end_date, end_reason::text AS end_reason, notes, created_at, updated_at
                "#,
            )
            .bind(tree_id)
            .bind(anchor_id)
            .bind(created_id)
            .fetch_one(&state.pool)
            .await?;
            union_dto = Some(u);
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "Invalid linkType: {}",
                link_type
            )))
        }
    }

    let created_row = sqlx::query_as::<_, PersonWithPlaceRow>(&format!(
        "{} WHERE p.id = $1",
        PERSON_SELECT_SQL
    ))
    .bind(created_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(CreateRelativeResponse {
        link_type,
        anchor_person_id: anchor_id,
        created_person: created_row.into_dto(None),
        relationship,
        union: union_dto,
    }))
}

pub async fn delete_person(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<TreeIdQuery>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let select_sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let existing = sqlx::query_as::<_, PersonWithPlaceRow>(&select_sql)
        .bind(id)
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?;

    let res = sqlx::query("DELETE FROM persons WHERE id = $1 AND tree_id = $2")
        .bind(id)
        .bind(tree_id)
        .execute(&state.pool)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Person {} not found", id)));
    }

    if let Some(ex) = existing {
        let dto = ex.into_dto(None);
        let label = format!(
            "{} {}",
            dto.given_names,
            dto.usage_surname.as_deref().or(dto.birth_surname.as_deref()).unwrap_or("")
        )
        .trim()
        .to_string();
        crate::audit_map::record_audit_log(
            &state.pool,
            tree_id,
            &user,
            "DELETE_PERSON",
            "PERSON",
            Some(id),
            Some(&label),
            serde_json::to_value(&dto).ok(),
            None,
        )
        .await;
    }

    let _ = ensure_root_default_exists(&state.pool, tree_id).await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "deleted": true,
        "id": id
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBranchQuery {
    pub tree_id: Option<String>,
    pub include_root: Option<bool>,
    pub simulate: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchDeletePreviewDto {
    pub root_person_id: Uuid,
    pub include_root: bool,
    pub simulated: bool,
    pub persons_deleted: usize,
    pub relationships_deleted: i64,
    pub unions_deleted: i64,
    pub documents_deleted: i64,
    pub affected_person_ids: Vec<Uuid>,
}

pub async fn delete_branch(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<DeleteBranchQuery>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let include_root = query.include_root.unwrap_or(true);
    let simulate = query.simulate.unwrap_or(false);

    let descendants: Vec<(Uuid,)> = sqlx::query_as(
        r#"
        WITH RECURSIVE descendants AS (
            SELECT p.id
            FROM persons p
            INNER JOIN relationships r ON r.child_id = p.id
            WHERE r.parent_id = $1 AND p.tree_id = $2
            UNION
            SELECT p.id
            FROM persons p
            INNER JOIN relationships r ON r.child_id = p.id
            INNER JOIN descendants d ON r.parent_id = d.id
            WHERE p.tree_id = $2
        )
        SELECT id FROM descendants
        "#,
    )
    .bind(id)
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    let mut target_ids: Vec<Uuid> = descendants.into_iter().map(|(uid,)| uid).collect();
    if include_root && !target_ids.contains(&id) {
        target_ids.insert(0, id);
    }

    if target_ids.is_empty() {
        return Ok(ApiSuccess::new(BranchDeletePreviewDto {
            root_person_id: id,
            include_root,
            simulated: simulate,
            persons_deleted: 0,
            relationships_deleted: 0,
            unions_deleted: 0,
            documents_deleted: 0,
            affected_person_ids: vec![],
        }));
    }

    let (rels_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM relationships WHERE parent_id = ANY($1) OR child_id = ANY($1)",
    )
    .bind(&target_ids)
    .fetch_one(&state.pool)
    .await?;

    let (unions_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM unions WHERE tree_id = $1 AND (partner1_id = ANY($2) OR partner2_id = ANY($2))",
    )
    .bind(tree_id)
    .bind(&target_ids)
    .fetch_one(&state.pool)
    .await?;

    let (docs_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM documents WHERE person_id = ANY($1)",
    )
    .bind(&target_ids)
    .fetch_one(&state.pool)
    .await?;

    if !simulate {
        sqlx::query("DELETE FROM documents WHERE person_id = ANY($1)")
            .bind(&target_ids)
            .execute(&state.pool)
            .await?;

        sqlx::query("DELETE FROM persons WHERE tree_id = $1 AND id = ANY($2)")
            .bind(tree_id)
            .bind(&target_ids)
            .execute(&state.pool)
            .await?;

        let _ = ensure_root_default_exists(&state.pool, tree_id).await?;
    }

    Ok(ApiSuccess::new(BranchDeletePreviewDto {
        root_person_id: id,
        include_root,
        simulated: simulate,
        persons_deleted: target_ids.len(),
        relationships_deleted: rels_count,
        unions_deleted: unions_count,
        documents_deleted: docs_count,
        affected_person_ids: target_ids,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAllQuery {
    pub tree_id: Option<String>,
    pub confirm: Option<String>,
}

pub async fn delete_all_persons(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Query(query): Query<DeleteAllQuery>,
) -> AppResult<impl IntoResponse> {
    user.require_admin()?;

    if query.confirm.as_deref() != Some("DELETE_ALL") {
        return Err(AppError::BadRequest(
            "Confirmation parameter confirm=DELETE_ALL is required".to_string(),
        ));
    }

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let res = sqlx::query("DELETE FROM persons WHERE tree_id = $1")
        .bind(tree_id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "personsDeleted": res.rows_affected()
    })))
}

// ─── Relationships & Unions CRUD ───────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelationshipPayload {
    pub parent_id: Uuid,
    pub child_id: Uuid,
    #[serde(rename = "type")]
    pub rel_type: Option<String>,
}

pub async fn create_relationship(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(dto): Json<CreateRelationshipPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    if dto.parent_id == dto.child_id {
        return Err(AppError::BadRequest(
            "A person cannot be their own parent".to_string(),
        ));
    }

    let rel_type = dto.rel_type.as_deref().unwrap_or("BIOLOGICAL").to_uppercase();
    let rel = sqlx::query_as::<_, RelationshipDto>(
        r#"
        INSERT INTO relationships (parent_id, child_id, type)
        VALUES ($1, $2, $3)
        ON CONFLICT (parent_id, child_id) DO UPDATE SET type = EXCLUDED.type
        RETURNING id, parent_id, child_id, type::text AS rel_type, created_at
        "#,
    )
    .bind(dto.parent_id)
    .bind(dto.child_id)
    .bind(rel_type)
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(rel))
}

pub async fn delete_relationship(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    sqlx::query("DELETE FROM relationships WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnionPayload {
    pub tree_id: Option<String>,
    pub partner1_id: Uuid,
    pub partner2_id: Uuid,
    #[serde(rename = "type")]
    pub union_type: Option<String>,
    pub start_date: Option<String>,
    pub start_place: Option<String>,
    pub end_date: Option<String>,
    pub end_reason: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_union(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(dto): Json<CreateUnionPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    if dto.partner1_id == dto.partner2_id {
        return Err(AppError::BadRequest(
            "Partner 1 and Partner 2 must be distinct".to_string(),
        ));
    }

    let tree_id = parse_tree_id(dto.tree_id.as_deref())?;
    let union_type = dto.union_type.as_deref().unwrap_or("MARRIAGE").to_uppercase();
    let start_date = parse_optional_date(dto.start_date.as_deref());
    let end_date = parse_optional_date(dto.end_date.as_deref());

    let u = sqlx::query_as::<_, UnionDto>(
        r#"
        INSERT INTO unions (tree_id, partner1_id, partner2_id, type, start_date, start_place, end_date, end_reason, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, tree_id, partner1_id, partner2_id, type::text AS union_type,
                  start_date, start_place, end_date, end_reason::text AS end_reason, notes, created_at, updated_at
        "#,
    )
    .bind(tree_id)
    .bind(dto.partner1_id)
    .bind(dto.partner2_id)
    .bind(union_type)
    .bind(start_date)
    .bind(dto.start_place)
    .bind(end_date)
    .bind(dto.end_reason)
    .bind(dto.notes)
    .fetch_one(&state.pool)
    .await?;

    Ok(ApiSuccess::new(u))
}

pub async fn delete_union(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    sqlx::query("DELETE FROM unions WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({ "deleted": true })))
}

// ─── Connectivity Snapshot Helper ──────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivitySnapshot {
    pub total_persons: usize,
    pub connected_components: usize,
    pub disconnected_components: usize,
    pub isolated_persons: usize,
    pub main_component_size: usize,
}

pub async fn get_connectivity_snapshot(
    pool: &sqlx::PgPool,
    tree_id: Uuid,
) -> AppResult<ConnectivitySnapshot> {
    let persons: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM persons WHERE tree_id = $1")
            .bind(tree_id)
            .fetch_all(pool)
            .await?;

    if persons.is_empty() {
        return Ok(ConnectivitySnapshot {
            total_persons: 0,
            connected_components: 0,
            disconnected_components: 0,
            isolated_persons: 0,
            main_component_size: 0,
        });
    }

    let person_set: HashSet<Uuid> = persons.iter().map(|(id,)| *id).collect();
    let mut adj: HashMap<Uuid, Vec<Uuid>> = HashMap::with_capacity(person_set.len());
    for id in &person_set {
        adj.insert(*id, Vec::new());
    }

    let rels: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT parent_id, child_id FROM relationships WHERE tree_id = $1",
    )
    .bind(tree_id)
    .fetch_all(pool)
    .await?;

    for (p, c) in rels {
        if person_set.contains(&p) && person_set.contains(&c) {
            adj.entry(p).or_default().push(c);
            adj.entry(c).or_default().push(p);
        }
    }

    let unions: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT partner1_id, partner2_id FROM unions WHERE tree_id = $1",
    )
    .bind(tree_id)
    .fetch_all(pool)
    .await?;

    for (u1, u2) in unions {
        if person_set.contains(&u1) && person_set.contains(&u2) {
            adj.entry(u1).or_default().push(u2);
            adj.entry(u2).or_default().push(u1);
        }
    }

    let mut visited = HashSet::new();
    let mut component_sizes = Vec::new();
    let mut isolated_persons = 0usize;

    for &id in &person_set {
        if visited.contains(&id) {
            continue;
        }
        let mut size = 0usize;
        let mut q = VecDeque::new();
        q.push_back(id);
        visited.insert(id);

        while let Some(curr) = q.pop_front() {
            size += 1;
            if let Some(neighbors) = adj.get(&curr) {
                for &n in neighbors {
                    if visited.insert(n) {
                        q.push_back(n);
                    }
                }
            }
        }

        if size == 1 {
            isolated_persons += 1;
        }
        component_sizes.push(size);
    }

    component_sizes.sort_unstable_by(|a, b| b.cmp(a));
    let connected_components = component_sizes.len();
    let main_component_size = component_sizes.first().copied().unwrap_or(0);
    let disconnected_components = connected_components.saturating_sub(1);

    Ok(ConnectivitySnapshot {
        total_persons: person_set.len(),
        connected_components,
        disconnected_components,
        isolated_persons,
        main_component_size,
    })
}
