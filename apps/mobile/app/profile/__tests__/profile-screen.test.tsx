/**
 * `/profile` — the screen behind BOTH Account tabs' identity cards (D-22, D-23).
 *
 * Two things are load-bearing here and neither is visible from the screen alone:
 *
 *  1. **The side comes from the CALLER, not the account.** `?side=` is set by whichever tab owned
 *     the tap. Keying off `me.role` — the obvious implementation, and the one this screen shipped
 *     with — is indistinguishable from correct until a DUAL-ROLE user taps their name on the
 *     customer hub: their role is "rider" forever, so they would get the rider list on the customer
 *     side, putting back exactly the bleed D-22 removed from the tab above.
 *
 *  2. **The account record is what makes this screen not just the tab again.** The full national ID
 *     and its verification tag render only here, and only when the account has one.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import renderer, { act } from "react-test-renderer";
import type { Me } from "../../../src/api/auth";

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockSignOut = jest.fn();
let mockSearchParams: { side?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "rider" }, signOut: mockSignOut }),
}));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
// STREAMLINE-01: the Notifications row's sub-line now carries an unread count, so the screen has a second
// data dependency. Stubbed at zero — this suite is about the side param and the account record, and a live
// count would only add timing noise to both.
jest.mock("../../../src/api/notifications", () => ({
  getNotificationsUnreadCount: () => Promise.resolve({ count: 0 }),
}));

import ProfileScreen from "../index";

/** A DUAL-ROLE account — role "rider", which is the case the side param exists to disambiguate. */
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
  rider: { bikeReg: "BDR123", kycStatus: "verified", ratingAvg: 4.9, ratingCount: 20, tripsCount: 312, isOnline: false, kycMode: "auto" },
};

async function copyWith(side: string | undefined, me: Me = dualRoleMe): Promise<string> {
  mockSearchParams = side ? { side } : {};
  mockGetMe.mockResolvedValue(me);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <ProfileScreen />
      </QueryClientProvider>,
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

afterEach(() => jest.clearAllMocks());

describe("/profile takes its side from the caller, not the account role", () => {
  it("shows the CUSTOMER list to a dual-role user who came from the customer tab", async () => {
    const all = await copyWith("customer");
    expect(all).toContain("Customer");
    for (const row of ["Notifications", "Help & support", "Settings", "Sign out"]) {
      expect(all).toContain(row);
    }
    // The bleed D-22 removed: role alone would have drawn all of these.
    for (const riderRow of ["Bike & documents", "Job history", "Money"]) {
      expect(all).not.toContain(riderRow);
    }
  });

  it("shows the RIDER list to the same account arriving from the rider tab", async () => {
    const all = await copyWith("rider");
    expect(all).toContain("Rider");
    for (const row of ["Bike & documents", "Job history", "Money", "Notifications", "Help & support", "Settings", "Sign out"]) {
      expect(all).toContain(row);
    }
  });

  // Deep links, a push tap and a hand-typed /profile all arrive with no side — the account's own role
  // is the only thing left to go on, and for a rider that is the rider list.
  it("falls back to the account role when no side is given", async () => {
    expect(await copyWith(undefined)).toContain("Bike & documents");
  });

  it("keeps the verification pill on the rider side only", async () => {
    expect(await copyWith("rider")).toContain("Verified rider");
    expect(await copyWith("customer")).not.toContain("Verified rider");
  });
});

describe("/profile draws the account record the tabs don't", () => {
  it("shows the national ID in full, with the verification tag", async () => {
    const all = await copyWith("rider");
    expect(all).toContain("ID 63-123456-A-42");
    expect(all).toContain("VERIFIED");
  });

  // LJ.profile's own pairing: a customer's ID is stored, never checked ("Riders go through a separate
  // ID check"), so the tag is the honest half of showing the number at all.
  it("tags an unverified account's ID NOT VERIFIED", async () => {
    const all = await copyWith("customer", { ...dualRoleMe, role: "customer", rider: null });
    expect(all).toContain("ID 63-123456-A-42");
    expect(all).toContain("NOT VERIFIED");
  });

  // A customer can register name-only; and after a cold start the field is absent by design (it is
  // held out of the persisted cache) until /auth/me revalidates. Neither may render an empty line.
  it("draws no ID line at all when the account has none", async () => {
    const all = await copyWith("customer", { ...dualRoleMe, idNumber: null });
    expect(all).not.toContain("ID ");
    expect(all).not.toContain("NOT VERIFIED");
  });

  it("shows the phone in full international form", async () => {
    expect(await copyWith("customer")).toContain("+263 77 883 1938");
  });
});
