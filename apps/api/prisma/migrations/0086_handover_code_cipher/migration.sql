-- D2 (owner decision 2026-10-07, cluster C7: MJ-H1, U19, U20, U04, U22): store each hand-over code
-- AES-GCM-sealed next to its hash, so showing a code is repeatable. Before this the hash was all the
-- server had, so every "show the code" minted a new one and killed the code on the other phone / with the
-- recipient. The hashes stay the only verifier; these columns are only ever decrypted to show the code
-- again to the customer (delivery) or the counter (pickup).
--
-- Expand-only: two nullable TEXT columns, no default, no backfill (a null cipher = a pre-0086 row, whose
-- first reveal mints once and stores both). Online-safe: ADD COLUMN with no default is metadata-only.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "otp_cipher" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_code_cipher" TEXT;
