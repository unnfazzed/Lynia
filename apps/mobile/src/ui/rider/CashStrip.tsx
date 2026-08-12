import React from "react";
import { CashHeldStrip } from "./CashHeldStrip";

/**
 * The RJM `CashStrip` (`packages/design/explorations/journey/rider-one-app.jsx` `CashStrip`): the
 * always-visible "yours vs owed to a kitchen" split a rider carries while a job is live. Extracted as a
 * shared DS primitive under this exact name so the mock→RN codegen can render the RJM `active_food`
 * card's `<CashStrip yours owed/>` from ONE tokens-only source of truth — exactly as `TypeTag` was
 * extracted for the offer cards while the board's `JobCard` kept its private copy.
 *
 * Implemented as a thin wrapper over the already-shipped, tokens-only `CashHeldStrip` (the parcel
 * screen, the Money tab and this same food screen's terminal branches render it), so the two never
 * drift and this adoption changes NO pixels — it only gives the codegen a stable, guardrail-lockable
 * component name. Tokens-only by construction (CashHeldStrip is), imported from this OWN module (never
 * the `src/ui` barrel), so the generated view carries no `no-circular` cruiser cycle — emit.mjs
 * NON_BARREL, mirroring `JobCard`/`TypeTag`.
 */
export function CashStrip({ yours, owed }: { yours: number; owed: number }): React.ReactElement {
  return <CashHeldStrip yours={yours} owed={owed} />;
}
