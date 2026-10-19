import type { FleetBikerState } from "@lynia/shared";
import { OBM } from "../../lib/own-bikers-copy";
import { Icon } from "../icons";

const STATE_LABEL: Record<FleetBikerState, string> = { on_a_job: OBM.stOnJob, online: OBM.stOnline, offline: OBM.stOffline };

/**
 * Own bikers v1 new part 2 (handoff README "New parts"): the roster state chip, a 24-tall pill with an 8 px dot and
 * a word, so the state reads without colour. On a job: mint wash, mint text. Online: surface, ink. Offline:
 * surface, muted, hollow dot.
 */
export function RosterStateChip({ state }: { state: FleetBikerState }) {
  return (
    <span className="m-ob-chip" data-state={state}>
      <i aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}

/** The cash chip, the state chip's anatomy on `--highlight` with ink text and a banknote: "Cash with them $14.00". */
export function CashChip({ amount, label }: { amount: string; label?: string }) {
  return (
    <span className="m-ob-chip m-ob-cash">
      <Icon name="banknote" size={14} />
      {label ?? OBM.cashWith(amount)}
    </span>
  );
}
