-- Owner 2026-10-15: a biker whose ID check passed but whose selfie couldn't be checked because of the phone's
-- camera (blur, light, an unsure liveness read) is verified with the selfie flagged, instead of declined. Ops
-- see the flag and can ask for a selfie re-check, which the biker is reminded to do but is never blocked on.
-- Expand-only and online-safe: nullable columns with no default (catalog-only, no table rewrite). Every
-- existing row reads NULL ("selfie checked as normal"); the still-live old revision neither reads nor writes them.
--   selfie_check            NULL | 'unverified' (verified without a selfie check) | 'recheck_requested' (ops asked)
--   selfie_check_reason     why it was flagged, or why the last re-check didn't pass (a decline-reason-style key)
--   selfie_check_at         when it was flagged, or when ops asked for the re-check
--   selfie_recheck_ref      the Didit session of the re-check the biker started (the webhook routes on it)
--   selfie_recheck_url      that session's link, so a second tap reopens it instead of buying another (SECRET)
ALTER TABLE "riders" ADD COLUMN "selfie_check" TEXT;
ALTER TABLE "riders" ADD COLUMN "selfie_check_reason" TEXT;
ALTER TABLE "riders" ADD COLUMN "selfie_check_at" TIMESTAMP(3);
ALTER TABLE "riders" ADD COLUMN "selfie_recheck_ref" TEXT;
ALTER TABLE "riders" ADD COLUMN "selfie_recheck_url" TEXT;
