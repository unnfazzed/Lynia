import { Controller, Get, Header, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { MerchantFeatureFlagsResponse, PreviewFlagsResponse, VersionGateResponse } from "@lynia/shared";
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

  // Merchant-vertical kill switches (docs/plans/2026-07-26-merchant-verticals-plan.md §0b.3).
  // Public and unauthenticated by the same reasoning as the version gate: the app reads it at cold
  // start BEFORE sign-in, and a dark Restaurants tab must be able to learn it's dark. Server truth
  // is the env flags — flipping one is a Cloud Run env update; with max-age=60 every device
  // converges within a minute of the new revision serving. Cohort gating (WHICH merchants/devices
  // are in the pilot) is deliberately NOT here — that's authenticated domain data, and this
  // endpoint must stay a cheap static read that can never add load-shed pressure.
  @Get("app/feature-flags")
  @Header("Cache-Control", "public, max-age=60")
  featureFlags(): MerchantFeatureFlagsResponse {
    return {
      restaurantsEnabled: this.env.RESTAURANTS_ENABLED === "true",
      merchantDispatchAutoEnabled: this.env.MERCHANT_DISPATCH_AUTO_ENABLED === "true",
      merchantWalletEnabled: this.env.MERCHANT_WALLET_ENABLED === "true",
    };
  }

  // Kill switches for drawn-but-unbacked surfaces — today, the two payment walkthroughs that stand in
  // for the mobile-money rail nobody has built yet (rider top-up, food-checkout prompt/decline).
  // Deliberately NOT merged into `app/feature-flags`: that response is `.strict()` and the binaries
  // already on the internal track parse it with their own bundled copy, so a fourth field would make
  // them reject the body and fall back to defaults — disarming the Restaurants kill switch on installs
  // we cannot reach without a store release. Same cheap-static-read, same public-before-sign-in
  // reasoning, same 60s convergence as the flags above.
  @Get("app/preview-flags")
  @Header("Cache-Control", "public, max-age=60")
  previewFlags(): PreviewFlagsResponse {
    return { paymentSimulationEnabled: this.env.PAYMENT_SIMULATION_ENABLED === "true" };
  }
}
