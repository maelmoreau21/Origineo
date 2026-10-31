use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DEFAULT_TREE_ID: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum UserRole {
    Reader = 1,
    Modifier = 2,
    Admin = 3,
}

impl UserRole {
    pub fn from_str(s: &str) -> Self {
        match s.trim().to_uppercase().as_str() {
            "ADMIN" | "ADMINISTRATEUR" | "ADMINISTRATOR" => UserRole::Admin,
            "MODIFIER" | "MODIFICATEUR" | "EDITOR" | "EDITEUR" => UserRole::Modifier,
            _ => UserRole::Reader,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Admin => "ADMIN",
            UserRole::Modifier => "MODIFIER",
            UserRole::Reader => "READER",
        }
    }

    pub fn can_modify(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Modifier)
    }

    pub fn is_admin(&self) -> bool {
        matches!(self, UserRole::Admin)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub oidc_subject: Option<String>,
    pub display_name: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
}

impl From<UserRow> for UserDto {
    fn from(r: UserRow) -> Self {
        Self {
            id: r.id,
            email: r.email,
            display_name: r.display_name,
            role: UserRole::from_str(&r.role),
            created_at: r.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PersonWithPlaceRow {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub usage_surname: Option<String>,
    pub birth_surname: Option<String>,
    pub given_names: String,
    pub gender: String,
    pub birth_date: Option<NaiveDate>,
    pub birth_place_id: Option<Uuid>,
    pub birth_place_formatted: Option<String>,
    pub death_date: Option<NaiveDate>,
    pub death_place_id: Option<Uuid>,
    pub death_place_formatted: Option<String>,
    pub professions: Vec<String>,
    pub notes: Option<String>,
    pub nickname: Option<String>,
    pub title: Option<String>,
    pub baptism_date: Option<NaiveDate>,
    pub baptism_place: Option<String>,
    pub burial_date: Option<NaiveDate>,
    pub burial_place: Option<String>,
    pub death_cause: Option<String>,
    pub religion: Option<String>,
    pub physical_description: Option<String>,
    pub nationality: Option<String>,
    pub education: Option<String>,
    pub residences: Vec<String>,
    pub military_regiment: Option<String>,
    pub military_serial: Option<String>,
    pub nobility_coat_of_arms: Option<String>,
    pub signature_status: Option<String>,
    pub birth_republican: Option<String>,
    pub death_republican: Option<String>,
    pub has_profile_photo: bool,
    pub is_root_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub usage_surname: Option<String>,
    pub birth_surname: Option<String>,
    pub given_names: String,
    pub nickname: Option<String>,
    pub title: Option<String>,
    pub gender: String,
    pub birth_date: Option<NaiveDate>,
    pub birth_place: Option<String>,
    pub birth_place_id: Option<Uuid>,
    pub birth_republican: Option<String>,
    pub baptism_date: Option<NaiveDate>,
    pub baptism_place: Option<String>,
    pub death_date: Option<NaiveDate>,
    pub death_place: Option<String>,
    pub death_place_id: Option<Uuid>,
    pub death_republican: Option<String>,
    pub burial_date: Option<NaiveDate>,
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
    pub professions: Vec<String>,
    pub residences: Vec<String>,
    pub notes: Option<String>,
    pub has_profile_photo: bool,
    pub is_root_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sosa_number: Option<u64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sosa_numbers: Vec<u64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl PersonWithPlaceRow {
    pub fn into_dto(self, sosa_number: Option<u64>) -> PersonDto {
        let sosa_numbers = sosa_number.into_iter().collect();
        self.into_dto_with_sosa_list(sosa_number, sosa_numbers)
    }

    pub fn into_dto_with_sosa_list(
        self,
        sosa_number: Option<u64>,
        sosa_numbers: Vec<u64>,
    ) -> PersonDto {
        PersonDto {
            id: self.id,
            tree_id: self.tree_id,
            usage_surname: self.usage_surname,
            birth_surname: self.birth_surname,
            given_names: self.given_names,
            nickname: self.nickname,
            title: self.title,
            gender: self.gender,
            birth_date: self.birth_date,
            birth_place: self.birth_place_formatted,
            birth_place_id: self.birth_place_id,
            birth_republican: self.birth_republican,
            baptism_date: self.baptism_date,
            baptism_place: self.baptism_place,
            death_date: self.death_date,
            death_place: self.death_place_formatted,
            death_place_id: self.death_place_id,
            death_republican: self.death_republican,
            burial_date: self.burial_date,
            burial_place: self.burial_place,
            death_cause: self.death_cause,
            religion: self.religion,
            physical_description: self.physical_description,
            nationality: self.nationality,
            education: self.education,
            military_regiment: self.military_regiment,
            military_serial: self.military_serial,
            nobility_coat_of_arms: self.nobility_coat_of_arms,
            signature_status: self.signature_status,
            professions: self.professions,
            residences: self.residences,
            notes: self.notes,
            has_profile_photo: self.has_profile_photo,
            is_root_default: self.is_root_default,
            sosa_number,
            sosa_numbers,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipDto {
    pub id: Uuid,
    pub parent_id: Uuid,
    pub child_id: Uuid,
    #[serde(rename = "type")]
    pub rel_type: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UnionDto {
    pub id: Uuid,
    pub tree_id: Uuid,
    pub partner1_id: Uuid,
    pub partner2_id: Uuid,
    #[serde(rename = "type")]
    pub union_type: String,
    pub start_date: Option<NaiveDate>,
    pub start_place: Option<String>,
    pub end_date: Option<NaiveDate>,
    pub end_reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDto {
    pub id: Uuid,
    pub person_id: Option<Uuid>,
    pub union_id: Option<Uuid>,
    pub filename: String,
    pub mime_type: String,
    pub storage_path: String,
    pub category: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTagDto {
    pub id: Uuid,
    pub document_id: Uuid,
    pub person_id: Uuid,
    pub person_given_names: String,
    pub person_surname: Option<String>,
    pub x_pct: f64,
    pub y_pct: f64,
    pub w_pct: f64,
    pub h_pct: f64,
    pub label: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNodeDto {
    pub person: PersonDto,
    pub generation: i32,
    pub unions: Vec<UnionDto>,
    pub parents: Vec<Uuid>,
    pub children: Vec<Uuid>,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeWindowStatsDto {
    pub root_person_id: Uuid,
    pub requested_ancestors: i32,
    pub requested_descendants: i32,
    pub visible_persons: usize,
    pub total_collected_persons: usize,
    pub visible_relationships: usize,
    pub visible_unions: usize,
    pub limit: usize,
    pub truncated: bool,
    pub includes_siblings: bool,
    pub includes_spouses: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeWindowDto {
    pub root_person_id: Uuid,
    pub nodes: Vec<TreeNodeDto>,
    pub relationships: Vec<RelationshipDto>,
    pub unions: Vec<UnionDto>,
    pub stats: TreeWindowStatsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipPathStepDto {
    pub person: PersonDto,
    pub relation_from_prev: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommonAncestorDto {
    pub person: PersonDto,
    pub steps_from_a: usize,
    pub steps_from_b: usize,
    pub path_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipPathDto {
    pub found: bool,
    pub distance: i32,
    pub path: Vec<PersonDto>,
    pub steps: Vec<RelationshipPathStepDto>,
    pub summary_fr: Option<String>,
    pub summary_en: Option<String>,
    pub common_ancestors: Vec<CommonAncestorDto>,
    pub consanguinity_coefficient: f64,
    pub relationship_coefficient: f64,
    pub is_implex: bool,
}
