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
 * D3 (2026-10-07, MJ-RH1): the only write-off of a food debt — `POST /admin/orders/:id/write-off-debt`,
 * after support followed up a merchant's non-return report. The endpoint writes the `order.debt_write_off`
 * audit row in the SAME transaction (A-01), so the modal sets `auditInEndpoint`. It does not suspend the
 * rider: that stays the rider console action. Fails closed, like resolveHandshake.
 */
export async function writeOffDebt(orderId: string, reasonCode: string | null, note: string): Promise<void> {
  const res = await adminPostResult(`/admin/orders/${orderId}/write-off-debt`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to write off the debt on order ${orderId}: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/merchants/disputes");
}

type ActionResult = { ok: true } | { ok: false; message: string };

/** The application actions (admin console v2 §5): `POST /admin/merchants/:id/application/:action`. */
export type MerchantApplicationAction = "review" | "approve" | "reject" | "go_live" | "suspend" | "resume";

function revalidateMerchant(merchantId: string) {
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
}

/**
 * Admin console v2 §5: move a merchant's application (start review, approve, reject, go live, suspend,
 * resume). The endpoint writes the audit row (with before/after) and the event in the SAME transaction, so
 * the modal sets `auditInEndpoint`. For reject, `reasonCode` is the merchant-readable code it stores.
 *
 * Returns the failure instead of throwing it: Next redacts a server action's thrown message in production,
 * and ops needs the API's own words for a refusal ("Not every check passes yet: Ops call."). The button
 * re-throws it client-side, where the modal shows it.
 */
export async function moveMerchantApplication(
  merchantId: string,
  action: MerchantApplicationAction,
  reasonCode: string | null,
  note: string,
): Promise<ActionResult> {
  const res = await adminPostResult(`/admin/merchants/${merchantId}/application/${action}`, { reason: reasonCode ?? "", note: note.trim() || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidateMerchant(merchantId);
  return { ok: true };
}

/** Log an ops call to the business (`reached` ticks the checklist's Ops call row). Audited in the endpoint. */
export async function logMerchantCall(merchantId: string, outcome: string | null, note: string): Promise<ActionResult> {
  const res = await adminPostResult(`/admin/merchants/${merchantId}/application/call`, { outcome: outcome ?? "", note: note.trim() || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidateMerchant(merchantId);
  return { ok: true };
}

/** Record a pharmacy's licence after the call (owner decision 5). Audited in the endpoint. */
export async function recordMerchantLicence(
  merchantId: string,
  licence: { licenceNumber: string; pharmacistName: string; reference: string },
  note: string,
): Promise<ActionResult> {
  const res = await adminPostResult(`/admin/merchants/${merchantId}/application/licence`, {
    licenceNumber: licence.licenceNumber.trim(),
    pharmacistName: licence.pharmacistName.trim(),
    reference: licence.reference.trim() || null,
    note: note.trim() || null,
  });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidateMerchant(merchantId);
  return { ok: true };
}

/** Mark the recorded licence verified. Audited in the endpoint. */
export async function verifyMerchantLicence(merchantId: string, reasonCode: string | null, note: string): Promise<ActionResult> {
  const res = await adminPostResult(`/admin/merchants/${merchantId}/application/licence/verify`, { reason: reasonCode ?? "", note: note.trim() || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidateMerchant(merchantId);
  return { ok: true };
}

/**
 * Merchant web upgrade L4: support hands a business to another person — `POST /admin/merchants/:id/owner`,
 * after an identity check by call or visit plus ID (docs/MERCHANT-GO-LIVE-RUNBOOK.md §8). The endpoint
 * writes the `merchant.owner_transfer` audit row in the SAME transaction (A-01), so the modal sets
 * `auditInEndpoint`; the picked reason leads the required note. Returns the failure rather than throwing
 * it, for the same reason as `moveMerchantApplication`: ops needs the API's own words ("That number works at
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
 * `auditInEndpoint`. Returns the failure rather than throwing it (see `moveMerchantApplication`).
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
