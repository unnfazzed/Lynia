-- Restaurants vertical, C5 (customer push contract, N-22): docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
-- §5 Lane C. Additive only — one nullable column on "orders", no rewrite hazard, no index (a
-- reconciler-sweep filter column, low cardinality of interest — every candidate row already narrows
-- via order_type/status/merchant_phase/payment_requested_at first).

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_reminder_sent_at" TIMESTAMP(3);
