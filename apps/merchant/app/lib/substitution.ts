import { merchantGoodsForSubtotal, type MerchantOrderItemView, type MerchantOrderResponse, type SubstitutionProposalLine } from "@lynia/shared";

/**
 * Order flow v2's merchant proposer (packages/design/handoff/order-flow-v2 README "Merchant proposer",
 * U1a/U1b/U4a, ledger D-59), kept pure so every rule is unit-tested: what a tapped line becomes, what the
 * order adds up to while the merchant is choosing, and what is sent to `POST …/substitution`.
 */

/** One line's proposal: take it off, or swap it for another item from the venue's own catalogue. */
export type LineChange = { kind: "remove" } | { kind: "swap"; dishId: string; name: string; priceUsd: number };

export type Changes = Readonly<Record<string, LineChange>>;

/** A line the merchant can propose a change for: it has its own id and is still on the order. */
export function changeableLines(order: Pick<MerchantOrderResponse, "items">): (MerchantOrderItemView & { itemId: string })[] {
  return order.items.filter((i): i is MerchantOrderItemView & { itemId: string } => !!i.itemId && i.available !== false);
}

/** BRIEF §8 / Review "If something's out of stock": a customer who chose "Remove it" gets no swaps. */
export function swapsAllowed(order: Pick<MerchantOrderResponse, "outOfStockPref">): boolean {
  return order.outOfStockPref !== "remove";
}

/** The wire lines, in the order's own line order. */
export function proposalLines(order: Pick<MerchantOrderResponse, "items">, changes: Changes): SubstitutionProposalLine[] {
  const out: SubstitutionProposalLine[] = [];
  for (const item of changeableLines(order)) {
    const c = changes[item.itemId];
    if (!c) continue;
    out.push(c.kind === "remove" ? { action: "remove", itemId: item.itemId } : { action: "swap", itemId: item.itemId, dishId: c.dishId });
  }
  return out;
}

/** What the order adds up to, before and with the proposed changes ("$14.60 → $11.60"): a removed line is
 *  gone, a swapped one counts at the replacement's price for the same quantity. MJ-M3: it is the GOODS
 *  total the server will store (`merchantGoodsTotal`) — the items plus the N-15 small-order fee when they
 *  drop below the minimum (`merchantGoodsForSubtotal`, the server's own rule) — so "New total" matches the
 *  cash the merchant later collects. Nothing left reads $0.00 (the server cancels that order). */
export function proposalTotals(order: Pick<MerchantOrderResponse, "items">, changes: Changes): { was: number; now: number } {
  let was = 0;
  let now = 0;
  for (const item of order.items) {
    if (item.available === false) continue;
    const line = item.priceUsd * item.quantity;
    was += line;
    const c = item.itemId ? changes[item.itemId] : undefined;
    if (!c) now += line;
    else if (c.kind === "swap") now += c.priceUsd * item.quantity;
  }
  const goods = (items: number): number => (items > 0 ? merchantGoodsForSubtotal(round2(items)).goodsTotal : 0);
  return { was: goods(was), now: goods(now) };
}

/** U1b: the price difference against the line it replaces — "+$0.10", "−$0.15" or `same`. */
export function priceDiff(from: number, to: number, same: string): string {
  const d = round2(to - from);
  if (d === 0) return same;
  return `${d > 0 ? "+" : "−"}$${Math.abs(d).toFixed(2)}`;
}

/** The swap line under a changed row: "Olivine cooking oil 2L · $5.00 (+$0.20)". */
export function swapLine(c: { name: string; priceUsd: number }, from: number, same: string): string {
  const diff = priceDiff(from, c.priceUsd, same);
  return `${c.name} · $${c.priceUsd.toFixed(2)}${diff === same ? "" : ` (${diff})`}`;
}

/** The order is waiting on the customer's answer to a round (M2). */
export function openRound(order: Pick<MerchantOrderResponse, "substitution">) {
  const s = order.substitution;
  return s && s.status === "open" ? s : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
