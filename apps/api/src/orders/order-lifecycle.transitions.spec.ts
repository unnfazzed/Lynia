import { describe, expect, it } from "vitest";
import {
  eventsFor,
  findTransition,
  INITIAL,
  isLegalTransition,
  isTerminalState,
  nextState,
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

  it("records the diagram-vs-code divergence: `requested` is defined but never entered by the code", () => {
    // ARCHITECTURE.md §7 shows a `requested` node, but create() mints orders directly at
    // open_for_offers — so `requested` is never a `to`. Pinned so a future writer of `requested`
    // (or a diagram edit) is a deliberate, reviewed change.
    expect(TRANSITIONS.some((t) => t.to === "requested")).toBe(false);
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
