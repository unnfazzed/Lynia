import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A-01 audit trail. Persists one row for a destructive console action so the intent is recorded
   * server-side and queryable — this is the write path behind every ConfirmModal (submitAdminAction).
   *
   * The plan's ideal is mutation + audit in ONE transaction where a real mutation endpoint exists
   * (e.g. the KYC decision in RiderService.adminSetKyc, or a future rider-suspend / order-cancel /
   * fare-adjust). Those state-machine mutations mostly need new schema and are deferred; when one
   * lands, wrap it and THIS create in a single `this.prisma.$transaction([...])` so the action and its
   * audit row commit atomically. Until then the audit row is written on its own and always persists.
   */
  async recordAuditAction(
    actor: string,
    input: { action: string; target: string; reasonCode?: string | null; note?: string | null },
  ): Promise<{ id: string }> {
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
