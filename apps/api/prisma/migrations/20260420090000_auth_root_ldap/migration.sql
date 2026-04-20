-- Create table for system-wide settings (auth, LDAP, etc.)
CREATE TABLE "system_settings" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
