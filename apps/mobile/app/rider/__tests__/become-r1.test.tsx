import React from "react";
/**
 * Become a rider — Calm Mint v2 R1 (D-55), no photo step (D-62), and no national ID before the check
 * (owner 2026-10-03, D-75): "Start ID check" opens the check straight away; only a legacy account
 * without a name sees C5's name step first; and however the check ends, the rider lands on the board.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { resolveKycGate, type KycGateRider, type KycSdkResult } from "../../../src/logic/gates";
import { kycScreenFor } from "../../../src/logic/kyc-outcome";
import { resolveGate } from "../../../src/logic/rider-gate";

const mockReplace = jest.fn();
let mockSecureStore: Record<string, string> = {};

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
/**
 * First Run v2 (D-81): Become always REPLACES itself with the board — G1 removed the board's interstitial that
 * pushed it, and owner #5 removed the permission priming before the board (the flow follows R3 now).
 */
const BOARD = "/rider";
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockSecureStore[key] ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore[key] = value;
  },
  deleteItemAsync: async (key: string) => {
    delete mockSecureStore[key];
  },
}));
const mockBecomeRider = jest.fn();
const mockCompleteProfile = jest.fn();
const mockNoteLaunched = jest.fn(async () => undefined);
jest.mock("../../../src/api/riders", () => ({
  becomeRider: (...a: unknown[]) => mockBecomeRider(...a),
  completeProfile: (...a: unknown[]) => mockCompleteProfile(...a),
  noteKycLaunched: () => mockNoteLaunched(),
}));
const mockRunKyc = jest.fn();
jest.mock("../../../src/kyc/verify", () => ({ runKycVerification: (...a: unknown[]) => mockRunKyc(...a) }));
// A marker in place of the sheet host, so a test can see where it is mounted.
jest.mock("../../../src/kyc/KycCheckHost", () => ({ KycCheckHost: () => require("react").createElement("KycCheckHostMarker") }));
let mockMe: Record<string, unknown> = {};
const mockUpdateProfile = jest.fn();
jest.mock("../../../src/api/auth", () => ({
  getMe: jest.fn(async () => mockMe),
  updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
}));
// D-70: `/wallet/config` serves `freeFirstJobs` on a server with the free-jobs rule; null = older server.
let mockWalletConfig: Record<string, unknown> | null = null;
jest.mock("../../../src/api/wallet", () => ({
  getWalletConfig: jest.fn(async () => {
    if (!mockWalletConfig) throw new Error("offline");
    return mockWalletConfig;
  }),
}));

import { ApiError } from "../../../src/api/client";
import { takeKycLaunch } from "../../../src/kyc/launch-hint";
import { KYC_DRAFT_KEY } from "../../../src/logic/kyc-draft";
import { RiderIntro } from "../../../src/ui/onboarding/rider";
import BecomeRiderScreen from "../become";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
let qc: QueryClient;
function becomeEl(): React.ReactElement {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <BecomeRiderScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
/** Real macrotask ticks, so the `getMe` query has resolved even under a loaded full-suite run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
async function mount(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(becomeEl());
  });
  await flush();
  return tree;
}
function startButton(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((n) => n.props.accessibilityLabel === "Start ID check" && typeof n.props.onPress === "function")[0]!;
}
async function tapStart(tree: renderer.ReactTestRenderer): Promise<void> {
  const start = startButton(tree);
  await act(async () => {
    start.props.onPress();
  });
  await flush();
}
async function type(tree: renderer.ReactTestRenderer, label: string, value: string): Promise<void> {
  const input = tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === "function")[0]!;
  await act(async () => {
    input.props.onChangeText(value);
  });
}
const text = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());

/** Every string the retired "Rider setup" outcome page and "A few details first" step could show. */
const RETIRED = [
  "A few details first",
  "We need these on your account before your ID check.",
  "Your national ID number",
  "The 8–12 digits on your national ID card.",
  "We verify your national ID",
  "Verification submitted",
  "You didn't finish verifying. Pick it up again from your rider board.",
  "We couldn't open the ID check. Try again from your rider board.",
];

const NAMED = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", phone: "+263772451180", rider: null };

beforeEach(() => {
  mockSecureStore = {};
  mockWalletConfig = null;
  mockReplace.mockClear();
  mockBack.mockClear();
  mockNoteLaunched.mockClear();
  mockParams = {};
  takeKycLaunch();
  mockBecomeRider.mockReset().mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "tok", verificationUrl: "https://verify.didit.me/s" });
  mockCompleteProfile.mockReset().mockResolvedValue({});
  mockUpdateProfile.mockReset().mockImplementation(async (body: Record<string, unknown>) => ({ ...mockMe, ...body }));
  mockRunKyc.mockReset().mockResolvedValue({ outcome: "completed", sessionUnusable: false });
});

describe("BecomeRiderScreen — R1, no photo step (D-55, D-62)", () => {
  it("R1's checklist has no photo row and says the photo can wait", async () => {
    mockMe = { ...NAMED, idNumber: "63123456A42" };
    const tree = await mount();
    const r1 = text(tree);
    for (const s of ["Ride with LyniaGo.", "Your account", "ID check", "Your photo and bike papers can wait.", "Start ID check"]) expect(r1).toContain(s);
    expect(r1).not.toContain("Rider photo for your profile");
    // The vendor is never named (D-38), and an older server without the free-jobs rule gets no promise.
    expect(r1).not.toContain("Didit");
    expect(r1).not.toContain("commission-free");
    act(() => tree.unmount());
  });

  it("D-70: on a server with the free-jobs rule, R1's note reads in full", async () => {
    mockWalletConfig = { ratePct: 10, floor: 2, graceCredit: 5, minTopUp: 5, maxTopUp: 50, freeFirstJobs: 5 };
    mockMe = { ...NAMED, idNumber: "63123456A42" };
    const tree = await mount();
    expect(text(tree)).toContain("No top-up to start. Your first jobs are commission-free. Your photo and bike papers can wait.");
    act(() => tree.unmount());
  });

  it("mounts the ID-check sheet host on R1 itself, so a check opened from R1 gets the in-app sheet", async () => {
    mockMe = { ...NAMED, idNumber: null };
    const tree = await mount();
    expect(tree.root.findAllByType("KycCheckHostMarker" as never)).toHaveLength(1);
    act(() => tree.unmount());
  });
});

describe("BecomeRiderScreen — no national ID before the check (D-75)", () => {
  it("with NO national ID on file, Start ID check opens the check straight away — no ID step", async () => {
    mockMe = { ...NAMED, idNumber: null, kycIdNumber: null };
    const tree = await mount();
    await tapStart(tree);
    expect(mockBecomeRider).toHaveBeenCalledWith({});
    expect(mockRunKyc).toHaveBeenCalledWith({ sessionToken: "tok", verificationUrl: "https://verify.didit.me/s" });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockCompleteProfile).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(BOARD);
    for (const gone of RETIRED) expect(text(tree)).not.toContain(gone);
    act(() => tree.unmount());
  });

  it("a verified ID-check number on file (D-70) no longer prefills anything — there is no ID field to fill", async () => {
    mockMe = { ...NAMED, idNumber: null, kycIdNumber: "63123456A42" };
    const tree = await mount();
    expect(tree.root.findAll((n) => typeof n.props.onChangeText === "function")).toHaveLength(0);
    await tapStart(tree);
    expect(mockBecomeRider).toHaveBeenCalledWith({});
    expect(text(tree)).not.toContain("63123456A42");
    act(() => tree.unmount());
  });

  it("with name and ID on file, Start ID check submits straight away — nothing else is sent", async () => {
    mockMe = { ...NAMED, idNumber: "63123456A42" };
    const tree = await mount();
    await tapStart(tree);
    expect(mockBecomeRider).toHaveBeenCalledWith({});
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockCompleteProfile).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(BOARD);
    act(() => tree.unmount());
  });

  it("a double tap opens ONE paid session (CF-02-SIB-3)", async () => {
    mockMe = { ...NAMED, idNumber: null };
    let release!: () => void;
    mockBecomeRider.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ kycStatus: "pending", mode: "auto", sessionToken: "tok" });
        }),
    );
    const tree = await mount();
    const start = startButton(tree);
    await act(async () => {
      start.props.onPress();
      start.props.onPress();
    });
    await flush();
    expect(mockBecomeRider).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await flush();
    act(() => tree.unmount());
  });

  it("a failed start stays on R1 (the toast speaks) — no navigation", async () => {
    mockMe = { ...NAMED, idNumber: null };
    mockBecomeRider.mockRejectedValue(new ApiError(503, "Couldn't start ID verification. Please try again."));
    const tree = await mount();
    await tapStart(tree);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRunKyc).not.toHaveBeenCalled();
    expect(text(tree)).toContain("Ride with LyniaGo.");
    act(() => tree.unmount());
  });

  it("BH-04: a lost-response retry (already_rider) goes to the board", async () => {
    mockMe = { ...NAMED, idNumber: null };
    mockBecomeRider.mockRejectedValue(new ApiError(409, "Already registered as a rider", "already_rider"));
    const tree = await mount();
    await tapStart(tree);
    expect(mockReplace).toHaveBeenCalledWith(BOARD);
    act(() => tree.unmount());
  });
});

describe("BecomeRiderScreen — the name step (legacy accounts without a name), in C5's grammar", () => {
  const NAMELESS = { profileId: "p1", role: "customer", firstName: "", lastName: "", phone: "+263772451180", idNumber: null, rider: null };

  it("asks only for the name — C5's title, the two fields, the verified phone — and no ID", async () => {
    mockMe = { ...NAMELESS };
    const tree = await mount();
    await tapStart(tree);
    const step = text(tree);
    for (const s of ["What should riders call you?", "Your name shows on your rider’s screen and your receipts.", "First name", "Surname", "+263 77 245 1180", "Verified", "Start ID check"]) {
      expect(step).toContain(s);
    }
    // C5's "No ID needed" note would be false here — the ID check is the next step.
    expect(step).not.toContain("No ID needed");
    expect(step).not.toContain("Start using LyniaGo");
    for (const gone of RETIRED) expect(step).not.toContain(gone);
    // Exactly the two name fields, nothing else to type.
    expect(tree.root.findAll((n) => (n.type as unknown) === "TextInput").map((n) => n.props.accessibilityLabel)).toEqual(["First name", "Surname"]);
    expect(mockBecomeRider).not.toHaveBeenCalled();
    expect(tree.root.findAllByType("KycCheckHostMarker" as never)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it("Start ID check stays off until both names are in, then saves the NAME ONLY and opens the check", async () => {
    mockMe = { ...NAMELESS };
    const tree = await mount();
    await tapStart(tree);
    expect(startButton(tree).props.disabled).toBe(true);
    await type(tree, "First name", "  Chipo ");
    expect(startButton(tree).props.disabled).toBe(true);
    await type(tree, "Surname", "Marufu");
    expect(startButton(tree).props.disabled).toBe(false);
    await tapStart(tree);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ firstName: "Chipo", lastName: "Marufu" });
    expect(mockCompleteProfile).not.toHaveBeenCalled();
    expect(mockBecomeRider).toHaveBeenCalledWith({});
    expect(mockUpdateProfile.mock.invocationCallOrder[0]).toBeLessThan(mockBecomeRider.mock.invocationCallOrder[0]!);
    expect(mockRunKyc).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(BOARD);
    // Registered: the name draft is cleared.
    expect(mockSecureStore[KYC_DRAFT_KEY]).toBeUndefined();
    act(() => tree.unmount());
  });

  it("an app kill keeps the half-typed name: the draft restores straight onto the name step", async () => {
    mockMe = { ...NAMELESS };
    mockSecureStore[KYC_DRAFT_KEY] = JSON.stringify({ firstName: "Chipo", lastName: "" });
    const tree = await mount();
    const step = text(tree);
    expect(step).toContain("What should riders call you?");
    expect(step).toContain("We saved what you’d filled in — pick up where you left off.");
    const first = tree.root.findAll((n) => n.props.accessibilityLabel === "First name" && typeof n.props.onChangeText === "function")[0]!;
    expect(first.props.value).toBe("Chipo");
    act(() => tree.unmount());
  });

  it("an older draft's national ID never outlives the first visit", async () => {
    // Name + ID → rewritten name-only.
    mockMe = { ...NAMELESS };
    mockSecureStore[KYC_DRAFT_KEY] = JSON.stringify({ firstName: "Chipo", lastName: "Marufu", idNumber: "63123456A42", bikeReg: "ABC123" });
    let tree = await mount();
    expect(mockSecureStore[KYC_DRAFT_KEY]).toBeDefined();
    expect(mockSecureStore[KYC_DRAFT_KEY]).not.toContain("63123456A42");
    expect(JSON.parse(mockSecureStore[KYC_DRAFT_KEY]!)).toEqual({ firstName: "Chipo", lastName: "Marufu" });
    act(() => tree.unmount());
    // ID only → cleared outright.
    mockSecureStore = { [KYC_DRAFT_KEY]: JSON.stringify({ firstName: "", lastName: "", idNumber: "63123456A42", bikeReg: "" }) };
    mockMe = { ...NAMED, idNumber: null };
    tree = await mount();
    expect(mockSecureStore[KYC_DRAFT_KEY]).toBeUndefined();
    // …and an account that HAS a name never sees the name step for it.
    expect(text(tree)).toContain("Ride with LyniaGo.");
    act(() => tree.unmount());
  });
});

describe("BecomeRiderScreen — after the check, the board (D-75: the old outcome page is gone)", () => {
  const cases: { name: string; res: Record<string, unknown>; outcome: KycSdkResult | "none" }[] = [
    { name: "the check went through", res: { kycStatus: "pending", mode: "auto", sessionToken: "tok", verificationUrl: "https://verify.didit.me/s" }, outcome: "completed" },
    { name: "the rider closed the check", res: { kycStatus: "pending", mode: "auto", sessionToken: "tok", verificationUrl: "https://verify.didit.me/s" }, outcome: "cancelled" },
    { name: "the check couldn't open", res: { kycStatus: "pending", mode: "auto", sessionToken: "tok", verificationUrl: "https://verify.didit.me/s" }, outcome: "failed" },
    { name: "the vendor returned no session", res: { kycStatus: "pending", mode: "auto" }, outcome: "none" },
    { name: "manual review", res: { kycStatus: "pending", mode: "manual" }, outcome: "none" },
    { name: "the QA stub's instant pass", res: { kycStatus: "verified", mode: "auto" }, outcome: "none" },
  ];
  for (const c of cases) {
    it(`${c.name} → /rider, and no outcome page`, async () => {
      mockMe = { ...NAMED, idNumber: null };
      mockBecomeRider.mockResolvedValue(c.res);
      if (c.outcome !== "none") mockRunKyc.mockResolvedValue({ outcome: c.outcome, sessionUnusable: false });
      const tree = await mount();
      await tapStart(tree);
      expect(mockRunKyc).toHaveBeenCalledTimes(c.outcome === "none" ? 0 : 1);
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(BOARD);
      const after = text(tree);
      for (const gone of RETIRED) expect(after).not.toContain(gone);
      expect(after).not.toContain("Rider setup");
      act(() => tree.unmount());
    });
  }

  it("refreshes `me` once registered, so the board reads the rider record, not the cached customer", async () => {
    mockMe = { ...NAMED, idNumber: null };
    const tree = await mount();
    const spy = jest.spyOn(qc, "invalidateQueries");
    await tapStart(tree);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["me"] });
    act(() => tree.unmount());
  });

  // What the board then draws, from the same resolvers it runs (app/rider/(tabs)/index.tsx: `resolveKycGate`,
  // `resolveGate`, then `kycScreenFor`). The server state is the one each outcome leaves; the launch result
  // is the one Become hands over (`recordKycLaunch`), fresh for 30 s.
  it("lands each outcome on its First Run v2 page (F8 / F3 / F7 / F1) or Calm Mint v2 R2", () => {
    const screenFor = (rider: KycGateRider, launch: KycSdkResult = null) => {
      const kyc = resolveKycGate(rider, launch);
      return kycScreenFor({ gate: resolveGate({ kyc, server: null, locDenied: false }), kyc, launch, declineReason: rider.kycDeclineReason });
    };
    const pending = { kycStatus: "pending" as const, kycMode: "auto" as const, kycAttempts: 0 };
    // Went through: F8 "Sending your ID" while the hand-over is fresh, then R2 "Rider setup" while the vendor holds it.
    expect(screenFor({ ...pending, kycPendingState: "unfinished" }, "completed")).toEqual({ kind: "outcome", id: "F8" });
    expect(screenFor({ ...pending, kycPendingState: "in_flight" })).toEqual({ kind: "r2" });
    // Closed it, or no session came back: the vendor reads it unfinished → F3 "Almost there", which resumes it.
    expect(screenFor({ ...pending, kycPendingState: "unfinished" }, "cancelled")).toEqual({ kind: "outcome", id: "F3" });
    expect(screenFor({ ...pending, kycPendingState: null })).toEqual({ kind: "outcome", id: "F3" });
    // It never opened: F7 "Couldn't open the ID check", with WhatsApp help.
    expect(screenFor({ ...pending, kycPendingState: "unfinished" }, "failed")).toEqual({ kind: "outcome", id: "F7" });
    // Manual review → F1 "Our team is taking a look".
    expect(screenFor({ kycStatus: "pending", kycMode: "manual", kycAttempts: 0 })).toEqual({ kind: "outcome", id: "F1" });
  });
});

/**
 * Startup review 2026-10-06 + First Run v2 (D-81) — how Become hands over to the board.
 *
 * G1: the board no longer pushes Become over itself (its "Earn with your bike" interstitial is gone; a
 *     non-rider reaching /rider is REPLACED by Become), so Become always replaces itself with ONE board.
 * Owner #5: no permission priming before the board — the rider permission flow follows R3.
 * R-4 / R-10: the launch's outcome reaches the board (completed is F8; failed is F7, with support).
 * R-5: the rider side is saved for the next cold start.
 */
describe("BecomeRiderScreen — the hand-over to the board (startup review 2026-10-06, D-81)", () => {
  it("G1: the hand-over replaces Become with the board — once, never back(), never through /permissions", async () => {
    mockMe = { ...NAMED, idNumber: null };
    const tree = await mount();
    await tapStart(tree);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/rider");
    expect(mockReplace).not.toHaveBeenCalledWith("/permissions?next=/rider");
    expect(mockBack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("G1: the already_rider path replaces itself with the board too", async () => {
    mockMe = { ...NAMED, idNumber: null };
    mockBecomeRider.mockRejectedValue(new ApiError(409, "You're already a rider", "already_rider"));
    const tree = await mount();
    await tapStart(tree);
    expect(mockReplace).toHaveBeenCalledWith("/rider");
    expect(mockBack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("R-5: the hand-over saves the rider side for the next cold start, after re-reading `me`", async () => {
    mockMe = { ...NAMED, idNumber: null };
    const tree = await mount();
    const refetch = jest.spyOn(qc, "refetchQueries");
    await tapStart(tree);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(mockSecureStore["lynia.rolePreference"]).toBe("rider");
    act(() => tree.unmount());
  });

  it("R-4: a completed check is handed to the board (and the server told to re-read the vendor)", async () => {
    mockMe = { ...NAMED, idNumber: null };
    mockRunKyc.mockResolvedValue({ outcome: "completed", sessionUnusable: false });
    const tree = await mount();
    await tapStart(tree);
    expect(takeKycLaunch()).toMatchObject({ outcome: "completed" });
    expect(mockNoteLaunched).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("R-10: a launch that never opened is handed to the board as `failed` (the can't-open wall, with support)", async () => {
    mockMe = { ...NAMED, idNumber: null };
    mockRunKyc.mockResolvedValue({ outcome: "failed", sessionUnusable: false });
    const tree = await mount();
    await tapStart(tree);
    const mark = takeKycLaunch();
    expect(mark).toMatchObject({ outcome: "failed" });
    expect(mockNoteLaunched).not.toHaveBeenCalled();
    // …which the board resolves to G7, not "Finish verifying".
    const pending = { kycStatus: "pending" as const, kycMode: "auto" as const, kycAttempts: 0, kycPendingState: "unfinished" as const };
    expect(resolveGate({ kyc: resolveKycGate(pending, mark!.outcome), server: null, locDenied: false })).toBe("cantOpen");
    act(() => tree.unmount());
  });

  it("R-10: 'Start ID check' shows busy while it is still reading the account", async () => {
    mockMe = { ...NAMED, idNumber: null };
    const { getMe } = jest.requireMock("../../../src/api/auth") as { getMe: jest.Mock };
    getMe.mockImplementation(() => new Promise(() => undefined));
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    expect(tree.root.findByType(RiderIntro).props.busy).toBe(false);
    await act(async () => {
      startButton(tree).props.onPress();
    });
    expect(tree.root.findByType(RiderIntro).props.busy).toBe(true);
    expect(mockBecomeRider).not.toHaveBeenCalled();
    getMe.mockImplementation(async () => mockMe);
    act(() => tree.unmount());
  });
});
