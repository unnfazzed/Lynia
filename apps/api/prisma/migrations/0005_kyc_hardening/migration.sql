-- KYC webhook hardening (ENG-REVIEW). Two changes on "riders":
--  1. kyc_resolved_at: the event time of the last applied Didit webhook. applyKycResult only applies
--     a status when the incoming webhook is newer, so a replayed/out-of-order delivery can't overwrite
--     a newer decision (e.g. re-verify a rider that was just declined).
--  2. kyc_ref UNIQUE: an Approved/Declined webhook is keyed by session_id == kyc_ref, so the ref must
--     resolve exactly one rider. NULLs stay distinct in Postgres, so unverified/manual riders (kyc_ref
--     NULL) are unaffected.

ALTER TABLE "riders" ADD COLUMN "kyc_resolved_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "riders_kyc_ref_key" ON "riders" ("kyc_ref");
