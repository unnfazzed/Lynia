-- Admin console v2 §3: at most one `free_job` receipt per (rider, order), the same partial-unique backstop
-- 0031 gives `ride_commission`. chargeCommission checks-then-inserts under the account row lock (the
-- control flow); this index only makes a duplicate impossible. Built CONCURRENTLY, the only statement in the
-- file (CONCURRENTLY can't run inside a transaction). Separate from 0091 because a new enum value can't be
-- used in the transaction that added it. The table has no free_job rows yet, so the build cannot fail.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "commission_ledger_free_job_once"
  ON "commission_ledger" ("rider_id", "order_id")
  WHERE "type" = 'free_job';
