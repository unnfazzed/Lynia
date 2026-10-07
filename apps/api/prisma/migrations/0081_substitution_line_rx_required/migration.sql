-- MJ-H4 (reviewed list 2026-10-07, C3b): a "Swap for…" line records, at propose time, whether the item it
-- swaps in is "Prescription needed", so an accepted swap's new order line carries the flag the pharmacist
-- proposed rather than the dish as it reads later.
-- Expand-only: one NOT NULL boolean with a constant default — a catalog-only change on PostgreSQL 11+ (no
-- table rewrite, no long lock); existing rows read false, and the still-live old revision never reads it.
ALTER TABLE "merchant_order_substitution_lines" ADD COLUMN "swap_rx_required" BOOLEAN NOT NULL DEFAULT false;
