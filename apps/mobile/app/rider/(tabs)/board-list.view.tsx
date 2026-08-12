// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.board#list.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: board :: region list
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.board#list
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/(tabs)/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { JobCard } from "../../../src/ui/rider/JobCard";

/** One board row's data seam — the app `JobCard`'s props verbatim, plus the stable order `id`
 *  the list keys by and the `onAction` the container wires (a parcel card → the offer-compose
 *  seam `chooseOrder`, preserved byte-identical). The mock's `JobCard` composite folds to the
 *  app's `src/ui/rider/JobCard`, which carries the same TypeTag/route/note/action anatomy. */
export type RiderBoardJob = {
  id: string;
  jobType: "parcel" | "food";
  from: string;
  to: string;
  distanceLabel: string;
  fare: string;
  note: string;
  actionLabel: string;
  onAction: () => void;
};
export type RiderBoardListViewProps = {
  jobs: RiderBoardJob[];
};

export function RiderBoardListView({
  jobs
}: RiderBoardListViewProps): React.ReactElement {
  return <>{jobs.map(j => <JobCard key={j.id} {...j} />)}</>;
}
