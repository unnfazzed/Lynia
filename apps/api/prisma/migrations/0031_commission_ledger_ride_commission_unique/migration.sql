-- Built CONCURRENTLY, out-of-band from 0030's DROP INDEX — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement migration
-- files in one). Partial: only ride_commission rows are constrained to one per (rider_id, order_id) —
-- adjustment/topup/grace/reversal rows are never constrained against each other or against a
-- ride_commission row, matching the pre-existing NULL-orderId-is-distinct behavior those types relied on,
-- now made explicit rather than accidental. Mirrors migration 0029 (top_up_rider_idempotency_key).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "commission_ledger_ride_commission_once"
  ON "commission_ledger" ("rider_id", "order_id")
  WHERE "type" = 'ride_commission';
