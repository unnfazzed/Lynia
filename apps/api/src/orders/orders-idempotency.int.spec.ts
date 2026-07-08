/**
 * Order-create idempotency concurrency proof (BUG-HUNT). Runs against a real Postgres database
 * (needs DATABASE_URL) so the partial unique index — not just the pre-check — is what's actually
 * proven to prevent a duplicate live auction when a client's retry races its own original request.
 */
import type { CreateOrderRequest } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { TrackingService } from "../tracking/tracking.service";
import { OrdersService } from "./orders.service";

const prisma = new PrismaService();
// Every collaborator here is either fire-and-forget or off the create() write path we're proving —
// real only where the race actually needs to be real: PrismaService.
const noopExpiry = { schedule: async () => {} } as unknown as OfferExpiryService;
const noopTracking = { nearbyRiders: async () => [], getLivePosition: async () => null } as unknown as TrackingService;
const noopNotifications = { notifyNewBroadcast: async () => {} } as unknown as NotificationsService;
const noopGateway = { emitBoardNewOrder: () => {}, emitOffersChanged: () => {} } as unknown as TrackingGateway;
const orders = new OrdersService(prisma, noopExpiry, noopTracking, noopNotifications, noopGateway);

async function clean(): Promise<void> {
  await prisma.orderEvent.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function makeCustomer(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "customer", firstName: "Tendai", lastName: "M", phone: `c_${crypto.randomUUID()}` },
    select: { id: true },
  });
  return p.id;
}

const baseInput: CreateOrderRequest = {
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
  itemDescription: "Documents",
  declaredValue: 10,
  proposedFare: 2.5,
};

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("order-create idempotency concurrency", () => {
  it("a client retry racing its own original request creates EXACTLY ONE order, not two", async () => {
    const customer = await makeCustomer();
    const input: CreateOrderRequest = { ...baseInput, idempotencyKey: crypto.randomUUID() };

    // Simulates a client that timed out on the first response and fired an identical retry before
    // the original had committed — both requests race prisma.order.create with the same key.
    const results = await Promise.all([orders.create(input, customer), orders.create(input, customer)]);

    // Both calls resolve successfully (no spurious 5xx from the race)...
    expect(results).toHaveLength(2);
    // ...and BOTH point at the same order — the loser of the race returns the winner's row, not a
    // failure and not a second row.
    expect(results[0].id).toBe(results[1].id);

    const rows = await prisma.order.count({ where: { customerId: customer, idempotencyKey: input.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("a genuinely new compose attempt (fresh key) always opens its own order", async () => {
    const customer = await makeCustomer();

    const [a, b] = await Promise.all([
      orders.create({ ...baseInput, idempotencyKey: crypto.randomUUID() }, customer),
      orders.create({ ...baseInput, idempotencyKey: crypto.randomUUID() }, customer),
    ]);

    expect(a.id).not.toBe(b.id);
    const rows = await prisma.order.count({ where: { customerId: customer } });
    expect(rows).toBe(2);
  });

  it("an old client that never sends a key keeps the pre-existing no-dedupe behavior", async () => {
    const customer = await makeCustomer();

    const [a, b] = await Promise.all([orders.create(baseInput, customer), orders.create(baseInput, customer)]);

    // No key ⇒ no dedup ⇒ two distinct orders, same as before this fix.
    expect(a.id).not.toBe(b.id);
  });
});
