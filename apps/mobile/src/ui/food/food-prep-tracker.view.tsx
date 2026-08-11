// GENERATED — do not edit by hand. Structural-parity source of truth for RC.track_prep#tracker.
// Source mock: packages/design/explorations/restaurants/r-customer-b.jsx :: track_prep :: region tracker
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.track_prep#tracker
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/src/ui/food/FoodOrderPreparingView.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { Stepper } from "../index";

/** The live Stepper seam the container already computes for the seven-step food tracker —
 *  forwarded verbatim into the mock's RTracker sub-tree (RTracker≡Stepper). */
export type FoodOrderTrackerViewProps = {
  events: { status: string; createdAt: string }[];
  currentStatus: string;
  view: "customer" | "rider";
  jobType?: "food" | "parcel";
  merchantPhase?: string | null;
};

export function FoodPrepTrackerView(props: FoodOrderTrackerViewProps): React.ReactElement {
  return <Stepper {...props} />;
}
