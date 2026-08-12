/**
 * RJM.board_empty `empty` region (mock→RN codegen). `RiderBoardEmptyView` is the adopted, structurally-
 * parity view for the rider board's "nothing in range yet" state: the mock's `Card(EmptyState(ghost
 * "Refresh"))`. It carries NO accept/assignment/online-toggle logic — its one action is the ghost
 * "Refresh", the container's `openQ.refetch()` forwarded byte-identical. This pins:
 *   (1) the empty state is wrapped in a Card (the structural WIN over the pre-adoption bare EmptyState);
 *   (2) tapping "Refresh" fires the passed `onRefresh` exactly once (the retry affordance is preserved);
 *   (3) the container-owned message renders (the flag-honest copy the container computes).
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Card } from "../../../../src/ui";
import { RiderBoardEmptyView } from "../board-empty.view";

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

describe("RiderBoardEmptyView (RJM.board_empty empty region)", () => {
  it("wraps the empty state in a Card and renders the container-owned message + ghost Refresh", () => {
    const tree = renderer.create(
      <RiderBoardEmptyView message="You'll see parcels here the moment they're posted near you." onRefresh={() => {}} />,
    );
    // The Card wrapper is the structural adoption (the app previously drew a bare EmptyState).
    expect(tree.root.findAllByType(Card)).toHaveLength(1);

    const text = textOf(tree);
    expect(text).toContain("Nothing in range yet");
    expect(text).toContain("You'll see parcels here the moment they're posted near you.");

    const refresh = tree.root.findAll((n) => n.props.label === "Refresh" && typeof n.props.onPress === "function");
    expect(refresh).toHaveLength(1);
  });

  it("fires onRefresh exactly once when the Refresh action is tapped (the openQ.refetch seam)", () => {
    const onRefresh = jest.fn();
    const tree = renderer.create(<RiderBoardEmptyView message="Nothing yet." onRefresh={onRefresh} />);

    const refresh = tree.root.findAll((n) => n.props.label === "Refresh" && typeof n.props.onPress === "function");
    act(() => {
      (refresh[0]!.props as { onPress: () => void }).onPress();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
