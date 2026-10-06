-- First Run v2 F6 (ledger D-80 §4, owner 2026-10-06): the day the rider's verified ID expires / expired, so the
-- ID-expired page can say "Expired 2 Oct 2026". Written from the verified decision webhook (the document's
-- expiration_date) and on an expired result (the day it lapsed); /auth/me serves it while kyc_status is expired.
-- Expand-only: one nullable DATE column, no default, no rewrite; existing rows stay null (= unknown — /auth/me
-- falls back to kyc_resolved_at for an already-expired rider), and the still-live old revision never reads it.
ALTER TABLE "riders" ADD COLUMN "kyc_id_expires_on" DATE;
