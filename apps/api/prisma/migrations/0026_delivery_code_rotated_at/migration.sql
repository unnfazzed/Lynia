-- KB-DELIVERY-CODE-ROTATION-SIGNAL (bug-sweep 2026-07-14, follow-up to DS14-09): DS14-09's client-side
-- rotation detection leaned on an attempts-counter high-water mark, which only fires if the client
-- observed the elevated attempt count before an app-kill. This column is the robust signal: the moment
-- the delivery code was last (re)issued. rotateDeliveryCode stamps it on every re-issue, and the
-- assignment path (matching.selectOffer) stamps it when the code is first minted, so the rider app can
-- detect a rotation by a change in the timestamp regardless of what it observed before.
--
-- Additive, nullable, no default (null = pre-0026 row / order never assigned a code → the field simply
-- reads null in the snapshot, exactly the DS14-09 attempts-only behaviour, no backfill needed). Online-safe.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_code_rotated_at" TIMESTAMP(3);
