// HAND-MAINTAINED (was codegen output until docs/DESIGN-DEVIATIONS.md D-30).
// Mock of record: packages/design/explorations/journey/rider-one-app.jsx :: board_empty :: region empty
//
// The mock draws `Card( EmptyState( ghost "Refresh" ) )`. The app draws the Card and the EmptyState
// and NOT the Refresh: the owner's 2026-08-16 standing instruction is that there is no manual
// refreshing anywhere — the app notices on its own. That is one drawn node fewer than the mock, so
// this region can no longer be generated (the codegen snapshot asserts view ≡ mock with no escape
// hatch for a deliberately-undrawn node), and `RJM.board_empty` is defer-only in
// tools/parity/codegen/adopted.mjs with the omission recorded as an `undrawn` entry against
// tools/parity/expected/RJM.board_empty.json. Keep the Card wrapper: it is the mock's structure and
// the structural win this region was adopted for in the first place.
//
// Nothing replaces the button. The board re-fetches on its own — `refetchInterval` while the tab is
// focused, `useForegroundRefetch` on app resume, and the board socket — so an empty board fills in
// without the rider being asked to do anything.
import React from "react";
import { Card, EmptyState } from "../../../src/ui";

export type RiderBoardEmptyViewProps = {
  /** The flag-honest empty-board copy (parcels-only vs parcels + food-offer) the container
   *  computes — wired as a leaf so the mock's Card+EmptyState STRUCTURE is kept while the
   *  live copy stays container-owned. */
  message: string;
};

export function RiderBoardEmptyView({ message }: RiderBoardEmptyViewProps): React.ReactElement {
  return (
    <Card style={{ padding: 16 }}>
      <EmptyState icon="inbox" title="Nothing in range yet" message={message} />
    </Card>
  );
}
