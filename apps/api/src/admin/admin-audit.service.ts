import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * DS16-01: action strings owned by a dedicated domain-mutation endpoint that writes its mutation and
 * this audit row atomically in its OWN `$transaction` (rider suspend/lift/ban/clear_hold + KYC
 * approve/decline, customer hold/lift, order cancel/fare_adjust, issue resolve, sos acknowledge, wallet
 * credit). The generic free-text `/admin/audit-actions` fallback must NOT be able to record any of these:
 * six of them (the `ACCOUNT_FEED_COPY` set in notifications.service) are read back by the account-status
 * feed as if a real mutation happened, so a free-text write here could forge a "You're verified" /
 * "Account blocked" feed row — or fake "Account restored" for a still-banned rider — with no underlying
 * state change, and every one of them would pollute the compliance audit trail with an entry
 * indistinguishable from a real transactional one. Reject them at the write boundary (a clean 400).
 */
export const RESERVED_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  "rider.suspend",
  "rider.lift",
  "rider.ban",
  "rider.clear_hold",
  "rider.kyc_approve",
  "rider.kyc_decline",
  "customer.hold",
  "customer.lift",
  "order.cancel",
  "order.fare_adjust",
  "order.adjudicate_delivered",
  // UX17-02: written by notifyCustomersOfRiderStandingChange and read back by feedForUser (target=orderId)
  // as the customer-facing rider-standing feed fallback — so the free-text path must not be able to forge it.
  "order.rider_standing_notice",
  "issue.resolve",
  "sos.acknowledge",
  "wallet.credit",
]);

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A-01 audit trail. Persists one row for a destructive console action so the intent is recorded
   * server-side and queryable — this is the write path behind every ConfirmModal (submitAdminAction).
   *
   * Where a real mutation endpoint exists the audit row commits in that endpoint's OWN transaction
   * (rider suspend/lift/ban, order cancel/fare, issue resolve, and now the KYC decision) — mutation +
   * audit are one `$transaction`, never one without the other. This standalone path remains only for
   * actions that have no domain endpoint yet, and the console skips it (`auditInEndpoint`) for the ones
   * that do, so nothing is double-recorded.
   */
  async recordAuditAction(
    actor: string,
    input: { action: string; target: string; reasonCode?: string | null; note?: string | null },
  ): Promise<{ id: string }> {
    // DS16-01: a real domain-mutation endpoint owns this action string and writes its own audit row
    // transactionally — this generic path must not be able to forge one (account-status feed rows,
    // compliance trail) with no underlying mutation.
    if (RESERVED_AUDIT_ACTIONS.has(input.action)) {
      throw new BadRequestException("This action is managed by its own endpoint and cannot be recorded here.");
    }
    const row = await this.prisma.auditLog.create({
      data: {
        actor,
        action: input.action,
        target: input.target,
        reasonCode: input.reasonCode ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    return { id: row.id };
  }
}
