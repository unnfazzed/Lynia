-- Trust & safety pre-launch set: disputes/order-level support (A-05), report-a-user + block,
-- SOS (R-16/F-13), and the refund ledger for settlement netting (A-06). All new tables/enums —
-- additive, nothing existing changes.

CREATE TYPE "IssueType"       AS ENUM ('not_delivered', 'wrong_item', 'damaged', 'payment_dispute', 'rider_conduct', 'customer_conduct', 'other');
CREATE TYPE "IssueStatus"     AS ENUM ('open', 'investigating', 'resolved');
CREATE TYPE "IssueResolution" AS ENUM ('refund', 'rider_strike', 'close_no_action');
CREATE TYPE "ReportReason"    AS ENUM ('rude', 'unsafe', 'fraud', 'no_show', 'inappropriate', 'other');

CREATE TABLE "issues" (
  "id"                    UUID NOT NULL,
  "order_id"              UUID NOT NULL,
  "opened_by_profile_id"  UUID NOT NULL,
  "opened_by_role"        "Role" NOT NULL,
  "type"                  "IssueType" NOT NULL,
  "status"                "IssueStatus" NOT NULL DEFAULT 'open',
  "description"           TEXT NOT NULL,
  "resolution"            "IssueResolution",
  "resolution_note"       TEXT,
  "resolved_by_admin_id"  UUID,
  "resolved_at"           TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issues_status_created_at_idx" ON "issues"("status", "created_at");
CREATE INDEX "issues_order_id_idx" ON "issues"("order_id");

CREATE TABLE "reports" (
  "id"                   UUID NOT NULL,
  "order_id"             UUID,
  "reporter_profile_id"  UUID NOT NULL,
  "reporter_role"        "Role" NOT NULL,
  "subject_profile_id"   UUID NOT NULL,
  "subject_role"         "Role" NOT NULL,
  "reason"               "ReportReason" NOT NULL,
  "note"                 TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reports_subject_profile_id_idx" ON "reports"("subject_profile_id");

CREATE TABLE "blocks" (
  "id"                 UUID NOT NULL,
  "blocker_profile_id" UUID NOT NULL,
  "blocked_profile_id" UUID NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "blocks_blocker_profile_id_blocked_profile_id_key" ON "blocks"("blocker_profile_id", "blocked_profile_id");
CREATE INDEX "blocks_blocker_profile_id_idx" ON "blocks"("blocker_profile_id");

CREATE TABLE "sos_events" (
  "id"                   UUID NOT NULL,
  "order_id"             UUID NOT NULL,
  "raised_by_profile_id" UUID NOT NULL,
  "raised_by_role"       "Role" NOT NULL,
  "lat"                  DOUBLE PRECISION,
  "lng"                  DOUBLE PRECISION,
  "acknowledged_at"      TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sos_events_order_id_idx" ON "sos_events"("order_id");
CREATE INDEX "sos_events_created_at_idx" ON "sos_events"("created_at");

CREATE TABLE "refunds" (
  "id"            UUID NOT NULL,
  "order_id"      UUID NOT NULL,
  "rider_id"      UUID NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "reason"        TEXT,
  "settlement_id" UUID,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "refunds_rider_id_created_at_idx" ON "refunds"("rider_id", "created_at");
CREATE INDEX "refunds_settlement_id_idx" ON "refunds"("settlement_id");
