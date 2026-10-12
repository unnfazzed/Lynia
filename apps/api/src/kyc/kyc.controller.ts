import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  Optional,
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
import { tokens } from "@lynia/shared/tokens";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { RiderService } from "../riders/rider.service";
import { diditEventAt, diditTimestampFresh, verifyDiditSignature, verifyDiditSignatureV2 } from "./didit";
import { applyDiditDecision } from "./didit-decision";

/** The 401 a delivery with a stale (or missing) signed timestamp gets — also how the counter tells it apart. */
const STALE_TIMESTAMP = "Stale webhook timestamp";

// A-02: a decline MUST carry the reason code (recorded on the rider + audit log — a compliance
// invariant, so it's server-enforced here, not only in the admin ConfirmModal). The admin sends a
// canonical KycDeclineReason KEY (e.g. `face_mismatch`), which the rider app maps back to copy via
// KYC_DECLINE_REASON_LABELS; kept a capped free string here (not enum-bound) so the shared list can
// grow without 400ing an older admin build.
export const AdminKyc = z
  .object({
    status: z.enum(["pending", "verified", "failed", "expired"]),
    reasonCode: z.string().min(1).max(160).optional(),
    // Optional ConfirmModal free-text, recorded on the audit row the decision now writes in-transaction.
    note: z.string().max(2000).nullish(),
    // Owner 2026-10-12: a `pending` reset may also give the rider their tries back (kycAttempts → 0, the
    // decline reason cleared), so a locked rider can retry. Only meaningful on a reset.
    resetAttempts: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "failed" && !v.reasonCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "A decline must record a reason." });
    }
    if (v.resetAttempts && v.status !== "pending") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resetAttempts"], message: "Attempts can only be reset with a pending reset." });
    }
  });

/**
 * The /kyc/return landing (see the route's doc comment). Static, self-contained, no reflected input.
 * Colours come from the shared design tokens (the CTA green + ink pair every app face uses) so this
 * page can't drift from the palette; the typeface is the system stack because a redirect landing
 * must not block on a webfont. The `lynia://` link/redirect is the app scheme (apps/mobile
 * app.config.ts `scheme`) — in an in-app browser tab it bounces the tab closed and back to LyniaGo.
 */
const KYC_RETURN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>LyniaGo — ID check</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: ${tokens.color.cta}; color: ${tokens.color.onAccent};
         min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  main { text-align: center; padding: 24px; max-width: 420px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  p { font-size: 16px; line-height: 1.45; margin: 0 0 24px; opacity: .92; }
  a { display: inline-block; background: ${tokens.color.onAccent}; color: ${tokens.color.cta};
      font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 999px;
      padding: 14px 28px; min-height: 24px; }
</style>
</head>
<body>
<main>
  <h1>All done here</h1>
  <p>Head back to the LyniaGo app — we&rsquo;ll take it from there.</p>
  <a href="lynia://">Back to LyniaGo</a>
</main>
<script>setTimeout(function () { location.href = "lynia://"; }, 400);</script>
</body>
</html>
`;

@Controller()
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly riders: RiderService,
    @Inject(ENV) private readonly env: Env,
    // @Global ObservabilityModule, so always injected in the app; optional for the positional spec constructions.
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Didit KYC webhook (status.updated). Verifies the HMAC signature over the raw body, then maps
   * the verification status onto the rider keyed by session_id (== the rider's stored kycRef).
   * KYC-R26-12: fully automatic — Approved verifies, Declined and In Review decline (decideDiditKyc), Kyc
   * Expired expires; only a session Didit never finished judging (Not Started, In Progress, Abandoned,
   * Expired…) stays pending, with its status recorded. Every refusal (401 / 503) is counted
   * (`kyc_webhook_rejected_total`): a run of them means verdicts are being lost.
   */
  @Post("kyc/callback")
  async callback(@Req() req: RawBodyRequest<Request>) {
    try {
      return await this.handleCallback(req);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        this.metrics?.incKycWebhookRejected(err.message === STALE_TIMESTAMP ? "stale_timestamp" : "bad_signature");
      } else if (err instanceof ServiceUnavailableException) {
        this.metrics?.incKycWebhookRejected("unconfigured");
      }
      throw err;
    }
  }

  private async handleCallback(req: RawBodyRequest<Request>) {
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
    }

    let payload: { session_id?: string; status?: string; timestamp?: unknown; webhook_type?: unknown };
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      throw new BadRequestException("Invalid JSON body");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new BadRequestException("Invalid JSON body");

    if (secret) {
      // Replay guard. KYC-R26-06: freshness is judged on the SIGNED body `timestamp` — the X-Timestamp header
      // sits outside both HMACs, so a captured, validly signed body could be replayed forever with a freshly
      // rewritten header. The header is still checked when present (a stale one is refused too), and is the
      // fallback only for a delivery whose body carries no timestamp (a V3 destination always sends one).
      // Fail-closed: no timestamp anywhere is not fresh.
      const now = Date.now();
      const bodyTs = payload.timestamp;
      const headerTs = req.headers["x-timestamp"] as string | undefined;
      const hasBodyTs = typeof bodyTs === "number" || (typeof bodyTs === "string" && bodyTs.trim() !== "");
      const fresh =
        (hasBodyTs || headerTs !== undefined) &&
        (!hasBodyTs || diditTimestampFresh(bodyTs as string | number, now)) &&
        (headerTs === undefined || diditTimestampFresh(headerTs, now));
      if (!fresh) {
        throw new UnauthorizedException(STALE_TIMESTAMP);
      }
    }

    // KYC-R26-07: this route is registered for `status.updated` only. A destination later subscribed to more
    // event types (data.updated, a business/KYB event…) would otherwise feed those bodies through the status
    // mapping because they too carry a session_id and a status. Acknowledged with a 200 — Didit must not retry
    // a delivery we will never apply — and logged. A delivery with no webhook_type keeps the old behaviour.
    if (payload.webhook_type !== undefined && payload.webhook_type !== "status.updated") {
      this.logger.log(`KYC webhook of type ${String(payload.webhook_type).slice(0, 40)} ignored — only status.updated is applied (KYC-R26-07)`);
      return { ignored: true, reason: "webhook_type" };
    }
    if (!payload.session_id || !payload.status) {
      throw new BadRequestException("Missing session_id or status");
    }

    // Event time drives the monotonic guards. The timestamp is part of the signed body (Unix seconds — or
    // millis, normalised, KYC-R26-06), so it can't be forged; fall back to now() only if a delivery omits it.
    const eventAt = diditEventAt(payload.timestamp) ?? new Date();

    // The decision itself — bands, holds, document dedupe, the R26 guards — is shared with the lost-webhook
    // reconciler (KYC-R26-03), so a reconciled verdict is applied exactly like a delivered one.
    return applyDiditDecision(this.riders, this.logger, {
      sessionId: payload.session_id,
      status: payload.status,
      payload,
      eventAt,
      source: "webhook",
      onUnmatched: () => this.metrics?.incKycDecisionUnmatched("webhook"),
    });
  }

  /**
   * Post-verification browser return page — the recommended DIDIT_CALLBACK_URL target
   * (`<api>/kyc/return`). This is the REDIRECT half of the vendor contract (the webhook above is the
   * verdict half): when the rider finishes Didit's hosted flow, the browser surface showing it is
   * sent here.
   *
   * Who actually lands on it:
   *  - The in-app ID-check sheet (mobile src/kyc/KycCheckHost.tsx) intercepts the redirect BEFORE it
   *    loads — leaving the vendor's host is its completion signal — so current builds close the sheet
   *    and never render this page.
   *  - Older shipped builds still open the flow in an in-app browser tab
   *    (`openAuthSessionAsync`). For them this page is the difference between "finished on a dead
   *    webhook URL / vendor end screen" and a branded landing whose `lynia://` redirect bounces the
   *    tab shut and resolves the launch `completed`.
   *
   * Public and unauthenticated by design (the redirect carries no session of ours); serves static
   * HTML with no request data reflected, so there is nothing to sanitise or rate-limit beyond the
   * global limiter.
   */
  @Get("kyc/return")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "public, max-age=300")
  returnPage(): string {
    return KYC_RETURN_HTML;
  }

  /** Manual-review backstop (T7): admin sets a rider's KYC status directly. The decision + its audit
   *  row commit in one transaction (A-01), attributed to the forwarded operator. `resetAttempts` (with a
   *  `pending` reset only) also gives the rider their tries back. */
  @Post("admin/riders/:profileId/kyc")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminSet(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodBody(AdminKyc)) body: z.infer<typeof AdminKyc>,
    @AdminActor() actor: string,
  ) {
    return this.riders.adminSetKyc(profileId, body.status, body.reasonCode ?? null, actor, body.note ?? null, {
      resetAttempts: body.resetAttempts === true,
    });
  }
}
