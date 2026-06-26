import { type CreateOrderRequest, quoteFare } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "./orders.service";

const orderInput: CreateOrderRequest = {
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771111111" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues", contactPhone: "+263772222222" },
  itemDescription: "Documents",
  declaredValue: 10,
  proposedFare: 2.5,
};

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
    const svc = new OrdersService(prisma as unknown as PrismaService, expiry);

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
});

describe("OrdersService.getSnapshot", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "ord-1",
    status: "assigned",
    agreedFare: null,
    proposedFare: 2.5,
    customerId: "cust-1",
    riderId: "rider-1",
    customer: { phone: "+263771111111" },
    rider: { profileId: "rider-1", currentLat: null, currentLng: null, updatedAt: null, profile: { phone: "+263782000000" } },
    events: [],
    ...overrides,
  });
  const svc = (snap: unknown) =>
    new OrdersService(
      { order: { findUnique: async () => snap } } as unknown as PrismaService,
      {} as OfferExpiryService,
    );

  it("404s when the order is missing", async () => {
    await expect(svc(null).getSnapshot("missing", "cust-1")).rejects.toThrow(/order not found/i);
  });

  it("reveals the rider's phone to the customer during the active window", async () => {
    const snap = await svc(row()).getSnapshot("ord-1", "cust-1");
    expect(snap.counterpartyPhone).toBe("+263782000000");
    expect(snap.rider).toMatchObject({ profileId: "rider-1" });
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
