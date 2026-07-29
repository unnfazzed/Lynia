import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { JobCard } from "../JobCard";

/** All Text content of the tree, flattened. */
function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

describe("JobCard (plan §5 B2 — one board, tagged cards)", () => {
  it("renders a PARCEL tag, the route, the note and the formatted fare", () => {
    const tree = renderer.create(
      <JobCard
        jobType="parcel"
        from="Eastgate Mall, CBD"
        to="14 Glenara Ave, Avenues"
        distanceLabel="3.1 km away"
        fare="3"
        note="Documents envelope"
        actionLabel="Make an offer"
        onAction={() => {}}
      />,
    );
    const text = textOf(tree);
    expect(text).toContain("PARCEL");
    expect(text).not.toContain("FOOD");
    expect(text).toContain("Eastgate Mall, CBD");
    expect(text).toContain("14 Glenara Ave, Avenues");
    expect(text).toContain("3.1 km away");
    expect(text).toContain("$3.00"); // formatMoney, not the raw "3"
    expect(text).toContain("Documents envelope");
    expect(text).toContain("Make an offer");
  });

  it("renders a FOOD tag with the same anatomy — only the tag/action differ (identical card anatomy)", () => {
    const tree = renderer.create(
      <JobCard
        jobType="food"
        from="Sadza Republic · Belgravia"
        to="12 Lanark Rd, Belgravia"
        distanceLabel="2.4 km away"
        fare="2.40"
        note="Collect $15.50 for the kitchen"
        actionLabel="Accept this job"
        onAction={() => {}}
      />,
    );
    const text = textOf(tree);
    expect(text).toContain("FOOD");
    expect(text).not.toContain("PARCEL");
    expect(text).toContain("$2.40");
    expect(text).toContain("Accept this job");
  });

  it("fires onAction exactly once per tap, no countdown state of its own (plan decision 2: no countdowns)", () => {
    const onAction = jest.fn();
    const tree = renderer.create(
      <JobCard
        jobType="parcel"
        from="A"
        to="B"
        distanceLabel="1.0 km away"
        fare="1"
        note="x"
        actionLabel="Make an offer"
        onAction={onAction}
      />,
    );
    const button = tree.root.findByProps({ label: "Make an offer" });
    act(() => {
      (button.props as { onPress: () => void }).onPress();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
