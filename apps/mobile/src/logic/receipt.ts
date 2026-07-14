import { formatMoney } from "./money";

/**
 * A plain-text delivery receipt — the shareable "proof it happened" summary modern delivery apps offer at
 * the end of a trip. Kept as a pure formatter (no React, no Share) so the copy is unit-testable and the
 * card just renders/shares the string. Cash-market honest: it's a record of the agreed fare and the
 * delivery, NOT a payment receipt (money settles offline).
 */

export interface ReceiptInput {
  orderId: string;
  pickupLandmark?: string | null;
  dropoffLandmark?: string | null;
  fare: string | number | null | undefined;
  /** Rider display name, if known (cached identity). */
  riderName?: string | null;
  /** ISO timestamp of the delivery/completion, if known. */
  completedAt?: string | null;
  delivered: boolean;
}

/** Short human date-time like "7 Jul, 14:32"; empty string for a missing/invalid timestamp. */
export function formatReceiptDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date}, ${time}`;
}

/**
 * Build the shareable receipt text. Lines are only included when their data exists, so a receipt with no
 * rider name / no timestamp still reads cleanly. Always ends with the honest "fare settled in cash"
 * disclaimer so a shared receipt is never mistaken for a payment record.
 */
export function buildReceiptText(input: ReceiptInput): string {
  const lines: string[] = ["LyniaGo delivery receipt", ""];
  lines.push(`Order: ${input.orderId.slice(0, 8)}`);
  const route = `${input.pickupLandmark || "Pickup"} → ${input.dropoffLandmark || "Drop-off"}`;
  lines.push(`Route: ${route}`);
  lines.push(`Fare: ${formatMoney(input.fare)}`);
  if (input.riderName && input.riderName.trim().length > 0) lines.push(`Rider: ${input.riderName.trim()}`);
  const when = formatReceiptDate(input.completedAt);
  if (when) lines.push(input.delivered ? `Delivered: ${when}` : `Date: ${when}`);
  lines.push("");
  lines.push("Fare agreed in-app; paid in cash, outside the app. This is a delivery record, not a payment receipt.");
  return lines.join("\n");
}
