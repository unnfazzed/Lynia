import React from "react";
import { Text } from "react-native";
import renderer from "react-test-renderer";
import { foodCustomerStepIndex, Stepper } from "../index";

function textOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode).map(String));
}

const EVENTS = [
  { status: "assigned", createdAt: "2026-07-30T09:00:00Z" },
  { status: "confirmed", createdAt: "2026-07-30T09:02:00Z" },
];

describe("Stepper (plan §5 B4 — shared Stepper, per-type step lists)", () => {
  it("defaults to the parcel rider labels when jobType is omitted", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="rider" />);
    const text = textOf(tree);
    expect(text).toContain("Job accepted");
    expect(text).toContain("Items & note confirmed");
    expect(text).toContain("Parcel collected");
  });

  it("renders the parcel rider labels explicitly", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="rider" jobType="parcel" />);
    expect(textOf(tree)).toContain("Parcel collected");
  });

  it("renders distinct food rider labels — dark today (unwired), ready for Lane D5", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="rider" jobType="food" />);
    const text = textOf(tree);
    expect(text).toContain("Job accepted");
    expect(text).toContain("At the restaurant");
    expect(text).toContain("Food collected");
    expect(text).not.toContain("Parcel collected");
  });

  it("defaults to the parcel customer labels when jobType is omitted", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="customer" />);
    expect(textOf(tree)).toContain("Items & note confirmed");
  });

  it("renders distinct food customer labels (D3 — the tracker grammar re-labelled, D-03)", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="customer" jobType="food" />);
    const text = textOf(tree);
    expect(text).toContain("Rider secured");
    expect(text).toContain("Rider at the restaurant");
    expect(text).not.toContain("Items & note confirmed");
  });
});

/**
 * The customer's food tracker used to render the parcel status model, which has no state for the
 * kitchen half — accept → pay → cook all happen while the order is still `requested`. `requested`
 * isn't in STEP_ORDER, so `currentIdx` was -1 and EVERY step drew as "todo": during the most anxious
 * stretch of the journey the tracker showed no progress at all, and the kit's own first two steps
 * ("Order placed", "Restaurant accepted") didn't exist. These pin the kit's seven-step timeline and
 * the merchantPhase-driven resolution.
 */
describe("Stepper — customer food timeline (kit RESTAURANT_STEPS)", () => {
  it("carries the kit's two pre-dispatch steps, which the parcel model has no status for", () => {
    const tree = renderer.create(<Stepper events={[]} currentStatus="requested" view="customer" jobType="food" merchantPhase="preparing" />);
    const text = textOf(tree);
    expect(text).toContain("Order placed");
    expect(text).toContain("Restaurant accepted");
  });

  it("resolves progress from merchantPhase while the order is still `requested` (was: all steps grey)", () => {
    // Kitchen accepted and is cooking → step 1 ("Restaurant accepted") is current, step 0 is done.
    expect(foodCustomerStepIndex("requested", "preparing")).toBe(1);
    expect(foodCustomerStepIndex("requested", "ready_for_pickup")).toBe(1);
    // Not yet accepted (or paid) → still just "Order placed".
    expect(foodCustomerStepIndex("requested", "awaiting_accept")).toBe(0);
    expect(foodCustomerStepIndex("requested", "awaiting_payment")).toBe(0);
    expect(foodCustomerStepIndex("requested", null)).toBe(0);
  });

  it("hands over to the shared dispatch edges once a rider is secured", () => {
    expect(foodCustomerStepIndex("assigned", null)).toBe(2);
    // The kit collapses heading-to / at-the-restaurant into one step.
    expect(foodCustomerStepIndex("confirmed", null)).toBe(3);
    expect(foodCustomerStepIndex("en_route_pickup", null)).toBe(3);
    expect(foodCustomerStepIndex("picked_up", null)).toBe(4);
    expect(foodCustomerStepIndex("en_route_dropoff", null)).toBe(5);
    expect(foodCustomerStepIndex("delivered", null)).toBe(6);
    expect(foodCustomerStepIndex("completed", null)).toBe(6);
  });

  it("marks a step live rather than leaving the whole timeline inert during the kitchen phase", () => {
    const tree = renderer.create(<Stepper events={[]} currentStatus="requested" view="customer" jobType="food" merchantPhase="preparing" />);
    // "now" renders the step index as its node glyph; a done step renders the check. Pin the FULL
    // ordered sequence (TP-08) — a build that marks the wrong step live/done still contains "some ✓"
    // and would slip past a bare `.toContain("✓")`.
    expect(textOf(tree)).toEqual([
      "✓",
      "Order placed",
      "2",
      "Restaurant accepted",
      "3",
      "Rider secured",
      "4",
      "Rider at the restaurant",
      "5",
      "Picked up",
      "6",
      "On the way",
      "7",
      "Delivered",
    ]);
  });

  it("leaves the parcel and rider timelines on the dispatch model untouched", () => {
    const parcel = textOf(renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="customer" jobType="parcel" />));
    expect(parcel).toContain("Items & note confirmed");
    expect(parcel).not.toContain("Order placed");
    const rider = textOf(renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="rider" jobType="food" />));
    expect(rider).toContain("At the restaurant");
    expect(rider).not.toContain("Order placed");
  });
});
