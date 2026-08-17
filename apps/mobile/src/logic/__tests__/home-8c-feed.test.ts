import type { RestaurantListItem } from "@lynia/shared";
import {
  DEFAULT_PREP_MINUTES,
  liveOrderPillModel,
  type LiveOrderLike,
  POPULAR_LIMIT,
  popularNearYou,
  riderShortName,
} from "../home-feed";

/**
 * Home 8c's two new selection models: the tracker PILL (§3) and the "Popular near you" grid (§4).
 * The pre-8c `liveOrderCardModel` keeps its own suite (home-feed.test.ts) — nothing has moved off it.
 */

const PICKUP = { lat: -17.83, lng: 31.05 };
const DROPOFF = { lat: -17.82, lng: 31.06 };

const parcel = (overrides: Partial<LiveOrderLike> = {}): LiveOrderLike => ({
  id: "o-parcel",
  status: "en_route_dropoff",
  pickup: { point: PICKUP, landmark: "Eastgate" },
  dropoff: { point: DROPOFF, landmark: "Msasa" },
  rider: null,
  agreedFare: null,
  proposedFare: "3.36",
  ...overrides,
});

describe("riderShortName", () => {
  it("draws the mock's form: first name + last initial", () => {
    expect(riderShortName("Tendai", "Moyo")).toBe("Tendai M.");
  });

  it("uses the first name alone when there is no surname", () => {
    expect(riderShortName("Tendai", "")).toBe("Tendai");
    expect(riderShortName("Tendai", null)).toBe("Tendai");
  });

  it("returns null with no first name, so the caller falls back to service copy", () => {
    expect(riderShortName("", "Moyo")).toBeNull();
    expect(riderShortName(null, "Moyo")).toBeNull();
  });
});

describe("liveOrderPillModel (home 8c tracker pill)", () => {
  it("draws the mock's line verbatim once the rider is heading to the customer", () => {
    const pill = liveOrderPillModel(parcel(), "On the way to drop-off", "Tendai M.");
    expect(pill.title).toBe("Tendai M. · on the way");
    expect(pill.icon).toBe("bike");
    expect(pill.route).toBe("/order/o-parcel");
  });

  it("falls back to honest service copy when no rider identity is cached for that order", () => {
    expect(liveOrderPillModel(parcel(), "On the way to drop-off", null).title).toBe("Your parcel · on the way");
    const food = parcel({ id: "o-food", orderType: "merchant", status: "picked_up", merchantName: "Sadza Republic" });
    expect(liveOrderPillModel(food, "Parcel collected", null).title).toBe("Sadza Republic · on the way");
    // A food job with no merchant name still says something true rather than rendering a stray dot.
    expect(liveOrderPillModel({ ...food, merchantName: null }, "Parcel collected", null).title).toBe("Your order · on the way");
  });

  it("uses the app's SHIPPED status vocabulary for the states the mock does not draw", () => {
    // Pre-pickup the rider is heading to the KITCHEN/collection point — calling that "on the way"
    // would read as a doorstep promise it isn't.
    expect(liveOrderPillModel(parcel({ status: "en_route_pickup" }), "Heading to pickup", "Tendai M.").title).toBe(
      "Tendai M. · Heading to pickup",
    );
    const food = parcel({ orderType: "merchant", status: "assigned", merchantName: "Sadza Republic" });
    expect(liveOrderPillModel(food, "Rider assigned", null).title).toBe("Sadza Republic · Rider secured");
  });

  it("carries the 7-segment progress the mock draws, per service vocabulary", () => {
    expect(liveOrderPillModel(parcel(), "x", null)).toMatchObject({ step: 4, steps: 7 });
    const food = parcel({ orderType: "merchant", status: "picked_up" });
    expect(liveOrderPillModel(food, "x", null)).toMatchObject({ step: 4, steps: 7 });
  });

  it("lights no segment before assignment rather than clamping to the first", () => {
    expect(liveOrderPillModel(parcel({ status: "open_for_offers" }), "Finding riders", null).step).toBe(-1);
  });

  it("fills the gold ETA chip from the live rider fix, and leaves it EMPTY without one", () => {
    expect(liveOrderPillModel(parcel(), "x", null).etaMinutes).toBeNull();
    const withRider = parcel({ rider: { currentLat: -17.828, currentLng: 31.058 } });
    expect(liveOrderPillModel(withRider, "x", null).etaMinutes).toBeGreaterThan(0);
    // A terminal status has no leg to estimate — no invented number.
    expect(liveOrderPillModel({ ...withRider, status: "delivered" }, "x", null).etaMinutes).toBeNull();
  });

  it("routes a food job to the food tracker and a parcel to the parcel tracker", () => {
    expect(liveOrderPillModel(parcel({ id: "a", orderType: "merchant" }), "x", null).route).toBe("/food/order/a");
    expect(liveOrderPillModel(parcel({ id: "b" }), "x", null).route).toBe("/order/b");
  });
});

describe("popularNearYou (home 8c venue grid)", () => {
  const ALWAYS_OPEN = { open: "00:00", close: "23:59" };
  const HOURS = { mon: ALWAYS_OPEN, tue: ALWAYS_OPEN, wed: ALWAYS_OPEN, thu: ALWAYS_OPEN, fri: ALWAYS_OPEN, sat: ALWAYS_OPEN, sun: ALWAYS_OPEN };
  const CUSTOMER = { lat: -17.8292, lng: 31.0522 };
  const KM_PER_DEG_LAT = 111.195;
  const NOW = new Date(2026, 7, 17, 12, 0, 0);

  const venue = (overrides: Partial<RestaurantListItem> & { km?: number } = {}): RestaurantListItem => {
    const { km = 1, ...rest } = overrides;
    return {
      id: "r1",
      name: "Golden Bao",
      coverPhotoUrl: null,
      logoUrl: null,
      cuisineTags: [],
      priceLevel: 2,
      hours: HOURS,
      location: { lat: CUSTOMER.lat + km / KM_PER_DEG_LAT, lng: CUSTOMER.lng },
      ratingAvg: 4.9,
      ratingCount: 210,
      prepBaselineMinutes: 20,
      ...rest,
    } as RestaurantListItem;
  };

  it("formats the rating to one decimal, as drawn", () => {
    expect(popularNearYou([venue()], NOW, CUSTOMER)[0]?.rating).toBe("4.9");
  });

  it("shows NO rating for a shop nobody has rated — never an invented '0' or 'new'", () => {
    expect(popularNearYou([venue({ ratingCount: 0, ratingAvg: null })], NOW, CUSTOMER)[0]?.rating).toBeNull();
  });

  it("derives the ETA as prep + the delivery leg, from real coordinates", () => {
    // 1.3 km straight line → 1.69 km of road at 22 km/h → ceil(4.6) = 5 minutes, + 20 prep.
    expect(popularNearYou([venue({ km: 1.3 })], NOW, CUSTOMER)[0]?.etaMinutes).toBe(25);
    expect(popularNearYou([venue({ km: 1.3, prepBaselineMinutes: 25 })], NOW, CUSTOMER)[0]?.etaMinutes).toBe(30);
  });

  it("falls back to a default prep when the merchant has not set one", () => {
    const eta = popularNearYou([venue({ km: 1.3, prepBaselineMinutes: null })], NOW, CUSTOMER)[0]?.etaMinutes;
    expect(eta).toBe(DEFAULT_PREP_MINUTES + 5);
  });

  it("prices the delivery fee with the SAME formula the server charges", () => {
    // 1.3 km · $0.80 = $1.04, rounded to the nearest $0.50 = $1.00, lifted to the $1.50 floor.
    expect(popularNearYou([venue({ km: 1.3 })], NOW, CUSTOMER)[0]?.deliveryFee).toBe("$1.50");
    expect(popularNearYou([venue({ km: 6 })], NOW, CUSTOMER)[0]?.deliveryFee).toBe("$5.00");
  });

  it("draws neither ETA nor fee when a point is missing — no fabricated figures", () => {
    const noFix = popularNearYou([venue()], NOW, null)[0];
    expect(noFix?.etaMinutes).toBeNull();
    expect(noFix?.deliveryFee).toBeNull();
    const noMerchantLocation = popularNearYou([venue({ location: null })], NOW, CUSTOMER)[0];
    expect(noMerchantLocation?.etaMinutes).toBeNull();
    expect(noMerchantLocation?.deliveryFee).toBeNull();
    // The name and the rating still render — a missing distance never blanks the whole card.
    expect(noFix?.rating).toBe("4.9");
  });

  it("orders the nearest OPEN venues first", () => {
    const CLOSED = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null } as unknown as RestaurantListItem["hours"];
    const out = popularNearYou(
      [
        venue({ id: "far", name: "Far", km: 5 }),
        venue({ id: "near-closed", name: "Near but shut", km: 0.2, hours: CLOSED }),
        venue({ id: "near", name: "Near", km: 0.5 }),
      ],
      NOW,
      CUSTOMER,
    );
    expect(out.map((v) => v.id)).toEqual(["near", "far", "near-closed"]);
    expect(out.map((v) => v.closed)).toEqual([false, false, true]);
  });

  it("keeps feed order for venues that cannot be ranked, behind the ones that can", () => {
    const out = popularNearYou(
      [venue({ id: "unknown-a", location: null }), venue({ id: "ranked", km: 2 }), venue({ id: "unknown-b", location: null })],
      NOW,
      CUSTOMER,
    );
    expect(out.map((v) => v.id)).toEqual(["ranked", "unknown-a", "unknown-b"]);
  });

  it("caps the grid at the 2×2 the mock draws", () => {
    const many = Array.from({ length: 9 }, (_, i) => venue({ id: `r${i}`, km: i + 1 }));
    expect(POPULAR_LIMIT).toBe(4);
    expect(popularNearYou(many, NOW, CUSTOMER)).toHaveLength(4);
  });

  it("renders nothing from an empty feed", () => {
    expect(popularNearYou([], NOW, CUSTOMER)).toEqual([]);
  });
});
