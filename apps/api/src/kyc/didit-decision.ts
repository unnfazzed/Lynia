import type { Logger } from "@nestjs/common";
import type { RiderService } from "../riders/rider.service";
import {
  decideDiditKyc,
  extractDiditDocumentExpiry,
  extractDiditDocumentNumber,
  extractDiditScore,
  isDiditReviewHold,
  mapDiditStatus,
} from "./didit";

/** The rider-side writes a Didit decision can make — the subset of RiderService this path needs. */
export type DiditDecisionRiders = Pick<
  RiderService,
  "applyKycResult" | "recordHeldVerifiedId" | "recordKycVendorStatus" | "kycSessionOwner"
>;

export interface DiditDecisionInput {
  /** Didit's session id — the rider's stored kycRef. */
  sessionId: string;
  /** Didit's status literal (Approved, Declined, In Review, Kyc Expired, …). */
  status: string;
  /**
   * The decision payload in WEBHOOK shape (`decision.face_matches[]`, `decision.id_verifications[]`, …).
   * PII: only what the extractors pull out leaves it, and it is never logged.
   */
  payload: unknown;
  /** The time this decision speaks for — the signed body timestamp, or the read time for a reconcile. */
  eventAt: Date;
  /** For the log lines: where the decision came from. */
  source: "webhook" | "reconcile";
}

/**
 * Apply one Didit verdict for a session to its rider — the ONE path both the signed status webhook
 * (KycController.callback) and the lost-webhook reconciler (KYC-R26-03, KycReconcileService) take, so a
 * reconciled decision gets exactly the face-match bands, the document dedupe/adoption, the held-for-review
 * handling, the expiry and the R26-01/02 guards a delivered one gets. Extracted unchanged from the controller.
 *
 * KYC-R26-07: when the payload carries `vendor_data` (the profileId we gave Didit at session-create) and it
 * names someone OTHER than the rider holding this session, nothing is applied. A session id is only a lookup
 * key; a signed delivery whose two identities disagree is a vendor-side mix-up or a misrouted workflow, and
 * flipping the wrong rider's KYC on it is worse than leaving the check for the reviewer. Logged at warn.
 */
export async function applyDiditDecision(
  riders: DiditDecisionRiders,
  logger: Pick<Logger, "log" | "warn">,
  input: DiditDecisionInput,
): Promise<Record<string, unknown>> {
  const { sessionId, status, payload, eventAt, source } = input;
  const vendorData = payload && typeof payload === "object" ? (payload as Record<string, unknown>).vendor_data : undefined;
  if (typeof vendorData === "string" && vendorData.trim() !== "") {
    const owner = await riders.kycSessionOwner(sessionId);
    if (owner && owner !== vendorData.trim()) {
      logger.warn(`KYC ${source} for session ${sessionId}: vendor_data names a different rider than the session's owner — not applied (KYC-R26-07)`);
      return { ignored: true, reason: "vendor_data_mismatch" };
    }
  }

  // Auto-decision (Didit thresholds): the face-match score (KYC_THRESHOLDS bands) can only tighten
  // Didit's own verdict; with no score the status-string mapping decides. A `needsReview` band — like
  // any non-terminal status — stays `pending`: it's held for the admin backstop, never auto-verified.
  // `failed` from a sub-threshold score carries a decline reason for the rider app.
  const score = extractDiditScore(payload);
  const decision = decideDiditKyc(status, score);
  // IR26-07 coverage signals. On a Didit approval our bands are the last check, so say when they
  // could not run, and when they held a rider Didit approved (nothing else records why it's pending).
  if (mapDiditStatus(status) === "verified") {
    if (score === null) {
      logger.log(`KYC ${source} for session ${sessionId}: approved with no face-match score — bands skipped`);
    } else if (decision.status === "pending") {
      logger.log(`KYC ${source} for session ${sessionId}: approved, face match in the review band — held for review`);
    }
  }

  if (decision.status === "pending") {
    // R-1 / R-3 (startup review 2026-10-06): every undecided status is the vendor's signed word about
    // the session, so it is kept — /auth/me reads a hold (In Review, a review-band approval) as the
    // "under review" wall instead of "usually under a minute", and a dead session (Abandoned, Expired)
    // loses its stored credentials here so the next retry mints rather than resuming it forever.
    await riders.recordKycVendorStatus(sessionId, status, eventAt);
    // D-75 item 2 (IR26-09): a result held for a human (Didit's In Review, or a Didit approval in the
    // review band) still carries the number Didit read from the document. It is stored for the reviewer
    // and the hand approval that adopts it; the decision itself stays unresolved. An unfinished session's
    // partial data is not a judged result, so its number is not stored.
    if (!isDiditReviewHold(status, score)) return { ignored: true, status: decision.status };
    const heldNumber = extractDiditDocumentNumber(payload);
    if (!heldNumber) {
      // Coverage signal, like applyKycResult's: approving this rider will adopt no number.
      logger.log(`KYC ${source} for session ${sessionId}: held for review with no document number — nothing stored`);
      return { ignored: true, status: decision.status };
    }
    const held = await riders.recordHeldVerifiedId(sessionId, heldNumber);
    if (held.updated === 0) {
      // No undecided check has this ref: a superseded or already-decided check (whose own decision keeps
      // its number), or an unknown session. Expected after a decision; surfaced for reconciliation.
      logger.log(`KYC ${source} for session ${sessionId}: held result matched no undecided check — nothing stored`);
    }
    return { ignored: true, status: decision.status, verifiedIdStored: held.updated > 0 };
  }

  const res = await riders.applyKycResult(
    sessionId,
    decision.status,
    eventAt,
    decision.reason ?? null,
    // IR26-04: the document number the vendor verified (or null when the payload omits it — the
    // service degrades to typed-ID-only dedupe and logs the coverage gap). Hashed downstream; the
    // raw number is never persisted or logged.
    extractDiditDocumentNumber(payload),
    // First Run v2 F6 (D-82 §4): the document's expiry date, so an expired rider can be told the day — and
    // KYC-R26-08: a verify whose document already expired is declined `id_expired` downstream.
    extractDiditDocumentExpiry(payload),
  );
  if (res.updated === 0 && !res.skipped) {
    // No rider has this ref, or the event was stale — surface for reconciliation. (A KYC-R26-01 repeat or a
    // KYC-R26-02 admin-decided check is logged by applyKycResult itself and is expected, not a warning.)
    logger.warn(`KYC ${source} for session ${sessionId} (${decision.status}) matched no rider or was stale`);
  }
  return res;
}
