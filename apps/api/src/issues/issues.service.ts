import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ISSUE_TYPE_LABELS,
  type IssueStatus,
  PHONE_REVEAL_STATUSES,
  type RaiseIssueRequest,
  type ResolveIssueRequest,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const ISSUE_STATUSES = ["open", "investigating", "resolved"] as const;
type IssueStatusFilter = (typeof ISSUE_STATUSES)[number];

/** Landmark out of a stored Waypoint JSON — the human label, never the point or contactPhone. */
function landmark(w: unknown): string {
  const o = (w ?? {}) as { landmark?: unknown };
  return typeof o.landmark === "string" && o.landmark.trim() ? o.landmark : "—";
}
function routeOf(pickup: unknown, dropoff: unknown): string {
  return `${landmark(pickup)} → ${landmark(dropoff)}`;
}
function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}`.trim() : "—";
}

/**
 * Trip-issues (A-05, "get help with this trip"). Either party opens an issue on an order they were on;
 * ops triages the queue and resolves each one — a resolution carries a real side-effect (a customer
 * refund netted off the rider's settlement, a rider strike, or a no-op close) written together with the
 * issue update AND an audit row in ONE transaction, so the console action and its consequence + record
 * can never drift apart.
 */
@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Either party raises an issue on an order they're on. Opener + role + counterparty are derived from
   *  the order server-side; a caller who isn't the order's customer or rider is rejected. */
  async raise(orderId: string, body: RaiseIssueRequest, callerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    let openedByRole: "customer" | "rider";
    if (callerId === order.customerId) openedByRole = "customer";
    else if (order.riderId && callerId === order.riderId) openedByRole = "rider";
    else throw new ForbiddenException("You weren't on this order");

    const issue = await this.prisma.issue.create({
      data: {
        orderId,
        openedByProfileId: callerId,
        openedByRole,
        type: body.type,
        description: body.description,
        // status defaults to `open`.
      },
      select: { id: true, status: true, type: true, createdAt: true },
    });

    // Best-effort escalation to ops — a push failure can't fail the issue the customer/rider just raised.
    void this.notifications.notifyOps({
      title: "New trip issue",
      body: `${ISSUE_TYPE_LABELS[body.type]} reported on a trip — open the disputes queue.`,
      data: { issueId: issue.id, orderId, kind: "issue" },
    });

    return { id: issue.id, status: issue.status, type: issue.type, createdAt: issue.createdAt.toISOString() };
  }

  /** Ops disputes queue: newest first, optionally filtered by status. Returns the console's IssueRow shape. */
  async listForAdmin(statusFilter?: string) {
    const filter = ISSUE_STATUSES.includes(statusFilter as IssueStatusFilter)
      ? (statusFilter as IssueStatus)
      : undefined;
    const issues = await this.prisma.issue.findMany({
      where: filter ? { status: filter } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, type: true, orderId: true, openedByProfileId: true, status: true, createdAt: true },
    });

    // Batch the opener names + order routes so the queue is not N+1.
    const openerIds = [...new Set(issues.map((i) => i.openedByProfileId))];
    const orderIds = [...new Set(issues.map((i) => i.orderId))];
    const [openers, orders] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: openerIds } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, pickup: true, dropoff: true } }),
    ]);
    const nameById = new Map(openers.map((p) => [p.id, fullName(p)]));
    const routeById = new Map(orders.map((o) => [o.id, routeOf(o.pickup, o.dropoff)]));

    return issues.map((i) => ({
      id: i.id,
      type: ISSUE_TYPE_LABELS[i.type],
      order: routeById.get(i.orderId) ?? i.orderId,
      openedBy: nameById.get(i.openedByProfileId) ?? "—",
      opened: i.createdAt.toISOString(),
      status: i.status,
    }));
  }

  /** Issue detail: the order evidence (route, fares, OTP-not-entered callout), the opener's statement,
   *  and masked phones — revealed only inside the order's reveal window, the same rule as everywhere. */
  async detailForAdmin(id: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        orderId: true,
        openedByProfileId: true,
        openedByRole: true,
        status: true,
        description: true,
        resolution: true,
        resolutionNote: true,
        createdAt: true,
      },
    });
    if (!issue) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: issue.orderId },
      select: {
        id: true,
        status: true,
        pickup: true,
        dropoff: true,
        proposedFare: true,
        agreedFare: true,
        itemPhotoUrl: true,
        customer: { select: { firstName: true, lastName: true, phone: true } },
        rider: { select: { profile: { select: { firstName: true, lastName: true, phone: true } } } },
      },
    });

    const revealed = order ? PHONE_REVEAL_STATUSES.includes(order.status) : false;
    const riderName = fullName(order?.rider?.profile);
    const customerName = fullName(order?.customer);
    const openerName = issue.openedByRole === "rider" ? riderName : customerName;
    // The delivery OTP was entered only on a delivered/completed order; otherwise the code was never
    // entered — the evidence callout the console renders for a "not delivered" dispute.
    const codeNotEntered = order ? !["delivered", "completed"].includes(order.status) : true;

    return {
      id: issue.id,
      type: ISSUE_TYPE_LABELS[issue.type],
      order: order ? routeOf(order.pickup, order.dropoff) : issue.orderId,
      openedBy: openerName,
      opened: issue.createdAt.toISOString(),
      status: issue.status,
      route: order ? routeOf(order.pickup, order.dropoff) : "—",
      fare: (order?.agreedFare ?? order?.proposedFare)?.toString() ?? "0",
      rider: riderName,
      customer: customerName,
      // Revealed inside PHONE_REVEAL_STATUSES (which includes the post-trip delivered/completed/
      // undelivered states a dispute is usually raised in), masked otherwise — same rule as
      // orders.service/admin. So for the common completed-order dispute ops CAN see the numbers to
      // call the parties (AdminGuard-gated); this is intended, not a leak.
      riderPhone: order?.rider ? (revealed ? order.rider.profile.phone : maskPhone(order.rider.profile.phone)) : undefined,
      customerPhone: order ? (revealed ? order.customer.phone : maskPhone(order.customer.phone)) : undefined,
      facts: issue.description,
      codeNotEntered,
      photos: order?.itemPhotoUrl ? 1 : undefined,
      statements: [{ who: openerName, text: issue.description }],
      resolution: issue.resolution ?? undefined,
      resolutionNote: issue.resolutionNote ?? undefined,
    };
  }

  /**
   * Ops resolves an issue. In ONE transaction: mark the issue resolved (+ resolution, note, resolver,
   * timestamp), apply the resolution side-effect, and write the audit row — so the state change, its
   * consequence, and the record commit atomically or not at all.
   *   refund         → a Refund row (orderId, riderId, amount) as a durable ledger of what the rider
   *                    owes. Ops repay the customer out-of-band today; automatic netting off the rider's
   *                    settlement is deferred until the commission/settlement infra ships (A-06), which
   *                    will consume these rows. Nothing reads Refund yet — intentional, not a dead write.
   *   rider_strike   → increment the rider's cancelStrikes toward RIDER_STRIKE_LIMIT (inline tx.rider.update).
   *   close_no_action→ no side-effect.
   */
  async resolve(adminId: string, id: string, body: ResolveIssueRequest) {
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.issue.findUnique({
        where: { id },
        select: { id: true, status: true, orderId: true },
      });
      if (!issue) throw new NotFoundException("Issue not found");

      // Guarded transition (CAS): flip to resolved ONLY from a not-yet-resolved row, so two
      // concurrent resolves (double-click, retry, two ops on the queue) can't both pass a
      // check-then-act guard and each run the side-effect (double refund / double strike). Only the
      // writer that actually flipped the row (count===1) proceeds; the loser gets the conflict.
      const resolvedAt = new Date();
      const claimed = await tx.issue.updateMany({
        where: { id, status: { not: "resolved" } },
        data: {
          status: "resolved",
          resolution: body.resolution,
          resolutionNote: body.note ?? null,
          resolvedByAdminId: adminId,
          resolvedAt,
        },
      });
      if (claimed.count === 0) throw new ConflictException("This issue is already resolved");

      if (body.resolution === "refund") {
        // A refund is owed to the customer and (once settlement billing is live) netted off the rider's
        // settlement — so the row needs the order's rider. refundAmount is contract-guaranteed for a refund.
        const order = await tx.order.findUnique({
          where: { id: issue.orderId },
          select: { riderId: true, agreedFare: true, proposedFare: true },
        });
        if (!order?.riderId) throw new BadRequestException("Can't refund an order with no assigned rider");
        // A refund can never exceed what was charged for the trip — bound it by the agreed fare (or the
        // proposed fare if the order never reached an agreed price), so ops can't record a Refund larger
        // than the amount ever paid, which A-06 settlement netting would later debit off the rider.
        const fareCap = Number(order.agreedFare ?? order.proposedFare);
        if (body.refundAmount! > fareCap) {
          throw new BadRequestException(`Refund can't exceed the order fare (${fareCap.toFixed(2)})`);
        }
        await tx.refund.create({
          data: { orderId: issue.orderId, riderId: order.riderId, amount: body.refundAmount!, reason: body.note ?? null },
        });
      } else if (body.resolution === "rider_strike") {
        const order = await tx.order.findUnique({ where: { id: issue.orderId }, select: { riderId: true } });
        if (!order?.riderId) throw new BadRequestException("Can't strike an order with no assigned rider");
        // Inline strike increment (do NOT import RiderService) toward RIDER_STRIKE_LIMIT (auto-cooldown
        // at the limit is owned by the rider lifecycle, not this write).
        await tx.rider.update({ where: { profileId: order.riderId }, data: { cancelStrikes: { increment: 1 } } });
      }

      // Audit row in the SAME transaction — the action and its record are never one without the other.
      await tx.auditLog.create({
        data: { actor: adminId, action: "issue.resolve", target: id, reasonCode: body.resolution, note: body.note ?? null },
      });

      return {
        id,
        status: "resolved" as const,
        resolution: body.resolution,
        resolvedAt: resolvedAt.toISOString(),
      };
    });
  }
}
