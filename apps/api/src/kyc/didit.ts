import { createHmac, timingSafeEqual } from "node:crypto";
import { KYC_THRESHOLDS, KycDeclineReason } from "@lynia/shared";
import type { ServerKycPendingState } from "./kyc-pending-state";

export type RiderKyc = "verified" | "failed" | "pending" | "expired";

/**
 * Map a Didit verification status to our rider kyc_status. Statuses are exact, case-sensitive
 * literals (V3): Not Started, In Progress, Awaiting User, In Review, Approved, Declined,
 * Resubmitted, Abandoned, Expired, Kyc Expired.
 *
 * Approved → verified. Declined → failed. "Kyc Expired" (a previously-verified rider whose national
 * ID has aged out → must re-verify, rider-journey 1·b2) → its own terminal `expired` state, distinct
 * from a verification-time decline. Everything else — including session "Expired" (the hosted URL aged
 * out before the rider finished, so they can simply retry) — stays pending, and the admin
 * manual-review backstop (T7) resolves anything stuck.
 */
export function mapDiditStatus(status: string): RiderKyc {
  switch (status.trim().toLowerCase()) {
    case "approved":
      return "verified";
    case "declined":
      return "failed";
    case "kyc expired":
      return "expired";
    default:
      // Not Started | In Progress | Awaiting User | In Review | Resubmitted | Abandoned | Expired
      return "pending";
  }
}

/**
 * Split a still-PENDING Didit session into "in flight" vs "waiting on the rider" (P0-1 / D6).
 *
 * Distinct from {@link mapDiditStatus}, which answers a different question — what the rider's
 * kyc_status should be. This one only ever runs while that answer is already `pending`, and asks
 * whether the rider owes the next action:
 *
 *   In Review / Resubmitted                 the vendor holds it            → in_flight
 *   Approved / Declined                     terminal; the webhook that flips kycStatus is in flight,
 *                                           so while the row still says pending, so is the check → in_flight
 *   Not Started / In Progress / Awaiting User  never opened, opened and not finished, or backed out → unfinished
 *
 * "In Progress" is the rider's move, not the vendor's: Didit sets it the moment the hosted page OPENS,
 * before a single document is captured. Reading it as in flight told a rider who opened the check and
 * backed out that "your ID is under review" — with no way to resume (the review states draw no action).
 *   Abandoned / Expired / Kyc Expired       session dead; a resume mints a fresh one → unfinished
 *
 * Unknown ⇒ `unfinished`, the safe default: offering a resume to a rider genuinely mid-check costs
 * one wasted tap, while withholding it from one who cancelled strands them behind the gate with
 * nothing to press. It deliberately does NOT default to the SDK's `failed` state — that accuses the
 * device of a fault we have no evidence for, and its copy sends the rider to support.
 *
 * Normalisation is looser than `mapDiditStatus`'s: Didit has spelled these `In Review`, `in_review`
 * and `IN_REVIEW` across versions, so `_`/`-`/whitespace runs all collapse to one space. A casing or
 * separator change must not silently reclassify every pending rider.
 */
export function mapDiditPendingState(status: string): ServerKycPendingState {
  switch (status.trim().toLowerCase().replace(/[\s_-]+/g, " ")) {
    case "in review":
    case "resubmitted":
    case "approved":
    case "declined":
      return "in_flight";
    default:
      return "unfinished";
  }
}

/**
 * What a still-PENDING Didit session means for the rider's next step, one notch finer than
 * {@link mapDiditPendingState} (R-1 / R-3, startup review 2026-10-06):
 *
 *   held       In Review — a human has to look (Didit's reviewer, then ours). The rider owes nothing and
 *              "usually under a minute" is false: the app draws the Rider v2 "under review" wall.
 *   dead       Abandoned / Expired / Kyc Expired — the session can never be finished. Resuming it is the
 *              R-1 loop ("Finish verifying" re-opening a dead page forever); the next attempt must mint.
 *   in_flight  Resubmitted, or a terminal Approved / Declined whose webhook is still on its way.
 *   unfinished Not Started / In Progress / Awaiting User, and anything unknown (the safe default — see
 *              mapDiditPendingState).
 *
 * `mapDiditPendingState` keeps its two-value answer for the `/auth/me` field older apps read; this one
 * feeds the additive `kycHeld` flag and retryKyc's dead-session check.
 */
export type DiditSessionClass = "in_flight" | "unfinished" | "held" | "dead";

/** Didit's status literal for an approval — what a held-for-review approval leaves on the rider row. */
export const DIDIT_APPROVED_STATUS = "Approved";

function normDiditStatus(status: string): string {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function classifyDiditSession(status: string | null | undefined): DiditSessionClass {
  if (!status) return "unfinished";
  switch (normDiditStatus(status)) {
    case "in review":
      return "held";
    case "abandoned":
    case "expired":
    case "kyc expired":
      return "dead";
    case "resubmitted":
    case "approved":
    case "declined":
      return "in_flight";
    default:
      return "unfinished";
  }
}

/**
 * The PERSISTED vendor status (`riders.kyc_vendor_status`, written by the webhook) read against a rider
 * whose kycStatus is still `pending`. Unlike a live read, a stored Approved can't be "the webhook is on its
 * way" — the webhook that carried it already ran and decided to HOLD (a review-band face match, or an ID
 * collision/mismatch: applyKycResult's holdForReview). So Approved here is a hold too.
 */
export function classifyStoredDiditStatus(status: string | null | undefined): DiditSessionClass | null {
  if (!status) return null;
  const cls = classifyDiditSession(status);
  if (normDiditStatus(status) === "approved") return "held";
  return cls;
}

/**
 * Pull Didit's face-match similarity out of a decision webhook as a [0, 1] score, or null when the
 * payload exposes none (the caller then lets Didit's status decide — see {@link decideDiditKyc}).
 *
 * V3 first (IR26-07). Our destination is registered as `webhook_version: "v3"` (docs/PILOT-READINESS.md
 * step 3), and V3 carries every per-feature result as a PLURAL array: the face-match report is
 * `decision.face_matches[]`, each entry `{ node_id, status, score, warnings }`. The singular
 * `decision.face_match` only appears on a destination pinned to V2. Reading only the singular shape
 * returned null on every real webhook, so the KYC_THRESHOLDS bands never ran.
 *
 * Scale: Didit's face-match `score` is a 0–100 similarity in BOTH versions (the V3 serializer extends
 * the V2 one — docs.didit.me/reference/data-models, "Face match"), so it is divided by 100 here. The
 * scale comes from the field, never from the value: a `score` of 0.9 is a 0.9% similarity, and reading
 * it as 0.9 would put a non-match in the auto-approve band.
 *
 * Several face-match nodes (V3 allows more than one per workflow) → the WEAKEST scored match decides, so
 * one strong comparison can't cover for a weak one. Entries without a usable score are skipped.
 *
 * Then the legacy probes, unchanged and already on [0, 1]: `face_match.confidence`, `decision.score` and
 * the top-level `score`/`confidence`. None is in Didit's documented schema; they stay as defensive
 * fallbacks. Anything outside [0, 1] after normalisation is rejected.
 */
export function extractDiditScore(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const decision = (p.decision ?? {}) as Record<string, unknown>;
  const v3 = Array.isArray(decision.face_matches) ? (decision.face_matches as unknown[]) : [];
  const v3Scores = v3
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => percentToUnit(e.score))
    .filter((s): s is number => s !== null);
  if (v3Scores.length > 0) return Math.min(...v3Scores);
  const faceMatch = (decision.face_match ?? {}) as Record<string, unknown>;
  const v2 = percentToUnit(faceMatch.score);
  if (v2 !== null) return v2;
  for (const c of [faceMatch.confidence, decision.score, p.score, p.confidence]) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1) return c;
  }
  return null;
}

/** A Didit 0–100 score as [0, 1], or null when it isn't a finite number in [0, 100]. */
function percentToUnit(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return null;
  return v / 100;
}

/**
 * Auto-decision for a Didit KYC result (NOTE: thresholds live in packages/shared/src/policy.ts
 * `KYC_THRESHOLDS` — no magic numbers).
 *
 * The face-match score can only make Didit's verdict STRICTER, never looser (IR26-07). It measures one
 * feature, while Didit's status covers all of them: document validity, liveness (the anti-spoofing
 * check), AML, and anything its workflow flagged. A spoof that fails liveness can still match the
 * document's face, so a high score must never turn a decline into a verify. Per Didit status:
 *   - Approved   score >= autoApprove → `verified`; [needsReview, autoApprove) → `pending` (held for a
 *                human reviewer — NEVER auto-verified); < needsReview → `failed` (auto-decline)
 *   - Declined   always `failed`, with the face-mismatch reason when score < needsReview
 *   - In Review  `pending` — Didit wants a human, and a strong face match doesn't clear warnings it
 *                didn't raise; < needsReview still auto-declines
 *   - anything else (Abandoned, Expired, Kyc Expired, non-terminal) → the status mapping, score ignored:
 *                a partial result from a session Didit never finished judging decides nothing
 * With NO score, Didit's status alone decides ({@link mapDiditStatus}). A `reason` is returned only on
 * a score-driven decline, for the rider-facing decline copy + audit log.
 */
export function decideDiditKyc(status: string, score: number | null): { status: RiderKyc; reason?: string } {
  const vendor = mapDiditStatus(status);
  const inReview = isDiditInReview(status);
  if (score === null || !(vendor === "verified" || vendor === "failed" || inReview)) return { status: vendor };
  if (score < KYC_THRESHOLDS.needsReview) {
    // Store a canonical KycDeclineReason KEY (not a sentence) so the rider app resolves it via
    // KYC_DECLINE_REASON_LABELS, same as an admin decline — a sub-threshold face-match is a mismatch.
    return { status: "failed", reason: KycDeclineReason.FACE_MISMATCH };
  }
  if (vendor === "failed") return { status: "failed" };
  if (vendor === "verified" && score >= KYC_THRESHOLDS.autoApprove) return { status: "verified" };
  return { status: "pending" }; // needs human review — held for the admin backstop, no auto-verify
}

/** Didit's "In Review", with the same separator-tolerant normalisation as mapDiditPendingState: Didit has
 *  also spelled it `in_review` and `IN_REVIEW`. */
function isDiditInReview(status: string): boolean {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "in review";
}

/**
 * D-75 item 2 (IR26-09): is this a result Didit JUDGED that {@link decideDiditKyc} holds for a human? That
 * is Didit's In Review, or a Didit approval whose face match fell in the review band. Both carry the
 * number Didit read from the document, which the reviewer checks and a hand approval adopts, so the webhook
 * stores it (RiderService.recordHeldVerifiedId). The band-held approval is final at Didit: no later webhook
 * brings the number.
 *
 * Every other `pending` is a session Didit never finished judging: Abandoned, Expired, In Progress, or
 * Resubmitted (its reviewer asked for the document again). A number in that partial data verified nothing,
 * so it is not stored.
 */
export function isDiditReviewHold(status: string, score: number | null): boolean {
  if (decideDiditKyc(status, score).status !== "pending") return false;
  return mapDiditStatus(status) === "verified" || isDiditInReview(status);
}

/**
 * Pull the DOCUMENT NUMBER the vendor actually verified out of a Didit decision webhook, or null when
 * the payload doesn't expose one (IR26-04 vendor-document dedupe). Didit's terminal decision payload
 * carries the extracted document fields under the per-feature `decision` results — the ID-verification
 * feature exposes `document_number` / `personal_number` (alias `kyc` on some workflow versions); we
 * probe those documented shapes defensively, same approach as {@link extractDiditScore}.
 *
 * Deliberately fail-open to null: a shape mismatch (or a workflow that omits document data) degrades
 * to the pre-IR26-04 behavior — the caller logs the absence so ops can see extraction coverage, but a
 * verify is never held hostage to a field we couldn't find. Bounds mirror the typed-ID contract
 * (4–40 chars, at least one digit) so junk (empty strings, booleans, prose) can't mint a hash.
 */
export function extractDiditDocumentNumber(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const decision = (p.decision ?? {}) as Record<string, unknown>;
  // V3 webhooks (Didit's default, and the version our destination is registered with — docs/PILOT-READINESS.md
  // step 3) carry every per-feature result as a PLURAL array: the ID report is `decision.id_verifications[]`.
  // The singular `id_verification` object only appears on a destination pinned to `webhook_version: "v2"`.
  // Reading only the singular shape left this extractor returning null on every real V3 webhook.
  const v3 = Array.isArray(decision.id_verifications) ? (decision.id_verifications as unknown[]) : [];
  const v3Entries = v3.filter((e): e is Record<string, unknown> => !!e && typeof e === "object");
  const idVerification = (decision.id_verification ?? {}) as Record<string, unknown>;
  const kyc = (decision.kyc ?? {}) as Record<string, unknown>;
  // personal_number first: Didit defines it as "the OCR'd personal / national identification number, when
  // distinct from the document number" — on a passport the document number is the PASSPORT number, while
  // this is the national ID the dedupe and D-75 need. An ID card without a distinct one falls through to
  // document_number.
  const candidates = [
    ...v3Entries.flatMap((e) => [e.personal_number, e.document_number]),
    idVerification.personal_number,
    idVerification.document_number,
    kyc.personal_number,
    kyc.document_number,
    p.document_number,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const v = c.trim();
    if (v.length >= 4 && v.length <= 40 && /\d/.test(v)) return v;
  }
  return null;
}

/**
 * The verified document's EXPIRY date out of a Didit decision webhook (`expiration_date`, "YYYY-MM-DD", on
 * the ID-verification result), or null when the payload doesn't carry a well-formed one. First Run v2 F6
 * ("Expired 2 Oct 2026", ledger D-82 §4): the rider app names the day their ID expired. Probes the same
 * shapes as {@link extractDiditDocumentNumber} (V3 `id_verifications[]`, the v2 singular object, `kyc`), and
 * fails open to null — a date is never worth holding a decision for. Returned as a UTC midnight Date.
 */
export function extractDiditDocumentExpiry(payload: unknown): Date | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const decision = (p.decision ?? {}) as Record<string, unknown>;
  const v3 = Array.isArray(decision.id_verifications) ? (decision.id_verifications as unknown[]) : [];
  const entries = [
    ...v3.filter((e): e is Record<string, unknown> => !!e && typeof e === "object"),
    (decision.id_verification ?? {}) as Record<string, unknown>,
    (decision.kyc ?? {}) as Record<string, unknown>,
  ];
  for (const e of entries) {
    for (const c of [e.expiration_date, e.date_of_expiry, e.expiry_date]) {
      if (typeof c !== "string") continue;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.trim());
      if (!m) continue;
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      // Round-trip guard: "2026-02-31" is not a date.
      if (d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])) return d;
    }
  }
  return null;
}

/**
 * When an `expired` KYC result is applied (webhook "Kyc Expired" or the ops backstop), the day the ID
 * expired: the document's own expiry date when the verification stored one and it is not after the event,
 * otherwise the day the expiry was applied (the vendor fires it when the document lapses). UTC midnight.
 */
export function kycIdExpiryOnLapse(stored: Date | null | undefined, eventAt: Date): Date {
  const eventDay = new Date(Date.UTC(eventAt.getUTCFullYear(), eventAt.getUTCMonth(), eventAt.getUTCDate()));
  return stored && stored.getTime() <= eventDay.getTime() ? stored : eventDay;
}

/**
 * Whole-number floats (1.0) → integers (1), recursively. Part of the X-Signature-V2 canonical form;
 * matches Didit's server-side canonicalisation. (Mostly a no-op in JS, where JSON.parse already
 * collapses 1.0 → 1 — kept for exact parity with the documented contract.)
 */
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]));
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/** Recursive lexicographic key sort (array order preserved). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/** Canonical body for the X-Signature-V2 HMAC: shortenFloats → sortKeys → JSON.stringify (the JS
 *  default emits unescaped Unicode, matching Didit's canonical form). Throws on non-JSON input. */
export function canonicalizeDiditBody(rawBody: string): string {
  return JSON.stringify(sortKeys(shortenFloats(JSON.parse(rawBody))));
}

function constantTimeHexEquals(expectedHex: string, headerHex: string | undefined): boolean {
  if (!headerHex) return false;
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(headerHex.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify the **X-Signature-V2** webhook signature (Didit's recommended header — it survives JSON
 * middleware re-encoding because both sides sign a canonical re-serialisation, not the raw bytes).
 * Didit HMAC-SHA256s the canonical body with the destination's signing secret; constant-time compare.
 */
export function verifyDiditSignatureV2(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  let canonical: string;
  try {
    canonical = canonicalizeDiditBody(rawBody);
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return constantTimeHexEquals(expected, signatureHeader);
}

/**
 * Verify the legacy **X-Signature** (raw-bytes) header — HMAC-SHA256 over the verbatim request body.
 * Only trustworthy when nothing re-encodes the body before we hash it; we preserve `req.rawBody`, so
 * it works as a fallback for a webhook delivery that carries no X-Signature-V2.
 */
export function verifyDiditSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeHexEquals(expected, signatureHeader);
}

/**
 * Freshness check (replay protection). Didit sends the send-time in the X-Timestamp header (Unix
 * seconds); reject anything outside a 300s window — a valid HMAC over an old body is still a replay.
 *
 * Fail-closed: a missing or unparseable timestamp is NOT fresh, because a V3 destination always
 * sends one. Epoch-millis is tolerated so a seconds/millis unit difference can't reject everything.
 */
export function diditTimestampFresh(timestampHeader: string | undefined, nowMs: number, toleranceSec = 300): boolean {
  if (!timestampHeader) return false;
  let ts = Number(timestampHeader.trim());
  if (!Number.isFinite(ts)) return false;
  if (ts > 1e12) ts = ts / 1000; // tolerate epoch-millis (seconds in 2026 are ~1.7e9)
  return Math.abs(nowMs / 1000 - ts) <= toleranceSec;
}
