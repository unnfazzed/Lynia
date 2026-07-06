/**
 * HTTP-level authorization e2e for GET /orders/:orderId (gate LR1). Boots the REAL OrdersController +
 * REAL JwtAuthGuard + REAL OrdersService.getSnapshot membership gate over real HTTP (supertest), with
 * ONLY Prisma + external deps mocked. This is the regression net for the R1 IDOR: an authenticated user
 * who is neither the customer nor the assigned rider must get 403, not the order snapshot (live rider
 * GPS, coords, items, timeline) — the exact bug that shipped behind a green unit-test build.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bearer, buildAuthzApp } from "../common/testing/authz-e2e";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

Reflect.defineMetadata("design:paramtypes", [OrdersService], OrdersController);

// A real-looking UUID so the controller's ParseUUIDPipe accepts the path param.
const ORDER_ID = "2f1e9b3c-0000-4000-8000-000000000001";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";

/** Order row the mocked Prisma returns for getSnapshot's findUnique. Owned by CUSTOMER_ID, no rider. */
const orderRow = {
  id: ORDER_ID,
  status: "open_for_offers",
  agreedFare: null,
  proposedFare: "10.00",
  customerId: CUSTOMER_ID,
  // widen from literal `null` so the assigned-rider case can override it with an id
  riderId: null as string | null,
  createdAt: new Date(),
  pickup: { point: { lat: -17.8, lng: 31.0 }, landmark: "A" },
  dropoff: { point: { lat: -17.81, lng: 31.01 }, landmark: "B" },
  items: null,
  itemsCollected: null,
  undeliveredReason: null,
  deliveryAttempts: 0,
  customer: { phone: "+263700000000" },
  rider: null,
  events: [],
};

const prisma = { order: { findUnique: vi.fn(async () => orderRow) } };
// External deps getSnapshot may touch — none are reached on these paths, but wire them safely.
const tracking = { getLivePosition: vi.fn(async () => null) };
const noop = {} as never;

describe("GET /orders/:orderId — HTTP authz (R1 IDOR net)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const orders = new OrdersService(prisma as never, noop, tracking as never, noop, noop);
    app = await buildAuthzApp([OrdersController], [{ provide: OrdersService, useValue: orders }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 when no Authorization header is sent", async () => {
    const res = await request(app.getHttpServer()).get(`/orders/${ORDER_ID}`);
    expect(res.status).toBe(401);
  });

  it("403 for an authenticated user who is neither the customer nor the assigned rider (R1 IDOR)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}`)
      .set("Authorization", bearer(STRANGER_ID));
    expect(res.status).toBe(403);
    // The stranger must get nothing on the wire — not a redacted snapshot.
    expect(res.body).not.toHaveProperty("events");
    expect(res.body).not.toHaveProperty("rider");
  });

  it("returns the snapshot (non-403) for the order's own customer", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}`)
      .set("Authorization", bearer(CUSTOMER_ID));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ORDER_ID, status: "open_for_offers" });
  });

  it("returns the snapshot (non-403) for the assigned rider", async () => {
    prisma.order.findUnique.mockResolvedValueOnce({ ...orderRow, riderId: RIDER_ID });
    const res = await request(app.getHttpServer())
      .get(`/orders/${ORDER_ID}`)
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});
