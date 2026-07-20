import type { TopupRail } from "@lynia/shared";

/**
 * Payment-rail seam (roadmap 2.5). A top-up rail (EcoCash / InnBucks / O'mari) charges the rider's
 * mobile-money line by pushing a USSD/app prompt to their phone, then settles asynchronously. This
 * interface is the vendor-agnostic contract that a live rail client implements — deliberately created
 * BEFORE the live EcoCash HTTP client exists (that is "wallet PR2"), so the rail lands behind a seam
 * from day one rather than being hardwired into wallet.service.ts under time pressure.
 *
 * House precedent: this mirrors the {@link ../../kyc/kyc-vendor.ts KycVendor} vendor seam (interface +
 * DI symbol + stub) and the cloud-portable {@link ../push/push.interface.ts PushAdapter} adapter seam.
 * Follow those when the live client arrives.
 *
 * ── Scope guardrails ─────────────────────────────────────────────────────────────────────────────
 * - This is a pure interface + inert stub. Nothing consumes it yet — {@link ../../wallet/wallet.service.ts
 *   WalletService} still pushes the rail prompt out of band and credits via `creditFromTopup`. Wiring the
 *   real flow to this seam is wallet PR2 (see the pointers on {@link PaymentRail} below).
 * - A circuit breaker / kill-switch on live rail calls is EXPLICITLY OUT OF SCOPE here. That is a
 *   behavior change that lands with the live client, gated by the 3.1 flag pattern — not in this seam.
 * - Raw-payload retention: when the live client maps a vendor response into {@link PaymentRailResult},
 *   it MUST also persist the untouched vendor payload (see {@link PaymentRailResult.raw}) alongside the
 *   mapped domain object, so a mapping bug is reconstructable and ops can reconcile against the rail's
 *   own record. The mapped fields drive money movement; the raw payload is the audit trail.
 */

/**
 * Default per-call deadline for a rail operation, in milliseconds. Every method carries a `timeoutMs`
 * override in its options; when omitted the implementation applies this bound. Documented in the
 * contract (roadmap 2.5: "timeouts on every third-party call") so the live client cannot ship an
 * unbounded call — but the ENFORCEMENT lives in the live client, not the stub.
 */
export const PAYMENT_RAIL_DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The rail's own view of a charge. Bounded, terminal-or-not:
 * - `pending`   — the prompt is on the rider's phone; the charge has not settled yet.
 * - `confirmed` — the rail moved the money (the DB-native term; the wire contract calls this
 *                 `succeeded`, mapped in WalletService.toTopup).
 * - `failed`    — declined, timed out, or errored. Terminal; the rider may retry with a new intent.
 *
 * Note this speaks the RAIL's language, not the wire contract's `TopupStatus` — mapping rail →
 * `TopupStatus` (and rail `confirmed` → DB `confirmed`) is the caller's job (WalletService), keeping
 * this seam free of contract-shape drift.
 */
export type PaymentRailStatus = "pending" | "confirmed" | "failed";

/** Input to {@link PaymentRail.initiate} — the domain shape of a top-up intent, using the wallet's
 *  real money type (plain 2dp USD number) and the real {@link TopupRail} id. */
export interface PaymentRailInitiate {
  /** Our `TopUp` intent id — the idempotency anchor. The rail must be driven such that a replay for the
   *  same `topUpId` never double-charges (mirrors the CAS/unique-`topUpId` guarantees WalletService
   *  already relies on for exactly-once credit). */
  topUpId: string;
  /** Which rail to charge. `manual` is admin-recorded and never flows through here; a live client should
   *  reject it, but the type stays the full {@link TopupRail} so the domain id is not re-narrowed. */
  rail: TopupRail;
  /** Amount to charge, in USD to 2dp — the same plain-number money type the rest of the wallet uses
   *  (contracts type money as plain numbers; see WalletService.round2). */
  amount: number;
  /** The mobile-money line the prompt is pushed to (the rider's registered number by default, editable
   *  at the top-up screen). Never logged whole by a live client. */
  phone: string;
  /** Client-generated attempt key (mirrors `CreateTopupRequest.idempotencyKey`). Lets a timeout+retry
   *  replay the same charge instead of opening a second one. Optional for back-compat. */
  idempotencyKey?: string;
  /** Per-call deadline override (ms). Omitted ⇒ {@link PAYMENT_RAIL_DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Outcome of any rail operation, mapped into domain terms. The live client fills `raw` with the
 * untouched vendor payload (see the seam doc above) so the mapped fields here are always reconcilable
 * against what the rail actually said.
 */
export interface PaymentRailResult {
  /** The rail's current view of the charge. */
  status: PaymentRailStatus;
  /** The rail's own transaction id, once known. Persisted as `TopUp.providerRef` (unique), which is the
   *  key {@link PaymentRail.confirm}/{@link PaymentRail.reconcile} look a charge up by. */
  providerRef?: string;
  /** The rail id this result pertains to (echoed for convenience/logging). */
  rail?: TopupRail;
  /** The amount the rail actually moved, in USD 2dp — may differ from the requested amount (partials,
   *  fees) and MUST be reconciled against the intent by the caller before crediting. */
  amount?: number;
  /** Human-readable failure/status detail for logs and ops. Never surfaced raw to the rider. */
  reason?: string;
  /**
   * The untouched vendor payload this result was mapped from. The live client stores this alongside the
   * mapped domain object (roadmap 2.5 raw-payload retention) so a mapping bug is reconstructable and the
   * daily reconciliation sweep can diff mapped vs. raw. Typed `unknown` — callers persist it opaquely
   * (e.g. jsonb) and never branch on its shape.
   */
  raw?: unknown;
}

/** Options common to the lookup operations. */
export interface PaymentRailLookupOptions {
  /** Per-call deadline override (ms). Omitted ⇒ {@link PAYMENT_RAIL_DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * The vendor-agnostic top-up rail. A live EcoCash client (wallet PR2) implements this; the app depends
 * only on this interface.
 *
 * ── Where wallet PR2 will call this seam (pointers only — NOT wired now) ──────────────────────────
 * - {@link ../../wallet/wallet.service.ts WalletService.createTopup} currently creates a `pending`
 *   `TopUp` and lets the prompt be pushed out of band. PR2 calls {@link initiate} there, persisting the
 *   returned `providerRef` (and `raw`) on the intent.
 * - `WalletService.creditFromTopup` is already documented as "the seam the live rail poller (PR2) drives".
 *   PR2's poller calls {@link confirm} and, on a `confirmed` result, calls `creditFromTopup(topUpId,
 *   providerRef)` — which stays exactly-once by its existing CAS + unique-`topUpId` guarantees.
 * - A reconciliation sweep (the 2.3 fault pack / settlement matching) calls {@link reconcile} to detect
 *   confirmations that landed while we were not polling, and to diff the rail's record against ours.
 */
export interface PaymentRail {
  /**
   * Kick off a rail charge for a top-up intent: push the USSD/app prompt to the rider's phone. Typically
   * resolves `pending` with a `providerRef`; a synchronous rejection resolves `failed` (it does not throw
   * for an ordinary decline — a transport/timeout failure may throw and is the caller's to handle).
   */
  initiate(intent: PaymentRailInitiate): Promise<PaymentRailResult>;
  /**
   * Poll/confirm a single charge by its `providerRef` — the hot-path operation the live poller drives to
   * move a `pending` intent to a terminal state. Returns the rail's current view.
   */
  confirm(providerRef: string, options?: PaymentRailLookupOptions): Promise<PaymentRailResult>;
  /**
   * Look a charge up by `providerRef` for out-of-band reconciliation (batch/audit path): the daily sweep
   * and settlement matching call this to catch confirmations we missed and to diff mapped vs. raw. Same
   * result shape as {@link confirm}; distinct in intent (audit/backfill, not the live credit path).
   */
  reconcile(providerRef: string, options?: PaymentRailLookupOptions): Promise<PaymentRailResult>;
}

/**
 * DI token for the {@link PaymentRail} binding (mirrors `KYC_VENDOR` / `PUSH`). The default binding is
 * {@link ./stub-payment-rail.ts StubPaymentRail} until the live rail client exists.
 */
export const PAYMENT_RAIL = Symbol("PAYMENT_RAIL");
