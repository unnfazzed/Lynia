/**
 * The single money-arithmetic seam (roadmap 2.1). All money in Lynia is stored as `Decimal(10,2)`
 * but has historically been *computed* in JS `number` with an ad-hoc `round2 = Math.round(n*100)/100`
 * duplicated across pricing, policy, the wallet, settlements and admin. That is float math on money —
 * safe today only because every site rounds consistently. This module centralises it so:
 *
 *   1. addition/subtraction go through **integer cents** (exact — no `0.1 + 0.2 = 0.30000000000000004`
 *      accumulation error), and
 *   2. the 2dp rounding + percentage formulas live in ONE place, so a future switch to true decimal
 *      arithmetic (Prisma.Decimal / a decimal lib) is a change to this file, not a codebase sweep.
 *
 * BEHAVIOUR-PRESERVING: `roundToCents` and `percentOf` reproduce the exact expressions the code used
 * before (`Math.round(n*100)/100` and `Math.round(amt*(pct/100)*100)/100`), so the pinned golden tests
 * in pricing.test.ts / policy.test.ts stay green to the cent. The half-cent case rounds *up, away from
 * zero* (JS `Math.round`), not banker's — preserved deliberately.
 */

/** Exact integer cents for a dollar amount (2dp). The rounding boundary matches `roundToCents`. */
export function toCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Dollars (2dp float) from integer cents. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Canonical 2dp round for money — the former duplicated `round2`. `Math.round(n*100)/100` exactly. */
export function roundToCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/** Sum money amounts through integer cents so accumulation carries no float error. */
export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((cents, usd) => cents + toCents(usd), 0));
}

/** `a − b` through integer cents (exact). */
export function subMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * `pct` percent of `amount`, rounded to 2dp — the commission/percentage formula. Reproduces the exact
 * former expression `Math.round(amount * (pct / 100) * 100) / 100` so pinned commission goldens are
 * unchanged (the operation order matters at the last ULP; do not "simplify" it).
 */
export function percentOf(amount: number, pct: number): number {
  return Math.round(amount * (pct / 100) * 100) / 100;
}
