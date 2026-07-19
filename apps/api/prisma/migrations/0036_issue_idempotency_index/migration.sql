-- Built CONCURRENTLY, out-of-band from 0035's column add — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement
-- migration files in one). Partial: only rows that HAVE a key are constrained, so NULLs (old clients
-- that never send one) never collide. Mirrors migration 0029 (top_up_rider_idempotency_key).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "issue_opener_idempotency_key"
  ON "issues" ("opened_by_profile_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
