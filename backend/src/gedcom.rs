use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::{Multipart, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Datelike;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    models::{PersonDto, PersonWithPlaceRow, RelationshipDto, UnionDto},
    persons::{
        ensure_root_default_exists, ensure_tree_exists, find_or_create_place_id,
        get_connectivity_snapshot, ConnectivitySnapshot, PERSON_SELECT_SQL,
    },
    utils::{
        bigram_similarity, build_normalized_person_fields, format_gedcom_date, normalize_text,
        parse_gedcom_date, parse_tree_id,
    },
    AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedPerson {
    pub pointer: String,
    pub given_names: String,
    pub surname: String,
    pub gender: String,
    pub birth_date: Option<String>,
    pub birth_place: Option<String>,
    pub death_date: Option<String>,
    pub death_place: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedFamily {
    pub pointer: String,
    pub husband_pointer: Option<String>,
    pub wife_pointer: Option<String>,
    pub child_pointers: Vec<String>,
    pub marriage_date: Option<String>,
    pub marriage_place: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlternativeMatchDto {
    pub existing_person_id: Uuid,
    pub confidence: i32,
    pub match_reasons: Vec<String>,
    pub existing_person: PersonDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCandidate {
    pub staged_pointer: String,
    pub staged: StagedPerson,
    pub existing_person_id: Uuid,
    pub existing_person: PersonDto,
    pub confidence: i32,
    pub match_reasons: Vec<String>,
    pub candidates: Vec<AlternativeMatchDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeAnalysis {
    pub tree_id: Uuid,
    pub session_id: String,
    pub total_persons_in_file: usize,
    pub total_families_in_file: usize,
    pub duplicates: Vec<DuplicateCandidate>,
    pub new_persons: Vec<StagedPerson>,
    pub staged_families: Vec<StagedFamily>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeDecision {
    pub staged_pointer: String,
    pub action: String, // "merge" | "create" | "skip"
    pub merge_into_person_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyMergePayload {
    pub session_id: String,
    pub decisions: Vec<MergeDecision>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityAlertDto {
    #[serde(rename = "type")]
    pub alert_type: String,
    pub message: String,
    pub before: ConnectivitySnapshot,
    pub after: ConnectivitySnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResultDto {
    pub persons_created: usize,
    pub persons_merged: usize,
    pub persons_skipped: usize,
    pub relationships_created: usize,
    pub unions_created: usize,
    pub integrity_alert: Option<IntegrityAlertDto>,
}

pub struct GedcomSessionStore {
    pub sessions: DashMap<String, (MergeAnalysis, Instant)>,
}

impl GedcomSessionStore {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }

    pub fn cleanup(&self) {
        let ttl = Duration::from_secs(30 * 60);
        self.sessions.retain(|_, (_, created)| created.elapsed() < ttl);
    }
}

// ─── Native Rust GEDCOM 5.5.1 Line Parser ──────────────────────────

pub fn parse_gedcom_content(content: &str) -> (Vec<StagedPerson>, Vec<StagedFamily>) {
    let mut persons = Vec::new();
    let mut families = Vec::new();

    enum RecordKind {
        None,
        Indi(StagedPerson),
        Fam(StagedFamily),
    }

    let mut current = RecordKind::None;
    let mut current_subtag = String::new();

    let flush_current = |rec: RecordKind,
                         persons: &mut Vec<StagedPerson>,
                         families: &mut Vec<StagedFamily>| {
        match rec {
            RecordKind::Indi(mut p) => {
                if p.given_names.trim().is_empty() {
                    p.given_names = "Inconnu".to_string();
                }
                persons.push(p);
            }
            RecordKind::Fam(f) => {
                families.push(f);
            }
            RecordKind::None => {}
        }
    };

    for raw_line in content.lines() {
        let line = raw_line.trim_matches(|c| c == '\r' || c == '\n' || c == '\u{feff}').trim();
        if line.is_empty() {
            continue;
        }

        let mut parts = line.splitn(3, ' ');
        let Some(level_str) = parts.next() else {
            continue;
        };
        let Ok(level) = level_str.parse::<u8>() else {
            continue;
        };
        let Some(second) = parts.next() else {
            continue;
        };
        let rest = parts.next().unwrap_or("").trim();

        if level == 0 {
            let prev = std::mem::replace(&mut current, RecordKind::None);
            flush_current(prev, &mut persons, &mut families);
            current_subtag.clear();

            if second.starts_with('@') && second.ends_with('@') {
                let pointer = second.to_string();
                let record_type = rest.split_whitespace().next().unwrap_or("").to_uppercase();
                if record_type == "INDI" {
                    current = RecordKind::Indi(StagedPerson {
                        pointer,
                        given_names: String::new(),
                        surname: String::new(),
                        gender: "UNKNOWN".to_string(),
                        birth_date: None,
                        birth_place: None,
                        death_date: None,
                        death_place: None,
                        notes: None,
                    });
                } else if record_type == "FAM" {
                    current = RecordKind::Fam(StagedFamily {
                        pointer,
                        husband_pointer: None,
                        wife_pointer: None,
                        child_pointers: Vec::new(),
                        marriage_date: None,
                        marriage_place: None,
                    });
                }
            }
            continue;
        }

        let tag = second.to_uppercase();

        match &mut current {
            RecordKind::Indi(p) => {
                if level == 1 {
                    current_subtag = tag.clone();
                    match tag.as_str() {
                        "NAME" => {
                            let (given, sur) = parse_gedcom_name(rest);
                            if p.given_names.is_empty() && !given.is_empty() {
                                p.given_names = given;
                            }
                            if p.surname.is_empty() && !sur.is_empty() {
                                p.surname = sur;
                            }
                        }
                        "SEX" => {
                            let s = rest.chars().next().unwrap_or('U').to_ascii_uppercase();
                            p.gender = match s {
                                'M' => "MALE".to_string(),
                                'F' => "FEMALE".to_string(),
                                _ => "UNKNOWN".to_string(),
                            };
                        }
                        "NOTE" => {
                            if !rest.is_empty() {
                                p.notes = Some(rest.to_string());
                            }
                        }
                        _ => {}
                    }
                } else if level == 2 {
                    match (current_subtag.as_str(), tag.as_str()) {
                        ("NAME", "GIVN") if !rest.is_empty() => {
                            p.given_names = rest.to_string();
                        }
                        ("NAME", "SURN") if !rest.is_empty() => {
                            p.surname = rest.to_string();
                        }
                        ("BIRT", "DATE") if !rest.is_empty() => {
                            p.birth_date = Some(rest.to_string());
                        }
                        ("BIRT", "PLAC") if !rest.is_empty() => {
                            p.birth_place = Some(rest.to_string());
                        }
                        ("DEAT", "DATE") if !rest.is_empty() => {
                            p.death_date = Some(rest.to_string());
                        }
                        ("DEAT", "PLAC") if !rest.is_empty() => {
                            p.death_place = Some(rest.to_string());
                        }
                        ("NOTE", "CONT") => {
                            if let Some(ref mut n) = p.notes {
                                n.push('\n');
                                n.push_str(rest);
                            }
                        }
                        ("NOTE", "CONC") => {
                            if let Some(ref mut n) = p.notes {
                                n.push_str(rest);
                            }
                        }
                        _ => {}
                    }
                }
            }
            RecordKind::Fam(f) => {
                if level == 1 {
                    current_subtag = tag.clone();
                    match tag.as_str() {
                        "HUSB" if !rest.is_empty() => {
                            f.husband_pointer = Some(rest.to_string());
                        }
                        "WIFE" if !rest.is_empty() => {
                            f.wife_pointer = Some(rest.to_string());
                        }
                        "CHIL" if !rest.is_empty() => {
                            f.child_pointers.push(rest.to_string());
                        }
                        _ => {}
                    }
                } else if level == 2 && current_subtag == "MARR" {
                    match tag.as_str() {
                        "DATE" if !rest.is_empty() => {
                            f.marriage_date = Some(rest.to_string());
                        }
                        "PLAC" if !rest.is_empty() => {
                            f.marriage_place = Some(rest.to_string());
                        }
                        _ => {}
                    }
                }
            }
            RecordKind::None => {}
        }
    }

    flush_current(current, &mut persons, &mut families);
    (persons, families)
}

fn parse_gedcom_name(raw: &str) -> (String, String) {
    if let Some(first_slash) = raw.find('/') {
        let given = raw[..first_slash].trim().to_string();
        let after = &raw[first_slash + 1..];
        let surname = if let Some(second_slash) = after.find('/') {
            after[..second_slash].trim().to_string()
        } else {
            after.trim().to_string()
        };
        (given, surname)
    } else {
        (raw.trim().to_string(), String::new())
    }
}

async fn extract_gedcom_text(mut multipart: Multipart) -> AppResult<(String, String)> {
    let mut filename = "import.ged".to_string();
    let mut bytes_opt: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        if let Some(fname) = field.file_name() {
            filename = fname.to_string();
        }
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Failed reading GEDCOM file: {}", e)))?;
        bytes_opt = Some(data.to_vec());
        break;
    }

    let bytes = bytes_opt.ok_or_else(|| AppError::BadRequest("No GEDCOM file uploaded".to_string()))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok((filename, text))
}

// ─── Route Handlers ────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GedcomTreeQuery {
    pub tree_id: Option<String>,
}

/// Direct full GEDCOM import (Admin only)
pub async fn import_gedcom(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Query(query): Query<GedcomTreeQuery>,
    multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    user.require_admin()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    ensure_tree_exists(&state.pool, tree_id).await?;

    let (_filename, content) = extract_gedcom_text(multipart).await?;
    let (staged_persons, staged_families) = parse_gedcom_content(&content);

    let before_conn = get_connectivity_snapshot(&state.pool, tree_id).await?;

    let mut pointer_to_uuid: HashMap<String, Uuid> = HashMap::with_capacity(staged_persons.len());
    let mut persons_created = 0usize;
    let mut unions_created = 0usize;
    let mut relationships_created = 0usize;

    for sp in &staged_persons {
        let birth_date = sp.birth_date.as_deref().and_then(parse_gedcom_date);
        let death_date = sp.death_date.as_deref().and_then(parse_gedcom_date);

        let birth_place_id = find_or_create_place_id(
            &state.pool,
            &state.pool,
            sp.birth_place.as_deref(),
        )
        .await?;
        let death_place_id = find_or_create_place_id(
            &state.pool,
            &state.pool,
            sp.death_place.as_deref(),
        )
        .await?;

        let surname_opt = if sp.surname.trim().is_empty() {
            None
        } else {
            Some(sp.surname.trim())
        };

        let norm = build_normalized_person_fields(
            &sp.given_names,
            surname_opt,
            surname_opt,
            birth_date,
            death_date,
        );

        let (pid,): (Uuid,) = sqlx::query_as(
            r#"
            INSERT INTO persons (
                tree_id, given_names, birth_surname, usage_surname, gender,
                birth_date, birth_place_id, death_date, death_place_id, notes,
                given_names_normalized, surname_normalized, primary_name_normalized,
                birth_year, death_year
            )
            VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
            "#,
        )
        .bind(tree_id)
        .bind(&sp.given_names)
        .bind(surname_opt)
        .bind(&sp.gender)
        .bind(birth_date)
        .bind(birth_place_id)
        .bind(death_date)
        .bind(death_place_id)
        .bind(sp.notes.as_deref())
        .bind(norm.given_names_normalized)
        .bind(norm.surname_normalized)
        .bind(norm.primary_name_normalized)
        .bind(norm.birth_year)
        .bind(norm.death_year)
        .fetch_one(&state.pool)
        .await?;

        pointer_to_uuid.insert(sp.pointer.clone(), pid);
        persons_created += 1;
    }

    let mut created_union_pairs: HashSet<(Uuid, Uuid)> = HashSet::new();

    for fam in &staged_families {
        let p1 = fam
            .husband_pointer
            .as_ref()
            .and_then(|ptr| pointer_to_uuid.get(ptr))
            .copied();
        let p2 = fam
            .wife_pointer
            .as_ref()
            .and_then(|ptr| pointer_to_uuid.get(ptr))
            .copied();

        if let (Some(u1), Some(u2)) = (p1, p2) {
            if u1 != u2 {
                let pair_key = if u1 < u2 { (u1, u2) } else { (u2, u1) };
                if created_union_pairs.insert(pair_key) {
                    let start_date = fam.marriage_date.as_deref().and_then(parse_gedcom_date);
                    sqlx::query(
                        r#"
                        INSERT INTO unions (tree_id, partner1_id, partner2_id, type, start_date, start_place)
                        VALUES ($1, $2, $3, 'MARRIAGE', $4, $5)
                        "#,
                    )
                    .bind(tree_id)
                    .bind(u1)
                    .bind(u2)
                    .bind(start_date)
                    .bind(fam.marriage_place.as_deref())
                    .execute(&state.pool)
                    .await?;
                    unions_created += 1;
                }
            }
        }

        let parent_ids: Vec<Uuid> = [p1, p2].into_iter().flatten().collect();
        if parent_ids.is_empty() {
            continue;
        }

        for child_ptr in &fam.child_pointers {
            if let Some(&child_id) = pointer_to_uuid.get(child_ptr) {
                for &parent_id in &parent_ids {
                    if parent_id != child_id {
                        let res = sqlx::query(
                            r#"
                            INSERT INTO relationships (tree_id, parent_id, child_id, type)
                            VALUES ($1, $2, $3, 'BIOLOGICAL')
                            ON CONFLICT (parent_id, child_id) DO NOTHING
                            "#,
                        )
                        .bind(tree_id)
                        .bind(parent_id)
                        .bind(child_id)
                        .execute(&state.pool)
                        .await?;
                        relationships_created += res.rows_affected() as usize;
                    }
                }
            }
        }
    }

    let _ = ensure_root_default_exists(&state.pool, tree_id).await?;
    let after_conn = get_connectivity_snapshot(&state.pool, tree_id).await?;

    let disc_delta = after_conn
        .disconnected_components
        .saturating_sub(before_conn.disconnected_components);
    let iso_delta = after_conn
        .isolated_persons
        .saturating_sub(before_conn.isolated_persons);

    let integrity_alert = if disc_delta > 0 || iso_delta > 0 {
        Some(IntegrityAlertDto {
            alert_type: "IMPORT_CONNECTIVITY_ALERT".to_string(),
            message: format!(
                "{} composant(s) déconnecté(s) et {} personne(s) isolée(s) détecté(s).",
                disc_delta, iso_delta
            ),
            before: before_conn,
            after: after_conn,
        })
    } else {
        None
    };

    crate::audit_map::record_audit_log(
        &state.pool,
        tree_id,
        &user,
        "IMPORT_GEDCOM",
        "GEDCOM",
        None,
        Some(&format!("{} personnes importées", persons_created)),
        None,
        None,
    )
    .await;

    Ok(ApiSuccess::new(serde_json::json!({
        "personsCreated": persons_created,
        "relationshipsCreated": relationships_created,
        "unionsCreated": unions_created,
        "integrityAlert": integrity_alert
    })))
}

/// Analyze GEDCOM file for selective import & duplicate merge (Admin only)
pub async fn analyze_merge_gedcom(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Query(query): Query<GedcomTreeQuery>,
    multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    user.require_admin()?;
    state.gedcom_sessions.cleanup();

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    ensure_tree_exists(&state.pool, tree_id).await?;

    let (_filename, content) = extract_gedcom_text(multipart).await?;
    let (staged_persons, staged_families) = parse_gedcom_content(&content);

    let sql = format!("{} WHERE p.tree_id = $1", PERSON_SELECT_SQL);
    let existing_rows = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?;
    let existing_persons: Vec<PersonDto> = existing_rows
        .into_iter()
        .map(|r| r.into_dto(None))
        .collect();

    // Million-Scale Bucket Index: group existing persons by 2-char surname prefix & given name prefix
    let mut bucket_index: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, ep) in existing_persons.iter().enumerate() {
        let s_norm = ep
            .usage_surname
            .as_deref()
            .or(ep.birth_surname.as_deref())
            .map(normalize_text)
            .unwrap_or_default();
        if s_norm.len() >= 2 {
            bucket_index
                .entry(format!("s:{}", &s_norm[..2]))
                .or_default()
                .push(idx);
        }
        let g_norm = normalize_text(&ep.given_names);
        if g_norm.len() >= 3 {
            bucket_index
                .entry(format!("g:{}", &g_norm[..3]))
                .or_default()
                .push(idx);
        }
    }

    let mut duplicates = Vec::new();
    let mut new_persons = Vec::new();

    for staged in &staged_persons {
        let mut candidate_indices: HashSet<usize> = HashSet::new();
        let s_norm = normalize_text(&staged.surname);
        if s_norm.len() >= 2 {
            if let Some(list) = bucket_index.get(&format!("s:{}", &s_norm[..2])) {
                for &i in list {
                    candidate_indices.insert(i);
                }
            }
        }
        let g_norm = normalize_text(&staged.given_names);
        if g_norm.len() >= 3 {
            if let Some(list) = bucket_index.get(&format!("g:{}", &g_norm[..3])) {
                for &i in list {
                    candidate_indices.insert(i);
                }
            }
        }

        let bucket_slice: Vec<PersonDto> = candidate_indices
            .into_iter()
            .filter_map(|i| existing_persons.get(i).cloned())
            .collect();

        let candidates = find_duplicate_candidates(staged, &bucket_slice);
        if let Some(best) = candidates.first() {
            duplicates.push(DuplicateCandidate {
                staged_pointer: staged.pointer.clone(),
                staged: staged.clone(),
                existing_person_id: best.existing_person_id,
                existing_person: best.existing_person.clone(),
                confidence: best.confidence,
                match_reasons: best.match_reasons.clone(),
                candidates,
            });
        } else {
            new_persons.push(staged.clone());
        }
    }

    let session_id = format!("merge_{}", Uuid::new_v4().simple());
    let analysis = MergeAnalysis {
        tree_id,
        session_id: session_id.clone(),
        total_persons_in_file: staged_persons.len(),
        total_families_in_file: staged_families.len(),
        duplicates,
        new_persons,
        staged_families,
    };

    state
        .gedcom_sessions
        .sessions
        .insert(session_id, (analysis.clone(), Instant::now()));

    Ok(ApiSuccess::new(analysis))
}

fn find_duplicate_candidates(
    staged: &StagedPerson,
    existing_persons: &[PersonDto],
) -> Vec<AlternativeMatchDto> {
    let mut matches = Vec::new();

    let s_given = normalize_text(&staged.given_names);
    let s_surname = normalize_text(&staged.surname);
    let s_birth = staged.birth_date.as_deref().and_then(parse_gedcom_date);
    let s_place = staged
        .birth_place
        .as_deref()
        .map(normalize_text)
        .unwrap_or_default();

    for existing in existing_persons {
        let mut confidence = 0i32;
        let mut reasons = Vec::new();

        // 1. Given names (0-30 pts)
        let e_given = normalize_text(&existing.given_names);
        if !s_given.is_empty() && !e_given.is_empty() {
            if s_given == e_given {
                confidence += 30;
                reasons.push(format!("Prénoms identiques: \"{}\"", staged.given_names));
            } else if s_given.contains(&e_given) || e_given.contains(&s_given) {
                confidence += 20;
                reasons.push("Prénoms partiellement similaires".to_string());
            } else {
                let sim = bigram_similarity(&s_given, &e_given);
                if sim > 0.7 {
                    confidence += (sim * 25.0).round() as i32;
                    reasons.push(format!("Prénoms proches ({}%)", (sim * 100.0).round() as i32));
                }
            }
        }

        // 2. Surname (0-30 pts)
        let e_surname = existing
            .usage_surname
            .as_deref()
            .or(existing.birth_surname.as_deref())
            .map(normalize_text)
            .unwrap_or_default();

        if !s_surname.is_empty() && !e_surname.is_empty() {
            if s_surname == e_surname {
                confidence += 30;
                reasons.push(format!("Nom identique: \"{}\"", staged.surname));
            } else {
                let sim = bigram_similarity(&s_surname, &e_surname);
                if sim > 0.7 {
                    confidence += (sim * 25.0).round() as i32;
                    reasons.push(format!("Nom proche ({}%)", (sim * 100.0).round() as i32));
                }
            }
        }

        // 3. Gender (0-10 pts)
        if staged.gender != "UNKNOWN"
            && existing.gender != "UNKNOWN"
            && staged.gender == existing.gender
        {
            confidence += 10;
            reasons.push("Genre identique".to_string());
        }

        // 4. Birth date (0-20 pts)
        if let (Some(sb), Some(eb)) = (s_birth, existing.birth_date) {
            let days_diff = (sb - eb).num_days().abs();
            if days_diff == 0 {
                confidence += 20;
                reasons.push("Date de naissance identique".to_string());
            } else if days_diff <= 365 || sb.year() == eb.year() {
                confidence += 10;
                reasons.push("Année de naissance proche".to_string());
            }
        }

        // 5. Birth place (0-10 pts)
        let e_place = existing
            .birth_place
            .as_deref()
            .map(normalize_text)
            .unwrap_or_default();
        if !s_place.is_empty() && !e_place.is_empty() {
            if s_place == e_place {
                confidence += 10;
                reasons.push("Lieu de naissance identique".to_string());
            } else if s_place.contains(&e_place) || e_place.contains(&s_place) {
                confidence += 5;
                reasons.push("Lieu de naissance partiel".to_string());
            }
        }

        if confidence >= 40 {
            matches.push(AlternativeMatchDto {
                existing_person_id: existing.id,
                confidence: confidence.min(100),
                match_reasons: reasons,
                existing_person: existing.clone(),
            });
        }
    }

    matches.sort_by(|a, b| b.confidence.cmp(&a.confidence));
    matches.truncate(3);
    matches
}

/// Apply selective GEDCOM import & merge decisions (Admin only)
pub async fn apply_merge_gedcom(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Json(payload): Json<ApplyMergePayload>,
) -> AppResult<impl IntoResponse> {
    user.require_admin()?;

    let (_, (analysis, _)) = state
        .gedcom_sessions
        .sessions
        .remove(&payload.session_id)
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "Merge session '{}' not found or expired",
                payload.session_id
            ))
        })?;

    let tree_id = analysis.tree_id;
    let before_conn = get_connectivity_snapshot(&state.pool, tree_id).await?;

    let mut decision_map: HashMap<String, MergeDecision> = HashMap::new();
    for d in payload.decisions {
        decision_map.insert(d.staged_pointer.clone(), d);
    }

    let mut pointer_to_uuid: HashMap<String, Uuid> = HashMap::new();
    let mut persons_created = 0usize;
    let mut persons_merged = 0usize;
    let mut persons_skipped = 0usize;
    let mut unions_created = 0usize;
    let mut relationships_created = 0usize;

    // 1. Handle duplicate candidates
    for dup in &analysis.duplicates {
        let action = decision_map
            .get(&dup.staged_pointer)
            .map(|d| d.action.as_str())
            .unwrap_or_else(|| if dup.confidence >= 70 { "merge" } else { "create" });

        match action {
            "merge" => {
                let target_id = decision_map
                    .get(&dup.staged_pointer)
                    .and_then(|d| d.merge_into_person_id)
                    .unwrap_or(dup.existing_person_id);
                pointer_to_uuid.insert(dup.staged_pointer.clone(), target_id);
                merge_staged_into_existing(&state.pool, tree_id, target_id, &dup.staged).await?;
                persons_merged += 1;
            }
            "create" => {
                let new_id = create_person_from_staged(&state.pool, tree_id, &dup.staged).await?;
                pointer_to_uuid.insert(dup.staged_pointer.clone(), new_id);
                persons_created += 1;
            }
            _ => {
                persons_skipped += 1;
            }
        }
    }

    // 2. Handle new persons (can also be selectively skipped via checkboxes!)
    for staged in &analysis.new_persons {
        if let Some(d) = decision_map.get(&staged.pointer) {
            if d.action == "skip" {
                persons_skipped += 1;
                continue;
            }
        }
        let new_id = create_person_from_staged(&state.pool, tree_id, staged).await?;
        pointer_to_uuid.insert(staged.pointer.clone(), new_id);
        persons_created += 1;
    }

    // 3. Reconstruct families for imported/merged persons
    for fam in &analysis.staged_families {
        let p1 = fam
            .husband_pointer
            .as_ref()
            .and_then(|ptr| pointer_to_uuid.get(ptr))
            .copied();
        let p2 = fam
            .wife_pointer
            .as_ref()
            .and_then(|ptr| pointer_to_uuid.get(ptr))
            .copied();

        if let (Some(u1), Some(u2)) = (p1, p2) {
            if u1 != u2 {
                let existing_union: Option<(Uuid,)> = sqlx::query_as(
                    r#"
                    SELECT id FROM unions
                    WHERE tree_id = $1
                      AND ((partner1_id = $2 AND partner2_id = $3) OR (partner1_id = $3 AND partner2_id = $2))
                    LIMIT 1
                    "#,
                )
                .bind(tree_id)
                .bind(u1)
                .bind(u2)
                .fetch_optional(&state.pool)
                .await?;

                if existing_union.is_none() {
                    let start_date = fam.marriage_date.as_deref().and_then(parse_gedcom_date);
                    sqlx::query(
                        r#"
                        INSERT INTO unions (tree_id, partner1_id, partner2_id, type, start_date, start_place)
                        VALUES ($1, $2, $3, 'MARRIAGE', $4, $5)
                        "#,
                    )
                    .bind(tree_id)
                    .bind(u1)
                    .bind(u2)
                    .bind(start_date)
                    .bind(fam.marriage_place.as_deref())
                    .execute(&state.pool)
                    .await?;
                    unions_created += 1;
                }
            }
        }

        let parent_ids: Vec<Uuid> = [p1, p2].into_iter().flatten().collect();
        if parent_ids.is_empty() {
            continue;
        }

        for child_ptr in &fam.child_pointers {
            if let Some(&child_id) = pointer_to_uuid.get(child_ptr) {
                for &parent_id in &parent_ids {
                    if parent_id != child_id {
                        let res = sqlx::query(
                            r#"
                            INSERT INTO relationships (tree_id, parent_id, child_id, type)
                            VALUES ($1, $2, $3, 'BIOLOGICAL')
                            ON CONFLICT (parent_id, child_id) DO NOTHING
                            "#,
                        )
                        .bind(tree_id)
                        .bind(parent_id)
                        .bind(child_id)
                        .execute(&state.pool)
                        .await?;
                        relationships_created += res.rows_affected() as usize;
                    }
                }
            }
        }
    }

    let _ = ensure_root_default_exists(&state.pool, tree_id).await?;
    let after_conn = get_connectivity_snapshot(&state.pool, tree_id).await?;

    let disc_delta = after_conn
        .disconnected_components
        .saturating_sub(before_conn.disconnected_components);
    let iso_delta = after_conn
        .isolated_persons
        .saturating_sub(before_conn.isolated_persons);

    let integrity_alert = if disc_delta > 0 || iso_delta > 0 {
        Some(IntegrityAlertDto {
            alert_type: "MERGE_CONNECTIVITY_ALERT".to_string(),
            message: format!(
                "{} composant(s) déconnecté(s) et {} personne(s) isolée(s) détecté(s).",
                disc_delta, iso_delta
            ),
            before: before_conn,
            after: after_conn,
        })
    } else {
        None
    };

    crate::audit_map::record_audit_log(
        &state.pool,
        tree_id,
        &user,
        "MERGE_GEDCOM",
        "GEDCOM",
        None,
        Some(&format!(
            "{} créés, {} fusionnés, {} ignorés",
            persons_created, persons_merged, persons_skipped
        )),
        None,
        None,
    )
    .await;

    Ok(ApiSuccess::new(MergeResultDto {
        persons_created,
        persons_merged,
        persons_skipped,
        relationships_created,
        unions_created,
        integrity_alert,
    }))
}

async fn create_person_from_staged(
    pool: &sqlx::PgPool,
    tree_id: Uuid,
    staged: &StagedPerson,
) -> AppResult<Uuid> {
    let birth_date = staged.birth_date.as_deref().and_then(parse_gedcom_date);
    let death_date = staged.death_date.as_deref().and_then(parse_gedcom_date);
    let birth_place_id =
        find_or_create_place_id(pool, pool, staged.birth_place.as_deref()).await?;
    let death_place_id =
        find_or_create_place_id(pool, pool, staged.death_place.as_deref()).await?;

    let surname_opt = if staged.surname.trim().is_empty() {
        None
    } else {
        Some(staged.surname.trim())
    };

    let norm = build_normalized_person_fields(
        &staged.given_names,
        surname_opt,
        surname_opt,
        birth_date,
        death_date,
    );

    let (id,): (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO persons (
            tree_id, given_names, birth_surname, usage_surname, gender,
            birth_date, birth_place_id, death_date, death_place_id, notes,
            given_names_normalized, surname_normalized, primary_name_normalized,
            birth_year, death_year
        )
        VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
        "#,
    )
    .bind(tree_id)
    .bind(&staged.given_names)
    .bind(surname_opt)
    .bind(&staged.gender)
    .bind(birth_date)
    .bind(birth_place_id)
    .bind(death_date)
    .bind(death_place_id)
    .bind(staged.notes.as_deref())
    .bind(norm.given_names_normalized)
    .bind(norm.surname_normalized)
    .bind(norm.primary_name_normalized)
    .bind(norm.birth_year)
    .bind(norm.death_year)
    .fetch_one(pool)
    .await?;

    Ok(id)
}

async fn merge_staged_into_existing(
    pool: &sqlx::PgPool,
    tree_id: Uuid,
    person_id: Uuid,
    staged: &StagedPerson,
) -> AppResult<()> {
    let sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
    let Some(existing) = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(person_id)
        .bind(tree_id)
        .fetch_optional(pool)
        .await?
    else {
        return Ok(());
    };

    let staged_surname = if staged.surname.trim().is_empty() {
        None
    } else {
        Some(staged.surname.trim().to_string())
    };

    let birth_surname = existing.birth_surname.or_else(|| staged_surname.clone());
    let usage_surname = existing.usage_surname.or(staged_surname);
    let gender = if existing.gender == "UNKNOWN" && staged.gender != "UNKNOWN" {
        staged.gender.clone()
    } else {
        existing.gender
    };

    let birth_date = existing
        .birth_date
        .or_else(|| staged.birth_date.as_deref().and_then(parse_gedcom_date));
    let death_date = existing
        .death_date
        .or_else(|| staged.death_date.as_deref().and_then(parse_gedcom_date));

    let birth_place_id = match existing.birth_place_id {
        Some(id) => Some(id),
        None => find_or_create_place_id(pool, pool, staged.birth_place.as_deref()).await?,
    };
    let death_place_id = match existing.death_place_id {
        Some(id) => Some(id),
        None => find_or_create_place_id(pool, pool, staged.death_place.as_deref()).await?,
    };

    let notes = existing.notes.or_else(|| staged.notes.clone());

    let norm = build_normalized_person_fields(
        &existing.given_names,
        usage_surname.as_deref(),
        birth_surname.as_deref(),
        birth_date,
        death_date,
    );

    sqlx::query(
        r#"
        UPDATE persons SET
            birth_surname = $1,
            usage_surname = $2,
            gender = $3,
            birth_date = $4,
            birth_place_id = $5,
            death_date = $6,
            death_place_id = $7,
            notes = $8,
            given_names_normalized = $9,
            surname_normalized = $10,
            primary_name_normalized = $11,
            birth_year = $12,
            death_year = $13,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14 AND tree_id = $15
        "#,
    )
    .bind(birth_surname)
    .bind(usage_surname)
    .bind(gender)
    .bind(birth_date)
    .bind(birth_place_id)
    .bind(death_date)
    .bind(death_place_id)
    .bind(notes)
    .bind(norm.given_names_normalized)
    .bind(norm.surname_normalized)
    .bind(norm.primary_name_normalized)
    .bind(norm.birth_year)
    .bind(norm.death_year)
    .bind(person_id)
    .bind(tree_id)
    .execute(pool)
    .await?;

    Ok(())
}

// ─── Full & Partial GEDCOM 5.5.1 Export (Admin only) ───────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportGedcomQuery {
    pub tree_id: Option<String>,
    pub root_person_id: Option<Uuid>,
    pub max_generations: Option<i32>,
    pub ancestors: Option<i32>,
    pub descendants: Option<i32>,
}

pub async fn export_gedcom(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Query(query): Query<ExportGedcomQuery>,
) -> AppResult<Response> {
    user.require_admin()?;

    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    let (person_rows, relationships, unions) = if let Some(root_id) = query.root_person_id {
        let anc_depth = query
            .ancestors
            .or(query.max_generations)
            .unwrap_or(4)
            .clamp(0, 30);
        let desc_depth = query
            .descendants
            .or(query.max_generations)
            .unwrap_or(4)
            .clamp(0, 30);

        let branch_ids: Vec<(Uuid,)> = sqlx::query_as(
            r#"
            WITH RECURSIVE
            anc AS (
                SELECT $1::uuid AS id, 0 AS gen
                UNION ALL
                SELECT r.parent_id, a.gen + 1
                FROM relationships r
                INNER JOIN anc a ON r.child_id = a.id
                WHERE a.gen < $3
            ),
            desc_tree AS (
                SELECT $1::uuid AS id, 0 AS gen
                UNION ALL
                SELECT r.child_id, d.gen + 1
                FROM relationships r
                INNER JOIN desc_tree d ON r.parent_id = d.id
                WHERE d.gen < $4
            ),
            combined AS (
                SELECT id FROM anc
                UNION
                SELECT id FROM desc_tree
            )
            SELECT DISTINCT p.id
            FROM persons p
            WHERE p.tree_id = $2
              AND (
                  p.id IN (SELECT id FROM combined)
                  OR p.id IN (
                      SELECT partner1_id FROM unions WHERE tree_id = $2 AND partner2_id IN (SELECT id FROM combined)
                  )
                  OR p.id IN (
                      SELECT partner2_id FROM unions WHERE tree_id = $2 AND partner1_id IN (SELECT id FROM combined)
                  )
              )
            "#,
        )
        .bind(root_id)
        .bind(tree_id)
        .bind(anc_depth)
        .bind(desc_depth)
        .fetch_all(&state.pool)
        .await?;

        let ids: Vec<Uuid> = branch_ids.into_iter().map(|(id,)| id).collect();
        let sql = format!("{} WHERE p.tree_id = $1 AND p.id = ANY($2)", PERSON_SELECT_SQL);
        let persons = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
            .bind(tree_id)
            .bind(&ids)
            .fetch_all(&state.pool)
            .await?;

        let rels = sqlx::query_as::<_, RelationshipDto>(
            r#"
            SELECT id, parent_id, child_id, type::text AS rel_type, created_at
            FROM relationships
            WHERE parent_id = ANY($1) AND child_id = ANY($1)
            "#,
        )
        .bind(&ids)
        .fetch_all(&state.pool)
        .await?;

        let uns = sqlx::query_as::<_, UnionDto>(
            r#"
            SELECT id, tree_id, partner1_id, partner2_id, type::text AS union_type,
                   start_date, start_place, end_date, end_reason::text AS end_reason, notes, created_at, updated_at
            FROM unions
            WHERE tree_id = $1 AND partner1_id = ANY($2) AND partner2_id = ANY($2)
            "#,
        )
        .bind(tree_id)
        .bind(&ids)
        .fetch_all(&state.pool)
        .await?;

        (persons, rels, uns)
    } else {
        let sql = format!("{} WHERE p.tree_id = $1", PERSON_SELECT_SQL);
        let persons = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
            .bind(tree_id)
            .fetch_all(&state.pool)
            .await?;
        let ids: Vec<Uuid> = persons.iter().map(|p| p.id).collect();

        let rels = sqlx::query_as::<_, RelationshipDto>(
            r#"
            SELECT id, parent_id, child_id, type::text AS rel_type, created_at
            FROM relationships
            WHERE parent_id = ANY($1) AND child_id = ANY($1)
            "#,
        )
        .bind(&ids)
        .fetch_all(&state.pool)
        .await?;

        let uns = sqlx::query_as::<_, UnionDto>(
            r#"
            SELECT id, tree_id, partner1_id, partner2_id, type::text AS union_type,
                   start_date, start_place, end_date, end_reason::text AS end_reason, notes, created_at, updated_at
            FROM unions
            WHERE tree_id = $1
            "#,
        )
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?;

        (persons, rels, uns)
    };

    let gedcom_str = generate_gedcom_string(&person_rows, &relationships, &unions);
    let filename = if query.root_person_id.is_some() {
        "origineo_branch_export.ged"
    } else {
        "origineo_full_export.ged"
    };

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        Body::from(gedcom_str),
    )
        .into_response())
}

fn generate_gedcom_string(
    persons: &[PersonWithPlaceRow],
    relationships: &[RelationshipDto],
    unions: &[UnionDto],
) -> String {
    let mut lines = Vec::new();
    lines.push("0 HEAD".to_string());
    lines.push("1 SOUR Origineo".to_string());
    lines.push("2 VERS 2.0.0".to_string());
    lines.push("2 NAME Origineo Rust Engine".to_string());
    lines.push("1 GEDC".to_string());
    lines.push("2 VERS 5.5.1".to_string());
    lines.push("2 FORM LINEAGE-LINKED".to_string());
    lines.push("1 CHAR UTF-8".to_string());

    let mut person_pointers: HashMap<Uuid, String> = HashMap::new();
    for (idx, p) in persons.iter().enumerate() {
        let ptr = format!("@I{}@", idx + 1);
        person_pointers.insert(p.id, ptr.clone());

        lines.push(format!("0 {} INDI", ptr));
        let surname = p
            .birth_surname
            .as_deref()
            .or(p.usage_surname.as_deref())
            .unwrap_or("");
        lines.push(format!("1 NAME {} /{}/", p.given_names, surname));
        if !p.given_names.is_empty() {
            lines.push(format!("2 GIVN {}", p.given_names));
        }
        if !surname.is_empty() {
            lines.push(format!("2 SURN {}", surname));
        }

        let sex = match p.gender.as_str() {
            "MALE" => "M",
            "FEMALE" => "F",
            _ => "U",
        };
        lines.push(format!("1 SEX {}", sex));

        if p.birth_date.is_some() || p.birth_place_formatted.is_some() {
            lines.push("1 BIRT".to_string());
            if let Some(bd) = p.birth_date {
                lines.push(format!("2 DATE {}", format_gedcom_date(bd)));
            }
            if let Some(ref bp) = p.birth_place_formatted {
                lines.push(format!("2 PLAC {}", bp));
            }
        }

        if p.death_date.is_some() || p.death_place_formatted.is_some() {
            lines.push("1 DEAT".to_string());
            if let Some(dd) = p.death_date {
                lines.push(format!("2 DATE {}", format_gedcom_date(dd)));
            }
            if let Some(ref dp) = p.death_place_formatted {
                lines.push(format!("2 PLAC {}", dp));
            }
        }

        if let Some(ref note) = p.notes {
            let clean_note = note.replace('\n', " ");
            lines.push(format!("1 NOTE {}", clean_note));
        }
    }

    // Build parent pairs for children
    let mut parents_by_child: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for r in relationships {
        parents_by_child
            .entry(r.child_id)
            .or_default()
            .push(r.parent_id);
    }

    let mut exported_children_in_unions: HashSet<Uuid> = HashSet::new();
    let mut fam_idx = 1usize;

    for u in unions {
        let Some(p1_ptr) = person_pointers.get(&u.partner1_id) else {
            continue;
        };
        let Some(p2_ptr) = person_pointers.get(&u.partner2_id) else {
            continue;
        };

        lines.push(format!("0 @F{}@ FAM", fam_idx));
        fam_idx += 1;

        lines.push(format!("1 HUSB {}", p1_ptr));
        lines.push(format!("1 WIFE {}", p2_ptr));

        if u.start_date.is_some() || u.start_place.is_some() {
            lines.push("1 MARR".to_string());
            if let Some(sd) = u.start_date {
                lines.push(format!("2 DATE {}", format_gedcom_date(sd)));
            }
            if let Some(ref sp) = u.start_place {
                lines.push(format!("2 PLAC {}", sp));
            }
        }

        for (&child_id, c_parents) in &parents_by_child {
            if c_parents.contains(&u.partner1_id) && c_parents.contains(&u.partner2_id) {
                if let Some(c_ptr) = person_pointers.get(&child_id) {
                    lines.push(format!("1 CHIL {}", c_ptr));
                    exported_children_in_unions.insert(child_id);
                }
            }
        }
    }

    // Also export single-parent or non-union parent-child families
    let mut single_parent_families: HashMap<(Uuid, Option<Uuid>), Vec<Uuid>> = HashMap::new();
    for (&child_id, c_parents) in &parents_by_child {
        if exported_children_in_unions.contains(&child_id) {
            continue;
        }
        if c_parents.is_empty() {
            continue;
        }
        let mut sorted = c_parents.clone();
        sorted.sort();
        let key = (sorted[0], sorted.get(1).copied());
        single_parent_families
            .entry(key)
            .or_default()
            .push(child_id);
    }

    for ((p1, p2_opt), children) in single_parent_families {
        let Some(p1_ptr) = person_pointers.get(&p1) else {
            continue;
        };
        lines.push(format!("0 @F{}@ FAM", fam_idx));
        fam_idx += 1;
        lines.push(format!("1 HUSB {}", p1_ptr));
        if let Some(p2) = p2_opt {
            if let Some(p2_ptr) = person_pointers.get(&p2) {
                lines.push(format!("1 WIFE {}", p2_ptr));
            }
        }
        for cid in children {
            if let Some(c_ptr) = person_pointers.get(&cid) {
                lines.push(format!("1 CHIL {}", c_ptr));
            }
        }
    }

    lines.push("0 TRLR".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_gedcom_551_individuals_and_families() {
        let sample = "\
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Jean /MOREAU/
1 SEX M
1 BIRT
2 DATE 12 MAY 1950
2 PLAC Lyon, France
0 @I2@ INDI
1 NAME Marie /DUPONT/
1 SEX F
0 @I3@ INDI
1 NAME Lucas /MOREAU/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 20 JUN 1975
2 PLAC Lyon, France
1 CHIL @I3@
0 TRLR";

        let (persons, families) = parse_gedcom_content(sample);
        assert_eq!(persons.len(), 3);
        assert_eq!(persons[0].given_names, "Jean");
        assert_eq!(persons[0].surname, "MOREAU");
        assert_eq!(persons[0].gender, "MALE");
        assert_eq!(persons[0].birth_date.as_deref(), Some("12 MAY 1950"));
        assert_eq!(persons[0].birth_place.as_deref(), Some("Lyon, France"));

        assert_eq!(families.len(), 1);
        assert_eq!(families[0].husband_pointer.as_deref(), Some("@I1@"));
        assert_eq!(families[0].wife_pointer.as_deref(), Some("@I2@"));
        assert_eq!(families[0].child_pointers, vec!["@I3@".to_string()]);
    }
}
