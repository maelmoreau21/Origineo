use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiSuccess, AppError, AppResult},
    models::{
        CommonAncestorDto, PersonDto, PersonWithPlaceRow, RelationshipDto, RelationshipPathDto,
        RelationshipPathStepDto, TreeNodeDto, TreeWindowDto, TreeWindowStatsDto, UnionDto,
    },
    persons::PERSON_SELECT_SQL,
    utils::parse_tree_id,
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeQueryParams {
    pub tree_id: Option<String>,
    pub ancestors: Option<i32>,
    pub descendants: Option<i32>,
    pub siblings: Option<bool>,
    pub spouses: Option<bool>,
    pub limit: Option<usize>,
}

pub async fn get_tree_window(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path(root_id): Path<Uuid>,
    Query(query): Query<TreeQueryParams>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;
    let ancestor_generations = query.ancestors.unwrap_or(3).clamp(0, 20);
    let descendant_generations = query.descendants.unwrap_or(3).clamp(0, 20);
    let include_siblings = query.siblings.unwrap_or(true);
    let include_spouses = query.spouses.unwrap_or(true);
    let limit = query.limit.unwrap_or(1500).clamp(25, 5000);

    // Verify root person exists
    let root_exists: Option<(Uuid, bool)> = sqlx::query_as(
        "SELECT id, is_root_default FROM persons WHERE id = $1 AND tree_id = $2",
    )
    .bind(root_id)
    .bind(tree_id)
    .fetch_optional(&state.pool)
    .await?;

    let (root_id, root_is_default) = root_exists
        .ok_or_else(|| AppError::NotFound(format!("Person {} not found in tree", root_id)))?;

    // 1. Recursive CTE for ancestors (indexed on relationships.tree_id + child_id)
    let ancestors: Vec<(Uuid, i32)> = if ancestor_generations > 0 {
        sqlx::query_as(
            r#"
            WITH RECURSIVE ancestors AS (
                SELECT r.parent_id AS id, 1 AS generation
                FROM relationships r
                WHERE r.child_id = $1 AND r.tree_id = $2
                UNION ALL
                SELECT r.parent_id AS id, a.generation + 1
                FROM relationships r
                INNER JOIN ancestors a ON r.child_id = a.id
                WHERE a.generation < $3 AND r.tree_id = $2
            )
            SELECT DISTINCT ON (id) id, generation FROM ancestors ORDER BY id, generation ASC
            "#,
        )
        .bind(root_id)
        .bind(tree_id)
        .bind(ancestor_generations)
        .fetch_all(&state.pool)
        .await?
    } else {
        Vec::new()
    };

    // 2. Recursive CTE for descendants (indexed on relationships.tree_id + parent_id)
    let descendants: Vec<(Uuid, i32)> = if descendant_generations > 0 {
        sqlx::query_as(
            r#"
            WITH RECURSIVE descendants AS (
                SELECT r.child_id AS id, 1 AS generation
                FROM relationships r
                WHERE r.parent_id = $1 AND r.tree_id = $2
                UNION ALL
                SELECT r.child_id AS id, d.generation + 1
                FROM relationships r
                INNER JOIN descendants d ON r.parent_id = d.id
                WHERE d.generation < $3 AND r.tree_id = $2
            )
            SELECT DISTINCT ON (id) id, generation FROM descendants ORDER BY id, generation ASC
            "#,
        )
        .bind(root_id)
        .bind(tree_id)
        .bind(descendant_generations)
        .fetch_all(&state.pool)
        .await?
    } else {
        Vec::new()
    };

    let mut generation_map: HashMap<Uuid, i32> = HashMap::new();
    generation_map.insert(root_id, 0);

    let mut ordered_ids: Vec<Uuid> = vec![root_id];
    let mut seen_ids: HashSet<Uuid> = HashSet::from([root_id]);

    for (id, g) in &ancestors {
        generation_map.insert(*id, -(*g));
        if seen_ids.insert(*id) {
            ordered_ids.push(*id);
        }
    }

    for (id, g) in &descendants {
        generation_map.entry(*id).or_insert(*g);
        if seen_ids.insert(*id) {
            ordered_ids.push(*id);
        }
    }

    // 3. Include siblings of root person (children of root's parents)
    let root_parents: Vec<Uuid> = ancestors
        .iter()
        .filter(|(_, g)| *g == 1)
        .map(|(id, _)| *id)
        .collect();

    if include_siblings && !root_parents.is_empty() {
        let siblings: Vec<(Uuid,)> = sqlx::query_as(
            r#"
            SELECT DISTINCT r.child_id
            FROM relationships r
            WHERE r.tree_id = $2 AND r.parent_id = ANY($1)
            "#,
        )
        .bind(&root_parents)
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?;

        for (sib_id,) in siblings {
            generation_map.entry(sib_id).or_insert(0);
            if seen_ids.insert(sib_id) {
                ordered_ids.push(sib_id);
            }
        }
    }

    // 4. Include spouses & co-parents
    if include_spouses {
        let current_ids = ordered_ids.clone();
        let spouse_unions: Vec<(Uuid, Uuid)> = sqlx::query_as(
            r#"
            SELECT partner1_id, partner2_id
            FROM unions
            WHERE tree_id = $1 AND (partner1_id = ANY($2) OR partner2_id = ANY($2))
            "#,
        )
        .bind(tree_id)
        .bind(&current_ids)
        .fetch_all(&state.pool)
        .await?;

        for (p1, p2) in spouse_unions {
            let p1_gen = generation_map.get(&p1).copied();
            let p2_gen = generation_map.get(&p2).copied();
            if seen_ids.insert(p1) {
                ordered_ids.push(p1);
                if let Some(g) = p2_gen {
                    generation_map.insert(p1, g);
                }
            }
            if seen_ids.insert(p2) {
                ordered_ids.push(p2);
                if let Some(g) = p1_gen {
                    generation_map.insert(p2, g);
                }
            }
        }

        // Co-parents of any child in the current window
        let coparents: Vec<(Uuid, Uuid)> = sqlx::query_as(
            r#"
            SELECT r.parent_id, r.child_id
            FROM relationships r
            WHERE r.tree_id = $2 AND r.child_id = ANY($1)
            "#,
        )
        .bind(&current_ids)
        .bind(tree_id)
        .fetch_all(&state.pool)
        .await?;

        for (parent_id, child_id) in coparents {
            if seen_ids.insert(parent_id) {
                ordered_ids.push(parent_id);
                if let Some(&child_gen) = generation_map.get(&child_id) {
                    generation_map.insert(parent_id, child_gen - 1);
                }
            }
        }
    }

    let total_collected = ordered_ids.len();
    let limited_ids: Vec<Uuid> = ordered_ids.into_iter().take(limit).collect();

    // 5. Fetch person rows, relationships, and unions
    let person_sql = format!(
        "{} WHERE p.tree_id = $1 AND p.id = ANY($2)",
        PERSON_SELECT_SQL
    );
    let person_rows = sqlx::query_as::<_, PersonWithPlaceRow>(&person_sql)
        .bind(tree_id)
        .bind(&limited_ids)
        .fetch_all(&state.pool)
        .await?;

    let visible_ids: Vec<Uuid> = person_rows.iter().map(|r| r.id).collect();

    let relationships = sqlx::query_as::<_, RelationshipDto>(
        r#"
        SELECT id, parent_id, child_id, type::text AS rel_type, created_at
        FROM relationships
        WHERE tree_id = $1 AND parent_id = ANY($2) AND child_id = ANY($2)
        "#,
    )
    .bind(tree_id)
    .bind(&visible_ids)
    .fetch_all(&state.pool)
    .await?;

    let unions = sqlx::query_as::<_, UnionDto>(
        r#"
        SELECT id, tree_id, partner1_id, partner2_id, type::text AS union_type,
               start_date, start_place, end_date, end_reason::text AS end_reason, notes, created_at, updated_at
        FROM unions
        WHERE tree_id = $1 AND partner1_id = ANY($2) AND partner2_id = ANY($2)
        "#,
    )
    .bind(tree_id)
    .bind(&visible_ids)
    .fetch_all(&state.pool)
    .await?;

    // 6. Compute Sosa-Stradonitz numbers (including multi-Sosa Implex) from Sosa root
    let sosa_root_id: Option<Uuid> = if root_is_default {
        Some(root_id)
    } else {
        let default_root: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM persons WHERE tree_id = $1 AND is_root_default = true LIMIT 1",
        )
        .bind(tree_id)
        .fetch_optional(&state.pool)
        .await?;
        default_root.map(|(id,)| id).or(Some(root_id))
    };

    let sosa_map = compute_sosa_numbers(sosa_root_id, &person_rows, &relationships);

    // 7. Build adjacency lists per person
    let mut unions_by_person: HashMap<Uuid, Vec<UnionDto>> = HashMap::new();
    for u in &unions {
        unions_by_person
            .entry(u.partner1_id)
            .or_default()
            .push(u.clone());
        unions_by_person
            .entry(u.partner2_id)
            .or_default()
            .push(u.clone());
    }

    let mut parents_by_child: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    let mut children_by_parent: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for r in &relationships {
        parents_by_child
            .entry(r.child_id)
            .or_default()
            .push(r.parent_id);
        children_by_parent
            .entry(r.parent_id)
            .or_default()
            .push(r.child_id);
    }

    let visible_count = person_rows.len();
    let nodes: Vec<TreeNodeDto> = person_rows
        .into_iter()
        .map(|row| {
            let pid = row.id;
            let sosa_list = sosa_map.get(&pid).cloned().unwrap_or_default();
            let sosa_primary = sosa_list.first().copied();
            let g = generation_map.get(&pid).copied().unwrap_or(0);
            TreeNodeDto {
                person: row.into_dto_with_sosa_list(sosa_primary, sosa_list),
                generation: g,
                unions: unions_by_person.remove(&pid).unwrap_or_default(),
                parents: parents_by_child.remove(&pid).unwrap_or_default(),
                children: children_by_parent.remove(&pid).unwrap_or_default(),
                visible: true,
            }
        })
        .collect();

    let window = TreeWindowDto {
        root_person_id: root_id,
        stats: TreeWindowStatsDto {
            root_person_id: root_id,
            requested_ancestors: ancestor_generations,
            requested_descendants: descendant_generations,
            visible_persons: visible_count,
            total_collected_persons: total_collected,
            visible_relationships: relationships.len(),
            visible_unions: unions.len(),
            limit,
            truncated: total_collected > visible_count,
            includes_siblings: include_siblings,
            includes_spouses: include_spouses,
        },
        nodes,
        relationships,
        unions,
    };

    Ok(ApiSuccess::new(window))
}

fn compute_sosa_numbers(
    sosa_root_id: Option<Uuid>,
    persons: &[PersonWithPlaceRow],
    relationships: &[RelationshipDto],
) -> HashMap<Uuid, Vec<u64>> {
    let mut sosa: HashMap<Uuid, Vec<u64>> = HashMap::new();
    let Some(root_id) = sosa_root_id else {
        return sosa;
    };

    let gender_by_id: HashMap<Uuid, &str> = persons
        .iter()
        .map(|p| (p.id, p.gender.as_str()))
        .collect();

    if !gender_by_id.contains_key(&root_id) {
        return sosa;
    }

    let mut parents_by_child: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for r in relationships {
        parents_by_child
            .entry(r.child_id)
            .or_default()
            .push(r.parent_id);
    }

    sosa.insert(root_id, vec![1]);
    let mut queue = VecDeque::from([(root_id, 1u64, 0u32)]);

    while let Some((child_id, child_sosa, depth)) = queue.pop_front() {
        if depth >= 20 || child_sosa > (u64::MAX / 2 - 1) {
            continue;
        }

        if let Some(parents) = parents_by_child.get(&child_id) {
            for &parent_id in parents {
                let Some(&gender) = gender_by_id.get(&parent_id) else {
                    continue;
                };
                let parent_sosa = match gender {
                    "MALE" => Some(child_sosa * 2),
                    "FEMALE" => Some(child_sosa * 2 + 1),
                    _ => None,
                };
                if let Some(ps) = parent_sosa {
                    let list = sosa.entry(parent_id).or_default();
                    if !list.contains(&ps) && list.len() < 16 {
                        list.push(ps);
                        list.sort_unstable();
                        queue.push_back((parent_id, ps, depth + 1));
                    }
                }
            }
        }
    }

    sosa
}

// ─── True Bidirectional BFS + Consanguinity (Wright) & Implex ──────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipPathQuery {
    pub tree_id: Option<String>,
}

#[derive(Clone, Copy, Debug)]
enum EdgeKind {
    Parent, // moving from child -> parent
    Child,  // moving from parent -> child
    Spouse, // moving between union partners
}

pub async fn get_relationship_path(
    State(state): State<Arc<AppState>>,
    _user: AuthUser,
    Path((person_a_id, person_b_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<RelationshipPathQuery>,
) -> AppResult<impl IntoResponse> {
    let tree_id = parse_tree_id(query.tree_id.as_deref())?;

    if person_a_id == person_b_id {
        let sql = format!("{} WHERE p.id = $1 AND p.tree_id = $2", PERSON_SELECT_SQL);
        let person = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
            .bind(person_a_id)
            .bind(tree_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| AppError::NotFound("Person not found".to_string()))?
            .into_dto(None);

        return Ok(ApiSuccess::new(RelationshipPathDto {
            found: true,
            distance: 0,
            path: vec![person.clone()],
            steps: vec![RelationshipPathStepDto {
                person,
                relation_from_prev: None,
            }],
            summary_fr: Some("Même personne".to_string()),
            summary_en: Some("Same person".to_string()),
            common_ancestors: vec![],
            consanguinity_coefficient: 0.5,
            relationship_coefficient: 1.0,
            is_implex: false,
        }));
    }

    // Load graph edges using the composite index on relationships(tree_id)
    let rels: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT parent_id, child_id FROM relationships WHERE tree_id = $1",
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    let unions: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT partner1_id, partner2_id FROM unions WHERE tree_id = $1",
    )
    .bind(tree_id)
    .fetch_all(&state.pool)
    .await?;

    // adjacency: u -> Vec<(v, EdgeKind from u to v)>
    let mut adj: HashMap<Uuid, Vec<(Uuid, EdgeKind)>> = HashMap::new();
    let mut parents_of: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for (parent_id, child_id) in rels {
        adj.entry(child_id).or_default().push((parent_id, EdgeKind::Parent));
        adj.entry(parent_id).or_default().push((child_id, EdgeKind::Child));
        parents_of.entry(child_id).or_default().push(parent_id);
    }
    for (p1, p2) in unions {
        adj.entry(p1).or_default().push((p2, EdgeKind::Spouse));
        adj.entry(p2).or_default().push((p1, EdgeKind::Spouse));
    }

    // Bidirectional BFS state
    let mut visited_a: HashMap<Uuid, Option<(Uuid, EdgeKind)>> = HashMap::new();
    let mut visited_b: HashMap<Uuid, Option<(Uuid, EdgeKind)>> = HashMap::new();

    let mut queue_a: VecDeque<Uuid> = VecDeque::new();
    let mut queue_b: VecDeque<Uuid> = VecDeque::new();

    visited_a.insert(person_a_id, None);
    visited_b.insert(person_b_id, None);
    queue_a.push_back(person_a_id);
    queue_b.push_back(person_b_id);

    let mut meeting_node: Option<Uuid> = None;

    while !queue_a.is_empty() && !queue_b.is_empty() {
        if queue_a.len() <= queue_b.len() {
            let level_size = queue_a.len();
            for _ in 0..level_size {
                let u = queue_a.pop_front().unwrap();
                if let Some(neighbors) = adj.get(&u) {
                    for &(v, kind) in neighbors {
                        if !visited_a.contains_key(&v) {
                            visited_a.insert(v, Some((u, kind)));
                            if visited_b.contains_key(&v) {
                                meeting_node = Some(v);
                                break;
                            }
                            queue_a.push_back(v);
                        }
                    }
                }
                if meeting_node.is_some() {
                    break;
                }
            }
        } else {
            let level_size = queue_b.len();
            for _ in 0..level_size {
                let u = queue_b.pop_front().unwrap();
                if let Some(neighbors) = adj.get(&u) {
                    for &(v, kind_from_u_to_v) in neighbors {
                        if !visited_b.contains_key(&v) {
                            let kind_towards_b = match kind_from_u_to_v {
                                EdgeKind::Parent => EdgeKind::Child,
                                EdgeKind::Child => EdgeKind::Parent,
                                EdgeKind::Spouse => EdgeKind::Spouse,
                            };
                            visited_b.insert(v, Some((u, kind_towards_b)));
                            if visited_a.contains_key(&v) {
                                meeting_node = Some(v);
                                break;
                            }
                            queue_b.push_back(v);
                        }
                    }
                }
                if meeting_node.is_some() {
                    break;
                }
            }
        }

        if meeting_node.is_some() {
            break;
        }
    }

    let Some(meet) = meeting_node else {
        return Ok(ApiSuccess::new(RelationshipPathDto {
            found: false,
            distance: -1,
            path: vec![],
            steps: vec![],
            summary_fr: None,
            summary_en: None,
            common_ancestors: vec![],
            consanguinity_coefficient: 0.0,
            relationship_coefficient: 0.0,
            is_implex: false,
        }));
    };

    // Reconstruct shortest path from A -> meet -> B
    let mut path_ids: Vec<Uuid> = Vec::new();
    let mut edge_kinds: Vec<EdgeKind> = Vec::new();

    let mut cur = meet;
    let mut left_nodes = vec![cur];
    let mut left_edges = Vec::new();
    while let Some(Some((prev, kind))) = visited_a.get(&cur) {
        left_nodes.push(*prev);
        left_edges.push(*kind);
        cur = *prev;
    }
    left_nodes.reverse();
    left_edges.reverse();

    path_ids.extend(left_nodes);
    edge_kinds.extend(left_edges);

    cur = meet;
    while let Some(Some((next, kind))) = visited_b.get(&cur) {
        path_ids.push(*next);
        edge_kinds.push(*kind);
        cur = *next;
    }

    // ─── Compute Common Ancestors & Wright's Consanguinity / Implex ──
    let anc_a = collect_ancestor_depths(person_a_id, &parents_of, 15);
    let anc_b = collect_ancestor_depths(person_b_id, &parents_of, 15);

    // A common ancestor is a Lowest Common Ancestor (LCA) along a lineage if none of their children
    // is already in the intersection of ancestors of A and B.
    let common_set: HashSet<Uuid> = anc_a
        .keys()
        .filter(|id| anc_b.contains_key(*id))
        .copied()
        .collect();

    let mut lca_ids: Vec<Uuid> = Vec::new();
    let mut consanguinity_phi = 0.0f64;
    let mut total_independent_paths = 0usize;

    for &cand_id in &common_set {
        // Check if any child of cand_id is also in common_set (if so, cand_id is an ancestor of an LCA)
        let has_common_child = adj
            .get(&cand_id)
            .map(|neighbors| {
                neighbors
                    .iter()
                    .any(|(v, kind)| matches!(kind, EdgeKind::Child) && common_set.contains(v))
            })
            .unwrap_or(false);

        if !has_common_child {
            lca_ids.push(cand_id);
            if let (Some(depths_a), Some(depths_b)) = (anc_a.get(&cand_id), anc_b.get(&cand_id)) {
                for &n1 in depths_a {
                    for &n2 in depths_b {
                        let exp = (n1 + n2 + 1) as i32;
                        consanguinity_phi += 0.5f64.powi(exp);
                        total_independent_paths += 1;
                    }
                }
            }
        }
    }

    let mut fetch_ids = path_ids.clone();
    for &lid in &lca_ids {
        if !fetch_ids.contains(&lid) {
            fetch_ids.push(lid);
        }
    }

    let sql = format!(
        "{} WHERE p.tree_id = $1 AND p.id = ANY($2)",
        PERSON_SELECT_SQL
    );
    let rows = sqlx::query_as::<_, PersonWithPlaceRow>(&sql)
        .bind(tree_id)
        .bind(&fetch_ids)
        .fetch_all(&state.pool)
        .await?;

    let dto_map: HashMap<Uuid, PersonDto> = rows
        .into_iter()
        .map(|r| (r.id, r.into_dto(None)))
        .collect();

    let mut ordered_persons: Vec<PersonDto> = Vec::with_capacity(path_ids.len());
    for id in &path_ids {
        if let Some(p) = dto_map.get(id) {
            ordered_persons.push(p.clone());
        }
    }

    let mut common_ancestors: Vec<CommonAncestorDto> = Vec::new();
    for lid in &lca_ids {
        if let (Some(person), Some(da), Some(db)) = (dto_map.get(lid), anc_a.get(lid), anc_b.get(lid)) {
            let min_a = da.iter().copied().min().unwrap_or(0);
            let min_b = db.iter().copied().min().unwrap_or(0);
            common_ancestors.push(CommonAncestorDto {
                person: person.clone(),
                steps_from_a: min_a,
                steps_from_b: min_b,
                path_count: da.len() * db.len(),
            });
        }
    }
    common_ancestors.sort_by_key(|c| c.steps_from_a + c.steps_from_b);

    let mut steps: Vec<RelationshipPathStepDto> = Vec::with_capacity(ordered_persons.len());
    for (idx, person) in ordered_persons.iter().enumerate() {
        let relation_from_prev = if idx == 0 {
            None
        } else {
            let kind = edge_kinds.get(idx - 1).copied().unwrap_or(EdgeKind::Spouse);
            Some(match (kind, person.gender.as_str()) {
                (EdgeKind::Parent, "MALE") => "FATHER".to_string(),
                (EdgeKind::Parent, "FEMALE") => "MOTHER".to_string(),
                (EdgeKind::Parent, _) => "PARENT".to_string(),
                (EdgeKind::Child, "MALE") => "SON".to_string(),
                (EdgeKind::Child, "FEMALE") => "DAUGHTER".to_string(),
                (EdgeKind::Child, _) => "CHILD".to_string(),
                (EdgeKind::Spouse, _) => "SPOUSE".to_string(),
            })
        };

        steps.push(RelationshipPathStepDto {
            person: person.clone(),
            relation_from_prev,
        });
    }

    let distance = (ordered_persons.len().saturating_sub(1)) as i32;
    let (summary_fr, summary_en) = compute_kinship_summary(
        &edge_kinds,
        ordered_persons
            .last()
            .map(|p| p.gender.as_str())
            .unwrap_or("UNKNOWN"),
    );

    let relationship_coeff = (consanguinity_phi * 2.0).min(1.0);
    let is_implex = total_independent_paths > 2 || lca_ids.len() > 2;

    Ok(ApiSuccess::new(RelationshipPathDto {
        found: true,
        distance,
        path: ordered_persons,
        steps,
        summary_fr: Some(summary_fr),
        summary_en: Some(summary_en),
        common_ancestors,
        consanguinity_coefficient: (consanguinity_phi * 100000.0).round() / 100000.0,
        relationship_coefficient: (relationship_coeff * 100000.0).round() / 100000.0,
        is_implex,
    }))
}

fn collect_ancestor_depths(
    start_id: Uuid,
    parents_of: &HashMap<Uuid, Vec<Uuid>>,
    max_depth: usize,
) -> HashMap<Uuid, Vec<usize>> {
    let mut depths: HashMap<Uuid, Vec<usize>> = HashMap::new();
    depths.insert(start_id, vec![0]);
    let mut q = VecDeque::from([(start_id, 0usize)]);

    while let Some((cur, d)) = q.pop_front() {
        if d >= max_depth {
            continue;
        }
        if let Some(parents) = parents_of.get(&cur) {
            for &p in parents {
                let list = depths.entry(p).or_default();
                if list.len() < 8 {
                    list.push(d + 1);
                    q.push_back((p, d + 1));
                }
            }
        }
    }
    depths
}

fn compute_kinship_summary(edges: &[EdgeKind], target_gender: &str) -> (String, String) {
    if edges.is_empty() {
        return ("Même personne".to_string(), "Same person".to_string());
    }

    let is_male = target_gender == "MALE";
    let is_female = target_gender == "FEMALE";

    let mut up = 0usize;
    let mut down = 0usize;
    let mut idx = 0usize;

    while idx < edges.len() && matches!(edges[idx], EdgeKind::Parent) {
        up += 1;
        idx += 1;
    }
    while idx < edges.len() && matches!(edges[idx], EdgeKind::Child) {
        down += 1;
        idx += 1;
    }

    if idx == edges.len() {
        match (up, down) {
            (1, 0) => {
                let fr = if is_male { "Père" } else if is_female { "Mère" } else { "Parent" };
                let en = if is_male { "Father" } else if is_female { "Mother" } else { "Parent" };
                return (fr.to_string(), en.to_string());
            }
            (0, 1) => {
                let fr = if is_male { "Fils" } else if is_female { "Fille" } else { "Enfant" };
                let en = if is_male { "Son" } else if is_female { "Daughter" } else { "Child" };
                return (fr.to_string(), en.to_string());
            }
            (2, 0) => {
                let fr = if is_male { "Grand-père" } else if is_female { "Grand-mère" } else { "Grand-parent" };
                let en = if is_male { "Grandfather" } else if is_female { "Grandmother" } else { "Grandparent" };
                return (fr.to_string(), en.to_string());
            }
            (0, 2) => {
                let fr = if is_male { "Petit-fils" } else if is_female { "Petite-fille" } else { "Petit-enfant" };
                let en = if is_male { "Grandson" } else if is_female { "Granddaughter" } else { "Grandchild" };
                return (fr.to_string(), en.to_string());
            }
            (3, 0) => {
                let fr = if is_male { "Arrière-grand-père" } else if is_female { "Arrière-grand-mère" } else { "Arrière-grand-parent" };
                let en = if is_male { "Great-grandfather" } else if is_female { "Great-grandmother" } else { "Great-grandparent" };
                return (fr.to_string(), en.to_string());
            }
            (0, 3) => {
                let fr = if is_male { "Arrière-petit-fils" } else if is_female { "Arrière-petite-fille" } else { "Arrière-petit-enfant" };
                let en = if is_male { "Great-grandson" } else if is_female { "Great-granddaughter" } else { "Great-grandchild" };
                return (fr.to_string(), en.to_string());
            }
            (1, 1) => {
                let fr = if is_male { "Frère" } else if is_female { "Sœur" } else { "Frère / Sœur" };
                let en = if is_male { "Brother" } else if is_female { "Sister" } else { "Sibling" };
                return (fr.to_string(), en.to_string());
            }
            (2, 1) => {
                let fr = if is_male { "Oncle" } else if is_female { "Tante" } else { "Oncle / Tante" };
                let en = if is_male { "Uncle" } else if is_female { "Aunt" } else { "Uncle / Aunt" };
                return (fr.to_string(), en.to_string());
            }
            (1, 2) => {
                let fr = if is_male { "Neveu" } else if is_female { "Nièce" } else { "Neveu / Nièce" };
                let en = if is_male { "Nephew" } else if is_female { "Niece" } else { "Nephew / Niece" };
                return (fr.to_string(), en.to_string());
            }
            (2, 2) => {
                let fr = if is_male { "Cousin germain" } else if is_female { "Cousine germaine" } else { "Cousin(e) germain(e)" };
                let en = "First cousin".to_string();
                return (fr.to_string(), en);
            }
            (u, 0) if u > 3 => {
                return (
                    format!("Ascendant direct ({} générations)", u),
                    format!("Direct ancestor ({} generations)", u),
                );
            }
            (0, d) if d > 3 => {
                return (
                    format!("Descendant direct ({} générations)", d),
                    format!("Direct descendant ({} generations)", d),
                );
            }
            _ => {}
        }
    }

    if edges.len() == 1 && matches!(edges[0], EdgeKind::Spouse) {
        let fr = if is_male { "Conjoint / Époux" } else if is_female { "Conjointe / Épouse" } else { "Conjoint(e)" };
        let en = if is_male { "Spouse / Husband" } else if is_female { "Spouse / Wife" } else { "Spouse" };
        return (fr.to_string(), en.to_string());
    }

    (
        format!("Lien de parenté en {} degré(s)", edges.len()),
        format!("Kinship connection in {} step(s)", edges.len()),
    )
}
