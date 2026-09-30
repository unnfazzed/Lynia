-- Restaurant auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md).
--
-- 1. `merchants.auto_accept` — new cash orders skip the 3:00 accept window and go straight to cooking.
-- 2. `merchants.show_phone_to_customers` — the restaurant consented to its number being shown to a
--    customer with a live order.
-- 3. `orders.auto_accepted` / `kitchen_confirmed_at` / `kitchen_confirmed_by` — an auto-accepted order
--    sends no rider until the kitchen is confirmed (in the app, or by LyniaGo ops after a call).
-- 4. `orders.kitchen_escalated_at` / `ops_no_answer_at` — the ops call list's urgency and call log.
-- 5. `orders.items_edited_at` — items changed after placement (agreed with the customer by phone).
--
-- Online-safe: constant defaults (no table rewrite on PG11+) and nullable columns.
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "auto_accept" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "show_phone_to_customers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "auto_accepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "kitchen_confirmed_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "kitchen_confirmed_by" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "kitchen_escalated_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ops_no_answer_at" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "items_edited_at" TIMESTAMP(3);
