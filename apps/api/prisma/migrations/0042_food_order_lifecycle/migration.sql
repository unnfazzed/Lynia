-- Restaurants vertical, C2: food order lifecycle (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
-- §5 Lane C). Additive only — expands the existing "merchants"/"orders" tables and adds one new table.
-- No existing column is dropped, renamed, or narrowed; every new NOT NULL column carries a default so
-- this applies cleanly against the live (pre-launch, effectively empty) tables.
--
-- Hand-written rather than `prisma migrate dev`'s raw diff: the auto-generated diff against this
-- schema also proposed dropping/recreating every FK in the database, dropping the raw-SQL
-- `pickup_geog`/`riders.geog` GiST indexes, and renaming/adding indexes unrelated to this change —
-- pre-existing drift between the migration history and `schema.prisma` (earlier migrations used raw
-- SQL for constructs Prisma's DSL can't express, e.g. Unsupported geography columns and CONCURRENTLY
-- index builds, which the shadow-DB differ doesn't recognize as already matching). None of that is
-- part of this change; only the statements below are, and they were verified against a live apply.

-- CreateEnum
CREATE TYPE "MerchantPhase" AS ENUM ('awaiting_accept', 'awaiting_item_approval', 'awaiting_payment', 'preparing', 'ready_for_pickup');

-- CreateEnum
CREATE TYPE "MerchantPaymentMethod" AS ENUM ('cash', 'wallet');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "location" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "merchant_phase" "MerchantPhase",
ADD COLUMN     "accept_deadline_at" TIMESTAMP(3),
ADD COLUMN     "item_approval_deadline_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "merchant_payment_method" "MerchantPaymentMethod",
ADD COLUMN     "payment_call_logged_at" TIMESTAMP(3),
ADD COLUMN     "payment_requested_at" TIMESTAMP(3),
ADD COLUMN     "merchant_payment_reference" TEXT,
ADD COLUMN     "merchant_payment_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "prep_minutes" INTEGER,
ADD COLUMN     "prep_started_at" TIMESTAMP(3),
ADD COLUMN     "ready_at" TIMESTAMP(3),
ADD COLUMN     "pickup_code_hash" TEXT,
ADD COLUMN     "pickup_code_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "merchant_goods_total" DECIMAL(10,2),
ADD COLUMN     "delivery_fee" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "merchant_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "dish_id" UUID,
    "name_snapshot" TEXT NOT NULL,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "available" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (exempt from the CONTRIBUTING.md CONCURRENTLY rule — built on a table CREATEd in this
-- same migration, so it's empty and not yet visible to other transactions).
CREATE INDEX "merchant_order_items_order_id_idx" ON "merchant_order_items"("order_id");

-- AddForeignKey
ALTER TABLE "merchant_order_items" ADD CONSTRAINT "merchant_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_order_items" ADD CONSTRAINT "merchant_order_items_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "merchant_dishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
