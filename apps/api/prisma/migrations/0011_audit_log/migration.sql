-- Admin audit trail (INTERFACE-AUDIT A-01, compliance). Additive: a brand-new table, so the deployed
-- pilot is unaffected. Every destructive admin-console action writes one append-only row here (the
-- POST /admin/audit-actions endpoint), closing the "UI-only seam" where the console posted an action
-- with no server-side record. `actor` is the admin's profile id; `action` + `target` say what was
-- done to whom; `reason_code` + `note` carry the ConfirmModal justification. No FK on actor/target so
-- a row survives its subject being deleted — an audit log must outlive what it records.

CREATE TABLE "audit_logs" (
  "id"          UUID PRIMARY KEY,
  "actor"       TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "target"      TEXT NOT NULL,
  "reason_code" TEXT,
  "note"        TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
