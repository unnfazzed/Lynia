"use client";

import { useEffect, useRef } from "react";
import { getMyMerchant } from "../../lib/api-client";
import { branchEpoch, driftedBranchId } from "../../lib/branches";
import { useBusiness } from "../../lib/business";
import { invalidateReads } from "../../lib/read-cache";
import { useKitchenConnection } from "../KitchenConnectionProvider";
import { useEnterBranch } from "./use-enter-branch";

/**
 * MJ-RM15 (2026-10-07): the branch a person works in is theirs, not the device's — switching on the owner's
 * phone moves the counter tablet's queue to the other branch too. The tablet used to keep the old branch's
 * name while it showed and rang the new branch's orders. When the shell's queue carries another branch's
 * orders, this re-reads `/merchant/me` and, if the server's branch really changed, moves the whole app into
 * it the way a switch from C6 does: re-primed, the queue re-joined, the Orders home and the drawn
 * "Now at {name}" toast. Mounted inside the branch scope, so it starts over for each/** After a failed `/merchant/me` read, the next queue poll may try again after this long, doubling each
 *  time up to {@link DRIFT_RETRY_MAX_MS}. */
export const DRIFT_RETRY_BASE_MS = 5_000;
export const DRIFT_RETRY_MAX_MS = 60_000;

export function BranchDriftWatch() {
  const { queue } = useKitchenConnection();
  const business = useBusiness();
  const enterBranch = useEnterBranch();
  const checking = useRef(false);
  // Review follow-up: a failed read is tried again on a later queue poll (with a backoff), not only when
  // the drifted branch changes — one dropped request used to leave the device on the wrong branch.
  const failures = useRef(0);
  const nextTryAt = useRef(0);
  const drifted = driftedBranchId(queue.orders, business?.id);
  // Unmounted (the branch scope re-keyed, or signed out): a late answer does nothing. A per-run flag
  // would drop the answer whenever the next queue poll re-ran the effect mid-read.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!drifted || !business || checking.current || Date.now() < nextTryAt.current) return;
    checking.current = true;
    // A switch made on this device (C6) bumps the epoch: a late answer must not switch a second time.
    const epochAtStart = branchEpoch();
    // The shared read may still hold this branch's answer from a moment ago.
    invalidateReads();
    getMyMerchant()
      .then((me) => {
        failures.current = 0;
        nextTryAt.current = 0;
        if (!mounted.current || branchEpoch() !== epochAtStart) return;
        if (me.id !== business.id) enterBranch(me, `Now at ${me.name}`);
      })
      .catch(() => {
        failures.current += 1;
        nextTryAt.current = Date.now() + Math.min(DRIFT_RETRY_BASE_MS * 2 ** (failures.current - 1), DRIFT_RETRY_MAX_MS);
      })
      .finally(() => {
        checking.current = false;
      });
    // `queue.orders` changes on every poll: that is the retry tick.
  }, [drifted, business, enterBranch, queue.orders]);

  return null;
}
