/**
 * The push copy for a KYC outcome the rider must hear about away from the app. Every string is the First Run
 * v2 handoff's `KY` (packages/design/handoff/first-run-v2/copy.ts), verbatim through `bikerWording` (ledger
 * D-101) — kyc-push-copy.spec.ts compares them byte for byte, so a handoff change fails a test rather than
 * drifting. `verified` / `failed` keep the copy those two pushes have always sent.
 *
 *  - `locked`  F5 (`KY.lockedA` + `KY.lockedB`, `KY.lockedBody`): the decline used the last try, or can't be
 *              retried at all (under age). "Try again" would be a lie.
 *  - `expired` F6 (`KY.expA` + `KY.expB`): the ID lapsed (the daily sweep, Didit's Kyc Expired, an ops expire).
 *              The body is `KY.expBody`'s second sentence: its first names the day, which the F6 screen shows.
 *  - `reset`   F1 unfinished (`KY.unfA`, `KY.unfBody`): ops reopened the check, so the rider owes the next tap.
 */
import { bikerWording } from "@lynia/shared";

export type KycPushVariant = "verified" | "failed" | "locked" | "expired" | "reset";

export const KYC_PUSH_COPY: Record<KycPushVariant, { title: string; body: string }> = {
  verified: { title: "You're verified", body: "You're verified — go online to start taking deliveries." },
  failed: { title: "ID check needs another look", body: "We couldn't verify your ID — open the app to see why and try again." },
  locked: { title: bikerWording("Let’s finish this together"), body: bikerWording("Both tries are used. Our team will check your ID with you on WhatsApp.") },
  expired: { title: bikerWording("Your ID has expired"), body: bikerWording("Re-verify to keep riding.") },
  reset: { title: bikerWording("Almost there,"), body: bikerWording("Finish your ID check. About 2 minutes.") },
};
