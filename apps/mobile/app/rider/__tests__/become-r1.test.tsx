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
    // The vendor is never named (D-38), and the free-jobs promise waits on the backend.
    expect(r1).not.toContain("Didit");
    expect(r1).not.toContain("commission-free");
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
