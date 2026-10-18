"use server";

import { revalidatePath } from "next/cache";
import { adminPostJson, adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * Biker referrals (D-112). Both endpoints write what they need themselves (the modals set `auditInEndpoint`) and
 * THROW on a refusal, so the dialog stays open with the API's words.
 */
export async function markReferralPaid(referralId: string, amount: string, note: string): Promise<void> {
  if (!referralId) throw new Error("No referral — reload the page.");
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter the amount you paid.");
  const res = await adminPostResult(`/admin/referrals/${referralId}/paid`, { amount: Math.round(value * 100) / 100, note: note || null });
  if (!res.ok) throw new Error(`Couldn't mark it paid: ${describeAdminPostFailure(res)}`);
  revalidatePath("/referrals");
}

/** Mint the biker's share code (or return the one they have). */
export async function createReferralLink(riderId: string): Promise<void> {
  if (!riderId) throw new Error("No biker — reload the page.");
  const res = await adminPostJson<{ code: string; link: string }>(`/admin/riders/${riderId}/referral-code`, {});
  if (!res.ok) throw new Error(`Couldn't create the link: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/riders/${riderId}`);
  revalidatePath("/referrals");
}
