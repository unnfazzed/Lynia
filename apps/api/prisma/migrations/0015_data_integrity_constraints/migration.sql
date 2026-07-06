-- Data-integrity hardening (BUG-HUNT P3). Additive: DB CHECK constraints that Prisma's schema
-- language can't express, the missing FK on orders.cancelled_by, and a composite ratings unique
-- that unblocks two-way (customer<->rider) rating of the same order. This runs against a freshly
-- migrated DB in CI, so there are no data-backfill concerns; every statement is guarded
-- (DROP ... IF EXISTS before ADD, CREATE INDEX IF NOT EXISTS) so a re-run is a no-op.

-- 1. CHECK constraints -------------------------------------------------------
-- (Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps these idempotent.)

-- ratings.score must be a 1-5 star value.
ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "ratings_score_range";
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 5);

-- offers.eta_minutes can't be negative.
ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "offers_eta_minutes_nonneg";
ALTER TABLE "offers" ADD CONSTRAINT "offers_eta_minutes_nonneg" CHECK ("eta_minutes" >= 0);

-- orders monetary fields can't be negative. agreed_fare is nullable — guard NULL so an order that
-- hasn't reached an agreed price yet isn't rejected.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_proposed_fare_nonneg";
ALTER TABLE "orders" ADD CONSTRAINT "orders_proposed_fare_nonneg" CHECK ("proposed_fare" >= 0);

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_agreed_fare_nonneg";
ALTER TABLE "orders" ADD CONSTRAINT "orders_agreed_fare_nonneg" CHECK ("agreed_fare" IS NULL OR "agreed_fare" >= 0);

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_suggested_fare_nonneg";
ALTER TABLE "orders" ADD CONSTRAINT "orders_suggested_fare_nonneg" CHECK ("suggested_fare" >= 0);

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_declared_value_nonneg";
ALTER TABLE "orders" ADD CONSTRAINT "orders_declared_value_nonneg" CHECK ("declared_value" >= 0);

-- 2. FK: orders.cancelled_by -> profiles(id) ---------------------------------
-- cancelled_by shipped in 0003 as a bare UUID with no referential integrity. ON DELETE SET NULL:
-- the column is nullable and a "who cancelled" pointer shouldn't block deleting a profile.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cancelled_by_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_fkey"
  FOREIGN KEY ("cancelled_by") REFERENCES "profiles"("id") ON DELETE SET NULL;

-- 3. Ratings two-way ---------------------------------------------------------
-- ratings.by_profile_id already discriminates the rater, so replace the single-column order_id
-- unique (created inline in 0001 as "ratings_order_id_key", which capped each order at ONE rating
-- and thus blocked two-way rating) with a composite (order_id, by_profile_id): one rating per order
-- per rater. The FK "ratings_order_id_fkey" on order_id is a separate constraint and is untouched.
ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "ratings_order_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ratings_order_id_by_profile_id_key"
  ON "ratings"("order_id", "by_profile_id");
