-- Rider KYC (startup review 2026-10-06, R-1 / R-3 / R-4): the vendor's last reported status for the
-- rider's current ID-check session, written by the signed status webhook, and its event time. /auth/me
-- derives "held for review" and "session dead" from it instead of asking the vendor on every poll.
-- Expand-only: two nullable columns, no default, no rewrite; existing rows stay null (= unknown, the
-- pre-0076 behaviour), and the still-live old revision never reads or writes them.
ALTER TABLE "riders" ADD COLUMN "kyc_vendor_status" TEXT;
ALTER TABLE "riders" ADD COLUMN "kyc_vendor_status_at" TIMESTAMP(3);
