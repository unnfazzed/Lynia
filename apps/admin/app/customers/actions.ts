"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/**
 * S·2 customer account-hold mutations — hold / lift via `POST /admin/customers/:id/{hold|lift}`. The
 * domain half of a <ConfirmModal> confirm (the endpoint writes the audit row in the SAME transaction,
 * A-01, so the modal sets `auditInEndpoint` and does NOT also POST a standalone audit row). `action` is
 * the endpoint segment; the body is the ReasonRequired/ReasonOptional shape = { reason, note? } — send
 * `reason` (the reason-code radio), not `reasonCode`, or the write 400s. Hold needs a non-empty reason
 * (the modal enforces it); lift's is optional. Throws on a failed write so a silent fail-open is
 * impossible; only fires against a live API since the triggers are disabled off the connected path.
 */
export async function mutateCustomer(
  profileId: string,
  action: "hold" | "lift",
  reasonCode: string | null,
  note: string,
): Promise<void> {
  const ok = await adminPost(`/admin/customers/${profileId}/${action}`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!ok) throw new Error(`Failed to ${action} customer ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath(`/customers/${profileId}`);
  revalidatePath("/customers");
}
