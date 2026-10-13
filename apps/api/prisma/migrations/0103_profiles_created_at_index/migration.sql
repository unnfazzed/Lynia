-- Admin console v2 §4 (PR 5): the funnels pick each cohort by sign-up time (profiles created in today / 7 / 30
-- Harare days) and the "signed up, no order in 7 days" stuck list windows profiles by created_at. Expand-only,
-- built CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction). Mirrors 0102.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "profiles_created_at_idx"
  ON "profiles" ("created_at");
