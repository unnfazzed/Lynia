import { browseCategories, browseList, browseRange, categoryServedNow, DEFAULT_FILTERS, type VenueView, windowLaterToday } from "../browse";

/** Browse v2 (ledger D-57) — the venue list's ordering, grouping and serving windows. */
function venue(id: string, over: Partial<VenueView> = {}): VenueView {
  return {
    id,
    name: id,
    categories: [],
    sub: "",
    kind: null,
    photoUrl: null,
    logoUrl: null,
    rating: null,
    ratingCount: 0,
    km: null,
    feeUsd: null,
    etaLow: null,
    etaHigh: null,
    freeDelivery: false,
    open: true,
    closesInMin: null,
    closeTime: null,
    opens: null,
    prepMinutes: 20,
    ...over,
  };
}

describe("browseList", () => {
  const a = venue("a", { km: 2, rating: 4.9, ratingCount: 50, feeUsd: 2, categories: ["Pizza"] });
  const b = venue("b", { km: 1, rating: 4.5, ratingCount: 10, feeUsd: 1.5, categories: ["Chicken"] });
  const c = venue("c", { km: null, rating: null, categories: ["Chicken"] });
  const late = venue("late", { open: false, opens: { time: "18:00", dayOffset: 0, day: "Thursday" } });
  const soon = venue("soon", { open: false, opens: { time: "10:00", dayOffset: 0, day: "Thursday" } });
  const tmr = venue("tmr", { open: false, opens: { time: "07:00", dayOffset: 1, day: "Friday" } });

  it("Recommended falls back to nearest-open; unknown distances go last", () => {
    expect(browseList([a, c, b], DEFAULT_FILTERS).open.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("never hides a closed venue: the closed group is ordered by who opens first", () => {
    const list = browseList([tmr, a, late, soon], DEFAULT_FILTERS);
    expect(list.open.map((v) => v.id)).toEqual(["a"]);
    expect(list.closed.map((v) => v.id)).toEqual(["soon", "late", "tmr"]);
  });

  it("Top rated puts the unrated last; Lowest delivery fee is cheapest first", () => {
    expect(browseList([b, c, a], { ...DEFAULT_FILTERS, sort: "top_rated" }).open.map((v) => v.id)).toEqual(["a", "b", "c"]);
    expect(browseList([a, c, b], { ...DEFAULT_FILTERS, sort: "lowest_fee" }).open.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("filters by category and by free delivery", () => {
    expect(browseList([a, b, c], { ...DEFAULT_FILTERS, category: "Chicken" }).open.map((v) => v.id)).toEqual(["b", "c"]);
    expect(browseList([a, b, c], { ...DEFAULT_FILTERS, free: true }).open).toEqual([]);
  });

  it("lists categories most common first, and the time range across open venues", () => {
    expect(browseCategories([a, b, c])).toEqual(["Chicken", "Pizza"]);
    expect(browseRange([venue("x", { etaLow: 25, etaHigh: 35 }), venue("y", { etaLow: 30, etaHigh: 45 }), c])).toEqual({ a: 25, b: 45 });
    expect(browseRange([c])).toBeNull();
  });
});

describe("category serving windows", () => {
  const at = (h: number, m = 0): Date => new Date(2026, 9, 1, h, m);
  it("serves inside the window, not outside it; no window means always", () => {
    expect(categoryServedNow("07:00", "11:00", at(8))).toBe(true);
    expect(categoryServedNow("07:00", "11:00", at(11))).toBe(false);
    expect(categoryServedNow(null, null, at(3))).toBe(true);
  });
  it("knows whether the window is still ahead today", () => {
    expect(windowLaterToday("07:00", at(6, 30))).toBe(true);
    expect(windowLaterToday("07:00", at(12))).toBe(false);
  });
});
