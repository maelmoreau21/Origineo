-- Dynamic events and participants.

CREATE TABLE "events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tree_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "date" DATE,
  "date_raw" TEXT,
  "notes" TEXT,
  "place_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_participants_event_id_person_id_key"
  ON "event_participants"("event_id", "person_id");

CREATE INDEX "events_tree_id_idx" ON "events"("tree_id");
CREATE INDEX "events_place_id_idx" ON "events"("place_id");
CREATE INDEX "events_type_idx" ON "events"("type");
CREATE INDEX "events_date_idx" ON "events"("date");
CREATE INDEX "event_participants_person_id_idx" ON "event_participants"("person_id");
CREATE INDEX "event_participants_role_idx" ON "event_participants"("role");

ALTER TABLE "events"
  ADD CONSTRAINT "events_tree_id_fkey"
  FOREIGN KEY ("tree_id") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
  ADD CONSTRAINT "events_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_participants"
  ADD CONSTRAINT "event_participants_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participants"
  ADD CONSTRAINT "event_participants_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
