-- Restaurant discovery data (#673, part a): the food browse/list/search cards draw a restaurant
-- rating and an ETA the C1 read API can't back today (they fall back to monogram + "Open now").
--
--   * `food_rating_avg` / `food_rating_count` — the restaurant's star rating, a denormalised
--     aggregate of the customers' food scores (Rating.food_score, #672), maintained on the
--     customer's rate() the same way the rider's rating_avg/rating_count already are. Read on the
--     list card in one query instead of a correlated AVG per row.
--   * `prep_baseline_minutes` — the merchant's typical kitchen prep time (nullable until set). The
--     card's ETA is prep_baseline + a delivery-leg estimate the CLIENT computes from the customer's
--     deliver-to distance (deliveryFeeForDistance / RESTAURANTS_TIMING already ship in
--     @lynia/shared), so only the prep half is a server/merchant datum.
--
-- Additive only, on an existing table. The two aggregates are NOT NULL DEFAULT 0 (catalog-only in
-- PG11+, no rewrite); prep_baseline_minutes is nullable. No existing column is touched.

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "food_rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "merchants" ADD COLUMN "food_rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "merchants" ADD COLUMN "prep_baseline_minutes" INTEGER;
