import { ForbiddenException } from "@nestjs/common";
import type { ReportUserRequest } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";

const order = { id: "ord-1", customerId: "cust-1", riderId: "rider-1" };

/** Prisma fake: order.findUnique for the derive step, and a $transaction that runs against `tx`. */
function svc(tx: Record<string, unknown>, ord: unknown = order) {
  const prisma = {
    order: { findUnique: async () => ord },
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return new ReportsService(prisma);
}

const reportBody: ReportUserRequest = { orderId: "ord-1", reason: "rude" };

describe("ReportsService.report", () => {
  it("rejects a caller who wasn't on the order", async () => {
    const tx = { report: { create: vi.fn() }, block: { upsert: vi.fn() } };
    await expect(svc(tx).report("ord-1", reportBody, "stranger")).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.report.create).not.toHaveBeenCalled();
  });

  it("creates a Report deriving the subject (counterparty) from the order — no block by default", async () => {
    let createArgs: { data: Record<string, unknown> } | undefined;
    const upsert = vi.fn(async () => ({}));
    const tx = {
      report: {
        create: async (args: { data: Record<string, unknown> }) => {
          createArgs = args;
          return { id: "rep-1" };
        },
      },
      block: { upsert },
    };
    // Customer reports the rider.
    const res = await svc(tx).report("ord-1", { ...reportBody, note: "hostile" }, "cust-1");

    expect(createArgs!.data).toMatchObject({
      orderId: "ord-1",
      reporterProfileId: "cust-1",
      reporterRole: "customer",
      subjectProfileId: "rider-1",
      subjectRole: "rider",
      reason: "rude",
      note: "hostile",
    });
    expect(res).toEqual({ id: "rep-1", blocked: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("also upserts a Block (idempotent on the unique) when block:true", async () => {
    const upsert = vi.fn(async () => ({}));
    const tx = { report: { create: async () => ({ id: "rep-1" }) }, block: { upsert } };
    // Rider reports the customer, with a block.
    const res = await svc(tx).report("ord-1", { ...reportBody, block: true }, "rider-1");

    expect(res).toEqual({ id: "rep-1", blocked: true });
    expect(upsert).toHaveBeenCalledWith({
      where: { blockerProfileId_blockedProfileId: { blockerProfileId: "rider-1", blockedProfileId: "cust-1" } },
      create: { blockerProfileId: "rider-1", blockedProfileId: "cust-1" },
      update: {},
    });
  });
});
