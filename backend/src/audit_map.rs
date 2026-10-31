use std::collections::HashMap;
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
    models::PersonDto,
    persons::{find_or_create_place_id, PERSON_SELECT_SQL},
    utils::{build_normalized_person_fields, normalize_text, parse_tree_id},
    AppState,
};

// ─── Offline Gazetteer for Automatic Place Coordinates ─────────────

pub fn infer_coordinates(name: &str, region: Option<&str>, country: Option<&str>) -> Option<(f64, f64)> {
    let key = normalize_text(name);
    let table: &[(&str, f64, f64)] = &[
        ("paris", 48.8566, 2.3522),
        ("lyon", 45.7640, 4.8357),
        ("marseille", 43.2965, 5.3698),
        ("toulouse", 43.6047, 1.4442),
        ("bordeaux", 44.8378, -0.5792),
        ("lille", 50.6292, 3.0573),
        ("nantes", 47.2184, -1.5536),
        ("strasbourg", 48.5734, 7.7521),
        ("rennes", 48.1173, -1.6778),
        ("nice", 43.7102, 7.2620),
        ("montpellier", 43.6108, 3.8767),
        ("grenoble", 45.1885, 5.7245),
        ("dijon", 47.3220, 5.0415),
        ("angers", 47.4784, -0.5632),
        ("nimes", 43.8367, 4.3601),
        ("clermont ferrand", 45.7772, 3.0870),
        ("le mans", 48.0061, 0.1996),
        ("aix en provence", 43.5297, 5.4474),
        ("brest", 48.3904, -4.4861),
        ("tours", 47.3941, 0.6848),
        ("amiens", 49.8941, 2.2958),
        ("limoges", 45.8336, 1.2611),
        ("annecy", 45.8992, 6.1294),
        ("perpignan", 42.6887, 2.8948),
        ("metz", 49.1193, 6.1757),
        ("besancon", 47.2378, 6.0241),
        ("orleans", 47.9029, 1.9093),
        ("rouen", 49.4432, 1.0999),
        ("mulhouse", 47.7508, 7.3359),
        ("caen", 49.1829, -0.3707),
        ("nancy", 48.6921, 6.1844),
        ("avignon", 43.9493, 4.8055),
        ("poitiers", 46.5802, 0.3404),
        ("versailles", 48.8049, 2.1204),
        ("la rochelle", 46.1603, -1.1511),
        ("pau", 43.2951, -0.3708),
        ("bayonne", 43.4929, -1.4748),
        ("toulon", 43.1242, 5.9280),
        ("reims", 49.2583, 4.0317),
        ("saint etienne", 45.4397, 4.3872),
        ("le havre", 49.4944, 0.1079),
        ("valence", 44.9334, 4.8924),
        ("chambery", 45.5646, 5.9178),
        ("quimper", 47.9960, -4.1024),
        ("vannes", 47.6582, -2.7608),
        ("lorient", 47.7482, -3.3702),
        ("saint malo", 48.6493, -2.0257),
        ("bourges", 47.0810, 2.3988),
        ("chartres", 48.4439, 1.4890),
        ("blois", 47.5861, 1.3359),
        ("troyes", 48.2973, 4.0744),
        ("auxerre", 47.7982, 3.5738),
        ("macon", 46.3069, 4.8287),
        ("chalon sur saone", 46.7807, 4.8539),
        ("nevers", 46.9896, 3.1590),
        ("arras", 50.2910, 2.7775),
        ("calais", 50.9513, 1.8587),
        ("dunkerque", 51.0344, 2.3768),
        ("colmar", 48.0794, 7.3585),
        ("ajaccio", 41.9192, 8.7386),
        ("bastia", 42.6973, 9.4509),
        ("bruxelles", 50.8503, 4.3517),
        ("brussels", 50.8503, 4.3517),
        ("liege", 50.6326, 5.5797),
        ("anvers", 51.2194, 4.4025),
        ("geneve", 46.2044, 6.1432),
        ("lausanne", 46.5197, 6.6323),
        ("zurich", 47.3769, 8.5417),
        ("berne", 46.9480, 7.4474),
        ("luxembourg", 49.6116, 6.1319),
        ("london", 51.5074, -0.1278),
        ("londres", 51.5074, -0.1278),
        ("madrid", 40.4168, -3.7038),
        ("barcelona", 41.3874, 2.1686),
        ("barcelone", 41.3874, 2.1686),
        ("roma", 41.9028, 12.4964),
        ("rome", 41.9028, 12.4964),
        ("milano", 45.4642, 9.1900),
        ("milan", 45.4642, 9.1900),
        ("torino", 45.0703, 7.6869),
        ("turin", 45.0703, 7.6869),
        ("berlin", 52.5200, 13.4050),
        ("munchen", 48.1351, 11.5820),
        ("munich", 48.1351, 11.5820),
        ("frankfurt", 50.1109, 8.6821),
        ("koln", 50.9375, 6.9603),
        ("amsterdam", 52.3676, 4.9041),
        ("lisboa", 38.7223, -9.1393),
        ("lisbonne", 38.7223, -9.1393),
        ("wien", 48.2082, 16.3738),
        ("vienne", 48.2082, 16.3738),
        ("warszawa", 52.2297, 21.0122),
        ("varsovie", 52.2297, 21.0122),
        ("montreal", 45.5017, -73.5673),
        ("quebec", 46.8139, -71.2080),
        ("new york", 40.7128, -74.0060),
        ("alger", 36.7538, 3.0588),
        ("oran", 35.6971, -0.6308),
        ("casablanca", 33.5731, -7.5898),
        ("rabat", 34.0209, -6.8416),
        ("tunis", 36.8065, 10.1815),
    ];

    for &(city, lat, lng) in table {
        if key == city || key.starts_with(&format!("{} ", city)) {
            return Some((lat, lng));
        }
    }

    if let Some(reg) = region {
        let r_norm = normalize_text(reg);
        for &(city, lat, lng) in table {
            if r_norm == city {
                return Some((lat, lng));
            }
        }
    }

    if let Some(c) = country {
        let c_norm = normalize_text(c);
        match c_norm.as_str() {
            "france" => return Some((46.6034, 1.8883)),
            "belgique" | "belgium" => return Some((50.5039, 4.4699)),
            "suisse" | "switzerland" => return Some((46.8182, 8.2275)),
            "italie" | "italy" | "italia" => return Some((41.8719, 12.5674)),
            "espagne" | "spain" | "espana" => return Some((40.4637, -3.7492)),
            "allemagne" | "germany" | "deutschland" => return Some((51.1657, 10.4515)),
            _ => {}
        }
    }

    None
}

// ─── Interactive Family Migration Map Endpoints ────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapQuery {
    pub tree_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapPlaceDto {
    pub id: Uuid,
    pub name: String,
    pub region: Option<String>,
    pub country: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub birth_count: i64,
    pub death_count: i64,
    pub total_events: i64,
    pub sample_persons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationArcDto {
    pub from_place_id: Uuid,
    pub from_name: String,
    pub from_lat: f64,
    pub from_lng: f64,
    pub to_place_id: Uuid,
    pub to_name: String,
    pub to_lat: f64,
    pub to_lng: f64,
    pub count: usize,
    pub kind: String, // "BIRTH_TO_DEATH" | "PARENT_TO_CHILD"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyMapResponseDto {
    pub places: Vec<MapPlaceDto>,
    pub migrations: Vec<MigrationArcDto>,
}

#[derive(sqlx::FromRow)]
struct PlaceAggRow {
    id: Uuid,
    name: String,
    region: Option<String>,
    country: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    birth_count: i64,
    death_count: i64,
    sample_persons: Vec<String>,
}

pub async fn get_family_map(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<MapQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    // Auto-populate missing coordinates for places in this tree
    let rows = sqlx::query_as::<_, PlaceAggRow>(
        r#"
        SELECT
            pl.id,
            pl.name,
            pl.region,
            pl.country,
            pl.latitude,
            pl.longitude,
            COUNT(DISTINCT p_b.id) AS birth_count,
            COUNT(DISTINCT p_d.id) AS death_count,
            ARRAY(
                SELECT concat_ws(' ', p2.given_names, COALESCE(p2.usage_surname, p2.birth_surname, ''))
                FROM persons p2
                WHERE p2.tree_id = $1 AND (p2.birth_place_id = pl.id OR p2.death_place_id = pl.id)
                LIMIT 6
            ) AS sample_persons
        FROM places pl
        LEFT JOIN persons p_b ON p_b.birth_place_id = pl.id AND p_b.tree_id = $1
        LEFT JOIN persons p_d ON p_d.death_place_id = pl.id AND p_d.tree_id = $1
        WHERE p_b.id IS NOT NULL OR p_d.id IS NOT NULL
        GROUP BY pl.id
        ORDER BY (COUNT(DISTINCT p_b.id) + COUNT(DISTINCT p_d.id)) DESC
        LIMIT 500
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    let mut places = Vec::with_capacity(rows.len());
    let mut coords_by_id: HashMap<Uuid, (String, f64, f64)> = HashMap::new();

    for r in rows {
        let mut lat = r.latitude;
        let mut lng = r.longitude;
        if lat.is_none() || lng.is_none() {
            if let Some((inferred_lat, inferred_lng)) =
                infer_coordinates(&r.name, r.region.as_deref(), r.country.as_deref())
            {
                lat = Some(inferred_lat);
                lng = Some(inferred_lng);
                let _ = sqlx::query("UPDATE places SET latitude = $1, longitude = $2 WHERE id = $3")
                    .bind(inferred_lat)
                    .bind(inferred_lng)
                    .bind(r.id)
                    .execute(&state.pool)
                    .await;
            }
        }

        if let (Some(la), Some(lo)) = (lat, lng) {
            coords_by_id.insert(r.id, (r.name.clone(), la, lo));
        }

        places.push(MapPlaceDto {
            id: r.id,
            name: r.name,
            region: r.region,
            country: r.country,
            latitude: lat,
            longitude: lng,
            birth_count: r.birth_count,
            death_count: r.death_count,
            total_events: r.birth_count + r.death_count,
            sample_persons: r.sample_persons,
        });
    }

    // 1. Birth -> Death migrations within a person's lifetime
    let life_moves: Vec<(Uuid, Uuid, i64)> = sqlx::query_as(
        r#"
        SELECT birth_place_id, death_place_id, COUNT(*) AS cnt
        FROM persons
        WHERE tree_id = $1
          AND birth_place_id IS NOT NULL
          AND death_place_id IS NOT NULL
          AND birth_place_id <> death_place_id
        GROUP BY birth_place_id, death_place_id
        LIMIT 300
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    // 2. Parent Birth Place -> Child Birth Place inter-generational migrations
    let gen_moves: Vec<(Uuid, Uuid, i64)> = sqlx::query_as(
        r#"
        SELECT pp.birth_place_id, cp.birth_place_id, COUNT(*) AS cnt
        FROM relationships r
        INNER JOIN persons pp ON pp.id = r.parent_id AND pp.tree_id = $1
        INNER JOIN persons cp ON cp.id = r.child_id AND cp.tree_id = $1
        WHERE pp.birth_place_id IS NOT NULL
          AND cp.birth_place_id IS NOT NULL
          AND pp.birth_place_id <> cp.birth_place_id
        GROUP BY pp.birth_place_id, cp.birth_place_id
        LIMIT 300
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    let mut migrations = Vec::new();
    for (from_id, to_id, cnt) in life_moves {
        if let (Some((f_name, f_lat, f_lng)), Some((t_name, t_lat, t_lng))) =
            (coords_by_id.get(&from_id), coords_by_id.get(&to_id))
        {
            migrations.push(MigrationArcDto {
                from_place_id: from_id,
                from_name: f_name.clone(),
                from_lat: *f_lat,
                from_lng: *f_lng,
                to_place_id: to_id,
                to_name: t_name.clone(),
                to_lat: *t_lat,
                to_lng: *t_lng,
                count: cnt as usize,
                kind: "BIRTH_TO_DEATH".to_string(),
            });
        }
    }

    for (from_id, to_id, cnt) in gen_moves {
        if let (Some((f_name, f_lat, f_lng)), Some((t_name, t_lat, t_lng))) =
            (coords_by_id.get(&from_id), coords_by_id.get(&to_id))
        {
            migrations.push(MigrationArcDto {
                from_place_id: from_id,
                from_name: f_name.clone(),
                from_lat: *f_lat,
                from_lng: *f_lng,
                to_place_id: to_id,
                to_name: t_name.clone(),
                to_lat: *t_lat,
                to_lng: *t_lng,
                count: cnt as usize,
                kind: "PARENT_TO_CHILD".to_string(),
            });
        }
    }

    Ok(ApiSuccess::new(FamilyMapResponseDto { places, migrations }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlaceCoordsPayload {
    pub latitude: f64,
    pub longitude: f64,
}

pub async fn update_place_coords(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(place_id): Path<Uuid>,
    Json(payload): Json<UpdatePlaceCoordsPayload>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    if !(-90.0..=90.0).contains(&payload.latitude) || !(-180.0..=180.0).contains(&payload.longitude) {
        return Err(AppError::BadRequest("Invalid GPS coordinates".to_string()));
    }

    sqlx::query("UPDATE places SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3")
        .bind(payload.latitude)
        .bind(payload.longitude)
        .bind(place_id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "id": place_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude
    })))
}

// ─── Genealogical Anomaly & Inconsistency Detector (Million-Scale SQL) ───

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnomalyDto {
    pub code: String,
    pub severity: String, // "ERROR" | "WARNING"
    pub person_id: Uuid,
    pub person_name: String,
    pub related_person_id: Option<Uuid>,
    pub related_person_name: Option<String>,
    pub message_fr: String,
    pub message_en: String,
}

#[derive(sqlx::FromRow)]
struct RawAnomalyRow {
    code: String,
    severity: String,
    person_id: Uuid,
    person_name: String,
    related_person_id: Option<Uuid>,
    related_person_name: Option<String>,
    val_a: Option<i32>,
    val_b: Option<i32>,
}

pub async fn detect_anomalies(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<MapQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    // Single union-all SQL query leveraging B-Tree indexes on tree_id, birth_date, death_date, birth_year
    let rows = sqlx::query_as::<_, RawAnomalyRow>(
        r#"
        -- 1. Death before birth
        SELECT
            'DEATH_BEFORE_BIRTH' AS code,
            'ERROR' AS severity,
            p.id AS person_id,
            concat_ws(' ', p.given_names, COALESCE(p.usage_surname, p.birth_surname, '')) AS person_name,
            NULL::uuid AS related_person_id,
            NULL::text AS related_person_name,
            EXTRACT(YEAR FROM p.birth_date)::int AS val_a,
            EXTRACT(YEAR FROM p.death_date)::int AS val_b
        FROM persons p
        WHERE p.tree_id = $1
          AND p.birth_date IS NOT NULL
          AND p.death_date IS NOT NULL
          AND p.death_date < p.birth_date

        UNION ALL

        -- 2. Extreme longevity (> 110 years)
        SELECT
            'EXTREME_LONGEVITY' AS code,
            'WARNING' AS severity,
            p.id AS person_id,
            concat_ws(' ', p.given_names, COALESCE(p.usage_surname, p.birth_surname, '')) AS person_name,
            NULL::uuid AS related_person_id,
            NULL::text AS related_person_name,
            (EXTRACT(YEAR FROM p.death_date) - EXTRACT(YEAR FROM p.birth_date))::int AS val_a,
            NULL::int AS val_b
        FROM persons p
        WHERE p.tree_id = $1
          AND p.birth_date IS NOT NULL
          AND p.death_date IS NOT NULL
          AND (p.death_date - p.birth_date) > 40175

        UNION ALL

        -- 3. Parent too young (< 13 years old at child's birth)
        SELECT
            'PARENT_TOO_YOUNG' AS code,
            'ERROR' AS severity,
            cp.id AS person_id,
            concat_ws(' ', cp.given_names, COALESCE(cp.usage_surname, cp.birth_surname, '')) AS person_name,
            pp.id AS related_person_id,
            concat_ws(' ', pp.given_names, COALESCE(pp.usage_surname, pp.birth_surname, '')) AS related_person_name,
            (EXTRACT(YEAR FROM cp.birth_date) - EXTRACT(YEAR FROM pp.birth_date))::int AS val_a,
            NULL::int AS val_b
        FROM relationships r
        INNER JOIN persons pp ON pp.id = r.parent_id AND pp.tree_id = $1
        INNER JOIN persons cp ON cp.id = r.child_id AND cp.tree_id = $1
        WHERE pp.birth_date IS NOT NULL
          AND cp.birth_date IS NOT NULL
          AND (EXTRACT(YEAR FROM cp.birth_date) - EXTRACT(YEAR FROM pp.birth_date)) < 13

        UNION ALL

        -- 4. Parent too old (> 60 for mother, > 85 for father)
        SELECT
            'PARENT_TOO_OLD' AS code,
            'WARNING' AS severity,
            cp.id AS person_id,
            concat_ws(' ', cp.given_names, COALESCE(cp.usage_surname, cp.birth_surname, '')) AS person_name,
            pp.id AS related_person_id,
            concat_ws(' ', pp.given_names, COALESCE(pp.usage_surname, pp.birth_surname, '')) AS related_person_name,
            (EXTRACT(YEAR FROM cp.birth_date) - EXTRACT(YEAR FROM pp.birth_date))::int AS val_a,
            NULL::int AS val_b
        FROM relationships r
        INNER JOIN persons pp ON pp.id = r.parent_id AND pp.tree_id = $1
        INNER JOIN persons cp ON cp.id = r.child_id AND cp.tree_id = $1
        WHERE pp.birth_date IS NOT NULL
          AND cp.birth_date IS NOT NULL
          AND (
              (pp.gender = 'FEMALE' AND (EXTRACT(YEAR FROM cp.birth_date) - EXTRACT(YEAR FROM pp.birth_date)) > 58)
              OR (pp.gender <> 'FEMALE' AND (EXTRACT(YEAR FROM cp.birth_date) - EXTRACT(YEAR FROM pp.birth_date)) > 85)
          )

        UNION ALL

        -- 5. Child born after parent's death
        SELECT
            'BORN_AFTER_PARENT_DEATH' AS code,
            'ERROR' AS severity,
            cp.id AS person_id,
            concat_ws(' ', cp.given_names, COALESCE(cp.usage_surname, cp.birth_surname, '')) AS person_name,
            pp.id AS related_person_id,
            concat_ws(' ', pp.given_names, COALESCE(pp.usage_surname, pp.birth_surname, '')) AS related_person_name,
            EXTRACT(YEAR FROM cp.birth_date)::int AS val_a,
            EXTRACT(YEAR FROM pp.death_date)::int AS val_b
        FROM relationships r
        INNER JOIN persons pp ON pp.id = r.parent_id AND pp.tree_id = $1
        INNER JOIN persons cp ON cp.id = r.child_id AND cp.tree_id = $1
        WHERE pp.death_date IS NOT NULL
          AND cp.birth_date IS NOT NULL
          AND (
              (pp.gender = 'FEMALE' AND cp.birth_date > pp.death_date)
              OR (pp.gender <> 'FEMALE' AND (cp.birth_date - pp.death_date) > 300)
          )

        UNION ALL

        -- 6. Large spouse age gap (> 40 years)
        SELECT
            'SPOUSE_AGE_GAP' AS code,
            'WARNING' AS severity,
            p1.id AS person_id,
            concat_ws(' ', p1.given_names, COALESCE(p1.usage_surname, p1.birth_surname, '')) AS person_name,
            p2.id AS related_person_id,
            concat_ws(' ', p2.given_names, COALESCE(p2.usage_surname, p2.birth_surname, '')) AS related_person_name,
            ABS(EXTRACT(YEAR FROM p1.birth_date) - EXTRACT(YEAR FROM p2.birth_date))::int AS val_a,
            NULL::int AS val_b
        FROM unions u
        INNER JOIN persons p1 ON p1.id = u.partner1_id AND p1.tree_id = $1
        INNER JOIN persons p2 ON p2.id = u.partner2_id AND p2.tree_id = $1
        WHERE u.tree_id = $1
          AND p1.birth_date IS NOT NULL
          AND p2.birth_date IS NOT NULL
          AND ABS(EXTRACT(YEAR FROM p1.birth_date) - EXTRACT(YEAR FROM p2.birth_date)) > 40

        UNION ALL

        -- 7. Marriage before birth of partner 1 or 2
        SELECT
            'MARRIAGE_BEFORE_BIRTH' AS code,
            'ERROR' AS severity,
            p1.id AS person_id,
            concat_ws(' ', p1.given_names, COALESCE(p1.usage_surname, p1.birth_surname, '')) AS person_name,
            p2.id AS related_person_id,
            concat_ws(' ', p2.given_names, COALESCE(p2.usage_surname, p2.birth_surname, '')) AS related_person_name,
            EXTRACT(YEAR FROM u.start_date)::int AS val_a,
            EXTRACT(YEAR FROM p1.birth_date)::int AS val_b
        FROM unions u
        INNER JOIN persons p1 ON p1.id = u.partner1_id AND p1.tree_id = $1
        INNER JOIN persons p2 ON p2.id = u.partner2_id AND p2.tree_id = $1
        WHERE u.tree_id = $1
          AND u.start_date IS NOT NULL
          AND p1.birth_date IS NOT NULL
          AND u.start_date < p1.birth_date

        UNION ALL

        -- 8. Marriage after death of partner 1
        SELECT
            'MARRIAGE_AFTER_DEATH' AS code,
            'ERROR' AS severity,
            p1.id AS person_id,
            concat_ws(' ', p1.given_names, COALESCE(p1.usage_surname, p1.birth_surname, '')) AS person_name,
            p2.id AS related_person_id,
            concat_ws(' ', p2.given_names, COALESCE(p2.usage_surname, p2.birth_surname, '')) AS related_person_name,
            EXTRACT(YEAR FROM u.start_date)::int AS val_a,
            EXTRACT(YEAR FROM p1.death_date)::int AS val_b
        FROM unions u
        INNER JOIN persons p1 ON p1.id = u.partner1_id AND p1.tree_id = $1
        INNER JOIN persons p2 ON p2.id = u.partner2_id AND p2.tree_id = $1
        WHERE u.tree_id = $1
          AND u.start_date IS NOT NULL
          AND p1.death_date IS NOT NULL
          AND u.start_date > p1.death_date

        UNION ALL

        -- 9. Sibling age spacing impossible (< 7 months apart, non-twins)
        SELECT
            'SIBLINGS_SPACING_IMPOSSIBLE' AS code,
            'WARNING' AS severity,
            c1.id AS person_id,
            concat_ws(' ', c1.given_names, COALESCE(c1.usage_surname, c1.birth_surname, '')) AS person_name,
            c2.id AS related_person_id,
            concat_ws(' ', c2.given_names, COALESCE(c2.usage_surname, c2.birth_surname, '')) AS related_person_name,
            ABS(c1.birth_date - c2.birth_date)::int AS val_a,
            NULL::int AS val_b
        FROM relationships r1
        INNER JOIN relationships r2 ON r1.parent_id = r2.parent_id AND r1.child_id < r2.child_id
        INNER JOIN persons p ON p.id = r1.parent_id AND p.tree_id = $1 AND p.gender = 'FEMALE'
        INNER JOIN persons c1 ON c1.id = r1.child_id AND c1.tree_id = $1
        INNER JOIN persons c2 ON c2.id = r2.child_id AND c2.tree_id = $1
        WHERE c1.birth_date IS NOT NULL
          AND c2.birth_date IS NOT NULL
          AND ABS(c1.birth_date - c2.birth_date) > 2
          AND ABS(c1.birth_date - c2.birth_date) < 210

        LIMIT 250
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    let anomalies: Vec<AnomalyDto> = rows
        .into_iter()
        .map(|r| {
            let (msg_fr, msg_en) = match r.code.as_str() {
                "DEATH_BEFORE_BIRTH" => (
                    format!(
                        "Date de décès ({}) antérieure à la date de naissance ({}).",
                        r.val_b.unwrap_or(0),
                        r.val_a.unwrap_or(0)
                    ),
                    format!(
                        "Death year ({}) is earlier than birth year ({}).",
                        r.val_b.unwrap_or(0),
                        r.val_a.unwrap_or(0)
                    ),
                ),
                "EXTREME_LONGEVITY" => (
                    format!(
                        "Âge au décès inhabituel ({} ans > 110 ans).",
                        r.val_a.unwrap_or(110)
                    ),
                    format!(
                        "Unusual longevity at death ({} yrs > 110 yrs).",
                        r.val_a.unwrap_or(110)
                    ),
                ),
                "PARENT_TOO_YOUNG" => (
                    format!(
                        "Parent ({}) trop jeune ({} ans) à la naissance de l'enfant.",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                    format!(
                        "Parent ({}) was too young ({} yrs) at child's birth.",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                ),
                "PARENT_TOO_OLD" => (
                    format!(
                        "Parent ({}) âgé de {} ans à la naissance de l'enfant.",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                    format!(
                        "Parent ({}) was {} yrs old at child's birth.",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                ),
                "BORN_AFTER_PARENT_DEATH" => (
                    format!(
                        "Né(e) en {} après le décès du parent {} ({}).",
                        r.val_a.unwrap_or(0),
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_b.unwrap_or(0)
                    ),
                    format!(
                        "Born in {} after death of parent {} ({}).",
                        r.val_a.unwrap_or(0),
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_b.unwrap_or(0)
                    ),
                ),
                "SPOUSE_AGE_GAP" => (
                    format!(
                        "Écart d'âge de {} ans avec le conjoint {}.",
                        r.val_a.unwrap_or(0),
                        r.related_person_name.as_deref().unwrap_or("")
                    ),
                    format!(
                        "{} years age difference with spouse {}.",
                        r.val_a.unwrap_or(0),
                        r.related_person_name.as_deref().unwrap_or("")
                    ),
                ),
                "MARRIAGE_BEFORE_BIRTH" => (
                    format!(
                        "Mariage en {} antérieur à la naissance ({}).",
                        r.val_a.unwrap_or(0),
                        r.val_b.unwrap_or(0)
                    ),
                    format!(
                        "Marriage in {} is before birth year ({}).",
                        r.val_a.unwrap_or(0),
                        r.val_b.unwrap_or(0)
                    ),
                ),
                "MARRIAGE_AFTER_DEATH" => (
                    format!(
                        "Mariage en {} postérieur au décès ({}).",
                        r.val_a.unwrap_or(0),
                        r.val_b.unwrap_or(0)
                    ),
                    format!(
                        "Marriage in {} is after death year ({}).",
                        r.val_a.unwrap_or(0),
                        r.val_b.unwrap_or(0)
                    ),
                ),
                "SIBLINGS_SPACING_IMPOSSIBLE" => (
                    format!(
                        "Intervalle de naissance suspect avec la fratrie {} ({} jours).",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                    format!(
                        "Suspicious birth spacing with sibling {} ({} days).",
                        r.related_person_name.as_deref().unwrap_or(""),
                        r.val_a.unwrap_or(0)
                    ),
                ),
                _ => ("Anomalie détectée".to_string(), "Anomaly detected".to_string()),
            };

            AnomalyDto {
                code: r.code,
                severity: r.severity,
                person_id: r.person_id,
                person_name: r.person_name,
                related_person_id: r.related_person_id,
                related_person_name: r.related_person_name,
                message_fr: msg_fr,
                message_en: msg_en,
            }
        })
        .collect();

    Ok(ApiSuccess::new(anomalies))
}

// ─── Audit Log & 1-Click Undo Engine ───────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub user_id: Option<Uuid>,
    pub user_email: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<Uuid>,
    pub entity_label: Option<String>,
    pub before_state: Option<serde_json::Value>,
    pub after_state: Option<serde_json::Value>,
    pub undone: bool,
    pub created_at: DateTime<Utc>,
}

pub async fn record_audit_log(
    pool: &sqlx::PgPool,
    tree_id: Uuid,
    user: &AuthUser,
    action: &str,
    entity_type: &str,
    entity_id: Option<Uuid>,
    entity_label: Option<&str>,
    before_state: Option<serde_json::Value>,
    after_state: Option<serde_json::Value>,
) {
    let _ = sqlx::query(
        r#"
        INSERT INTO audit_logs (
            tree_id, user_id, user_email, action, entity_type, entity_id, entity_label, before_state, after_state
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(tree_id)
    .bind(user.id)
    .bind(&user.email)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(entity_label)
    .bind(before_state)
    .bind(after_state)
    .execute(pool)
    .await;
}

pub async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Query(query): Query<MapQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    let logs = sqlx::query_as::<_, AuditLogDto>(
        r#"
        SELECT id, tree_id, user_id, user_email, action, entity_type, entity_id,
               entity_label, before_state, after_state, undone, created_at
        FROM audit_logs
        WHERE tree_id = $1
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(ApiSuccess::new(logs))
}

pub async fn undo_audit_log(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
    Path(log_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    user.require_modifier()?;

    let log = sqlx::query_as::<_, AuditLogDto>(
        r#"
        SELECT id, tree_id, user_id, user_email, action, entity_type, entity_id,
               entity_label, before_state, after_state, undone, created_at
        FROM audit_logs
        WHERE id = $1
        "#,
    )
    .bind(log_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Audit log entry not found".to_string()))?;

    if log.undone {
        return Err(AppError::BadRequest("This action was already undone".to_string()));
    }

    match (log.action.as_str(), log.entity_type.as_str()) {
        ("CREATE_PERSON", "PERSON") => {
            if let Some(eid) = log.entity_id {
                sqlx::query("DELETE FROM persons WHERE id = $1 AND tree_id = $2")
                    .bind(eid)
                    .bind(log.tree_id)
                    .execute(&state.pool)
                    .await?;
            }
        }
        ("UPDATE_PERSON" | "DELETE_PERSON", "PERSON") => {
            let Some(ref before_val) = log.before_state else {
                return Err(AppError::BadRequest("No snapshot available to undo".to_string()));
            };
            let prev: PersonDto = serde_json::from_value(before_val.clone())
                .map_err(|e| AppError::BadRequest(format!("Invalid snapshot JSON: {}", e)))?;

            let bp_id = find_or_create_place_id(&state.pool, &state.pool, prev.birth_place.as_deref()).await?;
            let dp_id = find_or_create_place_id(&state.pool, &state.pool, prev.death_place.as_deref()).await?;
            let norm = build_normalized_person_fields(
                &prev.given_names,
                prev.usage_surname.as_deref(),
                prev.birth_surname.as_deref(),
                prev.birth_date,
                prev.death_date,
            );

            sqlx::query(
                r#"
                INSERT INTO persons (
                    id, tree_id, usage_surname, birth_surname, given_names, gender,
                    birth_date, birth_place_id, death_date, death_place_id,
                    professions, residences, notes, has_profile_photo, is_root_default,
                    given_names_normalized, surname_normalized, primary_name_normalized,
                    birth_year, death_year
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                ON CONFLICT (id) DO UPDATE SET
                    usage_surname = EXCLUDED.usage_surname,
                    birth_surname = EXCLUDED.birth_surname,
                    given_names = EXCLUDED.given_names,
                    gender = EXCLUDED.gender,
                    birth_date = EXCLUDED.birth_date,
                    birth_place_id = EXCLUDED.birth_place_id,
                    death_date = EXCLUDED.death_date,
                    death_place_id = EXCLUDED.death_place_id,
                    professions = EXCLUDED.professions,
                    residences = EXCLUDED.residences,
                    notes = EXCLUDED.notes,
                    is_root_default = EXCLUDED.is_root_default,
                    given_names_normalized = EXCLUDED.given_names_normalized,
                    surname_normalized = EXCLUDED.surname_normalized,
                    primary_name_normalized = EXCLUDED.primary_name_normalized,
                    birth_year = EXCLUDED.birth_year,
                    death_year = EXCLUDED.death_year,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(prev.id)
            .bind(prev.tree_id)
            .bind(&prev.usage_surname)
            .bind(&prev.birth_surname)
            .bind(&prev.given_names)
            .bind(&prev.gender)
            .bind(prev.birth_date)
            .bind(bp_id)
            .bind(prev.death_date)
            .bind(dp_id)
            .bind(&prev.professions)
            .bind(&prev.residences)
            .bind(&prev.notes)
            .bind(prev.has_profile_photo)
            .bind(prev.is_root_default)
            .bind(norm.given_names_normalized)
            .bind(norm.surname_normalized)
            .bind(norm.primary_name_normalized)
            .bind(norm.birth_year)
            .bind(norm.death_year)
            .execute(&state.pool)
            .await?;

            let _ = PERSON_SELECT_SQL;
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "Undo is not supported for action '{}'",
                log.action
            )));
        }
    }

    sqlx::query("UPDATE audit_logs SET undone = true WHERE id = $1")
        .bind(log_id)
        .execute(&state.pool)
        .await?;

    Ok(ApiSuccess::new(serde_json::json!({
        "undone": true,
        "logId": log_id
    })))
}
