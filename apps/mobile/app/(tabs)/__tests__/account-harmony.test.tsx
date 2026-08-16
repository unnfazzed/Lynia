/**
 * Customer Account tab ≡ rider Account tab, structurally (docs/DESIGN-DEVIATIONS.md D-15, owner
 * instruction 2026-08-16: "the account under customer is visually different than the rider account ..
 * lets harmonise the design to match the state of the rider account").
 *
 * Two halves, because the harmonisation can regress in two different ways:
 *
 *  1. VALUES — `src/ui/account/AccountRows.tsx` mirrors the GENERATED
 *     `app/rider/(tabs)/account.view.tsx` (transpiled from `rider-one-app.jsx :: account`). The
 *     generated file must not be imported from, so the numbers are copied — and a copy silently rots.
 *     This reads BOTH sources and asserts every geometry number still agrees, so the next regeneration
 *     of the rider view that changes a size reddens here instead of quietly splitting the two screens.
 *
 *  2. STRUCTURE — the customer tab renders the rider's grammar (identity card, one card of
 *     icon/label/sub/chevron rows) and NOT the retired `LJ.profile` language (Heading + Sub + a stack
 *     of full-width Buttons + a standalone "Sign out" Button).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }),
}));
const mockGetMe = jest.fn(async () => ({
  firstName: "Chipo",
  lastName: "Marufu",
  phone: "+263772451180",
  role: "customer",
  rider: null,
}));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));

import AccountTabScreen from "../account";

const APP = resolve(__dirname, "../../..");
const riderView = readFileSync(resolve(APP, "app/rider/(tabs)/account.view.tsx"), "utf8");
const shared = readFileSync(resolve(APP, "src/ui/account/AccountRows.tsx"), "utf8");

/**
 * Every geometry pair in a file, normalized to "key:value". Covers BOTH forms the two sources use —
 * style objects (`fontSize: 15.5`) and JSX props (`size={18}`) — so a number that moves from one form
 * to the other still compares equal.
 */
function stylePairs(src: string): Set<string> {
  const out = new Set<string>();
  const value = String.raw`-?[\d.]+|"[^"]*"|tokens\.[\w.]+`;
  for (const m of src.matchAll(new RegExp(String.raw`(\w+):\s*(${value})`, "g"))) out.add(`${m[1]}:${m[2]}`);
  for (const m of src.matchAll(new RegExp(String.raw`(\w+)=\{\s*(${value})\s*\}`, "g"))) out.add(`${m[1]}:${m[2]}`);
  return out;
}

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <AccountTabScreen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return tree;
}

describe("account harmony — shared row grammar mirrors the generated rider view", () => {
  const riderPairs = stylePairs(riderView);
  const sharedPairs = stylePairs(shared);

  // The identity card: 48px accent-wash disc, 22px user icon, name 15.5/700, line 12.5 muted,
  // card padding 12, row gap 11.
  it.each([
    "width:48",
    "height:48",
    "borderRadius:24",
    "backgroundColor:tokens.color.accentWash",
    "size:22",
    "color:tokens.color.accentText",
    "fontSize:15.5",
    "fontSize:12.5",
    "padding:12",
    "gap:11",
  ])("identity card keeps the rider view's %s", (pair) => {
    expect(riderPairs.has(pair)).toBe(true);
    expect(sharedPairs.has(pair)).toBe(true);
  });

  // The row list: card padding 4 / marginTop 10, row padding 11 (v) / 10 (h), icon 18, label 13.5,
  // sub 12, chevron 16, hairline bottom border.
  it.each([
    "padding:4",
    "marginTop:10",
    "paddingTop:11",
    "paddingBottom:11",
    "paddingLeft:10",
    "paddingRight:10",
    "size:18",
    "fontSize:13.5",
    "fontSize:12",
    "size:16",
    "borderBottomWidth:1",
    "borderBottomColor:tokens.color.line",
  ])("row list keeps the rider view's %s", (pair) => {
    expect(riderPairs.has(pair)).toBe(true);
    expect(sharedPairs.has(pair)).toBe(true);
  });
});

describe("account harmony — the customer tab renders the rider grammar", () => {
  it("draws an identity card and self-describing rows, not the retired button stack", async () => {
    const tree = await render();
    const texts = tree.root.findAllByType("Text" as never).flatMap((n) => {
      const c = n.props.children;
      return typeof c === "string" ? [c] : [];
    });
    const all = texts.join("\n");

    // Identity card: name + the `phone · role` line (the customer analogue of the rider's
    // "★ 4.9 · 312 jobs · verified").
    expect(all).toContain("Chipo Marufu");
    expect(all).toContain("Customer");

    // Every navigation entry is a ROW with a sub-line — the label alone is not enough, the sub is what
    // makes the row self-explanatory before it is tapped (and what keeps it over the 44px floor).
    for (const [label, sub] of [
      ["Trip history", "Every parcel you've sent or delivered"],
      ["Send a parcel", "Book a rider to collect it"],
      ["Notifications", "One inbox for both services"],
      ["Become a rider", "Earn by delivering parcels and food"],
      ["Settings", "Permissions, privacy and sign out"],
      ["Help & support", "Call the safety line"],
    ]) {
      expect(all).toContain(label);
      expect(all).toContain(sub);
    }

    // The retired LJ.profile language is GONE — "not drawn ⇒ not rendered".
    expect(all).not.toContain("Your details and session.");
    // Sign out is on Settings and /profile (as the rider reaches it), not a button on this tab.
    expect(all).not.toContain("Sign out");
    // A customer has nothing to verify, so the rider's pill slot stays empty.
    expect(all).not.toContain("Verification pending");
  });

  it("shows the verification pill and bike row only for a rider", async () => {
    mockGetMe.mockResolvedValueOnce({
      firstName: "Shepherd",
      lastName: "Mahupa",
      phone: "+263778831938",
      role: "rider",
      rider: { bikeReg: "BDR123", ratingAvg: 0, ratingCount: 0, tripsCount: 0, kycStatus: "pending", isOnline: false },
    } as never);
    const tree = await render();
    const all = tree.root
      .findAllByType("Text" as never)
      .flatMap((n) => (typeof n.props.children === "string" ? [n.props.children] : []))
      .join("\n");

    expect(all).toContain("Verification pending");
    expect(all).toContain("Bike & documents");
    expect(all).toContain("Verify your ID and register your bike.");
    expect(all).toContain("Rider dashboard");
  });
});
