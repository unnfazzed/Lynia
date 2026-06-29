-- Device push tokens (FCM, A4). One profile has many tokens (multiple devices); a token is globally
-- unique and re-registering upserts it to the current owner. Cascade-deleted with the profile, so a
-- deleted account leaves no orphaned push targets. Written only via Prisma, which supplies the uuid id.

CREATE TABLE "device_tokens" (
  "id"         UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "token"      TEXT NOT NULL,
  "platform"   TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens" ("token");
CREATE INDEX "device_tokens_profile_id_idx" ON "device_tokens" ("profile_id");

ALTER TABLE "device_tokens"
  ADD CONSTRAINT "device_tokens_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
