-- Restaurants vertical, C1: merchant domain + menu (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
-- §5 Lane C). Additive only — expands the existing (unused-at-launch) "merchants" table and adds two new
-- tables. No existing column is dropped, renamed, or narrowed; every new NOT NULL column carries a default
-- so this applies cleanly against a live table that may already hold rows.

-- CreateEnum
CREATE TYPE "MerchantCashRule" AS ENUM ('collect_and_return', 'pay_upfront');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "busy_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cash_rule" "MerchantCashRule" NOT NULL DEFAULT 'collect_and_return',
ADD COLUMN     "cover_photo_url" TEXT,
ADD COLUMN     "cuisine_tags" TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "hours" JSONB,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "owner_profile_id" UUID,
ADD COLUMN     "pilot_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_level" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "merchant_categories" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "available_from" TEXT,
    "available_to" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_dishes" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "photo_url" TEXT,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "out_of_stock_until" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_dishes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_categories_merchant_id_idx" ON "merchant_categories"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_dishes_category_id_idx" ON "merchant_dishes"("category_id");

-- CreateIndex
CREATE INDEX "merchant_dishes_merchant_id_idx" ON "merchant_dishes"("merchant_id");

-- The unique index on "merchants"."owner_profile_id" is built CONCURRENTLY, out-of-band, in the
-- next migration (0041) — "merchants" is a pre-existing table, and CONCURRENTLY can't run inside
-- the transaction Prisma wraps this file in (CONTRIBUTING "Changing the data model", mirrors 0037/0038).

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_categories" ADD CONSTRAINT "merchant_categories_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_dishes" ADD CONSTRAINT "merchant_dishes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "merchant_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
