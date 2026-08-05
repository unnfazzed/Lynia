-- Restaurants D1: "Remind me when they open" (docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md §5.3 — the
-- kit's `menu_closed` / `list_empty` states offer this and the app shipped without it).
--
-- Additive only: one NEW table plus its own indexes. Indexes on a table created in the SAME migration
-- are exempt from the CONCURRENTLY rule (CONTRIBUTING §3) — the table is empty and not yet visible to
-- other transactions, so there is nothing to lock. No existing table is touched.

-- CreateTable
CREATE TABLE "restaurant_reopen_reminders" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_reopen_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_reopen_reminders_notified_at_merchant_id_idx" ON "restaurant_reopen_reminders"("notified_at", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_reopen_reminders_profile_id_merchant_id_key" ON "restaurant_reopen_reminders"("profile_id", "merchant_id");

-- AddForeignKey
ALTER TABLE "restaurant_reopen_reminders" ADD CONSTRAINT "restaurant_reopen_reminders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reopen_reminders" ADD CONSTRAINT "restaurant_reopen_reminders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
