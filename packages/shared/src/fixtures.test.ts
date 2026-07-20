/**
 * Contract-validation self-tests for the shared fixtures (roadmap 4.1).
 *
 * The whole point of the shared-fixture module is that its output CANNOT silently drift from the wire
 * contract. Every factory backed by a shared zod schema is round-tripped through `Schema.parse(...)`
 * here — with defaults AND with overrides — so a shape change that breaks the contract turns this suite
 * red. Factories without a monolithic schema (the order snapshot, the KYC state) are bound instead to
 * the shared building blocks they are made of (`OrderStatus`/`KycStatus` enums, `PublicWaypoint`/`LatLng`/
 * `OrderItem` schemas), which are asserted the same way.
 *
 * `.parse` returning a value deep-equal to the input also proves nothing was coerced or stripped — which
 * matters for the `.strict()` wallet schemas, where a stray key would throw rather than be dropped.
 */
import { describe, expect, it } from "vitest";
import {
  CommissionConfig,
  CreateOrderRequest,
  LatLng,
  MakeOfferRequest,
  OrderItem,
  PublicWaypoint,
  Topup,
  Wallet,
  WalletEntry,
  Waypoint,
} from "./contracts";
import { KycDeclineReason, KycStatus, OrderStatus } from "./enums";
import {
  KYC_STATUSES,
  makeCommissionConfig,
  makeCreateOrderRequest,
  makeKycState,
  makeKycStatesInEachState,
  makeLedgerEntry,
  makeOffer,
  makeOrder,
  makeOrderItem,
  makeOrdersInEachState,
  makeTopup,
  makeWallet,
  makeWaypoint,
  ORDER_LIFECYCLE_STATUSES,
} from "./fixtures";

const enumValues = <T extends Record<string, string>>(e: T): string[] => Object.values(e);

describe("fixtures parse against their shared zod contracts", () => {
  it("makeWaypoint → Waypoint", () => {
    expect(Waypoint.parse(makeWaypoint())).toEqual(makeWaypoint());
    expect(Waypoint.parse(makeWaypoint({ landmark: "Borrowdale" }))).toEqual(makeWaypoint({ landmark: "Borrowdale" }));
  });

  it("makeOrderItem → OrderItem", () => {
    expect(OrderItem.parse(makeOrderItem())).toEqual(makeOrderItem());
    expect(OrderItem.parse(makeOrderItem({ description: "Phone charger", quantity: 3 }))).toBeTruthy();
  });

  it("makeCreateOrderRequest → CreateOrderRequest (modern items path)", () => {
    expect(() => CreateOrderRequest.parse(makeCreateOrderRequest())).not.toThrow();
    // Legacy single-string path (exactly one of items/itemDescription is required by the contract).
    const legacy = makeCreateOrderRequest({ items: undefined, itemDescription: "Documents" });
    expect(() => CreateOrderRequest.parse(legacy)).not.toThrow();
    // Overrides keep it valid.
    expect(() => CreateOrderRequest.parse(makeCreateOrderRequest({ proposedFare: 12.34, declaredValue: 0 }))).not.toThrow();
  });

  it("makeCreateOrderRequest with NEITHER item form is rejected by the contract (guards the superRefine)", () => {
    expect(() => CreateOrderRequest.parse(makeCreateOrderRequest({ items: undefined }))).toThrow();
  });

  it("makeOffer → MakeOfferRequest (accept + counter)", () => {
    expect(MakeOfferRequest.parse(makeOffer())).toEqual(makeOffer());
    const counter = makeOffer({ type: "counter", offeredFare: 6.25, etaMinutes: 15 });
    expect(MakeOfferRequest.parse(counter)).toEqual(counter);
  });

  it("makeLedgerEntry → WalletEntry (.strict) for every entry type", () => {
    expect(WalletEntry.parse(makeLedgerEntry())).toEqual(makeLedgerEntry());
    // A top-up credit carries rail + ref and drops the commission-only receipt fields.
    const topup = makeLedgerEntry({
      type: "topup",
      amount: 5,
      balanceAfter: 5,
      title: "Top-up",
      meta: "EcoCash",
      rail: "ecocash",
      ref: "EC-12345",
      ratePct: undefined,
      fare: undefined,
      orderId: undefined,
    });
    expect(WalletEntry.parse(topup)).toEqual(topup);
    for (const type of ["grace", "adjustment", "reversal"] as const) {
      expect(() => WalletEntry.parse(makeLedgerEntry({ type }))).not.toThrow();
    }
  });

  it("makeLedgerEntry with a stray key is rejected by .strict() (proves the receipt can't smuggle fields)", () => {
    expect(() => WalletEntry.parse(makeLedgerEntry({ hacker: true } as never))).toThrow();
  });

  it("makeWallet → Wallet (.strict)", () => {
    expect(Wallet.parse(makeWallet())).toEqual(makeWallet());
    expect(Wallet.parse(makeWallet({ balance: -1.5 }))).toEqual(makeWallet({ balance: -1.5 }));
  });

  it("makeTopup → Topup (.strict) for every status", () => {
    expect(Topup.parse(makeTopup())).toEqual(makeTopup());
    for (const status of ["succeeded", "declined", "expired"] as const) {
      expect(() => Topup.parse(makeTopup({ status }))).not.toThrow();
    }
  });

  it("makeCommissionConfig → CommissionConfig (.strict), inert by default and when flipped on", () => {
    expect(CommissionConfig.parse(makeCommissionConfig())).toEqual(makeCommissionConfig());
    const active = makeCommissionConfig({ enabled: true, ratePct: 12.5 });
    expect(CommissionConfig.parse(active)).toEqual(active);
  });
});

describe("makeOrder — bound to the shared order building blocks", () => {
  it("covers every OrderStatus, and each fixture's status/waypoints/items honour the shared contracts", () => {
    const byState = makeOrdersInEachState();
    // Exhaustive over the enum — a new lifecycle state must get a fixture.
    expect(Object.keys(byState).sort()).toEqual([...ORDER_LIFECYCLE_STATUSES].sort());

    for (const status of ORDER_LIFECYCLE_STATUSES) {
      const order = byState[status];
      expect(order.status).toBe(status);
      expect(enumValues(OrderStatus)).toContain(order.status);
      // Customer-view waypoints are point + landmark only — the shared PublicWaypoint (.strict) accepts
      // them and would reject a leaked contactPhone.
      expect(() => PublicWaypoint.parse(order.pickup)).not.toThrow();
      expect(() => PublicWaypoint.parse(order.dropoff)).not.toThrow();
      expect(() => LatLng.parse(order.pickup.point)).not.toThrow();
      // Serialised fares are 2dp strings exactly as the API emits them.
      expect(order.proposedFare).toMatch(/^\d+\.\d{2}$/);
      if (order.agreedFare !== null) expect(order.agreedFare).toMatch(/^\d+\.\d{2}$/);
      // Line-items round-trip through the shared OrderItem schema.
      for (const item of order.items ?? []) expect(() => OrderItem.parse(item)).not.toThrow();
      // Every event's status is a real lifecycle status.
      for (const ev of order.events) expect(enumValues(OrderStatus)).toContain(ev.status);
    }
  });

  it("defaults cohere with the lifecycle: pre-assignment has no rider/agreed fare, open carries the auction clock", () => {
    const open = makeOrder({ status: OrderStatus.OPEN_FOR_OFFERS });
    expect(open.rider).toBeNull();
    expect(open.agreedFare).toBeNull();
    expect(open.expiresAt).not.toBeNull();

    const assigned = makeOrder({ status: OrderStatus.ASSIGNED });
    expect(assigned.rider).not.toBeNull();
    expect(assigned.agreedFare).toMatch(/^\d+\.\d{2}$/);
    expect(assigned.expiresAt).toBeNull();
  });

  it("is override-friendly and returns a fresh object each call", () => {
    const a = makeOrder();
    const b = makeOrder();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(makeOrder({ id: "custom", counterpartyPhone: "+263770000000" })).toMatchObject({
      id: "custom",
      counterpartyPhone: "+263770000000",
    });
  });
});

describe("makeKycState — bound to the shared KYC enums", () => {
  it("covers every KycStatus with a valid decline reason (or null)", () => {
    const byState = makeKycStatesInEachState();
    expect(Object.keys(byState).sort()).toEqual([...KYC_STATUSES].sort());
    for (const status of KYC_STATUSES) {
      const kyc = byState[status];
      expect(kyc.status).toBe(status);
      expect(enumValues(KycStatus)).toContain(kyc.status);
      if (kyc.declineReason !== null) expect(enumValues(KycDeclineReason)).toContain(kyc.declineReason);
    }
  });

  it("defaults verified, and populates decline reasons only for the non-passing states", () => {
    expect(makeKycState().status).toBe(KycStatus.VERIFIED);
    expect(makeKycState().declineReason).toBeNull();
    expect(makeKycState({ status: KycStatus.FAILED }).declineReason).toBe("id_unreadable");
    expect(makeKycState({ status: KycStatus.EXPIRED }).declineReason).toBe("id_expired");
    // Overrides win.
    expect(makeKycState({ status: KycStatus.FAILED, declineReason: "face_mismatch" }).declineReason).toBe("face_mismatch");
  });
});
