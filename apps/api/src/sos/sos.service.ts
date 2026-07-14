import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PHONE_REVEAL_STATUSES, type RaiseSosRequest, SOS_POLICY } from "@lynia/shared";
import { auditData } from "../admin/admin.shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

export interface SosContacts {
  /** Local emergency number the app surfaces immediately (Zimbabwe 999). */
  emergencyNumber: string;
  /** Staffed Lynia safety line — the SOS_POLICY constant, overridable per deploy via `SOS_SAFETY_LINE`. */
  safetyLine: string;
}

/**
 * SOS on a live trip (R-16/F-13). Either party on an active/reveal-window order raises it: the event is
 * logged, ops + the counterparty are pushed (SOS_POLICY.notifyOps), and the app is handed the emergency
 * contacts to surface. Allowed only while the order is live (PHONE_REVEAL_STATUSES) — an SOS on a
 * long-closed order is meaningless and is rejected.
 */
@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async raise(orderId: string, body: RaiseSosRequest, callerId: string): Promise<SosContacts> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, customerId: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    let raisedByRole: "customer" | "rider";
    let counterpartyId: string | null;
    if (callerId === order.customerId) {
      raisedByRole = "customer";
      counterpartyId = order.riderId;
    } else if (order.riderId && callerId === order.riderId) {
      raisedByRole = "rider";
      counterpartyId = order.customerId;
    } else {
      throw new ForbiddenException("You aren't on this order");
    }

    if (!PHONE_REVEAL_STATUSES.includes(order.status)) {
      throw new ConflictException("SOS is only available on a live trip");
    }

    // Log the event, but NEVER let a transient DB failure withhold the emergency contacts — the whole
    // point of SOS is to hand back the static safety numbers, which need no DB. A create failure (a
    // connection blip during exactly the kind of incident SOS is for) is caught and logged; the caller
    // still gets 999 + the safety line. sosId is null when the audit write didn't land.
    let sosId: string | null = null;
    try {
      const event = await this.prisma.sosEvent.create({
        data: {
          orderId,
          raisedByProfileId: callerId,
          raisedByRole,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
        },
        select: { id: true },
      });
      sosId = event.id;
    } catch (err) {
      this.logger.error(`SOS event log failed for order ${orderId}: ${(err as Error).message}`);
    }

    // Best-effort escalation — ops always, and the counterparty so they know help was called on this
    // trip. A push failure can never fail the SOS the user just raised.
    if (SOS_POLICY.notifyOps) {
      void this.notifications.notifyOps({
        title: "SOS raised on a live trip",
        body: "A party pressed SOS on an active delivery — respond now.",
        data: { orderId, kind: "sos", ...(sosId ? { sosId } : {}) },
      });
    }
    if (counterpartyId) {
      // Fix 3: stamp the RECIPIENT's per-order role so the client routes this to /order/:id vs the
      // rider job screen by the order relationship, not the account's global session role. The recipient
      // is the counterparty of the raiser: a customer's SOS pushes the RIDER, a rider's SOS pushes the
      // CUSTOMER. Additive on the wire — older clients ignore `to` and fall back to the session role.
      const recipientRole = raisedByRole === "customer" ? "rider" : "customer";
      void this.notifications.notifyProfiles([counterpartyId], {
        title: "SOS on your delivery",
        body: "The other party raised an SOS on this trip. Stay safe — LyniaGo's safety team has been alerted.",
        data: { orderId, kind: "sos", to: recipientRole, ...(sosId ? { sosId } : {}) },
      });
    }

    return {
      emergencyNumber: SOS_POLICY.emergencyNumber,
      safetyLine: process.env[SOS_POLICY.safetyLineEnv] ?? SOS_POLICY.safetyLine,
    };
  }

  /**
   * DS13-05: recent SOS events for the ops console — pending (unacknowledged) ones always sort first,
   * newest-first within each group. Read-only durable surface so SOS is no longer write-only — ops can
   * see raised events independently of push delivery (the escalation push may have fanned out to zero
   * registered admin devices). Admin-guarded at the controller (GET /admin/sos). `limit` is clamped to
   * [1, 200] (default 50) so a caller can't pull the whole table.
   *
   * Pending-first matters: a plain newest-first sort lets a still-open SOS scroll out of the visible
   * window once enough newer (possibly already-acknowledged) events accumulate — undermining the exact
   * "nothing vanishes" guarantee this surface exists to deliver. Sorting on `acknowledgedAt` (null =
   * pending, sorted first) keeps every open alert above the fold regardless of what's happened since.
   *
   * `acknowledgedAt` (DS13-05) is the ISO timestamp an operator acknowledged the alert, or null while
   * it's still pending — so the console can show pending vs handled at a glance.
   */
  async listRecent(limit = 50): Promise<
    Array<{
      id: string;
      orderId: string;
      raisedByProfileId: string;
      raisedByRole: string;
      lat: number | null;
      lng: number | null;
      acknowledgedAt: string | null;
      createdAt: string;
    }>
  > {
    const take = Math.min(Math.max(1, Math.floor(limit)), 200);
    const rows = await this.prisma.sosEvent.findMany({
      orderBy: [{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        orderId: true,
        raisedByProfileId: true,
        raisedByRole: true,
        lat: true,
        lng: true,
        acknowledgedAt: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * DS13-05: an operator acknowledges an SOS from the ops console — the write that turns the read-only
   * SOS feed into something actionable ("someone is handling this"). Idempotent and CAS-guarded: the
   * update only fires against a still-pending row (`acknowledgedAt: null`), so two operators clicking at
   * once can't both "win" and double-write. When it transitions null→now we record an AuditLog row in
   * the SAME transaction as the update (mirrors the A-04 admin mutations) — attributed to the real
   * operator (`actor`). A repeat ack on an already-acknowledged row is a harmless no-op: no throw, no
   * duplicate audit row. A missing row 404s. AdminGuard is applied at the controller.
   */
  async acknowledge(sosId: string, actor: string): Promise<{ id: string; acknowledgedAt: string }> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // CAS on `acknowledgedAt: null` — 0 rows means the row is either missing OR already acknowledged.
      const changed = await tx.sosEvent.updateMany({
        where: { id: sosId, acknowledgedAt: null },
        data: { acknowledgedAt: now },
      });
      if (changed.count === 0) {
        const existing = await tx.sosEvent.findUnique({ where: { id: sosId }, select: { acknowledgedAt: true } });
        if (!existing) throw new NotFoundException("SOS event not found");
        // Already acknowledged — re-acking is harmless, so treat it as a no-op success WITHOUT writing a
        // second audit row (the null→now transition is the only thing worth recording).
        return { id: sosId, acknowledgedAt: existing.acknowledgedAt!.toISOString() };
      }
      // Only on the real null→now transition: persist the audit row atomically with the acknowledgement.
      await tx.auditLog.create({ data: auditData(actor, "sos.acknowledge", sosId) });
      return { id: sosId, acknowledgedAt: now.toISOString() };
    });
  }
}
