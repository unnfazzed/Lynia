import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PHONE_REVEAL_STATUSES, type RaiseSosRequest, SOS_POLICY } from "@lynia/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

export interface SosContacts {
  /** Local emergency number the app surfaces immediately (Zimbabwe 999). */
  emergencyNumber: string;
  /** Staffed Lynia safety line (env-configured), falling back to the emergency number. */
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

    // Best-effort escalation — ops always, and the counterparty so they know help was called on this
    // trip. A push failure can never fail the SOS the user just raised.
    if (SOS_POLICY.notifyOps) {
      void this.notifications.notifyOps({
        title: "SOS raised on a live trip",
        body: "A party pressed SOS on an active delivery — respond now.",
        data: { orderId, sosId: event.id, kind: "sos" },
      });
    }
    if (counterpartyId) {
      void this.notifications.notifyProfiles([counterpartyId], {
        title: "SOS on your delivery",
        body: "The other party raised an SOS on this trip. Stay safe — help has been notified.",
        data: { orderId, sosId: event.id, kind: "sos" },
      });
    }

    return {
      emergencyNumber: SOS_POLICY.emergencyNumber,
      safetyLine: process.env[SOS_POLICY.safetyLineEnv] ?? SOS_POLICY.emergencyNumber,
    };
  }
}
