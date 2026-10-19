-- Own bikers (docs/designs/own-bikers.md, ledger D-117): merchant owners invite their own bikers, who then only
-- ever carry that owner's jobs. This migration adds the data and the database guard under every door:
--   * owner_fleets: per-owner settings (OV-F4): enabled, ride fee, pause, suggestions dismissed.
--   * riders.fleet_owner_profile_id / fleet_home_merchant_id / fleet_joined_at: the biker's link (owner-level).
--   * orders.fleet_merchant_id / fleet_fee: the branch a fleet ride is billed to, and the fee snapshot.
--   * fleet_invites: phone-bound shared links, no SMS (D-117).
--   * merchant_fleet_ledger / merchant_fleet_statements: append-only billing rows and the weekly bill.
--   * Three triggers: the orders scope check (constraint trigger, at commit), the riders link guard (OV1) and the
--     merchants owner-change guard (E11).
--
-- Online safety (CONTRIBUTING §3): on the existing tables, columns are added nullable with no default
-- (metadata-only), and the foreign keys and the CHECK are added NOT VALID (no scan under the lock), validated
-- by 0109. The two indexes on existing tables are built CONCURRENTLY by 0110 and 0111. Indexes below are on
-- tables created here, which is exempt.

-- ── New tables ──────────────────────────────────────────────────────────────────────────────────────────────

CREATE TYPE "FleetLedgerKind" AS ENUM ('booking', 'marketplace', 'adjustment');
CREATE TYPE "FleetStatementStatus" AS ENUM ('open', 'sent', 'paid');

CREATE TABLE "owner_fleets" (
  "owner_profile_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "ride_fee" DECIMAL(10,2),
  "paused_at" TIMESTAMP(3),
  "suggestions_dismissed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_fleets_pkey" PRIMARY KEY ("owner_profile_id"),
  CONSTRAINT "owner_fleets_ride_fee_nonneg" CHECK ("ride_fee" IS NULL OR "ride_fee" >= 0),
  -- Admin can't turn a fleet on without its fee.
  CONSTRAINT "owner_fleets_enabled_needs_fee" CHECK (NOT "enabled" OR "ride_fee" IS NOT NULL)
);

CREATE TABLE "fleet_invites" (
  "id" UUID NOT NULL,
  "owner_profile_id" UUID NOT NULL,
  "home_merchant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "invited_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "opened_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "joined_at" TIMESTAMP(3),
  CONSTRAINT "fleet_invites_pkey" PRIMARY KEY ("id"),
  -- An invite ends one way: joined or revoked, never both.
  CONSTRAINT "fleet_invites_one_ending" CHECK ("joined_at" IS NULL OR "revoked_at" IS NULL)
);
CREATE UNIQUE INDEX "fleet_invites_token_key" ON "fleet_invites" ("token");
-- One live invite per owner and phone, so a re-invite returns the same link (D-117).
CREATE UNIQUE INDEX "fleet_invites_live_key" ON "fleet_invites" ("owner_profile_id", "phone")
  WHERE "revoked_at" IS NULL AND "joined_at" IS NULL;
CREATE INDEX "fleet_invites_owner_profile_id_created_at_idx" ON "fleet_invites" ("owner_profile_id", "created_at");
CREATE INDEX "fleet_invites_phone_idx" ON "fleet_invites" ("phone");

CREATE TABLE "merchant_fleet_ledger" (
  "id" UUID NOT NULL,
  "owner_profile_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "order_id" UUID,
  "rider_id" UUID,
  "kind" "FleetLedgerKind" NOT NULL,
  "fee" DECIMAL(10,2) NOT NULL,
  "actor_profile_id" UUID,
  "reason" TEXT,
  "statement_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_fleet_ledger_pkey" PRIMARY KEY ("id"),
  -- A ride charge names its order and is never negative; an adjustment (E3) names who wrote it and why.
  CONSTRAINT "merchant_fleet_ledger_charge_shape" CHECK (
    ("kind" <> 'adjustment' AND "order_id" IS NOT NULL AND "fee" >= 0)
    OR ("kind" = 'adjustment' AND "actor_profile_id" IS NOT NULL AND "reason" IS NOT NULL)
  )
);
-- At most one charge per order (C1 idempotency); adjustments may repeat (OV-F6).
CREATE UNIQUE INDEX "merchant_fleet_ledger_order_charge_key" ON "merchant_fleet_ledger" ("order_id")
  WHERE "kind" <> 'adjustment';
CREATE INDEX "merchant_fleet_ledger_merchant_id_created_at_idx" ON "merchant_fleet_ledger" ("merchant_id", "created_at");
CREATE INDEX "merchant_fleet_ledger_owner_profile_id_created_at_idx" ON "merchant_fleet_ledger" ("owner_profile_id", "created_at");
CREATE INDEX "merchant_fleet_ledger_statement_id_idx" ON "merchant_fleet_ledger" ("statement_id");

CREATE TABLE "merchant_fleet_statements" (
  "id" UUID NOT NULL,
  "owner_profile_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "status" "FleetStatementStatus" NOT NULL DEFAULT 'open',
  "due_on" DATE,
  "paid_at" TIMESTAMP(3),
  "recorded_by_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchant_fleet_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_fleet_statements_period" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "merchant_fleet_statements_paid_shape" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "merchant_fleet_statements_owner_profile_id_period_start_key"
  ON "merchant_fleet_statements" ("owner_profile_id", "period_start");
CREATE INDEX "merchant_fleet_statements_status_due_on_idx" ON "merchant_fleet_statements" ("status", "due_on");

-- ── Columns on existing tables (nullable, no default: metadata-only) ─────────────────────────────────────────

ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "fleet_owner_profile_id" UUID;
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "fleet_home_merchant_id" UUID;
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "fleet_joined_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fleet_merchant_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fleet_fee" DECIMAL(10,2);

-- NOT VALID: enforced for every new write at once, without scanning the table under the lock. 0109 validates.
ALTER TABLE "riders" ADD CONSTRAINT "riders_fleet_owner_profile_id_fkey" FOREIGN KEY ("fleet_owner_profile_id")
  REFERENCES "owner_fleets" ("owner_profile_id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "riders" ADD CONSTRAINT "riders_fleet_home_merchant_id_fkey" FOREIGN KEY ("fleet_home_merchant_id")
  REFERENCES "merchants" ("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "orders" ADD CONSTRAINT "orders_fleet_merchant_id_fkey" FOREIGN KEY ("fleet_merchant_id")
  REFERENCES "merchants" ("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
-- A fleet ride always carries its fee snapshot, and a public ride never does (non-negative).
ALTER TABLE "orders" ADD CONSTRAINT "orders_fleet_fee_pairs_branch" CHECK (
  ("fleet_merchant_id" IS NULL AND "fleet_fee" IS NULL)
  OR ("fleet_merchant_id" IS NOT NULL AND "fleet_fee" IS NOT NULL AND "fleet_fee" >= 0)
) NOT VALID;

-- ── Guard 1: the orders scope check (the guarantee under every door) ─────────────────────────────────────────
-- Refuses, at commit, an order whose rider or fleet tag is out of scope:
--   (a) a fleet tag must name the branch the order belongs to: orders.merchant_id for an app order, or
--       merchant_bookings.merchant_id for a booking. That branch must have an owner (E11).
--   (b) a rider on the order must belong to exactly that branch's owner's fleet; a public order (no tag) takes
--       only public bikers. NULL = NULL counts as equal, so public stays public.
-- A constraint trigger, DEFERRABLE INITIALLY DEFERRED: a booking's orders row and merchant_bookings row are
-- written in one transaction (F1) and both exist when this runs. It re-reads the row because the event's NEW is
-- the version at event time, not at commit. FOR SHARE on the rider row orders it against a concurrent Join or
-- Leave (OV1): either the Join waits for this commit, or this check waits for the Join and sees the new link.
-- Separate INSERT and UPDATE triggers, each with a WHEN clause, so ordinary status writes never pay for it
-- (E2, F9). Error: SQLSTATE 23514 (check_violation) with constraint "orders_fleet_scope"; the API maps it to
-- 409 (E1).
CREATE OR REPLACE FUNCTION "orders_fleet_scope_check"() RETURNS trigger AS $$
DECLARE
  o_rider UUID;
  o_fleet UUID;
  o_merchant UUID;
  belongs_to UUID;
  fleet_owner UUID;
  rider_owner UUID;
BEGIN
  SELECT "rider_id", "fleet_merchant_id", "merchant_id" INTO o_rider, o_fleet, o_merchant
    FROM "orders" WHERE "id" = NEW."id";
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF o_fleet IS NOT NULL THEN
    belongs_to := COALESCE(o_merchant, (SELECT "merchant_id" FROM "merchant_bookings" WHERE "order_id" = NEW."id"));
    IF belongs_to IS DISTINCT FROM o_fleet THEN
      RAISE EXCEPTION 'fleet_scope: order % is tagged to a branch it does not belong to', NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_fleet_scope';
    END IF;
    SELECT "owner_profile_id" INTO fleet_owner FROM "merchants" WHERE "id" = o_fleet;
    IF fleet_owner IS NULL THEN
      RAISE EXCEPTION 'fleet_scope: order % is tagged to a branch with no owner', NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_fleet_scope';
    END IF;
  END IF;

  IF o_rider IS NOT NULL THEN
    SELECT "fleet_owner_profile_id" INTO rider_owner FROM "riders" WHERE "profile_id" = o_rider FOR SHARE;
    IF rider_owner IS DISTINCT FROM fleet_owner THEN
      RAISE EXCEPTION 'fleet_scope: rider % is outside the scope of order %', o_rider, NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_fleet_scope';
    END IF;
  END IF;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "orders_fleet_scope_insert" ON "orders";
CREATE CONSTRAINT TRIGGER "orders_fleet_scope_insert"
  AFTER INSERT ON "orders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW."rider_id" IS NOT NULL OR NEW."fleet_merchant_id" IS NOT NULL)
  EXECUTE FUNCTION "orders_fleet_scope_check"();

DROP TRIGGER IF EXISTS "orders_fleet_scope_update" ON "orders";
CREATE CONSTRAINT TRIGGER "orders_fleet_scope_update"
  AFTER UPDATE OF "rider_id", "fleet_merchant_id" ON "orders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD."rider_id" IS DISTINCT FROM NEW."rider_id" OR OLD."fleet_merchant_id" IS DISTINCT FROM NEW."fleet_merchant_id")
  EXECUTE FUNCTION "orders_fleet_scope_check"();

-- ── Guard 2: the riders link guard (OV1) ──────────────────────────────────────────────────────────────────────
-- A biker's fleet link can't change while they carry a live job outside the new scope (they can leave after
-- this delivery), and the home branch must belong to the biker's owner (no home branch for a public biker).
-- Live = ACTIVE_RIDE_STATUSES in packages/shared (the one_active_ride set). BEFORE row trigger: the row is
-- locked before this runs, so a concurrent accept's FOR SHARE in Guard 1 serialises against it.
CREATE OR REPLACE FUNCTION "riders_fleet_link_guard"() RETURNS trigger AS $$
DECLARE
  home_owner UUID;
BEGIN
  IF NEW."fleet_owner_profile_id" IS NULL THEN
    IF NEW."fleet_home_merchant_id" IS NOT NULL THEN
      RAISE EXCEPTION 'fleet_link: a public biker has no home branch'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'riders_fleet_link';
    END IF;
  ELSIF NEW."fleet_home_merchant_id" IS NOT NULL THEN
    SELECT "owner_profile_id" INTO home_owner FROM "merchants" WHERE "id" = NEW."fleet_home_merchant_id";
    IF home_owner IS DISTINCT FROM NEW."fleet_owner_profile_id" THEN
      RAISE EXCEPTION 'fleet_link: the home branch belongs to another owner'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'riders_fleet_link';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."fleet_owner_profile_id" IS DISTINCT FROM NEW."fleet_owner_profile_id" THEN
    IF EXISTS (
      SELECT 1
        FROM "orders" o
        LEFT JOIN "merchants" m ON m."id" = o."fleet_merchant_id"
       WHERE o."rider_id" = NEW."profile_id"
         AND o."status" IN ('assigned', 'confirmed', 'en_route_pickup', 'picked_up', 'en_route_dropoff')
         AND m."owner_profile_id" IS DISTINCT FROM NEW."fleet_owner_profile_id"
    ) THEN
      RAISE EXCEPTION 'fleet_link: rider % has a live job outside the new scope', NEW."profile_id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'riders_fleet_link';
    END IF;
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "riders_fleet_link_guard" ON "riders";
CREATE TRIGGER "riders_fleet_link_guard"
  BEFORE INSERT OR UPDATE OF "fleet_owner_profile_id", "fleet_home_merchant_id" ON "riders"
  FOR EACH ROW EXECUTE FUNCTION "riders_fleet_link_guard"();

-- ── Guard 3: the merchants owner-change guard (E11) ───────────────────────────────────────────────────────────
-- Moving a branch to another owner while bikers are linked would silently hand them and their bills over, so it
-- is refused until the links are cleared: any biker homed at this branch, or in the old owner's fleet.
CREATE OR REPLACE FUNCTION "merchants_fleet_owner_guard"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "riders"
     WHERE "fleet_home_merchant_id" = OLD."id"
        OR (OLD."owner_profile_id" IS NOT NULL AND "fleet_owner_profile_id" = OLD."owner_profile_id")
  ) THEN
    RAISE EXCEPTION 'fleet_owner: branch % has Own bikers linked to its owner', OLD."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'merchants_fleet_owner';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "merchants_fleet_owner_guard" ON "merchants";
CREATE TRIGGER "merchants_fleet_owner_guard"
  BEFORE UPDATE OF "owner_profile_id" ON "merchants"
  FOR EACH ROW
  WHEN (OLD."owner_profile_id" IS DISTINCT FROM NEW."owner_profile_id")
  EXECUTE FUNCTION "merchants_fleet_owner_guard"();
