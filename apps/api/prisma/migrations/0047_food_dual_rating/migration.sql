-- Dual food + rider ratings with tag chips (#672). The delivered/rate mock (RC.delivered_rate) draws
-- TWO scores — "How was the food?" and "How was <rider>?" — plus feedback tag chips (Hot food · On
-- time · Polite · Right order). The ratings row already holds the rider score (`score`, one row per
-- rater per order); this adds the food score and the tags alongside it, so a food customer's single
-- rating row carries both. The rider reputation aggregate keeps using `score` alone — `food_score`
-- feeds the restaurant rating aggregate (#673) instead.
--
-- Additive only, on an existing table:
--   * `food_score` is NULLABLE (null on every parcel rating and on food ratings left blank).
--   * `tags` is NOT NULL DEFAULT '{}'. In Postgres 11+ a NOT NULL column with a constant default is
--     a catalog-only change (no table rewrite, no backfill scan) — existing rows read '{}' virtually.
-- No existing column is touched; the (order_id, by_profile_id) unique is unchanged.

-- AlterTable
ALTER TABLE "ratings" ADD COLUMN "food_score" INTEGER;
ALTER TABLE "ratings" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
