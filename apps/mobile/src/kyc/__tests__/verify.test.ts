/**
 * The KYC launch seam (src/kyc/verify.ts) — two lanes since the in-app sheet landed:
 *
 *  1. In-app sheet (KycCheckHost): Didit's hosted flow inside LyniaGo. Preferred whenever a host is
 *     mounted, the WebView module loads, and the camera permission is settled.
 *  2. In-app browser tab (expo-web-browser): the fallback — no host, no WebView native module, or a
 *     camera denial the tab's own per-site permission UI can still recover from.
 *
 * The contract promises the callers rely on are pinned for BOTH lanes:
 *   1. It never throws — a launch attempt is how a rider taps "Finish verifying", and an exception
 *      there is the silent dead-end this module has always existed to prevent.
 *   2. It never marks the session unusable — the hosted flow renders its own expired page inside the
 *      sheet/tab, so neither web lane can observe expiry, and reporting it would burn a paid Didit
 *      credit per tap on the server's forced-mint path.
 *
 * The native-SDK result-union mapping tests travel with the SDK: restore them from git history at
 * this file (2026-08-20) if the SDK is ever re-landed per RCA §8.2.
 */
import { openAuthSessionAsync } from "expo-web-browser";

import { canPresentKycCheck, presentKycCheck } from "../KycCheckHost";
import { runKycVerification } from "../verify";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../KycCheckHost", () => ({
  canPresentKycCheck: jest.fn(() => false),
  presentKycCheck: jest.fn(() => null),
}));
jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ImagePicker = require("expo-image-picker") as {
  getCameraPermissionsAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
};
const mockOpen = openAuthSessionAsync as jest.MockedFunction<typeof openAuthSessionAsync>;
const mockCanPresent = canPresentKycCheck as jest.MockedFunction<typeof canPresentKycCheck>;
const mockPresent = presentKycCheck as jest.MockedFunction<typeof presentKycCheck>;

const CREDS = { sessionToken: "tok_live", verificationUrl: "https://verify.didit.me/sess_1" };

beforeEach(() => {
  jest.clearAllMocks();
  mockCanPresent.mockReturnValue(false);
  mockPresent.mockReturnValue(null);
  ImagePicker.getCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});

describe("runKycVerification — the in-app sheet lane", () => {
  it("prefers the sheet and maps its outcome straight through (no browser tab opens)", async () => {
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(Promise.resolve("completed"));
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "completed", sessionUnusable: false });
    expect(mockPresent).toHaveBeenCalledWith({ url: CREDS.verificationUrl });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "failed"] as const)("passes the sheet's %s outcome through unchanged", async (outcome) => {
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(Promise.resolve(outcome));
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome, sessionUnusable: false });
  });

  it("asks for the camera before opening the sheet when it isn't granted yet", async () => {
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(Promise.resolve("completed"));
    ImagePicker.getCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    await runKycVerification(CREDS);
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(mockPresent).toHaveBeenCalled();
  });

  it("falls back to the browser tab on a hard camera denial — its per-site permission UI can still recover", async () => {
    mockCanPresent.mockReturnValue(true);
    ImagePicker.getCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    mockOpen.mockResolvedValue({ type: "cancel" } as never);
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "cancelled", sessionUnusable: false });
    expect(mockPresent).not.toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledWith(CREDS.verificationUrl);
  });

  it("falls back to the browser tab when the host races away (presentKycCheck returns null)", async () => {
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(null);
    mockOpen.mockResolvedValue({ type: "success", url: "lynia://kyc" } as never);
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "completed", sessionUnusable: false });
  });

  it("falls back to the browser tab when the sheet module itself misbehaves", async () => {
    mockCanPresent.mockImplementation(() => {
      throw new Error("hostile module");
    });
    mockOpen.mockResolvedValue({ type: "dismiss" } as never);
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "cancelled", sessionUnusable: false });
  });

  it("still opens the sheet when the permission probe itself is unavailable (fail open into Didit's own UI)", async () => {
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(Promise.resolve("completed"));
    ImagePicker.getCameraPermissionsAsync.mockRejectedValue(new Error("no image-picker module"));
    await expect(runKycVerification(CREDS)).resolves.toEqual({ outcome: "completed", sessionUnusable: false });
  });
});

describe("runKycVerification — the browser fallback lane", () => {
  it("opens the https verification URL in the in-app browser when the sheet can't present", async () => {
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
      expect(mockPresent).not.toHaveBeenCalled();
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
    mockCanPresent.mockReturnValue(true);
    mockPresent.mockReturnValue(Promise.resolve("cancelled"));
    const cancelled = await runKycVerification(CREDS);
    expect(cancelled.sessionUnusable).toBe(false);
  });
});
