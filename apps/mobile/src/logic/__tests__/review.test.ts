import type { FoodCartLine } from "../food-cart";
import { arrivalWindow, areaOf, carriedBalance, deliveryLandmark, displayPhone, firstSlot, hhmm, placeOrderBody, reconcileCart, reviewBreakdown, slotDay, startsAt } from "../review";
import { cartService } from "../food-cart";

const line = (dishId: string, priceUsd: number, quantity: number, note = ""): FoodCartLine => ({ dishId, name: dishId, priceUsd, quantity, note });

describe("reviewBreakdown — Food · Delivery fee · Small-order fee · Total (R1/R4)", () => {
  it("R1 Gava's Kitchen: $15.00 food + $1.50 delivery = $16.50, no small-order fee", () => {
    const b = reviewBreakdown([line("sadza", 4.5, 2), line("chicken", 6, 1)], 1.5);
    expect(b).toEqual({ food: 15, deliveryFee: 1.5, freeDelivery: false, smallOrderFee: 0, owed: 0, total: 16.5, belowMinimum: false, shortfall: 0 });
  });

  // D-71: free delivery paid by the venue — the totals the customer sees.
  it("D-71: a free-delivery venue — $15.00 food, $0 delivery, total $15.00", () => {
    const b = reviewBreakdown([line("sadza", 4.5, 2), line("chicken", 6, 1)], 1.5, 0, true);
    expect(b).toMatchObject({ food: 15, deliveryFee: 0, freeDelivery: true, total: 15 });
  });

  it("D-71: free delivery still carries the small-order fee and any owed balance", () => {
    const b = reviewBreakdown([line("a", 3, 1)], 1.5, 2, true);
    // $3 food + $1 small-order fee = $4 goods ≥ $1.50 fee → free; + $2 owed.
    expect(b).toMatchObject({ deliveryFee: 0, freeDelivery: true, smallOrderFee: 1, owed: 2, total: 6 });
  });

  it("D-71: goods that don't cover the fee pay delivery as usual (same rule as the server)", () => {
    const b = reviewBreakdown([line("a", 0.5, 1)], 2, 0, true);
    expect(b).toMatchObject({ deliveryFee: 2, freeDelivery: false, total: 3.5 });
  });

  it("D-71: no address yet → no fee row even at a free-delivery venue", () => {
    expect(reviewBreakdown([line("a", 9, 1)], null, 0, true)).toMatchObject({ deliveryFee: null, freeDelivery: false, total: 9 });
  });

  it("R4: under $4.00 adds the $1.00 small-order fee — $3.30 + $1.00 + $1.50 = $5.80, $0.70 short", () => {
    const b = reviewBreakdown([line("paracetamol", 1.5, 1), line("plasters", 1.8, 1)], 1.5);
    expect(b.smallOrderFee).toBe(1);
    expect(b.belowMinimum).toBe(true);
    expect(b.shortfall).toBe(0.7);
    expect(b.total).toBe(5.8);
  });

  it("exactly $4.00 clears the minimum (no fee)", () => {
    const b = reviewBreakdown([line("a", 2, 2)], 1);
    expect(b.smallOrderFee).toBe(0);
    expect(b.belowMinimum).toBe(false);
    expect(b.total).toBe(5);
  });

  it("R9b: no address → no delivery fee row, the total is food (+ any small-order fee) only", () => {
    const b = reviewBreakdown([line("a", 3, 1)], null);
    expect(b.deliveryFee).toBeNull();
    expect(b.total).toBe(4);
  });

  it("adds money in cents — never a float tail", () => {
    expect(reviewBreakdown([line("a", 0.1, 3), line("b", 4.2, 1)], 0.2).total).toBe(4.7);
  });

  it("an empty cart charges nothing", () => {
    expect(reviewBreakdown([], null)).toMatchObject({ food: 0, smallOrderFee: 0, total: 0, belowMinimum: false });
  });
});

describe("reconcileCart — R6a sold out / price changed", () => {
  const latest = new Map([
    ["bread", { priceUsd: 1.1, outOfStock: true }],
    ["eggs", { priceUsd: 5.9, outOfStock: false }],
    ["mazoe", { priceUsd: 3.2, outOfStock: false }],
  ]);
  it("takes off sold-out and vanished dishes, applies new prices, keeps the rest", () => {
    const r = reconcileCart([line("bread", 1.1, 1), line("eggs", 5.5, 1, "large"), line("mazoe", 3.2, 2), line("gone", 2, 1)], latest);
    expect(r.lines).toEqual([line("eggs", 5.9, 1, "large"), line("mazoe", 3.2, 2)]);
    expect(r.gone.map((l) => l.dishId)).toEqual(["bread", "gone"]);
    expect(r.priceChanges).toEqual({ "eggs|large": { from: 5.5, to: 5.9 } });
  });
  it("is a no-op before the menu has loaded", () => {
    const lines = [line("bread", 1.1, 1)];
    expect(reconcileCart(lines, null)).toEqual({ lines, gone: [], priceChanges: {} });
  });
});

describe("placeOrderBody — the place-order payload is unchanged by Review", () => {
  it("sends items with per-line notes, the order note, the drop-off waypoint, cash and the idempotency key", () => {
    const body = placeOrderBody({
      lines: [line("d1", 4.5, 2, "Extra gravy"), line("d2", 6, 1)],
      orderNote: "Pack the sadza separately",
      drop: { lat: -17.81, lng: 31.04, label: "12 Lanark Rd, Belgravia" },
      riderNote: "Blue gate, 3rd house on the left",
      phone: "0771 234 567",
      idempotencyKey: "idem-test-1",
    });
    expect(body).toEqual({
      items: [
        { dishId: "d1", quantity: 2, note: "Extra gravy" },
        { dishId: "d2", quantity: 1, note: undefined },
      ],
      note: "Pack the sadza separately",
      dropoff: { point: { lat: -17.81, lng: 31.04 }, landmark: "Blue gate, 3rd house on the left", contactPhone: "+263771234567" },
      paymentMethod: "cash",
      idempotencyKey: "idem-test-1",
    });
  });

  it("omits an empty order note and falls back to the address line as the landmark", () => {
    const body = placeOrderBody({
      lines: [line("d1", 5, 1)],
      orderNote: "",
      drop: { lat: 1, lng: 2, label: "12 Lanark Rd, Belgravia" },
      riderNote: "   ",
      phone: "0771234567",
      idempotencyKey: "idem-test-1",
    });
    expect(body.note).toBeUndefined();
    expect(body.dropoff.landmark).toBe("12 Lanark Rd, Belgravia");
    expect(body.paymentMethod).toBe("cash");
  });

  it("caps the landmark at the contract's 160", () => {
    expect(deliveryLandmark("x", "y".repeat(200))).toHaveLength(160);
  });
});

describe("Review formatting", () => {
  it("draws the 24-hour clock and an arrival window only from an honest band", () => {
    const now = new Date(2026, 9, 2, 12, 20);
    expect(hhmm(now)).toBe("12:20");
    expect(arrivalWindow({ low: 20, high: 35 }, now)).toEqual({ a: "12:40", b: "12:55" });
    expect(arrivalWindow(null, now)).toBeNull();
  });
  it("shows a Zimbabwe mobile as 0771 234 567, anything else as typed", () => {
    expect(displayPhone("+263771234567")).toBe("0771 234 567");
    expect(displayPhone("0771234567")).toBe("0771 234 567");
    expect(displayPhone(" 12345 ")).toBe("12345");
  });
  it("names the area of an address line", () => {
    expect(areaOf("Chitungwiza, Unit L")).toBe("Chitungwiza");
    expect(areaOf("Belgravia")).toBe("Belgravia");
  });
});

describe("Order flow v2 part 5 — shops, scheduled, Rx, owed balance", () => {
  const slot = (start: string, label: string, full = false) => ({ start, end: start, label, full });
  const A = slot("2026-10-03T08:30:00.000Z", "10:30–11:00");
  const FULL = slot("2026-10-02T14:00:00.000Z", "16:00–16:30", true);
  const SLOTS = { slotMinutes: 30, openNow: false, leadMinutes: 35, today: { date: "2026-10-02", slots: [FULL] }, tomorrow: { date: "2026-10-03", slots: [A] }, firstAvailable: A };

  it("cartService: no venue = a kitchen; a shop by its kind", () => {
    expect(cartService(null)).toBe("food");
    expect(cartService({ businessType: "restaurant", shopKind: null })).toBe("food");
    expect(cartService({ businessType: "shop", shopKind: "grocery" })).toBe("shops");
    expect(cartService({ businessType: "shop", shopKind: "pharmacy" })).toBe("pharmacy");
  });

  it("D3f: only lines not already carried by a live order ride on the next one, and the total includes them", () => {
    expect(carriedBalance({ lines: [{ orderId: "a", amount: 16.5, createdAt: "", carriedOnOrderId: null }, { orderId: "b", amount: 3.1, createdAt: "", carriedOnOrderId: "o-1" }] })).toBe(16.5);
    const b = reviewBreakdown([line("d1", 9, 1), line("d2", 6, 1)], 1.5, 16.5);
    expect(b.owed).toBe(16.5);
    expect(b.total).toBe(33);
  });

  it("slots: which day a slot is on, the first one that isn't full, and the ring time", () => {
    expect(slotDay(SLOTS, A.start)).toBe("tomorrow");
    expect(slotDay(SLOTS, FULL.start)).toBe("today");
    expect(slotDay(SLOTS, "2026-10-04T08:30:00.000Z")).toBeNull();
    expect(firstSlot(SLOTS)).toEqual({ day: "tomorrow", slot: A });
    expect(firstSlot({ ...SLOTS, firstAvailable: null })).toBeNull();
    expect(startsAt(A.start, 35)).toBe(hhmm(new Date(new Date(A.start).getTime() - 35 * 60_000)));
  });

  it("the place body carries scheduledFor / outOfStockPref / prescription only when set", () => {
    const base = { lines: [line("d1", 4.5, 1)], orderNote: "", drop: { lat: -17.8, lng: 31.05, label: "12 Lanark Rd" }, riderNote: "", phone: "0771234567", idempotencyKey: "k" };
    const plain = placeOrderBody(base);
    expect("scheduledFor" in plain || "outOfStockPref" in plain || "prescription" in plain).toBe(false);
    const rx = { photoKeys: ["rx/1.jpg"], patientName: "Rudo Moyo", consent: true as const };
    expect(placeOrderBody({ ...base, scheduledFor: A.start, outOfStockPref: "remove", prescription: rx })).toMatchObject({ scheduledFor: A.start, outOfStockPref: "remove", prescription: rx });
  });
});
