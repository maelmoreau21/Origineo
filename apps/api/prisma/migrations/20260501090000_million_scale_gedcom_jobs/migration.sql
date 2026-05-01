-- Million-scale tree windows and persistent GEDCOM import/merge jobs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "GedcomJobMode" AS ENUM ('IMPORT', 'MERGE');
CREATE TYPE "GedcomJobStatus" AS ENUM ('ANALYZING', 'READY', 'APPLYING', 'DONE', 'FAILED');
CREATE TYPE "GedcomDecisionAction" AS ENUM ('MERGE', 'CREATE', 'SKIP');

ALTER TABLE "persons"
  ADD COLUMN "given_names_normalized" TEXT,
  ADD COLUMN "surname_normalized" TEXT,
  ADD COLUMN "primary_name_normalized" TEXT,
  ADD COLUMN "birth_year" INTEGER,
  ADD COLUMN "death_year" INTEGER;

UPDATE "persons"
SET
  "given_names_normalized" = NULLIF(trim(regexp_replace(lower(coalesce("given_names", '')), '[^a-z0-9]+', ' ', 'g')), ''),
  "surname_normalized" = NULLIF(trim(regexp_replace(lower(coalesce("usage_surname", "birth_surname", '')), '[^a-z0-9]+', ' ', 'g')), ''),
  "primary_name_normalized" = NULLIF(trim(regexp_replace(lower(concat_ws(' ', coalesce("given_names", ''), coalesce("usage_surname", "birth_surname", ''))), '[^a-z0-9]+', ' ', 'g')), ''),
  "birth_year" = EXTRACT(YEAR FROM "birth_date")::INTEGER,
  "death_year" = EXTRACT(YEAR FROM "death_date")::INTEGER;

CREATE INDEX "persons_given_names_normalized_idx" ON "persons"("given_names_normalized");
CREATE INDEX "persons_surname_normalized_idx" ON "persons"("surname_normalized");
CREATE INDEX "persons_primary_name_normalized_idx" ON "persons"("primary_name_normalized");
CREATE INDEX "persons_birth_year_idx" ON "persons"("birth_year");
CREATE INDEX "persons_death_year_idx" ON "persons"("death_year");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "persons_primary_name_normalized_trgm_idx"
  ON "persons" USING gin ("primary_name_normalized" gin_trgm_ops);
CREATE INDEX "persons_surname_normalized_trgm_idx"
  ON "persons" USING gin ("surname_normalized" gin_trgm_ops);

CREATE TABLE "gedcom_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mode" "GedcomJobMode" NOT NULL,
  "status" "GedcomJobStatus" NOT NULL DEFAULT 'ANALYZING',
  "filename" TEXT NOT NULL,
  "total_persons" INTEGER NOT NULL DEFAULT 0,
  "total_families" INTEGER NOT NULL DEFAULT 0,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "new_person_count" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "gedcom_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gedcom_staged_persons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL,
  "pointer" TEXT NOT NULL,
  "given_names" TEXT NOT NULL,
  "surname" TEXT,
  "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
  "birth_date_raw" TEXT,
  "birth_place" TEXT,
  "death_date_raw" TEXT,
  "death_place" TEXT,
  "notes" TEXT,
  "normalized_given_names" TEXT,
  "normalized_surname" TEXT,
  "birth_year" INTEGER,
  "best_existing_person_id" UUID,
  "best_confidence" INTEGER,
  "decision" "GedcomDecisionAction",
  "merge_into_person_id" UUID,
  "created_person_id" UUID,
  CONSTRAINT "gedcom_staged_persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gedcom_staged_families" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL,
  "pointer" TEXT NOT NULL,
  "husband_pointer" TEXT,
  "wife_pointer" TEXT,
  "child_pointers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "marriage_date_raw" TEXT,
  "marriage_place" TEXT,
  CONSTRAINT "gedcom_staged_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gedcom_duplicate_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staged_person_id" UUID NOT NULL,
  "existing_person_id" UUID NOT NULL,
  "confidence" INTEGER NOT NULL,
  "match_reasons" JSONB NOT NULL,
  CONSTRAINT "gedcom_duplicate_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gedcom_staged_persons_job_id_pointer_key"
  ON "gedcom_staged_persons"("job_id", "pointer");
CREATE INDEX "gedcom_staged_persons_job_id_idx" ON "gedcom_staged_persons"("job_id");
CREATE INDEX "gedcom_staged_persons_normalized_surname_idx" ON "gedcom_staged_persons"("normalized_surname");
CREATE INDEX "gedcom_staged_persons_normalized_given_names_idx" ON "gedcom_staged_persons"("normalized_given_names");
CREATE INDEX "gedcom_staged_persons_birth_year_idx" ON "gedcom_staged_persons"("birth_year");
CREATE INDEX "gedcom_staged_persons_best_existing_person_id_idx" ON "gedcom_staged_persons"("best_existing_person_id");

CREATE UNIQUE INDEX "gedcom_staged_families_job_id_pointer_key"
  ON "gedcom_staged_families"("job_id", "pointer");
CREATE INDEX "gedcom_staged_families_job_id_idx" ON "gedcom_staged_families"("job_id");

CREATE UNIQUE INDEX "gedcom_duplicate_candidates_staged_person_id_existing_person_id_key"
  ON "gedcom_duplicate_candidates"("staged_person_id", "existing_person_id");
CREATE INDEX "gedcom_duplicate_candidates_existing_person_id_idx"
  ON "gedcom_duplicate_candidates"("existing_person_id");

CREATE INDEX "gedcom_jobs_mode_idx" ON "gedcom_jobs"("mode");
CREATE INDEX "gedcom_jobs_status_idx" ON "gedcom_jobs"("status");
CREATE INDEX "gedcom_jobs_created_at_idx" ON "gedcom_jobs"("created_at");

ALTER TABLE "gedcom_staged_persons"
  ADD CONSTRAINT "gedcom_staged_persons_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "gedcom_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gedcom_staged_families"
  ADD CONSTRAINT "gedcom_staged_families_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "gedcom_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gedcom_duplicate_candidates"
  ADD CONSTRAINT "gedcom_duplicate_candidates_staged_person_id_fkey"
  FOREIGN KEY ("staged_person_id") REFERENCES "gedcom_staged_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
