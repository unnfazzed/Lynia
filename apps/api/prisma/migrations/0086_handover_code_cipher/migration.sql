-- D2 (owner decision 2026-10-07, cluster C7: MJ-H1, U19, U20, U04, U22): store each hand-over code
-- AES-GCM-sealed next to its hash, so showing a code is repeatable. Before this the hash was all the
-- server had, so every "show the code" minted a new one and killed the code on the other phone / with the
-- recipient. The hashes stay the only verifier; these columns are only ever decrypted to show the code
-- again to the customer (delivery) or the counter (pickup). Each ciphertext is bound to its order and
-- kind (AES-GCM AAD "<kind>:<orderId>"), so it can't be copied onto another row.
--
-- Expand-only: two nullable TEXT columns, no default, no backfill (a null cipher = a pre-0086 row, whose
-- first reveal mints once and stores both). Online-safe: ADD COLUMN with no default is metadata-only.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "otp_cipher" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_code_cipher" TEXT;

-- D2 review (2026-10-11): a lockout re-issue resets the tries, so each order may re-issue a locked code at
-- most HANDOVER_CODE_MAX_REISSUES times (packages/shared) — per code kind. Counted here. NOT NULL with a
-- constant default is metadata-only on Postgres 11+ (no rewrite); every existing row reads 0.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_code_reissues" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_code_reissues" INTEGER NOT NULL DEFAULT 0;

-- D2 review: a code that can no longer be used must not stay decryptable. One place for every writer
-- (there are many cancel/expiry paths, some in raw SQL): when an order reaches a terminal status both
-- ciphertexts go; once the rider has collected, the pickup ciphertext goes. Fires only when the status or
-- a ciphertext column is written, so ordinary order updates don't pay for it.
CREATE OR REPLACE FUNCTION "orders_clear_handover_ciphers"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('delivered', 'completed', 'cancelled', 'expired', 'undelivered') THEN
    NEW."otp_cipher" := NULL;
    NEW."pickup_code_cipher" := NULL;
  ELSIF NEW."status" IN ('picked_up', 'en_route_dropoff') THEN
    NEW."pickup_code_cipher" := NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "orders_clear_handover_ciphers" ON "orders";
CREATE TRIGGER "orders_clear_handover_ciphers"
  BEFORE INSERT OR UPDATE OF "status", "otp_cipher", "pickup_code_cipher" ON "orders"
  FOR EACH ROW EXECUTE FUNCTION "orders_clear_handover_ciphers"();
