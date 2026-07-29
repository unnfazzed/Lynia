import { APP_TABS } from "../TabBar";

// app/(tabs)/_layout.tsx's tabBar navigates by `navigation.navigate(id)` with no id→route lookup
// table — it relies on each tab's `id` being exactly its `app/(tabs)/<id>.tsx` route segment name
// (home.tsx, orders.tsx, account.tsx). A mismatch here is a silent dead tab, not a crash.
describe("APP_TABS (root tab shell)", () => {
  it("has exactly Home | Orders | Account, in that order, ids matching their route file names", () => {
    expect(APP_TABS.map((t) => t.id)).toEqual(["home", "orders", "account"]);
  });
});
