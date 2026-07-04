-- KYC decline reason (admin A-02). Additive/nullable so the deployed pilot keeps working: existing
-- rows carry NULL, and old clients that never hit the decision write are unaffected.
--
-- The admin KYC decision write-back (RiderService.adminSetKyc) stores the reason code here on a
-- decline (and increments kyc_attempts, added in 0009); it's cleared on approve. The rider app reads
-- it to tell a declined rider what to fix before the single allowed resubmit. A second decline
-- (kyc_attempts >= 2) locks resubmission → support.

ALTER TABLE "riders"
  ADD COLUMN "kyc_decline_reason" TEXT;
