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
 * out before the rider finished, so they can simply retry) — maps to pending here.
 *
 * In Review maps to pending HERE, but that is not the rider's outcome: KYC-R26-12 made the decision fully
 * automatic, so {@link decideDiditKyc} declines an In Review (nothing waits for a human). Only a session
 * Didit never finished judging stays pending. Normalised like {@link classifyDiditSession} (case and
 * `_`/`-`/space runs), so `KYC_EXPIRED` and `Kyc Expired` are one status.
 */
export function mapDiditStatus(status: string): RiderKyc {
  switch (normDiditStatus(status)) {
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
 *   In Review                               the vendor holds it            → in_flight
 *   Approved / Declined                     terminal; the webhook that flips kycStatus is in flight,
 *                                           so while the row still says pending, so is the check → in_flight
 *   Not Started / In Progress / Awaiting User  never opened, opened and not finished, or backed out → unfinished
 *   Resubmitted                             KYC-R26-11: Didit's reviewer sent steps BACK to the rider (re-take
 *                                           the document / selfie) — the rider owes the next move, so it is a
 *                                           resume (`unfinished`), not "with the vendor". Reading it as in flight
 *                                           parked the rider on "under review" with no button while Didit
 *                                           waited on them.
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
    case "approved":
    case "declined":
      return "in_flight";
    default:
      // Not Started | In Progress | Awaiting User | Resubmitted (KYC-R26-11) | dead | unknown
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
 *   in_flight  A terminal Approved / Declined whose webhook is still on its way.
 *   unfinished Not Started / In Progress / Awaiting User, Resubmitted (KYC-R26-11: Didit asked the rider to
 *              redo steps — their move, so the app offers the resume), and anything unknown (the safe default —
 *              see mapDiditPendingState).
 *
 * `mapDiditPendingState` keeps its two-value answer for the `/auth/me` field older apps read; this one
 * feeds the additive `kycHeld` flag and retryKyc's dead-session check.
 */
export type DiditSessionClass = "in_flight" | "unfinished" | "held" | "dead";

/** Didit's status literal for an approval — what a held-for-review approval leaves on the rider row. */
export const DIDIT_APPROVED_STATUS = "Approved";

/** Didit's status literal for a check sent to review — what an unreadable card held for a person leaves on the row. */
export const DIDIT_IN_REVIEW_STATUS = "In Review";

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
    case "approved":
    case "declined":
      return "in_flight";
    default:
      // Not Started | In Progress | Awaiting User | Resubmitted (KYC-R26-11) | unknown
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
 * V3 first (IR26-07). Our destination is registered as `webhook_version: "v3"` (docs/AZURE-OWNER-RUNBOOK.md
 * §4 step 3), and V3 carries every per-feature result as a PLURAL array: the face-match report is
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
 * Auto-decision for a Didit KYC result (NOTE: the threshold lives in packages/shared/src/policy.ts
 * `KYC_THRESHOLDS` — no magic numbers).
 *
 * The face-match score can only make Didit's verdict STRICTER, never looser (IR26-07). It measures one
 * feature, while Didit's status covers all of them: document validity, liveness (the anti-spoofing
 * check), AML, and anything its workflow flagged. A spoof that fails liveness can still match the
 * document's face, so a high score must never turn a decline into a verify.
 *
 * KYC-R26-12 (owner 2026-10-12): the decision is FULLY AUTOMATIC — nothing a vendor judged waits for a human.
 * Per Didit status:
 *   - Approved   score >= the threshold (or no score) → `verified`; below it → `failed` (face_mismatch)
 *   - Declined   `failed`, with the face-mismatch reason when the score is below the threshold, else the
 *                reason Didit's warnings point at ({@link extractDiditDeclineReason})
 *   - In Review  `failed` the same way. The live workflow routes its review cases to Declined, so this is the
 *                backstop for one that still arrives (a reviewer re-opening a session in the console, an old
 *                workflow version): a check Didit would not pass on its own is not passed by us either.
 *   - anything else (Abandoned, Expired, Kyc Expired, non-terminal) → the status mapping, score ignored:
 *                a partial result from a session Didit never finished judging decides nothing
 * `payload` is the decision payload, read only for the decline reason; a `reason` is returned only on a decline.
 */
export function decideDiditKyc(status: string, score: number | null, payload?: unknown): { status: RiderKyc; reason?: string } {
  const vendor = mapDiditStatus(status);
  const inReview = isDiditInReview(status);
  if (!(vendor === "verified" || vendor === "failed" || inReview)) return { status: vendor };
  if (score !== null && score < KYC_THRESHOLDS.needsReview) {
    // Store a canonical KycDeclineReason KEY (not a sentence) so the rider app resolves it via
    // KYC_DECLINE_REASON_LABELS, same as an admin decline — a sub-threshold face-match is a mismatch.
    return { status: "failed", reason: KycDeclineReason.FACE_MISMATCH };
  }
  if (vendor === "failed" || inReview) {
    const reason = extractDiditDeclineReason(payload) ?? (inReview ? KycDeclineReason.OTHER : undefined);
    return reason ? { status: "failed", reason } : { status: "failed" };
  }
  return { status: "verified" };
}

/**
 * KYC-R26-12: the decline reason a Didit decision points at, read from the `warnings[]` its features attach
 * (`decision.id_verifications[].warnings[].risk`, and the same on liveness / face-match entries). Now that every
 * review case is an automatic decline, the rider's decline screen (F4a–d, F5dup) is the only explanation they
 * get, so a duplicate face should read as a duplicate and a blurry card as unreadable, not as "something went
 * wrong". Matched on keywords rather than an exact list, because Didit adds and renames risk codes; the most
 * serious match wins. FAIL-OPEN: no warnings, or none recognised → null (the caller's own default applies).
 */
export function extractDiditDeclineReason(payload: unknown): string | null {
  const risks = warningRisks(payload);
  if (risks.length === 0) return null;
  const has = (re: RegExp) => risks.some((r) => re.test(r));
  // KYC-R26-13: under age is checked FIRST — see isUnderageRisk.
  if (risks.some(isUnderageRisk)) return KycDeclineReason.UNDERAGE;
  if (has(/DUPLICAT|BLOCKLIST|FRAUD/)) return KycDeclineReason.DUPLICATE;
  // Only direct evidence of a forged document is a tampering strike. A machine-readable zone, a cross-field check
  // or a validation that fails is, on a worn card or a soft photo, far more often a misread than a forgery (owner
  // 2026-10-15) — those fall to "unreadable" below: declined all the same, retried with a better photo, no strike.
  if (has(/TAMPER|ALTER|PRINTED|SCREEN_REPLAY|PORTRAIT_REPLACE/)) return KycDeclineReason.DOC_TAMPERED;
  // SCREEN_CAPTURE is only a liveness strike when it is about the SELFIE. Raised on the ID document it is Didit's
  // "screen capture of document" score, which a real card photographed through the in-app web camera trips (glare,
  // moiré): the 2026-10-16 biker failed it with a selfie scoring 100 and a face match of 90.5, then passed with the
  // same card four minutes later. That is a retake of the card photo (F4a), not "your face didn't match" (F4b), and
  // not a strike. Unattributable (outside every feature) stays a liveness finding, as before.
  // Both counts read the decision only: the poll and sweep (kyc-reconcile applyRead) hand over Didit's flat
  // decision body with that same body ALSO under `decision`, so a whole-payload count saw the card's finding
  // twice, called one of them the selfie's, and struck the biker the webhook would have let retake.
  const documentRisks = warningRisks(documentEntries(payload));
  const screenCaptureOffDocument = countOf(warningRisks(decisionOnly(payload)), /SCREEN_CAPTURE/) > countOf(documentRisks, /SCREEN_CAPTURE/);
  if (has(/LIVENESS|SPOOF|INJECT|VIRTUAL_CAMERA|VIDEO_ANOMALY|MULTIPLE_FACES/) || screenCaptureOffDocument) return KycDeclineReason.LIVENESS_FAILED;
  if (has(/FACE_MATCH|SIMILARITY|FACE_MISMATCH/)) return KycDeclineReason.FACE_MISMATCH;
  if (has(/EXPIRED|EXPIRATION/)) return KycDeclineReason.ID_EXPIRED;
  if (has(/BLUR|QUALITY|DARK|BRIGHT|UNREADABLE|NOT_DETECTED|NOT_READ|OCCLU|PORTRAIT|MRZ|INCONSISTENT|INVALID_VALIDATION|SCREEN_CAPTURE/)) {
    return KycDeclineReason.ID_UNREADABLE;
  }
  return null;
}

/** How many of `risks` match `re` — a count, so a code raised on both the card and the selfie isn't read as card-only. */
function countOf(risks: string[], re: RegExp): number {
  return risks.filter((r) => re.test(r)).length;
}

/** The decision under a payload, alone — or the payload itself when it carries none. */
function decisionOnly(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const decision = (payload as Record<string, unknown>).decision;
  return decision && typeof decision === "object" && !Array.isArray(decision) ? { decision } : payload;
}

/** The ID-document results under a decision payload (empty when it has none, or isn't a decision). */
function documentEntries(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const decision = (payload as Record<string, unknown>).decision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return [];
  return diditFeatureEntries(decision as Record<string, unknown>, ...DOC_FEATURES);
}

/**
 * Every finding (`warnings[].risk`, upper-cased) anywhere under `v`, however deep Didit nests its features.
 * Owner 2026-10-15 ("remove pain points"): an information-level note is not a finding. The one real session so
 * far carried LIVENESS_VIDEO_ANOMALY at that level — read as a finding, a decline on the same session would have
 * cost an honest biker a liveness strike. A warning with no level still counts, and so does a strike or final
 * code at any level (NEVER_A_NOTE). `notes: true` keeps the information-level ones too — for a gate that VERIFIES,
 * where a note is still evidence (isSelfieCameraFailure).
 */
function warningRisks(v: unknown, opts: { notes?: boolean } = {}): string[] {
  const risks: string[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "warnings" && Array.isArray(value)) {
        for (const w of value) {
          // Never for a strike or final code, though: a duplicate, fraud, forgery or under-age finding counts at any level.
          const risk = w && typeof w === "object" ? (w as Record<string, unknown>).risk : w;
          if (typeof risk !== "string") continue;
          const code = risk.toUpperCase();
          if (!opts.notes && w && typeof w === "object" && isInformationalWarning(w as Record<string, unknown>) && !NEVER_A_NOTE.test(code)) continue;
          risks.push(code);
        }
      } else {
        walk(value, depth + 1);
      }
    }
  };
  walk(v, 0);
  return risks;
}

/**
 * KYC-R26-13: an under-age finding. It is the one `final` reason (KYC_DECLINE_CLASS: it locks at once), so the
 * match is deliberately narrow: `AGE` only as a whole `_`-delimited word next to an under / minimum / below /
 * restriction signal (MINIMUM_AGE, MINIMUM_AGE_NOT_MET, AGE_BELOW_MINIMUM, AGE_RESTRICTION, UNDER_AGE, UNDERAGE),
 * so the image / page codes that merely contain the letters (LOW_QUALITY_IMAGE, IMAGE_TOO_DARK, PAGE_MISSING)
 * never read as a rider's age — and an age the vendor merely couldn't read (AGE_NOT_DETECTED,
 * COULD_NOT_ESTIMATE_AGE) is not a finding that the rider is under age.
 */
function isUnderageRisk(r: string): boolean {
  return (
    /UNDER_?AGE|(^|_)(MINIMUM_AGE|AGE_(BELOW|UNDER|RESTRICT|LIMIT|MINIMUM|NOT_MET))|BELOW_(MINIMUM_)?AGE(_|$)/.test(r) &&
    !/NOT_DETECTED|COULD_NOT|UNABLE|NOT_READ|UNKNOWN/.test(r)
  );
}

/** The `selfie_check` reason when the selfie couldn't be checked because of the phone's camera (owner 2026-10-15). */
export const SELFIE_CAMERA_QUALITY = "camera_quality";

/**
 * A finding that is evidence about WHO is in front of the camera, or about the document — never the camera's
 * quality. Any one of these, anywhere in the decision, means the selfie failure is not "just the camera".
 */
const IDENTITY_RISK =
  /SPOOF|ATTACK|INJECT|VIRTUAL_CAMERA|SCREEN_(REPLAY|CAPTURE)|DEEPFAKE|MASK|REPLAY|MULTIPLE_FACES|VIDEO_ANOMALY|LOW_LIVENESS|LIVENESS_SCORE|DUPLICAT|BLOCKLIST|FRAUD|TAMPER|ALTER|PRINTED|PORTRAIT_REPLACE|LOW_FACE_MATCH|FACE_MISMATCH|SIMILARITY|NAME_MISMATCH|EXPIRED|EXPIRATION/;

/**
 * A selfie finding that a phone's camera produces: blur, light, distance, centring — and nothing else. A face that
 * wasn't found, a check that couldn't run or a low liveness score is NOT a camera finding: a covered or darkened
 * selfie produces the first two on purpose, and a low liveness score is Didit's anti-spoof signal for a printed
 * photo or a screen replay (owner hold on #1216, 2026-10-15).
 */
const CAMERA_QUALITY_RISK = /QUALITY|BLUR|LUMINANCE|LIGHT|DARK|BRIGHT|TOO_(FAR|CLOSE)|CENTER/;

/** Didit's per-feature results under the decision, V3 plural arrays first, then the V2 singular object. */
function diditFeatureEntries(decision: Record<string, unknown>, v3: string, v2: string): Record<string, unknown>[] {
  const isObj = (e: unknown): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e);
  const plural = Array.isArray(decision[v3]) ? (decision[v3] as unknown[]).filter(isObj) : [];
  return plural.length > 0 ? plural : isObj(decision[v2]) ? [decision[v2] as Record<string, unknown>] : [];
}

const DOC_FEATURES: [string, string] = ["id_verifications", "id_verification"];
const LIVENESS_FEATURES: [string, string] = ["liveness_checks", "liveness"];
const FACE_FEATURES: [string, string] = ["face_matches", "face_match"];
const SELFIE_FEATURES: [string, string][] = [LIVENESS_FEATURES, FACE_FEATURES];

/**
 * Owner 2026-10-15: a check whose ID document passed but whose SELFIE failed only because of the phone's camera
 * — blur, light, distance, no usable face, Didit unsure — verifies the biker with the selfie flagged for ops,
 * instead of declining them. Bikers on low-end phones were otherwise stuck in a loop the camera can't get them
 * out of. A selfie that doesn't match the ID, or any sign of a spoof, still declines: those are what the selfie
 * is for.
 *
 * True only when ALL of these hold (anything unrecognised reads false, so the decision falls back to today's):
 *  - Didit declined the session, or sent it to review;
 *  - the selfie WAS compared to the card and matched: every face-match result is Approved with a score at or
 *    above KYC_THRESHOLDS.needsReview (no score — nothing compared — is never enough);
 *  - every ID-document result is Approved, and the decision carries the document number (the ID is verified);
 *  - every other non-selfie result (IP analysis, AML…) that reports a status is Approved;
 *  - only liveness failed, and EVERY selfie finding is a camera one (blur, light, distance, centring) — a failed
 *    liveness with no finding at all is unexplained, and is not waved through;
 *  - no identity finding anywhere (spoof, duplicate, tampering, a face mismatch, an expired card, under age) —
 *    at ANY level. Owner 2026-10-16 ("liveness is necessary"): an information-level note costs no strike, but it
 *    can't turn a decline into a verify; on this path liveness is the only defence against a replay of the card
 *    holder's own face, which the face match passes.
 */
export function isSelfieCameraFailure(status: string, score: number | null, payload: unknown): boolean {
  if (!(mapDiditStatus(status) === "failed" || isDiditInReview(status))) return false;
  if (score === null || score < KYC_THRESHOLDS.needsReview) return false;
  if (!payload || typeof payload !== "object") return false;
  const decision = ((payload as Record<string, unknown>).decision ?? {}) as Record<string, unknown>;
  const approved = (e: Record<string, unknown>) => typeof e.status === "string" && normDiditStatus(e.status) === "approved";

  const docs = diditFeatureEntries(decision, ...DOC_FEATURES);
  if (docs.length === 0 || !docs.every(approved)) return false;
  if (!extractDiditDocumentNumber(payload)) return false;

  // The selfie must have been compared to the card, and matched: only liveness may have failed.
  const faces = diditFeatureEntries(decision, ...FACE_FEATURES);
  const matched = (e: Record<string, unknown>) => {
    const s = percentToUnit(e.score);
    return approved(e) && s !== null && s >= KYC_THRESHOLDS.needsReview;
  };
  if (faces.length === 0 || !faces.every(matched)) return false;
  const liveness = diditFeatureEntries(decision, ...LIVENESS_FEATURES);
  // No liveness result at all, or every one approved: nothing on the selfie failed, so this isn't that case.
  if (liveness.every(approved)) return false;
  const selfie = [...liveness, ...faces];

  const known = new Set([...DOC_FEATURES, ...SELFIE_FEATURES.flat()]);
  for (const [key, value] of Object.entries(decision)) {
    if (known.has(key)) continue;
    const entries = Array.isArray(value) ? value : [value];
    for (const e of entries) {
      if (e && typeof e === "object" && typeof (e as Record<string, unknown>).status === "string" && !approved(e as Record<string, unknown>)) return false;
    }
  }

  const all = warningRisks(payload, { notes: true });
  if (all.some((r) => isUnderageRisk(r) || IDENTITY_RISK.test(r))) return false;
  const selfieRisks = warningRisks(selfie);
  return selfieRisks.length > 0 && selfieRisks.every((r) => CAMERA_QUALITY_RISK.test(r));
}

/** Codes that cost a strike or lock the account (duplicate, forgery, under age): counted whatever level Didit
 *  reports them at, so an information-level label can never turn one into a free retry. Deliberately broad. */
const NEVER_A_NOTE = /DUPLICAT|BLOCKLIST|FRAUD|TAMPER|ALTER|PRINTED|SCREEN_REPLAY|PORTRAIT_REPLACE|UNDER_?AGE|MINIMUM_AGE|BELOW_(MINIMUM_)?AGE/;

/** A Didit warning marked information-level (`log_type`, or a `level` / `severity` alias): a note, not a finding. */
function isInformationalWarning(w: Record<string, unknown>): boolean {
  const level = w.log_type ?? w.level ?? w.severity;
  return typeof level === "string" && /^info(rmation(al)?)?$/i.test(level.trim());
}

/** Didit's "In Review", with the same separator-tolerant normalisation as mapDiditPendingState: Didit has
 *  also spelled it `in_review` and `IN_REVIEW`. */
function isDiditInReview(status: string): boolean {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "in review";
}

/**
 * A status Didit will not move on its own any more, and that decides the rider's check: Approved, Declined,
 * Kyc Expired, and In Review (declined by decideDiditKyc since KYC-R26-12). What the `/auth/me` poll's vendor
 * read hands the reconciler to apply when the webhook carrying it is late or lost. Abandoned / session
 * Expired are dead, not decided: they record a vendor status, which the sweep does on its own schedule.
 */
export function isDiditDecisionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return mapDiditStatus(status) !== "pending" || isDiditInReview(status);
}

/** The PERSISTED statuses of a dead session (classifyDiditSession `dead`), normalised: what the reconcile
 *  candidate query compares a stored status against, in SQL, after the same normalisation. */
export const DIDIT_DEAD_STATUSES_NORMALISED = ["abandoned", "expired", "kyc expired"] as const;

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
 *
 * KYC-R26-12: with the decision fully automatic nothing is held any more, so this is false for every status
 * today. It stays the single definition of "held" should a hold band ever return.
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
  // V3 webhooks (Didit's default, and the version our destination is registered with — docs/AZURE-OWNER-RUNBOOK.md
  // §4 step 3) carry every per-feature result as a PLURAL array: the ID report is `decision.id_verifications[]`.
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
 * KYC-R26-06: a Didit `timestamp` (the SIGNED body field, or the X-Timestamp header) as Unix SECONDS, or null
 * when it is missing or not a finite positive number. Didit documents seconds; a value past 1e12 can only be
 * epoch-millis (seconds in 2026 are ~1.8e9, and 1e12 seconds is the year 33658), so it is divided down rather
 * than read as a date 1000x in the future — which, used as `eventAt`, would have made every later decision on
 * that check look OLDER than this one to applyKycResult's monotonic guard.
 */
export function diditTimestampSeconds(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? n / 1000 : n;
}

/** The event time a Didit delivery carries (body `timestamp`, normalised by {@link diditTimestampSeconds}),
 *  or null when it carries none. */
export function diditEventAt(raw: unknown): Date | null {
  const s = diditTimestampSeconds(raw);
  return s === null ? null : new Date(Math.round(s * 1000));
}

/**
 * KYC-R26-08: has the verified document already expired by the day of this decision? The expiry is a UTC
 * midnight date (extractDiditDocumentExpiry); the document is valid THROUGH that day, so it is expired only
 * when that day is strictly before the decision's UTC day. A missing date is never expired (fail-open, like
 * every other extraction here — the vendor's own expiry check stays the primary gate).
 */
export function isDiditDocumentExpired(expiresOn: Date | null | undefined, at: Date): boolean {
  if (!expiresOn) return false;
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  return expiresOn.getTime() < day;
}

/**
 * Freshness check (replay protection). Didit sends the send-time in the X-Timestamp header (Unix
 * seconds); reject anything outside a 300s window — a valid HMAC over an old body is still a replay.
 *
 * Fail-closed: a missing or unparseable timestamp is NOT fresh, because a V3 destination always
 * sends one. Epoch-millis is tolerated so a seconds/millis unit difference can't reject everything.
 */
export function diditTimestampFresh(timestamp: string | number | undefined, nowMs: number, toleranceSec = 300): boolean {
  // Epoch-millis tolerated (diditTimestampSeconds), so a seconds/millis unit difference can't reject everything.
  const ts = diditTimestampSeconds(timestamp);
  if (ts === null) return false;
  return Math.abs(nowMs / 1000 - ts) <= toleranceSec;
}
