import React from "react";
/**
 * Become a rider — Calm Mint v2 R1 (D-55), with the photo step removed (owner 2026-10-02, D-62): the
 * photo is optional and added later from Bike & documents, so "Start ID check" opens the check directly
 * unless the account is missing its name or national ID.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockReplace = jest.fn();
let mockSecureStore: Record<string, string> = {};

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => true }) }));
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
jest.mock("../../../src/api/riders", () => ({
  becomeRider: (...a: unknown[]) => mockBecomeRider(...a),
  completeProfile: (...a: unknown[]) => mockCompleteProfile(...a),
}));
jest.mock("../../../src/kyc/verify", () => ({ runKycVerification: jest.fn().mockResolvedValue({ outcome: "completed" }) }));
jest.mock("../../../src/kyc/KycCheckHost", () => ({ KycCheckHost: () => null }));
let mockMe: Record<string, unknown> = {};
jest.mock("../../../src/api/auth", () => ({ getMe: jest.fn(async () => mockMe) }));
// D-70: `/wallet/config` serves `freeFirstJobs` on a server with the free-jobs rule; null = older server.
let mockWalletConfig: Record<string, unknown> | null = null;
jest.mock("../../../src/api/wallet", () => ({
  getWalletConfig: jest.fn(async () => {
    if (!mockWalletConfig) throw new Error("offline");
    return mockWalletConfig;
  }),
}));

import BecomeRiderScreen from "../become";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
function becomeEl(): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
async function tapStart(tree: renderer.ReactTestRenderer): Promise<void> {
  const start = tree.root.findAll((n) => n.props.accessibilityLabel === "Start ID check" && typeof n.props.onPress === "function")[0]!;
  await act(async () => {
    start.props.onPress();
  });
  await flush();
}

beforeEach(() => {
  mockSecureStore = {};
  mockWalletConfig = null;
  mockReplace.mockClear();
  mockBecomeRider.mockReset().mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "tok" });
  mockCompleteProfile.mockReset().mockResolvedValue({});
});

describe("BecomeRiderScreen — R1, no photo step (D-55, D-62)", () => {
  it("R1's checklist has no photo row and says the photo can wait", async () => {
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: "63123456A42", rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    const r1 = JSON.stringify(tree.toJSON());
    for (const s of ["Ride with LyniaGo.", "Your account", "ID check", "Your photo, licence and bike papers can wait.", "Start ID check"]) expect(r1).toContain(s);
    expect(r1).not.toContain("Rider photo for your profile");
    // The vendor is never named (D-38), and an older server without the free-jobs rule gets no promise.
    expect(r1).not.toContain("Didit");
    expect(r1).not.toContain("commission-free");
    act(() => tree.unmount());
  });

  it("D-70: on a server with the free-jobs rule, R1's note reads in full", async () => {
    mockWalletConfig = { ratePct: 10, floor: 2, graceCredit: 5, minTopUp: 5, maxTopUp: 50, freeFirstJobs: 5 };
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: "63123456A42", rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    const r1 = JSON.stringify(tree.toJSON());
    expect(r1).toContain("No top-up to start. Your first jobs are commission-free. Your photo, licence and bike papers can wait.");
    act(() => tree.unmount());
  });

  it("D-70 Didit ID prefill: a verified ID-check number fills the national ID field, editable", async () => {
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: null, kycIdNumber: "63123456A42", rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    await tapStart(tree);
    const field = tree.root.findAll((n) => n.props.label === "Your national ID number" && typeof n.props.onChangeText === "function")[0]!;
    expect(field.props.value).toBe("63123456A42");
    // Still editable: the rider can correct it, and what they type is what is submitted.
    await act(async () => {
      field.props.onChangeText("63999999Z99");
    });
    const after = tree.root.findAll((n) => n.props.label === "Your national ID number" && typeof n.props.onChangeText === "function")[0]!;
    expect(after.props.value).toBe("63999999Z99");
    act(() => tree.unmount());
  });

  it("D-70: with no verified ID-check number, the field starts empty", async () => {
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: null, rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    await tapStart(tree);
    const field = tree.root.findAll((n) => n.props.label === "Your national ID number" && typeof n.props.onChangeText === "function")[0]!;
    expect(field.props.value).toBe("");
    act(() => tree.unmount());
  });

  it("with name and ID on file, Start ID check submits straight away — no photo sent", async () => {
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: "63123456A42", rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    await tapStart(tree);
    expect(mockBecomeRider).toHaveBeenCalledWith({});
    expect(mockCompleteProfile).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/rider");
    act(() => tree.unmount());
  });

  it("missing the national ID: the details step asks only for it, with no photo controls", async () => {
    mockMe = { profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: null, rider: null };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await flush();
    await tapStart(tree);
    const step = JSON.stringify(tree.toJSON());
    expect(step).toContain("A few details first");
    expect(step).toContain("Your national ID number");
    expect(step).not.toContain("First name");
    for (const gone of ["Take photo", "Choose from gallery", "Rider photo"]) expect(step).not.toContain(gone);
    expect(mockBecomeRider).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
