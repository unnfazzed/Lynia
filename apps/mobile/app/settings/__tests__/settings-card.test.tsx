/**
 * Settings ≡ the Account tabs, structurally (`docs/DESIGN-DEVIATIONS.md` D-25, owner instruction
 * 2026-08-16 from a handset photo: *"The settings page should have the same card design and
 * dimensions as the Account Tab. Remove the 'edit profile coming soon' statement. These must be
 * viewable. Permissions must fall under the same card and not be separate."*).
 *
 * The screen used to draw FOUR card-ish blocks plus a card-less permissions section, at a different
 * screen-edge inset from the tabs — same rows, narrower cards, and one section floating outside them.
 * Prose in a header comment does not stop that coming back; these four checks do:
 *
 *  1. ONE row card — a second `AccountRowList` on this screen is the old split reappearing.
 *  2. Every row inside it, permissions included.
 *  3. The card inset equals the Account tab's, so the two screens' cards are the same width.
 *  4. No dead taps and no "Coming soon".
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { tokens } from "@lynia/shared";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) }));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }),
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: jest.fn(async () => ({ firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer", rider: null })),
}));

import SettingsScreen from "../index";
import AccountTabScreen from "../../(tabs)/account";

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

/** Flatten an RN style prop (object, array of objects, or absent) to one plain object. */
function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style ?? {}) as Record<string, unknown>;
}

/**
 * Every `AccountRowList` card in a tree — the row-list card is the rendered (host) View carrying the
 * shared card's `borderRadius` and the row list's `padding: 4`. Host-only, or the composite `Card`
 * wrapper counts its own card twice.
 */
function rowListCards(tree: renderer.ReactTestRenderer): unknown[] {
  return tree.root.findAll((n) => {
    if (typeof n.type !== "string") return false;
    const s = flatStyle(n.props?.style);
    return s.padding === 4 && s.borderRadius != null;
  });
}

/**
 * The total inset this screen's cards sit at: the scrolling body's own edge padding (`Screen`) PLUS
 * the `Pad` wrapper inside it. Same measurement `account-harmony.test.tsx` makes on the two tabs —
 * read from the rendered tree, because that is where the split actually shows.
 */
function cardInset(tree: renderer.ReactTestRenderer): number {
  const [scroller] = tree.root.findAll((n) => flatStyle(n.props?.contentContainerStyle).padding != null);
  if (!scroller) throw new Error("no scrolling body: expected <Screen scroll> with a padded content container");
  const body = flatStyle(scroller.props.contentContainerStyle).padding as number;

  const [pad] = tree.root.findAll((n) => {
    const s = flatStyle(n.props?.style);
    return s.padding === tokens.space.screen && s.paddingTop === 0;
  });
  if (!pad) throw new Error("no `Pad` body wrapper: expected padding: space.screen with paddingTop: 0");
  return body + (flatStyle(pad.props.style).padding as number);
}

const ROWS = ["Edit profile", "Location", "Notifications", "Language", "Payment", "Privacy notice", "Sign out", "Delete account"];

describe("settings draws the Account tab's card design (D-25)", () => {
  it("puts every row — permissions included — in ONE card", async () => {
    const tree = await render(SettingsScreen);
    expect(rowListCards(tree)).toHaveLength(1);

    const labels = tree.root
      .findAll((n) => n.props?.accessibilityRole === "button" && typeof n.props?.accessibilityLabel === "string")
      .map((n) => n.props.accessibilityLabel as string);
    for (const row of ROWS) expect(labels).toContain(row);
  });

  it("insets its cards exactly as the Account tab does, so both are one width", async () => {
    const settings = await render(SettingsScreen);
    const account = await render(AccountTabScreen);
    expect(cardInset(settings)).toBe(cardInset(account));
    // Belt and braces: the D-24 value both screens are meant to be at.
    expect(cardInset(settings)).toBe(tokens.space.screen * 2);
  });

  it("has no dead taps and no 'Coming soon' — every row opens something viewable", async () => {
    const tree = await render(SettingsScreen);
    expect(JSON.stringify(tree.toJSON())).not.toContain("Coming soon");

    // The identity card is a destination too: "if u click the tab with name it must open for viewing
    // the details" (owner, 2026-08-16).
    for (const label of [...ROWS, "Your details"]) {
      // First match only: a Pressable renders through several composite layers that all carry its
      // props, so counting nodes counts layers. One node per label with a real handler is the claim.
      const row = tree.root.find((n) => n.props?.accessibilityRole === "button" && n.props?.accessibilityLabel === label);
      expect(typeof row.props.onPress).toBe("function");
    }
  });

  it("routes Language and Payment to their own detail screens", async () => {
    const tree = await render(SettingsScreen);
    for (const [label, route] of [
      ["Edit profile", "/profile"],
      ["Language", "/settings/language"],
      ["Payment", "/settings/payment"],
    ]) {
      mockPush.mockClear();
      const row = tree.root.find((n) => n.props?.accessibilityRole === "button" && n.props?.accessibilityLabel === label);
      act(() => void row.props.onPress());
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  });
});
