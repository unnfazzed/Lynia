import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { RaiseIssueRequest, ResolveIssueRequest } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { IssuesService } from "./issues.service";

const noNotifications = {
  notifyOps: vi.fn(async () => {}),
  notifyIssueResolved: vi.fn(async () => {}),
} as unknown as NotificationsService;
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
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 1 }),
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
        findUnique: async () => ({ id: "iss-1", status: "investigating", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 1 }),
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
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 1 }),
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

  it("rejects re-resolving an already-resolved issue (CAS: updateMany matches 0 rows)", async () => {
    // The guarded updateMany (where status != resolved) matches 0 rows for an already-resolved issue,
    // so the side-effect never runs and the loser gets the conflict.
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "resolved", orderId: "ord-1" }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    await expect(txSvc(tx).resolve("admin-1", "iss-1", { resolution: "close_no_action" })).rejects.toBeInstanceOf(ConflictException);
  });
});

// Regression guard (UX-2026-07-15): before this, resolve() wrote the resolution + side-effect + audit
// row but never told the opener — a customer/rider who raised "get help with this trip" had no push, no
// feed row, and no status endpoint, so a real problem could silently vanish from their view forever.
describe("IssuesService.resolve — notifies the opener post-commit", () => {
  function txSvcWithNotify(tx: Record<string, unknown>, notifications: NotificationsService) {
    const prisma = { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
    return new IssuesService(prisma, notifications);
  }

  const baseTx = {
    order: { findUnique: async () => ({ riderId: "rider-1" }) },
    refund: { create: vi.fn(async () => ({})) },
    rider: { update: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };

  it("notifies the opener (not the admin) with the order id and resolution, for each resolution kind", async () => {
    for (const body of [
      { resolution: "refund" as const, refundAmount: 5 },
      { resolution: "rider_strike" as const },
      { resolution: "close_no_action" as const },
    ]) {
      const notifyIssueResolved = vi.fn(async () => {});
      const notifications = { notifyOps: vi.fn(async () => {}), notifyIssueResolved } as unknown as NotificationsService;
      const tx = {
        ...baseTx,
        issue: {
          findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1", openedByProfileId: "cust-1" }),
          updateMany: async () => ({ count: 1 }),
        },
      };
      await txSvcWithNotify(tx, notifications).resolve("admin-1", "iss-1", body);
      await flush();
      expect(notifyIssueResolved).toHaveBeenCalledWith("cust-1", "ord-1", body.resolution);
    }
  });

  it("notifies the RIDER opener when a rider raised the issue, not the customer", async () => {
    const notifyIssueResolved = vi.fn(async () => {});
    const notifications = { notifyOps: vi.fn(async () => {}), notifyIssueResolved } as unknown as NotificationsService;
    const tx = {
      ...baseTx,
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1", openedByProfileId: "rider-1" }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    await txSvcWithNotify(tx, notifications).resolve("admin-1", "iss-1", { resolution: "close_no_action" });
    await flush();
    expect(notifyIssueResolved).toHaveBeenCalledWith("rider-1", "ord-1", "close_no_action");
  });

  it("does not notify when the CAS conflict throws before commit (nothing to tell the opener)", async () => {
    const notifyIssueResolved = vi.fn(async () => {});
    const notifications = { notifyOps: vi.fn(async () => {}), notifyIssueResolved } as unknown as NotificationsService;
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "resolved", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    await expect(txSvcWithNotify(tx, notifications).resolve("admin-1", "iss-1", { resolution: "close_no_action" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(notifyIssueResolved).not.toHaveBeenCalled();
  });
});

describe("IssuesService.detailForAdmin — dispute phone reveal (wider than party-to-party)", () => {
  function detailSvc(orderStatus: string) {
    const prisma = {
      issue: {
        findUnique: async () => ({
          id: "iss-1",
          type: "not_delivered",
          orderId: "ord-1",
          openedByProfileId: "cust-1",
          openedByRole: "customer",
          status: "open",
          description: "Parcel never arrived.",
          resolution: null,
          resolutionNote: null,
          createdAt: new Date("2026-07-01T00:00:00Z"),
        }),
        findMany: async () => [],
      },
      order: {
        findUnique: async () => ({
          id: "ord-1",
          status: orderStatus,
          pickup: { point: { lat: -17.8, lng: 31 }, landmark: "Eastgate" },
          dropoff: { point: { lat: -17.9, lng: 31.1 }, landmark: "Avenues" },
          proposedFare: { toString: () => "5.00" },
          agreedFare: { toString: () => "5.00" },
          itemPhotoUrl: null,
          customer: { firstName: "Chipo", lastName: "M", phone: "+263771111111" },
          rider: { profile: { firstName: "Tafara", lastName: "N", phone: "+263782000000" } },
        }),
      },
      profile: { findMany: async () => [] },
    };
    return new IssuesService(prisma as unknown as PrismaService, noNotifications);
  }

  it("reveals both parties' phones on a COMPLETED-order dispute — ops must call to resolve (F-09 carve-out)", async () => {
    // The party-to-party window (PHONE_REVEAL_STATUSES) closes at `completed`, but the ops dispute
    // console keeps the numbers via DISPUTE_PHONE_REVEAL_STATUSES so a completed-order dispute is
    // actionable. AdminGuard-gated route.
    const detail = await detailSvc("completed").detailForAdmin("iss-1");
    expect(detail?.riderPhone).toBe("+263782000000");
    expect(detail?.customerPhone).toBe("+263771111111");
  });

  it("masks both parties' phones on an EXPIRED order (no live/closed trip to reveal for)", async () => {
    const detail = await detailSvc("expired").detailForAdmin("iss-1");
    expect(detail?.riderPhone).not.toBe("+263782000000");
    expect(detail?.customerPhone).not.toBe("+263771111111");
  });
});
