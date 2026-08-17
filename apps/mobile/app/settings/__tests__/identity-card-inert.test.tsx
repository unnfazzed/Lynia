/**
 * D-26 — the profile card opens nothing, and Settings has no "Edit profile" row.
 *
 * Owner instruction (2026-08-17): *"On profile.. Remove the edit profile for now.. Don't even put
 * coming soon. Also when I click the profile under accounts it must not be clickable to display
 * another window for both rider and customer sides."*
 *
 * This is a NEGATIVE suite, and it is deliberately its own file: everything it asserts is the absence
 * of something that was there yesterday and that the surrounding comments in D-15/D-22/D-25 still
 * describe as a feature ("details behind a tap on the identity card"). A later change that restores
 * the details view by reflex — a `onPress` back on the card, an "Edit profile" row back on Settings —
 * is exactly the regression this exists to redden.
 *
 * All THREE screens that draw the identity card are covered (both Account tabs and Settings), because
 * the instruction named both sides and the card is shared. The rider tab renders the GENERATED view,
 * so it is checked through the real screen rather than through the shared component: the generated
 * file has its own copy of the card, and it is the copy the rider actually sees.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) }));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }),
}));

const me = {
  firstName: "Chipo",
  lastName: "Marufu",
  phone: "+263772451180",
  role: "rider",
  rider: { bikeReg: "BDR123", ratingAvg: 4.9, ratingCount: 12, tripsCount: 312, kycStatus: "verified", isOnline: false },
};
jest.mock("../../../src/api/auth", () => ({ getMe: jest.fn(async () => me) }));
jest.mock("../../../src/api/orders", () => ({ getActiveOrder: jest.fn(async () => null) }));
jest.mock("../../../src/api/riders", () => ({ setOnline: jest.fn(async () => undefined) }));

import SettingsScreen from "../index";
import AccountTabScreen from "../../(tabs)/account";
import RiderAccountTabScreen from "../../rider/(tabs)/account";

async function render(Screen: React.ComponentType): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return tree;
}

/**
 * The identity card as rendered: the 48px accent disc's card is the only block on any of these screens
 * carrying `padding: 12`, so find that and walk UP looking for anything that would make it tappable.
 * Walking up is the point — the old shape was a Pressable WRAPPING the card, so a check that only
 * looked at the card's own props would have passed the whole time it was clickable.
 */
function identityCardIsTappable(tree: renderer.ReactTestRenderer): boolean {
  const flat = (s: unknown): Record<string, unknown> =>
    Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s ?? {}) as Record<string, unknown>);

  const cards = tree.root.findAll((n) => typeof n.type === "string" && flat(n.props?.style).padding === 12);
  expect(cards.length).toBeGreaterThan(0); // the card must still be DRAWN — only its tap is removed

  for (const card of cards) {
    for (let node: typeof card | null = card; node; node = node.parent) {
      if (typeof node.props?.onPress === "function") return true;
      if (node.props?.accessibilityRole === "button") return true;
    }
  }
  return false;
}

describe("D-26 · the profile/identity card is not clickable", () => {
  it.each([
    ["customer Account tab", AccountTabScreen],
    ["rider Account tab", RiderAccountTabScreen],
    ["Settings", SettingsScreen],
  ])("draws an inert identity card on the %s", async (_name, Screen) => {
    const tree = await render(Screen as React.ComponentType);
    expect(identityCardIsTappable(tree)).toBe(false);
  });

  it("never routes to /profile from any of the three screens", async () => {
    for (const Screen of [AccountTabScreen, RiderAccountTabScreen, SettingsScreen]) {
      mockPush.mockClear();
      const tree = await render(Screen as React.ComponentType);

      // Fire every handler the screen exposes. None of them may open the account-record window —
      // this catches a route restored on a ROW as well as one restored on the card.
      const pressables = tree.root.findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityRole === "button");
      for (const p of pressables) {
        // Sign out and the switch-to-customer confirm are handlers too; they must not throw the run.
        act(() => {
          try {
            p.props.onPress();
          } catch {
            /* a handler that needs more of the app than this harness gives it is not this test's subject */
          }
        });
      }
      for (const call of mockPush.mock.calls) expect(String(call[0])).not.toContain("/profile");
    }
  });
});

describe("D-26 · Settings has no Edit profile row, in any form", () => {
  it("draws neither the row nor a 'Coming soon' stand-in", async () => {
    const tree = await render(SettingsScreen);
    const json = JSON.stringify(tree.toJSON());

    // The string itself — a removed row that comes back as disabled text is still the row.
    expect(json).not.toContain("Edit profile");
    expect(json).not.toContain("Coming soon");

    // And not as an accessible control under any casing/wording drift.
    const labels = tree.root
      .findAll((n) => typeof n.props?.accessibilityLabel === "string")
      .map((n) => (n.props.accessibilityLabel as string).toLowerCase());
    expect(labels.some((l) => l.includes("edit profile"))).toBe(false);
  });
});
