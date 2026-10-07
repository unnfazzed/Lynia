-- Owner decision D1 (2026-10-07): every merchant-side wait runs up to 24 h, and the customer is pushed
-- "Still waiting for {venue}" at 3 and 15 minutes while the venue hasn't accepted. This counter is the
-- idempotency guard: each push is sent once per order (FoodOrderService.sweepStillWaiting).
-- Expand-only: one NOT NULL column with a constant default — on PostgreSQL 11+ that is a catalog-only
-- change (no table rewrite, no long lock); existing rows read 0, and the still-live old revision neither
-- reads nor writes the column.
ALTER TABLE "orders" ADD COLUMN "merchant_wait_nudges" INTEGER NOT NULL DEFAULT 0;
