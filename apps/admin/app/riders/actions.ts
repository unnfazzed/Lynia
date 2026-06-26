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
