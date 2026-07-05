"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/**
 * A-06 record-payment write. Marks a rider's weekly settlement paid via
 * `POST /admin/cash/settlements/:id/pay`. `method` is the settlement channel picked in the modal
 * (cash at agent / EcoCash / netted) and rides along as the audit `reasonCode`. Called from
 * <RecordPayment>'s <ConfirmModal> onConfirm — which has already written the audit-log row via
 * submitAdminAction — so this is the domain half of the mutation. A failed compliance-relevant write
 * throws rather than failing silently; the trigger is disabled off the connected path so this only
 * fires against a live API.
 */
export async function recordSettlement(id: string, target: string, method: string | null, note: string): Promise<void> {
  const ok = await adminPost(`/admin/cash/settlements/${id}/pay`, {
    action: "cash.settle",
    target,
    reasonCode: method,
    note: note || null,
    method,
  });
  if (!ok) throw new Error(`Failed to record settlement payment for ${id} (check API_BASE_URL / admin token).`);
  revalidatePath("/cash");
}
