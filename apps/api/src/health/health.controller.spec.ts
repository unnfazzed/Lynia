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
