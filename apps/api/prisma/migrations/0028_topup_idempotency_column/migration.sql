-- Top-up create idempotency (BH-09): a client-generated key, one per top-up attempt. A
-- timeout+retry on `POST /wallet/topups` replays the same key; WalletService.createTopup dedupes on
-- (rider_id, idempotency_key) and returns the original pending intent instead of opening a second one
-- for the same attempt. Nullable, no default — additive-only, no table rewrite. The dedup index itself
-- is built CONCURRENTLY in its own migration (0029) so it doesn't take a write lock here.
ALTER TABLE "top_ups" ADD COLUMN "idempotency_key" TEXT;
