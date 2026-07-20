import { describe, expect, it } from "vitest";
import type { PaymentRail, PaymentRailResult } from "./payment-rail.interface";
import { PAYMENT_RAIL, PAYMENT_RAIL_DEFAULT_TIMEOUT_MS } from "./payment-rail.interface";
import { StubPaymentRail } from "./stub-payment-rail";

// Typed as the interface — this alone proves StubPaymentRail structurally satisfies PaymentRail.
const rail: PaymentRail = new StubPaymentRail();

const intent = { topUpId: "topup-123", rail: "ecocash" as const, amount: 5, phone: "+263771234567" };

/** Every stub result is a bounded status and (for our inputs) never a fabricated confirmation. */
function expectStubResult(r: PaymentRailResult): void {
  expect(["pending", "confirmed", "failed"]).toContain(r.status);
  // The stub moves no money — it must never report a charge as confirmed.
  expect(r.status).toBe("pending");
}

describe("StubPaymentRail — contract (roadmap 2.5 seam)", () => {
  it("satisfies the PaymentRail interface (initiate/confirm/reconcile are callable)", () => {
    expect(typeof rail.initiate).toBe("function");
    expect(typeof rail.confirm).toBe("function");
    expect(typeof rail.reconcile).toBe("function");
  });

  it("exposes a DI token and a documented default timeout", () => {
    expect(typeof PAYMENT_RAIL).toBe("symbol");
    expect(PAYMENT_RAIL_DEFAULT_TIMEOUT_MS).toBe(10_000);
  });

  it("initiate returns a pending result with a deterministic providerRef derived from topUpId", async () => {
    const r = await rail.initiate(intent);
    expectStubResult(r);
    expect(r.providerRef).toBe("stub_rail_topup-123");
    expect(r.rail).toBe("ecocash");
    expect(r.amount).toBe(5);
  });

  it("initiate is deterministic — a replay of the same intent yields the same providerRef", async () => {
    const a = await rail.initiate(intent);
    const b = await rail.initiate(intent);
    expect(a.providerRef).toBe(b.providerRef);
  });

  it("confirm never fabricates a confirmation — an inert stub credits nothing", async () => {
    const r = await rail.confirm("stub_rail_topup-123");
    expectStubResult(r);
    expect(r.providerRef).toBe("stub_rail_topup-123");
  });

  it("reconcile looks up by providerRef and stays pending (nothing to reconcile)", async () => {
    const r = await rail.reconcile("stub_rail_topup-123");
    expectStubResult(r);
    expect(r.providerRef).toBe("stub_rail_topup-123");
  });

  it("accepts a per-call timeout override without changing the outcome shape", async () => {
    const r = await rail.confirm("stub_rail_topup-123", { timeoutMs: 250 });
    expectStubResult(r);
  });
});
