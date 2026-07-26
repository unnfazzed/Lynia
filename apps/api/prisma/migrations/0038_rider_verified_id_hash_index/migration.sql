-- Built CONCURRENTLY, out-of-band from 0037's column add — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement
-- migration files in one). Partial: only riders that HAVE a vendor-verified document hash are
-- indexed — the applyKycResult dedupe probe and admin.getKycReview collision lookup both filter on
-- equality against a non-null hash. Mirrors migration 0021/0029/0036.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "riders_verified_id_hash_idx"
  ON "riders" ("verified_id_hash")
  WHERE "verified_id_hash" IS NOT NULL;
