import { BadRequestException } from "@nestjs/common";
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
    // A genuinely free-text action (no dedicated domain endpoint owns it) still records unaffected.
    const res = await svc.recordAuditAction("admin-42", {
      action: "order.nudge_rider",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
    expect(res).toEqual({ id: "audit-1" });
    expect(created).toEqual({
      actor: "admin-42",
      action: "order.nudge_rider",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
  });

  // DS16-01: the generic free-text path must reject any action string that a dedicated domain-mutation
  // endpoint owns (which writes its own audit row transactionally), so an admin can't forge an
  // account-status feed row ("rider.ban" → "Account blocked") or pollute the compliance trail with an
  // entry indistinguishable from a real mutation's.
  it("rejects a reserved domain-mutation action without writing a row", async () => {
    let createCalls = 0;
    const prisma = {
      auditLog: { create: async () => { createCalls++; return { id: "should-not-happen" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    for (const action of ["rider.ban", "rider.kyc_approve", "wallet.credit", "order.cancel"]) {
      await expect(svc.recordAuditAction("admin-42", { action, target: "victim-profile-id" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(createCalls).toBe(0);
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
