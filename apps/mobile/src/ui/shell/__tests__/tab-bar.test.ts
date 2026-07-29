import { APP_TABS, RIDER_TABS } from "../TabBar";

// app/(tabs)/_layout.tsx's tabBar navigates by `navigation.navigate(id)` with no id→route lookup
// table — it relies on each tab's `id` being exactly its `app/(tabs)/<id>.tsx` route segment name
// (home.tsx, orders.tsx, account.tsx). A mismatch here is a silent dead tab, not a crash.
describe("APP_TABS (root tab shell)", () => {
  it("has exactly Home | Orders | Account, in that order, ids matching their route file names", () => {
    expect(APP_TABS.map((t) => t.id)).toEqual(["home", "orders", "account"]);
  });
});

// app/rider/(tabs)/_layout.tsx's tabBar navigates the same way — `id` must be exactly its
// `app/rider/(tabs)/<id>.tsx` route segment name. The board is `index.tsx` (not `jobs.tsx`) so the
// route stays "/rider" with zero changes to every existing "/rider" call site.
describe("RIDER_TABS (rider tab shell — plan §5 Lane B1)", () => {
  it("has exactly Jobs | Money | Account, in that order, ids matching their route file names", () => {
    expect(RIDER_TABS.map((t) => t.id)).toEqual(["index", "money", "account"]);
  });
});
