-- Order flow v2, backend B (ledger D-59): scheduled orders (BRIEF §12), prescriptions behind RX_ENABLED
-- (BRIEF §13) and the customer's owed balance after a cancel after collection (BRIEF §14 / D3f).
--
-- Expand-only and online-safe:
--  * three BOOLEAN NOT NULL DEFAULT false columns on existing tables — a constant default is
--    metadata-only on PG11+ (no rewrite), the 0063 precedent;
--  * three NEW tables, whose indexes are built in the same migration (empty, not yet visible);
--  * no existing column, enum, index or constraint is changed. Old API code ignores all of it.

-- "Prescription needed" on a catalogue item, and its snapshot on an order line.
ALTER TABLE "merchant_dishes" ADD COLUMN IF NOT EXISTS "rx_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "merchant_order_items" ADD COLUMN IF NOT EXISTS "rx_required" BOOLEAN NOT NULL DEFAULT false;

-- The team member who may approve or decline a prescription.
ALTER TABLE "merchant_members" ADD COLUMN IF NOT EXISTS "is_pharmacist" BOOLEAN NOT NULL DEFAULT false;

-- A scheduled order's slot and ring time.
CREATE TABLE IF NOT EXISTS "order_schedules" (
  "order_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "rings_at" TIMESTAMP(3) NOT NULL,
  "rung_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_schedules_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "order_schedules_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "order_schedules_rung_at_rings_at_idx" ON "order_schedules" ("rung_at", "rings_at");
CREATE INDEX IF NOT EXISTS "order_schedules_merchant_id_scheduled_for_idx" ON "order_schedules" ("merchant_id", "scheduled_for");

-- A pharmacy order's prescription.
CREATE TABLE IF NOT EXISTS "order_prescriptions" (
  "order_id" UUID NOT NULL,
  "photo_keys" TEXT[],
  "patient_name" TEXT NOT NULL,
  "consent_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decline_reason" TEXT,
  "decline_note" TEXT,
  "checked_at" TIMESTAMP(3),
  "checked_by_profile_id" UUID,
  "rider_saw_original_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_prescriptions_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "order_prescriptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- What a customer owes after cancelling a collected order, and the order carrying it.
CREATE TABLE IF NOT EXISTS "customer_balance_entries" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "source_order_id" UUID NOT NULL,
  "merchant_id" UUID,
  "amount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'cancel_after_pickup',
  "applied_order_id" UUID,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_balance_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_balance_entries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_balance_entries_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_balance_entries_applied_order_id_fkey" FOREIGN KEY ("applied_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_balance_entries_source_order_id_key" ON "customer_balance_entries" ("source_order_id");
CREATE INDEX IF NOT EXISTS "customer_balance_entries_profile_id_idx" ON "customer_balance_entries" ("profile_id");
CREATE INDEX IF NOT EXISTS "customer_balance_entries_applied_order_id_idx" ON "customer_balance_entries" ("applied_order_id");
