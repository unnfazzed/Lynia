import { BoardNewOrderEvent, type CreateOrderRequest, OFFER_WINDOW_MS, quoteFare } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
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
    const tracking = { nearbyRiders } as unknown as TrackingService;
    const notifications = { notifyNewBroadcast } as unknown as NotificationsService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, notifications, noGateway);

    await svc.create(orderInput, "cust-1");
    await flush();

    // The pickup point drives the PostGIS radius lookup; matched riders get the broadcast push.
    expect(nearbyRiders).toHaveBeenCalledWith(orderInput.pickup.point.lat, orderInput.pickup.point.lng, expect.any(Number));
    expect(notifyNewBroadcast).toHaveBeenCalledWith("ord-1", ["rider-1"], { pickup: "Eastgate", fare: "2.50" });
  });

  it("never fails the create when the broadcast push throws", async () => {
    const prisma = {
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

  it("pushes a REDACTED board:new-order event — no contactPhone anywhere in pickup/dropoff", async () => {
    const orderId = "22222222-2222-2222-2222-222222222222";
    const prisma = {
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

  it("never fails the create when the board push throws", async () => {
    const prisma = {
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

describe("OrdersService.create service-corridor gate (Q1)", () => {
  const svc = (createSpy: () => unknown) =>
    new OrdersService(
      { order: { create: async () => createSpy() } } as unknown as PrismaService,
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
  const svc = (snap: unknown) =>
    new OrdersService(
      { order: { findUnique: async () => snap } } as unknown as PrismaService,
      {} as OfferExpiryService,
      noTracking,
      noNotifications,
      noGateway,
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
});

describe("OrdersService.listOpen", () => {
  it("lists open orders for riders, serializing fares", async () => {
    let where: unknown;
    const prisma = {
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
    expect(where).toEqual({ status: "open_for_offers" });
    expect(rows[0]).toMatchObject({ id: "o1", itemDesc: "Documents", suggestedFare: "2.40", proposedFare: "2.50", distanceKm: 1.5 });
  });

  it("redacts contactPhone from pickup/dropoff — a browsing rider gets point + landmark only (§5d)", async () => {
    const prisma = {
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
  const svc = (rows: unknown[], capture?: (a: { where: unknown; orderBy: unknown }) => void) =>
    new OrdersService(
      {
        order: {
          findMany: async (args: { where: unknown; orderBy: unknown }) => {
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
    customerId: "cust-1",
    riderId: "rider-1",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
    itemDesc: "Documents",
    proposedFare: { toString: () => "2.50" },
    agreedFare: { toString: () => "2.50" },
    status: "completed",
    createdAt: new Date("2026-06-26T00:00:00Z"),
    // Prisma returns a to-many rating relation as an array (migration 0015 widened the unique).
    rating: [{ score: 5, comment: "great" }],
    customer: { firstName: "Tatenda", lastName: "M" },
    rider: { profile: { firstName: "Rugare", lastName: "C" } },
    ...over,
  });

  it("queries both roles (OR customer/rider), newest first", async () => {
    let args: { where: unknown; orderBy: unknown } | undefined;
    await svc([row()], (a) => (args = a)).historyForUser("cust-1");
    expect(args!.where).toEqual({ OR: [{ customerId: "cust-1" }, { riderId: "cust-1" }] });
    expect(args!.orderBy).toEqual({ createdAt: "desc" });
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
      customer: { phone: "+263771111111" },
      rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
      events: [],
    };
    const prisma = {
      order: {
        // First findFirst = active statuses (none); second = the cancelled hand-back (status: "cancelled").
        findFirst: async (args: { where: { status: unknown } }) => (args.where.status === "cancelled" ? { id: "o9" } : null),
        findUnique: async () => snap,
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications, noGateway);
    const res = await svc.activeForRider("rider-1");
    expect(res).toMatchObject({ id: "o9", status: "cancelled" });
  });
});
