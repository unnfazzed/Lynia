import React from "react";
import { Text } from "react-native";
import renderer from "react-test-renderer";
import { Stepper } from "../index";

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
    expect(text).toContain("You're assigned");
    expect(text).toContain("Details confirmed");
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

  it("ignores jobType on the customer view — a customer's food order never renders through this Stepper", () => {
    const tree = renderer.create(<Stepper events={EVENTS} currentStatus="confirmed" view="customer" jobType="food" />);
    expect(textOf(tree)).toContain("Items & note confirmed");
  });
});
