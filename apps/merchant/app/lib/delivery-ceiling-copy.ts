/**
 * Delivery ceiling v1, merchant side (ledger D-125): `packages/design/handoff/delivery-ceiling-v1/code/copy.ts`'s
 * `DC.m`, verbatim except that "rider" reads "biker" (D-101; `delivery-ceiling.test.ts` checks it against
 * `bikerWording`). `{x}` is a runtime value, filled with `fill`.
 */
export const DCM = {
  holdT: "No biker yet",
  holdSub: "Bikers are offered {o}. Nobody has taken it so far.",
  topT: "Add to the offer from your cash",
  topSub: "You pay it. {c}’s price doesn’t change.",
  topUps: ["+$0.50", "+$1", "+$2"],
  topOffer: "Offer {o}",
  topAria: "Add {t}",
  keep: "Keep searching",
  cancel: "Cancel order",
  askIn: "We’ll ask {c} to raise in {t}.",
  sentToast: "Offer raised to {o}. Finding a biker.",
  finding: "Finding a biker",
  offered: "Offered {o} · includes your {t}",
  cashGoods: "Goods",
  cashTop: "Biker top-up",
  cashBack: "Cash back",
  boardT: "#{id} · No biker yet",
  boardSub: "Offered {o} · we ask {c} in {t}",
  boardBtn: "Top up",
  moneySub: "Delivered · biker top-up −{t}",
  moneyKpi: "{n} orders · {s} sales · biker top-ups −{t}",
} as const;

/** "{x}" → value. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
