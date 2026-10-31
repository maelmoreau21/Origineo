-- ============================================================================
-- ORIGINEO STUDIO v2.0 — SINGLE CANONICAL SCHEMA (PostgreSQL 18 Alpine)
-- Engineered for 10,000,000+ Individuals & High-Performance Graph Traversals
-- Zero heavy BLOBs: Documents stored on filesystem (UUID paths), DB stores metadata only.
-- Extensions: pgcrypto, pg_trgm, unaccent, fuzzystrmatch, btree_gin
-- Native Features: uuidv7(), GIN trigram indexes, JSONB extensible schemas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

ALTER EXTENSION "pgcrypto" UPDATE;
ALTER EXTENSION "pg_trgm" UPDATE;
ALTER EXTENSION "unaccent" UPDATE;
ALTER EXTENSION "fuzzystrmatch" UPDATE;
ALTER EXTENSION "btree_gin" UPDATE;

-- ----------------------------------------------------------------------------
-- 1. USERS & SSO OIDC IDENTITY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "oidc_subject" TEXT,
    "display_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'READER', -- 'ADMIN', 'MODIFIER', 'READER'
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_oidc_subject_key" ON "users"("oidc_subject") WHERE "oidc_subject" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. TREES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "trees" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trees_owner_id_idx" ON "trees"("owner_id");

INSERT INTO "trees" ("id", "title", "description")
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Arbre Généalogique Principal',
    'Arbre généalogique principal Origineo'
)
ON CONFLICT ("id") DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. PLACES (Normalised Geo-Gazetteer for Migration Maps & Demographics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "places" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "subdivision" TEXT,
    "region" TEXT,
    "country" TEXT,
    "insee_code" TEXT, -- Code INSEE officiel pour communes françaises
    "postal_code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "places_name_idx" ON "places"("name");
CREATE INDEX IF NOT EXISTS "places_insee_code_idx" ON "places"("insee_code") WHERE "insee_code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "places_coords_idx" ON "places"("latitude", "longitude") WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. PERSONS (Million-Scale B-Tree & GIN Trigram Optimized)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "persons" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    
    -- Nom & Prénoms
    "usage_surname" TEXT,
    "birth_surname" TEXT,
    "given_names" TEXT NOT NULL,
    "nickname" TEXT,
    "title" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'UNKNOWN',
    
    -- Naissance
    "birth_date" DATE,
    "birth_place_id" UUID REFERENCES "places"("id") ON DELETE SET NULL,
    "birth_republican" TEXT, -- ex: "14 Brumaire An IV"
    
    -- Baptême
    "baptism_date" DATE,
    "baptism_place" TEXT,
    
    -- Décès
    "death_date" DATE,
    "death_place_id" UUID REFERENCES "places"("id") ON DELETE SET NULL,
    "death_cause" TEXT,
    "death_republican" TEXT,
    
    -- Sépulture
    "burial_date" DATE,
    "burial_place" TEXT,
    
    -- Identité, Carrière & Trajectoire
    "professions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "residences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "nationality" TEXT,
    "religion" TEXT,
    "physical_description" TEXT,
    "education" TEXT,
    "military_regiment" TEXT, -- Carrière militaire
    "military_serial" TEXT,   -- Matricule militaire
    "nobility_coat_of_arms" TEXT, -- Armoiries / Blason
    "signature_status" TEXT,  -- 'SIGNS', 'DOES_NOT_SIGN', 'UNKNOWN'
    
    -- Évolutivité sans migration : champs personnalisés
    "custom_attributes" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    
    -- Normalisation & Recherche Trigramme ultra-rapide
    "given_names_normalized" TEXT,
    "surname_normalized" TEXT,
    "primary_name_normalized" TEXT,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    
    -- Flags UI
    "has_profile_photo" BOOLEAN NOT NULL DEFAULT false,
    "is_root_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- Core multi-column indexes for million-scale sub-5ms filters
CREATE INDEX IF NOT EXISTS "persons_tree_id_idx" ON "persons"("tree_id");
CREATE INDEX IF NOT EXISTS "persons_tree_id_is_root_default_idx" ON "persons"("tree_id", "is_root_default") WHERE "is_root_default" = true;
CREATE INDEX IF NOT EXISTS "persons_tree_surname_norm_idx" ON "persons"("tree_id", "surname_normalized");
CREATE INDEX IF NOT EXISTS "persons_tree_given_norm_idx" ON "persons"("tree_id", "given_names_normalized");
CREATE INDEX IF NOT EXISTS "persons_tree_birth_year_idx" ON "persons"("tree_id", "birth_year");
CREATE INDEX IF NOT EXISTS "persons_tree_death_year_idx" ON "persons"("tree_id", "death_year");
CREATE INDEX IF NOT EXISTS "persons_birth_place_id_idx" ON "persons"("birth_place_id");
CREATE INDEX IF NOT EXISTS "persons_death_place_id_idx" ON "persons"("death_place_id");
CREATE INDEX IF NOT EXISTS "persons_custom_attr_gin_idx" ON "persons" USING gin ("custom_attributes");

-- GIN Trigram indexes for sub-10ms fuzzy text search on 10,000,000+ rows
CREATE INDEX IF NOT EXISTS "persons_primary_name_normalized_trgm_idx" ON "persons" USING gin ("primary_name_normalized" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "persons_surname_normalized_trgm_idx" ON "persons" USING gin ("surname_normalized" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "persons_given_names_normalized_trgm_idx" ON "persons" USING gin ("given_names_normalized" gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 5. RELATIONSHIPS (Denormalized Graph Traversal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "relationships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "parent_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "child_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL DEFAULT 'BIOLOGICAL', -- 'BIOLOGICAL', 'ADOPTIVE', 'FOSTER'
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "relationships_parent_id_child_id_key" ON "relationships"("parent_id", "child_id");
CREATE INDEX IF NOT EXISTS "relationships_tree_parent_idx" ON "relationships"("tree_id", "parent_id");
CREATE INDEX IF NOT EXISTS "relationships_tree_child_idx" ON "relationships"("tree_id", "child_id");
CREATE INDEX IF NOT EXISTS "relationships_parent_id_idx" ON "relationships"("parent_id");
CREATE INDEX IF NOT EXISTS "relationships_child_id_idx" ON "relationships"("child_id");

-- ----------------------------------------------------------------------------
-- 6. UNIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "unions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "partner1_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "partner2_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL DEFAULT 'MARRIAGE', -- 'MARRIAGE', 'PACS', 'PARTNERSHIP', 'OTHER'
    "start_date" DATE,
    "start_republican" TEXT,
    "start_place" TEXT,
    "end_date" DATE,
    "end_reason" TEXT,
    "marriage_contract_date" DATE,
    "notary_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "unions_tree_id_idx" ON "unions"("tree_id");
CREATE INDEX IF NOT EXISTS "unions_partner1_id_idx" ON "unions"("partner1_id");
CREATE INDEX IF NOT EXISTS "unions_partner2_id_idx" ON "unions"("partner2_id");

-- ----------------------------------------------------------------------------
-- 7. REPOSITORIES (Dépôts d'Archives Départementales, Nationales, Municipales)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "repositories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ARCHIVES_DEPARTEMENTALES',
    "website_url" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "repositories_tree_id_idx" ON "repositories"("tree_id");

-- ----------------------------------------------------------------------------
-- 8. SOURCES (Registres BMS/NMD, Cotes, Livres, Protocoles Notariés)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sources" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "repository_id" UUID REFERENCES "repositories"("id") ON DELETE SET NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "call_number" TEXT, -- Cote d'archive (ex: 3E 45/12, 1Mi 204)
    "source_type" TEXT NOT NULL DEFAULT 'REGISTRE_PAROISSIAL',
    "reliability" TEXT NOT NULL DEFAULT 'PRIMARY', -- 'PRIMARY', 'SECONDARY', 'QUESTIONABLE', 'ORAL'
    "url" TEXT,
    "text_extract" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sources_tree_id_idx" ON "sources"("tree_id");
CREATE INDEX IF NOT EXISTS "sources_repository_id_idx" ON "sources"("repository_id");
CREATE INDEX IF NOT EXISTS "sources_call_number_idx" ON "sources"("call_number");

-- ----------------------------------------------------------------------------
-- 9. CITATIONS (Preuves reliant une Source à un Individu ou une Union)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "citations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "source_id" UUID NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
    "person_id" UUID REFERENCES "persons"("id") ON DELETE CASCADE,
    "union_id" UUID REFERENCES "unions"("id") ON DELETE CASCADE,
    "page_folio" TEXT, -- Ex: "Vue 42/120, Acte N° 14"
    "confidence" INTEGER NOT NULL DEFAULT 3, -- 0 (Rejeté) à 4 (Certain)
    "transcription" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "citations_source_id_idx" ON "citations"("source_id");
CREATE INDEX IF NOT EXISTS "citations_person_id_idx" ON "citations"("person_id");
CREATE INDEX IF NOT EXISTS "citations_union_id_idx" ON "citations"("union_id");

-- ----------------------------------------------------------------------------
-- 10. EVENTS & PARTICIPANTS (Témoins, Parrains, Marraines, Célébrants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL,
    "date" DATE,
    "date_raw" TEXT,
    "notes" TEXT,
    "place_id" UUID REFERENCES "places"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "events_tree_id_idx" ON "events"("tree_id");
CREATE INDEX IF NOT EXISTS "events_place_id_idx" ON "events"("place_id");

CREATE TABLE IF NOT EXISTS "event_participants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
    "person_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT 'SUBJECT', -- 'SUBJECT', 'PARRAIN', 'MARRAINE', 'TEMOIN', 'NOTAIRE', etc.
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_participants_event_id_person_id_key" ON "event_participants"("event_id", "person_id");
CREATE INDEX IF NOT EXISTS "event_participants_person_id_idx" ON "event_participants"("person_id");

-- ----------------------------------------------------------------------------
-- 11. DOCUMENTS & MEDIA (Filesystem Metadata — No DB bloat)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "person_id" UUID REFERENCES "persons"("id") ON DELETE SET NULL,
    "union_id" UUID REFERENCES "unions"("id") ON DELETE SET NULL,
    "source_id" UUID REFERENCES "sources"("id") ON DELETE SET NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "documents_person_id_idx" ON "documents"("person_id");
CREATE INDEX IF NOT EXISTS "documents_union_id_idx" ON "documents"("union_id");
CREATE INDEX IF NOT EXISTS "documents_source_id_idx" ON "documents"("source_id");

CREATE TABLE IF NOT EXISTS "document_tags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "person_id" UUID NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
    "x_pct" DOUBLE PRECISION NOT NULL,
    "y_pct" DOUBLE PRECISION NOT NULL,
    "w_pct" DOUBLE PRECISION NOT NULL,
    "h_pct" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_tags_doc_idx" ON "document_tags"("document_id");
CREATE INDEX IF NOT EXISTS "document_tags_person_idx" ON "document_tags"("person_id");

-- ----------------------------------------------------------------------------
-- 12. AUDIT LOGS (Audit trail & 1-Click Undo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tree_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES "trees"("id") ON DELETE CASCADE,
    "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "user_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "entity_label" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_tree_id_idx" ON "audit_logs"("tree_id");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs"("entity_type", "entity_id");

-- ----------------------------------------------------------------------------
-- 13. SYSTEM SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
