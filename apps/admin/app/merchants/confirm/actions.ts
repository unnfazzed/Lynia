"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../../lib/api";

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): the ops call list's writes. Each hits
 * an endpoint that writes its own audit row (A-01) and refreshes the list.
 *
 * Every action RETURNS its failure instead of throwing it, for the same reason as `setMerchantPilot`:
 * Next redacts a server action's thrown message in production, and ops needs the API's own words
 * ("This order is already confirmed or no longer live.").
 */
export type KitchenActionResult = { ok: true } | { ok: false; message: string };

const LIST_PATH = "/merchants/confirm";

async function post(path: string, body: unknown, orderId: string): Promise<KitchenActionResult> {
  const res = await adminPostResult(path, body);
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(LIST_PATH);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/** The restaurant confirmed on the phone: a rider may now be sent. */
export async function confirmKitchenOrder(orderId: string): Promise<KitchenActionResult> {
  return post(`/admin/orders/${orderId}/kitchen-confirm`, {}, orderId);
}

/** Nobody answered at the restaurant: logged on the order so the list shows the attempts. */
export async function logKitchenNoAnswer(orderId: string): Promise<KitchenActionResult> {
  return post(`/admin/orders/${orderId}/kitchen-no-answer`, {}, orderId);
}

/** The items the restaurant and customer agreed by phone: every line's new quantity (0 removes it). */
export async function editKitchenOrderItems(
  orderId: string,
  lines: { itemId: string; quantity: number }[],
): Promise<KitchenActionResult> {
  return post(`/admin/orders/${orderId}/edit-items`, { lines }, orderId);
}

/** "Can't make it": the existing admin cancel (`ReasonRequired = { reason, note? }`). */
export async function cancelKitchenOrder(orderId: string, reasonCode: string | null, note: string): Promise<KitchenActionResult> {
  const res = await post(`/admin/orders/${orderId}/cancel`, { reason: reasonCode ?? "", note: note || null }, orderId);
  if (res.ok) revalidatePath("/orders");
  return res;
}
