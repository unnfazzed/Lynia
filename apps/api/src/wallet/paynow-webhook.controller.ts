import { Controller, ForbiddenException, HttpCode, Inject, Logger, Post, type RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { PAYMENT_RAIL, type PaymentRail } from "../adapters/payments/payment-rail.interface";
import { PaynowRail } from "../adapters/payments/paynow-rail";
import { WalletService } from "./wallet.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Paynow status updates (developers.paynow.co.zw › Status Update): Paynow POSTs here, to the `resulturl`
 * of every top-up (`PAYNOW_RESULT_URL` = https://<api-host>/webhooks/paynow), whenever a charge changes
 * state. Unauthenticated by JWT (Paynow has no session) and verified instead by the message hash, like
 * `/webhooks/bird` and `/kyc/callback`.
 *
 * A `Paid` update is confirmed by re-polling Paynow (its own advice) and the POLL decides; only if that
 * poll can't be made at all is the hash-verified update itself applied. Crediting stays exactly-once whichever
 * of the webhook, its retries and the sweep gets there first ({@link WalletService.creditFromTopup}).
 * An error is NOT swallowed: Paynow retries a failed delivery up to ten times, which is what we want
 * when our database blinked. The sweep backstops a delivery that never arrives.
 */
@Controller("webhooks/paynow")
export class PaynowWebhookController {
  private readonly logger = new Logger(PaynowWebhookController.name);

  constructor(
    @Inject(PAYMENT_RAIL) private readonly rail: PaymentRail,
    private readonly wallet: WalletService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    // Paynow isn't the live rail on this deployment (stub): nothing of ours was sent there, so nothing
    // here can be ours. Acknowledge so a stray delivery doesn't retry.
    if (!(this.rail instanceof PaynowRail)) return { received: true };
    const update = this.rail.readStatusUpdate(req.rawBody?.toString("utf8") ?? "");
    if (!update) throw new ForbiddenException("Invalid Paynow hash");
    if (!update.reference || !UUID.test(update.reference)) {
      this.logger.warn(`Paynow update for an unknown reference "${update.reference ?? ""}" (ref ${update.providerRef ?? "?"}) — ignored`);
      return { received: true };
    }
    const topUpId = update.reference;
    if (update.status === "confirmed") {
      try {
        const outcome = await this.wallet.reconcileTopup(topUpId);
        // The poll is the authority: if Paynow's own record doesn't say paid yet, nothing is credited now
        // (the sweep asks again).
        this.logger.log(`Paynow paid update for top-up ${topUpId}: re-poll → ${outcome}`);
        return { received: true };
      } catch (err) {
        this.logger.warn(`Paynow re-poll for top-up ${topUpId} failed (${(err as Error).message}); applying the verified update`);
      }
    }
    const outcome = await this.wallet.settleTopupFromRail(topUpId, update);
    this.logger.log(`Paynow update for top-up ${topUpId}: ${update.reason ?? update.status} → ${outcome}`);
    return { received: true };
  }
}
