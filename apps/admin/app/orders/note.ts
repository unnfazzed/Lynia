import type { CancelledByRole } from "../lib/adminTypes";

/** Who cancelled, as the Note column names them ("rider" reads "biker" app-wide, ledger D-101). */
export const CANCELLED_BY_LABEL: Record<CancelledByRole, string> = {
  customer: "customer",
  rider: "biker",
  merchant: "merchant",
  admin: "admin",
  system: "system",
};

/** Kit's Note column (orders.html) — the one-line "why" beside a row. The only note the list response
 *  carries is the cancellation, rendered in the kit's own shape: "cancelled (customer): change of plans".
 *  A merchant or system cancel often has no free-text reason; a cancelled row still says who cancelled. */
export function orderNote(o: { status: string; cancelledByRole: CancelledByRole | null; cancelReason: string | null }): string {
  const who = o.cancelledByRole ? (CANCELLED_BY_LABEL[o.cancelledByRole] ?? o.cancelledByRole) : null;
  if (!o.cancelReason) return who && o.status === "cancelled" ? `cancelled (${who})` : "—";
  return who ? `cancelled (${who}): ${o.cancelReason}` : `cancelled: ${o.cancelReason}`;
}
