-- National-ID at-rest protection (LR8 / CDPA). The `id_number` column now holds AES-256-GCM ciphertext
-- (PiiCryptoService, `v1:` prefix) instead of the raw number, so a DB dump / backup / read-replica leak
-- never exposes a national ID. Duplicate-ID detection no longer queries the raw value: it matches on
-- `id_number_hash`, a deterministic HMAC of the (normalised) ID.
--
-- This migration only adds the hash column + its index. Existing rows are still legacy plaintext with a
-- NULL hash until the one-time backfill (`pnpm --filter @lynia/api encrypt-ids`) encrypts them and fills
-- the hash — the app reads both forms during that window (decryptId passes plaintext through). Additive +
-- idempotent.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "id_number_hash" TEXT;
CREATE INDEX IF NOT EXISTS "profiles_id_number_hash_idx" ON "profiles" ("id_number_hash");
