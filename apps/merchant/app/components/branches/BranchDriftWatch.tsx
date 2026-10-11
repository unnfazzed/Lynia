"use client";

import { useEffect, useRef } from "react";
import { getMyMerchant } from "../../lib/api-client";
import { driftedBranchId } from "../../lib/branches";
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
 * "Now at {name}" toast. Mounted inside the branch scope, so it starts over for each branch.
 */
export function BranchDriftWatch() {
  const { queue } = useKitchenConnection();
  const business = useBusiness();
  const enterBranch = useEnterBranch();
  const checking = useRef(false);
  const drifted = driftedBranchId(queue.orders, business?.id);

  useEffect(() => {
    if (!drifted || !business || checking.current) return;
    checking.current = true;
    // The shared read may still hold this branch's answer from a moment ago.
    invalidateReads();
    getMyMerchant()
      .then((me) => {
        if (me.id !== business.id) enterBranch(me, `Now at ${me.name}`);
      })
      .catch(() => {})
      .finally(() => {
        checking.current = false;
      });
  }, [drifted, business, enterBranch]);

  return null;
}
