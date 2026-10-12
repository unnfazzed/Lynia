-- Cold-start auction tuning (owner, 2026-10-12). A parcel auction's end is no longer always created_at + 90 s:
-- it is longer when few riders are online, and a price raise leaves riders at least a minute to answer it. The
-- end is stored so the API, the customer countdown and the rider board read one value. fare_raised_at is the
-- last raise, which lets a rider who already answered the old price bid again on the new one.
--
-- Expand-only: nullable columns with no default are a catalog-only change on PostgreSQL (no table rewrite, no
-- long lock). Existing rows read NULL, which the code treats as created_at + 90 s and "never raised" — exactly
-- how every row was treated before, so the still-live old revision neither reads nor writes them. No backfill.
ALTER TABLE "orders" ADD COLUMN "offer_window_ends_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "fare_raised_at" TIMESTAMP(3);
