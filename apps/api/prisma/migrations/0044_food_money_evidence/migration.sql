-- Restaurants vertical, C4: food money evidence layer (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
-- §5 Lane C). Additive only — every new "orders"/"profiles" column is nullable (or a defaulted array,
-- same shape as C3's dispatch_excluded_rider_ids, no rewrite hazard per CONTRIBUTING.md §3) and one
-- new table is added. No CONCURRENTLY needed: the new table's indexes are on a table CREATEd in this
-- same migration (exempt), and no index is added to the existing "orders"/"profiles" tables.

-- CreateEnum
CREATE TYPE "MerchantDebtStatus" AS ENUM ('open', 'settled_cash', 'settled_goods', 'written_off');

-- CreateEnum
CREATE TYPE "MerchantDebtEntryType" AS ENUM ('opened', 'settled_cash', 'settled_goods', 'written_off');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "merchant_cash_rule" "MerchantCashRule",
ADD COLUMN     "cash_handshake_amount" DECIMAL(10,2),
ADD COLUMN     "customer_cash_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "rider_cash_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "cash_handshake_deadline_at" TIMESTAMP(3),
ADD COLUMN     "cash_handshake_frozen_at" TIMESTAMP(3),
ADD COLUMN     "debt_status" "MerchantDebtStatus",
ADD COLUMN     "debt_amount" DECIMAL(10,2),
ADD COLUMN     "debt_opened_at" TIMESTAMP(3),
ADD COLUMN     "debt_settled_at" TIMESTAMP(3),
ADD COLUMN     "no_show_call_timestamps" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
ADD COLUMN     "refund_reference" TEXT,
ADD COLUMN     "refund_amount" DECIMAL(10,2),
ADD COLUMN     "refunded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "cash_banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cash_ban_reason" TEXT,
ADD COLUMN     "cash_banned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "merchant_debt_ledger" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "type" "MerchantDebtEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_debt_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (exempt from the CONCURRENTLY rule — built on a table CREATEd in this migration)
CREATE UNIQUE INDEX "merchant_debt_ledger_order_id_type_key" ON "merchant_debt_ledger"("order_id", "type");

-- CreateIndex
CREATE INDEX "merchant_debt_ledger_rider_id_merchant_id_idx" ON "merchant_debt_ledger"("rider_id", "merchant_id");

-- CreateIndex
CREATE INDEX "merchant_debt_ledger_merchant_id_created_at_idx" ON "merchant_debt_ledger"("merchant_id", "created_at");

-- AddForeignKey
ALTER TABLE "merchant_debt_ledger" ADD CONSTRAINT "merchant_debt_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_debt_ledger" ADD CONSTRAINT "merchant_debt_ledger_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_debt_ledger" ADD CONSTRAINT "merchant_debt_ledger_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;
