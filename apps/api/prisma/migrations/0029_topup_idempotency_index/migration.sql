-- Built CONCURRENTLY, out-of-band from 0028's column add — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement
-- migration files in one). Partial: only rows that HAVE a key are constrained, so NULLs (old clients
-- that never send one) never collide. Mirrors migration 0021 (orders_customer_idempotency_key).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "top_up_rider_idempotency_key"
  ON "top_ups" ("rider_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
