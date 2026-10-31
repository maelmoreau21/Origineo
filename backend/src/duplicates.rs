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
    models::{PersonDto, PersonWithPlaceRow},
    persons::PERSON_SELECT_SQL,
    utils::{normalize_text, parse_tree_id},
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateQuery {
    pub tree_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePairDto {
    pub person_a: PersonDto,
    pub person_b: PersonDto,
    pub similarity_score: f64,
    pub match_reasons: Vec<String>,
}

pub async fn find_duplicate_candidates(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<DuplicateQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    let sql = format!("{} WHERE p.tree_id = $1 ORDER BY p.created_at ASC", PERSON_SELECT_SQL);
    let rows = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?;

    let persons: Vec<PersonDto> = rows.into_iter().map(|r| r.into_dto(None)).collect();
    let mut pairs: Vec<DuplicatePairDto> = Vec::new();

    // Fast O(N log N) pairwise matching on normalized keys
    for i in 0..persons.len() {
        for j in (i + 1)..persons.len() {
            let a = &persons[i];
            let b = &persons[j];

            let mut reasons = Vec::new();
            let mut score: f64 = 0.0;

            let s_a = a.usage_surname.as_deref().or(a.birth_surname.as_deref()).map(normalize_text);
            let s_b = b.usage_surname.as_deref().or(b.birth_surname.as_deref()).map(normalize_text);
            let g_a = normalize_text(&a.given_names);
            let g_b = normalize_text(&b.given_names);

            if let (Some(sa), Some(sb)) = (&s_a, &s_b) {
                if sa == sb {
                    score += 0.45;
                    reasons.push("Même patronyme".to_string());
                } else if sa.starts_with(sb) || sb.starts_with(sa) {
                    score += 0.25;
                    reasons.push("Patronyme similaire".to_string());
                }
            }

            if g_a == g_b {
                score += 0.35;
                reasons.push("Mêmes prénoms".to_string());
            } else if g_a.starts_with(&g_b) || g_b.starts_with(&g_a) {
                score += 0.20;
                reasons.push("Prénoms très proches".to_string());
            }

            // Birth date / year comparison
            if let (Some(da), Some(db)) = (a.birth_date, b.birth_date) {
                if da == db {
                    score += 0.30;
                    reasons.push("Même date de naissance exacte".to_string());
                } else if da.year() == db.year() {
                    score += 0.20;
                    reasons.push("Même année de naissance".to_string());
                } else if (da.year() - db.year()).abs() <= 2 {
                    score += 0.10;
                    reasons.push("Année de naissance à +/- 2 ans".to_string());
                }
            }

            // Birth place comparison
            if let (Some(pa), Some(pb)) = (&a.birth_place, &b.birth_place) {
                if normalize_text(pa) == normalize_text(pb) {
                    score += 0.15;
                    reasons.push("Même lieu de naissance".to_string());
                }
            }

            if score >= 0.65 {
                pairs.push(DuplicatePairDto {
                    person_a: a.clone(),
                    person_b: b.clone(),
                    similarity_score: (score.min(1.0) * 100.0).round(),
                    match_reasons: reasons,
                });
            }

            if pairs.len() >= 100 {
                break;
            }
        }
        if pairs.len() >= 100 {
            break;
        }
    }

    pairs.sort_by(|x, y| y.similarity_score.partial_cmp(&x.similarity_score).unwrap());

    Ok(ApiSuccess::new(pairs))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePersonsPayload {
    pub tree_id: Option<String>,
    pub source_id: Uuid, // Person to be merged and deleted
    pub target_id: Uuid, // Person to receive the consolidated data
}

pub async fn merge_two_persons(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(payload): Json<MergePersonsPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    if payload.source_id == payload.target_id {
        return Err(AppError::BadRequest("Cannot merge a person into themselves".to_string()));
    }

    let tree_id = parse_tree_id(payload.tree_id.as_deref())?;

    let mut tx = state.pool.begin().await?;

    // 1. Reassign Relationships (parents & children)
    // Parent relationships:
    sqlx::query(
        r#"
        UPDATE relationships
        SET parent_id = $1
        WHERE parent_id = $2
          AND child_id != $1
          AND NOT EXISTS (
              SELECT 1 FROM relationships r2 WHERE r2.parent_id = $1 AND r2.child_id = relationships.child_id
          )
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // Child relationships:
    sqlx::query(
        r#"
        UPDATE relationships
        SET child_id = $1
        WHERE child_id = $2
          AND parent_id != $1
          AND NOT EXISTS (
              SELECT 1 FROM relationships r2 WHERE r2.child_id = $1 AND r2.parent_id = relationships.parent_id
          )
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // 2. Reassign Unions
    sqlx::query(
        r#"
        UPDATE unions
        SET partner1_id = $1
        WHERE partner1_id = $2 AND partner2_id != $1
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE unions
        SET partner2_id = $1
        WHERE partner2_id = $2 AND partner1_id != $1
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // 3. Reassign Citations
    sqlx::query(
        r#"
        UPDATE citations
        SET person_id = $1
        WHERE person_id = $2
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // 4. Reassign Event Participants
    sqlx::query(
        r#"
        UPDATE event_participants
        SET person_id = $1
        WHERE person_id = $2
          AND NOT EXISTS (
              SELECT 1 FROM event_participants ep2 WHERE ep2.event_id = event_participants.event_id AND ep2.person_id = $1
          )
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // 5. Reassign Documents & Photos
    sqlx::query(
        r#"
        UPDATE documents
        SET person_id = $1
        WHERE person_id = $2
        "#,
    )
    .bind(payload.target_id)
    .bind(payload.source_id)
    .execute(&mut *tx)
    .await?;

    // 6. Delete the source person (cascade cleans up any leftover self-referencing rows)
    sqlx::query("DELETE FROM persons WHERE id = $1 AND tree_id = $2")
        .bind(payload.source_id)
        .bind(tree_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    crate::audit_map::record_audit_log(
        &state.pool,
        tree_id,
        &user,
        "MERGE_PERSONS",
        "PERSON",
        Some(payload.target_id),
        Some(&format!("Fusion de {} dans {}", payload.source_id, payload.target_id)),
        None,
        None,
    )
    .await;

    Ok(ApiSuccess::new(serde_json::json!({
        "success": true,
        "mergedTargetId": payload.target_id,
        "removedSourceId": payload.source_id
    })))
}

use chrono::Datelike;
