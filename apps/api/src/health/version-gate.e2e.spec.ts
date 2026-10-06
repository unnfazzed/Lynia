/**
 * HTTP-level check of the per-platform force-update gate (docs/APP-STORE-SUBMISSION.md B5). Boots the
 * REAL HealthController over real HTTP, so the `?platform=` binding and the public cache header are
 * exercised the way a device meets them; health.controller.spec.ts calls the handler directly.
 */
import "reflect-metadata";
import { type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENV } from "../config/config.module";
import { loadEnv } from "../config/env";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

// esbuild drops design:paramtypes (see common/testing/authz-e2e.ts); ENV is injected by its own token.
Reflect.defineMetadata("design:paramtypes", [HealthService, Object], HealthController);

const env = loadEnv({
  DATABASE_URL: "postgresql://localhost/lynia",
  MIN_SUPPORTED_APP_VERSION: "0.52.0",
  MIN_SUPPORTED_APP_VERSION_IOS: "1.0.1",
} as NodeJS.ProcessEnv);

describe("GET /app/version-gate — per platform, over HTTP", () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check: async () => ({}) } },
        { provide: ENV, useValue: env },
      ],
    })
    class VersionGateTestModule {}
    app = await NestFactory.create(VersionGateTestModule, { logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("answers an iPhone with its own minimum, still publicly cacheable", async () => {
    const res = await request(app.getHttpServer()).get("/app/version-gate?platform=ios");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ minSupportedVersion: "1.0.1" });
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("answers Android, and a build that names no platform, with the default minimum", async () => {
    for (const path of ["/app/version-gate?platform=android", "/app/version-gate"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ minSupportedVersion: "0.52.0" });
    }
  });
});

describe("GET /app/version-gate?soft=1 — the soft-update body (First Run v2, ledger D-80 §2 #7)", () => {
  let app: INestApplication;
  const softEnv = loadEnv({
    DATABASE_URL: "postgresql://localhost/lynia",
    MIN_SUPPORTED_APP_VERSION: "0.52.0",
    RECOMMENDED_APP_VERSION: "0.60.0",
    APP_WHATS_NEW: "Faster live tracking",
  } as NodeJS.ProcessEnv);

  beforeAll(async () => {
    @Module({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check: async () => ({}) } },
        { provide: ENV, useValue: softEnv },
      ],
    })
    class SoftGateTestModule {}
    app = await NestFactory.create(SoftGateTestModule, { logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("a build that opts in gets the recommended version and the what's-new line, still cacheable", async () => {
    const res = await request(app.getHttpServer()).get("/app/version-gate?platform=android&soft=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ minSupportedVersion: "0.52.0", recommendedVersion: "0.60.0", whatsNew: "Faster live tracking" });
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("a build that predates it still gets exactly the one strict key", async () => {
    const res = await request(app.getHttpServer()).get("/app/version-gate?platform=android");
    expect(res.body).toEqual({ minSupportedVersion: "0.52.0" });
  });
});
