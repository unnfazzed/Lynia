/**
 * The KYC SDK seam. Its whole job is turning Didit's result union into the three states the app draws,
 * so the cases below are the mapping — plus the two ways it must refuse to throw.
 *
 * The native module is replaced by __mocks__/@didit-protocol/sdk-react-native.js via jest.config's
 * moduleNameMapper; each test drives it directly.
 */
import { startVerification } from "@didit-protocol/sdk-react-native";
import { runKycVerification } from "../verify";

const mockStart = startVerification as jest.MockedFunction<typeof startVerification>;

beforeEach(() => {
  mockStart.mockReset();
});

describe("runKycVerification — SDK result → app pending state", () => {
  it("maps a finished flow to completed, whatever the on-device verdict says", async () => {
    // Approved is the strongest thing the device can claim, and it still only means "the rider got to
    // the end". The server takes its verdict from the signed webhook; if this mapped Approved to
    // anything stronger, a tampered client could promote itself past KYC.
    mockStart.mockResolvedValue({ type: "completed", session: { sessionId: "s1", status: "Approved" } } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "completed", sessionUnusable: false });

    mockStart.mockResolvedValue({ type: "completed", session: { sessionId: "s1", status: "Declined" } } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "completed", sessionUnusable: false });
  });

  it("maps the rider closing it to cancelled — resumable, not broken", async () => {
    mockStart.mockResolvedValue({ type: "cancelled" } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "cancelled", sessionUnusable: false });
  });

  it("maps an SDK error to failed", async () => {
    mockStart.mockResolvedValue({ type: "failed", error: { type: "networkError", message: "no net" } } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
  });
});

describe("runKycVerification — session usability", () => {
  // The loop this prevents: expiry fires no webhook, so the server still sees a resumable session and
  // hands the same dead token back on every "Try again". Only the device can see it is dead.
  it("flags an expired session so the next attempt mints a fresh one", async () => {
    mockStart.mockResolvedValue({ type: "failed", error: { type: "sessionExpired", message: "expired" } } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "failed", sessionUnusable: true });
  });

  it.each(["cameraAccessDenied", "networkError", "apiError", "unknown"] as const)(
    "does NOT flag %s as unusable — a new session costs a credit and would not fix it",
    async (type) => {
      mockStart.mockResolvedValue({ type: "failed", error: { type, message: type } } as never);
      const result = await runKycVerification("tok");
      expect(result.outcome).toBe("failed");
      expect(result.sessionUnusable).toBe(false);
    },
  );
});

describe("runKycVerification — never throws", () => {
  it("reports failed without calling the SDK when there is no token", async () => {
    await expect(runKycVerification(null)).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
    await expect(runKycVerification(undefined)).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
    await expect(runKycVerification("")).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("swallows a throwing native module into failed", async () => {
    // What an Expo Go run or a build that shrank the SDK away actually does.
    mockStart.mockRejectedValue(new Error("TurboModule not found"));
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
  });

  it("treats an unrecognised future result type as failed, not as success", async () => {
    mockStart.mockResolvedValue({ type: "something_new" } as never);
    await expect(runKycVerification("tok")).resolves.toEqual({ outcome: "failed", sessionUnusable: false });
  });
});
