import type { RestaurantListItem } from "@lynia/shared";
import { browseList, DEFAULT_FILTERS, type VenueView } from "../browse";
import { popularNearYou } from "../home-feed";
import { comparePopularity, deliversTo, mergePopularity, NO_POPULARITY, popularityIndex, rankedVenueMissing } from "../popularity";

/** Ledger D-72 — the "Popular" ranking's client half: ordering, cold start, closed and undeliverable venues. */

const ALWAYS_OPEN = { open: "00:00", close: "23:59" };
const HOURS = { mon: ALWAYS_OPEN, tue: ALWAYS_OPEN, wed: ALWAYS_OPEN, thu: ALWAYS_OPEN, fri: ALWAYS_OPEN, sat: ALWAYS_OPEN, sun: ALWAYS_OPEN };
/** No day listed: closed all week (an empty schedule, as the food list test draws it). */
const NEVER_OPEN = {} as RestaurantListItem["hours"];
/** Harare CBD — inside the service area. */
const CUSTOMER = { lat: -17.8292, lng: 31.0522 };
/** Bulawayo — outside it. */
const FAR_AWAY = { lat: -20.15, lng: 28.58 };
const KM_PER_DEG_LAT = 111.195;
const NOW = new Date(2026, 9, 2, 12, 0, 0);

function venue(id: string, km: number, over: Partial<RestaurantListItem> = {}): RestaurantListItem {
  return {
    id,
    name: id,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: HOURS,
    location: { lat: CUSTOMER.lat + km / KM_PER_DEG_LAT, lng: CUSTOMER.lng },
    ratingAvg: null,
    ratingCount: 0,
    prepBaselineMinutes: 20,
    ...over,
  } as RestaurantListItem;
}

const ranking = (...venues: Array<[id: string, score: number, orders?: number]>) =>
  popularityIndex({ venues: venues.map(([id, score, orders = 5]) => ({ id, score, orders })) });

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("popularityIndex", () => {
  it("reads the server's ranking", () => {
    const idx = ranking(["a", 4.2, 6], ["b", 1.5, 3]);
    expect(idx.get("a")).toEqual({ score: 4.2, orders: 6 });
    expect(idx.size).toBe(2);
  });

  it("reads a malformed or foreign body as no ranking, never a crash", () => {
    expect(popularityIndex(undefined)).toBe(NO_POPULARITY);
    expect(popularityIndex(null)).toBe(NO_POPULARITY);
    expect(popularityIndex({ restaurants: [] })).toBe(NO_POPULARITY);
    expect(popularityIndex({ venues: "x" })).toBe(NO_POPULARITY);
    expect(popularityIndex({ venues: [{ id: 3, score: 1 }, { id: "a", score: Number.NaN }, { id: "b", score: 0 }] })).toBe(NO_POPULARITY);
  });
});

describe("comparePopularity / mergePopularity / rankedVenueMissing", () => {
  const idx = ranking(["a", 3], ["b", 5]);
  it("ranks the higher score first and ranked before unranked", () => {
    expect(comparePopularity("b", "a", idx)).toBeLessThan(0);
    expect(comparePopularity("a", "z", idx)).toBeLessThan(0);
    expect(comparePopularity("y", "z", idx)).toBe(0);
    expect(comparePopularity("a", "b", NO_POPULARITY)).toBe(0);
  });

  it("breaks an equal score on the raw order count", () => {
    const tie = ranking(["a", 2, 3], ["b", 2, 7]);
    expect(comparePopularity("b", "a", tie)).toBeLessThan(0);
  });

  it("merges two sections' rankings", () => {
    expect(mergePopularity(NO_POPULARITY, idx)).toBe(idx);
    expect([...mergePopularity(idx, ranking(["c", 1])).keys()]).toEqual(["a", "b", "c"]);
  });

  it("knows when a ranked venue is on a page not loaded yet", () => {
    expect(rankedVenueMissing(idx, [{ id: "a" }, { id: "b" }])).toBe(false);
    expect(rankedVenueMissing(idx, [{ id: "a" }])).toBe(true);
    expect(rankedVenueMissing(NO_POPULARITY, [])).toBe(false);
    expect(rankedVenueMissing(idx, null)).toBe(false);
  });
});

describe("deliversTo", () => {
  it("needs the venue's pin, and a customer inside the service area (or not located yet)", () => {
    expect(deliversTo(CUSTOMER, CUSTOMER)).toBe(true);
    expect(deliversTo(CUSTOMER, null)).toBe(true);
    expect(deliversTo(null, CUSTOMER)).toBe(false);
    expect(deliversTo(CUSTOMER, FAR_AWAY)).toBe(false);
  });
});

describe("popularNearYou with a ranking (Home rails)", () => {
  const near = venue("near", 0.5);
  const mid = venue("mid", 2);
  const far = venue("far", 6);
  const farther = venue("farther", 9);

  it("leads with the most popular open venues, then the rest nearest first", () => {
    const idx = ranking(["far", 2.5], ["farther", 7.1]);
    expect(ids(popularNearYou([near, mid, far, farther], NOW, CUSTOMER, 8, idx))).toEqual(["farther", "far", "near", "mid"]);
  });

  it("breaks a popularity tie on distance", () => {
    const idx = ranking(["far", 3, 5], ["mid", 3, 5]);
    expect(ids(popularNearYou([far, near, mid], NOW, CUSTOMER, 8, idx))).toEqual(["mid", "far", "near"]);
  });

  it("cold start: no ranking is exactly the old nearest-open order", () => {
    const shut = venue("shut", 0.1, { hours: NEVER_OPEN });
    const list = [farther, shut, mid, near, far];
    expect(ids(popularNearYou(list, NOW, CUSTOMER, 8, NO_POPULARITY))).toEqual(["near", "mid", "far", "farther", "shut"]);
    expect(ids(popularNearYou(list, NOW, CUSTOMER, 8))).toEqual(ids(popularNearYou(list, NOW, CUSTOMER, 8, NO_POPULARITY)));
  });

  it("never ranks a closed venue, however popular — it stays with the closed ones at the end", () => {
    const shut = venue("shut", 0.3, { hours: NEVER_OPEN });
    const idx = ranking(["shut", 99], ["far", 1]);
    expect(ids(popularNearYou([shut, near, far], NOW, CUSTOMER, 8, idx))).toEqual(["far", "near", "shut"]);
  });

  it("ranks only venues that deliver to the customer", () => {
    const pinless = venue("pinless", 0, { location: null });
    const idx = ranking(["pinless", 50], ["far", 1]);
    expect(ids(popularNearYou([pinless, near, far], NOW, CUSTOMER, 8, idx))).toEqual(["far", "near", "pinless"]);
    // A customer outside the service area: nothing delivers there, so nothing ranks — nearest-open order.
    const fromAfar = popularNearYou([near, far], NOW, FAR_AWAY, 8, ranking(["near", 1], ["far", 5]));
    expect(ids(fromAfar)).toEqual(["near", "far"]);
  });

  it("still caps at the limit, popular first", () => {
    const idx = ranking(["farther", 4], ["far", 2]);
    expect(ids(popularNearYou([near, mid, far, farther], NOW, CUSTOMER, 2, idx))).toEqual(["farther", "far"]);
  });
});

describe("browseList — Recommended is the ranking", () => {
  const v = (id: string, km: number | null, open = true): VenueView =>
    ({ id, name: id, categories: [], sub: "", kind: null, photoUrl: null, logoUrl: null, rating: null, ratingCount: 0, km, feeUsd: null, etaLow: null, etaHigh: null, freeDelivery: false, open, closesInMin: null, closeTime: null, opens: null, prepMinutes: 20 }) as VenueView;
  const a = v("a", 1);
  const b = v("b", 3);
  const c = v("c", 5);
  const shut = v("shut", 0.5, false);

  it("orders open venues popular first, then nearest", () => {
    const list = browseList([a, b, c, shut], DEFAULT_FILTERS, ranking(["c", 4], ["b", 6]));
    expect(ids(list.open)).toEqual(["b", "c", "a"]);
    expect(ids(list.closed)).toEqual(["shut"]);
  });

  it("is nearest-open with no ranking (cold start)", () => {
    expect(ids(browseList([c, b, a], DEFAULT_FILTERS).open)).toEqual(["a", "b", "c"]);
  });

  it("leaves the explicit Nearest sort alone", () => {
    expect(ids(browseList([c, b, a], { ...DEFAULT_FILTERS, sort: "nearest" }, ranking(["c", 9])).open)).toEqual(["a", "b", "c"]);
  });

  it("a popular closed venue stays in the Closed group", () => {
    const list = browseList([a, shut], DEFAULT_FILTERS, ranking(["shut", 9]));
    expect(ids(list.open)).toEqual(["a"]);
    expect(ids(list.closed)).toEqual(["shut"]);
  });
});
