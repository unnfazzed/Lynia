-- Restaurants vertical, C3: food dispatch (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
-- §5 Lane C). Additive only — expands "orders" with nullable columns (no rewrite, per CONTRIBUTING.md
-- §3) and adds one new table. No CONCURRENTLY needed: every new index below is on a table CREATEd in
-- this same migration (exempt, CONTRIBUTING.md §3), and no index is added to the existing "orders"
-- table — its pre-existing @@index([status]) already covers the dispatch sweep's status filter at
-- pilot scale.

-- CreateEnum
CREATE TYPE "FoodDispatchOutcome" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dispatch_offered_rider_id" UUID,
ADD COLUMN     "dispatch_offer_expires_at" TIMESTAMP(3),
ADD COLUMN     "dispatch_attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dispatch_started_at" TIMESTAMP(3),
ADD COLUMN     "dispatch_excluded_rider_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "no_rider_hold_at" TIMESTAMP(3),
ADD COLUMN     "dispatch_next_check_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_dispatch_offered_rider_id_fkey" FOREIGN KEY ("dispatch_offered_rider_id") REFERENCES "riders"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "food_dispatch_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "offered_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "outcome" "FoodDispatchOutcome" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_dispatch_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (exempt from the CONCURRENTLY rule — built on a table CREATEd in this migration)
CREATE UNIQUE INDEX "food_dispatch_attempts_order_id_rider_id_key" ON "food_dispatch_attempts"("order_id", "rider_id");

-- CreateIndex
CREATE INDEX "food_dispatch_attempts_order_id_idx" ON "food_dispatch_attempts"("order_id");

-- AddForeignKey
ALTER TABLE "food_dispatch_attempts" ADD CONSTRAINT "food_dispatch_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_dispatch_attempts" ADD CONSTRAINT "food_dispatch_attempts_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;
