import { describe, expect, it } from "vitest";
import { foodOrderMoney, merchantDeliveryShareAtPlacement, recomputeMerchantDeliveryShare } from "./restaurants-order";

// D-71: free delivery paid by the restaurant or shop. The rider is always paid the full fee; the
// customer pays $0 delivery; the venue's money is the goods total less the fee.
describe("foodOrderMoney — the one split", () => {
  it("an unfunded order is the old maths: customer pays goods + fee, venue gets goods", () => {
    expect(foodOrderMoney({ goodsTotal: 13, deliveryFee: 2.5, merchantDeliveryShare: null })).toEqual({
      customerDeliveryFee: 2.5,
      customerTotal: 15.5,
      riderFare: 2.5,
      merchantNet: 13,
    });
  });

  it("a free-delivery order: customer pays $0 delivery, rider still earns the fee, venue gets goods − fee", () => {
    expect(foodOrderMoney({ goodsTotal: 13, deliveryFee: 2.5, merchantDeliveryShare: 2.5 })).toEqual({
      customerDeliveryFee: 0,
      customerTotal: 13,
      riderFare: 2.5,
      merchantNet: 10.5,
    });
  });

  it("always adds up: customerTotal = merchantNet + riderFare, to the cent", () => {
    for (const [goods, fee, share] of [
      [0.1, 0.2, 0.2],
      [4.35, 1.5, 1.5],
      [19.99, 3.5, null],
      [1, 2, 1],
    ] as const) {
      const m = foodOrderMoney({ goodsTotal: goods, deliveryFee: fee, merchantDeliveryShare: share });
      expect(Math.round(m.customerTotal * 100)).toBe(Math.round((m.merchantNet + m.riderFare) * 100));
      expect(m.riderFare).toBe(fee);
      expect(m.merchantNet).toBeGreaterThanOrEqual(0);
    }
  });

  it("never lets the venue's money go below $0 (a share above the goods is capped)", () => {
    const m = foodOrderMoney({ goodsTotal: 1, deliveryFee: 2, merchantDeliveryShare: 2 });
    expect(m).toEqual({ customerDeliveryFee: 1, customerTotal: 2, riderFare: 2, merchantNet: 0 });
  });

  it("reads Prisma-Decimal-like values", () => {
    const dec = (n: string) => ({ toString: () => n, valueOf: () => Number(n) });
    expect(foodOrderMoney({ goodsTotal: dec("8.00"), deliveryFee: dec("1.50"), merchantDeliveryShare: dec("1.50") }).merchantNet).toBe(6.5);
  });
});

describe("merchantDeliveryShareAtPlacement", () => {
  const base = { freeDelivery: true, paymentMethod: "cash" as const, goodsTotal: 12, deliveryFee: 2.5 };

  it("funds the whole fee on a cash order from a free-delivery venue", () => {
    expect(merchantDeliveryShareAtPlacement(base)).toBe(2.5);
  });

  it("is null when the venue has not turned it on", () => {
    expect(merchantDeliveryShareAtPlacement({ ...base, freeDelivery: false })).toBeNull();
  });

  it("is null on a wallet order (cash only)", () => {
    expect(merchantDeliveryShareAtPlacement({ ...base, paymentMethod: "wallet" })).toBeNull();
  });

  it("is null when the goods don't cover the fee (the venue would pay to give food away)", () => {
    expect(merchantDeliveryShareAtPlacement({ ...base, goodsTotal: 2.49 })).toBeNull();
    expect(merchantDeliveryShareAtPlacement({ ...base, goodsTotal: 2.5 })).toBe(2.5);
  });
});

describe("recomputeMerchantDeliveryShare", () => {
  it("keeps an unfunded order unfunded", () => {
    expect(recomputeMerchantDeliveryShare(null, 20, 2.5)).toBeNull();
  });

  it("keeps a funded order funded at the full fee while the goods cover it", () => {
    expect(recomputeMerchantDeliveryShare(2.5, 9, 2.5)).toBe(2.5);
  });

  it("caps the share at the new goods total after an edit", () => {
    expect(recomputeMerchantDeliveryShare(2.5, 1.75, 2.5)).toBe(1.75);
  });
});
