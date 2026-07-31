"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * S·2 customer account-hold mutations — hold / lift via `POST /admin/customers/:id/{hold|lift}`. The
 * domain half of a <ConfirmModal> confirm (the endpoint writes the audit row in the SAME transaction,
 * A-01, so the modal sets `auditInEndpoint` and does NOT also POST a standalone audit row). `action` is
 * the endpoint segment; the body is the ReasonRequired/ReasonOptional shape = { reason, note? } — send
 * `reason` (the reason-code radio), not `reasonCode`, or the write 400s. Hold needs a non-empty reason
 * (the modal enforces it); lift's is optional. Throws on a failed write so a silent fail-open is
 * impossible; only fires against a live API since the triggers are disabled off the connected path.
 */
const CUSTOMER_ACTIONS = ["hold", "lift"] as const;

export async function mutateCustomer(
  profileId: string,
  action: "hold" | "lift",
  reasonCode: string | null,
  note: string,
): Promise<void> {
  // Defense-in-depth: `action` is interpolated into the endpoint path — refuse anything off the known set.
  if (!(CUSTOMER_ACTIONS as readonly string[]).includes(action)) throw new Error(`Unknown customer action: ${action}`);
  const res = await adminPostResult(`/admin/customers/${profileId}/${action}`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to ${action} customer ${profileId}: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/customers/${profileId}`);
  revalidatePath("/customers");
}

/** X1/R-08: lift a food cash-ban — `POST /admin/customers/:id/cash-ban-lift`. Same shape as
 *  mutateCustomer's lift; kept separate since it's a distinct endpoint/audit action, not a hold/lift
 *  standing change. */
export async function liftCashBan(profileId: string, reasonCode: string | null, note: string): Promise<void> {
  const res = await adminPostResult(`/admin/customers/${profileId}/cash-ban-lift`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to lift cash-ban for customer ${profileId}: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/customers/${profileId}`);
  revalidatePath("/customers");
}
