import { type CreateOrderRequest, quoteFare } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
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
const noTracking = { nearbyRiders: async (): Promise<NearbyRider[]> => [] } as unknown as TrackingService;
const noNotifications = { notifyNewBroadcast: async (): Promise<void> => {} } as unknown as NotificationsService;
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
            proposedFare: { toString: () => "2.50" },
            suggestedFare: { toString: () => quote.suggestedFare.toFixed(2) },
            distanceKm: quote.distanceKm,
          };
        },
      },
    };
    const expiry = { schedule: async (id: string) => { scheduledId = id; } } as unknown as OfferExpiryService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, noTracking, noNotifications);

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

  it("pushes the new order to nearby online riders post-commit (CONCEPT §3.10), best-effort", async () => {
    const prisma = {
      order: {
        create: async () => ({
          id: "ord-1",
          status: "open_for_offers",
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const nearbyRiders = vi.fn(async () => [{ profileId: "rider-1", distanceM: 800 }] as NearbyRider[]);
    const notifyNewBroadcast = vi.fn(async () => {});
    const tracking = { nearbyRiders } as unknown as TrackingService;
    const notifications = { notifyNewBroadcast } as unknown as NotificationsService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, notifications);

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
          proposedFare: { toString: () => "2.50" },
          suggestedFare: { toString: () => "2.40" },
          distanceKm: 1.5,
        }),
      },
    };
    const expiry = { schedule: async () => {} } as unknown as OfferExpiryService;
    const tracking = { nearbyRiders: async () => { throw new Error("postgis down"); } } as unknown as TrackingService;
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry, tracking, noNotifications);

    await expect(svc.create(orderInput, "cust-1")).resolves.toMatchObject({ id: "ord-1" });
    await flush();
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
    );

  it("404s when the order is missing", async () => {
    await expect(svc(null).getSnapshot("missing", "cust-1")).rejects.toThrow(/order not found/i);
  });

  it("reveals the rider's phone to the customer during the active window", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBe("+263782000000");
    expect(snap.rider).toMatchObject({ profileId: "rider-1" });
  });

  it("returns pickup/drop-off for the map as point + landmark only — contactPhone redacted", async () => {
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

  it("hides phones outside the reveal window", async () => {
    const snap = await svc(row({ status: "open_for_offers" })).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBeNull();
  });

  it("never leaks a phone to a third party", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "stranger");
    expect(snap.counterpartyPhone).toBeNull();
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
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications);
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
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications);
    const rows = await svc.listOpen();
    expect(rows[0]!.pickup).toEqual({ point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" });
    expect(rows[0]!.dropoff).toEqual({ point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" });
    expect(rows[0]!.pickup).not.toHaveProperty("contactPhone");
    expect(rows[0]!.dropoff).not.toHaveProperty("contactPhone");
    expect(JSON.stringify(rows[0])).not.toContain("+263");
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
    rating: { score: 5, comment: "great" },
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
    const rows = await svc([row({ agreedFare: null, rating: null, riderId: null, rider: null })]).historyForUser("cust-1");
    expect(rows[0]!.agreedFare).toBeNull();
    expect(rows[0]!.rating).toBeNull();
    expect(rows[0]!.counterpartyName).toBeNull();
  });
});

describe("OrdersService.activeForRider", () => {
  it("returns null when the rider has no active order", async () => {
    const prisma = { order: { findFirst: async () => null } };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications);
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
      customer: { phone: "+263771111111" },
      rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
      events: [],
    };
    const prisma = {
      order: { findFirst: async () => ({ id: "o1" }), findUnique: async () => snap },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, {} as OfferExpiryService, noTracking, noNotifications);
    const res = await svc.activeForRider("rider-1");
    expect(res).toMatchObject({ id: "o1", status: "assigned" });
    // rider sees the customer's phone in the active window
    expect(res?.counterpartyPhone).toBe("+263771111111");
  });
});
