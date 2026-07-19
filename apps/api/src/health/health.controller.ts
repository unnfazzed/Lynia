import { Controller, Get, Header, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { VersionGateResponse } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { HealthService, type HealthReport } from "./health.service";

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("healthz")
  async healthz(): Promise<HealthReport> {
    const report = await this.health.check();
    // If the DB is unreachable this instance can't serve any real request, so answer 503 (carrying the
    // same report body) — a load-balancer/k8s probe that keys on the HTTP status then pulls the node
    // from rotation instead of routing traffic that will 500. A degraded Redis alone still serves via
    // the PG fallbacks, so that stays 200 (a Redis blip shouldn't 503 every instance at once).
    if (!report.db) throw new ServiceUnavailableException(report);
    return report;
  }

  // Server-driven force-update minimum (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c). Public and
  // unauthenticated by design: the app checks it at cold start BEFORE any sign-in, and a blocked
  // version must still be able to learn it's blocked. "0.0.0" (the default when the
  // MIN_SUPPORTED_APP_VERSION repo Variable is unset) keeps the gate inert; the mobile root layout
  // swaps the whole navigator for the force-update screen when the installed version is below this.
  // Cheap static read — no DB/Redis touched, so it can never add load-shed pressure.
  // `public, max-age` (overriding the global `private, no-cache` default): the body is identical for
  // every caller and changes only on a founder config rollout, so any HTTP cache — the device's, or a
  // CDN if one is ever put in front — may serve it for 5 minutes without touching the origin. The gate
  // stays honest: a newly-raised minimum still reaches every cold start within minutes.
  @Get("app/version-gate")
  @Header("Cache-Control", "public, max-age=300")
  versionGate(): VersionGateResponse {
    return { minSupportedVersion: this.env.MIN_SUPPORTED_APP_VERSION };
  }
}
