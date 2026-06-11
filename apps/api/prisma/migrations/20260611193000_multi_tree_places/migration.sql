-- Multi-tree support and normalized geographic places.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "trees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "owner_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "places" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "subdivision" TEXT,
  "region" TEXT,
  "country" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trees_owner_id_idx" ON "trees"("owner_id");
CREATE INDEX "places_name_idx" ON "places"("name");
CREATE INDEX "places_region_idx" ON "places"("region");
CREATE INDEX "places_country_idx" ON "places"("country");

ALTER TABLE "trees"
  ADD CONSTRAINT "trees_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "trees" ("id", "title", "description", "owner_id")
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Arbre principal',
  'Arbre migre automatiquement depuis le modele mono-arbre.',
  NULL
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "persons"
  ADD COLUMN "tree_id" UUID,
  ADD COLUMN "birth_place_id" UUID,
  ADD COLUMN "death_place_id" UUID;

ALTER TABLE "unions"
  ADD COLUMN "tree_id" UUID;

ALTER TABLE "gedcom_jobs"
  ADD COLUMN "tree_id" UUID;

UPDATE "persons"
SET "tree_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "tree_id" IS NULL;

UPDATE "unions" u
SET "tree_id" = p."tree_id"
FROM "persons" p
WHERE u."partner1_id" = p."id"
  AND u."tree_id" IS NULL;

UPDATE "unions"
SET "tree_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "tree_id" IS NULL;

UPDATE "gedcom_jobs"
SET "tree_id" = '00000000-0000-0000-0000-000000000001'::uuid
WHERE "tree_id" IS NULL;

WITH raw_places AS (
  SELECT DISTINCT NULLIF(trim("birth_place"), '') AS raw_place
  FROM "persons"
  WHERE NULLIF(trim("birth_place"), '') IS NOT NULL

  UNION

  SELECT DISTINCT NULLIF(trim("death_place"), '') AS raw_place
  FROM "persons"
  WHERE NULLIF(trim("death_place"), '') IS NOT NULL
),
parsed_places AS (
  SELECT
    raw_place,
    regexp_split_to_array(raw_place, '\s*,\s*') AS parts
  FROM raw_places
),
normalized_places AS (
  SELECT DISTINCT
    parts[1] AS name,
    CASE
      WHEN array_length(parts, 1) >= 4 THEN parts[2]
      ELSE NULL
    END AS subdivision,
    CASE
      WHEN array_length(parts, 1) = 3 THEN parts[2]
      WHEN array_length(parts, 1) >= 4 THEN parts[3]
      ELSE NULL
    END AS region,
    CASE
      WHEN array_length(parts, 1) >= 2 THEN parts[array_length(parts, 1)]
      ELSE NULL
    END AS country
  FROM parsed_places
  WHERE NULLIF(trim(parts[1]), '') IS NOT NULL
)
INSERT INTO "places" ("name", "subdivision", "region", "country")
SELECT name, subdivision, region, country
FROM normalized_places;

WITH parsed AS (
  SELECT
    p."id" AS person_id,
    'birth' AS event_kind,
    regexp_split_to_array(NULLIF(trim(p."birth_place"), ''), '\s*,\s*') AS parts
  FROM "persons" p
  WHERE NULLIF(trim(p."birth_place"), '') IS NOT NULL

  UNION ALL

  SELECT
    p."id" AS person_id,
    'death' AS event_kind,
    regexp_split_to_array(NULLIF(trim(p."death_place"), ''), '\s*,\s*') AS parts
  FROM "persons" p
  WHERE NULLIF(trim(p."death_place"), '') IS NOT NULL
),
normalized AS (
  SELECT
    person_id,
    event_kind,
    parts[1] AS name,
    CASE
      WHEN array_length(parts, 1) >= 4 THEN parts[2]
      ELSE NULL
    END AS subdivision,
    CASE
      WHEN array_length(parts, 1) = 3 THEN parts[2]
      WHEN array_length(parts, 1) >= 4 THEN parts[3]
      ELSE NULL
    END AS region,
    CASE
      WHEN array_length(parts, 1) >= 2 THEN parts[array_length(parts, 1)]
      ELSE NULL
    END AS country
  FROM parsed
)
UPDATE "persons" p
SET "birth_place_id" = pl."id"
FROM normalized n
JOIN "places" pl
  ON pl."name" = n.name
 AND pl."subdivision" IS NOT DISTINCT FROM n.subdivision
 AND pl."region" IS NOT DISTINCT FROM n.region
 AND pl."country" IS NOT DISTINCT FROM n.country
WHERE p."id" = n.person_id
  AND n.event_kind = 'birth';

WITH parsed AS (
  SELECT
    p."id" AS person_id,
    regexp_split_to_array(NULLIF(trim(p."death_place"), ''), '\s*,\s*') AS parts
  FROM "persons" p
  WHERE NULLIF(trim(p."death_place"), '') IS NOT NULL
),
normalized AS (
  SELECT
    person_id,
    parts[1] AS name,
    CASE
      WHEN array_length(parts, 1) >= 4 THEN parts[2]
      ELSE NULL
    END AS subdivision,
    CASE
      WHEN array_length(parts, 1) = 3 THEN parts[2]
      WHEN array_length(parts, 1) >= 4 THEN parts[3]
      ELSE NULL
    END AS region,
    CASE
      WHEN array_length(parts, 1) >= 2 THEN parts[array_length(parts, 1)]
      ELSE NULL
    END AS country
  FROM parsed
)
UPDATE "persons" p
SET "death_place_id" = pl."id"
FROM normalized n
JOIN "places" pl
  ON pl."name" = n.name
 AND pl."subdivision" IS NOT DISTINCT FROM n.subdivision
 AND pl."region" IS NOT DISTINCT FROM n.region
 AND pl."country" IS NOT DISTINCT FROM n.country
WHERE p."id" = n.person_id;

ALTER TABLE "persons"
  ALTER COLUMN "tree_id" SET NOT NULL;

ALTER TABLE "unions"
  ALTER COLUMN "tree_id" SET NOT NULL;

ALTER TABLE "gedcom_jobs"
  ALTER COLUMN "tree_id" SET NOT NULL;

CREATE INDEX "persons_tree_id_idx" ON "persons"("tree_id");
CREATE INDEX "persons_tree_id_is_root_default_idx" ON "persons"("tree_id", "is_root_default");
CREATE INDEX "persons_tree_id_birth_surname_idx" ON "persons"("tree_id", "birth_surname");
CREATE INDEX "persons_tree_id_usage_surname_idx" ON "persons"("tree_id", "usage_surname");
CREATE INDEX "persons_tree_id_given_names_idx" ON "persons"("tree_id", "given_names");
CREATE INDEX "persons_birth_place_id_idx" ON "persons"("birth_place_id");
CREATE INDEX "persons_death_place_id_idx" ON "persons"("death_place_id");
CREATE INDEX "unions_tree_id_idx" ON "unions"("tree_id");
CREATE INDEX "gedcom_jobs_tree_id_idx" ON "gedcom_jobs"("tree_id");

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_birth_place_id_fkey"
  FOREIGN KEY ("birth_place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_death_place_id_fkey"
  FOREIGN KEY ("death_place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "unions"
  ADD CONSTRAINT "unions_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gedcom_jobs"
  ADD CONSTRAINT "gedcom_jobs_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "persons"
  DROP COLUMN "birth_place",
  DROP COLUMN "death_place";
