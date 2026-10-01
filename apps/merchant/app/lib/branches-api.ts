import type { CreateMerchantBranchRequest, MerchantBranchesResponse, MerchantProfileResponse } from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Multi-branch owners (PR #999, plan docs/plans/2026-09-30-multi-branch-owners.md). Each branch is its
 * own business; the person works in one at a time, and every other merchant call follows that choice.
 */

export function listBranches(): Promise<MerchantBranchesResponse> {
  return authedFetch<MerchantBranchesResponse>("/merchant/branches");
}

/** Answers with the new branch's `/merchant/me`. The server drops this person's devices from the old
 *  branch's live queue, so the caller re-joins it (`rejoinQueue`). */
export function switchBranch(merchantId: string): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/branches/switch", { method: "POST", body: { merchantId } });
}

/** Owner only. Answers with the new branch's `/merchant/me`; it is already the current branch. */
export function createBranch(body: CreateMerchantBranchRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/branches", { method: "POST", body });
}
