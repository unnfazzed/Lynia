-- Food dispatch offers each round to several riders at once (owner decision 2026-10-01, ledger D-54: the
-- best 10 first, then everyone after 60s; the first to accept gets it). A rider's live offer is now read
-- from their own pending food_dispatch_attempts row, so index it by rider. Built CONCURRENTLY, the only
-- statement in the file (CONCURRENTLY can't run inside a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "food_dispatch_attempts_rider_id_outcome_expires_at_idx"
  ON "food_dispatch_attempts" ("rider_id", "outcome", "expires_at");
