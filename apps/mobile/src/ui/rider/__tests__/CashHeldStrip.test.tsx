import React from "react";
import { Text } from "react-native";
import renderer from "react-test-renderer";
import { CashHeldStrip } from "../CashHeldStrip";

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

describe("CashHeldStrip (plan §5 B3 / RIDER-ONE-APP-PLAN.md decision 6 — never one blended cash figure)", () => {
  it("renders both YOURS and OWED TO A KITCHEN, formatted as money", () => {
    const tree = renderer.create(<CashHeldStrip yours={0} owed={0} />);
    const text = textOf(tree);
    expect(text).toContain("YOURS");
    expect(text).toContain("OWED TO A KITCHEN");
    expect(text).toContain("$0.00");
  });

  it("renders a nonzero owed amount distinctly from yours", () => {
    const tree = renderer.create(<CashHeldStrip yours={2.4} owed={15.5} />);
    const text = textOf(tree);
    expect(text).toContain("$2.40");
    expect(text).toContain("$15.50");
  });
});
