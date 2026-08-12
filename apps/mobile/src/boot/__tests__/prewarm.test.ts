/**
 * Cold-boot prewarm (src/boot/prewarm.ts). Two invariants carry the whole change:
 *
 *  1. ONE read per launch. Every consumer (AuthProvider, app/index.tsx) must join the SAME in-flight
 *     promise the root layout started at module scope. If prewarm re-read on each call it would be
 *     strictly worse than the code it replaced — three consumers, three AndroidKeyStore decryptions —
 *     and for `consumeColdStartResponse` it would be a correctness bug, since the native response is
 *     consumed-and-cleared and a second reader could race the clear.
 *
 *  2. IT CANNOT REJECT. These promises are created at module evaluation, before any React error
 *     boundary exists, and are awaited by the code that decides which screen to show. A rejection that
 *     escaped would be an unrecoverable white screen at launch — the failure class MOB-BOOT-01 already
 *     cost this app once. Every read degrades to its documented "nothing stored" value instead.
 */
const mockLoadSession = jest.fn();
const mockLoadOnboardingSeen = jest.fn();
const mockLoadRolePreference = jest.fn();
jest.mock("../../auth/session", () => ({
  loadSession: () => mockLoadSession(),
  loadOnboardingSeen: () => mockLoadOnboardingSeen(),
  loadRolePreference: () => mockLoadRolePreference(),
}));

const mockConsumeColdStart = jest.fn();
jest.mock("../../push/push", () => ({
  consumeColdStartResponse: () => mockConsumeColdStart(),
}));

import { __resetBootReads, prewarmBootReads } from "../prewarm";

function happyPath(): void {
  mockLoadSession.mockResolvedValue({ profileId: "p1" });
  mockLoadOnboardingSeen.mockResolvedValue(true);
  mockLoadRolePreference.mockResolvedValue("rider");
  mockConsumeColdStart.mockResolvedValue({ notification: { request: { content: { data: { orderId: "o1" } } } } });
}

describe("prewarmBootReads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetBootReads();
  });

  it("reads each source exactly once no matter how many consumers ask", async () => {
    happyPath();
    const first = prewarmBootReads();
    const second = prewarmBootReads();
    const third = prewarmBootReads();
    await Promise.all([first.session, second.onboardingSeen, third.rolePref, third.coldStartData]);

    expect(mockLoadSession).toHaveBeenCalledTimes(1);
    expect(mockLoadOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockLoadRolePreference).toHaveBeenCalledTimes(1);
    expect(mockConsumeColdStart).toHaveBeenCalledTimes(1);
    // Same promise objects, not merely equal values — proves the consumers share one read.
    expect(second.session).toBe(first.session);
    expect(third.coldStartData).toBe(first.coldStartData);
  });

  it("starts the reads immediately, before any consumer awaits them", () => {
    happyPath();
    prewarmBootReads();
    // Nothing has been awaited at this point — the native work must already be in flight, which is
    // the entire point of prewarming rather than reading from a mount effect.
    expect(mockLoadSession).toHaveBeenCalledTimes(1);
    expect(mockConsumeColdStart).toHaveBeenCalledTimes(1);
  });

  it("unwraps the cold-start notification to its data payload, and to null when there was no tap", async () => {
    happyPath();
    await expect(prewarmBootReads().coldStartData).resolves.toEqual({ orderId: "o1" });

    __resetBootReads();
    jest.clearAllMocks();
    happyPath();
    mockConsumeColdStart.mockResolvedValue(null);
    await expect(prewarmBootReads().coldStartData).resolves.toBeNull();
  });

  it("degrades every rejecting read to its safe default instead of rejecting", async () => {
    mockLoadSession.mockRejectedValue(new Error("keystore cannot decrypt"));
    mockLoadOnboardingSeen.mockRejectedValue(new Error("keystore cannot decrypt"));
    mockLoadRolePreference.mockRejectedValue(new Error("keystore cannot decrypt"));
    mockConsumeColdStart.mockRejectedValue(new Error("native module unavailable"));

    const reads = prewarmBootReads();
    // No session ⇒ the user re-authenticates (recoverable). Onboarding false ⇒ the carousel shows
    // once more (harmless). No role ⇒ the customer fork. No deep link ⇒ the ordinary destination.
    await expect(reads.session).resolves.toBeNull();
    await expect(reads.onboardingSeen).resolves.toBe(false);
    await expect(reads.rolePref).resolves.toBeNull();
    await expect(reads.coldStartData).resolves.toBeNull();
  });

  it("holds the memo across a rejection too — a broken keystore must not be retried three times", async () => {
    mockLoadSession.mockRejectedValue(new Error("keystore cannot decrypt"));
    mockLoadOnboardingSeen.mockResolvedValue(false);
    mockLoadRolePreference.mockResolvedValue(null);
    mockConsumeColdStart.mockResolvedValue(null);

    await prewarmBootReads().session;
    await prewarmBootReads().session;
    expect(mockLoadSession).toHaveBeenCalledTimes(1);
  });
});
