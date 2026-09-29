-- Merchant web upgrade L3 (docs/plans/2026-09-29-merchant-web-upgrade-plan.md §7, D10): a business's own
-- riders. The owner adds a rider by the phone number they sign in to LyniaGo with, under the business's own
-- label ("Blessing"). Rows are matched to riders by phone when used, never by a stored rider id, so a biker
-- who signs up after being added becomes the business's rider on their own. Preferred never bends
-- eligibility: it only orders a business's offers and its restaurant auto-dispatch.
-- A new table: none of CONTRIBUTING's online-safety rules for existing tables apply. `added_by_profile_id`
-- is a plain id, not a foreign key, so a team change or an erased profile never takes the list with it.

CREATE TABLE "merchant_preferred_riders" (
  "id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "added_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_preferred_riders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_preferred_riders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per business and number; also serves the business's own list.
CREATE UNIQUE INDEX "merchant_preferred_riders_merchant_id_phone_key" ON "merchant_preferred_riders" ("merchant_id", "phone");
-- Which businesses call this number their rider (ops, and the Phase 2 rider-side notice).
CREATE INDEX "merchant_preferred_riders_phone_idx" ON "merchant_preferred_riders" ("phone");
