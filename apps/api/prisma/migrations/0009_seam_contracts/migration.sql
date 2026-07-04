-- 2026 seam contracts (INTERFACE-AUDIT C1–C9) + journey-review flows. All additive/nullable so the
-- deployed pilot keeps working: existing rows carry NULL / the zero default, and old clients that
-- never hit the new paths are unaffected.
--
-- `undelivered` terminal (C6/F-02), per-item pickup confirmation, pre-broadcast disclaimer consent
-- (A1-8), rider-cancel re-broadcast lineage (F-01), and the KYC resubmission counter (A-02).

-- New terminal status. ADD VALUE is non-transactional-safe in PG12+ as long as the value isn't used
-- in DDL in the same migration (it isn't — the columns below are plain text/timestamps).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'undelivered';

ALTER TABLE "orders"
  ADD COLUMN "items_collected"        jsonb,
  ADD COLUMN "undelivered_reason"     TEXT,
  ADD COLUMN "undelivered_at"         TIMESTAMP(3),
  ADD COLUMN "delivery_attempts"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disclaimer_version"     TEXT,
  ADD COLUMN "disclaimer_accepted_at" TIMESTAMP(3),
  ADD COLUMN "rebroadcast_of_id"      UUID;

CREATE INDEX "orders_rebroadcast_of_id_idx" ON "orders"("rebroadcast_of_id");

ALTER TABLE "riders"
  ADD COLUMN "kyc_attempts" INTEGER NOT NULL DEFAULT 0;
