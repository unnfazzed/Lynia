import { BoardNewOrderEvent, type CreateOrderRequest, OFFER_WINDOW_MS, quoteFare } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { NearbyRider, TrackingService } from "../tracking/tracking.service";
import { OrdersService } from "./orders.service";

const orderInput: CreateOrderRequest = {
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
  itemDescription: "Documents",
  declaredValue: 10,
  proposedFare: 2.5,
};

// Inert collaborators for the read paths (create's broadcast is exercised explicitly below).
// getLivePosition returns null (no Redis) so getSnapshot falls back to the PG rider columns.
const noTracking = {
  nearbyRiders: async (): Promise<NearbyRider[]> => [],
  getLivePosition: async () => null,
} as unknown as TrackingService;
const noNotifications = { notifyNewBroadcast: async (): Promise<void> => {} } as unknown as NotificationsService;
/** Fake WS gateway — the board push is best-effort; spy on it, never hit a real socket. */
const fakeGateway = () => ({ emitOffersChanged: vi.fn(), emitBoardNewOrder: vi.fn() });
const noGateway = fakeGateway() as unknown as TrackingGateway;
/** Let the fire-and-forget post-commit broadcast settle so its calls are observable. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("OrdersService.create", () => {
  it("opens the order for offers, prices a distance-based anchor, and schedules window expiry", async () => {
    let created: Record<string, unknown> | undefined;
    let scheduledId: string | undefined;
    const quote = quoteFare(orderInput.pickup.point, orderInput.dropoff.point);
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {
            id: "ord-1",
            status: "open_for_offers",
            itemDesc: "Documents",
            proposedFare: { toString: () => "2.50" },
            suggestedFare: { toString: () => quote.suggestedFare.toFixed(2) },
            distanceKm: quote.distanceKm,
            createdAt: new Date("2026-06-26T00:00:00Z"),
          };
        },
      },
    };
    const expiry = { schedule: async (id: string) => { scheduledId = id; } } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications, noGateway);

    const res = await svc.create(orderInput, "cust-1");

    expect(res).toMatchObject({ id: "ord-1", status: "open_for_offers", proposedFare: "2.50" });
    expect(res.distanceKm).toBe(quote.distanceKm);
    expect(scheduledId).toBe("ord-1");
    expect(created).toMatchObject({
      customerId: "cust-1",
      status: "open_for_offers",
      proposedFare: 2.5,
      itemDesc: "Documents",
    });
    // suggested fare is the system's distance-based anchor, independent of the customer's proposal
    expect(created!.suggestedFare).toBe(quote.suggestedFare);
    expect(created!.distanceKm).toBe(quote.distanceKm);
    expect(created!.suggestedFare).not.toBe(created!.proposedFare);
  });

  it("legacy itemDescription-only create: itemDesc stays the raw string, items normalizes to one qty-1 row", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {
            id: "ord-1",
            status: "open_for_offers",
            itemDesc: "Documents",
            proposedFare: { toString: () => "2.50" },
            suggestedFare: { toString: () => "2.40" },
            distanceKm: 1.5,
            createdAt: new Date("2026-06-26T00:00:00Z"),
          };
        },
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications, noGateway);

    await svc.create(orderInput, "cust-1");

    // Canonical direction: items is always written; the single qty-1 row summarizes back to the
    // exact legacy string, so old clients produce byte-identical itemDesc rows.
    expect(created!.itemDesc).toBe("Documents");
    expect(created!.items).toEqual([{ description: "Documents", quantity: 1 }]);
  });

  it("line-items create: stores items and writes the summarized string into itemDesc", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {
            id: "ord-1",
            status: "open_for_offers",
            itemDesc: args.data.itemDesc,
            proposedFare: { toString: () => "2.50" },
            suggestedFare: { toString: () => "2.40" },
            distanceKm: 1.5,
            createdAt: new Date("2026-06-26T00:00:00Z"),
          };
        },
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications, noGateway);

    const items = [
      { description: "Documents", quantity: 2 },
      { description: "Phone charger", quantity: 1 },
    ];
    // items wins over a stray legacy itemDescription when both arrive (contract rule).
    await svc.create({ ...orderInput, items }, "cust-1");

    expect(created!.items).toEqual(items);
    // Every itemDesc consumer (board, history, admin) reads the compact summary unchanged.
    expect(created!.itemDesc).toBe("2× Documents · 1× Phone charger");
  });

  it("pushes the new order to nearby online riders post-commit (CONCEPT §3.10), best-effort", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const nearbyRiders = vi.fn(async () => [{ profileId: "rider-1", distanceM: 800 }] as NearbyRider[]);
    const notifyNewBroadcast = vi.fn(async () => {});
    // claim → null (no Redis) exercises the fallback: every nearby rider is pushed.
    const tracking = { nearbyRiders, claimBroadcastRecipients: async () => null } as unknown as TrackingService;
    const notifications = { notifyNewBroadcast } as unknown as NotificationsService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, notifications, noGateway);

    await svc.create(orderInput, "cust-1");
    await flush();

    // The pickup point drives the PostGIS radius lookup; matched riders get the broadcast push.
    expect(nearbyRiders).toHaveBeenCalledWith(orderInput.pickup.point.lat, orderInput.pickup.point.lng, expect.any(Number));
    expect(notifyNewBroadcast).toHaveBeenCalledWith("ord-1", ["rider-1"], { pickup: "Eastgate", fare: "2.50" });
  });

  it("seeds the per-order sent set and pushes only the CLAIMED riders (widening-broadcast dedupe)", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const nearby = [
      { profileId: "rider-1", distanceM: 800 },
      { profileId: "rider-2", distanceM: 1200 },
    ] as NearbyRider[];
    // Redis says rider-2 was already claimed (e.g. a create replay) — only rider-1 gets the push.
    const claimBroadcastRecipients = vi.fn(async () => ["rider-1"]);
    const notifyNewBroadcast = vi.fn(async () => {});
    const tracking = { nearbyRiders: async () => nearby, claimBroadcastRecipients } as unknown as TrackingService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, { notifyNewBroadcast } as unknown as NotificationsService, noGateway);

    await svc.create(orderInput, "cust-1");
    await flush();

    expect(claimBroadcastRecipients).toHaveBeenCalledWith("ord-1", ["rider-1", "rider-2"]);
    expect(notifyNewBroadcast).toHaveBeenCalledWith("ord-1", ["rider-1"], { pickup: "Eastgate", fare: "2.50" });
  });

  it("never fails the create when the broadcast push throws", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const tracking = { nearbyRiders: async () => { throw new Error("postgis down"); } } as unknown as TrackingService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, noNotifications, noGateway);

    await expect(svc.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
    await flush();
  });

  it("returns ridersNearby = the online-rider count at broadcast time (2·b1)", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const twoRiders = [
      { profileId: "r-1", distanceM: 800 },
      { profileId: "r-2", distanceM: 1200 },
    ] as NearbyRider[];
    const tracking = { nearbyRiders: async () => twoRiders } as unknown as TrackingService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, { notifyNewBroadcast: async () => {} } as unknown as NotificationsService, noGateway);
    await expect(svc.create(orderInput, "cust-1")).resolves.toMatchObject({ ridersNearby: 2 });
    await flush();
  });

  it("returns ridersNearby = 0 when nobody is online nearby, and null when supply can't be resolved", async () => {
    const mk = (tracking: TrackingService) => {
      const prisma = {
        profile: { findUnique: async () => ({ onHold: false }) },
        order: {
          create: async () => ({
            id: "ord-1",
            status: "open_for_offers",
            itemDesc: "Documents",
            proposedFare: { toString: () => "2.50" },
            suggestedFare: { toString: () => "2.40" },
            distanceKm: 1.5,
            createdAt: new Date("2026-06-26T00:00:00Z"),
          }),
        },
      };
      return new OrdersService(prisma as unknown as PrismaService, { schedule: async () => {} } as unknown as OfferExpiryService, tracking, noNotifications, noGateway);
    };
    // Zero online riders nearby → an honest 0 (drives the "no riders online" state), not null.
    await expect(mk({ nearbyRiders: async () => [] } as unknown as TrackingService).create(orderInput, "cust-1")).resolves.toMatchObject({ ridersNearby: 0 });
    // A geo-query failure → null ("supply unknown"), so the client keeps the calm "finding" fallback.
    await expect(mk({ nearbyRiders: async () => { throw new Error("postgis down"); } } as unknown as TrackingService).create(orderInput, "cust-1")).resolves.toMatchObject({ ridersNearby: null });
    await flush();
  });

  it("pushes a REDACTED board:new-order event — no contactPhone anywhere in pickup/dropoff", async () => {
    const orderId = "22222222-2222-4222-8222-222222222222";
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: orderId,
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const tracking = { nearbyRiders: async () => [{ profileId: "rider-1", distanceM: 800 }] as NearbyRider[] } as unknown as TrackingService;
    const gateway = fakeGateway();
    const svc = new OrdersService(
      prisma as unknown as PrismaService,
      expiry,
      tracking,
      noNotifications,
      gateway as unknown as TrackingGateway,
    );

    await svc.create(orderInput, "cust-1");
    await flush();

    expect(gateway.emitBoardNewOrder).toHaveBeenCalledTimes(1);
    const payload = gateway.emitBoardNewOrder.mock.calls[0]![0];
    // Redaction: point + landmark only, and NEVER the customer's/recipient's phone anywhere.
    expect(payload.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(payload.dropoff).toEqual({ point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" });
    expect(JSON.stringify(payload)).not.toContain("+263");
    // The wire contract's `.strict()` PublicWaypoint accepts this redacted payload and would reject a
    // stray contactPhone — parsing here proves the emitted shape matches the shared contract.
    expect(() => BoardNewOrderEvent.parse(payload)).not.toThrow();
  });

  it("BoardNewOrderEvent REJECTS a pickup carrying contactPhone (.strict() proves PII can't leak)", () => {
    const leaky = {
      id: "11111111-1111-1111-1111-111111111111",
      pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
      dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
      itemDesc: "Documents",
      suggestedFare: "2.40",
      proposedFare: "2.50",
      distanceKm: 1.5,
      createdAt: "2026-06-26T00:00:00Z",
    };
    expect(() => BoardNewOrderEvent.parse(leaky)).toThrow();
  });

  it("F-17: still broadcasts to nearby riders when expiry.schedule rejects (a Redis outage must not skip the fan-out)", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    // schedule rejects the way queue.add() would erroring/buffering under a Redis outage. Because it's
    // fire-and-forget (not awaited) the request neither hangs nor skips the fan-out below — the F-17 fix.
    const schedule = vi.fn(async () => { throw new Error("redis down"); });
    const expiry = { schedule } as unknown as OfferExpiryService;
    const nearbyRiders = vi.fn(async () => [{ profileId: "rider-1", distanceM: 800 }] as NearbyRider[]);
    const notifyNewBroadcast = vi.fn(async () => {});
    const tracking = { nearbyRiders, claimBroadcastRecipients: async () => null } as unknown as TrackingService;
    const notifications = { notifyNewBroadcast } as unknown as NotificationsService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, notifications, noGateway);

    await expect(svc.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
    await flush();

    expect(schedule).toHaveBeenCalledWith("ord-1");
    // The rider fan-out ran regardless of the failed enqueue — never gated behind a hanging schedule.
    expect(notifyNewBroadcast).toHaveBeenCalledWith("ord-1", ["rider-1"], { pickup: "Eastgate", fare: "2.50" });
  });

  it("never fails the create when the board push throws", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          itemDesc: "Documents",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
          createdAt: new Date("2026-06-26T00:00:00Z"),
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const tracking = { nearbyRiders: async () => [{ profileId: "rider-1", distanceM: 800 }] as NearbyRider[] } as unknown as TrackingService;
    const gateway = { emitBoardNewOrder: vi.fn(() => { throw new Error("socket down"); }) };
    const svc = new OrdersService(
      prisma as unknown as PrismaService,
      expiry,
      tracking,
      noNotifications,
      gateway as unknown as TrackingGateway,
    );

    await expect(svc.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
    await flush();
  });
});

describe("OrdersService.create idempotency (BUG-HUNT: duplicate orders on client retry)", () => {
  const withKey: CreateOrderRequest = { ...orderInput, idempotencyKey: "11111111-1111-1111-1111-111111111111" };
  const existingRow = {
    id: "ord-existing",
    status: "open_for_offers",
    itemDesc: "Documents",
    proposedFare: { toString: () => "2.50" },
    suggestedFare: { toString: () => "2.40" },
    distanceKm: 1.5,
    createdAt: new Date("2026-06-26T00:00:00Z"),
  };

  it("returns the pre-existing order for a replayed key instead of creating a second one", async () => {
    const create = vi.fn();
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: { findFirst: async () => existingRow, create },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    const res = await svc.create(withKey, "cust-1");

    expect(res).toMatchObject({ id: "ord-existing", status: "open_for_offers", proposedFare: "2.50" });
    expect(create).not.toHaveBeenCalled(); // no second auction opened, no second rider broadcast
  });

  it("proceeds to create when no order matches the key yet", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: { findFirst: async () => null, create: async () => existingRow },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications, noGateway);

    await expect(svc.create(withKey, "cust-1")).resolves.toMatchObject({ id: "ord-existing" });
  });

  it("without a key, never checks for a pre-existing match (old-client back-compat)", async () => {
    const findFirst = vi.fn();
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: { findFirst, create: async () => existingRow },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications, noGateway);

    await svc.create(orderInput, "cust-1");

    expect(findFirst).not.toHaveBeenCalled();
  });

  it("on a concurrent replay race (P2002 on the partial unique index), returns the winner instead of a 5xx", async () => {
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    let findFirstCalls = 0;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        // First call: the pre-check (no match yet, another request hasn't committed). Second call:
        // the post-P2002 lookup, after the racing request won.
        findFirst: async () => {
          findFirstCalls += 1;
          return findFirstCalls === 1 ? null : existingRow;
        },
        create: async () => {
          throw dup;
        },
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    await expect(svc.create(withKey, "cust-1")).resolves.toMatchObject({ id: "ord-existing" });
    expect(findFirstCalls).toBe(2);
  });

  it("re-throws a P2002 that isn't the idempotency race (e.g. no key was sent at all)", async () => {
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        create: async () => {
          throw dup;
        },
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    await expect(svc.create(orderInput, "cust-1")).rejects.toBe(dup);
  });
});

describe("OrdersService.create service-corridor gate (Q1)", () => {
  const svc = (createSpy: () => unknown) =>
    new OrdersService(
      { profile: { findUnique: async () => ({ onHold: false }) }, order: { create: async () => createSpy() } } as unknown as PrismaService,
      { schedule: async () => {} } as unknown as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );
  // Far outside the Harare corridor (SERVICE_CORRIDOR radius 25km) — the Gulf of Guinea (0,0).
  const farPoint = { lat: 0, lng: 0 };
  const wp = (point: { lat: number; lng: number }) => ({ point, landmark: "X", contactPhone: "+263771111111" });

  it("rejects an out-of-area PICKUP with a 4xx and never writes the order", async () => {
    let created = false;
    const s = svc(() => { created = true; return {}; });
    await expect(s.create({ ...orderInput, pickup: wp(farPoint) }, "cust-1")).rejects.toThrow(/service area/i);
    expect(created).toBe(false);
  });

  it("rejects an out-of-area DROP-OFF with a 4xx", async () => {
    const s = svc(() => ({}));
    await expect(s.create({ ...orderInput, dropoff: wp(farPoint) }, "cust-1")).rejects.toThrow(/service area/i);
  });

  it("allows an order with both waypoints inside the corridor", async () => {
    const s = svc(() => ({
      id: "ord-1",
      status: "open_for_offers",
      itemDesc: "Documents",
      proposedFare: { toString: () => "2.50" },
      suggestedFare: { toString: () => "2.40" },
      distanceKm: 1.5,
      createdAt: new Date("2026-06-26T00:00:00Z"),
    }));
    await expect(s.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
  });
});

describe("OrdersService.create customer-hold gate (S·2)", () => {
  const svc = (onHold: boolean, createSpy: () => unknown) =>
    new OrdersService(
      { profile: { findUnique: async () => ({ onHold }) }, order: { create: async () => createSpy() } } as unknown as PrismaService,
      { schedule: async () => {} } as unknown as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );

  it("rejects a held customer's broadcast with a 403 { reason: on_hold } and never writes the order", async () => {
    let created = false;
    const s = svc(true, () => { created = true; return {}; });
    const threw = await s.create(orderInput, "cust-1").then(() => null).catch((e) => e);
    // Same { reason, message } shape the rider online-gate throws → the app routes it to the on-hold screen.
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("on_hold");
    // Gated before any write: a held customer can't broadcast, so the order is never created.
    expect(created).toBe(false);
  });

  it("lets an un-held customer through the gate", async () => {
    const s = svc(false, () => ({
      id: "ord-1",
      status: "open_for_offers",
      itemDesc: "Documents",
      proposedFare: { toString: () => "2.50" },
      suggestedFare: { toString: () => "2.40" },
      distanceKm: 1.5,
      createdAt: new Date("2026-06-26T00:00:00Z"),
    }));
    await expect(s.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
  });
});

describe("OrdersService.getSnapshot", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "ord-1",
    status: "assigned",
    agreedFare: null,
    proposedFare: 2.5,
    customerId: "cust-1",
    riderId: "rider-1",
    createdAt: new Date("2026-06-26T00:00:00Z"),
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
    customer: { phone: "+263771111111" },
    rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
    events: [],
    ...overrides,
  });
  const svc = (snap: unknown, storage?: StorageAdapter) =>
    new OrdersService(
      { order: { findUnique: async () => snap } } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
      storage,
    );

  it("404s when the order is missing", async () => {
    await expect(svc(null).getSnapshot("missing", "cust-1")).rejects.toThrow(/order not found/i);
  });

  it("serves the stored line-items on the snapshot, and null for pre-items rows", async () => {
    const items = [{ description: "Documents", quantity: 2 }];
    const withItems = await svc(row({ items })).getSnapshot("ord-1", "cust-1");
    expect(withItems.items).toEqual(items);
    // Old rows (pre-migration-0008) carry no items column value — served as an explicit null.
    const legacy = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(legacy.items).toBeNull();
  });

  it("reveals the rider's phone to the customer during the active window", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBe("+263782000000");
    expect(snap.rider).toMatchObject({ profileId: "rider-1" });
  });

  it("returns pickup/drop-off to the CUSTOMER as point + landmark only — waypoint contactPhone redacted", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(snap.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(snap.dropoff).toEqual({ point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" });
    expect(snap.pickup).not.toHaveProperty("contactPhone");
    expect(snap.dropoff).not.toHaveProperty("contactPhone");
  });

  it("reveals the customer's phone to the assigned rider", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "rider-1");
    expect(snap.counterpartyPhone).toBe("+263771111111");
  });

  it("reveals the waypoint contactPhones to the ASSIGNED rider inside the reveal window (E1)", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "rider-1");
    expect(snap.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" });
    expect(snap.dropoff).toEqual({ point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" });
  });

  it("keeps waypoint contactPhones redacted from the rider OUTSIDE the reveal window", async () => {
    const snap = await svc(row({ status: "open_for_offers" })).getSnapshot("ord-1", "rider-1");
    expect(snap.pickup).not.toHaveProperty("contactPhone");
    expect(snap.dropoff).not.toHaveProperty("contactPhone");
  });

  it("hides phones outside the reveal window", async () => {
    const snap = await svc(row({ status: "open_for_offers" })).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBeNull();
  });

  it("hides the counterparty phone once the order is `completed` (F-09 — the party-to-party window closes at completion)", async () => {
    // The trip is closed and rated; neither party has a standing reason to keep the other's number,
    // so it must not linger in order history. Masked for BOTH sides, and the rider's waypoint contacts
    // go too.
    const cust = await svc(row({ status: "completed" })).getSnapshot("ord-1", "cust-1");
    expect(cust.counterpartyPhone).toBeNull();
    const rider = await svc(row({ status: "completed" })).getSnapshot("ord-1", "rider-1");
    expect(rider.counterpartyPhone).toBeNull();
    expect(rider.pickup).not.toHaveProperty("contactPhone");
    expect(rider.dropoff).not.toHaveProperty("contactPhone");
  });

  it("still reveals the counterparty phone on `delivered` (order not yet closed — rating window open)", async () => {
    const snap = await svc(row({ status: "delivered" })).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBe("+263782000000");
  });

  it("still reveals the counterparty phone on `undelivered` (failed hand-off — customer may need to reach the rider, C6)", async () => {
    const snap = await svc(row({ status: "undelivered" })).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBe("+263782000000");
  });

  it("rejects a third-party caller entirely (P2-2 — no snapshot to a non-party)", async () => {
    // A caller who is neither the customer nor the assigned rider gets no snapshot at all — the
    // response carries live rider GPS + waypoint coordinates, so it's party-gated, not just phone-redacted.
    await expect(svc(row()).getSnapshot("ord-1", "stranger")).rejects.toThrow(/not your order/i);
  });

  it("returns expiresAt = createdAt + OFFER_WINDOW_MS while open_for_offers (auction countdown)", async () => {
    const createdAt = new Date("2026-06-26T00:00:00Z");
    const snap = await svc(row({ status: "open_for_offers", createdAt })).getSnapshot("ord-1", "cust-1");
    expect(snap.expiresAt).toBe(new Date(createdAt.getTime() + OFFER_WINDOW_MS).toISOString());
  });

  it("returns expiresAt = null once the order is no longer open (assigned)", async () => {
    const snap = await svc(row({ status: "assigned" })).getSnapshot("ord-1", "cust-1");
    expect(snap.expiresAt).toBeNull();
  });

  it("returns a live ridersNearby count while open_for_offers, and null once assigned (2·b1)", async () => {
    // noTracking.nearbyRiders returns [] → 0 online riders nearby while the auction is open…
    const open = await svc(row({ status: "open_for_offers" })).getSnapshot("ord-1", "cust-1");
    expect(open.ridersNearby).toBe(0);
    // …and the supply signal is null on any non-open status (like expiresAt), so it never lingers.
    const assigned = await svc(row({ status: "assigned" })).getSnapshot("ord-1", "cust-1");
    expect(assigned.ridersNearby).toBeNull();
  });

  it("resolves the pickup-photo key to a signed read URL for BOTH parties (§5c trust point)", async () => {
    const createReadUrl = vi.fn(async (key: string, ttl: number) => `https://signed.example/${key}?ttl=${ttl}`);
    const storage = { createReadUrl } as unknown as StorageAdapter;
    const withPhoto = row({ status: "picked_up", pickupPhotoKey: "pickup/rider-1/photo.jpg" });
    // The customer — the side the photo exists to reassure — gets the viewable URL…
    const customerView = await svc(withPhoto, storage).getSnapshot("ord-1", "cust-1");
    expect(customerView.pickupPhotoUrl).toBe("https://signed.example/pickup/rider-1/photo.jpg?ttl=900");
    expect(createReadUrl).toHaveBeenCalledWith("pickup/rider-1/photo.jpg", expect.any(Number));
    // …and so does the assigned rider (their attach confirmed on refetch).
    const riderView = await svc(withPhoto, storage).getSnapshot("ord-1", "rider-1");
    expect(riderView.pickupPhotoUrl).toBe("https://signed.example/pickup/rider-1/photo.jpg?ttl=900");
  });

  it("serves pickupPhotoUrl null with no photo, and never mints a URL for nothing", async () => {
    const createReadUrl = vi.fn();
    const snap = await svc(row(), { createReadUrl } as unknown as StorageAdapter).getSnapshot("ord-1", "cust-1");
    expect(snap.pickupPhotoUrl).toBeNull();
    expect(createReadUrl).not.toHaveBeenCalled();
  });

  it("serves pickupPhotoUrl null on a storage blip instead of failing the snapshot", async () => {
    const storage = { createReadUrl: async () => { throw new Error("GCS down"); } } as unknown as StorageAdapter;
    const snap = await svc(row({ pickupPhotoKey: "pickup/rider-1/photo.jpg" }), storage).getSnapshot("ord-1", "cust-1");
    expect(snap.pickupPhotoUrl).toBeNull();
  });

  it("serves the SAME signed pickup-photo URL across consecutive polls (mint cached — device image cache stays valid)", async () => {
    // The device's image cache is keyed on the URL string: a fresh signature per 15s poll made the
    // phone re-download an identical photo for the whole delivery (and burned a signBlob IAM call per
    // poll). Two polls on one instance must yield one mint and byte-identical URLs.
    let minted = 0;
    const storage = { createReadUrl: vi.fn(async (key: string) => `https://signed.example/${key}?sig=${++minted}`) } as unknown as StorageAdapter;
    const s = svc(row({ status: "picked_up", pickupPhotoKey: "pickup/rider-1/photo.jpg" }), storage);
    const first = await s.getSnapshot("ord-1", "cust-1");
    const second = await s.getSnapshot("ord-1", "cust-1");
    expect(first.pickupPhotoUrl).toBe("https://signed.example/pickup/rider-1/photo.jpg?sig=1");
    expect(second.pickupPhotoUrl).toBe(first.pickupPhotoUrl);
    expect(storage.createReadUrl).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed pickup-photo mint — the next poll re-tries and recovers", async () => {
    const createReadUrl = vi
      .fn<(key: string, ttl: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("GCS blip"))
      .mockResolvedValueOnce("https://signed.example/pickup/rider-1/photo.jpg?sig=ok");
    const s = svc(row({ pickupPhotoKey: "pickup/rider-1/photo.jpg" }), { createReadUrl } as unknown as StorageAdapter);
    expect((await s.getSnapshot("ord-1", "cust-1")).pickupPhotoUrl).toBeNull();
    expect((await s.getSnapshot("ord-1", "cust-1")).pickupPhotoUrl).toBe("https://signed.example/pickup/rider-1/photo.jpg?sig=ok");
  });

  it("keeps the snapshot's events payload lean — status + createdAt only (lat/lng were never written by any event writer)", async () => {
    let capturedArgs: { select?: { events?: { select?: Record<string, boolean> } } } | undefined;
    const s = new OrdersService(
      {
        order: {
          findUnique: async (args: typeof capturedArgs) => {
            capturedArgs = args;
            return row();
          },
        },
      } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );
    await s.getSnapshot("ord-1", "cust-1");
    // Pins the wire contract: re-adding dead per-event fields to the hottest polled response is a
    // payload regression, not a harmless select tweak.
    expect(capturedArgs?.select?.events?.select).toEqual({ status: true, createdAt: true });
  });

  it("A-O5: dedupes repeated status rows to the earliest occurrence — a dropped-and-re-dispatched food job cycles through requested/assigned more than once, but every client consumer (Stepper, live-tracker) only ever reads the first occurrence", async () => {
    const events = [
      { status: "requested", createdAt: new Date("2026-06-26T00:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T00:01:00Z") },
      // Rider 1 drops pre-pickup — dropDispatch cycles the SAME order back through requested/assigned.
      { status: "requested", createdAt: new Date("2026-06-26T00:05:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T00:06:00Z") },
      { status: "confirmed", createdAt: new Date("2026-06-26T00:07:00Z") },
    ];
    const snap = await svc(row({ events })).getSnapshot("ord-1", "cust-1");
    expect(snap.events).toEqual([
      { status: "requested", createdAt: new Date("2026-06-26T00:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T00:01:00Z") },
      { status: "confirmed", createdAt: new Date("2026-06-26T00:07:00Z") },
    ]);
  });

  it("A-O5: leaves a normal forward-only event timeline untouched (no repeated statuses to drop)", async () => {
    const events = [
      { status: "open_for_offers", createdAt: new Date("2026-06-26T00:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T00:01:00Z") },
      { status: "confirmed", createdAt: new Date("2026-06-26T00:02:00Z") },
    ];
    const snap = await svc(row({ events })).getSnapshot("ord-1", "cust-1");
    expect(snap.events).toEqual(events);
  });

  it("coalesces the open-auction ridersNearby count onto one geo query within its TTL (micro-cache)", async () => {
    // Every 15s open-auction poll used to run its own PostGIS radius query for an informational
    // count. Within the cache TTL, repeat polls (and same-block auctions) share one query. Targeting
    // (broadcastToNearbyRiders) deliberately does NOT go through this cache — covered by the create()
    // specs above, which assert nearbyRiders is called with the raw coordinates on every broadcast.
    const nearbyRiders = vi.fn(async () => [{ profileId: "rider-9", distanceM: 500 }] as NearbyRider[]);
    const tracking = { nearbyRiders, getLivePosition: async () => null } as unknown as TrackingService;
    const s = new OrdersService(
      { order: { findUnique: async () => row({ status: "open_for_offers" }) } } as unknown as PrismaService,
      {} as OfferExpiryService,
      tracking,
      noNotifications,
      noGateway,
    );
    expect((await s.getSnapshot("ord-1", "cust-1")).ridersNearby).toBe(1);
    expect((await s.getSnapshot("ord-1", "cust-1")).ridersNearby).toBe(1);
    expect(nearbyRiders).toHaveBeenCalledTimes(1);
  });

  it("prefers the Redis live rider position over the stale PG columns", async () => {
    const tracking = {
      nearbyRiders: async (): Promise<NearbyRider[]> => [],
      getLivePosition: async () => ({ lat: -17.9, lng: 31.1, at: 1_700_000_000_000 }),
    } as unknown as TrackingService;
    const s = new OrdersService(
      { order: { findUnique: async () => row() } } as unknown as PrismaService,
      {} as OfferExpiryService,
      tracking,
      noNotifications,
      noGateway,
    );
    const snap = await s.getSnapshot("ord-1", "cust-1");
    expect(snap.rider).toMatchObject({ profileId: "rider-1", currentLat: -17.9, currentLng: 31.1 });
    expect(snap.rider!.updatedAt).toEqual(new Date(1_700_000_000_000));
  });

  // cancelledBy drives the cancelled terminal's blame line — a wrong value falsely blames whichever
  // party the ternary defaults to. svcCancelled additionally stubs findFirst (rebroadcastedToId lookup,
  // only queried on a cancelled order).
  const svcCancelled = (cancelledBy: string | null) =>
    new OrdersService(
      {
        order: {
          findUnique: async () => row({ status: "cancelled", cancelledBy }),
          findFirst: async () => null,
        },
      } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );

  it("cancelledBy: \"customer\" when the customer's own id cancelled", async () => {
    const snap = await svcCancelled("cust-1").getSnapshot("ord-1", "cust-1");
    expect(snap.cancelledBy).toBe("customer");
  });

  it("cancelledBy: \"rider\" when the assigned rider's own id cancelled", async () => {
    const snap = await svcCancelled("rider-1").getSnapshot("ord-1", "cust-1");
    expect(snap.cancelledBy).toBe("rider");
  });

  it("cancelledBy: null for an ADMIN cancel — the actor id matches neither party, so it must NOT default to \"rider\"", async () => {
    const snap = await svcCancelled("admin-9").getSnapshot("ord-1", "cust-1");
    expect(snap.cancelledBy).toBeNull();
  });

  it("Fix 1: exposes hadOffers on an expired snapshot, recomputed from the durable offer rows", async () => {
    const prisma = {
      order: { findUnique: async () => row({ status: "expired", riderId: null, rider: null }) },
      offer: { count: async () => 3 }, // riders bid; offer rows survive expiry
    } as unknown as PrismaService;
    const s = new OrdersService(prisma, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const snap = await s.getSnapshot("ord-1", "cust-1");
    expect(snap.hadOffers).toBe(true);
  });

  it("Fix 1: hadOffers is null on a non-expired snapshot (no wasted count)", async () => {
    let counted = false;
    const prisma = {
      order: { findUnique: async () => row({ status: "assigned" }) },
      offer: {
        count: async () => {
          counted = true;
          return 0;
        },
      },
    } as unknown as PrismaService;
    const s = new OrdersService(prisma, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const snap = await s.getSnapshot("ord-1", "cust-1");
    expect(snap.hadOffers).toBeNull();
    expect(counted).toBe(false);
  });

  it("KB-DELIVERY-CODE-ROTATION-SIGNAL: exposes codeRotatedAt as an ISO string when the code was (re)issued", async () => {
    const rotatedAt = new Date("2026-06-26T12:34:56.000Z");
    const snap = await svc(row({ status: "en_route_dropoff", deliveryCodeRotatedAt: rotatedAt })).getSnapshot("ord-1", "rider-1");
    // The robust rotation signal the rider app consumes to detect a re-issue across an app-kill.
    expect(snap.codeRotatedAt).toBe(rotatedAt.toISOString());
  });

  it("KB-DELIVERY-CODE-ROTATION-SIGNAL: codeRotatedAt is null on a row that never had a code stamped", async () => {
    // Pre-0026 rows / orders never assigned a code carry no timestamp — served as an explicit null.
    const snap = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(snap.codeRotatedAt).toBeNull();
  });

  it("Fix 6: remaps an ops-internal cancel reason to calm customer-safe copy (not 'Suspected fraud')", async () => {
    const prisma = {
      order: {
        findUnique: async () => row({ status: "cancelled", cancelReason: "Suspected fraud", cancelledBy: "admin-9" }),
        findFirst: async () => null, // no rebroadcast clone
      },
    } as unknown as PrismaService;
    const s = new OrdersService(prisma, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const snap = await s.getSnapshot("ord-1", "cust-1");
    expect(snap.cancelReason).not.toContain("fraud");
    expect(snap.cancelReason).toBe("Cancelled by the LyniaGo team — contact support if you have questions.");
  });

  it("Fix 6: passes a user-safe cancel reason through unchanged", async () => {
    const prisma = {
      order: {
        findUnique: async () => row({ status: "cancelled", cancelReason: "Rider unreachable", cancelledBy: "admin-9" }),
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const s = new OrdersService(prisma, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const snap = await s.getSnapshot("ord-1", "cust-1");
    expect(snap.cancelReason).toBe("Rider unreachable");
  });
});

describe("OrdersService.listOpen", () => {
  it("lists open orders for riders, serializing fares", async () => {
    let where: unknown;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              id: "o1",
              pickup: { point: { lat: -17.83, lng: 31.05 } },
              dropoff: { point: { lat: -17.82, lng: 31.06 } },
              itemDesc: "Documents",
              suggestedFare: { toString: () => "2.40" },
              proposedFare: { toString: () => "2.50" },
              distanceKm: 1.5,
              createdAt: new Date("2026-06-26T00:00:00Z"),
            },
          ];
        },
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const rows = await svc.listOpen();
    // A-3 (status-keyed-query-audit): the board is now parcel-only.
    expect(where).toEqual({ status: "open_for_offers", orderType: "parcel" });
    expect(rows[0]).toMatchObject({ id: "o1", itemDesc: "Documents", suggestedFare: "2.40", proposedFare: "2.50", distanceKm: 1.5 });
  });

  it("redacts contactPhone from pickup/dropoff — a browsing rider gets point + landmark only (§5d)", async () => {
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        findMany: async () => [
          {
            id: "o1",
            pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
            dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
            itemDesc: "Documents",
            suggestedFare: { toString: () => "2.40" },
            proposedFare: { toString: () => "2.50" },
            distanceKm: 1.5,
            createdAt: new Date("2026-06-26T00:00:00Z"),
          },
        ],
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const rows = await svc.listOpen();
    expect(rows[0]!.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(rows[0]!.dropoff).toEqual({ point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" });
    expect(rows[0]!.pickup).not.toHaveProperty("contactPhone");
    expect(rows[0]!.dropoff).not.toHaveProperty("contactPhone");
    expect(JSON.stringify(rows[0])).not.toContain("+263");
  });

  it("with lat/lng takes the geo path ($queryRaw) and redacts contactPhone from the rows", async () => {
    const findMany = vi.fn(async () => []);
    const queryRaw = vi.fn(async () => [
      {
        id: "o1",
        pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
        dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
        item_desc: "Documents",
        suggested_fare: { toString: () => "2.40" },
        proposed_fare: { toString: () => "2.50" },
        distance_km: 1.5,
        created_at: new Date("2026-06-26T00:00:00Z"),
        // Inside the caller's own 3 km radius — survives the per-order reach filter regardless of age.
        pickup_distance_m: 900,
      },
    ]);
    const prisma = { order: { findMany }, $queryRaw: queryRaw };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    const rows = await svc.listOpen(-17.83, 31.05, 3000);

    // Geo path taken: the raw PostGIS query runs, the city-wide findMany does not.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ id: "o1", itemDesc: "Documents", suggestedFare: "2.40", proposedFare: "2.50", distanceKm: 1.5 });
    // Same redaction as the city-wide path — point + landmark only, never contactPhone.
    expect(rows[0]!.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(rows[0]!.pickup).not.toHaveProperty("contactPhone");
    expect(JSON.stringify(rows[0])).not.toContain("+263");
  });

  it("geo path shows an order beyond the caller's radius once its broadcast has widened to reach them", async () => {
    const mkRow = (id: string, createdAt: Date) => ({
      id,
      pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
      dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
      item_desc: "Documents",
      suggested_fare: { toString: () => "2.40" },
      proposed_fare: { toString: () => "2.50" },
      distance_km: 1.5,
      created_at: createdAt,
      // 7 km out: past the 5 km caller radius, inside the 12 km final expansion ring.
      pickup_distance_m: 7000,
    });
    const queryRaw = vi.fn(async () => [
      mkRow("o-fresh", new Date()), // t≈0 → reach still 5 km → hidden
      mkRow("o-widened", new Date(Date.now() - 61_000)), // past the 60 s step → reach 12 km → shown
    ]);
    const prisma = { order: { findMany: vi.fn(async () => []) }, $queryRaw: queryRaw };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    const rows = await svc.listOpen(-17.83, 31.05, 5000);

    expect(rows.map((r) => r.id)).toEqual(["o-widened"]);
  });

  it("without lat/lng falls back to the city-wide findMany path", async () => {
    const findMany = vi.fn(async () => []);
    const queryRaw = vi.fn(async () => []);
    const prisma = { order: { findMany }, $queryRaw: queryRaw };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);

    await svc.listOpen();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("OrdersService.historyForUser", () => {
  const svc = (rows: unknown[], capture?: (a: { where: unknown; orderBy: unknown; take: unknown }) => void) =>
    new OrdersService(
      {
        order: {
          findMany: async (args: { where: unknown; orderBy: unknown; take: unknown }) => {
            capture?.(args);
            return rows;
          },
        },
      } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );

  const row = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    orderType: "parcel",
    customerId: "cust-1",
    riderId: "rider-1",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
    itemDesc: "Documents",
    proposedFare: { toString: () => "2.50" },
    agreedFare: { toString: () => "2.50" },
    status: "completed",
    createdAt: new Date("2026-06-26T00:00:00Z"),
    // Prisma returns a to-many rating relation as an array (migration 0015 widened the unique). Both
    // directions can be present — the rider's rating of the sender (byProfileId = riderId) FIRST, so a
    // naive rating[0] would surface the wrong one; the trip row must show the customer→rider score.
    rating: [
      { score: 2, comment: "sender issue", byProfileId: "rider-1" },
      { score: 5, comment: "great", byProfileId: "cust-1" },
    ],
    customer: { firstName: "Tatenda", lastName: "M" },
    rider: { profile: { firstName: "Rugare", lastName: "C" } },
    merchant: null,
    ...over,
  });

  it("queries both roles (OR customer/rider), newest first, capped at 50 (UX-2026-07-15, was 100)", async () => {
    // Regression guard: a metered-data mobile list (shared by trip history AND earnings) has no use for
    // a full 100-row fetch on every open — halved to 50 without any contract/shape change.
    let args: { where: unknown; orderBy: unknown; take: unknown } | undefined;
    await svc([row()], (a) => (args = a)).historyForUser("cust-1");
    expect(args!.where).toEqual({ OR: [{ customerId: "cust-1" }, { riderId: "cust-1" }] });
    expect(args!.orderBy).toEqual({ createdAt: "desc" });
    expect(args!.take).toBe(50);
  });

  it("serializes fares, redacts contactPhone, and names the counterparty by viewpoint", async () => {
    const asCustomer = await svc([row()]).historyForUser("cust-1");
    expect(asCustomer[0]).toMatchObject({
      id: "o1",
      role: "customer",
      proposedFare: "2.50",
      agreedFare: "2.50",
      status: "completed",
      counterpartyName: "Rugare C",
      rating: { score: 5, comment: "great" },
    });
    expect(asCustomer[0]!.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(JSON.stringify(asCustomer[0])).not.toContain("+263");

    const asRider = await svc([row()]).historyForUser("rider-1");
    expect(asRider[0]).toMatchObject({ role: "rider", counterpartyName: "Tatenda M" });
  });

  it("tolerates a null agreedFare, missing rating, and an unassigned order", async () => {
    const rows = await svc([row({ agreedFare: null, rating: [], riderId: null, rider: null })]).historyForUser("cust-1");
    expect(rows[0]!.agreedFare).toBeNull();
    expect(rows[0]!.rating).toBeNull();
    expect(rows[0]!.counterpartyName).toBeNull();
  });

  it("UX-2026-07-16: carries the order's note through, so Trip History's 'Send again' can rebroadcast it", async () => {
    const rows = await svc([row({ note: "Ask for Rita at reception" })]).historyForUser("cust-1");
    expect(rows[0]!.note).toBe("Ask for Rita at reception");
    const noNote = await svc([row({ note: null })]).historyForUser("cust-1");
    expect(noNote[0]!.note).toBeNull();
  });

  it("plan §5 A3: carries orderType + the restaurant name so the Orders tab can render a cross-service list", async () => {
    const parcel = await svc([row()]).historyForUser("cust-1");
    expect(parcel[0]).toMatchObject({ orderType: "parcel", merchantName: null });

    const food = await svc([row({ orderType: "merchant", merchant: { name: "Sadza Republic" } })]).historyForUser("cust-1");
    expect(food[0]).toMatchObject({ orderType: "merchant", merchantName: "Sadza Republic" });
  });
});

describe("OrdersService.earningsSummary (WD-004 — a full aggregate, not a sum over the capped history page)", () => {
  const svc = (agg: unknown, capture?: (a: unknown) => void) =>
    new OrdersService(
      {
        order: {
          aggregate: async (args: unknown) => {
            capture?.(args);
            return agg;
          },
        },
      } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
    );

  it("aggregates over ALL matching orders (not capped at 50), scoped to this rider's completed/delivered orders", async () => {
    let args: unknown;
    // A rider with well over 50 lifetime deliveries — the aggregate must reflect all of them, not a page.
    await svc({ _sum: { agreedFare: new Prisma.Decimal("6234.50") }, _count: { _all: 187 } }, (a) => (args = a)).earningsSummary("r1");
    expect(args).toMatchObject({
      where: { riderId: "r1", status: { in: ["completed", "delivered"] } },
      _sum: { agreedFare: true },
      _count: { _all: true },
    });
  });

  it("returns the summed total and trip count", async () => {
    const result = await svc({ _sum: { agreedFare: new Prisma.Decimal("123.45") }, _count: { _all: 12 } }).earningsSummary("r1");
    expect(result).toEqual({ total: "123.45", count: 12 });
  });

  it("returns $0/0 for a rider with no completed trips yet (SQL SUM of nothing is NULL)", async () => {
    const result = await svc({ _sum: { agreedFare: null }, _count: { _all: 0 } }).earningsSummary("r1");
    expect(result).toEqual({ total: "0", count: 0 });
  });
});

describe("OrdersService.activeForRider", () => {
  it("returns null when the rider has no active order", async () => {
    const prisma = { order: { findFirst: async () => null } };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    expect(await svc.activeForRider("rider-1")).toBeNull();
  });

  it("returns the active order snapshot when one exists", async () => {
    const snap = {
      id: "o1",
      status: "assigned",
      agreedFare: null,
      proposedFare: 2.5,
      customerId: "cust-1",
      riderId: "rider-1",
      createdAt: new Date("2026-06-26T00:00:00Z"),
      customer: { phone: "+263771111111" },
      rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
      events: [],
    };
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: { findFirst: async () => ({ id: "o1" }), findUnique: async () => snap },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const res = await svc.activeForRider("rider-1");
    expect(res).toMatchObject({ id: "o1", status: "assigned" });
    // rider sees the customer's phone in the active window
    expect(res?.counterpartyPhone).toBe("+263771111111");
  });

  it("R8: surfaces a recently cancelled+collected order for the hand-back when there's no active job", async () => {
    const snap = {
      id: "o9",
      status: "cancelled",
      agreedFare: null,
      proposedFare: 2.5,
      customerId: "cust-1",
      riderId: "rider-1",
      createdAt: new Date("2026-06-26T00:00:00Z"),
      collectedAt: new Date("2026-06-26T00:10:00Z"),
      customer: { phone: "+263771111111" },
      rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
      events: [],
    };
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        // First findFirst = active statuses (none); second = the cancelled hand-back (status: "cancelled").
        findFirst: async (args: { where: { status: unknown } }) => (args.where.status === "cancelled" ? { id: "o9" } : null),
        findUnique: async () => snap,
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const res = await svc.activeForRider("rider-1");
    expect(res).toMatchObject({ id: "o9", status: "cancelled" });
    // R8: the collected-cancel hand-back must reveal the sender's phone to the assigned rider so the
    // reopen terminal can offer a "call sender" (cancelled ∉ PHONE_REVEAL_STATUSES, so this is the
    // scoped rider-only reveal — the whole point of the fix).
    expect(res?.counterpartyPhone).toBe("+263771111111");
  });

  it("DS16-02: surfaces the OLDEST outstanding hand-back first when the rider has two stuck parcels", async () => {
    // Two collected-then-cancelled parcels for the same rider inside the lookback window. The query must
    // order by cancelledAt ASC so the longest-outstanding parcel ("old", the one physically stuck the
    // longest) gets first claim on the rider's attention — not the most recently cancelled ("new"), which
    // would starve the older one off the app's radar forever.
    const snapFor = (id: string) => ({
      id,
      status: "cancelled",
      agreedFare: null,
      proposedFare: 2.5,
      customerId: "cust-1",
      riderId: "rider-1",
      createdAt: new Date("2026-06-26T00:00:00Z"),
      collectedAt: new Date("2026-06-26T00:10:00Z"),
      customer: { phone: "+263771111111" },
      rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
      events: [],
    });
    let handbackOrderBy: unknown;
    let requestedId: string | undefined;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        findFirst: async (args: { where: { status: unknown }; orderBy?: { cancelledAt?: "asc" | "desc" } }) => {
          if (args.where.status !== "cancelled") return null; // no active ride
          handbackOrderBy = args.orderBy;
          // Mirror the DB: asc → oldest ("old"), desc → newest ("new").
          const id = args.orderBy?.cancelledAt === "asc" ? "old" : "new";
          return { id };
        },
        findUnique: async (args: { where: { id: string } }) => {
          requestedId = args.where.id;
          return snapFor(args.where.id);
        },
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const res = await svc.activeForRider("rider-1");
    expect(handbackOrderBy).toEqual({ cancelledAt: "asc" });
    expect(requestedId).toBe("old");
    expect(res).toMatchObject({ id: "old", status: "cancelled" });
  });
});

describe("OrdersService.activeForCustomer (cold-start restore, UX review #1)", () => {
  it("returns null when the customer has no live order", async () => {
    const prisma = { order: { findFirst: async () => null } };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    expect(await svc.activeForCustomer("cust-1")).toBeNull();
  });

  it("returns the live-order snapshot (the auction or an active ride) so the app can restore tracking", async () => {
    const snap = {
      id: "o1",
      status: "open_for_offers",
      agreedFare: null,
      proposedFare: 2.5,
      customerId: "cust-1",
      riderId: null,
      createdAt: new Date("2026-06-26T00:00:00Z"),
      customer: { phone: "+263771111111" },
      rider: null,
      events: [],
    };
    let whereStatus: unknown;
    const prisma = {
      profile: { findUnique: async () => ({ onHold: false }) },
      order: {
        findFirst: async (args: { where: { status: { in: unknown } } }) => {
          whereStatus = args.where.status.in;
          return { id: "o1" };
        },
        findUnique: async () => snap,
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const res = await svc.activeForCustomer("cust-1");
    expect(res).toMatchObject({ id: "o1", status: "open_for_offers" });
    // The query scopes to the customer-active set (auction through delivered), not terminal statuses.
    expect(whereStatus).toContain("open_for_offers");
    expect(whereStatus).toContain("delivered");
    expect(whereStatus).not.toContain("completed");
    expect(whereStatus).not.toContain("cancelled");
  });
});

describe("OrdersService.requestNotifyWhenAvailable (2·b1 notify-me)", () => {
  it("registers the customer at their pickup and returns whether it was queued", async () => {
    const addNotifyRequest = vi.fn(async () => true);
    const tracking = { addNotifyRequest } as unknown as TrackingService;
    const svc = new OrdersService({} as unknown as PrismaService, {} as OfferExpiryService, tracking, noNotifications, noGateway);
    const res = await svc.requestNotifyWhenAvailable("cust-1", { lat: -17.8, lng: 31.0 });
    // KB-NOTIFY-ORDERID: the optional orderId is threaded through (undefined here — no order in scope).
    // DS15-09: with no orderId supplied the DB ownership check is skipped entirely (no findUnique call).
    expect(addNotifyRequest).toHaveBeenCalledWith("cust-1", -17.8, 31.0, undefined);
    expect(res).toEqual({ queued: true });
  });

  it("reports queued:false when the store isn't available (no Redis)", async () => {
    const tracking = { addNotifyRequest: async () => false } as unknown as TrackingService;
    const svc = new OrdersService({} as unknown as PrismaService, {} as OfferExpiryService, tracking, noNotifications, noGateway);
    expect(await svc.requestNotifyWhenAvailable("cust-1", { lat: -17.8, lng: 31.0 })).toEqual({ queued: false });
  });

  // DS15-09: an orderId in the DTO must belong to the caller before we associate the waiter with it —
  // otherwise any authenticated profile (e.g. a rider reading live ids off the open board) could
  // register against a victim's order and hijack the "a rider is nearby" push.
  it("threads through the caller's OWN orderId after verifying customerId matches", async () => {
    const addNotifyRequest = vi.fn(async () => true);
    const findUnique = vi.fn(async () => ({ customerId: "cust-1" }));
    const prisma = { order: { findUnique } } as unknown as PrismaService;
    const tracking = { addNotifyRequest } as unknown as TrackingService;
    const svc = new OrdersService(prisma, {} as OfferExpiryService, tracking, noNotifications, noGateway);

    const res = await svc.requestNotifyWhenAvailable("cust-1", { lat: -17.8, lng: 31.0 }, "ord-own");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "ord-own" }, select: { customerId: true } });
    // Ownership confirmed → the real order id is forwarded to the waiter registration.
    expect(addNotifyRequest).toHaveBeenCalledWith("cust-1", -17.8, 31.0, "ord-own");
    expect(res).toEqual({ queued: true });
  });

  it("DROPS a FOREIGN orderId (IDOR) — registers a plain, order-less notify-me instead of associating it", async () => {
    const addNotifyRequest = vi.fn(async () => true);
    // The order exists but belongs to a DIFFERENT customer — the attacker passing a victim's live id.
    const findUnique = vi.fn(async () => ({ customerId: "victim-9" }));
    const prisma = { order: { findUnique } } as unknown as PrismaService;
    const tracking = { addNotifyRequest } as unknown as TrackingService;
    const svc = new OrdersService(prisma, {} as OfferExpiryService, tracking, noNotifications, noGateway);

    await svc.requestNotifyWhenAvailable("attacker-1", { lat: -17.8, lng: 31.0 }, "victim-order");

    // The foreign id is stripped → addNotifyRequest is called with undefined (no cross-party association,
    // which also HDELs any stale pointer), so the attacker's waiter never carries the victim's order.
    expect(addNotifyRequest).toHaveBeenCalledWith("attacker-1", -17.8, 31.0, undefined);
  });

  it("DROPS a non-existent orderId rather than associating a dangling reference", async () => {
    const addNotifyRequest = vi.fn(async () => true);
    const findUnique = vi.fn(async () => null); // no such order
    const prisma = { order: { findUnique } } as unknown as PrismaService;
    const tracking = { addNotifyRequest } as unknown as TrackingService;
    const svc = new OrdersService(prisma, {} as OfferExpiryService, tracking, noNotifications, noGateway);

    await svc.requestNotifyWhenAvailable("cust-1", { lat: -17.8, lng: 31.0 }, "ghost-order");

    expect(addNotifyRequest).toHaveBeenCalledWith("cust-1", -17.8, 31.0, undefined);
  });
});
