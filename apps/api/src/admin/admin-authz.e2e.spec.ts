/**
 * HTTP-level authorization e2e for the admin surface (gate LR1). Boots the REAL AdminController with
 * the REAL JwtAuthGuard + REAL AdminGuard chain over real HTTP, with the admin/settlements services
 * mocked. Regression net for the admin-role gate: a non-admin JWT must be rejected (403) before any
 * handler runs; only an `admin`-role JWT reaches the handler.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bearer, buildAuthzApp } from "../common/testing/authz-e2e";
import { SettlementsService } from "../settlements/settlements.service";
import { SosService } from "../sos/sos.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminController } from "./admin.controller";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminKycReviewService } from "./admin-kyc-review.service";
import { AdminMerchantsService } from "./admin-merchants.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminRidersService } from "./admin-riders.service";
import { AdminService } from "./admin.service";
import { AdminKitchenService } from "./admin-kitchen.service";
import { AdminMoneyService } from "./admin-money.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminAuditReadService } from "./admin-audit-read.service";
import { AdminLiveService } from "./admin-live.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminPhoneRevealService } from "./admin-phone-reveal.service";
import { AdminMerchantApplicationService } from "./admin-merchant-application.service";
import { AdminSearchService } from "./admin-search.service";
import { AdminTimelineService } from "./admin-timeline.service";

Reflect.defineMetadata(
  "design:paramtypes",
  [
    AdminService,
    AdminOrdersService,
    AdminRidersService,
    AdminKycReviewService,
    AdminCustomersService,
    AdminMerchantsService,
    AdminAuditService,
    SettlementsService,
    SosService,
    WalletService,
    AdminKitchenService,
    AdminMoneyService,
    AdminAuditReadService,
    AdminSearchService,
    AdminTimelineService,
    AdminMerchantApplicationService,
    AdminPeopleService,
    AdminPhoneRevealService,
    AdminLiveService,
  ],
  AdminController,
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const SOS_ID = "22222222-2222-4222-8222-222222222222";

const adminService = { overview: vi.fn(async () => ({ ok: true })) };
const settlements = {};
// Admin console v2 §6: the rider wallet route now serves the biker statement.
const money = { statement: vi.fn(async () => ({ balance: "0.00", ledger: [], nextCursor: null })) };
const sos = { acknowledge: vi.fn(async (id: string) => ({ id, acknowledgedAt: "2026-07-13T10:00:00.000Z" })) };

/** The controller's later collaborators (console v2 PRs 3–7); these suites don't call them. */
const laterServices = [AdminAuditReadService, AdminSearchService, AdminTimelineService, AdminMerchantApplicationService, AdminPeopleService, AdminPhoneRevealService, AdminLiveService].map(
  (provide) => ({ provide, useValue: {} }),
);

describe("GET /admin/overview — HTTP authz (AdminGuard net)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp([AdminController], [
      { provide: AdminService, useValue: adminService },
      { provide: AdminOrdersService, useValue: {} },
      { provide: AdminRidersService, useValue: {} },
      { provide: AdminKycReviewService, useValue: {} },
      { provide: AdminCustomersService, useValue: {} },
      { provide: AdminMerchantsService, useValue: {} },
      { provide: AdminAuditService, useValue: {} },
      { provide: SettlementsService, useValue: settlements },
      { provide: SosService, useValue: sos },
      { provide: WalletService, useValue: {} },
      { provide: AdminKitchenService, useValue: {} },
      { provide: AdminMoneyService, useValue: money },
      ...laterServices,
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 when no Authorization header is sent", async () => {
    const res = await request(app.getHttpServer()).get("/admin/overview");
    expect(res.status).toBe(401);
  });

  it("403 for an authenticated non-admin JWT", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/overview")
      .set("Authorization", bearer(USER_ID, "customer"));
    expect(res.status).toBe(403);
    expect(adminService.overview).not.toHaveBeenCalled();
  });

  it("reaches the handler (non-403) for an admin-role JWT", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/overview")
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /admin/sos/:id/ack — HTTP authz (DS13-06 acknowledge is AdminGuard-gated)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp([AdminController], [
      { provide: AdminService, useValue: adminService },
      { provide: AdminOrdersService, useValue: {} },
      { provide: AdminRidersService, useValue: {} },
      { provide: AdminKycReviewService, useValue: {} },
      { provide: AdminCustomersService, useValue: {} },
      { provide: AdminMerchantsService, useValue: {} },
      { provide: AdminAuditService, useValue: {} },
      { provide: SettlementsService, useValue: settlements },
      { provide: SosService, useValue: sos },
      { provide: WalletService, useValue: {} },
      { provide: AdminKitchenService, useValue: {} },
      { provide: AdminMoneyService, useValue: money },
      ...laterServices,
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 when no Authorization header is sent", async () => {
    const res = await request(app.getHttpServer()).post(`/admin/sos/${SOS_ID}/ack`);
    expect(res.status).toBe(401);
    expect(sos.acknowledge).not.toHaveBeenCalled();
  });

  it("403 for an authenticated non-admin JWT — never reaches the service", async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/sos/${SOS_ID}/ack`)
      .set("Authorization", bearer(USER_ID, "customer"));
    expect(res.status).toBe(403);
    expect(sos.acknowledge).not.toHaveBeenCalled();
  });

  it("reaches the service for an admin-role JWT and returns the updated shape", async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/sos/${SOS_ID}/ack`)
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
    expect(sos.acknowledge).toHaveBeenCalledWith(SOS_ID, expect.any(String));
    expect(res.body).toEqual({ id: SOS_ID, acknowledgedAt: "2026-07-13T10:00:00.000Z" });
  });
});

// Ledger cursors are @db.Uuid row ids. Before the optional ParseUUIDPipe, a malformed ?cursor= /
// ?debtCursor= reached Prisma and 500'd (the query-param vector the path-param ParseUUIDPipe never covered).
describe("admin ledger cursors — optional ParseUUIDPipe", () => {
  let app: INestApplication;
  const riders = {};
  const merchants = { getMerchantDetail: vi.fn(async () => ({ id: SOS_ID })) };

  beforeAll(async () => {
    app = await buildAuthzApp([AdminController], [
      { provide: AdminService, useValue: adminService },
      { provide: AdminOrdersService, useValue: {} },
      { provide: AdminRidersService, useValue: riders },
      { provide: AdminKycReviewService, useValue: {} },
      { provide: AdminCustomersService, useValue: {} },
      { provide: AdminMerchantsService, useValue: merchants },
      { provide: AdminAuditService, useValue: {} },
      { provide: SettlementsService, useValue: settlements },
      { provide: SosService, useValue: sos },
      { provide: WalletService, useValue: {} },
      { provide: AdminKitchenService, useValue: {} },
      { provide: AdminMoneyService, useValue: money },
      ...laterServices,
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("400 (not 500) for a malformed rider-wallet cursor; the service is never reached", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/riders/${USER_ID}/wallet?cursor=not-a-uuid`)
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).toBe(400);
    expect(money.statement).not.toHaveBeenCalled();
  });

  it("forwards a well-formed rider-wallet cursor", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/riders/${USER_ID}/wallet?cursor=${SOS_ID}`)
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).toBe(200);
    expect(money.statement).toHaveBeenCalledWith(USER_ID, SOS_ID);
  });

  it("400 (not 500) for a malformed merchant debtCursor; the service is never reached", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/merchants/${SOS_ID}?debtCursor=not-a-uuid`)
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).toBe(400);
    expect(merchants.getMerchantDetail).not.toHaveBeenCalled();
  });

  it("forwards a well-formed merchant debtCursor", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/merchants/${SOS_ID}?debtCursor=${USER_ID}`)
      .set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(res.status).toBe(200);
    expect(merchants.getMerchantDetail).toHaveBeenCalledWith(SOS_ID, USER_ID);
  });
});

// Admin console v2 §7: the live ops reads carry bikers' positions and the service settings — admin only.
describe("GET /admin/live/* and /admin/config — HTTP authz", () => {
  let app: INestApplication;
  const live = {
    liveOrders: vi.fn(async () => ({ rows: [] })),
    fleet: vi.fn(async () => ({ riders: [], orders: [] })),
    alerts: vi.fn(async () => ({ sosPending: 0 })),
    config: vi.fn(() => ({ kyc: { mode: "manual" } })),
  };

  beforeAll(async () => {
    app = await buildAuthzApp([AdminController], [
      { provide: AdminService, useValue: adminService },
      { provide: AdminOrdersService, useValue: {} },
      { provide: AdminRidersService, useValue: {} },
      { provide: AdminKycReviewService, useValue: {} },
      { provide: AdminCustomersService, useValue: {} },
      { provide: AdminMerchantsService, useValue: {} },
      { provide: AdminAuditService, useValue: {} },
      { provide: SettlementsService, useValue: settlements },
      { provide: SosService, useValue: sos },
      { provide: WalletService, useValue: {} },
      { provide: AdminKitchenService, useValue: {} },
      { provide: AdminMoneyService, useValue: money },
      ...laterServices.filter((p) => p.provide !== AdminLiveService),
      { provide: AdminLiveService, useValue: live },
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(["/admin/live/orders", "/admin/live/fleet", "/admin/alerts", "/admin/config"])("403 for a biker JWT on %s", async (path) => {
    const res = await request(app.getHttpServer()).get(path).set("Authorization", bearer(USER_ID, "rider"));
    expect(res.status).toBe(403);
  });

  it("never reaches the fleet read for a non-admin", () => {
    expect(live.fleet).not.toHaveBeenCalled();
    expect(live.config).not.toHaveBeenCalled();
  });

  it("serves the fleet and the config to an admin", async () => {
    const fleet = await request(app.getHttpServer()).get("/admin/live/fleet").set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(fleet.status).toBe(200);
    expect(fleet.body).toEqual({ riders: [], orders: [] });
    const config = await request(app.getHttpServer()).get("/admin/config").set("Authorization", bearer(ADMIN_ID, "admin"));
    expect(config.status).toBe(200);
    expect(config.body).toEqual({ kyc: { mode: "manual" } });
  });
});

describe("POST /admin/people/:id/reveal-phone — HTTP authz (owner 2026-10-18)", () => {
  let app: INestApplication;
  const phoneReveal = { reveal: vi.fn(async () => ({ phone: "+263771234567" })) };

  beforeAll(async () => {
    app = await buildAuthzApp([AdminController], [
      { provide: AdminService, useValue: adminService },
      { provide: AdminOrdersService, useValue: {} },
      { provide: AdminRidersService, useValue: {} },
      { provide: AdminKycReviewService, useValue: {} },
      { provide: AdminCustomersService, useValue: {} },
      { provide: AdminMerchantsService, useValue: {} },
      { provide: AdminAuditService, useValue: {} },
      { provide: SettlementsService, useValue: settlements },
      { provide: SosService, useValue: sos },
      { provide: WalletService, useValue: {} },
      { provide: AdminKitchenService, useValue: {} },
      { provide: AdminMoneyService, useValue: money },
      ...laterServices.filter((p) => p.provide !== AdminPhoneRevealService),
      { provide: AdminPhoneRevealService, useValue: phoneReveal },
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(["customer", "rider"])("403 for a %s JWT, and never reads the number", async (role) => {
    const res = await request(app.getHttpServer()).post(`/admin/people/${USER_ID}/reveal-phone`).set("Authorization", bearer(USER_ID, role));
    expect(res.status).toBe(403);
    expect(phoneReveal.reveal).not.toHaveBeenCalled();
  });

  it("passes the forwarded operator to the service for an admin JWT", async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/people/${USER_ID}/reveal-phone`)
      .set("Authorization", bearer(ADMIN_ID, "admin"))
      .set("X-Operator", "owner@example.com");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ phone: "+263771234567" });
    expect(phoneReveal.reveal).toHaveBeenCalledWith("owner@example.com", USER_ID);
  });
});
