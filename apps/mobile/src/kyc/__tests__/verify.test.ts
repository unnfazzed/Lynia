/**
 * The KYC SDK seam — pinned in its REVERTED state (MOB-BOOT-04, 2026-08-21).
 *
 * The Didit native SDK is removed from this build (docs/COLD-START-CRASH-RCA-2026-08-21.md §8.2), so
 * the seam's whole contract collapses to two promises the callers still rely on:
 *
 *   1. It never throws — a launch attempt is how a rider taps "Continue verification", and an
 *      exception there is the silent dead-end this module has always existed to prevent.
 *   2. It resolves `failed` with a usable session — the gate maps that to `cant_start` (the truthful
 *      wall: this build cannot open a check), and `sessionUnusable: false` keeps retries on the
 *      server's free resume path instead of burning a paid Didit credit per tap.
 *
 * The result-union mapping tests (completed/cancelled/failed/sessionExpired) travel with the SDK:
 * restore them from git history at this file (2026-08-20) when the SDK is re-landed per RCA §8.2.
 */
import { runKycVerification } from "../verify";

describe("runKycVerification — reverted-SDK stub", () => {
  it.each(["tok", "", null, undefined] as const)(
    "resolves failed (cant_start) without throwing for token %p",
    async (token) => {
      await expect(runKycVerification(token)).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
    },
  );

  it("never marks the session unusable — retrying must not burn a paid session this build cannot open", async () => {
    const result = await runKycVerification("still-valid-token");
    expect(result.sessionUnusable).toBe(false);
  });
});
