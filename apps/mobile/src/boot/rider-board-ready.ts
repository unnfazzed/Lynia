import type { Query, QueryClient } from "@tanstack/react-query";
import { reportBootReady } from "./boot-readiness";

/**
 * The rider splash's step 2, "Getting jobs near you" (First Run v2 H1, ledger D-82 §2 #2). The splash
 * holds the navigator off-screen while the rider board mounts underneath it, so the honest signal is the
 * board's own first reads: `["me"]` (who the rider is, KYC state) and `["activeJob"]` (a job in hand).
 * Read off the shared query cache, so the board needs no splash wiring of its own.
 *
 * A query counts as settled once it has data or an error, OR when the board mounted it disabled (an
 * unverified rider's board never reads `activeJob`: it sits pending + idle with an observer). A query the
 * board has not created yet is not settled.
 */
export const RIDER_BOARD_KEYS = [["me"], ["activeJob"]] as const;

export function querySettled(q: Pick<Query, "state" | "getObserversCount"> | undefined): boolean {
  if (!q) return false;
  if (q.state.status !== "pending") return true;
  return q.state.fetchStatus === "idle" && q.getObserversCount() > 0;
}

/** Stamps the `rider` boot signal the moment both reads have settled. Returns an unsubscribe. */
export function watchRiderBoardReady(client: QueryClient, report: () => void = () => reportBootReady("rider")): () => void {
  const cache = client.getQueryCache();
  let done = false;
  const check = (): void => {
    if (done) return;
    if (RIDER_BOARD_KEYS.every((key) => querySettled(cache.find({ queryKey: key, exact: true })))) {
      done = true;
      report();
    }
  };
  const unsubscribe = cache.subscribe(check);
  check();
  return () => {
    done = true;
    unsubscribe();
  };
}
