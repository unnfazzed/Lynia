/**
 * The ONE place the app talks to a KYC verification SDK — currently a stub that always resolves
 * `failed` (which `resolveKycGate` maps to the `cant_start` wall), because the Didit native SDK is
 * REVERTED (MOB-BOOT-04, 2026-08-21).
 *
 * Route A (owner decision, 2026-08-20) put Didit's native capture/liveness UI inside LyniaGo. That
 * SDK requires React Native's New Architecture, and every build carrying that pair (#31–#33) dies at
 * cold start on a real handset — including build #33, whose JS-only hardening proved the fault sits
 * below the JS module graph. Per docs/COLD-START-CRASH-RCA-2026-08-21.md §8.2 both native changes
 * are reverted together, which removes the package this module used to import.
 *
 * What survives is the seam: callers still get the same `KycLaunchOutcome` union, and
 * `resolveKycGate` remains the single authority on which wall a rider sees. With no SDK present a
 * launch attempt resolves to `failed`, which the gate maps to `cant_start` — the honest state: the
 * check could not be opened on this build. The verdict lane is unchanged (HMAC-signed webhook to
 * /kyc/callback), so riders verified by other means (manual review) are unaffected.
 *
 * Re-landing the SDK: restore the import + result mapping from git history at this file (2026-08-20),
 * together with the New Architecture flag and plugin/keep-rule wiring in app.config.ts — one native
 * change at a time, each behind a sideloaded device cold-start smoke (RCA §8.2 steps 3–6). When it
 * returns, the import must load lazily inside the try below: this module's "never throws" contract
 * once lied because a static import throws before any catch can hold it (RCA §3 #3).
 */
import type { KycSdkResult } from "../logic/gates";

/**
 * What one launch attempt tells the caller.
 *
 * `outcome` feeds `resolveKycGate` (completed → in_flight, cancelled → unfinished, failed →
 * cant_start). `sessionUnusable` is separate because it answers a different question: not "which wall
 * does the rider see" but "is the session credential we hold still worth re-opening".
 */
export interface KycLaunchOutcome {
  outcome: KycSdkResult;
  /**
   * The session itself is dead and re-opening it would fail identically — so the NEXT attempt must
   * mint a fresh one (`retryKyc({ force: true })`) instead of taking the server's free resume path.
   *
   * Set ONLY for an expired token. It deliberately does not cover the other failure types: a denied
   * camera or a dropped network leaves the session perfectly good, and re-minting for those would
   * burn a paid Didit session on every tap to fix a problem a new session cannot fix.
   */
  sessionUnusable: boolean;
}

/**
 * Attempt to open a verification check for `sessionToken`.
 *
 * Never throws: with the native SDK reverted, every call resolves to `failed`, because the caller's
 * job is to pick a wall and `cant_start` is the truthful one — the app cannot open a check on this
 * build. `sessionUnusable` stays false: the credential is fine, this build just has nothing to hand
 * it to, and burning a paid session on retry would fix nothing.
 */
export async function runKycVerification(sessionToken: string | null | undefined): Promise<KycLaunchOutcome> {
  // Referenced so the signature keeps its meaning for callers and for the re-land diff; no SDK to
  // hand it to today.
  void sessionToken;
  return { outcome: "failed", sessionUnusable: false };
}
