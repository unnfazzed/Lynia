-- Rider account standing + reliability (A-04/Q2) and the cash settlement engine (A-06). Additive:
-- new enums, new nullable/defaulted rider columns, and a new settlements table — existing rows take
-- the defaults (active, reliability 100, not on hold).

CREATE TYPE "RiderAccountStatus" AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE "SettlementStatus"  AS ENUM ('pending', 'paid', 'overdue');

ALTER TABLE "riders"
  ADD COLUMN "account_status"    "RiderAccountStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "suspend_reason"    TEXT,
  ADD COLUMN "reliability_score" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "on_hold"           BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "settlements" (
  "id"             UUID NOT NULL,
  "rider_id"       UUID NOT NULL,
  "period_start"   TIMESTAMP(3) NOT NULL,
  "period_end"     TIMESTAMP(3) NOT NULL,
  "gross_fares"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "commission"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "refunds_netted" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "amount_due"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "status"         "SettlementStatus" NOT NULL DEFAULT 'pending',
  "due_date"       TIMESTAMP(3) NOT NULL,
  "paid_at"        TIMESTAMP(3),
  "method"         TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlements_rider_id_period_start_key" ON "settlements"("rider_id", "period_start");
CREATE INDEX "settlements_status_idx" ON "settlements"("status");
CREATE INDEX "settlements_rider_id_idx" ON "settlements"("rider_id");

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "riders"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;
