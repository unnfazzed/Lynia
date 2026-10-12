import { MERCHANT_REASON_NOTE_MAX } from "@lynia/shared";

/**
 * Customer brief 07 (U66, ledger D-97, D3g): the venue's own words on a rejection, for the customer's
 * "couldn't take your order" ending. Only a cancelled order the venue turned down with "Something else"
 * (`other`) carries one — the other reasons are already the customer's copy (D-11), and `cancelReason` is
 * also where a customer's / ops' cancel reason lives, so it is never read for anything else.
 *
 * Plain text: trimmed, markup and links taken out, whitespace collapsed, at most MERCHANT_REASON_NOTE_MAX
 * characters (the request DTO already caps it; this guards rows written before it). Empty → null.
 */
export function venueNoteOf(order: { status: string; rejectionReason: string | null; cancelReason: string | null }): string | null {
  if (order.status !== "cancelled" || order.rejectionReason !== "other" || !order.cancelReason) return null;
  const plain = order.cancelReason
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.length > MERCHANT_REASON_NOTE_MAX ? plain.slice(0, MERCHANT_REASON_NOTE_MAX).trimEnd() : plain;
}
