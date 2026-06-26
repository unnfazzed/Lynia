-- Delivery lifecycle (CONCEPT §5 tracker). Adds the milestone timestamps and the delivery-OTP
-- attempt counter the post-assignment flow needs. The 11 OrderStatus values already exist (0001);
-- the one_active_ride partial index already excludes delivered/completed/cancelled, so reaching
-- those frees the rider with no index change.

ALTER TABLE "orders"
  ADD COLUMN "delivered_at"          TIMESTAMP(3),
  ADD COLUMN "completed_at"          TIMESTAMP(3),
  ADD COLUMN "delivery_otp_attempts" INTEGER NOT NULL DEFAULT 0;
