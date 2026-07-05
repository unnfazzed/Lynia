import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ReportUserRequest } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface ReportResult {
  id: string;
  /** True when the report also created (or re-affirmed) a block against the counterparty. */
  blocked: boolean;
}

/**
 * Report-a-user after a trip (both roles). The subject is ALWAYS derived from the order's two parties —
 * a caller can only report the counterparty on an order they were actually on, never an arbitrary
 * profile id. When `block:true` the same call also upserts a Block, so the pair never re-matches
 * (enforced in matching.selectOffer via {@link blockedPairWhere}). The report + block are written in one
 * transaction so a "report and block" is atomic.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(orderId: string, body: ReportUserRequest, callerId: string): Promise<ReportResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, riderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    // Derive the reporter's role + the subject (the counterparty) from the order. Only a party on the
    // order may report, and only the other party.
    let reporterRole: "customer" | "rider";
    let subjectRole: "customer" | "rider";
    let subjectProfileId: string | null;
    if (callerId === order.customerId) {
      reporterRole = "customer";
      subjectRole = "rider";
      subjectProfileId = order.riderId;
    } else if (order.riderId && callerId === order.riderId) {
      reporterRole = "rider";
      subjectRole = "customer";
      subjectProfileId = order.customerId;
    } else {
      throw new ForbiddenException("You weren't on this order");
    }
    if (!subjectProfileId) throw new BadRequestException("There's no counterparty on this order to report yet");

    const subject = subjectProfileId;
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          orderId,
          reporterProfileId: callerId,
          reporterRole,
          subjectProfileId: subject,
          subjectRole,
          reason: body.reason,
          note: body.note ?? null,
        },
        select: { id: true },
      });

      let blocked = false;
      if (body.block) {
        // Idempotent on the (blocker, blocked) unique: re-reporting + re-blocking the same person is a
        // no-op update, never a duplicate-key error.
        await tx.block.upsert({
          where: { blockerProfileId_blockedProfileId: { blockerProfileId: callerId, blockedProfileId: subject } },
          create: { blockerProfileId: callerId, blockedProfileId: subject },
          update: {},
        });
        blocked = true;
      }

      return { id: report.id, blocked };
    });
  }
}
