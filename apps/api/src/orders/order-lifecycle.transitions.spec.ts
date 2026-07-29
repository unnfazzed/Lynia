import { describe, expect, it } from "vitest";
import {
  appliesToOrderType,
  eventsFor,
  findMerchantPhaseTransition,
  findTransition,
  INITIAL,
  isLegalTransition,
  isTerminalState,
  MERCHANT_PHASES,
  MERCHANT_PHASE_TRANSITIONS,
  nextState,
  orderTypeOf,
  ORDER_STATES,
  TERMINAL_STATES,
  TRANSITIONS,
} from "./order-lifecycle.transitions";

const STATE_SET = new Set<string>(ORDER_STATES);

describe("order-lifecycle transition table — internal consistency", () => {
  it("every transition's `to` is a real OrderState", () => {
    for (const t of TRANSITIONS) expect(STATE_SET.has(t.to)).toBe(true);
  });

  it("every (from,event) pair is unique — the helpers are total functions", () => {
    const seen = new Set<string>();
    for (const t of TRANSITIONS) {
      const key = `${t.from}::${t.event}`;
      expect(seen.has(key), `duplicate transition ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every non-INITIAL `from` is a real OrderState", () => {
    for (const t of TRANSITIONS) {
      if (t.from !== INITIAL) expect(STATE_SET.has(t.from)).toBe(true);
    }
  });

  it("terminal states have no outgoing edge", () => {
    for (const term of TERMINAL_STATES) {
      expect(eventsFor(term)).toHaveLength(0);
      expect(isTerminalState(term)).toBe(true);
    }
  });

  it("records the diagram-vs-code divergence: parcel's create() still never enters `requested`", () => {
    // ARCHITECTURE.md §7 shows a `requested` node, but orders.service.ts:create() mints a PARCEL order
    // directly at open_for_offers — so `requested` is never a parcel `to`. C2 closes half the
    // divergence deliberately: a MERCHANT order IS born at `requested` (see the `place` event) — that
    // reuse of the previously-dead status is the plan §0b.1 locked decision, not a regression of this
    // pin. Only the parcel path is asserted dead here.
    const parcelRows = TRANSITIONS.filter((t) => orderTypeOf(t) !== "merchant");
    expect(parcelRows.some((t) => t.to === "requested")).toBe(false);
    expect(findTransition(INITIAL, "place")?.to).toBe("requested"); // the merchant exception, named
    expect(ORDER_STATES).toContain("requested"); // still a valid enum value
  });
});

describe("legal money / lifecycle transitions", () => {
  it("an order is born at open_for_offers", () => {
    expect(nextState(INITIAL, "create")).toBe("open_for_offers");
  });

  it("selecting an offer binds the price and assigns", () => {
    const t = findTransition("open_for_offers", "select_offer");
    expect(t?.to).toBe("assigned");
    expect(t?.sideEffect).toMatch(/agreedFare/i); // the money edge
  });

  it("the two completion edges (rate, auto_close) both leave delivered and both charge commission", () => {
    for (const ev of ["rate", "auto_close"] as const) {
      const t = findTransition("delivered", ev);
      expect(t?.to).toBe("completed");
      expect(t?.sideEffect).toMatch(/chargeCommission|MONEY/i);
    }
  });

  it("the full happy path is walkable edge by edge", () => {
    const path: Array<[Parameters<typeof nextState>[0], Parameters<typeof nextState>[1], string]> = [
      [INITIAL, "create", "open_for_offers"],
      ["open_for_offers", "select_offer", "assigned"],
      ["assigned", "confirmed", "confirmed"],
      ["confirmed", "en_route_pickup", "en_route_pickup"],
      ["en_route_pickup", "picked_up", "picked_up"],
      ["picked_up", "en_route_dropoff", "en_route_dropoff"],
      ["en_route_dropoff", "confirm_delivery", "delivered"],
      ["delivered", "rate", "completed"],
    ];
    for (const [from, event, to] of path) expect(nextState(from, event)).toBe(to);
  });
});

describe("illegal transitions are rejected (the guards the code enforces)", () => {
  it("cannot deliver an order that was never brought to the drop-off", () => {
    expect(isLegalTransition("assigned", "confirm_delivery")).toBe(false);
    expect(isLegalTransition("open_for_offers", "confirm_delivery")).toBe(false);
  });

  it("cannot accept an offer on a closed order", () => {
    for (const from of ["cancelled", "expired", "completed", "delivered"] as const) {
      expect(isLegalTransition(from, "select_offer")).toBe(false);
    }
  });

  it("cannot rate/complete an order that was never delivered", () => {
    expect(isLegalTransition("assigned", "rate")).toBe(false);
    expect(isLegalTransition("picked_up", "auto_close")).toBe(false);
  });

  it("a rider cannot cancel post-pickup (that failure mode is mark_undelivered, not cancel)", () => {
    expect(isLegalTransition("picked_up", "cancel_rider")).toBe(false);
    expect(isLegalTransition("en_route_dropoff", "cancel_rider")).toBe(false);
    // …but the customer still can cancel post-pickup:
    expect(isLegalTransition("picked_up", "cancel_customer")).toBe(true);
  });

  it("mark_undelivered is only reachable once the parcel is on the bike (picked_up onward)", () => {
    expect(isLegalTransition("assigned", "mark_undelivered")).toBe(false);
    expect(isLegalTransition("picked_up", "mark_undelivered")).toBe(true);
    expect(isLegalTransition("en_route_dropoff", "mark_undelivered")).toBe(true);
  });

  it("nextState returns null for an illegal pair", () => {
    expect(nextState("cancelled", "rate")).toBeNull();
  });
});

describe("C2/A-11 — orderType dimension", () => {
  it("every row still has a unique (from,event) pair — orderType never fights that invariant", () => {
    const seen = new Set<string>();
    for (const t of TRANSITIONS) {
      const key = `${t.from}::${t.event}`;
      expect(seen.has(key), `duplicate transition ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("the Express-auction edges (create, rebroadcast, select_offer, expire, cancel_rider) are parcel-only", () => {
    expect(orderTypeOf(findTransition(INITIAL, "create")!)).toBe("parcel");
    expect(orderTypeOf(findTransition(INITIAL, "rebroadcast")!)).toBe("parcel");
    expect(orderTypeOf(findTransition("open_for_offers", "select_offer")!)).toBe("parcel");
    expect(orderTypeOf(findTransition("open_for_offers", "expire")!)).toBe("parcel");
    expect(orderTypeOf(findTransition("assigned", "cancel_rider")!)).toBe("parcel");
    expect(appliesToOrderType(findTransition(INITIAL, "create")!, "merchant")).toBe(false);
  });

  it("the class-b rider CAS / cancel / undelivered / delivery edges apply to both order types", () => {
    for (const [from, event] of [
      ["assigned", "confirmed"],
      ["confirmed", "en_route_pickup"],
      ["picked_up", "en_route_dropoff"],
      ["en_route_dropoff", "confirm_delivery"],
      ["delivered", "rate"],
      ["delivered", "auto_close"],
      ["picked_up", "mark_undelivered"],
      ["en_route_dropoff", "mark_undelivered"],
      ["open_for_offers", "cancel_customer"],
      ["picked_up", "cancel_customer"],
    ] as const) {
      const t = findTransition(from, event)!;
      expect(t, `${from}/${event} should exist`).toBeDefined();
      expect(orderTypeOf(t)).toBe("both");
      expect(appliesToOrderType(t, "parcel")).toBe(true);
      expect(appliesToOrderType(t, "merchant")).toBe(true);
    }
  });

  it("parcel's codeless picked_up and merchant's code-gated confirm_pickup are distinct edges, same (from,to)", () => {
    const parcelPickup = findTransition("en_route_pickup", "picked_up")!;
    const merchantPickup = findTransition("en_route_pickup", "confirm_pickup")!;
    expect(parcelPickup.to).toBe("picked_up");
    expect(merchantPickup.to).toBe("picked_up");
    expect(orderTypeOf(parcelPickup)).toBe("parcel");
    expect(orderTypeOf(merchantPickup)).toBe("merchant");
  });

  it("a merchant order is born at `requested`, never `open_for_offers`", () => {
    const place = findTransition(INITIAL, "place")!;
    expect(place.to).toBe("requested");
    expect(orderTypeOf(place)).toBe("merchant");
  });

  it("every merchant terminal exit lands at the shared `cancelled` state — no new OrderStatus values", () => {
    for (const event of [
      "reject",
      "expire_accept",
      "decline_items",
      "expire_item_approval",
      "cancel_unpaid",
      "release_unpaid",
      "expire_end_of_day",
    ] as const) {
      const t = findTransition("requested", event)!;
      expect(t, `requested/${event} should exist`).toBeDefined();
      expect(t.to).toBe("cancelled");
      expect(orderTypeOf(t)).toBe("merchant");
    }
  });
});

describe("C2 — MERCHANT_PHASE_TRANSITIONS (the parallel kitchen-side table)", () => {
  it("every `to` phase is a real MerchantPhaseState", () => {
    const phaseSet = new Set<string>(MERCHANT_PHASES);
    for (const t of MERCHANT_PHASE_TRANSITIONS) {
      for (const to of t.to) expect(phaseSet.has(to)).toBe(true);
    }
  });

  it("every (from,event) pair is unique", () => {
    const seen = new Set<string>();
    for (const t of MERCHANT_PHASE_TRANSITIONS) {
      const key = `${t.from}::${t.event}`;
      expect(seen.has(key), `duplicate merchant-phase transition ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("walks the full pre-dispatch happy path for a WALLET order", () => {
    expect(findMerchantPhaseTransition(INITIAL, "place")?.to).toEqual(["awaiting_accept"]);
    expect(findMerchantPhaseTransition("awaiting_accept", "accept_full")?.to).toContain("awaiting_payment");
    expect(findMerchantPhaseTransition("awaiting_payment", "confirm_payment")?.to).toEqual(["preparing"]);
    expect(findMerchantPhaseTransition("preparing", "mark_ready")?.to).toEqual(["ready_for_pickup"]);
  });

  it("walks the full pre-dispatch happy path for a CASH order (skips awaiting_payment)", () => {
    expect(findMerchantPhaseTransition("awaiting_accept", "accept_full")?.to).toContain("preparing");
    expect(findMerchantPhaseTransition("preparing", "mark_ready")?.to).toEqual(["ready_for_pickup"]);
  });

  it("item-level accept routes through the 60s customer-approval phase before payment/prep", () => {
    expect(findMerchantPhaseTransition("awaiting_accept", "accept_partial")?.to).toEqual(["awaiting_item_approval"]);
    const approved = findMerchantPhaseTransition("awaiting_item_approval", "approve_items");
    expect(approved?.to).toContain("preparing");
    expect(approved?.to).toContain("awaiting_payment");
  });

  it("has no outgoing edge from ready_for_pickup — the hand-off to C3's dispatch is not this table's job", () => {
    expect(MERCHANT_PHASE_TRANSITIONS.some((t) => t.from === "ready_for_pickup")).toBe(false);
  });
});
