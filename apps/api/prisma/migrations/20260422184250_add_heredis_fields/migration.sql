-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "baptism_date" DATE,
ADD COLUMN     "baptism_place" TEXT,
ADD COLUMN     "burial_date" DATE,
ADD COLUMN     "burial_place" TEXT,
ADD COLUMN     "death_cause" TEXT,
ADD COLUMN     "education" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "physical_description" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "residences" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "title" TEXT;
