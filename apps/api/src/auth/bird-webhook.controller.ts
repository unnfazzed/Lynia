import { Controller, Inject, Logger, Post, type RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { type BirdSmsEvent, extractDeliveryFailure, isWebhookTimestampFresh, verifyBirdSignature } from "./bird-webhook";

/**
 * Bird SMS delivery-status webhook — the asynchronous half of the OTP send path. The send itself
 * only ever learns that Bird returned 202 Accepted; whether the SMS reached the handset arrives
 * here, minutes later, as an `sms.*` event.
 *
 * One route, unauthenticated by JWT (Bird has no session) and verified instead by signature —
 * the same fail-closed posture as `/kyc/callback` and the WhatsApp webhook.
 *
 * Register the endpoint with Bird pointing at `https://<api-host>/webhooks/bird`, subscribed to the
 * delivery-status events, and store the returned `whsec_…` secret as BIRD_WEBHOOK_SECRET — Bird
 * returns it exactly once at creation and it cannot be retrieved again.
 */
@Controller("webhooks/bird")
export class BirdWebhookController {
  private readonly logger = new Logger(BirdWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Delivery-status events. Best-effort observability only: logs + a metric per non-delivery, never
   * a DB write — there is no send-id ↔ OTP-record correlation to update (the send logs its `sms_id`
   * next to the masked number, so a failure here is traceable through logs). Fails closed on an
   * unsigned/misconfigured deployment, but a processing error *after* a valid signature is swallowed:
   * 500ing back to Bird would trigger its retry storm for a failure that is purely on our
   * observability side, not the delivery itself.
   */
  @Post()
  receive(@Req() req: RawBodyRequest<Request>): { received: true } {
    const raw = req.rawBody?.toString("utf8") ?? "";
    const secret = this.env.BIRD_WEBHOOK_SECRET;
    if (!secret) {
      // Unconfigured is only tolerable where Bird isn't the live OTP channel (local dev, CI).
      if (this.env.NODE_ENV === "production" || this.env.OTP_CHANNEL === "bird") {
        throw new UnauthorizedException("Bird webhook not configured");
      }
      return { received: true };
    }

    const id = req.headers["webhook-id"] as string | undefined;
    const timestamp = req.headers["webhook-timestamp"] as string | undefined;
    const signature = req.headers["webhook-signature"] as string | undefined;

    if (!verifyBirdSignature(raw, { id, timestamp, signature }, secret)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    // Checked AFTER the signature so an unauthenticated caller learns nothing from the difference,
    // and because the signature is what makes the timestamp trustworthy in the first place.
    if (!isWebhookTimestampFresh(timestamp, Math.floor(Date.now() / 1000))) {
      throw new UnauthorizedException("Webhook timestamp outside the replay window");
    }

    try {
      const failure = extractDeliveryFailure(JSON.parse(raw || "{}") as BirdSmsEvent);
      if (failure) {
        this.logger.warn(
          `Bird OTP delivery ${failure.status} (code=${failure.code}, sms_id=${failure.smsId}) — the recipient never got the code.`,
        );
        this.metrics.incBirdOtpDeliveryFailed(failure.status, failure.code);
      }
    } catch (err) {
      // Malformed body on an otherwise-authentic (signature-valid) delivery — log and move on.
      this.logger.warn(`Bird webhook body parse failed: ${(err as Error).message}`);
    }
    return { received: true };
  }
}
