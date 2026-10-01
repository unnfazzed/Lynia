"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { MerchantProfileResponse } from "@lynia/shared";
import { clearBusinessCache, primeBusiness } from "../../lib/business";
import { homePath } from "../../lib/booking";
import { bumpBranchEpoch, refreshBranches } from "../../lib/branches";
import { getAlarmController } from "../alarm-singleton";
import { useKitchenConnection } from "../KitchenConnectionProvider";
import { useToast } from "../m/Toast";

/**
 * Moves the whole app into a branch the server has just made current (a switch from C6, or a new branch
 * from C7): every screen re-reads for it (the shell is keyed on the branch epoch), the live queue
 * re-joins for it, and the app lands on its Orders home with the drawn toast (README §2, §4).
 */
export function useEnterBranch(): (business: MerchantProfileResponse, toastMessage: string) => void {
  const router = useRouter();
  const toast = useToast();
  const { rejoinQueue } = useKitchenConnection();
  return useCallback(
    (business, toastMessage) => {
      clearBusinessCache();
      primeBusiness(business);
      // An order ringing for the old branch is not this branch's; the new queue rings for its own.
      getAlarmController().stop();
      rejoinQueue();
      void refreshBranches();
      bumpBranchEpoch();
      router.replace(homePath(business));
      toast(toastMessage);
    },
    [router, toast, rejoinQueue],
  );
}
