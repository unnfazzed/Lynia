import type { MerchantHours } from "@lynia/shared";
import type { OrderHistoryRow } from "../../api/orders";
import {
  LIVE_ORDER_STEP_COUNT,
  liveOrderCardModel,
  type LiveOrderLike,
  liveOrderStepIndex,
  reorderRailItems,
  restaurantCardStatus,
} from "../home-feed";

describe("liveOrderStepIndex", () => {
  it("returns -1 for a pre-assignment status (still in the auction)", () => {
    expect(liveOrderStepIndex("open_for_offers")).toBe(-1);
    expect(liveOrderStepIndex("requested")).toBe(-1);
  });

  it("returns the tracker index for each live-order status, in order", () => {
    expect(liveOrderStepIndex("assigned")).toBe(0);
    expect(liveOrderStepIndex("confirmed")).toBe(1);
    expect(liveOrderStepIndex("en_route_pickup")).toBe(2);
    expect(liveOrderStepIndex("picked_up")).toBe(3);
    expect(liveOrderStepIndex("en_route_dropoff")).toBe(4);
    expect(liveOrderStepIndex("delivered")).toBe(5);
    expect(liveOrderStepIndex("completed")).toBe(6);
  });

  it("stays within [0, LIVE_ORDER_STEP_COUNT) for every real status", () => {
    expect(LIVE_ORDER_STEP_COUNT).toBe(7);
    expect(liveOrderStepIndex("completed")).toBeLessThan(LIVE_ORDER_STEP_COUNT);
  });
});

describe("liveOrderCardModel (RC.home per-service card copy)", () => {
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
  const food = (overrides: Partial<LiveOrderLike> = {}): LiveOrderLike => ({
    ...parcel({ id: "o-food", orderType: "merchant", merchantName: "Sadza Republic", merchantPaymentMethod: "cash", agreedFare: "15.50" }),
    ...overrides,
  });
  // A rider standing on the target point computes to the floor "1 min away" — deterministic without
  // replaying eta.ts's haversine/speed math here.
  const riderAtDropoff = { currentLat: DROPOFF.lat, currentLng: DROPOFF.lng };

  it("parcel card: 'Parcel to {dropoff} · rider N min away', delivery code + total meta, bike icon (mock grammar)", () => {
    const m = liveOrderCardModel(parcel({ rider: riderAtDropoff }), "On the way to drop-off", "4192");
    expect(m.title).toBe("Parcel to Msasa · rider 1 min away");
    expect(m.meta).toBe("Delivery code 4192 · $3.36");
    expect(m.icon).toBe("bike");
    expect(m.step).toBe(4);
    expect(m.steps).toBe(LIVE_ORDER_STEP_COUNT);
    expect(m.route).toBe("/order/o-parcel");
  });

  it("parcel card falls back to the status label without a rider fix, and to the bare fare without a stored code", () => {
    const m = liveOrderCardModel(parcel({ status: "open_for_offers" }), "Finding riders", null);
    expect(m.title).toBe("Parcel to Msasa · Finding riders");
    expect(m.meta).toBe("$3.36");
    // Pre-assignment renders every progress segment unlit.
    expect(m.step).toBe(-1);
  });

  it("food card: '{Restaurant} · N min away', payment + total meta, utensils icon, food tracker route", () => {
    const m = liveOrderCardModel(food({ status: "picked_up", rider: riderAtDropoff }), "Parcel collected", null);
    expect(m.title).toBe("Sadza Republic · 1 min away");
    expect(m.meta).toBe("Cash at the door · $15.50");
    expect(m.icon).toBe("utensils");
    expect(m.step).toBe(4);
    expect(m.steps).toBe(7);
    expect(m.route).toBe("/food/order/o-food");
  });

  it("food card never shows kitchen-leg minutes as a doorstep promise — pre-pickup it reads the step label", () => {
    // Rider en route to the RESTAURANT: minutes would be to the kitchen, not the customer.
    const m = liveOrderCardModel(food({ status: "en_route_pickup", rider: riderAtDropoff }), "Heading to pickup", null);
    expect(m.title).toBe("Sadza Republic · Rider at the restaurant");
    expect(m.step).toBe(3);
  });

  it("food card while still with the kitchen: step label from merchantPhase, no rider needed", () => {
    const placed = liveOrderCardModel(food({ status: "requested", merchantPhase: "awaiting_accept" }), "Getting ready", null);
    expect(placed.title).toBe("Sadza Republic · Order placed");
    expect(placed.step).toBe(0);
    const preparing = liveOrderCardModel(food({ status: "requested", merchantPhase: "preparing" }), "Getting ready", null);
    expect(preparing.title).toBe("Sadza Republic · Restaurant accepted");
    expect(preparing.step).toBe(1);
  });

  it("food meta reads 'Paid' on the wallet rail and the bare total with no method recorded yet", () => {
    expect(liveOrderCardModel(food({ merchantPaymentMethod: "wallet" }), "x", null).meta).toBe("Paid · $15.50");
    expect(liveOrderCardModel(food({ merchantPaymentMethod: null }), "x", null).meta).toBe("$15.50");
  });

  it("food card without a merchant name keeps the honest generic headline", () => {
    expect(liveOrderCardModel(food({ merchantName: null }), "x", null).title).toMatch(/^Restaurant order · /);
  });
});

function historyRow(overrides: Partial<OrderHistoryRow>): OrderHistoryRow {
  return {
    id: "o1",
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: { lat: 0, lng: 0 }, landmark: "Eastgate" },
    dropoff: { point: { lat: 0, lng: 0 }, landmark: "Avenues" },
    itemDesc: "Documents",
    note: null,
    proposedFare: "3.00",
    agreedFare: null,
    status: "completed",
    createdAt: "2026-07-01T00:00:00Z",
    rating: null,
    counterpartyName: null,
    ...overrides,
  };
}

describe("reorderRailItems", () => {
  it("keeps only the customer's own sent trips", () => {
    const rows = [historyRow({ id: "a", role: "customer" }), historyRow({ id: "b", role: "rider" })];
    expect(reorderRailItems(rows).map((i) => i.id)).toEqual(["a"]);
  });

  it("caps at the given limit, preserving the input (newest-first) order", () => {
    const rows = Array.from({ length: 15 }, (_, i) => historyRow({ id: `o${i}` }));
    const items = reorderRailItems(rows, 10);
    expect(items).toHaveLength(10);
    expect(items[0]!.id).toBe("o0");
  });

  it("names the item from the drop-off landmark, formats the price, and falls back to itemDesc", () => {
    const rows = [historyRow({ id: "a", dropoff: { point: { lat: 0, lng: 0 }, landmark: "" }, itemDesc: "A parcel" })];
    const items = reorderRailItems(rows);
    expect(items[0]).toEqual({ id: "a", name: "A parcel", price: "$3.00" });
  });

  it("prefers the agreed fare over the proposed fare", () => {
    const rows = [historyRow({ id: "a", agreedFare: "4.25" })];
    expect(reorderRailItems(rows)[0]!.price).toBe("$4.25");
  });
});

describe("restaurantCardStatus", () => {
  // Wednesday 2026-07-29, noon — matches packages/shared/src/restaurant-hours.test.ts's fixture.
  const now = new Date(2026, 6, 29, 12, 0);
  // MerchantHours' zod-inferred type wants every day key even though a merchant only ever sets the
  // ones it trades on (z.record over an enum key infers a full Record<K,V>, not a partial one) —
  // packages/shared's own restaurant-hours.test.ts hits the same gap; a plain cast is the pragmatic
  // fix for a test fixture rather than reshaping the wire type for every caller.
  const hoursFixture = (window: { open: string; close: string }): MerchantHours => ({ wed: window }) as MerchantHours;

  it("reports open with no note when hours cover now", () => {
    expect(restaurantCardStatus(hoursFixture({ open: "09:00", close: "21:00" }), now)).toEqual({ closed: false, note: null });
  });

  it("reports closed with a next-open note when hours don't cover now", () => {
    const status = restaurantCardStatus(hoursFixture({ open: "18:00", close: "23:00" }), now);
    expect(status.closed).toBe(true);
    expect(status.note).toBe("Opens today at 18:00");
  });

  it("reports open with no note when a merchant hasn't set hours (fail-open per restaurant-hours.ts)", () => {
    expect(restaurantCardStatus(null, now)).toEqual({ closed: false, note: null });
  });
});
