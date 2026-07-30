/**
 * Golden-matrix tripwire: merchant surfaces are DEAD while the vertical is disabled, and provably
 * ALIVE (guards + real routes) once it's flagged on (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md
 * §5 Lane C; audit doc docs/plans/2026-07-27-status-keyed-query-audit.md "P0 exit-gate status").
 *
 * C1 landed the first real merchant controllers (MerchantController + RestaurantsController,
 * registered unconditionally in AppModule — see merchant.module.ts), so "dead while off" can no
 * longer mean "the controller doesn't exist" (the pre-C1 shape this file used to assert). It now
 * means: RestaurantsEnabledGuard rejects with 503 BEFORE auth is even checked, on every route,
 * every time the flag isn't exactly "true" — the fail-safe-OFF kill switch the plan requires. This
 * is the "seeded-cohort leg" the status-keyed-query-audit doc's "P0 exit-gate status" section
 * flagged as deferred to "the first P1 PR" — this is that PR.
 *
 * Assertions, in load-bearing order:
 *   1. GET /app/feature-flags publicly reports the merchant block DISABLED under a default env.
 *   2. Metadata walk (no app instantiation, no DB): every controller anywhere in the real
 *      AppModule graph whose path matches /^\/?(merchant|restaurants)/i must carry
 *      RestaurantsEnabledGuard in its class-level guard chain — a structural tripwire that catches
 *      ANY future merchant-domain controller that forgets the kill switch, not just today's two.
 *   3. Flags-off (absent and explicit "false") HTTP legs: every merchant/restaurant route 503s with
 *      no auth header at all — the guard fires first.
 *   4. Flags-on HTTP legs against the REAL controllers: no auth → 401 (JwtAuthGuard, now reached);
 *      wrong role → 403 (MerchantGuard); merchant role → 200 (genuinely alive end to end, not just
 *      "guard passed then crashed"); the customer read API needs no merchant role → 200.
 * Import-coupling (matching/offers/orders never importing merchant code) is separately enforced by
 * the depcruise `express-no-merchant-coupling` rule.
 */
import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { MerchantFeatureFlagsResponse } from "@lynia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { bearer, TEST_ENV } from "../common/testing/authz-e2e";
import { FoodDebtService } from "../merchant/food-debt.service";
import { FoodDispatchService } from "../merchant/food-dispatch.service";
import { FoodOrderController } from "../merchant/food-order.controller";
import { FoodOrderService } from "../merchant/food-order.service";
import { MerchantController } from "../merchant/merchant.controller";
import { MerchantGuard } from "../merchant/merchant.guard";
import { MerchantOrderController } from "../merchant/merchant-order.controller";
import { MerchantService } from "../merchant/merchant.service";
import { RestaurantsController } from "../merchant/restaurants.controller";
import { RestaurantsEnabledGuard } from "../merchant/restaurants-enabled.guard";
import { AppModule } from "../app.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

/** Walk the static module graph (handles dynamic-module `{ module, imports, controllers }` shapes)
 *  and collect every controller class + path, without instantiating anything. */
function collectControllers(mod: unknown, seen = new Set<unknown>()): Array<{ name: string; path: string; cls: unknown }> {
  if (!mod || seen.has(mod)) return [];
  seen.add(mod);
  const cls = (mod as { module?: unknown }).module ?? mod;
  const dynamic = mod as { controllers?: unknown[]; imports?: unknown[] };
  const controllers = [
    ...((Reflect.getMetadata("controllers", cls) as unknown[] | undefined) ?? []),
    ...(dynamic.controllers ?? []),
  ];
  const imports = [
    ...((Reflect.getMetadata("imports", cls) as unknown[] | undefined) ?? []),
    ...(cls === mod ? [] : (dynamic.imports ?? [])),
  ];
  const found = controllers.map((c) => ({
    name: (c as { name?: string }).name ?? "anonymous",
    path: String(Reflect.getMetadata("path", c as object) ?? ""),
    cls: c,
  }));
  return [...found, ...imports.flatMap((m) => collectControllers(m, seen))];
}

Reflect.defineMetadata("design:paramtypes", [HealthService, Object], HealthController);
// esbuild (vitest's transform) drops emitDecoratorMetadata design:paramtypes — restore just enough
// for Nest's reflective DI to construct these two real controllers + the one guard with an injected
// dependency (RestaurantsEnabledGuard's ENV). MerchantGuard has no constructor params, so it needs
// no patch (see authz-e2e.ts's AdminGuard, the same shape).
Reflect.defineMetadata("design:paramtypes", [MerchantService], MerchantController);
Reflect.defineMetadata("design:paramtypes", [MerchantService], RestaurantsController);
Reflect.defineMetadata("design:paramtypes", [Object], RestaurantsEnabledGuard);
// C2: the two new food-order controllers, same reflective-DI patch shape.
// C4: both controllers also take FoodDebtService now (the doorstep handshake + debt-ledger routes);
// MerchantOrderController's real constructor also always took FoodDispatchService (C3) — listed here
// in full now (with a stub provider below) rather than relying on Nest's undefined-slot leniency for
// an unexercised param, since a 3-arg constructor with a 1-entry paramtypes array is fragile.
Reflect.defineMetadata("design:paramtypes", [FoodOrderService, FoodDebtService], FoodOrderController);
Reflect.defineMetadata("design:paramtypes", [FoodOrderService, FoodDispatchService, FoodDebtService], MerchantOrderController);

const healthService = { check: async () => ({ status: "ok", db: true, redis: true, provider: "test" }) };

/** Never reached by the flags-off legs (the guard rejects first) or the wrong-role/no-auth legs
 *  (MerchantGuard/JwtAuthGuard reject first) — only the "genuinely alive" legs call through, so a
 *  minimal canned response is enough to prove the real controller → real service wiring works. */
const merchantServiceStub = {
  getMyMerchant: async () => ({
    id: "m1",
    name: "Test Kitchen",
    ownerPhoneMasked: "+263••••••4567",
    description: null,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: null,
    cashRule: "collect_and_return",
    busy: false,
    pilotEnabled: false,
  }),
  listRestaurants: async () => ({ restaurants: [] }),
};

/** C2: never reached by the flags-off/no-auth/wrong-role legs, same shape as merchantServiceStub —
 *  just enough for the "genuinely alive" legs to prove real controller → real service wiring. */
const foodOrderServiceStub = {
  listQueue: async () => [],
  getMyOrder: async () => ({ id: "o1", merchantId: "m1", status: "requested", merchantPhase: "awaiting_accept" }),
};

// C3/C4: FoodDispatchService and FoodDebtService are real constructor dependencies of
// MerchantOrderController/FoodOrderController now, but none of the golden-matrix routes below call
// any of their methods — empty stubs are enough to satisfy DI without pulling in TrackingGateway/
// NotificationsService/etc.
const foodDispatchServiceStub = {};
const foodDebtServiceStub = {};

/** Boots the REAL merchant/restaurant controllers (+ real guards) with a chosen env — the only way
 *  to exercise flags-off vs flags-on behavior, since the flag is read once per guard instance at
 *  request time, not baked into AppModule's static import graph. */
async function bootMerchantApp(envOverrides: Partial<Env>): Promise<INestApplication> {
  const env = { ...TEST_ENV, ...envOverrides } as Env;
  @Module({
    controllers: [MerchantController, RestaurantsController, FoodOrderController, MerchantOrderController],
    providers: [
      { provide: ENV, useValue: env },
      TokenService,
      JwtAuthGuard,
      MerchantGuard,
      RestaurantsEnabledGuard,
      { provide: MerchantService, useValue: merchantServiceStub },
      { provide: FoodOrderService, useValue: foodOrderServiceStub },
      { provide: FoodDispatchService, useValue: foodDispatchServiceStub },
      { provide: FoodDebtService, useValue: foodDebtServiceStub },
    ],
  })
  class MerchantTestModule {}
  // abortOnError:false — Nest's default on an unresolved DI graph is a hard `process.abort()`
  // (see nest-factory.js's handleInitializationError), which kills the whole test worker with no
  // usable stack trace. False makes a bad provider wiring throw a normal, catchable error instead.
  const app = await NestFactory.create(MerchantTestModule, { logger: false, abortOnError: false });
  await app.init();
  return app;
}

describe("merchant surfaces are dead when disabled, alive behind guards when enabled (golden matrix)", () => {
  let healthApp: INestApplication;

  beforeAll(async () => {
    // TEST_ENV carries no merchant flag vars at all — the flags-absent leg. HealthController's
    // `=== "true"` reads make absent and explicitly-"false" indistinguishable by construction.
    @Module({
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: TEST_ENV }, { provide: HealthService, useValue: healthService }],
    })
    class HealthTestModule {}
    healthApp = await NestFactory.create(HealthTestModule, { logger: false, abortOnError: false });
    await healthApp.init();
  });
  afterAll(async () => {
    await healthApp?.close();
  });

  it("GET /app/feature-flags is public and reports every merchant flag OFF under a default env", async () => {
    const res = await request(healthApp.getHttpServer()).get("/app/feature-flags");
    expect(res.status).toBe(200);
    // Parse through the strict shared contract — shape drift fails here before any client sees it.
    expect(MerchantFeatureFlagsResponse.parse(res.body)).toEqual({
      restaurantsEnabled: false,
      merchantDispatchAutoEnabled: false,
      merchantWalletEnabled: false,
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("every merchant/restaurant controller in the real AppModule graph carries RestaurantsEnabledGuard (structural tripwire)", () => {
    const controllers = collectControllers(AppModule);
    // Sanity: the walk actually sees the app (health controller must be present) — guards against
    // this assertion passing vacuously if Nest ever changes its metadata keys.
    expect(controllers.some((c) => c.name === "HealthController")).toBe(true);

    const merchantDomainControllers = controllers.filter((c) => /^\/?(merchant|restaurants)/i.test(c.path));
    // C1 landed the first two; C2 added FoodOrderController (customer-facing, `restaurants` prefix)
    // and MerchantOrderController (kitchen-facing, `merchant/orders` prefix) — if this list changes
    // again, a NEW merchant-domain controller registered somewhere in AppModule; the guard-chain
    // assertion below is what actually matters.
    expect(merchantDomainControllers.map((c) => c.name).sort()).toEqual([
      "FoodOrderController",
      "MerchantController",
      "MerchantOrderController",
      "RestaurantsController",
    ]);

    for (const c of merchantDomainControllers) {
      const guards = (Reflect.getMetadata("__guards__", c.cls as object) as unknown[] | undefined) ?? [];
      expect(guards, `${c.name} must carry RestaurantsEnabledGuard`).toContain(RestaurantsEnabledGuard);
    }
  });

  it("flags-off (absent): every merchant/restaurant route 503s before auth is even checked", async () => {
    const app = await bootMerchantApp({});
    // C2: /merchant/orders (MerchantOrderController) and /restaurants/orders/:id (FoodOrderController)
    // join the same fail-safe-OFF proof as the C1 routes.
    for (const path of [
      "/merchant/me",
      "/merchant/categories",
      "/restaurants",
      "/merchant/orders",
      "/restaurants/orders/11111111-1111-1111-1111-111111111111",
    ]) {
      const res = await request(app.getHttpServer()).get(path); // no Authorization header at all
      expect(res.status, `${path} must be dead (503) while RESTAURANTS_ENABLED is unset`).toBe(503);
    }
    await app.close();
  });

  it("flags-off (explicit \"false\"): same 503s — absent and false are indistinguishable", async () => {
    const app = await bootMerchantApp({ RESTAURANTS_ENABLED: "false" });
    const res = await request(app.getHttpServer()).get("/merchant/me");
    expect(res.status).toBe(503);
    await app.close();
  });

  describe("flags-on: the real routes are genuinely alive, behind the normal auth/role gates", () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootMerchantApp({ RESTAURANTS_ENABLED: "true" });
    });
    afterAll(async () => {
      await app?.close();
    });

    it("no auth header → 401 (JwtAuthGuard, now reached past the flag check)", async () => {
      const res = await request(app.getHttpServer()).get("/merchant/me");
      expect(res.status).toBe(401);
    });

    it("a valid non-merchant token → 403 (MerchantGuard)", async () => {
      const res = await request(app.getHttpServer()).get("/merchant/me").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(403);
    });

    it("a valid merchant token → 200, real controller through to the real service", async () => {
      const res = await request(app.getHttpServer()).get("/merchant/me").set("Authorization", bearer("p1", "merchant"));
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Test Kitchen");
    });

    it("the customer read API needs no merchant role — any authenticated caller gets 200", async () => {
      const res = await request(app.getHttpServer()).get("/restaurants").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ restaurants: [] });
    });

    it("C2: /merchant/orders needs the merchant role — no auth 401, wrong role 403, merchant 200", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/orders");
      expect(noAuth.status).toBe(401);
      const wrongRole = await request(app.getHttpServer()).get("/merchant/orders").set("Authorization", bearer("p1", "customer"));
      expect(wrongRole.status).toBe(403);
      const asMerchant = await request(app.getHttpServer()).get("/merchant/orders").set("Authorization", bearer("p1", "merchant"));
      expect(asMerchant.status).toBe(200);
      expect(asMerchant.body).toEqual([]);
    });

    it("C2: /restaurants/orders/:id needs no merchant role — any authenticated caller gets 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/restaurants/orders/11111111-1111-1111-1111-111111111111")
        .set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("o1");
    });
  });
});
