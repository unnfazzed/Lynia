-- Dedicated last-POSITION-write timestamp for riders (F-02). `updated_at` is @updatedAt — bumped by
-- ANY rider-row write (reliability delta, online toggle, admin action, heartbeat touch) — so the
-- no-Redis getSnapshot fallback could pair a stale lat/lng with a fresh timestamp and render it as
-- "live". This column is set only when lat/lng/geog are actually written (tracking.service writePosition
-- + updateRiderLocation). Additive, nullable, no default — online-safe, no table rewrite.
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "position_updated_at" TIMESTAMP(3);
