"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * X1: R-05 admin dispute resolution — `POST /admin/orders/:id/resolve-handshake`. The domain half of
 * a <ConfirmModal> confirm (the endpoint writes the audit row in the SAME transaction, A-01, so the
 * modal sets `auditInEndpoint`). Mirrors `mutateCustomer`/`mutateRider`'s shape exactly.
 */
export async function resolveHandshake(orderId: string, reasonCode: string | null, note: string): Promise<void> {
  const res = await adminPostResult(`/admin/orders/${orderId}/resolve-handshake`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to resolve handshake for order ${orderId}: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/merchants/disputes");
}

/**
 * Merchant web upgrade L1: the go-live switch — `POST /admin/merchants/:id/pilot`, the only writer of
 * `pilotEnabled`. The endpoint writes the `merchant.go_live` / `merchant.go_dormant` audit row in the
 * SAME transaction (A-01), so the modal sets `auditInEndpoint`. The endpoint takes no reason field, so
 * the picked reason leads the audit note.
 *
 * Returns the failure instead of throwing it: Next redacts a server action's thrown message in
 * production, and ops needs the API's own words for a refusal ("This restaurant has no dish with a
 * photo yet"). The button re-throws it client-side, where the modal shows it.
 */
export async function setMerchantPilot(
  merchantId: string,
  enabled: boolean,
  reasonCode: string | null,
  note: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auditNote = [reasonCode, note.trim()].filter(Boolean).join(" — ");
  const res = await adminPostResult(`/admin/merchants/${merchantId}/pilot`, { enabled, note: auditNote || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  return { ok: true };
}

/**
 * Merchant web upgrade L4: support hands a business to another person — `POST /admin/merchants/:id/owner`,
 * after an identity check by call or visit plus ID (docs/MERCHANT-GO-LIVE-RUNBOOK.md §8). The endpoint
 * writes the `merchant.owner_transfer` audit row in the SAME transaction (A-01), so the modal sets
 * `auditInEndpoint`; the picked reason leads the required note. Returns the failure rather than throwing
 * it, for the same reason as `setMerchantPilot`: ops needs the API's own words ("That number works at
 * another business").
 */
export async function transferMerchantOwner(
  merchantId: string,
  phone: string,
  reasonCode: string | null,
  note: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auditNote = [reasonCode, note.trim()].filter(Boolean).join(" — ");
  const res = await adminPostResult(`/admin/merchants/${merchantId}/owner`, { phone: phone.trim(), note: auditNote });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true };
}

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): how a restaurant takes orders, set by
 * ops on its behalf — `POST /admin/merchants/:id/order-settings`. The endpoint writes the
 * `merchant.order_settings` audit row in the SAME transaction (A-01), so the modal sets
 * `auditInEndpoint`. Returns the failure rather than throwing it (see `setMerchantPilot`).
 */
export async function setMerchantOrderSettings(
  merchantId: string,
  settings: { autoAccept?: boolean; showPhoneToCustomers?: boolean; freeDelivery?: boolean },
  reasonCode: string | null,
  note: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auditNote = [reasonCode, note.trim()].filter(Boolean).join(" — ");
  const res = await adminPostResult(`/admin/merchants/${merchantId}/order-settings`, { ...settings, note: auditNote || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true };
}
