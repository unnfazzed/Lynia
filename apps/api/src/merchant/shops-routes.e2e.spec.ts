/**
 * Shops & Pharmacy customer read API (ledger D-58) — the golden matrix's shape for the two sections:
 * dead (503, before auth) while their flag is off, alive behind JwtAuthGuard while on, and each request
 * narrowed to the sections that are on and to shops ops have switched on (`pilotEnabled`).
 */
import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { ServiceFlagsResponse } from "@lynia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TokenService } from "../auth/token.service";
import { bearer, TEST_ENV } from "../common/testing/authz-e2e";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { HealthController } from "../health/health.controller";
import { HealthService } from "../health/health.service";
import { MerchantService } from "./merchant.service";
import { ShopsController } from "./shops.controller";
import { ShopsEnabledGuard } from "./shops-enabled.guard";

// esbuild drops design:paramtypes; restore just enough for Nest's reflective DI (as the golden matrix does).
Reflect.defineMetadata("design:paramtypes", [MerchantService, Object], ShopsController);
Reflect.defineMetadata("design:paramtypes", [Object], ShopsEnabledGuard);
Reflect.defineMetadata("design:paramtypes", [HealthService, Object], HealthController);

const ID = "11111111-1111-1111-1111-111111111111";

/** Records the visibility rule each call was given, so a leg can assert what reached the service. */
function stub() {
  const calls: Array<{ fn: string; where: unknown; arg?: string }> = [];
  return {
    calls,
    svc: {
      listShops: async (where: unknown, cursor?: string) => {
        calls.push({ fn: "list", where, arg: cursor });
        return { shops: [] };
      },
      searchShops: async (where: unknown, q?: string) => {
        calls.push({ fn: "search", where, arg: q });
        return { shops: [], items: [] };
      },
      getShopCatalogue: async (where: unknown, id: string) => {
        calls.push({ fn: "catalogue", where, arg: id });
        return { shop: { id }, categories: [] };
      },
    },
  };
}

async function boot(envOverrides: Partial<Env>, svc: object): Promise<INestApplication> {
  const env = { ...TEST_ENV, ...envOverrides } as Env;
  @Module({
    controllers: [ShopsController],
    providers: [{ provide: ENV, useValue: env }, TokenService, JwtAuthGuard, ShopsEnabledGuard, { provide: MerchantService, useValue: svc }],
  })
  class ShopsTestModule {}
  const app = await NestFactory.create(ShopsTestModule, { logger: false, abortOnError: false });
  await app.init();
  return app;
}

describe("Shops & Pharmacy read API (D-58)", () => {
  it("GET /app/service-flags is public, cacheable, and reports both sections OFF under a default env", async () => {
    @Module({
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: TEST_ENV }, { provide: HealthService, useValue: { check: async () => ({}) } }],
    })
    class HealthTestModule {}
    const app = await NestFactory.create(HealthTestModule, { logger: false, abortOnError: false });
    await app.init();
    const res = await request(app.getHttpServer()).get("/app/service-flags");
    expect(res.status).toBe(200);
    expect(ServiceFlagsResponse.parse(res.body)).toEqual({ shopsEnabled: false, pharmacyEnabled: false });
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    await app.close();
  });

  it("both sections off: every route 503s before auth is checked", async () => {
    const app = await boot({}, stub().svc);
    for (const path of ["/shops?service=shops", "/shops?service=pharmacy", "/shops/search?service=shops&q=ab", `/shops/${ID}/catalogue`]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status, path).toBe(503);
    }
    await app.close();
  });

  describe("Shops on, Pharmacy off", () => {
    let app: INestApplication;
    const s = stub();
    beforeAll(async () => {
      app = await boot({ SHOPS_ENABLED: "true", PHARMACY_ENABLED: "false" }, s.svc);
    });
    afterAll(async () => {
      await app?.close();
    });

    it("no auth → 401 (JwtAuthGuard is reached past the flag)", async () => {
      expect((await request(app.getHttpServer()).get("/shops?service=shops")).status).toBe(401);
    });

    it("any signed-in customer lists Shops: live shops, every kind but pharmacy", async () => {
      const res = await request(app.getHttpServer()).get("/shops?service=shops&cursor=c1").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(s.calls.at(-1)).toEqual({ fn: "list", where: { pilotEnabled: true, businessType: "shop", shopKind: { not: "pharmacy" } }, arg: "c1" });
    });

    it("the switched-off Pharmacy section, or no section at all, is 503", async () => {
      for (const path of ["/shops?service=pharmacy", "/shops", "/shops?service=food", "/shops/search?service=pharmacy&q=para"]) {
        const res = await request(app.getHttpServer()).get(path).set("Authorization", bearer("p1", "customer"));
        expect(res.status, path).toBe(503);
      }
    });

    it("a catalogue read is limited to the sections that are on", async () => {
      const res = await request(app.getHttpServer()).get(`/shops/${ID}/catalogue`).set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(s.calls.at(-1)).toEqual({ fn: "catalogue", where: { pilotEnabled: true, businessType: "shop", shopKind: { not: "pharmacy" } }, arg: ID });
    });

    it("search runs inside the section", async () => {
      const res = await request(app.getHttpServer()).get("/shops/search?service=shops&q=brake").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(s.calls.at(-1)).toMatchObject({ fn: "search", arg: "brake" });
    });
  });

  it("both on: Pharmacy lists the pharmacy kind only; a catalogue read may be either section", async () => {
    const s = stub();
    const app = await boot({ SHOPS_ENABLED: "true", PHARMACY_ENABLED: "true" }, s.svc);
    const auth = bearer("p1", "customer");
    expect((await request(app.getHttpServer()).get("/shops?service=pharmacy").set("Authorization", auth)).status).toBe(200);
    expect(s.calls.at(-1)?.where).toEqual({ pilotEnabled: true, businessType: "shop", shopKind: "pharmacy" });
    expect((await request(app.getHttpServer()).get(`/shops/${ID}/catalogue`).set("Authorization", auth)).status).toBe(200);
    expect(s.calls.at(-1)?.where).toEqual({ pilotEnabled: true, businessType: "shop", shopKind: { not: null } });
    await app.close();
  });
});
