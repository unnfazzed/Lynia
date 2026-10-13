import { money } from "../lib/format";

/**
 * The Orders list's Fare column (admin console v2 §6): a parcel's agreed (else proposed) fare; a food order's
 * delivery fee, the biker's fare and the commission basis — never its agreedFare, which is the customer's
 * food + delivery total. "—" when an older API sends no delivery fee.
 */
export function orderFare(o: { orderType: string; agreedFare: string | null; proposedFare: string; deliveryFee?: string | null }): string {
  if (o.orderType === "merchant") return o.deliveryFee != null ? money(o.deliveryFee) : "—";
  return money(o.agreedFare ?? o.proposedFare);
}
