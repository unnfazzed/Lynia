import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES, type OrderStatus, TERMINAL_STATUSES } from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { auditData, deriveItems, ORDER_TIMELINE, routeOf, STATUS_STEP, STUCK_AFTER_MS } from "./admin.shared";

@Injectable()
export class AdminOrdersService {
  // The gateway is optional so unit tests can construct the service with just Prisma; in the app it's
  // provided via TrackingModule (AdminModule imports it) and used for best-effort post-commit WS pushes.
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway?: TrackingGateway,
  ) {}

  /** Order monitor for ops — filter by status to watch live orders, cancellations, etc. */
  async listOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        customerId: true,
        riderId: true,
        cancelledBy: true,
        cancelReason: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      proposedFare: o.proposedFare.toString(),
      agreedFare: o.agreedFare?.toString() ?? null,
      distanceKm: o.distanceKm,
      riderId: o.riderId,
      // Authoritative role of who cancelled — don't make the UI re-derive it from raw ids.
      cancelledByRole: o.cancelledBy === o.riderId ? "rider" : o.cancelledBy === o.customerId ? "customer" : null,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /**
   * Admin order cancel → terminal `cancelled`. Records `cancelledBy` = the acting admin's id and the
   * reason, appends an OrderEvent for the timeline, and writes the audit row — all in one transaction.
   * Rejects an order already in a terminal state (nothing to cancel). Reason required.
   */
  async cancelOrder(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, riderId: true, collectedAt: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (TERMINAL_STATUSES.includes(order.status)) {
        throw new ConflictException("Order is already in a terminal state");
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "cancelled",
          cancelledBy: actor,
          cancelReason: input.reason,
          cancelledAt: new Date(),
        },
      });
      // P2-3: decline any still-pending offers so they don't linger against a terminal order (riders
      // otherwise keep seeing a live "offer sent" on an order that's dead). Same transaction as the cancel.
      await tx.offer.updateMany({ where: { orderId, status: "pending" }, data: { status: "declined" } });
      await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.cancel", orderId, input.reason, input.note),
        select: { id: true },
      });
      return {
        id: orderId,
        status: "cancelled" as const,
        auditId: audit.id,
        // Carried out of the tx for the post-commit WS pushes below.
        riderId: order.riderId,
        collected: order.collectedAt != null,
      };
    });

    // P2-3 post-commit, best-effort: push the cancellation to everyone watching the order, and — if a
    // rider was assigned — `job:cancelled` so they leave the (now dead) job screen instead of being
    // stranded on it. `collected` drives their UI (post-pickup hand-back vs. straight back to the board).
    // A WS failure must never fail the already-committed cancel, so both are guarded no-ops without a gateway.
    this.gateway?.emitOrderStatus(orderId, "cancelled");
    if (result.riderId) this.gateway?.emitJobCancelled(orderId, result.collected);
    return { id: result.id, status: result.status, auditId: result.auditId };
  }

  /**
   * Admin fare adjustment → overwrites `agreedFare` (a manual correction / dispute resolution). The new
   * fare, the reason and the audit row commit in one transaction. Reason required. 404s when not found.
   */
  async adjustFare(actor: string, orderId: string, input: { agreedFare: number; reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, agreedFare: true } });
      if (!order) throw new NotFoundException("Order not found");
      // Only correct a fare that was actually agreed. Writing agreedFare onto an order that never had
      // one (open_for_offers / requested / expired, or a pre-assignment cancel) would mint a
      // non-null agreed fare on an order that was never agreed — integrity drift in the monitor.
      // (Under the prepaid per-ride model there is no settled billing period to lock against — the old
      // "settlement already paid" guard was removed with the weekly cash-settlement engine.)
      if (order.agreedFare == null) {
        throw new ConflictException("Order has no agreed fare to adjust");
      }
      await tx.order.update({ where: { id: orderId }, data: { agreedFare: input.agreedFare } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.fare_adjust", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, agreedFare: input.agreedFare.toFixed(2), auditId: audit.id };
    });
  }

  /**
   * Order detail (admin monitor drill-in). Builds the 8-step delivery timeline from OrderEvent
   * (done/now/stall), the parcel line-items, proposed/agreed fares as strings, and the masked people.
   *
   * A-03: the customer's and rider's full phone is revealed to the console ONLY while this order is a
   * LIVE ride (ACTIVE_RIDE_STATUSES) — NOT PHONE_REVEAL_STATUSES, which also includes the terminal
   * delivered/completed/undelivered states and would leave every finished order unmasked forever (the
   * same distinction the rider services make in admin-riders.service.ts). The counterparty app path
   * (orders.service.getSnapshot) still uses PHONE_REVEAL_STATUSES because it's scoped to the two
   * parties of one order; the admin console is a third party and must not see closed-order PII.
   * Otherwise both are masked. Returns null when not found.
   */
  async getOrderDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        items: true,
        cancelledBy: true,
        cancelReason: true,
        customerId: true,
        riderId: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { firstName: true, lastName: true, phone: true } },
        rider: { select: { bikeReg: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
        events: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return null;

    const revealed = ACTIVE_RIDE_STATUSES.includes(order.status);
    const now = Date.now();

    // First event timestamp per step, so a "done" step carries the real time it was reached.
    const tsForStep = (idx: number): string | undefined => {
      const statuses = ORDER_TIMELINE[idx]!.statuses;
      const ev = order.events.find((e) => statuses.includes(e.status));
      return ev ? ev.createdAt.toISOString() : undefined;
    };

    const current = STATUS_STEP[order.status] ?? -1;
    const lastEventAt = order.events.length ? order.events[order.events.length - 1]!.createdAt : order.createdAt;
    const active = ACTIVE_RIDE_STATUSES.includes(order.status);
    const stuck = active && now - lastEventAt.getTime() > STUCK_AFTER_MS;
    const stuckMins = Math.round((now - lastEventAt.getTime()) / 60000);

    const timeline = ORDER_TIMELINE.map((step, i) => {
      let state: "done" | "now" | "stall" | undefined;
      if (current === -1) state = i === 0 ? "done" : undefined; // off-path terminal: only the broadcast happened
      else if (i < current) state = "done";
      else if (i === current) state = stuck ? "stall" : "now";
      return {
        label: step.label,
        state,
        ts: state === "done" ? tsForStep(i) : state === "now" ? "now" : undefined,
        note: state === "stall" ? `No status update for ${stuckMins} min.` : undefined,
      };
    });

    const items = deriveItems(order.items, order.itemDesc);
    const riderName = order.rider
      ? `${order.rider.profile.firstName} ${order.rider.profile.lastName}`.trim()
      : null;

    return {
      id: order.id,
      route: routeOf(order.pickup, order.dropoff),
      status: order.status,
      stuck,
      stuckNote: stuck ? `No GPS/status update from the rider for ${stuckMins} minutes.` : undefined,
      rider: riderName,
      // Both phones masked unless this order is live in its reveal window — never leak PII on a
      // terminal/closed order. Provide the (masked) string either way so the UI shows the redaction.
      riderPhone: order.rider ? (revealed ? order.rider.profile.phone : maskPhone(order.rider.profile.phone)) : undefined,
      bike: order.rider?.bikeReg,
      customer: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      customerPhone: revealed ? order.customer.phone : maskPhone(order.customer.phone),
      proposed: order.proposedFare.toString(),
      agreed: order.agreedFare?.toString() ?? null,
      km: order.distanceKm ?? 0,
      items,
      timeline,
    };
  }
}
