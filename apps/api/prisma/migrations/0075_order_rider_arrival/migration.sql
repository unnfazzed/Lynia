-- Merchant v2 (ledger D-77): the rider's arrival at the pickup and their estimated arrival at the next
-- stop, both derived from the rider's location pings. Expand-only: two nullable columns, no default, no
-- rewrite; existing rows stay null.
ALTER TABLE "orders" ADD COLUMN "rider_arrived_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "rider_eta_at" TIMESTAMP(3);
