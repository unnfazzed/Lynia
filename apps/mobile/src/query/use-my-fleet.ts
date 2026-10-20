import type { MyFleetResponse } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { getFleetMoney, getMyFleet } from "../api/fleet";

/**
 * Own bikers (ledger D-117, live for every business since 2026-10-20): the fleet this biker rides for and the invites
 * to their number (`GET /fleet/me`). `null` until it answers, or when the read fails: the board stays the public one
 * (a failed read never hides a fleet biker's jobs for long — it re-reads every minute and on focus).
 */
export function useMyFleet(enabled = true): {
  fleet: MyFleetResponse["fleet"];
  invites: MyFleetResponse["invites"];
  /** Settled: an answer or a failed read. */
  loaded: boolean;
  /** The server actually answered: only then does "no fleet" mean the biker has none. */
  answered: boolean;
} {
  const q = useQuery({ queryKey: ["myFleet"], queryFn: getMyFleet, enabled, staleTime: 30_000, refetchInterval: 60_000 });
  return { fleet: q.data?.fleet ?? null, invites: q.data?.invites ?? [], loaded: q.data != null || q.isError, answered: q.data != null };
}

/**
 * OB-R10 (D-117): the cash an own biker holds for the shop and its history (`GET /fleet/money`). Re-read every
 * minute, every 20 s while failing (rider screens retry by themselves).
 */
export function useFleetMoney() {
  return useQuery({ queryKey: ["fleetMoney"], queryFn: getFleetMoney, refetchInterval: (query) => (query.state.status === "error" ? 20_000 : 60_000) });
}
