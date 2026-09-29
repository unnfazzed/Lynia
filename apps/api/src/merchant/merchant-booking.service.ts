import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  type CreateMerchantBookingRequest,
  type CreateOrderRequest,
  type LatLng,
  type MerchantBookingOffer,
  type MerchantBookingResponse,
  type MerchantBookingState,
  OFFER_WINDOW_MS,
  type OrderItem,
  PHONE_REVEAL_STATUSES,
  type PickMerchantBookingOfferResponse,
  type RetryMerchantBookingRequest,
  type RotateMerchantBookingCodeResponse,
  type Waypoint,
} from "@lynia/shared";
import { MatchingService } from "../matching/matching.service";
import { OffersService } from "../offers/offers.service";
import { customerSafeCancelReason } from "../orders/cancel-reason";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { ensureBookingAccount, findBookingAccountId } from "./booking-account";
import { resolveMapLink } from "./map-link-resolver";
import type { MerchantAccess } from "./merchant-access";

/** A business cancels only before pickup (design doc L2: after pickup the goods are with the rider). */
const MERCHANT_CANCELLABLE = ["open_for_offers", "assigned", "confirmed", "en_route_pickup"] as const;
/** The Deliveries list's depth: the latest 50 bookings (a business's recent history, not an archive). */
const LIST_LIMIT = 50;
/** Send's re-broadcast can chain if riders keep cancelling; follow it this far to find the booker. */
const MAX_REBROADCAST_DEPTH = 5;

const BOOKING_SELECT = {
  id: true,
  customerId: true,
  status: true,
  createdAt: true,
  dropoff: true,
  itemDesc: true,
  items: true,
  note: true,
  declaredValue: true,
  proposedFare: true,
  agreedFare: true,
  disclaimerVersion: true,
  riderId: true,
  undeliveredReason: true,
  cancelledBy: true,
  cancelReason: true,
  rebroadcastOfId: true,
  deliveryCodeRotatedAt: true,
  rider: { select: { bikeReg: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
  merchantBooking: { select: { bookedByProfileId: true } },
  _count: { select: { offers: { where: { status: "pending" } } } },
} satisfies Prisma.OrderSelect;
type BookingRow = Prisma.OrderGetPayload<{ select: typeof BOOKING_SELECT }>;

/** Send's status as the merchant sees it (design doc L2 "States in the Deliveries list"). */
export function bookingStateOf(status: string, rebroadcastOfId: string | null): MerchantBookingState {
  switch (status) {
    case "requested":
    case "open_for_offers":
      return rebroadcastOfId ? "finding_again" : "finding";
    case "assigned":
    case "confirmed":
    case "en_route_pickup":
      return "coming";
    case "picked_up":
    case "en_route_dropoff":
      return "picked_up";
    case "delivered":
    case "completed":
      return "delivered";
    case "undelivered":
      return "not_delivered";
    case "expired":
      return "expired";
    default:
      return "cancelled";
  }
}

function fullName(p: { firstName: string; lastName: string } | null | undefined): string | null {
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : "";
  return name || null;
}

/**
 * Book a rider (merchant web upgrade L2, docs/plans/2026-09-29-merchant-web-upgrade-plan.md D9). Every
 * booking is a Send order placed by the business's booking account, so Send's own services do the work
 * — create, the offer list, the pick, cancel and code rotation — called AS that account. What this
 * service adds is the business around them:
 *  - the team: any member acts on any of the business's bookings, and `merchant_bookings` records who
 *    booked, picked and cancelled;
 *  - Send's per-person checks applied to the member booking, since Send sees only the booking account
 *    (OV-5): their own hold and a banned or suspended rider account;
 *  - the business's own pin as every pickup, and its own team refused as its riders (T16);
 *  - a narrower cancel: before pickup only, checked inside Send's transaction (OV-8).
 * A booking that isn't this business's reads as "not found", never "forbidden", so ids leak nothing.
 */
@Injectable()
export class MerchantBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly offers: OffersService,
    private readonly matching: MatchingService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  async create(access: MerchantAccess, profileId: string, body: CreateMerchantBookingRequest): Promise<MerchantBookingResponse> {
    await this.assertMemberCanBook(profileId);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: access.merchantId },
      select: { id: true, name: true, location: true },
    });
    if (!merchant) throw new NotFoundException("Business not found");
    const pickup = (merchant.location as Waypoint | null) ?? null;
    if (!pickup) {
      throw new ConflictException({ reason: "no_location", message: "Set your business's pin before booking a rider." });
    }
    const accountId = await ensureBookingAccount(this.prisma, merchant);
    const created = await this.createAsBusiness(accountId, {
      pickup,
      dropoff: body.dropoff,
      items: body.items,
      declaredValue: body.declaredValue,
      proposedFare: body.proposedFare,
      ...(body.note ? { note: body.note } : {}),
      disclaimerVersion: body.disclaimerVersion,
      idempotencyKey: body.idempotencyKey,
    });
    // ON CONFLICT DO NOTHING: an idempotent replay returns Send's existing order, and its row stays (OV-8).
    await this.prisma.merchantBooking.createMany({
      data: [{ orderId: created.id, merchantId: merchant.id, bookedByProfileId: profileId }],
      skipDuplicates: true,
    });
    return this.detail(access, created.id);
  }

  /** The business's bookings, newest first. Business-wide: every member sees every booking. */
  async list(access: MerchantAccess): Promise<MerchantBookingResponse[]> {
    const accountId = await findBookingAccountId(this.prisma, access.merchantId);
    if (!accountId) return [];
    const rows = await this.prisma.order.findMany({
      where: { customerId: accountId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: BOOKING_SELECT,
    });
    const [bookers, clones] = await Promise.all([
      this.bookerNames(access.merchantId, rows),
      this.prisma.order.findMany({
        where: { rebroadcastOfId: { in: rows.filter((r) => r.status === "cancelled").map((r) => r.id) } },
        select: { id: true, rebroadcastOfId: true },
      }),
    ]);
    const cloneOf = new Map(clones.map((c) => [c.rebroadcastOfId, c.id]));
    return rows.map((r) => this.toResponse(r, accountId, { bookedBy: bookers.get(r.id) ?? null, rebroadcastedToId: cloneOf.get(r.id) ?? null, offers: [] }));
  }

  /** One booking, with its pending offers while a rider is being found. */
  async detail(access: MerchantAccess, orderId: string): Promise<MerchantBookingResponse> {
    const { row, accountId } = await this.ownedBooking(access, orderId);
    const [bookers, clone, offers] = await Promise.all([
      this.bookerNames(access.merchantId, [row]),
      row.status === "cancelled"
        ? this.prisma.order.findFirst({ where: { rebroadcastOfId: row.id }, select: { id: true } })
        : Promise.resolve(null),
      row.status === "open_for_offers" ? this.offersFor(access.merchantId, row.id, accountId) : Promise.resolve([]),
    ]);
    return this.toResponse(row, accountId, { bookedBy: bookers.get(row.id) ?? null, rebroadcastedToId: clone?.id ?? null, offers });
  }

  /**
   * Pick a rider. Send's selectOffer does the guarded assignment (it re-checks the window, the offer and
   * the rider in its own transaction) and mints the delivery code, returned here ONCE. First, a rider
   * who is on this business's own team is refused: the business holds the code, so they could deliver
   * to themselves (T16).
   */
  async pick(access: MerchantAccess, profileId: string, orderId: string, offerId: string): Promise<PickMerchantBookingOfferResponse> {
    const { accountId } = await this.ownedBooking(access, orderId);
    const offer = await this.prisma.offer.findFirst({ where: { id: offerId, orderId }, select: { riderId: true } });
    if (!offer) throw new NotFoundException({ reason: "offer_gone", message: "That rider's offer is gone. Pick another." });
    if (await this.isMember(access.merchantId, offer.riderId)) {
      throw new ConflictException({ reason: "own_member", message: "Someone on your team can't take your own delivery." });
    }
    const picked = await this.matching.selectOffer(orderId, offerId, accountId);
    await this.recordActor(access.merchantId, orderId, profileId, "pickedByProfileId");
    return { booking: await this.detail(access, orderId), deliveryCode: picked.deliveryCode };
  }

  /** Cancel before pickup, as Send's customer cancel (no rider penalty). After pickup: 409 `picked_up`. */
  async cancel(access: MerchantAccess, profileId: string, orderId: string, reason?: string): Promise<MerchantBookingResponse> {
    const { accountId } = await this.ownedBooking(access, orderId);
    await this.lifecycle.cancel(orderId, accountId, reason, {
      allowedStatuses: MERCHANT_CANCELLABLE,
      refusal: { reason: "picked_up", message: "The rider has it now. Call the rider." },
    });
    await this.recordActor(access.merchantId, orderId, profileId, "cancelledByProfileId");
    return this.detail(access, orderId);
  }

  /** "Send a new code": Send's rotation, which replaces the old code (any member, any time before delivery). */
  async rotateCode(access: MerchantAccess, orderId: string): Promise<RotateMerchantBookingCodeResponse> {
    const { accountId } = await this.ownedBooking(access, orderId);
    return this.lifecycle.rotateDeliveryCode(orderId, accountId);
  }

  /**
   * Try again: re-broadcast an expired (or cancelled) booking's buyer, items, value and note as a new
   * booking from the business's current pin — at the old fare unless the business raises it.
   */
  async retry(access: MerchantAccess, profileId: string, orderId: string, body: RetryMerchantBookingRequest): Promise<MerchantBookingResponse> {
    const { row } = await this.ownedBooking(access, orderId);
    if (row.status !== "expired" && row.status !== "cancelled") {
      throw new ConflictException({ reason: "still_live", message: "This booking is still live, so there's nothing to try again." });
    }
    const items = (row.items as OrderItem[] | null) ?? [{ description: row.itemDesc.slice(0, 140) || "Parcel", quantity: 1 }];
    return this.create(access, profileId, {
      dropoff: row.dropoff as unknown as Waypoint,
      items,
      declaredValue: Number(row.declaredValue),
      proposedFare: body.proposedFare ?? Number(row.proposedFare),
      ...(row.note ? { note: row.note } : {}),
      disclaimerVersion: row.disclaimerVersion ?? "merchant-booking",
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** A Google Maps short link the browser can't follow, resolved against the strict allow-list (OV-6). */
  resolveLink(url: string): Promise<LatLng> {
    return resolveMapLink(url);
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Send's per-person checks, applied to the member booking (OV-5): Send's own create checks only the
   * booking account (which is how an ops hold on the whole business works).
   */
  private async assertMemberCanBook(profileId: string): Promise<void> {
    const me = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { onHold: true, rider: { select: { accountStatus: true } } },
    });
    if (me?.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "Your account is on hold. Message LyniaGo on WhatsApp." });
    }
    const status = me?.rider?.accountStatus;
    if (status === "banned" || status === "suspended") {
      throw new ForbiddenException({
        reason: status === "banned" ? "account_banned" : "account_suspended",
        message: "Your account is not in good standing.",
      });
    }
  }

  /** Send's create as the business. Send refuses a held account with `on_hold`: here that's the business. */
  private async createAsBusiness(accountId: string, input: CreateOrderRequest): Promise<{ id: string }> {
    try {
      return await this.orders.create(input, accountId);
    } catch (err) {
      const reason = err instanceof ForbiddenException ? (err.getResponse() as { reason?: unknown }).reason : undefined;
      if (reason === "on_hold") {
        throw new ForbiddenException({ reason: "business_on_hold", message: "Bookings are paused for this business. Message LyniaGo on WhatsApp." });
      }
      throw err;
    }
  }

  /** The booking, if it is this business's; otherwise 404 (never a 403 that confirms the id exists). */
  private async ownedBooking(access: MerchantAccess, orderId: string): Promise<{ row: BookingRow; accountId: string }> {
    const [accountId, row] = await Promise.all([
      findBookingAccountId(this.prisma, access.merchantId),
      this.prisma.order.findUnique({ where: { id: orderId }, select: BOOKING_SELECT }),
    ]);
    if (!accountId || !row || row.customerId !== accountId) throw new NotFoundException("Booking not found");
    return { row, accountId };
  }

  private async isMember(merchantId: string, profileId: string): Promise<boolean> {
    return (await this.prisma.merchantMember.count({ where: { merchantId, profileId } })) > 0;
  }

  /** Pending offers, read through Send's own ownership- and block-gated list, marked for the business. */
  private async offersFor(merchantId: string, orderId: string, accountId: string): Promise<MerchantBookingOffer[]> {
    const [offers, members] = await Promise.all([
      this.offers.listForOrder(orderId, accountId),
      this.prisma.merchantMember.findMany({ where: { merchantId }, select: { profileId: true } }),
    ]);
    const memberIds = new Set(members.map((m) => m.profileId));
    return offers.map((o) => ({
      id: o.id,
      type: o.type,
      offeredFare: o.offeredFare,
      etaMinutes: o.etaMinutes,
      rider: {
        name: fullName(o.rider.profile) ?? "Rider",
        photoUrl: o.rider.profile.photoUrl ?? null,
        ratingAvg: o.rider.ratingAvg == null ? null : Number(o.rider.ratingAvg),
        ratingCount: o.rider.ratingCount,
        tripsCount: o.rider.tripsCount,
      },
      // L3 ("Your riders") marks the business's own riders.
      preferred: false,
      ownMember: memberIds.has(o.rider.profileId),
    }));
  }

  /** Records who picked or cancelled. A re-broadcast clone gets its row here, carrying the original's booker. */
  private async recordActor(merchantId: string, orderId: string, profileId: string, field: "pickedByProfileId" | "cancelledByProfileId"): Promise<void> {
    const existing = await this.prisma.merchantBooking.findUnique({ where: { orderId }, select: { orderId: true } });
    if (existing) {
      await this.prisma.merchantBooking.update({ where: { orderId }, data: { [field]: profileId } });
      return;
    }
    const bookedBy = (await this.rootBooker(orderId)) ?? profileId;
    await this.prisma.merchantBooking.upsert({
      where: { orderId },
      create: { orderId, merchantId, bookedByProfileId: bookedBy, [field]: profileId },
      update: { [field]: profileId },
    });
  }

  /** Who booked the booking a re-broadcast chain started from. */
  private async rootBooker(orderId: string): Promise<string | null> {
    let id: string | null = orderId;
    for (let depth = 0; id && depth <= MAX_REBROADCAST_DEPTH; depth++) {
      const order: { rebroadcastOfId: string | null; merchantBooking: { bookedByProfileId: string } | null } | null =
        await this.prisma.order.findUnique({
          where: { id },
          select: { rebroadcastOfId: true, merchantBooking: { select: { bookedByProfileId: true } } },
        });
      if (!order) return null;
      if (order.merchantBooking) return order.merchantBooking.bookedByProfileId;
      id = order.rebroadcastOfId;
    }
    return null;
  }

  /** "Booked by …" per booking: the team's name for the person, else their own profile name. */
  private async bookerNames(merchantId: string, rows: BookingRow[]): Promise<Map<string, string>> {
    const bookerOf = new Map<string, string>();
    for (const r of rows) {
      const direct = r.merchantBooking?.bookedByProfileId;
      const booker = direct ?? (r.rebroadcastOfId ? await this.rootBooker(r.rebroadcastOfId) : null);
      if (booker) bookerOf.set(r.id, booker);
    }
    const ids = [...new Set(bookerOf.values())];
    if (ids.length === 0) return new Map();
    const [members, profiles] = await Promise.all([
      this.prisma.merchantMember.findMany({ where: { merchantId, profileId: { in: ids } }, select: { profileId: true, displayName: true } }),
      this.prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const nameOf = new Map<string, string>();
    for (const p of profiles) {
      const name = fullName(p);
      if (name) nameOf.set(p.id, name);
    }
    for (const m of members) nameOf.set(m.profileId, m.displayName);
    const out = new Map<string, string>();
    for (const [orderId, booker] of bookerOf) {
      const name = nameOf.get(booker);
      if (name) out.set(orderId, name);
    }
    return out;
  }

  private toResponse(
    r: BookingRow,
    accountId: string,
    extra: { bookedBy: string | null; rebroadcastedToId: string | null; offers: MerchantBookingOffer[] },
  ): MerchantBookingResponse {
    const reveal = (PHONE_REVEAL_STATUSES as string[]).includes(r.status);
    return {
      id: r.id,
      state: bookingStateOf(r.status, r.rebroadcastOfId),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.status === "open_for_offers" ? new Date(r.createdAt.getTime() + OFFER_WINDOW_MS).toISOString() : null,
      dropoff: r.dropoff as unknown as Waypoint,
      itemsSummary: r.itemDesc,
      declaredValue: r.declaredValue.toString(),
      proposedFare: r.proposedFare.toString(),
      agreedFare: r.agreedFare?.toString() ?? null,
      bookedBy: extra.bookedBy,
      rider: r.rider
        ? {
            name: fullName(r.rider.profile) ?? "Rider",
            phone: reveal ? r.rider.profile.phone : null,
            bikeReg: r.rider.bikeReg ?? null,
          }
        : null,
      offerCount: r._count.offers,
      undeliveredReason: r.undeliveredReason ?? null,
      cancelledBy:
        r.status !== "cancelled" || !r.cancelledBy
          ? null
          : r.cancelledBy === accountId
            ? "business"
            : r.cancelledBy === r.riderId
              ? "rider"
              : "ops",
      // The business is the customer here, so ops-internal wording gets Send's customer-safe copy.
      cancelReason: r.status === "cancelled" ? customerSafeCancelReason(r.cancelReason ?? null) : null,
      rebroadcastedToId: extra.rebroadcastedToId,
      rebroadcastOfId: r.rebroadcastOfId,
      codeIssuedAt: r.deliveryCodeRotatedAt?.toISOString() ?? null,
      offers: extra.offers,
    };
  }
}
