-- Historical sources, citations and proof links.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "repositories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tree_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tree_id" UUID NOT NULL,
  "repository_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "citations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tree_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "page" TEXT,
  "transcription" TEXT,
  "confidence_score" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "citation_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tree_id" UUID NOT NULL,
  "citation_id" UUID NOT NULL,
  "person_id" UUID,
  "union_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "citation_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "citation_links_single_target_check"
    CHECK (
      ("person_id" IS NOT NULL AND "union_id" IS NULL)
      OR ("person_id" IS NULL AND "union_id" IS NOT NULL)
    )
);

CREATE INDEX "repositories_tree_id_idx" ON "repositories"("tree_id");
CREATE INDEX "repositories_tree_id_name_idx" ON "repositories"("tree_id", "name");

CREATE INDEX "sources_tree_id_idx" ON "sources"("tree_id");
CREATE INDEX "sources_repository_id_idx" ON "sources"("repository_id");
CREATE INDEX "sources_tree_id_title_idx" ON "sources"("tree_id", "title");

CREATE INDEX "citations_tree_id_idx" ON "citations"("tree_id");
CREATE INDEX "citations_source_id_idx" ON "citations"("source_id");

CREATE UNIQUE INDEX "citation_links_citation_id_person_id_key"
  ON "citation_links"("citation_id", "person_id");
CREATE UNIQUE INDEX "citation_links_citation_id_union_id_key"
  ON "citation_links"("citation_id", "union_id");
CREATE INDEX "citation_links_tree_id_idx" ON "citation_links"("tree_id");
CREATE INDEX "citation_links_person_id_idx" ON "citation_links"("person_id");
CREATE INDEX "citation_links_union_id_idx" ON "citation_links"("union_id");

ALTER TABLE "repositories"
  ADD CONSTRAINT "repositories_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_repository_id_fkey"
  FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citations"
  ADD CONSTRAINT "citations_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citations"
  ADD CONSTRAINT "citations_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citation_links"
  ADD CONSTRAINT "citation_links_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citation_links"
  ADD CONSTRAINT "citation_links_citation_id_fkey"
  FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citation_links"
  ADD CONSTRAINT "citation_links_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "citation_links"
  ADD CONSTRAINT "citation_links_union_id_fkey"
  FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
