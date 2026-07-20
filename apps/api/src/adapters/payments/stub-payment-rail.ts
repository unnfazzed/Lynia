import { Logger } from "@nestjs/common";
import type {
  PaymentRail,
  PaymentRailInitiate,
  PaymentRailLookupOptions,
  PaymentRailResult,
} from "./payment-rail.interface";

/**
 * Inert no-op payment rail — the analogue of `StubKycVendor` / `NoopPush`. The default binding for
 * {@link PaymentRail} until the live EcoCash client (wallet PR2) exists. It moves NO money and never
 * fabricates a `confirmed` result: every call resolves `pending`, so wiring it in by accident can never
 * credit a wallet. It only echoes a deterministic `providerRef` and logs, keeping the seam exercisable
 * (the future poller/reconciler can always call it) without any vendor dependency.
 *
 * Behavior-preserving by construction: nothing consumes this yet, and even once wired a `pending`
 * result is a no-op in `creditFromTopup` (which only credits on the caller's `confirmed` mapping).
 */
export class StubPaymentRail implements PaymentRail {
  private readonly logger = new Logger(StubPaymentRail.name);

  /** Deterministic stub ref derived solely from the intent id, so a replay yields the same value. */
  private ref(topUpId: string): string {
    return `stub_rail_${topUpId}`;
  }

  async initiate(intent: PaymentRailInitiate): Promise<PaymentRailResult> {
    const providerRef = this.ref(intent.topUpId);
    this.logger.debug(
      `payment-rail (stub) initiate rail=${intent.rail} topUpId=${intent.topUpId} amount=${intent.amount} → pending ref=${providerRef}`,
    );
    return { status: "pending", providerRef, rail: intent.rail, amount: intent.amount, reason: "stub rail — no live charge" };
  }

  async confirm(providerRef: string, _options?: PaymentRailLookupOptions): Promise<PaymentRailResult> {
    this.logger.debug(`payment-rail (stub) confirm ref=${providerRef} → pending`);
    return { status: "pending", providerRef, reason: "stub rail — never confirms" };
  }

  async reconcile(providerRef: string, _options?: PaymentRailLookupOptions): Promise<PaymentRailResult> {
    this.logger.debug(`payment-rail (stub) reconcile ref=${providerRef} → pending`);
    return { status: "pending", providerRef, reason: "stub rail — nothing to reconcile" };
  }
}
