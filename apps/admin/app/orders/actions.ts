"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/**
 * Admin order mutations (item 1). Each is the domain half of a <ConfirmModal> confirm — the audit-log
 * row is already written by submitAdminAction, so these hit the real endpoint and revalidate. A failed
 * write throws rather than silently no-opping; the modal triggers are disabled off the connected path,
 * so these only fire against a live API. Bodies carry the audit envelope `{ action, target, reasonCode,
 * note }` the endpoints accept, plus the mutation-specific field.
 */
export async function cancelOrder(id: string, reasonCode: string | null, note: string): Promise<void> {
  const ok = await adminPost(`/admin/orders/${id}/cancel`, {
    action: "order.cancel",
    target: id,
    reasonCode,
    note: note || null,
  });
  if (!ok) throw new Error(`Failed to cancel order ${id} (check API_BASE_URL / admin token).`);
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
}

export async function adjustFare(
  id: string,
  newFare: string,
  reasonCode: string | null,
  note: string,
): Promise<void> {
  const ok = await adminPost(`/admin/orders/${id}/fare`, {
    action: "order.adjust_fare",
    target: id,
    reasonCode,
    note: note || null,
    newFare,
  });
  if (!ok) throw new Error(`Failed to adjust fare for order ${id} (check API_BASE_URL / admin token).`);
  revalidatePath(`/orders/${id}`);
}
