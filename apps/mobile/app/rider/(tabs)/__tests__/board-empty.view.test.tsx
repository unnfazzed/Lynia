/**
 * RJM.board_empty `empty` region. `RiderBoardEmptyView` draws the rider board's "nothing in range yet"
 * state as the mock's `Card(EmptyState(…))` MINUS the mock's ghost "Refresh" button, which is undrawn
 * by the owner's standing 2026-08-16 no-manual-refreshing instruction (docs/DESIGN-DEVIATIONS.md D-30).
 * This pins:
 *   (1) the empty state is still wrapped in a Card — the structural win of the original adoption, which
 *       must survive the view becoming hand-maintained;
 *   (2) the container-owned message renders (the flag-honest copy the container computes);
 *   (3) the view offers NO action of any kind — the ABSENCE assertion, and the only one here that can
 *       regress silently. The button was missed by #755's sweep once already (it is labelled plain
 *       "Refresh", not "Refresh status", and lives in its own file), so it is pinned by label AND by
 *       the more general "nothing in this view is pressable".
 */
import React from "react";
import { Text } from "react-native";
import renderer from "react-test-renderer";
import { Card } from "../../../../src/ui";
import { RiderBoardEmptyView } from "../board-empty.view";

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join(" ");
}

describe("RiderBoardEmptyView (RJM.board_empty empty region)", () => {
  it("wraps the empty state in a Card and renders the container-owned message", () => {
    const tree = renderer.create(
      <RiderBoardEmptyView message="You'll see parcels here the moment they're posted near you." />,
    );
    // The Card wrapper is the mock's structure — kept even though the region is no longer codegen-adopted.
    expect(tree.root.findAllByType(Card)).toHaveLength(1);

    const text = textOf(tree);
    expect(text).toContain("Nothing in range yet");
    expect(text).toContain("You'll see parcels here the moment they're posted near you.");
  });

  it("draws no Refresh button — and no pressable action at all (D-30: no manual refreshing)", () => {
    const tree = renderer.create(<RiderBoardEmptyView message="Nothing yet." />);

    expect(textOf(tree)).not.toContain("Refresh");
    expect(tree.root.findAll((n) => n.props.label === "Refresh")).toHaveLength(0);
    // The general form: a future edit that re-adds the affordance under any other label still fails.
    expect(tree.root.findAll((n) => typeof n.props.onPress === "function")).toHaveLength(0);
  });
});
