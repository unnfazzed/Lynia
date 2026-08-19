import type { RestaurantListItem } from "@lynia/shared";
import { applyFoodListView, deliverToLabel, deliverySummary, etaRange, restaurantMeta, UNDER_FEE_MAX_USD } from "../food-list";

/** Harare CBD-ish origin, and merchants laid out at increasing distance from it. */
const ME = { lat: -17.8292, lng: 31.0522 };
const ALWAYS = { open: "00:00", close: "23:59" };
const NEVER = { open: "00:00", close: "00:00" };
const HOURS = (slot: { open: string; close: string }) => ({ mon: slot, tue: slot, wed: slot, thu: slot, fri: slot, sat: slot, sun: slot });
const NOW = new Date("2026-08-19T12:00:00Z");

function makeRestaurant(over: Partial<RestaurantListItem> & { id: string }): RestaurantListItem {
  return {
    name: over.id,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: HOURS(ALWAYS),
    location: null,
    ratingAvg: null,
    ratingCount: 0,
    prepBaselineMinutes: 20,
    ...over,
  } as RestaurantListItem;
}

/** Roughly 1km of latitude per 0.009°, so these sit at ~1km, ~3km and ~6km from ME. */
const near = makeRestaurant({ id: "near", location: { lat: ME.lat + 0.009, lng: ME.lng }, ratingAvg: 4.1, ratingCount: 10 });
const mid = makeRestaurant({ id: "mid", location: { lat: ME.lat + 0.027, lng: ME.lng }, ratingAvg: 4.9, ratingCount: 200 });
const far = makeRestaurant({ id: "far", location: { lat: ME.lat + 0.054, lng: ME.lng }, ratingAvg: 4.5, ratingCount: 50 });
const shut = makeRestaurant({ id: "shut", location: { lat: ME.lat + 0.001, lng: ME.lng }, hours: HOURS(NEVER), ratingAvg: 5, ratingCount: 99 });

const ALL = [far, mid, near, shut];
const IDLE = { openOnly: false, cheapFee: false, sort: null } as const;

describe("restaurantMeta — distance, fee and ETA off the one geo path the rest of the app uses", () => {
  it("derives all three once a customer fix and a merchant location both exist", () => {
    const m = restaurantMeta(near, ME);
    expect(m.distanceKm).toBeGreaterThan(0.8);
    expect(m.distanceKm).toBeLessThan(1.2);
    expect(m.etaMinutes).toBeGreaterThan(20); // prep + a travel leg, never prep alone
    expect(m.feeUsd).toBeGreaterThan(0);
  });

  it("returns nulls rather than guesses when either side of the distance is missing", () => {
    expect(restaurantMeta(near, null)).toMatchObject({ distanceKm: null, etaMinutes: null, feeUsd: null });
    expect(restaurantMeta(makeRestaurant({ id: "nowhere" }), ME)).toMatchObject({ distanceKm: null, feeUsd: null });
  });

  it("shows no star until a customer has actually rated — never an invented zero", () => {
    expect(restaurantMeta(makeRestaurant({ id: "new", ratingAvg: 0, ratingCount: 0 }), ME).rating).toBeNull();
    expect(restaurantMeta(near, ME).rating).toBe(4.1);
  });
});

describe("applyFoodListView — the four drawn pills", () => {
  it("leaves the feed order untouched when no pill is set", () => {
    expect(applyFoodListView(ALL, NOW, ME, IDLE).map((r) => r.id)).toEqual(["far", "mid", "near", "shut"]);
  });

  it("'Open now' drops closed kitchens", () => {
    expect(applyFoodListView(ALL, NOW, ME, { ...IDLE, openOnly: true }).map((r) => r.id)).toEqual(["far", "mid", "near"]);
  });

  it("'Nearest' orders by distance but never floats a closed kitchen above an open one", () => {
    // `shut` is the closest of all — it must still sort last, exactly as the mock's list draws it.
    expect(applyFoodListView(ALL, NOW, ME, { ...IDLE, sort: "nearest" }).map((r) => r.id)).toEqual(["near", "mid", "far", "shut"]);
  });

  it("'Top rated' orders by rating, open kitchens first", () => {
    expect(applyFoodListView(ALL, NOW, ME, { ...IDLE, sort: "top_rated" }).map((r) => r.id)).toEqual(["mid", "far", "near", "shut"]);
  });

  it("'Under $2 fee' keeps only rows it can actually price under the threshold", () => {
    const out = applyFoodListView(ALL, NOW, ME, { ...IDLE, cheapFee: true });
    for (const r of out) expect(restaurantMeta(r, ME).feeUsd).toBeLessThan(UNDER_FEE_MAX_USD);
    // An unpriceable row is excluded, not quietly kept — the pill is a claim about every row it leaves.
    const withUnpriceable = [...ALL, makeRestaurant({ id: "nowhere" })];
    expect(applyFoodListView(withUnpriceable, NOW, ME, { ...IDLE, cheapFee: true }).map((r) => r.id)).not.toContain("nowhere");
  });

  it("holds unrankable rows behind ranked ones instead of sorting them to the top", () => {
    const withUnrankable = [makeRestaurant({ id: "nowhere" }), near, mid];
    expect(applyFoodListView(withUnrankable, NOW, ME, { ...IDLE, sort: "nearest" }).map((r) => r.id)).toEqual(["near", "mid", "nowhere"]);
  });

  it("combines a filter and a sort without either being lost", () => {
    const out = applyFoodListView(ALL, NOW, ME, { openOnly: true, cheapFee: false, sort: "nearest" });
    expect(out.map((r) => r.id)).toEqual(["near", "mid", "far"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...ALL];
    applyFoodListView(input, NOW, ME, { ...IDLE, sort: "nearest" });
    expect(input.map((r) => r.id)).toEqual(["far", "mid", "near", "shut"]);
  });
});

describe("etaRange + deliverySummary — the mock's results line", () => {
  it("spans the lowest ETA to the highest, banded like every ETA the app draws", () => {
    const range = etaRange([near, mid, far].map((r) => restaurantMeta(r, ME)));
    expect(range).not.toBeNull();
    expect(range!.low).toBeLessThan(range!.high);
    // The high end is a band above the slowest single estimate, never the bare point estimate.
    expect(range!.high).toBeGreaterThan(Math.max(...[near, mid, far].map((r) => restaurantMeta(r, ME).etaMinutes!)));
  });

  it("is null when nothing can be timed, so the caller drops the clause", () => {
    expect(etaRange([near, mid].map((r) => restaurantMeta(r, null)))).toBeNull();
  });

  it("reads the way the mock draws it", () => {
    expect(deliverySummary(5, "Belgravia", { low: 25, high: 45 })).toBe("5 places deliver to Belgravia · 25–45 min");
  });

  it("degrades each half independently and honestly", () => {
    expect(deliverySummary(5, null, { low: 25, high: 45 })).toBe("5 places deliver here · 25–45 min");
    expect(deliverySummary(5, "Belgravia", null)).toBe("5 places deliver to Belgravia");
    expect(deliverySummary(5, null, null)).toBe("5 places deliver here");
  });

  it("agrees with itself in the singular", () => {
    expect(deliverySummary(1, "Belgravia", null)).toBe("1 place delivers to Belgravia");
  });
});

describe("deliverToLabel — the street qualified by its suburb", () => {
  it("reads the way RC.list draws it", () => {
    expect(deliverToLabel("12 Lanark Rd", "Belgravia")).toBe("12 Lanark Rd, Belgravia");
  });

  it("leaves the label alone when no suburb resolved", () => {
    expect(deliverToLabel("12 Lanark Rd", null)).toBe("12 Lanark Rd");
    expect(deliverToLabel("Set your location", null)).toBe("Set your location");
  });

  it("never doubles the area back onto a label that already carries it", () => {
    // A fix that degraded to the district has the area AS its label — "Belgravia, Belgravia" is worse.
    expect(deliverToLabel("Belgravia", "Belgravia")).toBe("Belgravia");
    expect(deliverToLabel("12 Lanark Rd, Belgravia", "Belgravia")).toBe("12 Lanark Rd, Belgravia");
    // The geocoder is not consistent about casing between fields.
    expect(deliverToLabel("BELGRAVIA", "Belgravia")).toBe("BELGRAVIA");
  });

  it("matches whole address components, not substrings — a street named after the suburb still qualifies", () => {
    // "Belgravia Road" CONTAINS "Belgravia" but is a street, not the suburb. Suppressing the
    // qualifier here would drop the one part of the line that says which corridor this is.
    expect(deliverToLabel("Belgravia Road", "Belgravia")).toBe("Belgravia Road, Belgravia");
    expect(deliverToLabel("12 Belgravia Close", "Belgravia")).toBe("12 Belgravia Close, Belgravia");
    // ...but a real trailing component is still recognised, whatever the spacing around the comma.
    expect(deliverToLabel("12 Lanark Rd,Belgravia", "Belgravia")).toBe("12 Lanark Rd,Belgravia");
  });

  it("trims consistently whether or not an area is appended", () => {
    expect(deliverToLabel("  12 Lanark Rd  ", "Belgravia")).toBe("12 Lanark Rd, Belgravia");
    expect(deliverToLabel("  12 Lanark Rd  ", null)).toBe("12 Lanark Rd");
    expect(deliverToLabel("12 Lanark Rd", "   ")).toBe("12 Lanark Rd");
  });
});
