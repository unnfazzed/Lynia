-- Line-items on orders (ITEM-DESIGN-REVIEW decision: multiple {description, quantity} rows).
--
-- Additive + nullable so the deployed pilot keeps working: existing rows (and any order an old
-- mobile client creates through the legacy `itemDescription` path) simply carry NULL. `item_desc`
-- is untouched — it stays the compact summary every listing/board/history consumer already reads.

ALTER TABLE "orders" ADD COLUMN "items" jsonb;
