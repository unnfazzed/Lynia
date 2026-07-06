import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAuditService } from "./admin-audit.service";

describe("AdminAuditService.recordAuditAction (A-01)", () => {
  it("persists an audit row with actor + action fields and returns the id", async () => {
    let created: unknown;
    const prisma = {
      auditLog: {
        create: async (args: { data: unknown }) => {
          created = args.data;
          return { id: "audit-1" };
        },
      },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    const res = await svc.recordAuditAction("admin-42", {
      action: "rider.suspend",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
    expect(res).toEqual({ id: "audit-1" });
    expect(created).toEqual({
      actor: "admin-42",
      action: "rider.suspend",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
  });

  it("coerces missing reasonCode/note to null (nullable columns)", async () => {
    let created: { reasonCode?: unknown; note?: unknown } = {};
    const prisma = {
      auditLog: { create: async (args: { data: typeof created }) => { created = args.data; return { id: "a2" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    await svc.recordAuditAction("admin-1", { action: "order.nudge_rider", target: "o1" });
    expect(created.reasonCode).toBeNull();
    expect(created.note).toBeNull();
  });
});
