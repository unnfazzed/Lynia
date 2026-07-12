/**
 * HTTP-level authorization e2e for GET /orders/:orderId/offers (gate LR1). Boots the REAL
 * OffersController + REAL JwtAuthGuard + REAL OffersService.listForOrder owner gate over real HTTP,
 * with ONLY Prisma mocked. Regression net for the R2 IDOR: the bid sheet exposes rider PII, so only
 * the order's own customer may read it — a non-owner authenticated user must get 403.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bearer, buildAuthzApp } from "../common/testing/authz-e2e";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

Reflect.defineMetadata("design:paramtypes", [OffersService], OffersController);

const ORDER_ID = "4d2e9b3c-0000-4000-8000-000000000002";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";

const prisma = {
  order: { findUnique: vi.fn(async () => ({ customerId: CUSTOMER_ID })) },
  offer: { findMany: vi.fn(async () => []) },
  block: { findMany: vi.fn(async () => []) },
};
const noop = {} as never;

describe("GET /orders/:orderId/offers — HTTP authz (R2 IDOR net)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const offers = new OffersService(prisma as never, noop, noop, noop);
    app = await buildAuthzApp([OffersController], [{ provide: OffersService, useValue: offers }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 when no Authorization header is sent", async () => {
    const res = await request(app.getHttpServer()).get(`/orders/${ORDER_ID}/offers`);
    expect(res.status).toBe(401);
  });

  it("403 for an authenticated non-owner (R2 IDOR — bid sheet exposes rider PII)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}/offers`)
      .set("Authorization", bearer(STRANGER_ID));
    expect(res.status).toBe(403);
  });

  it("returns the offers list (non-403) for the owning customer", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}/offers`)
      .set("Authorization", bearer(CUSTOMER_ID));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
