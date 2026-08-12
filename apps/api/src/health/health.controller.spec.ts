import { describe, expect, it } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { HealthController } from "./health.controller";
import type { HealthReport, HealthService } from "./health.service";

const baseSource = { DATABASE_URL: "postgresql://localhost/lynia" } as NodeJS.ProcessEnv;

function controllerWith(report: HealthReport, source: NodeJS.ProcessEnv = baseSource): HealthController {
  const service = { check: async (): Promise<HealthReport> => report } as HealthService;
  return new HealthController(service, loadEnv(source));
}

const okReport: HealthReport = { status: "ok", db: true, redis: true, provider: "gcp" };

describe("HealthController — healthz", () => {
  it("returns the report when the DB is reachable", async () => {
    await expect(controllerWith(okReport).healthz()).resolves.toEqual(okReport);
  });

  it("answers 503 when the DB is down so the LB pulls the instance", async () => {
    const down: HealthReport = { ...okReport, status: "degraded", db: false };
    await expect(controllerWith(down).healthz()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("HealthController — app/version-gate (server-driven force-update)", () => {
  it("serves the inert default when MIN_SUPPORTED_APP_VERSION is unset", () => {
    expect(controllerWith(okReport).versionGate()).toEqual({ minSupportedVersion: "0.0.0" });
  });

  it("serves the configured minimum", () => {
    const controller = controllerWith(okReport, { ...baseSource, MIN_SUPPORTED_APP_VERSION: "0.2.0" });
    expect(controller.versionGate()).toEqual({ minSupportedVersion: "0.2.0" });
  });

  it("treats a deploy-injected empty value as gate-off (the unset repo Variable injects '')", () => {
    const controller = controllerWith(okReport, { ...baseSource, MIN_SUPPORTED_APP_VERSION: "" });
    expect(controller.versionGate()).toEqual({ minSupportedVersion: "0.0.0" });
  });

  it("rejects a non-dotted-version value at boot rather than serving garbage to every install", () => {
    expect(() => loadEnv({ ...baseSource, MIN_SUPPORTED_APP_VERSION: "latest" })).toThrow(
      /Invalid environment configuration/,
    );
  });
});

describe("HealthController — app/feature-flags (merchant kill switches, plan §0b.3)", () => {
  it("serves the launch-inert all-off default when no flag env is set (fail-safe OFF)", () => {
    expect(controllerWith(okReport).featureFlags()).toEqual({
      restaurantsEnabled: false,
      merchantDispatchAutoEnabled: false,
      merchantWalletEnabled: false,
    });
  });

  it("reports a flag on when its env var is explicitly 'true', leaving the others off", () => {
    const controller = controllerWith(okReport, { ...baseSource, RESTAURANTS_ENABLED: "true" });
    expect(controller.featureFlags()).toEqual({
      restaurantsEnabled: true,
      merchantDispatchAutoEnabled: false,
      merchantWalletEnabled: false,
    });
  });

  it("rejects a malformed flag value at boot instead of guessing (z.enum true/false)", () => {
    expect(() => loadEnv({ ...baseSource, RESTAURANTS_ENABLED: "yes" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("parses against the shared wire contract exactly (strict schema, no extra keys)", async () => {
    const { MerchantFeatureFlagsResponse } = await import("@lynia/shared");
    expect(() => MerchantFeatureFlagsResponse.parse(controllerWith(okReport).featureFlags())).not.toThrow();
  });

  it("stays exactly three fields — a fourth would break every binary already on the internal track", async () => {
    // v0.30.0/v0.31.0 parse this body with their own bundled `.strict()` copy of the contract. An extra
    // key makes their safeParse fail, silently dropping them to DEFAULT_FEATURE_FLAGS and disarming the
    // Restaurants kill switch on handsets no config change can reach. New flags of that class go on
    // `app/preview-flags` instead — see PreviewFlagsResponse.
    expect(Object.keys(controllerWith(okReport).featureFlags()).sort()).toEqual([
      "merchantDispatchAutoEnabled",
      "merchantWalletEnabled",
      "restaurantsEnabled",
    ]);
  });
});

describe("HealthController — app/preview-flags (drawn-but-unbacked payment walkthroughs)", () => {
  it("ships the previews ON by default (owner instruction 2026-08-12: ship what we can ahead of launch)", () => {
    expect(controllerWith(okReport).previewFlags()).toEqual({ paymentSimulationEnabled: true });
  });

  it("retracts both walkthroughs when flipped off — the kill switch, no app update required", () => {
    const controller = controllerWith(okReport, { ...baseSource, PAYMENT_SIMULATION_ENABLED: "false" });
    expect(controller.previewFlags()).toEqual({ paymentSimulationEnabled: false });
  });

  it("rejects a malformed flag value at boot instead of guessing", () => {
    expect(() => loadEnv({ ...baseSource, PAYMENT_SIMULATION_ENABLED: "off" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("parses against the shared wire contract exactly (strict schema, no extra keys)", async () => {
    const { PreviewFlagsResponse } = await import("@lynia/shared");
    expect(() => PreviewFlagsResponse.parse(controllerWith(okReport).previewFlags())).not.toThrow();
  });
});
