"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/** Approve/decline a rider's KYC from the review queue (the manual T7 backstop). */
export async function setKyc(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!profileId || !(status === "verified" || status === "failed" || status === "pending")) return;

  // Surface a failed compliance write — silently failing-open on a KYC decision is unacceptable.
  const ok = await adminPost(`/admin/riders/${profileId}/kyc`, { status });
  if (!ok) throw new Error(`Failed to set KYC=${status} for rider ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath("/riders");
}

/**
 * A-02 KYC decision write from the doc-review screen. Approve → verified; decline → failed + the
 * reason code (recorded on the rider + audit log) and an attempt increment. A second decline pushes
 * `kycAttempts` to the lock (>= 2) → resubmission is blocked in the api. Called from <KycDecision>'s
 * <ConfirmModal> onConfirm (which has already written the audit-log row via submitAdminAction).
 */
export async function decideKyc(
  profileId: string,
  status: "verified" | "failed",
  reasonCode: string | null,
): Promise<void> {
  const body = status === "failed" ? { status, reasonCode } : { status };
  const ok = await adminPost(`/admin/riders/${profileId}/kyc`, body);
  if (!ok) throw new Error(`Failed to record KYC ${status} for rider ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath(`/riders/${profileId}/kyc`);
  revalidatePath("/riders");
}
