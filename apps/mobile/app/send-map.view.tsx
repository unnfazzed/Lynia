// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.home_empty#map.
// Source mock: packages/design/explorations/journey/screens.jsx :: Home :: region map
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.home_empty#map
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/send.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { ComposeMap, type PickedPoint, type ActiveSlot } from "../src/ui";

export type SendMapViewProps = {
  pickup: PickedPoint | null;
  drop: PickedPoint | null;
  active: ActiveSlot;
  onChangePickup: (p: PickedPoint) => void;
  onChangeDrop: (p: PickedPoint) => void;
  onReverseGeocodePickup?: (landmark: string) => void;
  onReverseGeocodeDrop?: (landmark: string) => void;
  topOffset?: number;
};

export function SendMapView(props: SendMapViewProps): React.ReactElement {
  return <ComposeMap {...props} />;
}
