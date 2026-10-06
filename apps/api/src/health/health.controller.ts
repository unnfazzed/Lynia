import { Controller, Get, Header, Inject, Query, ServiceUnavailableException } from "@nestjs/common";
import type { MerchantFeatureFlagsResponse, OrderFlagsResponse, ServiceFlagsResponse, VersionGateResponse, VersionGateSoftResponse } from "@lynia/shared";
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
  // every caller on a platform and changes only on a founder config rollout, so any HTTP cache — the
  // device's, or a CDN if one is ever put in front — may serve it for 5 minutes without touching the
  // origin. The gate stays honest: a newly-raised minimum still reaches every cold start within minutes.
  // Per platform (docs/APP-STORE-SUBMISSION.md B5): `?platform=ios` gets the iPhone minimum; anything
  // else, including every build that predates the parameter, gets MIN_SUPPORTED_APP_VERSION. The body
  // shape is unchanged (the contract is `.strict()`, so an added key would fail every installed client's
  // parse and switch its gate off), and the query string keeps each platform's answer a separate cache
  // entry.
  //
  // First Run v2 (ledger D-80 §2 #7): `?soft=1` opts a NEW build into the soft-update body — the same
  // minimum plus `recommendedVersion` (the U4 banner) and `whatsNew` (U1's pill), both null until set.
  // Opt-in, never added to the plain body, for the strictness reason above: a build that predates it
  // never sends `soft`, so it keeps getting exactly `{ minSupportedVersion }`.
  @Get("app/version-gate")
  @Header("Cache-Control", "public, max-age=300")
  versionGate(@Query("platform") platform?: string, @Query("soft") soft?: string): VersionGateResponse | VersionGateSoftResponse {
    const ios = platform === "ios";
    const min = ios ? this.env.MIN_SUPPORTED_APP_VERSION_IOS : this.env.MIN_SUPPORTED_APP_VERSION;
    if (soft !== "1") return { minSupportedVersion: min };
    return {
      minSupportedVersion: min,
      recommendedVersion: (ios ? this.env.RECOMMENDED_APP_VERSION_IOS : this.env.RECOMMENDED_APP_VERSION) ?? null,
      whatsNew: this.env.APP_WHATS_NEW ?? null,
    };
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

  // Shops and Pharmacy kill switches (ledger D-58), public for the same reason as the flags above. A
  // separate body because MerchantFeatureFlagsResponse is strict: two more keys there would fail every
  // installed client's parse.
  @Get("app/service-flags")
  @Header("Cache-Control", "public, max-age=60")
  serviceFlags(): ServiceFlagsResponse {
    return {
      shopsEnabled: this.env.SHOPS_ENABLED === "true",
      pharmacyEnabled: this.env.PHARMACY_ENABLED === "true",
    };
  }

  // Order flow v2's switches (ledger D-59): `rxEnabled` = pharmacy prescriptions (BRIEF §13). Public like
  // the two above. Its own body because ServiceFlagsResponse is strict and installed apps parse it strictly.
  @Get("app/order-flags")
  @Header("Cache-Control", "public, max-age=60")
  orderFlags(): OrderFlagsResponse {
    return { rxEnabled: this.env.RX_ENABLED === "true" };
  }
}
