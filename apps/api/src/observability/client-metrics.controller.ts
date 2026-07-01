import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ClientMetricsBatch } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { bucketAppVersion, MetricsService } from "./metrics.service";

/**
 * Client RUM ingest — the mobile app posts small, bounded batches of glass-to-glass / REST latency
 * samples. Fire-and-forget: record into the (NoopMeter-safe) instruments and 204. Never persists.
 *
 * Guarded (P0): auth is REQUIRED — the app already holds a bearer token, and an open endpoint would be a
 * free metric-poisoning vector. `@CurrentUser()` proves identity but is NEVER recorded as a label
 * (per-profile cardinality). The `.strict()` batch schema rejects stray fields at the pipe, so no
 * unbounded/PII field can reach an instrument; the only version signal is bucketed via bucketAppVersion.
 */
@Controller("client-metrics")
@UseGuards(JwtAuthGuard)
export class ClientMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post()
  @HttpCode(204)
  ingest(
    @Body(new ZodBody(ClientMetricsBatch)) body: ClientMetricsBatch,
    @CurrentUser() _profileId: string,
  ): { ok: true } {
    const version = bucketAppVersion(body.appVersion);
    for (const sample of body.samples) {
      this.metrics.recordClientSample(sample.event, sample.ms, body.role, version);
    }
    if (body.dropped !== undefined) {
      this.metrics.incClientDropped(body.dropped, body.role);
    }
    return { ok: true };
  }
}
