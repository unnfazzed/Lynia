import type { MerchantHours } from "@lynia/shared";
import type { OrderHistoryRow } from "../../api/orders";
import {
  LIVE_ORDER_STEP_COUNT,
  liveOrderCardCopy,
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

describe("liveOrderCardCopy", () => {
  const order = {
    pickup: { landmark: "Eastgate" },
    dropoff: { landmark: "Avenues" },
    agreedFare: null,
    proposedFare: "5.5",
  };

  it("titles with the status label", () => {
    expect(liveOrderCardCopy(order, "Heading to pickup").title).toBe("Delivery in progress · Heading to pickup");
  });

  it("meta reads pickup → drop-off · fare, preferring the agreed fare over proposed", () => {
    expect(liveOrderCardCopy(order, "x").meta).toBe("Eastgate → Avenues · $5.50");
    expect(liveOrderCardCopy({ ...order, agreedFare: "6" }, "x").meta).toBe("Eastgate → Avenues · $6.00");
  });

  it("falls back to generic landmark copy when a landmark is missing", () => {
    const noLandmarks = { ...order, pickup: { landmark: null }, dropoff: { landmark: "" } };
    expect(liveOrderCardCopy(noLandmarks, "x").meta).toBe("Pickup → Drop-off · $5.50");
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
