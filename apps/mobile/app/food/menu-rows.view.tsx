// GENERATED — do not edit by hand. Structural-parity source of truth for RC.menu#rows.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: menu :: region rows
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.menu#rows
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/[id].tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { Pressable } from "react-native";
import { MenuRow, type MenuRowItem } from "../../src/ui";

/** A menu row's kit-item shape plus the dish `id` the list keys + maps back to. */
export type MenuRowSeed = MenuRowItem & { id: string };
export type MenuRowsViewProps = {
  rows: MenuRowSeed[];
  qtyFor: (i: MenuRowSeed) => number;
  onDishPress: (i: MenuRowSeed) => void;
};

export function MenuRowsView({
  rows,
  qtyFor,
  onDishPress
}: MenuRowsViewProps): React.ReactElement {
  return <>{rows.map(i => <Pressable key={i.id} onPress={() => onDishPress(i)} accessibilityRole="button" disabled={!!i.oos}><MenuRow i={i} qty={qtyFor(i)} /></Pressable>)}</>;
}
