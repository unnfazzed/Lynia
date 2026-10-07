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
 *      a caller on no business → 403 (MerchantGuard — membership, not the JWT role claim, since the
 *      merchant web upgrade L1); a member → 200 (genuinely alive end to end, not just "guard passed
 *      then crashed"); the customer read API needs no membership → 200.
 * Import-coupling (matching/offers/orders never importing merchant code) is separately enforced by
 * the depcruise `express-no-merchant-coupling` rule.
 */
import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
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
import { MerchantBookingController } from "../merchant/merchant-booking.controller";
import { MerchantBookingService } from "../merchant/merchant-booking.service";
import { MerchantRidersController } from "../merchant/merchant-riders.controller";
import { MerchantRidersService } from "../merchant/merchant-riders.service";
import { MerchantInvitesService } from "../merchant/merchant-invites.service";
import { MerchantInvitesController, MerchantTeamController } from "../merchant/merchant-team.controller";
import { MerchantBranchesController } from "../merchant/merchant-branches.controller";
import { MerchantBranchesService } from "../merchant/merchant-branches.service";
import { MerchantTeamService } from "../merchant/merchant-team.service";
import { MerchantController } from "../merchant/merchant.controller";
import { MerchantGuard } from "../merchant/merchant.guard";
import { MerchantOrderController } from "../merchant/merchant-order.controller";
import { MerchantService } from "../merchant/merchant.service";
import { RestaurantsController } from "../merchant/restaurants.controller";
import { RestaurantsEnabledGuard } from "../merchant/restaurants-enabled.guard";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
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
// for Nest's reflective DI to construct these real controllers + the guards with injected
// dependencies: RestaurantsEnabledGuard's ENV, and (merchant web upgrade L1) MerchantGuard's
// PrismaService + Reflector, since membership is now a per-request DB read.
Reflect.defineMetadata("design:paramtypes", [MerchantService], MerchantController);
Reflect.defineMetadata("design:paramtypes", [MerchantService], RestaurantsController);
Reflect.defineMetadata("design:paramtypes", [Object], RestaurantsEnabledGuard);
Reflect.defineMetadata("design:paramtypes", [PrismaService, Reflector], MerchantGuard);

/** L1: MerchantGuard reads `merchant_members`. "member-1" owns m1 and "staff-1" works there as staff (both
 *  with a CUSTOMER role claim — the claim is no longer read); every other profile is on no business. No
 *  legacy owners. */
const prismaStub = {
  merchantMember: {
    // The resolver reads the caller's active row (multi-branch owners); each profile here is on one business.
    findFirst: async ({ where }: { where: { profileId: string } }) =>
      where.profileId === "member-1"
        ? { merchantId: "m1", role: "owner", merchant: { businessType: "restaurant" } }
        : where.profileId === "staff-1"
          ? { merchantId: "m1", role: "staff", merchant: { businessType: "restaurant" } }
          : null,
  },
  merchant: { findFirst: async () => null },
};
// C2: the two new food-order controllers, same reflective-DI patch shape.
// C4: both controllers also take FoodDebtService now (the doorstep handshake + debt-ledger routes);
// MerchantOrderController's real constructor also always took FoodDispatchService (C3) — listed here
// in full now (with a stub provider below) rather than relying on Nest's undefined-slot leniency for
// an unexercised param, since a 3-arg constructor with a 1-entry paramtypes array is fragile.
Reflect.defineMetadata("design:paramtypes", [FoodOrderService, FoodDebtService], FoodOrderController);
Reflect.defineMetadata("design:paramtypes", [FoodOrderService, FoodDispatchService, FoodDebtService], MerchantOrderController);
// Merchant web upgrade L2: Book a rider, same patch shape. L3: Your riders. L4: Team (both sides).
Reflect.defineMetadata("design:paramtypes", [MerchantBookingService], MerchantBookingController);
Reflect.defineMetadata("design:paramtypes", [MerchantRidersService], MerchantRidersController);
Reflect.defineMetadata("design:paramtypes", [MerchantTeamService], MerchantTeamController);
Reflect.defineMetadata("design:paramtypes", [MerchantInvitesService], MerchantInvitesController);
// Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md): list, switch, open a branch.
Reflect.defineMetadata("design:paramtypes", [MerchantBranchesService], MerchantBranchesController);

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
    businessType: "restaurant",
    shopKind: null,
    myRole: "owner",
  }),
  listRestaurants: async () => ({ restaurants: [] }),
  // L5: echoes the duration it was given, so the leg below can see what reached the service.
  setDishOutOfStock: async (_profileId: string, id: string, forHowLong?: string) => ({ id, forHowLong: forHowLong ?? null }),
};

/** C2: never reached by the flags-off/no-auth/wrong-role legs, same shape as merchantServiceStub —
 *  just enough for the "genuinely alive" legs to prove real controller → real service wiring. */
const foodOrderServiceStub = {
  listQueue: async () => [],
  getMyOrder: async () => ({ id: "o1", merchantId: "m1", status: "requested", merchantPhase: "awaiting_accept" }),
};

// C3/C4/C5: FoodDispatchService and FoodDebtService are real constructor dependencies of
// MerchantOrderController/FoodOrderController now — empty stubs are enough to satisfy DI without
// pulling in TrackingGateway/NotificationsService/etc, except getOfferForRider (C5 rider offer
// alarm channel poll fallback), which one golden-matrix leg below DOES call through.
const foodDispatchServiceStub = { getOfferForRider: async () => null };
/** L2: only the member leg below calls through. */
const merchantBookingServiceStub = { list: async () => [] };
/** L3: only the member and owner legs below call through. */
const merchantRidersServiceStub = {
  list: async () => ({ riders: [], cap: 20 }),
  add: async () => ({ id: "r1" }),
};
/** L4: only the owner, staff-leave and invitee legs below call through. */
const merchantTeamServiceStub = {
  team: async () => ({ members: [], invites: [] }),
  invite: async () => ({ id: "i1" }),
  leave: async () => ({ ok: true }),
};
const merchantInvitesServiceStub = { mine: async () => ({ invites: [] }) };
/** Multi-branch owners: only the member, switch and owner legs below call through. */
const merchantBranchesServiceStub = {
  list: async () => ({ branches: [] }),
  switchTo: async () => ({ id: "m1" }),
  create: async () => ({ id: "m2" }),
};
const foodDebtServiceStub = {};

/** Boots the REAL merchant/restaurant controllers (+ real guards) with a chosen env — the only way
 *  to exercise flags-off vs flags-on behavior, since the flag is read once per guard instance at
 *  request time, not baked into AppModule's static import graph. */
async function bootMerchantApp(envOverrides: Partial<Env>): Promise<INestApplication> {
  const env = { ...TEST_ENV, ...envOverrides } as Env;
  @Module({
    controllers: [
      MerchantController,
      RestaurantsController,
      FoodOrderController,
      MerchantOrderController,
      MerchantBookingController,
      MerchantRidersController,
      MerchantTeamController,
      MerchantInvitesController,
      MerchantBranchesController,
    ],
    providers: [
      { provide: ENV, useValue: env },
      { provide: PrismaService, useValue: prismaStub },
      TokenService,
      JwtAuthGuard,
      MerchantGuard,
      RestaurantsEnabledGuard,
      { provide: MerchantService, useValue: merchantServiceStub },
      { provide: FoodOrderService, useValue: foodOrderServiceStub },
      { provide: FoodDispatchService, useValue: foodDispatchServiceStub },
      { provide: FoodDebtService, useValue: foodDebtServiceStub },
      { provide: MerchantBookingService, useValue: merchantBookingServiceStub },
      { provide: MerchantRidersService, useValue: merchantRidersServiceStub },
      { provide: MerchantTeamService, useValue: merchantTeamServiceStub },
      { provide: MerchantInvitesService, useValue: merchantInvitesServiceStub },
      { provide: MerchantBranchesService, useValue: merchantBranchesServiceStub },
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
      "MerchantBookingController",
      "MerchantBranchesController",
      "MerchantController",
      "MerchantInvitesController",
      "MerchantOrderController",
      "MerchantRidersController",
      "MerchantTeamController",
      "OrderFlowCustomerController",
      "OrderFlowMerchantController",
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
    // join the same fail-safe-OFF proof as the C1 routes. C5: /merchant/orders/dispatch/offer (the
    // rider offer alarm channel's poll fallback) is the newest flagged surface.
    for (const path of [
      "/merchant/me",
      "/merchant/categories",
      "/restaurants",
      "/merchant/orders",
      "/restaurants/orders/11111111-1111-1111-1111-111111111111",
      "/merchant/orders/dispatch/offer",
      // Merchant web upgrade L2: the kill switch stops shop bookings too (plan §11 F1.4, CEO-4). L3: riders.
      // L4: the team, and the invites waiting for a number.
      "/merchant/bookings",
      "/merchant/riders",
      "/merchant/team",
      "/merchant/invites",
      // Multi-branch owners.
      "/merchant/branches",
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

    it("a valid token for a profile on no business → 403 (MerchantGuard), even with a stale merchant role claim", async () => {
      const res = await request(app.getHttpServer()).get("/merchant/me").set("Authorization", bearer("p1", "merchant"));
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe("not_a_member");
    });

    it("a member → 200, real controller through to the real service (the role claim isn't read)", async () => {
      const res = await request(app.getHttpServer()).get("/merchant/me").set("Authorization", bearer("member-1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Test Kitchen");
    });

    it("the customer read API needs no merchant role — any authenticated caller gets 200", async () => {
      const res = await request(app.getHttpServer()).get("/restaurants").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ restaurants: [] });
    });

    it("GET /restaurants?cursor= rejects a malformed cursor with 400, never a Prisma uuid-cast 500 (DRS-03)", async () => {
      const res = await request(app.getHttpServer()).get("/restaurants?cursor=not-a-uuid").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(400);
      const ok = await request(app.getHttpServer())
        .get("/restaurants?cursor=11111111-1111-1111-1111-111111111111")
        .set("Authorization", bearer("p1", "customer"));
      expect(ok.status).toBe(200);
    });

    it("C2: /merchant/orders needs membership — no auth 401, not a member 403, member 200", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/orders");
      expect(noAuth.status).toBe(401);
      const notMember = await request(app.getHttpServer()).get("/merchant/orders").set("Authorization", bearer("p1", "merchant"));
      expect(notMember.status).toBe(403);
      const asMember = await request(app.getHttpServer()).get("/merchant/orders").set("Authorization", bearer("member-1", "customer"));
      expect(asMember.status).toBe(200);
      expect(asMember.body).toEqual([]);
    });

    it("C2: /restaurants/orders/:id needs no merchant role — any authenticated caller gets 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/restaurants/orders/11111111-1111-1111-1111-111111111111")
        .set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("o1");
    });

    it("L2: /merchant/bookings needs membership — no auth 401, not a member 403, member 200", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/bookings");
      expect(noAuth.status).toBe(401);
      const notMember = await request(app.getHttpServer()).get("/merchant/bookings").set("Authorization", bearer("p1", "merchant"));
      expect(notMember.status).toBe(403);
      expect(notMember.body.reason).toBe("not_a_member");
      const asMember = await request(app.getHttpServer()).get("/merchant/bookings").set("Authorization", bearer("member-1", "customer"));
      expect(asMember.status).toBe(200);
      expect(asMember.body).toEqual([]);
    });

    it("L3: /merchant/riders — the team reads it, only the owner changes it", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/riders");
      expect(noAuth.status).toBe(401);
      const notMember = await request(app.getHttpServer()).get("/merchant/riders").set("Authorization", bearer("p1", "merchant"));
      expect(notMember.status).toBe(403);
      const staffRead = await request(app.getHttpServer()).get("/merchant/riders").set("Authorization", bearer("staff-1", "customer"));
      expect(staffRead.status).toBe(200);
      expect(staffRead.body).toEqual({ riders: [], cap: 20 });
      const body = { label: "Blessing", phone: "0772223333" };
      const staffAdd = await request(app.getHttpServer()).post("/merchant/riders").set("Authorization", bearer("staff-1", "customer")).send(body);
      expect(staffAdd.status).toBe(403);
      expect(staffAdd.body.reason).toBe("owner_only");
      const ownerAdd = await request(app.getHttpServer()).post("/merchant/riders").set("Authorization", bearer("member-1", "customer")).send(body);
      expect(ownerAdd.status).toBe(201);
    });

    it("L4: /merchant/team is the owner's; staff may only leave", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/team");
      expect(noAuth.status).toBe(401);
      const notMember = await request(app.getHttpServer()).get("/merchant/team").set("Authorization", bearer("p1", "merchant"));
      expect(notMember.status).toBe(403);
      expect(notMember.body.reason).toBe("not_a_member");
      const staffRead = await request(app.getHttpServer()).get("/merchant/team").set("Authorization", bearer("staff-1", "customer"));
      expect(staffRead.status).toBe(403);
      expect(staffRead.body.reason).toBe("owner_only");
      const body = { name: "Chipo", phone: "0773000003" };
      const staffInvite = await request(app.getHttpServer()).post("/merchant/team/invites").set("Authorization", bearer("staff-1", "customer")).send(body);
      expect(staffInvite.status).toBe(403);
      expect(staffInvite.body.reason).toBe("owner_only");
      const staffRemove = await request(app.getHttpServer())
        .delete("/merchant/team/members/11111111-1111-4111-8111-111111111111")
        .set("Authorization", bearer("staff-1", "customer"));
      expect(staffRemove.status).toBe(403);
      const staffCancel = await request(app.getHttpServer())
        .delete("/merchant/team/invites/11111111-1111-4111-8111-111111111111")
        .set("Authorization", bearer("staff-1", "customer"));
      expect(staffCancel.status).toBe(403);
      const ownerRead = await request(app.getHttpServer()).get("/merchant/team").set("Authorization", bearer("member-1", "customer"));
      expect(ownerRead.status).toBe(200);
      expect(ownerRead.body).toEqual({ members: [], invites: [] });
      const ownerInvite = await request(app.getHttpServer()).post("/merchant/team/invites").set("Authorization", bearer("member-1", "customer")).send(body);
      expect(ownerInvite.status).toBe(201);
      const staffLeave = await request(app.getHttpServer()).post("/merchant/team/leave").set("Authorization", bearer("staff-1", "customer"));
      expect(staffLeave.status).toBe(200);
    });

    it("branches: anyone on a business lists and switches; only the owner opens one", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/branches");
      expect(noAuth.status).toBe(401);
      const notMember = await request(app.getHttpServer()).get("/merchant/branches").set("Authorization", bearer("p1", "merchant"));
      expect(notMember.status).toBe(403);
      expect(notMember.body.reason).toBe("not_a_member");
      const staffList = await request(app.getHttpServer()).get("/merchant/branches").set("Authorization", bearer("staff-1", "customer"));
      expect(staffList.status).toBe(200);
      const staffSwitch = await request(app.getHttpServer())
        .post("/merchant/branches/switch")
        .set("Authorization", bearer("staff-1", "customer"))
        .send({ merchantId: "11111111-1111-4111-8111-111111111111" });
      expect(staffSwitch.status).toBe(200);
      const badSwitch = await request(app.getHttpServer()).post("/merchant/branches/switch").set("Authorization", bearer("member-1", "customer")).send({ merchantId: "m2" });
      expect(badSwitch.status).toBe(400);
      const body = { name: "Test Kitchen · Avondale", location: { point: { lat: -17.8, lng: 31.05 }, contactPhone: "+263771234567" } };
      const staffOpen = await request(app.getHttpServer()).post("/merchant/branches").set("Authorization", bearer("staff-1", "customer")).send(body);
      expect(staffOpen.status).toBe(403);
      expect(staffOpen.body.reason).toBe("owner_only");
      const ownerOpen = await request(app.getHttpServer()).post("/merchant/branches").set("Authorization", bearer("member-1", "customer")).send(body);
      expect(ownerOpen.status).toBe(201);
      expect(ownerOpen.body).toEqual({ id: "m2" });
    });

    it("L5: Staff mark a dish out of stock for how long they choose; no body still means the rest of today", async () => {
      const path = "/merchant/dishes/11111111-1111-4111-8111-111111111111/out-of-stock";
      const noBody = await request(app.getHttpServer()).post(path).set("Authorization", bearer("staff-1", "customer"));
      expect(noBody.status).toBe(201);
      expect(noBody.body.forHowLong).toBeNull();
      const hour = await request(app.getHttpServer()).post(path).set("Authorization", bearer("staff-1", "customer")).send({ for: "one_hour" });
      expect(hour.status).toBe(201);
      expect(hour.body.forHowLong).toBe("one_hour");
      const bad = await request(app.getHttpServer()).post(path).set("Authorization", bearer("staff-1", "customer")).send({ for: "forever" });
      expect(bad.status).toBe(400);
    });

    it("L4: /merchant/invites is for a number on no business yet — any signed-in caller, no MerchantGuard", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/invites");
      expect(noAuth.status).toBe(401);
      const res = await request(app.getHttpServer()).get("/merchant/invites").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ invites: [] });
      // Join needs the one-tap terms line.
      const noTerms = await request(app.getHttpServer())
        .post("/merchant/invites/11111111-1111-4111-8111-111111111111/join")
        .set("Authorization", bearer("p1", "customer"))
        .send({ name: "Chipo" });
      expect(noTerms.status).toBe(400);
    });

    it("C5: /merchant/orders/dispatch/offer is a rider action — no MerchantGuard, any authenticated caller gets 200", async () => {
      const noAuth = await request(app.getHttpServer()).get("/merchant/orders/dispatch/offer");
      expect(noAuth.status).toBe(401);
      const res = await request(app.getHttpServer()).get("/merchant/orders/dispatch/offer").set("Authorization", bearer("p1", "customer"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ offer: null });
    });
  });
});
