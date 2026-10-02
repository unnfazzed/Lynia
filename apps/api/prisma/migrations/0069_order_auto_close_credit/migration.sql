-- Owner 2026-10-02 (after-send-v2 follow-up): a late rating REPLACES the unrated auto-close's
-- reliability credit. The auto-close records the points it actually credited (post-clamp) here; the
-- late rating reverses exactly that and nulls it. Expand-only: a nullable column with no default is a
-- metadata change (no rewrite), and every existing row reads null (no outstanding credit).
ALTER TABLE "orders" ADD COLUMN "auto_close_reliability_credit" INTEGER;
