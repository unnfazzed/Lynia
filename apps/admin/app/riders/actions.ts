"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/** Approve/decline a rider's KYC from the review queue (the manual T7 backstop). */
export async function setKyc(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (profileId && (status === "verified" || status === "failed" || status === "pending")) {
    await adminPost(`/admin/riders/${profileId}/kyc`, { status });
    revalidatePath("/riders");
  }
}
