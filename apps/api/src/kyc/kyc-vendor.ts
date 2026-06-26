/**
 * KYC vendor seam (T7). The vendor verifies a Zimbabwean national ID asynchronously and calls
 * back with the result. Behind an interface so a vendor swap (or the manual backstop) is contained.
 */
export interface KycSubmission {
  ref: string;
  status: "pending";
  /** Verification link the rider opens to complete the check (vendor-hosted flow). */
  url?: string;
}

export interface KycVendor {
  /** Submit a rider for verification; returns a reference the callback will quote. */
  submit(riderId: string): Promise<KycSubmission>;
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
}
