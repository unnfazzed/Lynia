import "reflect-metadata";
import { describe, expect, it } from "vitest";
import type { PaymentRail, PaymentRailResult } from "./payment-rail.interface";
import { PAYMENT_RAIL, PAYMENT_RAIL_DEFAULT_TIMEOUT_MS } from "./payment-rail.interface";
import type { Env } from "../../config/env";
import { PaymentsModule, selectPaymentRail } from "./payments.module";
import { PaynowRail } from "./paynow-rail";
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

  it("exposes a documented default timeout", () => {
    expect(PAYMENT_RAIL_DEFAULT_TIMEOUT_MS).toBe(10_000);
  });

  it("PaymentsModule binds PAYMENT_RAIL through selectPaymentRail (DI wiring, TP-01)", () => {
    const providers = Reflect.getMetadata("providers", PaymentsModule) as Array<{
      provide?: unknown;
      useFactory?: unknown;
    }>;
    const exportsList = Reflect.getMetadata("exports", PaymentsModule) as unknown[];
    const binding = providers.find((p) => p?.provide === PAYMENT_RAIL);
    expect(binding?.provide).toBe(PAYMENT_RAIL);
    expect(binding?.useFactory).toBe(selectPaymentRail);
    expect(exportsList).toContain(PAYMENT_RAIL);
  });

  it("selectPaymentRail: the stub unless PAYMENT_RAIL=paynow with its settings, then PaynowRail", () => {
    expect(selectPaymentRail({ PAYMENT_RAIL: "stub" } as Env)).toBeInstanceOf(StubPaymentRail);
    // A half-configured paynow can't reach here in a real boot (env.ts rejects it); defensively, it is the stub.
    expect(selectPaymentRail({ PAYMENT_RAIL: "paynow" } as Env)).toBeInstanceOf(StubPaymentRail);
    const live = selectPaymentRail({
      PAYMENT_RAIL: "paynow",
      PAYNOW_INTEGRATION_ID: "27383",
      PAYNOW_INTEGRATION_KEY: "11111111-2222-3333-4444-555555555555",
      PAYNOW_AUTH_EMAIL: "merchant@example.com",
      PAYNOW_RESULT_URL: "https://api.example.com/webhooks/paynow",
      PAYNOW_RETURN_URL: "https://lyniago.com",
      PAYNOW_BASE_URL: "https://www.paynow.co.zw",
    } as Env);
    expect(live).toBeInstanceOf(PaynowRail);
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
