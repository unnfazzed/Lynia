-- Admin console v2 §3 (docs/plans/2026-10-13-admin-console-v2.md, PR 2): start RECORDING what the funnels,
-- stuck lists and money pages need. Expand-only and online-safe (CONTRIBUTING "Changing the data model"):
--
--  * domain_events — a new, empty table; its indexes are built here (exempt: the table is brand new and
--    not yet visible to other transactions). Append-only, no foreign keys (an analytics row must never
--    block or be cascaded by a domain write). `data` carries no GPS and no PII.
--  * Every column added to an existing table is NULLABLE with no default — a catalog-only change (no table
--    rewrite, no long lock). Existing rows read NULL = "not recorded"; the still-live old revision neither
--    reads nor writes them.
--  * riders.created_at is the one NOT NULL column: CURRENT_TIMESTAMP is a non-volatile default, which
--    PostgreSQL 11+ stores in the catalog ("fast default") instead of rewriting the table — the same shape
--    0040 used for merchants.updated_at. The backfill below then sets existing rows to their profile's
--    sign-up time: APPROXIMATE (sign-up, not become-biker — a lower bound), exact for every rider created
--    from here on. The riders table is small (pilot) and the UPDATE only takes row locks.
--  * CommissionEntryType gains `free_job` (the $0 receipt for a commission-free first job). ADD VALUE is
--    safe in a transaction on PG12+ as long as nothing in the same migration uses the value — its partial
--    unique index is the next migration (0092). IF NOT EXISTS keeps a re-run idempotent (mirrors 0018).
--  * The new hot-query indexes on existing tables are each built CONCURRENTLY in their own file (0093–0097).

ALTER TYPE "CommissionEntryType" ADD VALUE IF NOT EXISTS 'free_job';

CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "order_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "domain_events_type_created_at_idx" ON "domain_events"("type", "created_at");
CREATE INDEX "domain_events_subject_id_created_at_idx" ON "domain_events"("subject_id", "created_at");
CREATE INDEX "domain_events_order_id_idx" ON "domain_events"("order_id");

ALTER TABLE "riders" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill (approximate, see above): only rows whose profile is older than the migration's now().
UPDATE "riders" r
SET "created_at" = p."created_at"
FROM "profiles" p
WHERE p."id" = r."profile_id"
  AND p."created_at" < r."created_at";

ALTER TABLE "orders" ADD COLUMN "assigned_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "merchant_accepted_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "cancelled_by_role" TEXT;
ALTER TABLE "orders" ADD COLUMN "cancel_stage" TEXT;
ALTER TABLE "orders" ADD COLUMN "cancel_reason_code" TEXT;

ALTER TABLE "top_ups" ADD COLUMN "decline_reason" TEXT;

ALTER TABLE "audit_logs" ADD COLUMN "target_type" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "before" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "after" JSONB;

ALTER TABLE "merchants" ADD COLUMN "approved_at" TIMESTAMP(3);
ALTER TABLE "merchants" ADD COLUMN "approved_by" TEXT;
