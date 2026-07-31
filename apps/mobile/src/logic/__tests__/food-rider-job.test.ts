import { FOOD_DROPPABLE, RIDER_FOOD_NEXT, foodCashBreakdown, foodOfferVariant, noShowStatus, returnLegNeeded } from "../food-rider-job";

describe("RIDER_FOOD_NEXT", () => {
  it("only covers the two plain-advance edges — pickup and delivery are gated, not a bare button", () => {
    expect(Object.keys(RIDER_FOOD_NEXT).sort()).toEqual(["assigned", "confirmed", "picked_up"]);
  });

  it("advances assigned -> confirmed -> en_route_pickup, and picked_up -> en_route_dropoff", () => {
    expect(RIDER_FOOD_NEXT.assigned).toEqual({ to: "confirmed", label: "Confirm the job" });
    expect(RIDER_FOOD_NEXT.confirmed?.to).toBe("en_route_pickup");
    expect(RIDER_FOOD_NEXT.picked_up?.to).toBe("en_route_dropoff");
  });
});

describe("FOOD_DROPPABLE", () => {
  it("mirrors food-dispatch.service.ts's droppable set — pre-pickup only", () => {
    expect([...FOOD_DROPPABLE].sort()).toEqual(["assigned", "confirmed", "en_route_pickup"]);
    expect(FOOD_DROPPABLE.has("picked_up")).toBe(false);
    expect(FOOD_DROPPABLE.has("en_route_dropoff")).toBe(false);
  });
});

describe("foodOfferVariant", () => {
  it("is wallet for a WALLET order regardless of merchantCashRule", () => {
    expect(foodOfferVariant({ merchantPaymentMethod: "wallet", merchantCashRule: "pay_upfront" })).toBe("wallet");
  });

  it("is cash_collect for CASH collect-and-return (R-03 default)", () => {
    expect(foodOfferVariant({ merchantPaymentMethod: "cash", merchantCashRule: "collect_and_return" })).toBe("cash_collect");
  });

  it("defaults to cash_collect for CASH with a null cash rule (the R-03 default, not yet set)", () => {
    expect(foodOfferVariant({ merchantPaymentMethod: "cash", merchantCashRule: null })).toBe("cash_collect");
  });

  it("is cash_upfront for CASH pay-upfront kitchens (R-10)", () => {
    expect(foodOfferVariant({ merchantPaymentMethod: "cash", merchantCashRule: "pay_upfront" })).toBe("cash_upfront");
  });

  it("is unknown against an older API that hasn't populated either field yet", () => {
    expect(foodOfferVariant({ merchantPaymentMethod: null, merchantCashRule: null })).toBe("unknown");
  });
});

describe("foodCashBreakdown", () => {
  it("computes collected/kept/owed per R-06's worked example", () => {
    // $13.00 goods + $2.50 delivery fee -> $15.50 collected, rider keeps $2.50, owes $13.00 back.
    expect(foodCashBreakdown({ merchantGoodsTotal: 13.0, deliveryFee: 2.5 })).toEqual({ collected: 15.5, kept: 2.5, owed: 13.0 });
  });

  it("treats a missing figure as zero rather than throwing", () => {
    expect(foodCashBreakdown({ merchantGoodsTotal: null, deliveryFee: null })).toEqual({ collected: 0, kept: 0, owed: 0 });
  });
});

describe("returnLegNeeded", () => {
  it("is true only for a CASH collect-and-return order with an open debt", () => {
    expect(returnLegNeeded({ paymentMethod: "cash", merchantCashRule: "collect_and_return", debtStatus: "open" })).toBe(true);
  });

  it("is false once the debt settles", () => {
    expect(returnLegNeeded({ paymentMethod: "cash", merchantCashRule: "collect_and_return", debtStatus: "settled_cash" })).toBe(false);
  });

  it("is false for a pay-upfront kitchen (no debt ledger opens for it — see FoodDebtService's own scope cut)", () => {
    expect(returnLegNeeded({ paymentMethod: "cash", merchantCashRule: "pay_upfront", debtStatus: "open" })).toBe(false);
  });

  it("is false for a WALLET order", () => {
    expect(returnLegNeeded({ paymentMethod: "wallet", merchantCashRule: "collect_and_return", debtStatus: "open" })).toBe(false);
  });
});

describe("noShowStatus", () => {
  it("needs 2 calls and an 8:00 wait before it's eligible — starting state", () => {
    expect(noShowStatus([], 0)).toEqual({ callsLogged: 0, callsNeeded: 2, waitRemainingMs: 8 * 60 * 1000, eligible: false });
  });

  it("counts down calls needed as they're logged, still not eligible before the wait elapses", () => {
    const first = new Date("2026-07-31T10:00:00Z").toISOString();
    const now = new Date("2026-07-31T10:01:00Z").getTime(); // 1 minute since the first call
    const status = noShowStatus([first], now);
    expect(status.callsLogged).toBe(1);
    expect(status.callsNeeded).toBe(1);
    expect(status.eligible).toBe(false);
  });

  it("is eligible once 2+ calls are logged AND 8:00 has elapsed since the FIRST call", () => {
    const first = new Date("2026-07-31T10:00:00Z").toISOString();
    const second = new Date("2026-07-31T10:03:00Z").toISOString();
    const now = new Date("2026-07-31T10:08:00Z").getTime(); // exactly 8:00 after the first call
    const status = noShowStatus([first, second], now);
    expect(status).toEqual({ callsLogged: 2, callsNeeded: 0, waitRemainingMs: 0, eligible: true });
  });

  it("is not eligible with 2 calls logged but the wait not yet elapsed", () => {
    const first = new Date("2026-07-31T10:00:00Z").toISOString();
    const second = new Date("2026-07-31T10:03:00Z").toISOString();
    const now = new Date("2026-07-31T10:05:00Z").getTime(); // only 5:00 since the first call
    const status = noShowStatus([first, second], now);
    expect(status.callsNeeded).toBe(0);
    expect(status.waitRemainingMs).toBe(3 * 60 * 1000);
    expect(status.eligible).toBe(false);
  });
});
