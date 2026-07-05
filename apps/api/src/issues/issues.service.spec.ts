import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { RaiseIssueRequest, ResolveIssueRequest } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { IssuesService } from "./issues.service";

const noNotifications = { notifyOps: vi.fn(async () => {}) } as unknown as NotificationsService;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const raiseBody: RaiseIssueRequest = {
  orderId: "11111111-1111-1111-1111-111111111111",
  type: "not_delivered",
  description: "Parcel never arrived.",
};

describe("IssuesService.raise", () => {
  const order = { id: "ord-1", customerId: "cust-1", riderId: "rider-1" };

  it("rejects a caller who isn't the order's customer or rider", async () => {
    const prisma = { order: { findUnique: async () => order }, issue: { create: vi.fn() } };
    const svc = new IssuesService(prisma as unknown as PrismaService, noNotifications);
    await expect(svc.raise("ord-1", raiseBody, "stranger")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });

  it("creates an open issue attributing the opener + role from the order, and pushes ops", async () => {
    let createArgs: { data: Record<string, unknown> } | undefined;
    const prisma = {
      order: { findUnique: async () => order },
      issue: {
        create: async (args: { data: Record<string, unknown> }) => {
          createArgs = args;
          return { id: "iss-1", status: "open", type: "not_delivered", createdAt: new Date("2026-07-01T00:00:00Z") };
        },
      },
    };
    const notifications = { notifyOps: vi.fn(async () => {}) } as unknown as NotificationsService;
    const svc = new IssuesService(prisma as unknown as PrismaService, notifications);

    const res = await svc.raise("ord-1", raiseBody, "rider-1");
    await flush();

    expect(createArgs!.data).toMatchObject({
      orderId: "ord-1",
      openedByProfileId: "rider-1",
      openedByRole: "rider",
      type: "not_delivered",
      description: "Parcel never arrived.",
    });
    expect(res).toMatchObject({ id: "iss-1", status: "open", type: "not_delivered" });
    expect(notifications.notifyOps).toHaveBeenCalledTimes(1);
  });
});

/** A Prisma fake whose $transaction runs the callback against a per-test `tx` object. */
function txSvc(tx: Record<string, unknown>) {
  const prisma = { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  return new IssuesService(prisma, noNotifications);
}

describe("IssuesService.resolve — side-effect + audit in one transaction", () => {
  it("refund: creates a Refund (orderId, riderId, amount) AND the audit row, in the same tx", async () => {
    const refundCreate = vi.fn(async () => ({}));
    const auditCreate = vi.fn(async () => ({}));
    const riderUpdate = vi.fn(async () => ({}));
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1" }),
        update: async () => ({ id: "iss-1", status: "resolved", resolution: "refund", resolvedAt: new Date("2026-07-02T00:00:00Z") }),
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      refund: { create: refundCreate },
      rider: { update: riderUpdate },
      auditLog: { create: auditCreate },
    };
    const body: ResolveIssueRequest = { resolution: "refund", refundAmount: 5, note: "Never delivered" };

    const res = await txSvc(tx).resolve("admin-1", "iss-1", body);

    expect(refundCreate).toHaveBeenCalledWith({ data: { orderId: "ord-1", riderId: "rider-1", amount: 5, reason: "Never delivered" } });
    expect(riderUpdate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: { actor: "admin-1", action: "issue.resolve", target: "iss-1", reasonCode: "refund", note: "Never delivered" },
    });
    expect(res).toMatchObject({ id: "iss-1", status: "resolved", resolution: "refund" });
  });

  it("rider_strike: increments the rider's cancelStrikes AND writes the audit row, in the same tx", async () => {
    const riderUpdate = vi.fn(async () => ({}));
    const auditCreate = vi.fn(async () => ({}));
    const refundCreate = vi.fn(async () => ({}));
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "investigating", orderId: "ord-1" }),
        update: async () => ({ id: "iss-1", status: "resolved", resolution: "rider_strike", resolvedAt: new Date() }),
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      refund: { create: refundCreate },
      rider: { update: riderUpdate },
      auditLog: { create: auditCreate },
    };
    const body: ResolveIssueRequest = { resolution: "rider_strike", note: "Rude to sender" };

    await txSvc(tx).resolve("admin-1", "iss-1", body);

    expect(riderUpdate).toHaveBeenCalledWith({ where: { profileId: "rider-1" }, data: { cancelStrikes: { increment: 1 } } });
    expect(refundCreate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: { actor: "admin-1", action: "issue.resolve", target: "iss-1", reasonCode: "rider_strike", note: "Rude to sender" },
    });
  });

  it("close_no_action: writes only the audit row — no refund, no strike", async () => {
    const riderUpdate = vi.fn(async () => ({}));
    const refundCreate = vi.fn(async () => ({}));
    const auditCreate = vi.fn(async () => ({}));
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1" }),
        update: async () => ({ id: "iss-1", status: "resolved", resolution: "close_no_action", resolvedAt: new Date() }),
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      refund: { create: refundCreate },
      rider: { update: riderUpdate },
      auditLog: { create: auditCreate },
    };
    await txSvc(tx).resolve("admin-1", "iss-1", { resolution: "close_no_action" });
    expect(refundCreate).not.toHaveBeenCalled();
    expect(riderUpdate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects re-resolving an already-resolved issue", async () => {
    const tx = { issue: { findUnique: async () => ({ id: "iss-1", status: "resolved", orderId: "ord-1" }) } };
    await expect(txSvc(tx).resolve("admin-1", "iss-1", { resolution: "close_no_action" })).rejects.toBeInstanceOf(ConflictException);
  });
});
