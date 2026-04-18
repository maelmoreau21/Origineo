// ══════════════════════════════════════
// Origineo — Shared Types
// ══════════════════════════════════════

import {
  Gender,
  RelationshipType,
  UnionType,
  UnionEndReason,
  DocumentCategory,
  UserRole,
} from '../enums';

// ─── Person ─────────────────────────────────
export interface PersonDto {
  id: string;
  usageSurname: string | null;
  birthSurname: string | null;
  givenNames: string;
  gender: Gender;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  professions: string[];
  notes: string | null;
  isRootDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonDto {
  usageSurname?: string | null;
  birthSurname?: string | null;
  givenNames: string;
  gender?: Gender;
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  professions?: string[];
  notes?: string | null;
  isRootDefault?: boolean;
}

export interface UpdatePersonDto extends Partial<CreatePersonDto> {}

// ─── Relationship ───────────────────────────
export interface RelationshipDto {
  id: string;
  parentId: string;
  childId: string;
  type: RelationshipType;
  createdAt: string;
}

export interface CreateRelationshipDto {
  parentId: string;
  childId: string;
  type?: RelationshipType;
}

// ─── Union ──────────────────────────────────
export interface UnionDto {
  id: string;
  partner1Id: string;
  partner2Id: string;
  type: UnionType;
  startDate: string | null;
  startPlace: string | null;
  endDate: string | null;
  endReason: UnionEndReason | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnionDto {
  partner1Id: string;
  partner2Id: string;
  type?: UnionType;
  startDate?: string | null;
  startPlace?: string | null;
  endDate?: string | null;
  endReason?: UnionEndReason | null;
  notes?: string | null;
}

export interface UpdateUnionDto extends Partial<Omit<CreateUnionDto, 'partner1Id' | 'partner2Id'>> {}

// ─── Document ───────────────────────────────
export interface DocumentDto {
  id: string;
  personId: string | null;
  unionId: string | null;
  filename: string;
  mimeType: string;
  storagePath: string;
  category: DocumentCategory;
  description: string | null;
  createdAt: string;
}

// ─── Tree ───────────────────────────────────
export interface TreeQueryParams {
  rootPersonId: string;
  ancestorGenerations?: number;
  descendantGenerations?: number;
}

export interface TreeNodeDto {
  person: PersonDto;
  generation: number;
  unions: UnionDto[];
  parents: string[];
  children: string[];
}

export interface TreeDataDto {
  rootPersonId: string;
  nodes: TreeNodeDto[];
  relationships: RelationshipDto[];
  unions: UnionDto[];
}

// ─── Search ─────────────────────────────────
export interface SearchParams {
  query: string;
  page?: number;
  limit?: number;
}

export interface SearchResultDto {
  persons: PersonDto[];
  total: number;
  page: number;
  limit: number;
}

// ─── Auth ───────────────────────────────────
export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
}

// ─── API Response ───────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
