import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
