/**
 * The KYC launch seam — the in-app-browser fallback lane (MOB-BOOT-04).
 *
 * The Didit native SDK is removed from this build (docs/COLD-START-CRASH-RCA-2026-08-21.md §8.2).
 * The stub that replaced it resolved EVERY launch `failed`, which walled every pending rider behind
 * `cant_start` with a "Try again" that could only fail identically — no path on the build could
 * finish or correct an ID check. These tests pin the restored browser hand-off: the vendor-hosted
 * `verificationUrl` opens in an in-app tab, the rider's exit maps onto the same three pending
 * states, and the two contract promises the callers rely on still hold:
 *
 *   1. It never throws — a launch attempt is how a rider taps "Finish verifying", and an exception
 *      there is the silent dead-end this module has always existed to prevent.
 *   2. It never marks the session unusable — the hosted flow renders its own expired page inside the
 *      tab, so the browser lane cannot observe expiry, and reporting it would burn a paid Didit
 *      credit per tap on the server's forced-mint path.
 *
 * The native result-union mapping tests (completed/cancelled/failed/sessionExpired) travel with the
 * SDK: restore them from git history at this file (2026-08-20) when the SDK is re-landed per RCA §8.2.
 */
import { openAuthSessionAsync } from "expo-web-browser";

import { runKycVerification } from "../verify";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
const mockOpen = openAuthSessionAsync as jest.MockedFunction<typeof openAuthSessionAsync>;

const CREDS = { sessionToken: "tok_live", verificationUrl: "https://verify.didit.me/sess_1" };

beforeEach(() => jest.clearAllMocks());

describe("runKycVerification — browser fallback while the native SDK is reverted", () => {
  it("opens the https verification URL in the in-app browser", async () => {
    mockOpen.mockResolvedValue({ type: "cancel" } as never);
    await runKycVerification(CREDS);
    expect(mockOpen).toHaveBeenCalledWith("https://verify.didit.me/sess_1");
  });

  it("maps the redirect back (success) to completed — the wall becomes in_flight", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "lynia://kyc" } as never);
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "completed", sessionUnusable: false });
  });

  it.each(["cancel", "dismiss"] as const)(
    "maps the rider closing the tab (%s) to cancelled — unfinished, not broken",
    async (type) => {
      mockOpen.mockResolvedValue({ type } as never);
      await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "cancelled", sessionUnusable: false });
    },
  );

  it("resolves failed (cant_start) instead of throwing when the browser cannot open", async () => {
    mockOpen.mockRejectedValue(new Error("no WebView on this device"));
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
  });

  it.each([undefined, null, "", "http://verify.didit.me/sess_1", "intent://evil"] as const)(
    "refuses to open a missing or non-https URL (%p) and resolves failed without launching",
    async (verificationUrl) => {
      await expect(runKycVerification({ sessionToken: "tok_live", verificationUrl })).resolves.toEqual({
        outcome: "failed",
        sessionUnusable: false,
      });
      expect(mockOpen).not.toHaveBeenCalled();
    },
  );

  it("a token alone cannot launch on this build — the native SDK that would consume it is reverted", async () => {
    await expect(runKycVerification({ sessionToken: "tok_live" })).resolves.toEqual({
      outcome: "failed",
      sessionUnusable: false,
    });
  });

  it("never marks the session unusable — retrying must stay on the free resume path", async () => {
    mockOpen.mockRejectedValue(new Error("boom"));
    const failed = await runKycVerification(CREDS);
    expect(failed.sessionUnusable).toBe(false);
    mockOpen.mockResolvedValue({ type: "dismiss" } as never);
    const dismissed = await runKycVerification(CREDS);
    expect(dismissed.sessionUnusable).toBe(false);
  });
});
