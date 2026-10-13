import { describe, expect, it, vi } from "vitest";
import { encodePaynowMessage } from "../adapters/payments/paynow";
import { PaynowRail } from "../adapters/payments/paynow-rail";
import { StubPaymentRail } from "../adapters/payments/stub-payment-rail";
import { PaynowWebhookController } from "./paynow-webhook.controller";
import type { WalletService } from "./wallet.service";

const KEY = "11111111-2222-3333-4444-555555555555";
const TOPUP = "0b8f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";

const rail = new PaynowRail({
  PAYNOW_BASE_URL: "https://www.paynow.co.zw",
  PAYNOW_RETURN_URL: "https://lyniago.com",
  integrationId: "27383",
  integrationKey: KEY,
  authEmail: "merchant@example.com",
  resultUrl: "https://api.example.com/webhooks/paynow",
});

const req = (body: string) => ({ rawBody: Buffer.from(body) }) as never;
const update = (status: string) =>
  encodePaynowMessage([["reference", TOPUP], ["amount", "5.13"], ["paynowreference", "1234567"], ["pollurl", "https://www.paynow.co.zw/poll"], ["status", status]], KEY);

function wallet(over: Partial<WalletService> = {}) {
  return { reconcileTopup: vi.fn(async () => "credited"), settleTopupFromRail: vi.fn(async () => "declined"), ...over } as unknown as WalletService & {
    reconcileTopup: ReturnType<typeof vi.fn>;
    settleTopupFromRail: ReturnType<typeof vi.fn>;
  };
}

describe("POST /webhooks/paynow", () => {
  it("refuses a forged update (403) and touches nothing", async () => {
    const w = wallet();
    await expect(new PaynowWebhookController(rail, w).receive(req(`reference=${TOPUP}&status=Paid&hash=ABC`))).rejects.toThrow(/hash/i);
    expect(w.reconcileTopup).not.toHaveBeenCalled();
    expect(w.settleTopupFromRail).not.toHaveBeenCalled();
  });

  it("a Paid update is confirmed by re-polling Paynow, and the POLL decides", async () => {
    const w = wallet({ reconcileTopup: vi.fn(async () => "pending") } as never);
    await expect(new PaynowWebhookController(rail, w).receive(req(update("Paid")))).resolves.toEqual({ received: true });
    expect(w.reconcileTopup).toHaveBeenCalledWith(TOPUP);
    // The poll said not paid yet: the update alone credits nothing.
    expect(w.settleTopupFromRail).not.toHaveBeenCalled();
  });

  it("if the re-poll can't be made, the hash-verified Paid update is applied", async () => {
    const w = wallet({ reconcileTopup: vi.fn(async () => { throw new Error("timeout"); }) } as never);
    await new PaynowWebhookController(rail, w).receive(req(update("Paid")));
    expect(w.settleTopupFromRail).toHaveBeenCalledWith(TOPUP, expect.objectContaining({ status: "confirmed", amount: 5.13 }));
  });

  it("a Cancelled update declines without a re-poll", async () => {
    const w = wallet();
    await new PaynowWebhookController(rail, w).receive(req(update("Cancelled")));
    expect(w.reconcileTopup).not.toHaveBeenCalled();
    expect(w.settleTopupFromRail).toHaveBeenCalledWith(TOPUP, expect.objectContaining({ status: "failed" }));
  });

  it("with the stub rail live, a stray delivery is acknowledged and ignored", async () => {
    const w = wallet();
    await expect(new PaynowWebhookController(new StubPaymentRail(), w).receive(req(update("Paid")))).resolves.toEqual({ received: true });
    expect(w.settleTopupFromRail).not.toHaveBeenCalled();
  });
});
