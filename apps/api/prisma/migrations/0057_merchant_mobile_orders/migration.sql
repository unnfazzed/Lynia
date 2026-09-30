-- Merchant mobile redesign PR 2 (docs/DESIGN-DEVIATIONS.md D-48, packages/design/handoff/merchant-mobile).
--
-- 1. `merchants.closed_until` — the Orders header's open/closed switch (B1/B5). Set when the merchant
--    closes by hand; the API then serves the restaurant as closed (today's window dropped from its
--    hours) and refuses new orders until that time passes or the merchant opens again.
-- 2. `orders.merchant_closed_at` / `merchant_close_reason` — the merchant closing its side of a food
--    order after pickup without counting cash (B7 "No cash on this one · mark completed", B6 "Mark
--    ride completed"). It never touches the delivery's own status, the rider or the customer; it only
--    stops the order showing as cash owed.
--
-- Online-safe: nullable columns with no default, so no table rewrite and no lock beyond a moment.
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "closed_until" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "merchant_closed_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "merchant_close_reason" TEXT;
