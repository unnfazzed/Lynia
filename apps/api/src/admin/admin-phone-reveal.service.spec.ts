import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { RESERVED_AUDIT_ACTIONS } from "./admin-audit.service";
import { AdminPhoneRevealService, PHONE_REVEAL_AUDIT_ACTION } from "./admin-phone-reveal.service";

const PERSON = "11111111-1111-4111-8111-111111111111";

function build(phone: string | null = "+263771234567") {
  const prisma = {
    profile: { findUnique: vi.fn(async () => (phone === null ? null : { phone })) },
    auditLog: { create: vi.fn(async () => ({ id: "a1" })) },
  };
  return { svc: new AdminPhoneRevealService(prisma as unknown as PrismaService), prisma };
}

describe("AdminPhoneRevealService", () => {
  it("returns the full number to any admin operator and audits who looked", async () => {
    const { svc, prisma } = build();
    await expect(svc.reveal("ops@example.com", PERSON)).resolves.toEqual({ phone: "+263771234567" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { actor: "ops@example.com", action: PHONE_REVEAL_AUDIT_ACTION, target: PERSON, reasonCode: null, note: null },
    });
  });

  it("404s an unknown person without an audit row", async () => {
    const { svc, prisma } = build(null);
    await expect(svc.reveal("ops@example.com", PERSON)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses a business booking account, which holds no number", async () => {
    const { svc, prisma } = build("business:22222222-2222-4222-8222-222222222222");
    await expect(svc.reveal("ops@example.com", PERSON)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("reserves its audit action so the free-text audit path can't forge a reveal", () => {
    expect(RESERVED_AUDIT_ACTIONS.has(PHONE_REVEAL_AUDIT_ACTION)).toBe(true);
  });
});
