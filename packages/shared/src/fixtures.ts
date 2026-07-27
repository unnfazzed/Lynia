/**
 * Shared, contract-validated test fixtures (roadmap 4.1 — Airbnb's shared-fixture principle).
 *
 * ONE place that builds the domain objects every test needs — orders in each lifecycle state, offers,
 * ledger entries, wallet/top-up rows, KYC states — so the API, mobile and admin suites stop hand-rolling
 * divergent mock literals that drift from the wire contract (and from each other).
 *
 * Design rules (do not break these):
 *   1. PURE + DEPENDENCY-FREE. This module lives in `src` and ships in the runtime bundle, so it must
 *      NOT import vitest/jest or any test-only dep. It imports only sibling contract/enum modules. The
 *      parse-against-zod self-tests live in `fixtures.test.ts` (excluded from the tsc build like every
 *      other `*.test.ts`).
 *   2. CONTRACT-VALIDATED. Every factory whose output has a shared zod schema is round-tripped through
 *      `Schema.parse(...)` in the self-test, so if a factory's shape ever drifts from the contract the
 *      shared test suite goes red. Factories without a monolithic schema (order snapshot, KYC state) are
 *      still bound to the shared building blocks they're made of — `OrderStatus`/`KycStatus` enums,
 *      `PublicWaypoint`/`LatLng`/`OrderItem` schemas — which the self-test also asserts.
 *   3. OVERRIDE-FRIENDLY. Each `makeX(overrides?)` shallow-merges overrides over sensible Harare-corridor
 *      defaults and returns a FRESH object every call (no shared mutable state between tests). Shallow
 *      merge means a nested override (e.g. `pickup`) replaces that whole sub-object — pass the full value.
 *
 * Money on the wire: request/wallet amounts are plain numbers (2dp); order/offer *serialised* fares are
 * strings ("4.50") exactly as the API emits them — the factories mirror that split so a fixture drops
 * into a snapshot/offer-row test unchanged.
 */
import type {
  CommissionConfig,
  CreateOrderRequest,
  LatLng,
  MakeOfferRequest,
  MerchantFeatureFlagsResponse,
  OrderItem,
  Topup,
  TopupRail,
  TopupStatus,
  Wallet,
  WalletEntry,
  WalletEntryType,
  Waypoint,
} from "./contracts";
import { type KycDeclineReason, KycStatus, type OfferType, OrderStatus } from "./enums";

/** Shallow-merge overrides over a base, returning a fresh object (factories never share mutable state). */
function make<T>(base: T, overrides?: Partial<T>): T {
  return { ...base, ...overrides };
}

/** Deterministic, RFC-4122 v4 ids so fixtures are pure and `z.string().uuid()` accepts them. */
export const FIXTURE_IDS = {
  order: "0a1b2c3d-0000-4000-8000-000000000001",
  offer: "0a1b2c3d-0000-4000-8000-000000000002",
  rider: "0a1b2c3d-0000-4000-8000-000000000003",
  customer: "0a1b2c3d-0000-4000-8000-000000000004",
  topup: "0a1b2c3d-0000-4000-8000-000000000005",
} as const;

/** Deterministic timestamps: `expiresAt` is `createdAt` + OFFER_WINDOW_MS (90s), matching the API. */
export const FIXTURE_TIME = {
  createdAt: "2026-07-20T12:00:00.000Z",
  expiresAt: "2026-07-20T12:01:30.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
} as const;

// ── Waypoints & items ───────────────────────────────────────────────────────

/** A full pickup/dropoff waypoint (point + landmark + contactPhone) — parses against `Waypoint`. */
export function makeWaypoint(overrides?: Partial<Waypoint>): Waypoint {
  return make<Waypoint>(
    { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall", contactPhone: "+263771234567" },
    overrides,
  );
}

/** One "what are you sending?" line — parses against `OrderItem`. */
export function makeOrderItem(overrides?: Partial<OrderItem>): OrderItem {
  return make<OrderItem>({ description: "Documents", quantity: 1 }, overrides);
}

// ── Order: create request (wire contract) ────────────────────────────────────

/**
 * A customer's create-delivery request — parses against `CreateOrderRequest`. Uses the modern
 * line-`items` seam (a new client); pass `{ items: undefined, itemDescription: "…" }` to exercise the
 * legacy single-string path (the contract requires exactly one of the two).
 */
export function makeCreateOrderRequest(overrides?: Partial<CreateOrderRequest>): CreateOrderRequest {
  return make<CreateOrderRequest>(
    {
      pickup: makeWaypoint(),
      dropoff: makeWaypoint({
        point: { lat: -17.8016, lng: 31.0431 },
        landmark: "Avondale Shops",
        contactPhone: "+263772345678",
      }),
      items: [makeOrderItem()],
      declaredValue: 20,
      proposedFare: 4.5,
    } as CreateOrderRequest,
    overrides,
  );
}

// ── Order: lifecycle snapshot ────────────────────────────────────────────────

export interface OrderFixtureRider {
  profileId: string;
  currentLat: number | null;
  currentLng: number | null;
  updatedAt: string | null;
}

/**
 * A domain order snapshot — structurally assignable to the mobile `OrderSnapshot` / admin order view
 * (all required fields, common optionals). There is no single shared zod schema for the full snapshot,
 * so this is bound to the shared contracts it's built from: `status` ∈ `OrderStatus`, waypoints match
 * `PublicWaypoint` (point + landmark, customer view), `items` match `OrderItem` — all asserted in the
 * self-test.
 */
export interface OrderFixture {
  id: string;
  status: OrderStatus;
  agreedFare: string | null;
  proposedFare: string;
  pickup: { point: LatLng; landmark: string };
  dropoff: { point: LatLng; landmark: string };
  items: OrderItem[] | null;
  note: string | null;
  rider: OrderFixtureRider | null;
  events: { status: OrderStatus; createdAt: string }[];
  counterpartyPhone: string | null;
  expiresAt: string | null;
}

/** Statuses BEFORE a rider is attached — no agreed fare, no rider, and (while open) a live auction clock. */
const PRE_ASSIGNMENT_STATUSES: readonly OrderStatus[] = [OrderStatus.REQUESTED, OrderStatus.OPEN_FOR_OFFERS];

/**
 * An order snapshot in any lifecycle state. Fields that depend on the status default coherently — a
 * pre-assignment order has `agreedFare: null` and `rider: null`; an `open_for_offers` order carries the
 * auction `expiresAt`; everything from `assigned` onward has an agreed fare and an attached rider. Any of
 * these can be overridden. `events` defaults to a single entry for the chosen status (override for a
 * fuller history).
 */
export function makeOrder(overrides?: Partial<OrderFixture>): OrderFixture {
  const status = overrides?.status ?? OrderStatus.ASSIGNED;
  const preAssignment = PRE_ASSIGNMENT_STATUSES.includes(status);
  const base: OrderFixture = {
    id: FIXTURE_IDS.order,
    status,
    agreedFare: preAssignment ? null : "4.50",
    proposedFare: "4.50",
    pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall" },
    dropoff: { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops" },
    items: [makeOrderItem()],
    note: null,
    rider: preAssignment
      ? null
      : { profileId: FIXTURE_IDS.rider, currentLat: -17.815, currentLng: 31.048, updatedAt: FIXTURE_TIME.updatedAt },
    events: [{ status, createdAt: FIXTURE_TIME.createdAt }],
    counterpartyPhone: null,
    expiresAt: status === OrderStatus.OPEN_FOR_OFFERS ? FIXTURE_TIME.expiresAt : null,
  };
  return make(base, overrides);
}

/** Every lifecycle status, in the canonical CONCEPT §5 order (terminal states last). */
export const ORDER_LIFECYCLE_STATUSES: readonly OrderStatus[] = Object.values(OrderStatus);

/** One order fixture per lifecycle state, keyed by status — "orders in each lifecycle state" in one call. */
export function makeOrdersInEachState(
  overrides?: Partial<OrderFixture>,
): Record<OrderStatus, OrderFixture> {
  const out = {} as Record<OrderStatus, OrderFixture>;
  for (const status of ORDER_LIFECYCLE_STATUSES) out[status] = makeOrder({ status, ...overrides });
  return out;
}

// ── Offer (wire contract) ────────────────────────────────────────────────────

/**
 * A rider's response to an order — parses against `MakeOfferRequest`. Defaults to accepting the
 * customer's price (`type: "accept"`); pass `{ type: "counter", offeredFare }` for a counter-offer.
 */
export function makeOffer(overrides?: Partial<MakeOfferRequest>): MakeOfferRequest {
  return make<MakeOfferRequest>(
    { orderId: FIXTURE_IDS.order, type: "accept" as OfferType, offeredFare: 2.5, etaMinutes: 10 },
    overrides,
  );
}

// ── Wallet / ledger / top-up (wire contracts) ────────────────────────────────

/**
 * A rider-visible ledger row — parses against `WalletEntry` (`.strict()`). Defaults to a `commission`
 * debit carrying the show-the-math receipt fields (`ratePct` + `fare` + `orderId`); override `type` (and
 * the relevant fields) for a `topup`/`grace`/`adjustment` row. Signed amount: debit negative, credit positive.
 */
export function makeLedgerEntry(overrides?: Partial<WalletEntry>): WalletEntry {
  return make<WalletEntry>(
    {
      id: "ledger-0001",
      type: "commission" as WalletEntryType,
      amount: -0.3,
      balanceAfter: 4.7,
      title: "Ride commission",
      meta: "10% of $3.00 · delivery to Avondale",
      ratePct: 10,
      fare: 3,
      orderId: FIXTURE_IDS.order,
      createdAt: FIXTURE_TIME.createdAt,
    },
    overrides,
  );
}

/** The prepaid commission balance — parses against `Wallet` (`.strict()`). */
export function makeWallet(overrides?: Partial<Wallet>): Wallet {
  return make<Wallet>({ balance: 5, currency: "USD", updatedAt: FIXTURE_TIME.updatedAt }, overrides);
}

/** A top-up intent — parses against `Topup` (`.strict()`). Defaults to a pending EcoCash prompt. */
export function makeTopup(overrides?: Partial<Topup>): Topup {
  return make<Topup>(
    {
      id: FIXTURE_IDS.topup,
      status: "pending" as TopupStatus,
      amount: 5,
      rail: "ecocash" as TopupRail,
      phone: "+263771234567",
      expiresAt: FIXTURE_TIME.expiresAt,
      createdAt: FIXTURE_TIME.createdAt,
    },
    overrides,
  );
}

/**
 * Merchant-vertical kill-switch state — parses against `MerchantFeatureFlagsResponse` (`.strict()`).
 * Defaults to the launch-inert all-off state so a fixture consumer opts INTO an enabled vertical
 * explicitly (mirrors makeCommissionConfig's posture).
 */
export function makeMerchantFeatureFlags(
  overrides?: Partial<MerchantFeatureFlagsResponse>,
): MerchantFeatureFlagsResponse {
  return make<MerchantFeatureFlagsResponse>(
    { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false },
    overrides,
  );
}

/**
 * The wallet feature-flag + policy config — parses against `CommissionConfig` (`.strict()`). Defaults
 * to the launch-inert state (`enabled: false`, `ratePct: 0`) so a fixture consumer opts INTO an active
 * commission regime explicitly.
 */
export function makeCommissionConfig(overrides?: Partial<CommissionConfig>): CommissionConfig {
  return make<CommissionConfig>(
    { enabled: false, ratePct: 0, floor: 2, graceCredit: 1, minTopUp: 1, maxTopUp: 100 },
    overrides,
  );
}

// ── KYC state ────────────────────────────────────────────────────────────────

/**
 * A rider's KYC standing — bound to the shared `KycStatus` / `KycDeclineReason` enums (asserted in the
 * self-test). `declineReason` is populated for the non-passing states, null otherwise; `verifiedAt` is
 * set for a rider who was ever verified (`verified` now, or `expired` — previously verified, document lapsed).
 */
export interface KycStateFixture {
  status: KycStatus;
  declineReason: KycDeclineReason | null;
  attempts: number;
  verifiedAt: string | null;
}

/** Sensible per-status defaults for a KYC fixture (the "each KYC state" mapping). */
const KYC_STATE_DEFAULTS: Record<KycStatus, Omit<KycStateFixture, "status">> = {
  [KycStatus.PENDING]: { declineReason: null, attempts: 0, verifiedAt: null },
  [KycStatus.VERIFIED]: { declineReason: null, attempts: 1, verifiedAt: FIXTURE_TIME.createdAt },
  [KycStatus.FAILED]: { declineReason: "id_unreadable", attempts: 2, verifiedAt: null },
  [KycStatus.EXPIRED]: { declineReason: "id_expired", attempts: 1, verifiedAt: FIXTURE_TIME.createdAt },
};

/** A KYC state (defaults to `verified`); pass `{ status }` for any other lifecycle state. */
export function makeKycState(overrides?: Partial<KycStateFixture>): KycStateFixture {
  const status = overrides?.status ?? KycStatus.VERIFIED;
  return make<KycStateFixture>({ status, ...KYC_STATE_DEFAULTS[status] }, overrides);
}

/** Every KYC status, keyed — "KYC states" in one call. */
export const KYC_STATUSES: readonly KycStatus[] = Object.values(KycStatus);

/** One KYC fixture per status, keyed by status. */
export function makeKycStatesInEachState(): Record<KycStatus, KycStateFixture> {
  const out = {} as Record<KycStatus, KycStateFixture>;
  for (const status of KYC_STATUSES) out[status] = makeKycState({ status });
  return out;
}
