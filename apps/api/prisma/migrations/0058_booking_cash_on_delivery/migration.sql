-- Merchant mobile redesign PR 4b (docs/DESIGN-DEVIATIONS.md D-48 §8, owner decision 2026-09-30): cash on
-- delivery is optional per shop booking. `merchant_bookings.collect_cash` records the choice made on the
-- booking form (D3). When true, the rider collects the booking's declared value from the buyer and brings
-- it back to the shop: at delivery the order's existing debt fields open for that amount (the same
-- `debt_status` / `debt_amount` the restaurant cash-back uses), and the shop closes it with "I got $X" or
-- "No cash on this one" (D7). Null / false = delivery only, as every booking before this.
--
-- Online-safe: one nullable column with no default, so no table rewrite and no lock beyond a moment.
ALTER TABLE "merchant_bookings" ADD COLUMN IF NOT EXISTS "collect_cash" BOOLEAN;
