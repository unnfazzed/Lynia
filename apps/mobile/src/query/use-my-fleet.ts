import type { MyFleetResponse } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { getMyFleet } from "../api/fleet";
import { useOrderFlags } from "../net/use-order-flags";

/**
 * Own bikers (ledger D-117): the fleet this biker rides for and the invites to their number (`GET /fleet/me`),
 * asked only while the server says Own bikers is live (`fleetLive`). `null` until then, or when the read
 * fails: the board stays the public one (a failed read never hides a fleet biker's jobs for long — it re-reads
 * every minute and on focus).
 */
export function useMyFleet(enabled = true): { fleet: MyFleetResponse["fleet"]; invites: MyFleetResponse["invites"]; loaded: boolean } {
  const { fleetLive } = useOrderFlags();
  const q = useQuery({ queryKey: ["myFleet"], queryFn: getMyFleet, enabled: enabled && !!fleetLive, staleTime: 30_000, refetchInterval: 60_000 });
  return { fleet: q.data?.fleet ?? null, invites: q.data?.invites ?? [], loaded: !fleetLive || q.data != null || q.isError };
}
