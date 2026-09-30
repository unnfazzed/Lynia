"use client";

import { AutoRefresh } from "../components/AutoRefresh";

/**
 * Keeps the SOS console live for an operator who staffs the safety desk with the tab left open (the
 * natural way to run it). Without it a newly-raised alert wouldn't appear until a manual reload —
 * contradicting the empty-state promise that alerts "land here the moment they fire". Refreshes every
 * ~35s while the tab is visible (see AutoRefresh). Renders nothing.
 */
export function SosAutoRefresh() {
  return <AutoRefresh intervalMs={35_000} />;
}
