-- Duplicate-account guard (A-04 / ban-evasion). A national ID can land on more than one account
-- because `phone` — not `id_number` — is the unique account key, so a rider with a second SIM can
-- onboard again under the same ID. We can't distinguish a deliberate second account from a legitimate
-- re-entry or a typo, so onboarding FLAGS for the KYC reviewer rather than blocking. This column is
-- the snapshot taken at become-rider time; the admin KYC review recomputes the live collision set.
-- Additive + idempotent: default false so existing riders read as unflagged.
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "duplicate_id_flag" BOOLEAN NOT NULL DEFAULT false;
