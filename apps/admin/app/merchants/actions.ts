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
