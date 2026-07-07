-- Order-create idempotency (BUG-HUNT): a client-generated key, one per compose attempt. A
-- timeout+retry or a double-tap on "Broadcast" replays the same key; OrdersService.create dedupes on
-- (customer_id, idempotency_key) and returns the original order instead of opening a second live
-- auction for the same trip. Nullable, no default — additive-only, no table rewrite. The dedup index
-- itself is built CONCURRENTLY in its own migration (0021) so it doesn't take a write lock here.
ALTER TABLE "orders" ADD COLUMN "idempotency_key" TEXT;
