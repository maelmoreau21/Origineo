// ══════════════════════════════════════
// Origineo — Shared Enums
// ══════════════════════════════════════

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

export enum RelationshipType {
  BIOLOGICAL = 'BIOLOGICAL',
  ADOPTIVE = 'ADOPTIVE',
  FOSTER = 'FOSTER',
}

export enum UnionType {
  MARRIAGE = 'MARRIAGE',
  PACS = 'PACS',
  PARTNERSHIP = 'PARTNERSHIP',
  OTHER = 'OTHER',
}

export enum UnionEndReason {
  DIVORCE = 'DIVORCE',
  DEATH = 'DEATH',
  ANNULMENT = 'ANNULMENT',
  OTHER = 'OTHER',
}

export enum DocumentCategory {
  BIRTH_CERTIFICATE = 'BIRTH_CERTIFICATE',
  DEATH_CERTIFICATE = 'DEATH_CERTIFICATE',
  MARRIAGE_CERTIFICATE = 'MARRIAGE_CERTIFICATE',
  PHOTO = 'PHOTO',
  OFFICIAL_DOCUMENT = 'OFFICIAL_DOCUMENT',
  OTHER = 'OTHER',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  VISITOR = 'VISITOR',
}
