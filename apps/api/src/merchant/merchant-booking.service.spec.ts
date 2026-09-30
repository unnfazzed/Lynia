import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateMerchantBookingRequest, CreateOrderRequest } from "@lynia/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchingService } from "../matching/matching.service";
import type { OffersService } from "../offers/offers.service";
import type { OrderLifecycleService } from "../orders/order-lifecycle.service";
import type { OrdersService } from "../orders/orders.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { MerchantAccess } from "./merchant-access";
import { bookingStateOf, MerchantBookingService } from "./merchant-booking.service";

/* ── An in-memory slice of the tables Book a rider touches ─────────────────────────────────────── */

interface ProfileRow { id: string; phone: string; firstName: string; lastName: string; onHold: boolean; riderStatus?: string }
interface OrderRow {
  id: string;
  customerId: string;
  status: string;
  createdAt: Date;
  pickup: unknown;
  dropoff: unknown;
  itemDesc: string;
  items: unknown;
  note: string | null;
  declaredValue: number;
  proposedFare: number;
  agreedFare: number | null;
  disclaimerVersion: string | null;
  riderId: string | null;
  undeliveredReason: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  rebroadcastOfId: string | null;
  deliveryCodeRotatedAt: Date | null;
  idempotencyKey?: string;
  deliveredAt?: Date | null;
  debtStatus?: string | null;
  debtAmount?: number | null;
  debtSettledAt?: Date | null;
  merchantClosedAt?: Date | null;
  merchantCloseReason?: string | null;
}
interface BookingRow { orderId: string; merchantId: string; bookedByProfileId: string; pickedByProfileId: string | null; cancelledByProfileId: string | null; collectCash?: boolean }

const dec = (n: number | null) => (n == null ? null : new Prisma.Decimal(n));
const PIN = { point: { lat: -17.8613, lng: 31.0362 }, landmark: "Mbare Musika, stall 14", contactPhone: "+263771110000" };
const BUYER = { point: { lat: -17.83, lng: 31.05 }, landmark: "Blue gate, 12 Fife Ave", contactPhone: "+263772220000" };

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function makeWorld() {
  const profiles = new Map<string, ProfileRow>();
  const merchants = new Map<string, { id: string; name: string; location: unknown }>();
  const members: Array<{ merchantId: string; profileId: string; displayName: string }> = [];
  const orders = new Map<string, OrderRow>();
  const bookings = new Map<string, BookingRow>();
  const offers: Array<{ id: string; orderId: string; riderId: string; status: string }> = [];
  const preferredRiders: Array<{ merchantId: string; phone: string }> = [];

  const byPhone = (phone: string) => [...profiles.values()].find((p) => p.phone === phone) ?? null;

  function materialize(o: OrderRow) {
    const rider = o.riderId ? profiles.get(o.riderId) : null;
    const b = bookings.get(o.id);
    return {
      ...o,
      declaredValue: dec(o.declaredValue),
      proposedFare: dec(o.proposedFare),
      agreedFare: dec(o.agreedFare),
      debtAmount: dec(o.debtAmount ?? null),
      rider: rider ? { bikeReg: "ABG 1234", profile: { firstName: rider.firstName, lastName: rider.lastName, phone: rider.phone } } : null,
      merchantBooking: b ? { bookedByProfileId: b.bookedByProfileId } : null,
      _count: { offers: offers.filter((x) => x.orderId === o.id && x.status === "pending").length },
    };
  }

  const prisma = {
    profile: {
      findUnique: async ({ where }: { where: { id?: string; phone?: string } }) => {
        const p = where.id ? profiles.get(where.id) : byPhone(where.phone!);
        if (!p) return null;
        return { ...p, rider: p.riderStatus ? { accountStatus: p.riderStatus } : null };
      },
      create: async ({ data }: { data: Omit<ProfileRow, "id" | "onHold"> }) => {
        if (byPhone(data.phone)) throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        const row = { ...data, id: id("acct"), onHold: false };
        profiles.set(row.id, row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ProfileRow> }) => {
        Object.assign(profiles.get(where.id)!, data);
        return profiles.get(where.id);
      },
      findMany: async ({ where }: { where: { id?: { in: string[] }; phone?: { in: string[] } } }) => {
        if (where.phone) {
          // preferredRiderIds: rider accounts by phone, with their team (if any).
          return [...profiles.values()]
            .filter((p) => where.phone!.in.includes(p.phone) && p.riderStatus)
            .map((p) => ({ id: p.id, merchantMemberships: members.filter((m) => m.profileId === p.id) }));
        }
        return where.id!.in.map((x) => profiles.get(x)).filter(Boolean);
      },
    },
    merchantPreferredRider: {
      findMany: async ({ where }: { where: { merchantId: string } }) => preferredRiders.filter((r) => r.merchantId === where.merchantId),
    },
    merchant: { findUnique: async ({ where }: { where: { id: string } }) => merchants.get(where.id) ?? null },
    merchantMember: {
      count: async ({ where }: { where: { merchantId: string; profileId: string } }) =>
        members.filter((m) => m.merchantId === where.merchantId && m.profileId === where.profileId).length,
      findMany: async ({ where }: { where: { merchantId: string; profileId?: { in: string[] } } }) =>
        members.filter((m) => m.merchantId === where.merchantId && (!where.profileId || where.profileId.in.includes(m.profileId))),
    },
    merchantBooking: {
      createMany: vi.fn(async ({ data }: { data: Array<Omit<BookingRow, "pickedByProfileId" | "cancelledByProfileId">> }) => {
        for (const d of data) if (!bookings.has(d.orderId)) bookings.set(d.orderId, { ...d, pickedByProfileId: null, cancelledByProfileId: null });
        return { count: data.length };
      }),
      findUnique: async ({ where }: { where: { orderId: string } }) => bookings.get(where.orderId) ?? null,
      update: async ({ where, data }: { where: { orderId: string }; data: Partial<BookingRow> }) => Object.assign(bookings.get(where.orderId)!, data),
      upsert: async ({ where, create, update }: { where: { orderId: string }; create: Partial<BookingRow> & Pick<BookingRow, "orderId" | "merchantId" | "bookedByProfileId">; update: Partial<BookingRow> }) => {
        const existing = bookings.get(where.orderId);
        if (existing) return Object.assign(existing, update);
        bookings.set(where.orderId, { pickedByProfileId: null, cancelledByProfileId: null, ...create });
        return bookings.get(where.orderId);
      },
    },
    order: {
      findUnique: async ({ where, select }: { where: { id: string }; select: Record<string, unknown> }) => {
        const o = orders.get(where.id);
        if (!o) return null;
        if (select && "merchantBooking" in select && !("status" in select)) {
          // rootBooker's narrow read
          const b = bookings.get(o.id);
          return { rebroadcastOfId: o.rebroadcastOfId, merchantBooking: b ? { bookedByProfileId: b.bookedByProfileId } : null };
        }
        return materialize(o);
      },
      findMany: async ({ where }: { where: { customerId?: string; rebroadcastOfId?: { in: string[] } } }) => {
        const all = [...orders.values()];
        if (where.customerId) return all.filter((o) => o.customerId === where.customerId).sort((a, b) => +b.createdAt - +a.createdAt).map(materialize);
        return all.filter((o) => o.rebroadcastOfId && where.rebroadcastOfId!.in.includes(o.rebroadcastOfId)).map((o) => ({ id: o.id, rebroadcastOfId: o.rebroadcastOfId }));
      },
      // closeCash's guarded close: only an open, not-yet-closed debt.
      updateMany: async ({ where, data }: { where: { id: string; debtStatus: string; merchantClosedAt: null }; data: Partial<OrderRow> }) => {
        const o = orders.get(where.id);
        if (!o || o.debtStatus !== where.debtStatus || o.merchantClosedAt) return { count: 0 };
        Object.assign(o, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: { where: { rebroadcastOfId: string } }) => {
        const o = [...orders.values()].find((x) => x.rebroadcastOfId === where.rebroadcastOfId);
        return o ? { id: o.id } : null;
      },
    },
    offer: {
      findFirst: async ({ where }: { where: { id: string; orderId: string } }) => offers.find((o) => o.id === where.id && o.orderId === where.orderId) ?? null,
    },
  };

  const ordersSvc = {
    create: vi.fn(async (input: CreateOrderRequest, customerId: string) => {
      const customer = profiles.get(customerId)!;
      if (customer.onHold) throw new ForbiddenException({ reason: "on_hold", message: "Your account is on hold." });
      const replay = [...orders.values()].find((o) => o.customerId === customerId && o.idempotencyKey === input.idempotencyKey);
      if (replay) return { id: replay.id };
      const row: OrderRow = {
        id: id("order"),
        customerId,
        status: "open_for_offers",
        createdAt: new Date(Date.now() + seq),
        pickup: input.pickup,
        dropoff: input.dropoff,
        itemDesc: (input.items ?? []).map((i) => i.description).join(" · "),
        items: input.items,
        note: input.note ?? null,
        declaredValue: input.declaredValue,
        proposedFare: input.proposedFare,
        agreedFare: null,
        disclaimerVersion: input.disclaimerVersion ?? null,
        riderId: null,
        undeliveredReason: null,
        cancelledBy: null,
        cancelReason: null,
        rebroadcastOfId: null,
        deliveryCodeRotatedAt: null,
        idempotencyKey: input.idempotencyKey,
      };
      orders.set(row.id, row);
      return { id: row.id };
    }),
  };
  const offersSvc = {
    listForOrder: vi.fn(async (orderId: string, callerId: string) => {
      if (orders.get(orderId)?.customerId !== callerId) throw new ForbiddenException("Not your order");
      return offers
        .filter((o) => o.orderId === orderId && o.status === "pending")
        .map((o) => {
          const p = profiles.get(o.riderId)!;
          return {
            id: o.id,
            type: "counter" as const,
            offeredFare: "4.00",
            etaMinutes: 7,
            rider: { profileId: o.riderId, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120, profile: { firstName: p.firstName, lastName: p.lastName, photoUrl: null } },
          };
        });
    }),
  };
  const matching = {
    selectOffer: vi.fn(async (orderId: string, offerId: string, customerId: string) => {
      const o = orders.get(orderId)!;
      if (o.customerId !== customerId) throw new ForbiddenException("Not your order");
      const offer = offers.find((x) => x.id === offerId)!;
      Object.assign(o, { status: "assigned", riderId: offer.riderId, agreedFare: 4, deliveryCodeRotatedAt: new Date() });
      return { orderId, riderId: offer.riderId, agreedFare: "4.00", status: "assigned" as const, deliveryCode: "482913" };
    }),
  };
  const lifecycle = {
    cancel: vi.fn(async (orderId: string, callerId: string, _reason?: string, opts?: { allowedStatuses?: readonly string[]; refusal?: { reason: string; message: string } }) => {
      const o = orders.get(orderId)!;
      if (o.customerId !== callerId) throw new ForbiddenException("Not your order");
      if (opts?.allowedStatuses && !opts.allowedStatuses.includes(o.status)) throw new ConflictException(opts.refusal);
      Object.assign(o, { status: "cancelled", cancelledBy: callerId });
      return { orderId, status: "cancelled" as const, cancelledBy: "customer" as const, cooldownUntil: null };
    }),
    rotateDeliveryCode: vi.fn(async (orderId: string, customerId: string) => {
      if (orders.get(orderId)?.customerId !== customerId) throw new ForbiddenException("Not your order");
      return { deliveryCode: "105377" };
    }),
  };

  const svc = new MerchantBookingService(
    prisma as unknown as PrismaService,
    ordersSvc as unknown as OrdersService,
    offersSvc as unknown as OffersService,
    matching as unknown as MatchingService,
    lifecycle as unknown as OrderLifecycleService,
  );

  // A car-parts shop with an owner and a cashier, and a rider who bids on things.
  merchants.set("m1", { id: "m1", name: "Mbare Auto Spares", location: PIN });
  profiles.set("owner", { id: "owner", phone: "+263771110000", firstName: "Tendai", lastName: "Moyo", onHold: false });
  profiles.set("cashier", { id: "cashier", phone: "+263771113333", firstName: "Rudo", lastName: "Dube", onHold: false });
  profiles.set("rider-1", { id: "rider-1", phone: "+263774440000", firstName: "Farai", lastName: "Chari", onHold: false, riderStatus: "active" });
  members.push({ merchantId: "m1", profileId: "owner", displayName: "Tendai" }, { merchantId: "m1", profileId: "cashier", displayName: "Rudo" });

  return { svc, prisma, profiles, merchants, members, orders, bookings, offers, preferredRiders, ordersSvc, offersSvc, matching, lifecycle };
}

const OWNER: MerchantAccess = { merchantId: "m1", role: "owner", businessType: "shop" };
const STAFF: MerchantAccess = { merchantId: "m1", role: "staff", businessType: "shop" };

function form(overrides: Partial<CreateMerchantBookingRequest> = {}): CreateMerchantBookingRequest {
  return {
    dropoff: BUYER,
    items: [{ description: "Brake pads (Corolla)", quantity: 1 }],
    declaredValue: 45,
    proposedFare: 3.5,
    disclaimerVersion: "2026-07-01",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

describe("MerchantBookingService.create (merchant web upgrade L2, D9)", () => {
  it("books on Send as the business's booking account, from the business's own pin, and records who booked", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());

    const account = [...w.profiles.values()].find((p) => p.phone === "business:m1")!;
    expect(account).toMatchObject({ firstName: "Mbare Auto Spares", lastName: "" });
    const [input, customerId] = w.ordersSvc.create.mock.calls[0]!;
    expect(customerId).toBe(account.id);
    expect(input).toMatchObject({ pickup: PIN, dropoff: BUYER, declaredValue: 45, proposedFare: 3.5, disclaimerVersion: "2026-07-01" });
    expect(w.bookings.get(booking.id)).toMatchObject({ merchantId: "m1", bookedByProfileId: "owner" });
    expect(booking).toMatchObject({ state: "finding", bookedBy: "Tendai", dropoff: BUYER, declaredValue: "45", proposedFare: "3.5", rider: null });
    expect(booking.expiresAt).not.toBeNull();
  });

  it("reuses the one booking account, and keeps its name in step with the business's", async () => {
    await w.svc.create(OWNER, "owner", form());
    w.merchants.get("m1")!.name = "Mbare Auto Spares & Tyres";
    await w.svc.create(STAFF, "cashier", form({ idempotencyKey: "22222222-2222-4222-8222-222222222222" }));
    const accounts = [...w.profiles.values()].filter((p) => p.phone === "business:m1");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.firstName).toBe("Mbare Auto Spares & Tyres");
  });

  it("a double tap books once: Send replays the order, and the booking row isn't duplicated", async () => {
    const first = await w.svc.create(OWNER, "owner", form());
    const again = await w.svc.create(OWNER, "owner", form());
    expect(again.id).toBe(first.id);
    expect(w.orders.size).toBe(1);
    expect(w.bookings.size).toBe(1);
  });

  it("applies Send's per-person checks to the member booking (OV-5): a held member, a banned or suspended rider", async () => {
    w.profiles.get("cashier")!.onHold = true;
    await expect(w.svc.create(STAFF, "cashier", form())).rejects.toMatchObject({ status: 403, response: { reason: "on_hold" } });
    w.profiles.get("cashier")!.onHold = false;
    w.profiles.get("cashier")!.riderStatus = "suspended";
    await expect(w.svc.create(STAFF, "cashier", form())).rejects.toMatchObject({ status: 403, response: { reason: "account_suspended" } });
    w.profiles.get("cashier")!.riderStatus = "banned";
    await expect(w.svc.create(STAFF, "cashier", form())).rejects.toMatchObject({ status: 403, response: { reason: "account_banned" } });
    expect(w.ordersSvc.create).not.toHaveBeenCalled();
  });

  it("a business on hold (its booking account held by ops) is paused as a business (R2-5)", async () => {
    await w.svc.create(OWNER, "owner", form());
    [...w.profiles.values()].find((p) => p.phone === "business:m1")!.onHold = true;
    await expect(w.svc.create(OWNER, "owner", form({ idempotencyKey: "33333333-3333-4333-8333-333333333333" }))).rejects.toMatchObject({
      status: 403,
      response: { reason: "business_on_hold", message: "Bookings are paused for this business. Message LyniaGo on WhatsApp." },
    });
  });

  it("a business with no pin is asked to set one before Send is called", async () => {
    w.merchants.get("m1")!.location = null;
    await expect(w.svc.create(OWNER, "owner", form())).rejects.toMatchObject({ status: 409, response: { reason: "no_location" } });
    expect(w.ordersSvc.create).not.toHaveBeenCalled();
  });
});

describe("the Deliveries list and a booking's detail", () => {
  it("is business-wide: the cashier sees the owner's booking, marked with who booked it", async () => {
    await w.svc.create(OWNER, "owner", form());
    const list = await w.svc.list(STAFF);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ bookedBy: "Tendai", state: "finding", offers: [] });
  });

  it("is empty before the first booking, and reading it never creates a booking account", async () => {
    expect(await w.svc.list(OWNER)).toEqual([]);
    expect([...w.profiles.values()].some((p) => p.phone === "business:m1")).toBe(false);
  });

  it("a booking that isn't this business's reads as not found, never forbidden", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    // The owner's own Send order from the customer app: theirs, but not the business's.
    w.orders.set("personal-send", { ...w.orders.get(booking.id)!, id: "personal-send", customerId: "owner" });
    await expect(w.svc.detail(OWNER, "personal-send")).rejects.toMatchObject({ status: 404 });
    await expect(w.svc.detail(OWNER, "no-such-order")).rejects.toMatchObject({ status: 404 });
  });

  it("while finding a rider, the detail lists the offers and marks a teammate's", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.offers.push({ id: "offer-1", orderId: booking.id, riderId: "rider-1", status: "pending" }, { id: "offer-2", orderId: booking.id, riderId: "cashier", status: "pending" });
    const detail = await w.svc.detail(STAFF, booking.id);
    expect(detail.offerCount).toBe(2);
    expect(detail.offers.map((o) => [o.rider.name, o.ownMember, o.preferred])).toEqual([
      ["Farai Chari", false, false],
      ["Rudo Dube", true, false],
    ]);
  });

  it("marks an offer from one of the business's own riders (L3), matched by the number they sign in with", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.preferredRiders.push({ merchantId: "m1", phone: "+263774440000" }, { merchantId: "other", phone: "+263771113333" });
    w.offers.push({ id: "offer-1", orderId: booking.id, riderId: "rider-1", status: "pending" });
    const detail = await w.svc.detail(OWNER, booking.id);
    expect(detail.offers.map((o) => [o.rider.name, o.preferred])).toEqual([["Farai Chari", true]]);
  });

  it("a rider's cancel shows as the cancelled booking pointing at Send's re-broadcast, which keeps the booker", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    const original = w.orders.get(booking.id)!;
    Object.assign(original, { status: "cancelled", riderId: "rider-1", cancelledBy: "rider-1" });
    const clone = { ...original, id: "clone-1", status: "open_for_offers", riderId: null, cancelledBy: null, rebroadcastOfId: booking.id, createdAt: new Date(Date.now() + 10_000) };
    w.orders.set(clone.id, clone);

    const list = await w.svc.list(OWNER);
    expect(list.map((b) => [b.id, b.state, b.cancelledBy, b.rebroadcastedToId, b.bookedBy])).toEqual([
      ["clone-1", "finding_again", null, null, "Tendai"],
      [booking.id, "cancelled", "rider", "clone-1", "Tendai"],
    ]);
  });
});

describe("pick, cancel, a new code, try again", () => {
  it("pick: Send's guarded pick as the business, the code returned once, and who picked recorded", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.offers.push({ id: "offer-1", orderId: booking.id, riderId: "rider-1", status: "pending" });

    const picked = await w.svc.pick(STAFF, "cashier", booking.id, "offer-1");

    const account = [...w.profiles.values()].find((p) => p.phone === "business:m1")!;
    expect(w.matching.selectOffer).toHaveBeenCalledWith(booking.id, "offer-1", account.id);
    expect(picked.deliveryCode).toBe("482913");
    expect(picked.booking).toMatchObject({ state: "coming", rider: { name: "Farai Chari", phone: "+263774440000", bikeReg: "ABG 1234" } });
    expect(w.bookings.get(booking.id)).toMatchObject({ bookedByProfileId: "owner", pickedByProfileId: "cashier" });
  });

  it("pick: someone on the business's own team can't take its delivery (T16)", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.offers.push({ id: "offer-2", orderId: booking.id, riderId: "cashier", status: "pending" });
    await expect(w.svc.pick(OWNER, "owner", booking.id, "offer-2")).rejects.toMatchObject({ status: 409, response: { reason: "own_member" } });
    expect(w.matching.selectOffer).not.toHaveBeenCalled();
  });

  it("cancel: Send's customer cancel as the business, narrowed to before pickup inside Send's transaction (OV-8)", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    const cancelled = await w.svc.cancel(STAFF, "cashier", booking.id, "Buyer changed their mind");

    const account = [...w.profiles.values()].find((p) => p.phone === "business:m1")!;
    const [, callerId, reason, opts] = w.lifecycle.cancel.mock.calls[0]!;
    expect(callerId).toBe(account.id);
    expect(reason).toBe("Buyer changed their mind");
    expect(opts).toEqual({
      allowedStatuses: ["open_for_offers", "assigned", "confirmed", "en_route_pickup"],
      refusal: { reason: "picked_up", message: "The rider has it now. Call the rider." },
    });
    expect(cancelled).toMatchObject({ state: "cancelled", cancelledBy: "business" });
    expect(w.bookings.get(booking.id)?.cancelledByProfileId).toBe("cashier");
  });

  it("cancel after pickup is refused with the merchant's words", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.orders.get(booking.id)!.status = "picked_up";
    await expect(w.svc.cancel(OWNER, "owner", booking.id)).rejects.toMatchObject({ status: 409, response: { reason: "picked_up" } });
  });

  it("a new code is Send's rotation as the business", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    await expect(w.svc.rotateCode(STAFF, booking.id)).resolves.toEqual({ deliveryCode: "105377" });
  });

  it("try again re-sends an expired booking's details from the current pin, at a raised fare if asked", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    w.orders.get(booking.id)!.status = "expired";
    const moved = { ...PIN, landmark: "New stall 3" };
    w.merchants.get("m1")!.location = moved;

    const again = await w.svc.retry(STAFF, "cashier", booking.id, { proposedFare: 4.5, idempotencyKey: "44444444-4444-4444-8444-444444444444" });

    const [input] = w.ordersSvc.create.mock.calls[1]!;
    expect(input).toMatchObject({ pickup: moved, dropoff: BUYER, items: [{ description: "Brake pads (Corolla)", quantity: 1 }], declaredValue: 45, proposedFare: 4.5 });
    expect(again.id).not.toBe(booking.id);
    expect(again).toMatchObject({ state: "finding", bookedBy: "Rudo" });
  });

  it("try again refuses a booking that's still live", async () => {
    const booking = await w.svc.create(OWNER, "owner", form());
    await expect(w.svc.retry(OWNER, "owner", booking.id, { idempotencyKey: "55555555-5555-4555-8555-555555555555" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "still_live" },
    });
  });
});

describe("cash on delivery (D-48 PR 4b)", () => {
  it("adds the cash line riders see, records the choice, and keeps the shop's own summary clean", async () => {
    const booking = await w.svc.create(OWNER, "owner", form({ declaredValue: 51, collectCash: true }));
    const [input] = w.ordersSvc.create.mock.calls[0]!;
    expect(input.items).toEqual([
      { description: "Brake pads (Corolla)", quantity: 1 },
      { description: "Cash on delivery: collect $51.00 from the buyer, bring it back to Mbare Auto Spares", quantity: 1 },
    ]);
    expect(w.bookings.get(booking.id)).toMatchObject({ collectCash: true });
    expect(booking.itemsSummary).toBe("Brake pads (Corolla)");
    expect(booking.cashOnDelivery).toEqual({ amount: "51.00", status: "awaiting_delivery", dueAt: null });
  });

  it("a delivery-only booking has no cash, and a cash one needs a value and room for the line", async () => {
    expect((await w.svc.create(OWNER, "owner", form())).cashOnDelivery).toBeNull();
    await expect(w.svc.create(OWNER, "owner", form({ declaredValue: 0, collectCash: true, idempotencyKey: "22222222-2222-4222-8222-222222222222" }))).rejects.toMatchObject({
      response: { reason: "bad_cash_on_delivery" },
    });
  });

  it("once delivered the cash is due; 'I got it' settles it once, and a second tap is told it's closed", async () => {
    const booking = await w.svc.create(OWNER, "owner", form({ declaredValue: 51, collectCash: true }));
    const deliveredAt = new Date("2026-09-30T12:41:00.000Z");
    Object.assign(w.orders.get(booking.id)!, { status: "delivered", deliveredAt, debtStatus: "open", debtAmount: 51 });
    expect((await w.svc.detail(OWNER, booking.id)).cashOnDelivery).toEqual({ amount: "51", status: "due", dueAt: "2026-09-30T13:11:00.000Z" });
    const done = await w.svc.closeCash(STAFF, booking.id, { outcome: "returned" });
    expect(done.cashOnDelivery?.status).toBe("returned");
    expect(w.orders.get(booking.id)!.debtStatus).toBe("settled_cash");
    await expect(w.svc.closeCash(OWNER, booking.id, { outcome: "no_cash" })).rejects.toMatchObject({ response: { reason: "already_closed" } });
  });

  it("'No cash on this one' closes the shop's side without counting cash", async () => {
    const booking = await w.svc.create(OWNER, "owner", form({ declaredValue: 51, collectCash: true }));
    Object.assign(w.orders.get(booking.id)!, { status: "delivered", deliveredAt: new Date(), debtStatus: "open", debtAmount: 51 });
    expect((await w.svc.closeCash(OWNER, booking.id, { outcome: "no_cash" })).cashOnDelivery?.status).toBe("closed");
    expect(w.orders.get(booking.id)).toMatchObject({ debtStatus: "open", merchantCloseReason: "no_cash" });
  });

  it("before delivery, and on a delivery-only booking, there's nothing to close", async () => {
    const cod = await w.svc.create(OWNER, "owner", form({ declaredValue: 51, collectCash: true }));
    await expect(w.svc.closeCash(OWNER, cod.id, { outcome: "returned" })).rejects.toMatchObject({ response: { reason: "not_delivered_yet" } });
    const plain = await w.svc.create(OWNER, "owner", form({ idempotencyKey: "33333333-3333-4333-8333-333333333333" }));
    await expect(w.svc.closeCash(OWNER, plain.id, { outcome: "returned" })).rejects.toMatchObject({ response: { reason: "no_cash_on_delivery" } });
  });

  it("try again keeps cash on delivery, rebuilding the line rather than copying it", async () => {
    const booking = await w.svc.create(OWNER, "owner", form({ declaredValue: 51, collectCash: true }));
    w.orders.get(booking.id)!.status = "expired";
    await w.svc.retry(OWNER, "owner", booking.id, { idempotencyKey: "44444444-4444-4444-8444-444444444444" });
    const [input] = w.ordersSvc.create.mock.calls[1]!;
    expect(input.items!.filter((i) => i.description.startsWith("Cash on delivery"))).toHaveLength(1);
  });
});

describe("bookingStateOf — Send's statuses as the merchant sees them", () => {
  it.each([
    ["open_for_offers", null, "finding"],
    ["open_for_offers", "o-0", "finding_again"],
    ["assigned", null, "coming"],
    ["en_route_pickup", null, "coming"],
    ["picked_up", null, "picked_up"],
    ["en_route_dropoff", null, "picked_up"],
    ["delivered", null, "delivered"],
    ["completed", null, "delivered"],
    ["undelivered", null, "not_delivered"],
    ["expired", null, "expired"],
    ["cancelled", null, "cancelled"],
  ])("%s (re-broadcast of %s) → %s", (status, rebroadcastOfId, state) => {
    expect(bookingStateOf(status, rebroadcastOfId)).toBe(state);
  });
});
