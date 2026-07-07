-- Built CONCURRENTLY, out-of-band from 0020's column add — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement
-- migration files in one). Partial: only rows that HAVE a key are constrained, so NULLs (old clients
-- that never send one) never collide.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "order_customer_idempotency_key"
  ON "orders" ("customer_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
