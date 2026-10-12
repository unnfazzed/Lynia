/**
 * Regression guards for the rider "get online" fixes (2026-10-12): the welcome flag as a set, the stored
 * ID-check launch mark, the Become card honouring it, the board's poll gating, and the recent-fix rule.
 */
let mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockStore[k];
  },
}));
let mockProfileId: string | null = "p1";
jest.mock("../../api/client", () => ({
  ...jest.requireActual("../../api/client"),
  currentProfileId: () => mockProfileId,
}));

import type { Me } from "../../api/auth";
import { saveSignupAt, takeSignupAt } from "../../auth/device-state";
import {
  __resetKycLaunchHint,
  clearStoredKycLaunch,
  loadStoredKycLaunch,
  peekStoredKycLaunch,
  recordKycLaunch,
  takeKycLaunch,
} from "../../kyc/launch-hint";
import { becomeStateFor, withRiderStub } from "../become-state";
import { boardPollMs } from "../board-poll";
import { KYC_COMPLETED_HOLD_MS } from "../gates";
import { isRecentFix, LAST_KNOWN_MAX_AGE_MS } from "../last-known-fix";
import { __resetRiderWelcomeCache, markRiderWelcomeSeen, RIDER_WELCOME_KEY, riderWelcomeSeen, riderWelcomeSeenCached } from "../rider-welcome";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockStore = {};
  mockProfileId = "p1";
  __resetKycLaunchHint();
  __resetRiderWelcomeCache();
});

describe("R3 welcome flag — a set of accounts, not one slot", () => {
  it("two accounts on one phone each keep their 'seen'", async () => {
    await markRiderWelcomeSeen("a");
    await markRiderWelcomeSeen("b");
    __resetRiderWelcomeCache();
    expect(await riderWelcomeSeen("a")).toBe(true);
    expect(await riderWelcomeSeen("b")).toBe(true);
    expect(await riderWelcomeSeen("c")).toBe(false);
  });

  it("migrates the old single-id value", async () => {
    mockStore[RIDER_WELCOME_KEY] = "old-profile";
    expect(await riderWelcomeSeen("old-profile")).toBe(true);
    await markRiderWelcomeSeen("new-profile");
    expect(JSON.parse(mockStore[RIDER_WELCOME_KEY]!)).toEqual(["old-profile", "new-profile"]);
  });

  it("remembers the answer in-process, so a remount draws it on the first frame", async () => {
    expect(riderWelcomeSeenCached("a")).toBeNull();
    await riderWelcomeSeen("a");
    expect(riderWelcomeSeenCached("a")).toBe(false);
    await markRiderWelcomeSeen("a");
    expect(riderWelcomeSeenCached("a")).toBe(true);
  });
});

describe("the ID-check launch mark — stored on the phone", () => {
  it("a completed launch is handed over AND stored for the account; a restart reads it back", async () => {
    recordKycLaunch("completed", 1000);
    await flush();
    expect(takeKycLaunch()).toEqual({ outcome: "completed", at: 1000 });
    expect(JSON.parse(mockStore["lynia.kycLaunchMark"]!)).toEqual({ profileId: "p1", outcome: "completed", at: 1000 });
    __resetKycLaunchHint(); // a restart
    expect(peekStoredKycLaunch("p1")).toBeNull();
    expect(await loadStoredKycLaunch("p1")).toEqual({ outcome: "completed", at: 1000 });
    expect(peekStoredKycLaunch("p1")).toEqual({ outcome: "completed", at: 1000 });
    // Another account on the same phone never sees it.
    expect(peekStoredKycLaunch("p2")).toBeNull();
  });

  it("a later cancelled / failed launch supersedes a stored completion; clearing removes it", async () => {
    recordKycLaunch("completed", 1000);
    await flush();
    recordKycLaunch("cancelled", 2000);
    await flush();
    expect(mockStore["lynia.kycLaunchMark"]).toBeUndefined();
    recordKycLaunch("completed", 3000);
    await flush();
    clearStoredKycLaunch();
    await flush();
    expect(mockStore["lynia.kycLaunchMark"]).toBeUndefined();
  });
});

describe("the Become card honours a just-completed check", () => {
  const me = (rider: Partial<NonNullable<Me["rider"]>>): Me =>
    ({ profileId: "p1", rider: { kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished", ...rider } }) as unknown as Me;

  it("'in review' — not 'finish your check' — while the vendor still reads it unfinished", () => {
    const now = 1_000_000;
    expect(becomeStateFor(me({}), null, now)).toBe("progress");
    expect(becomeStateFor(me({}), { outcome: "completed", at: now - 60_000 }, now)).toBe("review");
    // Past the hold ceiling the server decides again.
    expect(becomeStateFor(me({}), { outcome: "completed", at: now - KYC_COMPLETED_HOLD_MS - 1 }, now)).toBe("progress");
  });
});

describe("withRiderStub — R1 hands over without waiting on /auth/me", () => {
  const customer = { profileId: "p1", firstName: "T", rider: null } as unknown as Me;
  it("builds a pending rider record from the become answer", () => {
    const stub = withRiderStub(customer, { kycStatus: "pending", mode: "auto" });
    expect(stub?.rider).toMatchObject({ kycStatus: "pending", kycMode: "auto", tripsCount: 0, kycPendingState: null });
    expect(stub?.firstName).toBe("T");
  });
  it("a completed launch is in flight", () => {
    expect(withRiderStub(customer, { kycStatus: "pending", mode: "auto" }, "completed")?.rider?.kycPendingState).toBe("in_flight");
  });
  it("nothing to build on → null (the caller re-reads first)", () => {
    expect(withRiderStub(undefined, { kycStatus: "pending", mode: "auto" })).toBeNull();
  });
});

describe("boardPollMs — the board's REST polls run only while its socket is down", () => {
  it("off while the socket is up, on while it is down or the last read failed, never offline", () => {
    expect(boardPollMs(true, true, false, 15_000)).toBe(false);
    expect(boardPollMs(true, false, false, 15_000)).toBe(15_000);
    expect(boardPollMs(true, true, true, 15_000)).toBe(15_000);
    expect(boardPollMs(false, false, true, 15_000)).toBe(false);
  });
});

describe("the sign-up stamp — sign-up → first time online", () => {
  it("is kept per account, survives a second sign-in, and is taken once", async () => {
    await saveSignupAt("p1", 1000);
    await saveSignupAt("p1", 5000); // a second "needs a profile" sign-in keeps the first stamp
    expect(await takeSignupAt("p2")).toBeNull();
    expect(await takeSignupAt("p1")).toBe(1000);
    expect(await takeSignupAt("p1")).toBeNull();
  });
});

describe("isRecentFix — a cached position good enough to go online on", () => {
  const fix = (ageMs: number, accuracy?: number) => ({ timestamp: 10_000_000 - ageMs, coords: { latitude: 1, longitude: 2, accuracy } });
  it("recent and accurate: yes; stale or vague: no", () => {
    expect(isRecentFix(fix(5_000, 30), 10_000_000)).toBe(true);
    expect(isRecentFix(fix(5_000), 10_000_000)).toBe(true);
    expect(isRecentFix(fix(LAST_KNOWN_MAX_AGE_MS + 1, 30), 10_000_000)).toBe(false);
    expect(isRecentFix(fix(5_000, 2_000), 10_000_000)).toBe(false);
    expect(isRecentFix(null, 10_000_000)).toBe(false);
  });
});
