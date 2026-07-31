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
  ],
  AdminController,
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const SOS_ID = "22222222-2222-4222-8222-222222222222";

const adminService = { overview: vi.fn(async () => ({ ok: true })) };
const settlements = {};
const sos = { acknowledge: vi.fn(async (id: string) => ({ id, acknowledgedAt: "2026-07-13T10:00:00.000Z" })) };

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
