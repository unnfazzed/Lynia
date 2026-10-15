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

/**
 * Every fare is a whole number of 50 cents (owner, 2026-10-15): the suggestion, what the customer names,
 * a raise or resend, a biker's counter and an admin's correction. Cash only, so nobody hands over 42c.
 */
export const FARE_UNIT_USD = 0.5;
const FARE_UNIT_CENTS = 50;

/** A fare to the nearest 50c (half rounds up, like the restaurant delivery fee), never below 50c. */
export function roundFare(usd: number): number {
  if (!Number.isFinite(usd)) return FARE_UNIT_USD;
  const units = Math.round(toCents(usd) / FARE_UNIT_CENTS);
  return fromCents(Math.max(1, units) * FARE_UNIT_CENTS);
}

/** Whether a fare already sits on the 50c grid. */
export function isFareUnit(usd: number): boolean {
  return Number.isFinite(usd) && toCents(usd) % FARE_UNIT_CENTS === 0;
}

/**
 * − / + on a fare: to the next 50c in that direction ($3.42 → $3.50 / $3.00; $3.50 → $4.00 / $3.00),
 * never below `min`. An off-grid fare (an order from before the rule) snaps onto the grid on the first tap.
 */
export function stepFare(usd: number, dir: 1 | -1, min: number = FARE_UNIT_USD): number {
  const cents = Number.isFinite(usd) ? toCents(usd) : 0;
  const units = dir > 0 ? Math.floor(cents / FARE_UNIT_CENTS) + 1 : Math.ceil(cents / FARE_UNIT_CENTS) - 1;
  return Math.max(min, fromCents(units * FARE_UNIT_CENTS));
}
