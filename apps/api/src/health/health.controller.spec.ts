import { describe, expect, it } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { VersionGateResponse, VersionGateSoftResponse } from "@lynia/shared";
import { loadEnv } from "../config/env";
import { HealthController } from "./health.controller";
import type { HealthReport, HealthService } from "./health.service";

const baseSource = { DATABASE_URL: "postgresql://localhost/lynia" } as NodeJS.ProcessEnv;

function controllerWith(report: HealthReport, source: NodeJS.ProcessEnv = baseSource): HealthController {
  const service = { check: async (): Promise<HealthReport> => report } as HealthService;
  return new HealthController(service, loadEnv(source));
}

const okReport: HealthReport = {
  status: "ok",
  db: true,
  redis: true,
  queues: { offerExpiry: true, orderLifecycle: true },
  provider: "gcp",
};

describe("HealthController — healthz", () => {
  it("returns the report when the DB is reachable", async () => {
    await expect(controllerWith(okReport).healthz()).resolves.toEqual(okReport);
  });

  it("answers 503 when the DB is down so the LB pulls the instance", async () => {
    const down: HealthReport = { ...okReport, status: "degraded", db: false };
    await expect(controllerWith(down).healthz()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("Redis down stays 200 (degraded body) — a Redis blip must not 503 every instance", async () => {
    const redisDown: HealthReport = { ...okReport, status: "degraded", redis: false };
    await expect(controllerWith(redisDown).healthz()).resolves.toEqual(redisDown);
  });

  it("E6: a dead BullMQ queue stays 200 with status degraded (deploy gates key on status)", async () => {
    const queueDown: HealthReport = {
      ...okReport,
      status: "degraded",
      queues: { offerExpiry: false, orderLifecycle: true },
    };
    await expect(controllerWith(queueDown).healthz()).resolves.toEqual(queueDown);
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

  // docs/APP-STORE-SUBMISSION.md B5: iPhones have their own minimum, so an Android-driven bump can't
  // lock them out while their update still waits on App Review.
  it("serves the iPhone minimum to ?platform=ios, and MIN_SUPPORTED_APP_VERSION to everyone else", () => {
    const controller = controllerWith(okReport, {
      ...baseSource,
      MIN_SUPPORTED_APP_VERSION: "0.52.0",
      MIN_SUPPORTED_APP_VERSION_IOS: "1.0.1",
    });
    expect(controller.versionGate("ios")).toEqual({ minSupportedVersion: "1.0.1" });
    expect(controller.versionGate("android")).toEqual({ minSupportedVersion: "0.52.0" });
    // Every build installed before the parameter existed sends none (and a stray value is not iOS).
    expect(controller.versionGate()).toEqual({ minSupportedVersion: "0.52.0" });
    expect(controller.versionGate("IOS")).toEqual({ minSupportedVersion: "0.52.0" });
  });

  it("leaves iPhones ungated when only the Android minimum is raised", () => {
    const controller = controllerWith(okReport, { ...baseSource, MIN_SUPPORTED_APP_VERSION: "0.52.0" });
    expect(controller.versionGate("ios")).toEqual({ minSupportedVersion: "0.0.0" });
  });

  it("treats a deploy-injected empty iPhone value as gate-off, and rejects a malformed one at boot", () => {
    const controller = controllerWith(okReport, { ...baseSource, MIN_SUPPORTED_APP_VERSION_IOS: "" });
    expect(controller.versionGate("ios")).toEqual({ minSupportedVersion: "0.0.0" });
    expect(() => loadEnv({ ...baseSource, MIN_SUPPORTED_APP_VERSION_IOS: "1.0-beta" })).toThrow(
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
    // The binaries already on the internal track parse this body with their own bundled `.strict()`
    // copy of the contract. An extra key makes their safeParse fail, silently dropping them to
    // DEFAULT_FEATURE_FLAGS and disarming the Restaurants kill switch on handsets no config change can
    // reach. A new flag of this class needs its own endpoint, not a fourth field here.
    expect(Object.keys(controllerWith(okReport).featureFlags()).sort()).toEqual([
      "merchantDispatchAutoEnabled",
      "merchantWalletEnabled",
      "restaurantsEnabled",
    ]);
  });
});

describe("HealthController — app/version-gate soft update (First Run v2 U1/U4, ledger D-82 §2 #7)", () => {
  it("the plain body never grows: an installed build parses it strictly, so ?soft is opt-in", () => {
    const controller = controllerWith(okReport, { ...baseSource, RECOMMENDED_APP_VERSION: "0.60.0", APP_WHATS_NEW: "Faster live tracking" });
    expect(controller.versionGate()).toEqual({ minSupportedVersion: "0.0.0" });
    expect(controller.versionGate("android")).toEqual({ minSupportedVersion: "0.0.0" });
    expect(controller.versionGate("android", "0")).toEqual({ minSupportedVersion: "0.0.0" });
    expect(VersionGateResponse.safeParse(controller.versionGate("android")).success).toBe(true);
  });

  it("is off (null, null) by default for a build that asks", () => {
    const body = controllerWith(okReport).versionGate("android", "1");
    expect(body).toEqual({ minSupportedVersion: "0.0.0", recommendedVersion: null, whatsNew: null });
    expect(VersionGateSoftResponse.safeParse(body).success).toBe(true);
  });

  it("serves the recommended version per platform and the what's-new line", () => {
    const controller = controllerWith(okReport, {
      ...baseSource,
      MIN_SUPPORTED_APP_VERSION: "0.50.0",
      RECOMMENDED_APP_VERSION: "0.60.0",
      RECOMMENDED_APP_VERSION_IOS: "1.2.0",
      APP_WHATS_NEW: "  Faster live tracking ",
    });
    expect(controller.versionGate("android", "1")).toEqual({ minSupportedVersion: "0.50.0", recommendedVersion: "0.60.0", whatsNew: "Faster live tracking" });
    expect(controller.versionGate("ios", "1")).toEqual({ minSupportedVersion: "0.0.0", recommendedVersion: "1.2.0", whatsNew: "Faster live tracking" });
  });

  it("treats deploy-injected empty values as off and rejects a malformed version or an over-long line at boot", () => {
    const body = controllerWith(okReport, { ...baseSource, RECOMMENDED_APP_VERSION: "", RECOMMENDED_APP_VERSION_IOS: "", APP_WHATS_NEW: "  " }).versionGate("android", "1");
    expect(body).toEqual({ minSupportedVersion: "0.0.0", recommendedVersion: null, whatsNew: null });
    expect(() => loadEnv({ ...baseSource, RECOMMENDED_APP_VERSION: "next" })).toThrow();
    expect(() => loadEnv({ ...baseSource, APP_WHATS_NEW: "x".repeat(81) })).toThrow();
  });
});

