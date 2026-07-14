import { Controller, Get, Inject, Logger, Post, Query, type RawBodyRequest, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { extractFailedDeliveryReasons, verifyMetaSignature, type WhatsappStatusPayload } from "./whatsapp-webhook";

/**
 * Meta WhatsApp Cloud API webhook (INTERFACE-AUDIT WA-01) — the delivery-status half of the OTP send
 * path. Two routes, both required by Meta's subscription model: GET answers the one-time subscribe
 * handshake; POST receives the ongoing `message_status` events. Unauthenticated (no JwtAuthGuard) like
 * `/kyc/callback` — verified instead by signature, mirroring that same fail-closed posture.
 */
@Controller("webhooks/whatsapp")
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Meta's one-time subscription verification: echoes `hub.challenge` back as plain text when
   * `hub.verify_token` matches our configured secret, per Meta's documented handshake. Without a
   * configured token, refuse — there's nothing safe to compare against. `challenge` is Meta-
   * generated and always digits-only per their spec, so it's validated as such before being
   * reflected — defense in depth against a reflected-XSS-shaped response (Express's `res.send`
   * defaults a string body to `text/html`, so an unvalidated echo could otherwise be interpreted
   * as markup by anything treating this endpoint as browser-reachable, even though the verify-
   * token gate already limits who can reach a 200 in practice).
   */
  @Get()
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expected || mode !== "subscribe" || token !== expected || !challenge || !/^\d+$/.test(challenge)) {
      res.status(403).type("text/plain").send("Forbidden");
      return;
    }
    res.status(200).type("text/plain").send(challenge);
  }

  /**
   * Delivery-status events. `POST /messages` (otp-sender.ts) only confirms Meta accepted the send —
   * this is the ONLY signal for an async failure (bad number, quality-rating throttling, recipient
   * blocked the business). Best-effort observability only: logs + a metric per failed status, never a
   * DB write (no send-id ↔ OTP-record correlation exists yet — see WA-01 follow-up). Fails closed on
   * an unsigned/misconfigured deployment, matching `/kyc/callback`'s posture, but a processing error
   * after a valid signature is swallowed (never 500s back to Meta — that would trigger their retry
   * storm for a failure that's purely on our observability side, not the delivery itself).
   */
  @Post()
  receive(@Req() req: RawBodyRequest<Request>): { received: true } {
    const raw = req.rawBody?.toString("utf8") ?? "";
    const secret = this.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      if (this.env.NODE_ENV === "production" || this.env.OTP_CHANNEL === "whatsapp") {
        throw new UnauthorizedException("WhatsApp webhook not configured");
      }
      return { received: true };
    }
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyMetaSignature(raw, sig, secret)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    try {
      const payload = JSON.parse(raw || "{}") as WhatsappStatusPayload;
      for (const reason of extractFailedDeliveryReasons(payload)) {
        this.logger.warn(`WhatsApp OTP delivery failed: ${reason}`);
        this.metrics.incWhatsappOtpDeliveryFailed(reason);
      }
    } catch (err) {
      // Malformed body from an otherwise-authentic (signature-valid) delivery — log and move on.
      this.logger.warn(`WhatsApp webhook body parse failed: ${(err as Error).message}`);
    }
    return { received: true };
  }
}
