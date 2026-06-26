-- Cancellation + no-show cooldown (T4). Either side can cancel an in-flight order; a rider-initiated
-- cancel is a no-show strike, and repeated strikes put the rider on a cooldown that blocks going online.
-- `cancelled` is already outside the one_active_ride partial index, so cancelling frees the rider.

ALTER TABLE "orders"
  ADD COLUMN "cancelled_at"  TIMESTAMP(3),
  ADD COLUMN "cancelled_by"  UUID,
  ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "riders"
  ADD COLUMN "cancel_strikes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cooldown_until" TIMESTAMP(3);
