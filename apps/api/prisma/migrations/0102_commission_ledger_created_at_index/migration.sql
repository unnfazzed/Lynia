-- Admin console v2 §6 (PR 6): the platform money panel and its CSV sum the whole ledger by Harare day over
-- the last 7 or 30 days. Expand-only, built CONCURRENTLY, the only statement in the file (CONCURRENTLY
-- can't run inside a transaction). Mirrors 0093.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_ledger_created_at_idx"
  ON "commission_ledger" ("created_at");
