/**
 * Contracts: the rider prepaid commission wallet. Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Rider prepaid commission wallet (docs/archive/plans/2026-rider-wallet-design.md)
// ---------------------------------------------------------------------------
// A prepaid float a rider tops up; each completed ride debits `perRideCommission(agreedFare)` from it.
// Ships inert at ratePct 0 (no debits, wallet hidden). Money values on the wire are plain JS numbers
// (the API converts its Decimal columns to numbers before serialising) so `formatMoney` renders them
// directly; every amount is 2dp USD.

/** Payment rail for a top-up. Mobile-money rails push a USSD prompt to the rider's phone; `manual`
 *  is an ops-recorded credit (rider paid Lynia's merchant line off-app) — the launch rail for
 *  InnBucks/O'mari and the fallback for EcoCash. */
export const TopupRail = z.enum(["ecocash", "innbucks", "omari", "manual"]);
export type TopupRail = z.infer<typeof TopupRail>;

/** A single ledger entry type. Credits are positive, debits negative (see WalletEntry.amount).
 *  `reversal` is reserved (no writer in the wallet-core build) — fare-adjusts append an `adjustment`. */
export const WalletEntryType = z.enum(["commission", "topup", "grace", "adjustment", "reversal"]);
export type WalletEntryType = z.infer<typeof WalletEntryType>;

/** A pending/terminal top-up intent. `pending` waits on the rail prompt; the rest are terminal. */
export const TopupStatus = z.enum(["pending", "succeeded", "declined", "expired"]);
export type TopupStatus = z.infer<typeof TopupStatus>;

/** Top-up window: the rail prompt sits on the rider's phone this long before the intent expires. */
export const TOPUP_WINDOW_MS = 90_000;

/**
 * `GET /wallet/config` — the commission rate + policy the whole wallet UI reads (design decision 2A:
 * server-authoritative). `ratePct` is the resolved live rate (the env "flip" value, not the bundled
 * constant) — all client-side money maths read it, never a hardcoded percentage. `floor` = the
 * go-online balance floor; `graceCredit` = the flip starting credit.
 */
export const CommissionConfig = z
  .object({
    ratePct: z.number().min(0).max(100),
    floor: z.number().nonnegative(),
    graceCredit: z.number().nonnegative(),
    minTopUp: z.number().positive(),
    maxTopUp: z.number().positive(),
    /** D-70: commission-free first jobs a new rider gets (Calm Mint v2 R1/R3). Optional — older servers omit it. */
    freeFirstJobs: z.number().int().nonnegative().optional(),
    /** Paynow top-ups: the transaction fee (%) the biker pays on top of a top-up. Optional — older servers omit it. */
    topupFeePct: z.number().min(0).max(100).optional(),
    /** The rails a biker can top up on now; the provider step shows the rest as "Coming soon". Optional — older servers omit it. */
    topupRails: z.array(z.enum(["ecocash", "innbucks", "omari"])).optional(),
  })
  .strict();
export type CommissionConfig = z.infer<typeof CommissionConfig>;

/** `GET /wallet` — the prepaid balance. `balance` may be negative (a debit that crossed zero is owed,
 *  netted by the next top-up — design Premise 3). `updatedAt` backs the offline "as of…" stale label. */
export const Wallet = z
  .object({
    balance: z.number(),
    currency: z.literal("USD"),
    updatedAt: z.string(),
  })
  .strict();
export type Wallet = z.infer<typeof Wallet>;

/** One rider-visible ledger row — a checkable receipt. A `commission` debit carries the `orderId` it
 *  came from and the `ratePct` + `fare` it was charged at, so a rider can reconcile any deduction
 *  ("−$0.30 · 10% of $3.00 · delivery to Avondale") without contacting support. Credits carry rail + ref. */
export const WalletEntry = z
  .object({
    id: z.string(),
    type: WalletEntryType,
    /** Signed: debit negative, credit positive. */
    amount: z.number(),
    /** Balance immediately after this entry — lets the ledger render a running total. */
    balanceAfter: z.number(),
    title: z.string(),
    meta: z.string(),
    /** The rate a `commission` debit was charged at (design OV-2A: stored per row), else absent. */
    ratePct: z.number().optional(),
    /** The basis a `commission` debit was billed on — the ride's agreed fare, or the WD-012 floor when it
     *  bites (LC-B-SIB-3) — so `meta`'s "rate% of $fare" always multiplies out to `amount`. */
    fare: z.number().optional(),
    orderId: z.string().optional(),
    rail: TopupRail.optional(),
    ref: z.string().optional(),
    createdAt: z.string(),
  })
  .strict();
export type WalletEntry = z.infer<typeof WalletEntry>;

/** `GET /wallet/ledger?cursor=` — reverse-chronological page of entries + an opaque next cursor. */
export const WalletLedgerPage = z
  .object({
    entries: z.array(WalletEntry),
    nextCursor: z.string().optional(),
  })
  .strict();
export type WalletLedgerPage = z.infer<typeof WalletLedgerPage>;

/** A top-up intent as returned by the top-up endpoints. `expiresAt` drives the 90s wait ring. */
export const Topup = z
  .object({
    id: z.string(),
    status: TopupStatus,
    amount: z.number(),
    rail: TopupRail,
    phone: z.string(),
    expiresAt: z.string(),
    createdAt: z.string(),
    /** What the biker is charged: `amount` plus the transaction fee. The rail's own figure once it reports one.
     *  Optional — older servers omit it. */
    charged: z.number().optional(),
  })
  .strict();
export type Topup = z.infer<typeof Topup>;

/** `POST /wallet/topups` body. Amount is clamped server-side to [minTopUp, maxTopUp]; `rail` is a
 *  self-serve mobile-money rail (never `manual` — that path is the admin console). Phone is the number
 *  the rail prompt is pushed to (pre-filled with the rider's registered line, editable). */
export const CreateTopupRequest = z
  .object({
    amount: z.number().positive().multipleOf(0.01),
    rail: z.enum(["ecocash", "innbucks", "omari"]),
    phone: z.string().min(6).max(20),
    // BH-09: client-generated, one per top-up attempt (mirrors CreateOrderRequest.idempotencyKey). A
    // client-side timeout+retry replays the same key; the server dedupes on (riderId, idempotencyKey)
    // and returns the original pending intent instead of opening a second one for the same attempt.
    // Optional for back-compat with old clients, who keep the prior no-dedupe behavior.
    idempotencyKey: z.string().uuid().optional(),
  })
  .strict();
export type CreateTopupRequest = z.infer<typeof CreateTopupRequest>;
