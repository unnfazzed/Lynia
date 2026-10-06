import type { KycDeclineReason } from "@lynia/shared";
import type { KycGate, KycSdkResult } from "./gates";
import type { GateId } from "./rider-gate";

/**
 * First Run v2 F · ID-check outcomes (`packages/design/handoff/first-run-v2/` README §2 F, ledger D-80):
 * which full-screen outcome page an unverified rider sees, mapped once from the server's KYC state.
 *
 *   F8  just submitted (a completed launch, fresh — before R2)   F1  manual review (ops)
 *   F2  held for a person (never say why)                       F3  unfinished
 *   F4a declined · blurry      F4b declined · face             F4c declined · document
 *   F4d declined · other       F5  locked (both tries used)    F6  ID expired
 *   F7  the check couldn't open
 *   F5dup  declined as a duplicate (the ID is on another account) — F5's WhatsApp-only page with an
 *          undrawn body (owner 2026-10-06, D-80 §4): no retry can fix a duplicate
 *
 * Two non-F answers: `r2` (the automated check is with the vendor — Calm Mint v2 R2 "Rider setup" stays,
 * D-55 / README G3 "or R2 if pending") and `become` (no rider record: G1 sends the account to R1).
 * `null` = not a KYC wall (verified, or a non-KYC gate such as GPS / area / suspended / cooldown, which keep
 * their Rider v2 gates).
 */
export type KycOutcomeId = "F1" | "F2" | "F3" | "F4a" | "F4b" | "F4c" | "F4d" | "F5" | "F5dup" | "F6" | "F7" | "F8";

export type KycScreen = { kind: "become" } | { kind: "r2" } | { kind: "outcome"; id: KycOutcomeId };

/**
 * `/auth/me` `rider.kycExpiredOn` ("YYYY-MM-DD") → a LOCAL calendar day, so F6 names the same day the server
 * stored whatever the phone's timezone. Null for absent / malformed.
 */
export function parseIsoDay(v: string | null | undefined): Date | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

/** The decline pages (BRIEF 15: each reason gets its own advice). */
export type DeclineVariant = "F4a" | "F4b" | "F4c" | "F4d" | "F5dup";

/**
 * A decline reason → its F4 page (`KYC_DECLINE_REASON` in @lynia/shared):
 *
 *   id_unreadable                       F4a "Your photo was blurry"   — the ID photo couldn't be read
 *   face_mismatch, liveness_failed      F4b "Your face didn't match"  — both are the selfie step; the face tips fit
 *   id_expired, doc_tampered            F4c "We can't use this document" — "national ID card · not expired"
 *   name_mismatch, other, ?             F4d "We couldn't verify your ID" — "try again, or message us"
 *   duplicate                           F5dup — WhatsApp only: the ID is on another account, a retry can't fix it
 *
 * `name_mismatch` goes to F4d, not F4c: the document itself was fine, so "use your national ID card" would be
 * wrong advice; F4d's "message us and we'll help" is the honest route. `duplicate` gets F5's WhatsApp-only
 * shell (owner 2026-10-06, ledger D-80 §4).
 */
export function declineVariant(reason: KycDeclineReason | string | null | undefined): DeclineVariant {
  switch (reason) {
    case "id_unreadable":
      return "F4a";
    case "face_mismatch":
    case "liveness_failed":
      return "F4b";
    case "id_expired":
    case "doc_tampered":
      return "F4c";
    case "duplicate":
      return "F5dup";
    default:
      return "F4d";
  }
}

export interface KycScreenInput {
  /** The board's resolved gate (`resolveGate`), or null when the board is clear. */
  gate: GateId | null;
  /** The KYC wall (`resolveKycGate`), or null once verified. */
  kyc: KycGate | null;
  /** The launch result `resolveKycGate` saw (`freshKycLaunch`): a fresh `completed` is F8. */
  launch: KycSdkResult;
  declineReason?: KycDeclineReason | string | null;
}

/**
 * The screen for an unverified rider, or null when the board's gate isn't a KYC one. The KYC wall
 * (`kyc`) decides first; the server-only KYC refusals on a rider the app still thinks verified
 * (`kyc_expired` → gate `expired`, `kyc` → gate `unfinished`) land on the same F pages.
 */
export function kycScreenFor({ gate, kyc, launch, declineReason }: KycScreenInput): KycScreen | null {
  if (!gate) return null;
  if (kyc) {
    switch (kyc.kind) {
      case "not_a_rider":
        return { kind: "become" };
      case "expired":
        return { kind: "outcome", id: "F6" };
      case "locked":
        return { kind: "outcome", id: "F5" };
      case "declined":
        return { kind: "outcome", id: declineVariant(declineReason) };
      case "manual_review":
        return { kind: "outcome", id: "F1" };
      case "held":
        return { kind: "outcome", id: "F2" };
      case "in_flight":
        // README F8: "Just submitted, waiting (0–30s, before R2)" — the fresh completed launch is the 30 s.
        return launch === "completed" ? { kind: "outcome", id: "F8" } : { kind: "r2" };
      case "unfinished":
        return { kind: "outcome", id: "F3" };
      case "cant_start":
        return { kind: "outcome", id: "F7" };
    }
  }
  if (gate === "expired") return { kind: "outcome", id: "F6" };
  if (gate === "unfinished") return { kind: "outcome", id: "F3" };
  return null;
}

