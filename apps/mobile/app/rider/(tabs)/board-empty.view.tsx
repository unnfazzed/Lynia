// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.board_empty#empty.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: board_empty :: region empty
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.board_empty#empty
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/(tabs)/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { Card, Button, EmptyState } from "../../../src/ui";

export type RiderBoardEmptyViewProps = {
  /** The flag-honest empty-board copy (parcels-only vs parcels + food-offer) the container
   *  computes — wired as a leaf so the mock's Card+EmptyState STRUCTURE is adopted while the
   *  live copy stays container-owned (structurally invisible; the normalizer drops text). */
  message: string;
  /** The ghost "Refresh" action — the container's `openQ.refetch()`, preserved byte-identical. */
  onRefresh: () => void;
  /** Reflects the open-orders re-fetch in flight (openQ.isFetching). */
  refreshing?: boolean;
};

export function RiderBoardEmptyView({
  message,
  onRefresh,
  refreshing
}: RiderBoardEmptyViewProps): React.ReactElement {
  return <Card style={{
    padding: 16
  }}>
        <EmptyState icon="inbox" title="Nothing in range yet" message={message}>
          <Button label="Refresh" variant="ghost" onPress={onRefresh} loading={refreshing} />
        </EmptyState>
      </Card>;
}
