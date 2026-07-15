-- Rider prepaid commission wallet (docs/plans/2026-rider-wallet-design.md — PR1 wallet core).
-- Additive + online-safe: three new tables + three enums, no change to existing tables. Ships inert
-- at ratePct 0 (no ledger rows are written until the flip). The dormant "settlements" table is left in
-- place (its drop is a separate destructive migration once the wallet has soaked — see the PR body).

-- Enums -----------------------------------------------------------------------
CREATE TYPE "CommissionEntryType" AS ENUM ('ride_commission', 'topup', 'grace', 'adjustment', 'reversal');
CREATE TYPE "TopUpRail"           AS ENUM ('ecocash', 'innbucks', 'omari', 'manual');
CREATE TYPE "TopUpStatus"         AS ENUM ('pending', 'confirmed', 'declined', 'expired');

-- The prepaid float, 1:1 with a rider. `balance` is a cached running total (always reconstructable by
-- summing the ledger); lazily upserted on first touch. May go negative (a debit that crossed zero is
-- owed, netted by the next top-up). A freeze is a riders.held_reason hold, not a column here (OV-4A).
CREATE TABLE "commission_accounts" (
  "rider_id"   UUID PRIMARY KEY REFERENCES "riders"("profile_id") ON DELETE CASCADE,
  "balance"    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "currency"   TEXT NOT NULL DEFAULT 'USD',
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- A top-up intent. Confirmation is exactly-once by construction (see the CAS + unique topUpId in
-- wallet.service). `provider_ref` is the rail's txn id or an admin idempotency key (unique).
CREATE TABLE "top_ups" (
  "id"           UUID PRIMARY KEY,
  "rider_id"     UUID NOT NULL REFERENCES "riders"("profile_id") ON DELETE CASCADE,
  "rail"         "TopUpRail" NOT NULL,
  "amount"       NUMERIC(10, 2) NOT NULL,
  "phone"        TEXT,
  "provider_ref" TEXT,
  "status"       "TopUpStatus" NOT NULL DEFAULT 'pending',
  "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "expires_at"   TIMESTAMP(3) NOT NULL,
  "resolved_at"  TIMESTAMP(3)
);

-- Append-only ledger — one immutable row per balance change. `amount` signed (credit +, debit −);
-- `balance_after` is the running total after the row. A ride_commission row stores the rate + fare it
-- was charged at (show-the-math receipt) and links to its order.
CREATE TABLE "commission_ledger" (
  "id"            UUID PRIMARY KEY,
  "rider_id"      UUID NOT NULL REFERENCES "riders"("profile_id") ON DELETE CASCADE,
  "type"          "CommissionEntryType" NOT NULL,
  "amount"        NUMERIC(10, 2) NOT NULL,
  "balance_after" NUMERIC(10, 2) NOT NULL,
  "order_id"      UUID REFERENCES "orders"("id") ON DELETE SET NULL,
  "rate_pct"      NUMERIC(5, 2),
  "fare"          NUMERIC(10, 2),
  "top_up_id"     UUID REFERENCES "top_ups"("id") ON DELETE SET NULL,
  "idem_key"      TEXT,
  "note"          TEXT,
  "actor"         TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Indexes & integrity constraints --------------------------------------------
-- Exactly one ride_commission row per order, ever — the per-ride debit is idempotent under retries.
-- (order_id is nullable; Postgres treats NULLs as distinct, so credits/grace/adjustment rows with a
-- null order_id are never constrained against each other — only ride_commission rows carry an order_id.)
CREATE UNIQUE INDEX "commission_ledger_rider_order_type_key" ON "commission_ledger" ("rider_id", "order_id", "type");
-- History reads + the integrity job scan by rider, newest first.
CREATE INDEX "commission_ledger_rider_created_idx" ON "commission_ledger" ("rider_id", "created_at");
-- A top-up settles at most one ledger row (exactly-once credit); manual/bulk credits idempotent by key.
-- Nullable columns → many NULLs allowed (Postgres NULL-distinct), so only present values are unique.
CREATE UNIQUE INDEX "commission_ledger_top_up_id_key" ON "commission_ledger" ("top_up_id");
CREATE UNIQUE INDEX "commission_ledger_idem_key_key" ON "commission_ledger" ("idem_key");

CREATE UNIQUE INDEX "top_ups_provider_ref_key" ON "top_ups" ("provider_ref");
CREATE INDEX "top_ups_rider_initiated_idx" ON "top_ups" ("rider_id", "initiated_at");
CREATE INDEX "top_ups_status_idx" ON "top_ups" ("status");
