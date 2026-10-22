"use server";

import { revalidatePath } from "next/cache";
import { adminPostJson, adminPostResult, describeAdminPostFailure } from "../lib/api";

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

/** The shop-front fields ops can change for a business (admin assist): the owner's own `PATCH /merchant/profile`
 *  fields. A field left out stays as it is; `null` removes a photo or the price level. */
export interface ShopFrontChanges {
  name?: string;
  description?: string;
  cuisineTags?: string[];
  priceLevel?: number | null;
  removeLogo?: boolean;
  removeCover?: boolean;
}

/** A photo PUT straight to storage, from this server: the media store's CORS only admits the merchant and
 *  customer web apps, and the browser never holds the admin token. */
const PHOTO_PUT_TIMEOUT_MS = 30_000;

async function uploadShopFrontPhoto(merchantId: string, photo: File): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  const minted = await adminPostJson<{ uploadUrl: string; key: string; headers: Record<string, string> }>(`/admin/merchants/${merchantId}/shop-front/photo`, {
    contentType: "image/jpeg",
  });
  if (!minted.ok) return { ok: false, message: describeAdminPostFailure(minted) };
  try {
    const res = await fetch(minted.data.uploadUrl, {
      method: "PUT",
      headers: minted.data.headers,
      body: Buffer.from(await photo.arrayBuffer()),
      signal: AbortSignal.timeout(PHOTO_PUT_TIMEOUT_MS),
    });
    // The upload URL is create-only: 409 means the bytes already landed (as on the merchant web, E13).
    if (!res.ok && res.status !== 409) return { ok: false, message: `The photo didn't upload (${res.status}). Try again.` };
  } catch {
    return { ok: false, message: "The photo didn't upload. Try again." };
  }
  return { ok: true, key: minted.data.key };
}

/**
 * Admin assist: change a business's shop front on its behalf — `POST /admin/merchants/:id/shop-front`. The
 * domain half of a <ConfirmModal> confirm; the endpoint writes the audit row with the change (A-01), so the
 * modal sets `auditInEndpoint`. A new logo/cover arrives already compressed (≤250 KB JPEG) in `form` as
 * `logo`/`cover`; each is uploaded here first and its key sent with the rest.
 */
export async function saveMerchantShopFront(
  merchantId: string,
  changes: ShopFrontChanges,
  form: FormData,
  reasonCode: string | null,
  note: string,
): Promise<ActionResult> {
  const { removeLogo, removeCover, ...fields } = changes;
  const body: Record<string, unknown> = { ...fields, reasonCode, ...(note.trim() ? { note: note.trim() } : {}) };
  for (const [field, name, remove] of [["logoUrl", "logo", removeLogo], ["coverPhotoUrl", "cover", removeCover]] as const) {
    const photo = form.get(name);
    if (photo instanceof File && photo.size > 0) {
      const up = await uploadShopFrontPhoto(merchantId, photo);
      if (!up.ok) return up;
      body[field] = up.key;
    } else if (remove) {
      body[field] = null;
    }
  }
  const res = await adminPostResult(`/admin/merchants/${merchantId}/shop-front`, body);
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true };
}
