/**
 * The ONE place the app talks to Didit's native SDK.
 *
 * Route A (owner decision, 2026-08-20): the rider never leaves LyniaGo to verify. Didit's native SDK
 * puts the capture + liveness UI on top of our screen as a full-screen modal and hands back a result;
 * Didit still does the analysis, and the verdict still arrives the way it always did — by HMAC-signed
 * webhook to /kyc/callback. What changed is only where the rider stands while it happens.
 *
 * Why a wrapper instead of importing `startVerification` in the two screens that launch a check:
 *
 *  - It is the only import site of a NATIVE module. Anything native is absent in Jest and in Expo Go,
 *    so a direct import in a screen makes that whole screen unmountable in tests. Here it is one
 *    module to mock (`__mocks__/@didit-protocol/sdk-react-native.js`).
 *  - The SDK's result union is not the app's. Mapping it once, in a tested pure-ish function, is what
 *    keeps `resolveKycGate` — which already models exactly these three outcomes — the single authority
 *    on which wall a rider sees.
 */
import { startVerification } from "@didit-protocol/sdk-react-native";
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
 * Open Didit's native check for `sessionToken` and map the result onto the app's three pending states.
 *
 * Never throws: every failure path — no token, an unlinked native module, a mid-flow SDK error —
 * resolves to `failed`, because the caller's job is to pick a wall, and an exception there would put
 * the rider back on the silent dead-end this whole change exists to remove.
 */
export async function runKycVerification(sessionToken: string | null | undefined): Promise<KycLaunchOutcome> {
  // No credential, nothing to open. `failed` (not `cancelled`) because the rider did nothing wrong and
  // did not walk away — the app could not start the check, which is what `cant_start` says.
  if (!sessionToken) return { outcome: "failed", sessionUnusable: false };

  try {
    // Config left at the SDK's defaults on purpose. Its own defaults already give the rider a close
    // button and an exit confirmation, which is the exit affordance the navigation review (N-05..N-07)
    // asked every full-screen step to have; overriding them would remove it. Didit's UI is outside our
    // pixel-parity surface by D-34, so we do not restyle it either.
    const result = await startVerification(sessionToken);

    switch (result.type) {
      case "completed":
        // Deliberately NOT branching on `result.session.status` (Approved / Pending / Declined). The
        // device's copy of the verdict is a preview, not the decision: the server records KYC only
        // from the signed webhook, so treating an on-device "Approved" as verified would let a
        // tampered client promote itself. All this says is "the rider finished the flow" — the wall
        // becomes in_flight, and the real verdict arrives by webhook.
        return { outcome: "completed", sessionUnusable: false };
      case "cancelled":
        // They closed it themselves. Nothing broke and nothing was assessed: resume, don't restart.
        return { outcome: "cancelled", sessionUnusable: false };
      case "failed":
        return { outcome: "failed", sessionUnusable: result.error?.type === "sessionExpired" };
      default:
        // Unreachable against today's union — TS proves the three cases above are exhaustive — but the
        // SDK is untyped JavaScript at runtime, so a result type added in a future version would
        // otherwise fall out of this function as `undefined` and read as neither success nor failure.
        return { outcome: "failed", sessionUnusable: false };
    }
  } catch {
    // The native module is missing (Expo Go, a stripped build) or threw. Same rider-visible truth as
    // any other launch failure: the check could not be opened.
    return { outcome: "failed", sessionUnusable: false };
  }
}
