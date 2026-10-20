import type { MyFleetResponse } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { getFleetMoney, getMyFleet } from "../api/fleet";
import { useOrderFlags } from "../net/use-order-flags";

/**
 * Own bikers (ledger D-117): the fleet this biker rides for and the invites to their number (`GET /fleet/me`),
 * asked only while the server says Own bikers is live (`fleetLive`). `null` until then, or when the read
 * fails: the board stays the public one (a failed read never hides a fleet biker's jobs for long — it re-reads
 * every minute and on focus).
 */
export function useMyFleet(enabled = true): {
  fleet: MyFleetResponse["fleet"];
  invites: MyFleetResponse["invites"];
  /** Settled: an answer, a failed read, or Own bikers not live. */
  loaded: boolean;
  /** The server actually answered (Own bikers live): only then does "no fleet" mean the biker has none. */
  answered: boolean;
} {
  const { fleetLive } = useOrderFlags();
  const q = useQuery({ queryKey: ["myFleet"], queryFn: getMyFleet, enabled: enabled && !!fleetLive, staleTime: 30_000, refetchInterval: 60_000 });
  return { fleet: q.data?.fleet ?? null, invites: q.data?.invites ?? [], loaded: !fleetLive || q.data != null || q.isError, answered: !!fleetLive && q.data != null };
}

/**
 * OB-R10 (D-117): the cash an own biker holds for the shop and its history (`GET /fleet/money`). Re-read every
 * minute, every 20 s while failing (rider screens retry by themselves).
 */
export function useFleetMoney() {
  return useQuery({ queryKey: ["fleetMoney"], queryFn: getFleetMoney, refetchInterval: (query) => (query.state.status === "error" ? 20_000 : 60_000) });
}
