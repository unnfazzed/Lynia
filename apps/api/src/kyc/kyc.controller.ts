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
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { RiderService } from "../riders/rider.service";
import { decideDiditKyc, diditTimestampFresh, extractDiditDocumentNumber, extractDiditScore, verifyDiditSignature, verifyDiditSignatureV2 } from "./didit";

// A-02: a decline MUST carry the reason code (recorded on the rider + audit log — a compliance
// invariant, so it's server-enforced here, not only in the admin ConfirmModal). The admin sends a
// canonical KycDeclineReason KEY (e.g. `face_mismatch`), which the rider app maps back to copy via
// KYC_DECLINE_REASON_LABELS; kept a capped free string here (not enum-bound) so the shared list can
// grow without 400ing an older admin build.
const AdminKyc = z
  .object({
    status: z.enum(["pending", "verified", "failed", "expired"]),
    reasonCode: z.string().min(1).max(160).optional(),
    // Optional ConfirmModal free-text, recorded on the audit row the decision now writes in-transaction.
    note: z.string().max(2000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "failed" && !v.reasonCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "A decline must record a reason." });
    }
  });

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
    // Fail-closed: the webhook MUST be signed whenever it could carry real vendor traffic — ALWAYS in
    // production (any provider), and always in `didit` mode even in dev. Without a secret we refuse
    // rather than silently process an unsigned body anyone could forge to flip a rider's KYC by
    // session_id. This is deliberately wider than just `didit` mode: production also permits
    // KYC_PROVIDER=stub with KYC_MODE=manual (the launch guard only blocks stub+auto), and that config
    // would otherwise leave this route processing unsigned bodies. Only a NON-production stub deployment
    // (vendor-free CI/QA, which drives KYC inline and never uses this callback) may process unsigned.
    if (!secret && (this.env.NODE_ENV === "production" || this.env.KYC_PROVIDER === "didit")) {
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

    // Auto-decision (Didit thresholds): key off the numeric face-match score when the payload exposes
    // one (KYC_THRESHOLDS bands), else fall back to the status-string mapping. A `needsReview` band —
    // like any non-terminal status — stays `pending`: it's held for the admin backstop, never
    // auto-verified. `failed` from a sub-threshold score carries a decline reason for the rider app.
    const decision = decideDiditKyc(payload.status, extractDiditScore(payload));
    if (decision.status === "pending") return { ignored: true, status: decision.status };

    // Event time drives the monotonic guard. The timestamp is part of the signed body (Unix seconds),
    // so it can't be forged; fall back to now() only if a delivery omits it.
    const eventAt = typeof payload.timestamp === "number" ? new Date(payload.timestamp * 1000) : new Date();
    const res = await this.riders.applyKycResult(
      payload.session_id,
      decision.status,
      eventAt,
      decision.reason ?? null,
      // IR26-04: the document number the vendor verified (or null when the payload omits it — the
      // service degrades to typed-ID-only dedupe and logs the coverage gap). Hashed downstream; the
      // raw number is never persisted or logged.
      extractDiditDocumentNumber(payload),
    );
    if (res.updated === 0) {
      // No rider has this ref, or the event was stale/duplicate — surface for reconciliation.
      this.logger.warn(`KYC webhook for session ${payload.session_id} (${decision.status}) matched no rider or was stale`);
    }
    return res;
  }

  /** Manual-review backstop (T7): admin sets a rider's KYC status directly. The decision + its audit
   *  row commit in one transaction (A-01), attributed to the forwarded operator. */
  @Post("admin/riders/:profileId/kyc")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminSet(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodBody(AdminKyc)) body: z.infer<typeof AdminKyc>,
    @AdminActor() actor: string,
  ) {
    return this.riders.adminSetKyc(profileId, body.status, body.reasonCode ?? null, actor, body.note ?? null);
  }
}
