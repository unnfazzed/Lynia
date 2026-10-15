import type { ServerKycPendingState } from "./kyc-pending-state";

/**
 * KYC vendor seam (T7). The vendor verifies a Zimbabwean national ID asynchronously and calls
 * back with the result. Behind an interface so a vendor swap (or the manual backstop) is contained.
 */
export interface KycSubmission {
  ref: string;
  status: "pending";
  /** Verification link the rider opens to complete the check (vendor-hosted flow). */
  url?: string;
  /**
   * SECRET — the vendor's short-lived session token, the credential the NATIVE SDK needs to open (or
   * re-open) this check on the device. Didit returns it only at session-create time; the decision
   * endpoint gives back status and a url but never a token, so this is the only chance to capture it,
   * and without it a resume has to mint a fresh paid session (P0-2 / D7).
   *
   * Never log it. It reaches exactly one place — the owning rider's own `getMe`.
   */
  token?: string;
}

/**
 * The identity the account claims, sent with the session so the vendor checks the ID against it (owner
 * 2026-10-15: the biker check is the ID document plus the signup name — no selfie). Didit compares these to
 * what it reads off the document and declines a mismatch (`expected_details_mismatch_action`).
 */
export interface KycExpectedDetails {
  firstName: string;
  lastName?: string | null;
}

export interface KycVendor {
  /**
   * Submit a rider for verification; returns a reference the callback will quote. `expected` is the
   * signup name the document must match — omitted, the vendor runs the check without a name comparison.
   */
  submit(riderId: string, expected?: KycExpectedDetails): Promise<KycSubmission>;

  /**
   * Read whether a still-pending session is actually in flight or is waiting on the rider (P0-1 / D6).
   *
   * OPTIONAL: a vendor with no notion of a resumable session simply omits it and every pending rider
   * reads `unfinished` — the documented safe default. It must NEVER throw: a vendor outage has to
   * degrade to a default, not fail the rider's own `/auth/me`.
   */
  pendingState?(ref: string): Promise<ServerKycPendingState>;

  /**
   * The vendor's RAW status string for a session (e.g. Didit's "In Review", "Expired"), or null when it
   * can't be read. OPTIONAL and, like `pendingState`, must never throw. Preferred over `pendingState`
   * when present: the raw status also tells a held check (R-3) and a dead session (R-1) apart, which the
   * two-value pending state cannot.
   */
  sessionStatus?(ref: string): Promise<string | null>;

  /**
   * `sessionStatus` and the decision body it was read from, in one call — the read the `/auth/me` poll
   * makes (KycPendingStateService). OPTIONAL; never throws; null when unreadable. The body exists so a
   * DECIDED status the poll happens to see first (its webhook late or lost) can be applied through the
   * reconciler without a second vendor call. PII: the caller hands it straight on and never keeps it.
   */
  sessionRead?(ref: string): Promise<{ status: string; decision: unknown } | null>;

  /**
   * KYC-R26-03: the vendor's FULL decision for a session (Didit: `GET /v3/session/{id}/decision/`), or null
   * when it can't be read. OPTIONAL; never throws. Used ONLY by the lost-webhook reconciler
   * (KycReconcileService), which feeds it through the same extraction + applyKycResult path the webhook uses.
   * The payload is PII (document fields, face-match data): callers must never log, cache or persist it —
   * only the fields the webhook path already persists (status, score, hashed number, expiry day) leave it.
   */
  sessionDecision?(ref: string): Promise<unknown>;

  /**
   * KYC-R26-05: ask the vendor to delete a session and everything it holds (document images, selfie,
   * extracted fields), for account erasure. OPTIONAL (a vendor that keeps nothing omits it). Resolves `true`
   * when the session is gone (a 404 counts — already gone), `false` when the vendor couldn't be reached or
   * refused; never throws, so erasure can log and carry on (see PrivacyService.eraseAccount).
   */
  deleteSession?(ref: string): Promise<boolean>;
}

export const KYC_VENDOR = Symbol("KYC_VENDOR");

/**
 * Placeholder vendor: returns a pending reference. Real provider wiring (and a measured
 * false-reject rate on real ZIM IDs) lands at the T0 spike — the manual-review backstop covers
 * the gap if no vendor adequately supports Zimbabwean IDs.
 */
export class StubKycVendor implements KycVendor {
  async submit(riderId: string): Promise<KycSubmission> {
    return { ref: `kyc_${riderId}_${Date.now().toString(36)}`, status: "pending" };
  }

  /** KYC-R26-05: the stub holds nothing at a vendor, so there is nothing to delete. */
  async deleteSession(_ref: string): Promise<boolean> {
    return true;
  }
}
