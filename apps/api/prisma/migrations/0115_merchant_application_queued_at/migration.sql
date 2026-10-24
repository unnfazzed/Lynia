-- Admin console v2 §5: when a business last entered the application queue, so the applied / in-review SLA
-- clock restarts when a rejection is reopened instead of running from sign-up. Expand-only and online-safe:
-- a nullable column with no default is a catalog-only change (no table rewrite). Null means "since sign-up"
-- (created_at), so no backfill is needed.
ALTER TABLE "merchants" ADD COLUMN "application_queued_at" TIMESTAMP(3);
