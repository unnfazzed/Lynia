import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { RESERVED_AUDIT_ACTIONS } from "./admin-audit.service";
import { AdminPhoneRevealService, parseRevealOperators, PHONE_REVEAL_AUDIT_ACTION } from "./admin-phone-reveal.service";

const PERSON = "11111111-1111-4111-8111-111111111111";

function build(operators: string, phone: string | null = "+263771234567") {
  const prisma = {
    profile: { findUnique: vi.fn(async () => (phone === null ? null : { phone })) },
    auditLog: { create: vi.fn(async () => ({ id: "a1" })) },
  };
  const svc = new AdminPhoneRevealService(prisma as unknown as PrismaService, { ADMIN_PHONE_REVEAL_OPERATORS: operators } as Env);
  return { svc, prisma };
}

describe("parseRevealOperators", () => {
  it("lower-cases, trims and drops blanks", () => {
    expect([...parseRevealOperators(" Owner@Example.com , ,b@x.co ")]).toEqual(["owner@example.com", "b@x.co"]);
  });
  it("is empty when unset or blank", () => {
    expect(parseRevealOperators(undefined).size).toBe(0);
    expect(parseRevealOperators(" , ").size).toBe(0);
  });
});

describe("AdminPhoneRevealService", () => {
  it("fails closed: nobody may reveal when the list is unset", async () => {
    const { svc, prisma } = build("");
    expect(svc.canReveal("owner@example.com")).toBe(false);
    await expect(svc.reveal("owner@example.com", PERSON)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an operator who isn't on the list, and the shared token's own subject", async () => {
    const { svc, prisma } = build("owner@example.com");
    await expect(svc.reveal("ops@example.com", PERSON)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.reveal("99999999-9999-4999-8999-999999999999", PERSON)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns the full number to a listed operator (any case) and audits it", async () => {
    const { svc, prisma } = build("owner@example.com");
    expect(svc.canReveal("Owner@Example.com")).toBe(true);
    await expect(svc.reveal("Owner@Example.com", PERSON)).resolves.toEqual({ phone: "+263771234567" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { actor: "Owner@Example.com", action: PHONE_REVEAL_AUDIT_ACTION, target: PERSON, reasonCode: null, note: null },
    });
  });

  it("404s an unknown person without an audit row", async () => {
    const { svc, prisma } = build("owner@example.com", null);
    await expect(svc.reveal("owner@example.com", PERSON)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses a business booking account, which holds no number", async () => {
    const { svc } = build("owner@example.com", "business:22222222-2222-4222-8222-222222222222");
    await expect(svc.reveal("owner@example.com", PERSON)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reserves its audit action so the free-text audit path can't forge a reveal", () => {
    expect(RESERVED_AUDIT_ACTIONS.has(PHONE_REVEAL_AUDIT_ACTION)).toBe(true);
  });
});
