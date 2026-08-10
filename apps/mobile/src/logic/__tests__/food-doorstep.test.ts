import { codeEligible, handshakeState } from "../food-doorstep";

const base = {
  paymentMethod: "cash" as string | null,
  customerCashConfirmedAt: null as string | null,
  riderCashConfirmedAt: null as string | null,
  cashHandshakeFrozenAt: null as string | null,
};

describe("handshakeState", () => {
  it("is not_cash for a WALLET order regardless of the timestamps", () => {
    expect(handshakeState({ ...base, paymentMethod: "wallet" })).toBe("not_cash");
  });

  it("is pending before either side confirms", () => {
    expect(handshakeState(base)).toBe("pending");
  });

  it("is waiting_rider once the customer confirms first (R-04 food-first order)", () => {
    expect(handshakeState({ ...base, customerCashConfirmedAt: "2026-07-31T10:14:00Z" })).toBe("waiting_rider");
  });

  it("is confirmed once both sides have confirmed", () => {
    expect(
      handshakeState({ ...base, customerCashConfirmedAt: "2026-07-31T10:14:00Z", riderCashConfirmedAt: "2026-07-31T10:15:00Z" }),
    ).toBe("confirmed");
  });

  it("is frozen (R-05) once the window lapses or the rider disputes, even with a customer confirm on record", () => {
    expect(handshakeState({ ...base, customerCashConfirmedAt: "2026-07-31T10:14:00Z", cashHandshakeFrozenAt: "2026-07-31T10:16:00Z" })).toBe(
      "frozen",
    );
  });

  it("frozen wins even if a rider confirm somehow also landed (shouldn't happen server-side, but never claim confirmed)", () => {
    expect(
      handshakeState({
        ...base,
        customerCashConfirmedAt: "2026-07-31T10:14:00Z",
        riderCashConfirmedAt: "2026-07-31T10:15:00Z",
        cashHandshakeFrozenAt: "2026-07-31T10:16:00Z",
      }),
    ).toBe("frozen");
  });
});

describe("codeEligible", () => {
  it("is always true for a WALLET order", () => {
    expect(codeEligible({ ...base, paymentMethod: "wallet" })).toBe(true);
  });

  it("is false for CASH until both confirms land", () => {
    expect(codeEligible(base)).toBe(false);
    expect(codeEligible({ ...base, customerCashConfirmedAt: "2026-07-31T10:14:00Z" })).toBe(false);
  });

  it("is true for CASH once both confirms land", () => {
    expect(
      codeEligible({ ...base, customerCashConfirmedAt: "2026-07-31T10:14:00Z", riderCashConfirmedAt: "2026-07-31T10:15:00Z" }),
    ).toBe(true);
  });

  it("is false for a frozen CASH handshake even if a rider confirm raced in", () => {
    expect(
      codeEligible({
        ...base,
        customerCashConfirmedAt: "2026-07-31T10:14:00Z",
        riderCashConfirmedAt: "2026-07-31T10:15:00Z",
        cashHandshakeFrozenAt: "2026-07-31T10:16:00Z",
      }),
    ).toBe(false);
  });
});
