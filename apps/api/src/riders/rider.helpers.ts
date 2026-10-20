/**
 * RiderService's module-level constants, types and pure helpers, shared by the facade and its parts
 * (R-6, QA 2026-10-20). rider.service.ts re-exports the ones it always exported.
 */
import { ConflictException } from "@nestjs/common";
import { KYC_DECLINE_CLASS, KycDeclineReason, kycDeclineClass } from "@lynia/shared";

/**
 * How long one forced KYC session replacement lasts before another can be claimed.
 *
 * An hour, matched to the paid-mint ceiling's window (KYC_PAID_MINT_LIMIT) so the two bounds reason about
 * the same period rather than interacting in surprising ways. Generous for the honest case — a rider hits a
 * genuine expiry, forces once, and is done in seconds — and tight for the abusive one, where forcing buys
 * one paid session an hour, not five.
 */
export const FORCED_KYC_REPLACEMENT_WINDOW_MS = 60 * 60 * 1000;

export type Kyc = "pending" | "verified" | "failed" | "expired";

/**
 * KYC-R26-02: who resolved the rider's CURRENT check (riders.kyc_resolved_by, migration 0088). Stamped with
 * kycResolvedAt by the two writers that resolve a check: `admin` by adminSetKyc (approve / decline / expire),
 * `vendor` by applyKycResult. Cleared when a check is reopened for a fresh vendor result (retryKyc's new
 * session, an admin `pending` reset). Null on rows resolved before the column existed — read as `vendor`.
 */
export const KYC_RESOLVED_BY_ADMIN = "admin";
export const KYC_RESOLVED_BY_VENDOR = "vendor";
/** KYC-R26-08: our own ID-expiry sweep. Like an admin decision, not overturnable by a late vendor delivery. */
export const KYC_RESOLVED_BY_SYSTEM = "system";

/** KYC-R26-08: audit actor for the daily sweep that expires a verified rider whose ID document has lapsed. */
export const KYC_ID_EXPIRY_ACTOR = "system:kyc-id-expiry";

/** The audit actor of every vendor (Didit webhook) KYC decision, approve or decline. */
export const KYC_WEBHOOK_ACTOR = "system:kyc-webhook";

/**
 * Owner 2026-10-15 (option 2): after this many earlier `id_unreadable` vendor declines, the next one is held for
 * a person instead of declined — the third time the card can't be read, a fourth try won't read it either.
 */
export const KYC_UNREADABLE_DECLINES_BEFORE_REVIEW = 2;

/**
 * `riders.selfie_check` (migration 0104, owner 2026-10-15). null = the selfie was checked as normal.
 *  - `unverified`: the ID passed and the biker is verified, but the selfie couldn't be checked on their camera.
 *  - `recheck_requested`: ops asked for a new selfie check. A reminder only — the biker keeps riding.
 */
export const SELFIE_CHECK_UNVERIFIED = "unverified";
export const SELFIE_CHECK_RECHECK_REQUESTED = "recheck_requested";

/**
 * At most this many PAID selfie re-check sessions per biker per rolling day (owner hold on #1216). A re-check that
 * fails writes no `rider.kyc_decline`, so KYC_DAILY_FIXABLE_DECLINE_LIMIT never bounds it; without this only the
 * hourly paid-mint ceiling did (about 120 sessions a day). Counted from the `rider.kyc_session_minted` rows with
 * path `recheck`.
 */
export const SELFIE_RECHECK_DAILY_LIMIT = 3;

/**
 * KYC-R26-13: a `fixable` vendor decline (KYC_DECLINE_CLASS — a blurry photo, a face the camera didn't match, an
 * expired card) no longer costs a strike, so the A-02 lock no longer bounds how many paid sessions those
 * retries buy. This does: at most this many fixable declines in a rolling day before retryKyc stops minting
 * new sessions (`kyc_daily_limit`, the app's "try again later" toast). Three honest tries a day is generous;
 * a script retrying a face that isn't theirs spends three sessions a day, not five an hour.
 */
export const KYC_DAILY_FIXABLE_DECLINE_LIMIT = 3;

/** KYC-R26-13: the A-02 counter write for a vendor decline with this reason (KYC_DECLINE_CLASS). */
export function declineAttemptsWrite(reason: string | null | undefined, current: number): { kycAttempts?: number | { increment: number } } {
  switch (kycDeclineClass(reason)) {
    case "strike":
      return { kycAttempts: { increment: 1 } };
    case "final":
      return { kycAttempts: Math.max(current, 2) };
    case "fixable":
      return {};
  }
}
export const KYC_DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * At most this many PAID Didit sessions per biker per {@link KYC_PAID_MINT_WINDOW_MS}, counted from the
 * `rider.kyc_session_minted` audit rows each successful mint writes. The abuse ceiling the routes' throttle used
 * to be: it moved here so that only a session we actually paid for counts. A Didit 503, a free resume and a
 * refused request no longer lock an honest biker out of the check for an hour (the routes keep a much higher
 * request cap as a flood guard).
 */
export const KYC_PAID_MINT_LIMIT = 5;
export const KYC_PAID_MINT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A mint in progress. Before retryKyc pays for a fresh session it CLAIMS the row by swapping its kycRef for a
 * marker (`claim:<ms>:<uuid>`), in one conditional UPDATE: a second tap that lands meanwhile sees the marker and
 * gets 409 `kyc_in_progress` instead of buying a second session. The rotation replaces the marker with the
 * real session; a vendor failure puts the old ref back. A marker older than {@link KYC_MINT_CLAIM_TTL_MS}
 * (a crash between claim and rotation) is stale and may be claimed afresh, so no rider is stuck behind one.
 */
export const KYC_MINT_CLAIM_PREFIX = "claim:";
export const KYC_MINT_CLAIM_TTL_MS = 2 * 60 * 1000;
export const mintClaimAt = (ref: string | null | undefined): number | null => {
  if (!ref?.startsWith(KYC_MINT_CLAIM_PREFIX)) return null;
  const ms = Number(ref.slice(KYC_MINT_CLAIM_PREFIX.length).split(":")[0]);
  return Number.isFinite(ms) ? ms : 0;
};
export const kycInProgress = () =>
  new ConflictException({ reason: "kyc_in_progress", message: "Your ID check is starting — give it a moment." });
/** KYC-R26-13: the decline reason keys that count toward the daily cap. */
export const FIXABLE_DECLINE_REASONS = (Object.keys(KYC_DECLINE_CLASS) as KycDeclineReason[]).filter((r) => KYC_DECLINE_CLASS[r] === "fixable");

/**
 * D-75: a hand approval refuses, rather than verifying the rider with nothing adopted, when the number
 * their ID check verified is already on another live account. Structured like `id_in_use` so the admin
 * console shows the message as is.
 */
export const verifiedIdInUse = () =>
  new ConflictException({
    reason: "verified_id_in_use",
    message: "Can't approve: the national ID from this biker's ID check is already on another live account. Resolve that account first.",
  });

/** D-75: the rider's ID facts moved while the approval ran, so the reviewer hasn't seen what it would decide. */
export const reviewStale = () =>
  new ConflictException({
    reason: "review_stale",
    message: "This biker's ID details changed while you were approving. Reload the page and review again.",
  });
