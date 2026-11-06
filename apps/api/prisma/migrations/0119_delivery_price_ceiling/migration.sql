-- D-125 delivery price ceiling (docs/plans/2026-11-05-delivery-price-ceiling.md). Expand-only: nullable columns,
-- no default, no backfill. An order with a null delivery_ceiling keeps today's fixed delivery fee.
ALTER TABLE "orders" ADD COLUMN "delivery_recommended" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "delivery_ceiling" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "delivery_ladder" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "delivery_start" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "merchant_top_up" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "delivery_venue_funded" BOOLEAN;
ALTER TABLE "orders" ADD COLUMN "delivery_round" INTEGER;
ALTER TABLE "orders" ADD COLUMN "delivery_accepted_round" INTEGER;
ALTER TABLE "orders" ADD COLUMN "delivery_ask_customer_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "delivery_raise_asked_at" TIMESTAMP(3);
