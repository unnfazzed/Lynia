-- Merchant web upgrade L2 (docs/plans/2026-09-29-merchant-web-upgrade-plan.md §7, D9): who is behind each
-- business delivery. A booking is a Send order whose customer of record is the business's booking account
-- (a profile with phone `business:<merchant id>`), so Send stays unchanged; this row keeps the team member
-- who booked it, picked the rider and cancelled it ("Booked by Tendai", and the Phase 2 activity trail).
-- A new table: none of CONTRIBUTING's online-safety rules for existing tables apply. The person columns are
-- plain ids, not foreign keys, so a team change or an erased profile never takes a business's history with it.

CREATE TABLE "merchant_bookings" (
  "order_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "booked_by_profile_id" UUID NOT NULL,
  "picked_by_profile_id" UUID,
  "cancelled_by_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_bookings_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "merchant_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "merchant_bookings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "merchant_bookings_merchant_id_created_at_idx" ON "merchant_bookings" ("merchant_id", "created_at");
