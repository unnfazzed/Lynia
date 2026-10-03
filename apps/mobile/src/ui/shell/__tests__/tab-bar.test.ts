import { APP_TABS, badgeCount, RIDER_TABS, TAB_BAR_GAP, TAB_BAR_H, TAB_BAR_SPACE, tabA11yLabel } from "../TabBar";

// app/(tabs)/_layout.tsx's tabBar navigates by `navigation.navigate(id)` with no id→route lookup
// table — it relies on each tab's `id` being exactly its `app/(tabs)/<id>.tsx` route segment name
// (home.tsx, orders.tsx, account.tsx). A mismatch here is a silent dead tab, not a crash.
describe("APP_TABS (root tab shell)", () => {
  it("has exactly Home | Orders | Account, in that order, ids matching their route file names", () => {
    expect(APP_TABS.map((t) => t.id)).toEqual(["home", "orders", "account"]);
  });
  it("draws the handoff's home / orders / account art under the unchanged labels", () => {
    expect(APP_TABS.map((t) => [t.glyph, t.label])).toEqual([
      ["home", "Home"],
      ["orders", "Orders"],
      ["account", "Account"],
    ]);
  });
});

// app/rider/(tabs)/_layout.tsx's tabBar navigates the same way — `id` must be exactly its
// `app/rider/(tabs)/<id>.tsx` route segment name. The board is `index.tsx` (not `jobs.tsx`) so the
// route stays "/rider" with zero changes to every existing "/rider" call site.
describe("RIDER_TABS (rider tab shell — plan §5 Lane B1)", () => {
  it("has exactly Jobs | Money | Account, in that order, ids matching their route file names", () => {
    expect(RIDER_TABS.map((t) => t.id)).toEqual(["index", "money", "account"]);
  });
  it("draws the jobs / money / account art under the unchanged labels", () => {
    expect(RIDER_TABS.map((t) => [t.glyph, t.label])).toEqual([
      ["jobs", "Jobs"],
      ["money", "Money"],
      ["account", "Account"],
    ]);
  });
});

// packages/design/handoff/tab-bar-v1/README.md — the numbers every screen's bottom padding hangs on.
describe("tab bar v1 layout contract", () => {
  it("is a 60 pill floating 12 off the edge, a 72 reserve", () => {
    expect([TAB_BAR_H, TAB_BAR_GAP, TAB_BAR_SPACE]).toEqual([60, 12, 72]);
  });
});

// The handoff's final screen-reader strings: `{Label}, tab, {i} of 3[, {badge}]`.
describe("tabA11yLabel", () => {
  const [home, orders] = APP_TABS as [(typeof APP_TABS)[0], (typeof APP_TABS)[0], (typeof APP_TABS)[0]];
  const [jobs, money, account] = RIDER_TABS as [(typeof RIDER_TABS)[0], (typeof RIDER_TABS)[0], (typeof RIDER_TABS)[0]];
  it.each([
    [home, 0, null, "Home, tab, 1 of 3"],
    [orders, 1, { kind: "live", n: 1 }, "Orders, tab, 2 of 3, 1 active order"],
    [orders, 1, { kind: "live", n: 3 }, "Orders, tab, 2 of 3, 3 active orders"],
    [jobs, 0, { kind: "count", n: 3 }, "Jobs, tab, 1 of 3, 3 new jobs"],
    [jobs, 0, { kind: "count", n: 1 }, "Jobs, tab, 1 of 3, 1 new job"],
    [money, 1, { kind: "warn" }, "Money, tab, 2 of 3, top-up needed"],
    [account, 2, { kind: "dot" }, "Account, tab, 3 of 3, action needed"],
  ] as const)("%s → %s", (tab, i, badge, want) => {
    expect(tabA11yLabel(tab, i, 3, badge)).toBe(want);
  });
});

describe("badgeCount", () => {
  it("caps counts above 9 at 9+", () => {
    expect([badgeCount(1), badgeCount(9), badgeCount(10), badgeCount(42)]).toEqual(["1", "9", "9+", "9+"]);
  });
});
