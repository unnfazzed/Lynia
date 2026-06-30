import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodBody } from "../common/zod.pipe";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { RiderService } from "../riders/rider.service";
import { diditTimestampFresh, mapDiditStatus, verifyDiditSignature, verifyDiditSignatureV2 } from "./didit";

const AdminKyc = z.object({ status: z.enum(["pending", "verified", "failed"]) });

@Controller()
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly riders: RiderService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Didit KYC webhook (status.updated). Verifies the HMAC signature over the raw body, then maps
   * the verification status onto the rider keyed by session_id (== the rider's stored kycRef).
   * "In Review" and other non-terminal statuses stay pending — the admin backstop resolves them.
   */
  @Post("kyc/callback")
  async callback(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody?.toString("utf8") ?? "";

    const secret = this.env.DIDIT_WEBHOOK_SECRET;
    // Fail-closed: in real-vendor mode the webhook MUST be signed. Without a secret we refuse rather
    // than silently process unsigned bodies — otherwise anyone could flip a rider's KYC by session_id.
    // (Don't rely on the DIDIT_ENABLED deploy flag to enforce this application-level invariant.)
    if (this.env.KYC_PROVIDER === "didit" && !secret) {
      throw new ServiceUnavailableException("KYC webhook not configured");
    }
    if (secret) {
      // Prefer X-Signature-V2 (canonical body — middleware-resilient, Didit's recommended header);
      // fall back to the raw-bytes X-Signature for a delivery that carries only the legacy header.
      const sigV2 = req.headers["x-signature-v2"] as string | undefined;
      const ok = sigV2
        ? verifyDiditSignatureV2(raw, sigV2, secret)
        : verifyDiditSignature(raw, req.headers["x-signature"] as string | undefined, secret);
      if (!ok) {
        throw new UnauthorizedException("Invalid webhook signature");
      }
      // Replay guard: reject a valid-HMAC body whose X-Timestamp is outside the 300s window.
      const ts = req.headers["x-timestamp"] as string | undefined;
      if (!diditTimestampFresh(ts, Date.now())) {
        throw new UnauthorizedException("Stale webhook timestamp");
      }
    }

    let payload: { session_id?: string; status?: string; timestamp?: number };
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      throw new BadRequestException("Invalid JSON body");
    }
    if (!payload.session_id || !payload.status) {
      throw new BadRequestException("Missing session_id or status");
    }

    const mapped = mapDiditStatus(payload.status);
    if (mapped === "pending") return { ignored: true, status: mapped };

    // Event time drives the monotonic guard. The timestamp is part of the signed body (Unix seconds),
    // so it can't be forged; fall back to now() only if a delivery omits it.
    const eventAt = typeof payload.timestamp === "number" ? new Date(payload.timestamp * 1000) : new Date();
    const res = await this.riders.applyKycResult(payload.session_id, mapped, eventAt);
    if (res.updated === 0) {
      // No rider has this ref, or the event was stale/duplicate — surface for reconciliation.
      this.logger.warn(`KYC webhook for session ${payload.session_id} (${mapped}) matched no rider or was stale`);
    }
    return res;
  }

  /** Manual-review backstop (T7): admin sets a rider's KYC status directly. */
  @Post("admin/riders/:profileId/kyc")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminSet(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodBody(AdminKyc)) body: z.infer<typeof AdminKyc>,
  ) {
    return this.riders.adminSetKyc(profileId, body.status);
  }
}
