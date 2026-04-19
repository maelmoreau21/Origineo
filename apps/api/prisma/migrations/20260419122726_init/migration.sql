-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER');

-- CreateEnum
CREATE TYPE "UnionType" AS ENUM ('MARRIAGE', 'PACS', 'PARTNERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "UnionEndReason" AS ENUM ('DIVORCE', 'DEATH', 'ANNULMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('BIRTH_CERTIFICATE', 'DEATH_CERTIFICATE', 'MARRIAGE_CERTIFICATE', 'PHOTO', 'OFFICIAL_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VISITOR');

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "usage_surname" TEXT,
    "birth_surname" TEXT,
    "given_names" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "birth_date" DATE,
    "birth_place" TEXT,
    "death_date" DATE,
    "death_place" TEXT,
    "professions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "is_root_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "type" "RelationshipType" NOT NULL DEFAULT 'BIOLOGICAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unions" (
    "id" UUID NOT NULL,
    "partner1_id" UUID NOT NULL,
    "partner2_id" UUID NOT NULL,
    "type" "UnionType" NOT NULL DEFAULT 'MARRIAGE',
    "start_date" DATE,
    "start_place" TEXT,
    "end_date" DATE,
    "end_reason" "UnionEndReason",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "person_id" UUID,
    "union_id" UUID,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VISITOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "persons_birth_surname_idx" ON "persons"("birth_surname");

-- CreateIndex
CREATE INDEX "persons_usage_surname_idx" ON "persons"("usage_surname");

-- CreateIndex
CREATE INDEX "persons_given_names_idx" ON "persons"("given_names");

-- CreateIndex
CREATE INDEX "persons_birth_date_idx" ON "persons"("birth_date");

-- CreateIndex
CREATE INDEX "relationships_parent_id_idx" ON "relationships"("parent_id");

-- CreateIndex
CREATE INDEX "relationships_child_id_idx" ON "relationships"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_parent_id_child_id_key" ON "relationships"("parent_id", "child_id");

-- CreateIndex
CREATE INDEX "unions_partner1_id_idx" ON "unions"("partner1_id");

-- CreateIndex
CREATE INDEX "unions_partner2_id_idx" ON "unions"("partner2_id");

-- CreateIndex
CREATE INDEX "documents_person_id_idx" ON "documents"("person_id");

-- CreateIndex
CREATE INDEX "documents_union_id_idx" ON "documents"("union_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_partner1_id_fkey" FOREIGN KEY ("partner1_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_partner2_id_fkey" FOREIGN KEY ("partner2_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
