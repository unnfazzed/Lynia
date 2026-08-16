/**
 * D-22 — the customer and rider Account tabs stay separate, in BOTH directions.
 *
 * Owner instruction (2026-08-16): *"let's have a clear separation of what shows up under account for
 * a rider and customer."* The bleed being fixed only appeared for a DUAL-ROLE user — an account whose
 * `role` is "rider" browsing the customer side — which is exactly the case a hand-check skips, because
 * a plain customer's tab looked correct all along. That is what this suite exists to hold.
 *
 * It asserts absence, deliberately. Every other account test asserts what a screen draws; the failure
 * mode here is a row REAPPEARING — the account cluster has drifted back twice by someone adding a
 * convenient shortcut to the nearest screen. A test that only checked the intended rows would pass
 * through that.
 *
 * The two tabs are mirror images: each side's own destinations, then Help & support · Settings · one
 * bridge row to the other side. The bridge row is the ONLY place either side names the other.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Me } from "../../../src/api/auth";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "rider" }, signOut: jest.fn() }),
}));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
jest.mock("../../../src/api/orders", () => ({ getActiveOrder: async () => null }));
jest.mock("../../../src/api/riders", () => ({ setOnline: async () => ({ online: false }) }));

import CustomerAccountTab from "../account";
import RiderAccountTab from "../../rider/(tabs)/account";

/** A DUAL-ROLE account: role "rider", so every `isRider` branch in the app is live. */
const dualRoleMe: Me = {
  profileId: "p1",
  role: "rider",
  firstName: "Shepherd",
  lastName: "Mahupa",
  phone: "+263778831938",
  email: null,
  photoUrl: null,
  ordersCount: 4,
  idNumber: "63-123456-A-42",
  rider: {
    bikeReg: "BDR123",
    kycStatus: "pending",
    ratingAvg: 0,
    ratingCount: 0,
    tripsCount: 0,
    isOnline: false,
    kycMode: "auto",
  },
};

async function copyOf(Screen: React.ComponentType): Promise<string> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <Screen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const all = tree.root
    .findAll((n) => typeof n.props.children === "string")
    .map((n) => n.props.children as string)
    .join("\n");
  act(() => tree.unmount());
  return all;
}

beforeEach(() => {
  mockGetMe.mockResolvedValue(dualRoleMe);
  mockPush.mockClear();
});

describe("the customer Account tab carries no rider state (D-22)", () => {
  // Each of these was on the customer tab before D-22, for exactly this account shape.
  it.each([
    ["Bike & documents", "rider paperwork — it is on the rider tab and /profile?side=rider"],
    ["Job history", "the rider's list; the customer's is the Orders tab"],
    ["Money", "the rider wallet — a customer pays cash"],
    ["Verification pending", "KYC is rider state; the pill slot stays empty here"],
    ["Rider dashboard", "superseded by the 'Switch to rider' bridge row"],
  ])("does not draw %s (%s)", async (copy) => {
    expect(await copyOf(CustomerAccountTab)).not.toContain(copy);
  });

  it("draws its own four rows and nothing else navigational", async () => {
    const all = await copyOf(CustomerAccountTab);
    for (const row of ["Notifications", "Help & support", "Settings", "Switch to rider"]) {
      expect(all).toContain(row);
    }
    // Removed as duplicates of the Orders tab and of Home — not as features.
    expect(all).not.toContain("Trip history");
    expect(all).not.toContain("Send a parcel");
  });
});

describe("the rider Account tab carries no customer-side entries (D-22)", () => {
  it.each([
    ["Send a parcel", "a customer booking action; the bridge row is the way across"],
    ["Trip history", "the customer's label — the rider's row is 'Job history'"],
    ["Become a rider", "they already are one"],
  ])("does not draw %s (%s)", async (copy) => {
    expect(await copyOf(RiderAccountTab)).not.toContain(copy);
  });

  it("keeps the mock's five rows plus the two sanctioned additions", async () => {
    const all = await copyOf(RiderAccountTab);
    for (const row of ["Bike & documents", "Job history", "Money", "Notifications", "Help & support", "Settings", "Switch to customer"]) {
      expect(all).toContain(row);
    }
  });
});

describe("the two tabs are mirror images", () => {
  it("share the Help & support · Settings tail, each with one bridge row to the other side", async () => {
    const customer = await copyOf(CustomerAccountTab);
    const rider = await copyOf(RiderAccountTab);

    for (const shared of ["Notifications", "One inbox for both services", "Help & support", "Call the safety line", "Settings", "Permissions, privacy and sign out"]) {
      expect(customer).toContain(shared);
      expect(rider).toContain(shared);
    }
    // Exactly one crossing per side, and it points the other way.
    expect(customer).toContain("Switch to rider");
    expect(customer).not.toContain("Switch to customer");
    expect(rider).toContain("Switch to customer");
    expect(rider).not.toContain("Switch to rider");
  });
});
