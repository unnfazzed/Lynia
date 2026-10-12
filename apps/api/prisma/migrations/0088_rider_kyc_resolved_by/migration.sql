-- KYC-R26-02: record WHO resolved a rider's current ID check, so a late or retried Didit webhook for the same
-- session (kyc_ref) can't overturn an admin's approve / decline / expire. adminSetKyc stamps 'admin',
-- applyKycResult stamps 'vendor', and a fresh check (retryKyc) or an admin `pending` reset clears it.
--
-- Expand-only: a nullable column with no default is a catalog-only change on PostgreSQL (no table rewrite, no
-- long lock). Existing rows read NULL, which the code treats as a vendor resolution — exactly how every row was
-- treated before this column, so the still-live old revision neither reads nor writes it and nothing changes
-- for it. No backfill: an admin decision made before this migration can't be told apart from a vendor one in
-- the data we have (the audit log's actor could, but guessing there would re-block riders on a heuristic).
ALTER TABLE "riders" ADD COLUMN "kyc_resolved_by" TEXT;
