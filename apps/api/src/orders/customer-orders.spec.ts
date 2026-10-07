import { describe, expect, it } from "vitest";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { TrackingService } from "../tracking/tracking.service";
import { CUSTOMER_ORDERS_PAGE, customerOrderOutcome, merchantServiceOf, OrdersService, parseOrdersCursor } from "./orders.service";

/** The customer Orders tab feed, GET /orders/mine/history (Orders v2, ledger D-63). */

const ME = "11111111-1111-4111-8111-111111111111";
const RIDER = "22222222-2222-4222-8222-222222222222";
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Args = { where: Record<string, unknown>; orderBy: unknown; take: number; select: unknown };

function svc(rows: unknown[], capture?: (a: Args) => void): OrdersService {
  return new OrdersService(
    {
      order: {
        findMany: async (args: Args) => {
          capture?.(args);
          return rows;
        },
      },
    } as unknown as PrismaService,
    {} as OfferExpiryService,
    {} as TrackingService,
    {} as NotificationsService,
    {} as TrackingGateway,
  );
}

const dec = (v: string) => ({ toString: () => v });
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  orderType: "parcel",
  riderId: RIDER,
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate Mall, CBD", contactPhone: "+263771111111" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Belgravia", contactPhone: "+263772222222" },
  itemDesc: "Documents",
  note: null,
  proposedFare: dec("3.00"),
  agreedFare: dec("3.36"),
  status: "delivered",
  createdAt: new Date(Date.UTC(2026, 9, 2, 10, 0, 0) - n * 60_000),
  cancelledBy: null,
  rejectionReason: null,
  rating: [
    { score: 2, comment: "sender issue", byProfileId: RIDER },
    { score: 4, comment: null, byProfileId: ME },
  ],
  rider: { profile: { firstName: "Tendai", lastName: "Moyo" } },
  merchant: null,
  ...over,
});

describe("OrdersService.customerOrders", () => {
  it("reads only the caller's own orders, in every terminal outcome, newest first, one past the page", async () => {
    let args: Args | undefined;
    await svc([], (a) => (args = a)).customerOrders(ME);
    expect(args!.where).toEqual({ customerId: ME, status: { in: ["delivered", "completed", "cancelled", "expired", "undelivered"] } });
    expect(args!.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args!.take).toBe(CUSTOMER_ORDERS_PAGE + 1);
  });

  it("pages after the cursor's row (createdAt, then id for ties)", async () => {
    let args: Args | undefined;
    const at = "2026-10-01T08:00:00.000Z";
    await svc([], (a) => (args = a)).customerOrders(ME, `${at}|${id(7)}`);
    expect(args!.where.OR).toEqual([{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: id(7) } }]);
  });

  it("returns a nextCursor only when there is another page, pointing at the page's last row", async () => {
    const full = Array.from({ length: CUSTOMER_ORDERS_PAGE + 1 }, (_, i) => row(i));
    const page = await svc(full).customerOrders(ME);
    expect(page.rows).toHaveLength(CUSTOMER_ORDERS_PAGE);
    const last = full[CUSTOMER_ORDERS_PAGE - 1]!;
    expect(page.nextCursor).toBe(`${last.createdAt.toISOString()}|${last.id}`);
    expect((await svc([row(1)]).customerOrders(ME)).nextCursor).toBeNull();
  });

  it("serializes a row: service, outcome, the amount charged, my rating, the rider, no phones", async () => {
    const [r] = (await svc([row(1)]).customerOrders(ME)).rows;
    expect(r).toMatchObject({ service: "parcel", outcome: "delivered", chargedTotal: "3.36", role: "customer", rating: { score: 4, comment: null }, counterpartyName: "Tendai Moyo" });
    expect(JSON.stringify(r)).not.toContain("+26377");
  });

  it("a merchant row carries the venue and its service; an unpaid outcome charges nothing", async () => {
    const { rows } = await svc([
      row(1, { orderType: "merchant", merchant: { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" }, status: "cancelled", rejectionReason: "kitchen_unconfirmed", rider: null }),
    ]).customerOrders(ME);
    expect(rows[0]).toMatchObject({ service: "pharmacy", merchantName: "Avondale Pharmacy", outcome: "kitchen_timeout", chargedTotal: null, counterpartyName: null });
  });

  // C9 (U36): a merchant row's charge is its one server-computed amount due, as on its receipt.
  const food = (n: number, over: Record<string, unknown> = {}) =>
    row(n, {
      orderType: "merchant",
      merchant: { name: "Gava’s Kitchen", businessType: "restaurant", shopKind: null },
      agreedFare: dec("9.00"),
      merchantGoodsTotal: dec("7.50"),
      deliveryFee: dec("1.50"),
      merchantDeliveryShare: null,
      carriedBalance: [],
      owedBalance: null,
      ...over,
    });

  it("C9 (U36): a delivered merchant row that collected an owed balance charges the agreed total plus it, and says so additively", async () => {
    let args: Args | undefined;
    const { rows } = await svc([food(1, { carriedBalance: [{ amount: dec("8.00") }] }), food(2)], (a) => (args = a)).customerOrders(ME);
    expect(rows[0]).toMatchObject({ outcome: "delivered", chargedTotal: "17.00", amountDueUsd: 17 });
    expect(rows[1]).toMatchObject({ outcome: "delivered", chargedTotal: "9.00", amountDueUsd: 9 });
    expect(args!.select).toMatchObject({ carriedBalance: { select: { amount: true } }, owedBalance: { select: { amount: true } } });
  });

  it("C9 (U36): a merchant order cancelled after collection shows what it left owing, not 'No charge'", async () => {
    const { rows } = await svc([food(1, { status: "cancelled", cancelledBy: ME, owedBalance: { amount: dec("8.00") } }), food(2, { status: "cancelled", cancelledBy: ME })]).customerOrders(
      ME,
    );
    expect(rows[0]).toMatchObject({ outcome: "cancelled_by_you", chargedTotal: "8.00" });
    expect(rows[1]).toMatchObject({ outcome: "cancelled_by_you", chargedTotal: null });
  });

  it("C9: a parcel row is unchanged — its agreed fare, no amountDueUsd", async () => {
    const [r] = (await svc([row(1)]).customerOrders(ME)).rows;
    expect(r!.chargedTotal).toBe("3.36");
    expect(r).not.toHaveProperty("amountDueUsd");
  });
});

describe("customerOrderOutcome", () => {
  const o = (over: Partial<Parameters<typeof customerOrderOutcome>[0]>) => ({ status: "cancelled", cancelledBy: null, riderId: RIDER, rejectionReason: null, ...over });
  it.each([
    [{ status: "completed" }, "delivered"],
    [{ status: "expired" }, "no_rider"],
    [{ status: "undelivered" }, "not_delivered"],
    [{ cancelledBy: ME }, "cancelled_by_you"],
    [{ cancelledBy: RIDER }, "cancelled_by_rider"],
    [{ rejectionReason: "kitchen_unconfirmed" }, "kitchen_timeout"],
    [{ rejectionReason: "no_rider" }, "no_rider"],
    [{ rejectionReason: "all_out_of_stock" }, "venue_declined"],
    [{ rejectionReason: "rx_declined" }, "venue_declined"],
    [{ rejectionReason: "other" }, "cancelled_by_lynia"],
    [{}, "cancelled_by_lynia"],
  ] as const)("%o → %s", (over, outcome) => {
    expect(customerOrderOutcome(o(over), ME)).toBe(outcome);
  });
});

describe("helpers", () => {
  it("merchantServiceOf", () => {
    expect(merchantServiceOf({ businessType: "restaurant", shopKind: null })).toBe("food");
    expect(merchantServiceOf({ businessType: "shop", shopKind: "grocery" })).toBe("shops");
    expect(merchantServiceOf({ businessType: "shop", shopKind: "pharmacy" })).toBe("pharmacy");
    expect(merchantServiceOf(null)).toBe("food");
  });

  it("parseOrdersCursor rejects anything malformed (first page)", () => {
    expect(parseOrdersCursor(null)).toBeNull();
    expect(parseOrdersCursor("nonsense")).toBeNull();
    // A repeated ?cursor= param arrives as an array (type confusion through tampering).
    expect(parseOrdersCursor([`2026-10-01T08:00:00.000Z|${id(1)}`, "x"])).toBeNull();
    expect(parseOrdersCursor({ toString: () => "x" })).toBeNull();
    expect(parseOrdersCursor(`not-a-date|${id(1)}`)).toBeNull();
    expect(parseOrdersCursor("2026-10-01T08:00:00.000Z|x'; drop")).toBeNull();
    expect(parseOrdersCursor(`2026-10-01T08:00:00.000Z|${id(1)}`)).toEqual({ at: new Date("2026-10-01T08:00:00.000Z"), id: id(1) });
  });
});
