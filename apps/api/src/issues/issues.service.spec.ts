import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { RaiseIssueRequest, ResolveIssueRequest } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { IssuesService } from "./issues.service";

const noNotifications = {
  notifyOps: vi.fn(async () => {}),
  notifyIssueResolved: vi.fn(async () => {}),
} as unknown as NotificationsService;
// DS17-02: resolve() funnels a dispute-strike-limited (forced-offline) rider through the standing-demotion
// funnel post-commit. Each helper mints a fresh spy so per-test assertions don't bleed across tests.
function fakeGateway() {
  return { evictRiderFromSupply: vi.fn(async () => {}) } as unknown as TrackingGateway & {
    evictRiderFromSupply: ReturnType<typeof vi.fn>;
  };
}
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
    const svc = new IssuesService(prisma as unknown as PrismaService, noNotifications, fakeGateway());
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
    const svc = new IssuesService(prisma as unknown as PrismaService, notifications, fakeGateway());

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

  // BH-22: a client-side timeout can leave a POST that actually landed with no visible confirmation —
  // a naive retry with the same idempotencyKey must return the ORIGINAL issue, not open a second dispute
  // for the same complaint (which ops could then independently resolve with two refunds).
  it("BH-22: a retry with the same idempotency key returns the original issue, not a second one", async () => {
    const create = vi.fn();
    const existing = { id: "iss-1", status: "open", type: "not_delivered", createdAt: new Date("2026-07-01T00:00:00Z") };
    const prisma = {
      order: { findUnique: async () => order },
      issue: { findFirst: async () => existing, create },
    };
    const svc = new IssuesService(prisma as unknown as PrismaService, noNotifications, fakeGateway());

    const body: RaiseIssueRequest = { ...raiseBody, idempotencyKey: "key-1" };
    const res = await svc.raise("ord-1", body, "rider-1");

    expect(res).toMatchObject({ id: "iss-1", status: "open", type: "not_delivered" });
    expect(create).not.toHaveBeenCalled();
  });

  it("BH-22: a concurrent replay that races the pre-check (P2002) still returns the winner's issue, not a 500", async () => {
    const winner = { id: "iss-2", status: "open", type: "not_delivered", createdAt: new Date("2026-07-01T00:00:00Z") };
    let findFirstCalls = 0;
    const prisma = {
      order: { findUnique: async () => order },
      issue: {
        findFirst: async () => {
          findFirstCalls += 1;
          return findFirstCalls === 1 ? null : winner; // no existing row on the pre-check, then the racing winner
        },
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`opened_by_profile_id`,`idempotency_key`)",
            { code: "P2002", clientVersion: "5.22.0" },
          );
        },
      },
    };
    const svc = new IssuesService(prisma as unknown as PrismaService, noNotifications, fakeGateway());

    const body: RaiseIssueRequest = { ...raiseBody, idempotencyKey: "key-2" };
    const res = await svc.raise("ord-1", body, "rider-1");

    expect(res).toMatchObject({ id: "iss-2" });
  });

  it("BH-22: two different keys (or no key) each create their own issue — no false-positive dedup", async () => {
    let n = 0;
    const create = vi.fn(async () => {
      n += 1;
      return { id: `iss-${n}`, status: "open", type: "not_delivered", createdAt: new Date("2026-07-01T00:00:00Z") };
    });
    const prisma = { order: { findUnique: async () => order }, issue: { findFirst: async () => null, create } };
    const svc = new IssuesService(prisma as unknown as PrismaService, noNotifications, fakeGateway());

    await svc.raise("ord-1", raiseBody, "rider-1");
    await svc.raise("ord-1", { ...raiseBody, idempotencyKey: "key-3" }, "rider-1");

    expect(create).toHaveBeenCalledTimes(2);
  });
});

/** A Prisma fake whose $transaction runs the callback against a per-test `tx` object. An optional gateway
 *  lets the strike-limit test assert the post-commit standing-demotion eviction (DS17-02). */
function txSvc(tx: Record<string, unknown>, gateway: TrackingGateway = fakeGateway()) {
  const prisma = { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  return new IssuesService(prisma, noNotifications, gateway);
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

  // Regression (sibling of the admin-cancel `cancelledBy` bug): `Issue.resolvedByAdminId` is `@db.Uuid`, but
  // behind IAP `adminId` is the operator's email, which fails the uuid cast (`22P02`) and aborts the whole
  // resolve. The column is never read, so resolve() must store null there and keep the operator on the audit
  // row. Pre-fix tests missed it because they only passed a bare `"admin-1"` string.
  it("never writes a non-uuid operator identity into resolvedByAdminId — even an IAP X-Operator email", async () => {
    let issueUpdate: { data: Record<string, unknown> } | undefined;
    const auditCreate = vi.fn(async () => ({}));
    const operator = "accounts.google.com:ops@lynia.com";
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "open", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async (args: { data: Record<string, unknown> }) => { issueUpdate = args; return { count: 1 }; },
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      auditLog: { create: auditCreate },
    };
    await txSvc(tx).resolve(operator, "iss-1", { resolution: "close_no_action" });
    expect(issueUpdate!.data).toMatchObject({ status: "resolved", resolvedByAdminId: null });
    expect(issueUpdate!.data.resolvedByAdminId).not.toBe(operator);
    // The operator identity is preserved on the audit row (a plain String column), not lost.
    expect(auditCreate).toHaveBeenCalledWith({
      data: { actor: operator, action: "issue.resolve", target: "iss-1", reasonCode: "close_no_action", note: null },
    });
  });

  it("rider_strike: increments the DEDICATED disputeStrikes counter (not cancelStrikes) AND audits, in the same tx", async () => {
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
      // FRAUD P2-4: resolve() row-locks then reads the current disputeStrikes before incrementing.
      $executeRaw: async () => 1,
      rider: { findUnique: async () => ({ disputeStrikes: 0 }), update: riderUpdate },
      auditLog: { create: auditCreate },
    };
    const body: ResolveIssueRequest = { resolution: "rider_strike", note: "Rude to sender" };

    await txSvc(tx).resolve("admin-1", "iss-1", body);

    // Below the limit: a plain increment on disputeStrikes — cancelStrikes (the cancel axis) is untouched,
    // so a later 3rd cancel can't wipe this dispute strike.
    expect(riderUpdate).toHaveBeenCalledWith({ where: { profileId: "rider-1" }, data: { disputeStrikes: 1 } });
    expect(refundCreate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: { actor: "admin-1", action: "issue.resolve", target: "iss-1", reasonCode: "rider_strike", note: "Rude to sender" },
    });
  });

  it("rider_strike: at RIDER_STRIKE_LIMIT it forces a cooldown + offline and resets the counter (FRAUD P2-4)", async () => {
    const riderUpdate = vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({}));
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "investigating", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 1 }),
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      $executeRaw: async () => 1,
      // Two dispute strikes already on record → this third one hits RIDER_STRIKE_LIMIT (3).
      rider: { findUnique: async () => ({ disputeStrikes: 2 }), update: riderUpdate },
      auditLog: { create: async () => ({}) },
    };
    const gateway = fakeGateway();
    await txSvc(tx, gateway).resolve("admin-1", "iss-1", { resolution: "rider_strike", note: "3rd confirmed dispute" });

    const call = riderUpdate.mock.calls[0]![0];
    expect(call.where).toEqual({ profileId: "rider-1" });
    // Consequence: forced offline, counter reset, and a cooldown in the future (a dispute strike finally
    // has teeth, and its own limit — no longer silently piggy-backing on / wiped by the cancel counter).
    expect(call.data.disputeStrikes).toBe(0);
    expect(call.data.isOnline).toBe(false);
    expect((call.data.cooldownUntil as Date).getTime()).toBeGreaterThan(Date.now());
    // DS17-02: forcing the rider offline is a standing demotion, so they must also be evicted from the geo +
    // board supply planes through the funnel — otherwise the strike-limited rider kept board pushes + stayed
    // a GEOSEARCH ghost for the whole cooldown. Post-commit + best-effort, so let the `void` settle first.
    await flush();
    expect((gateway as unknown as { evictRiderFromSupply: ReturnType<typeof vi.fn> }).evictRiderFromSupply).toHaveBeenCalledWith("rider-1");
  });

  it("DS17-02: a dispute strike BELOW the limit does NOT evict from supply (the rider stays online)", async () => {
    const tx = {
      issue: {
        findUnique: async () => ({ id: "iss-1", status: "investigating", orderId: "ord-1", openedByProfileId: "cust-1" }),
        updateMany: async () => ({ count: 1 }),
      },
      order: { findUnique: async () => ({ riderId: "rider-1" }) },
      $executeRaw: async () => 1,
      rider: { findUnique: async () => ({ disputeStrikes: 0 }), update: vi.fn(async () => ({})) }, // → 1, below the limit
      auditLog: { create: async () => ({}) },
    };
    const gateway = fakeGateway();
    await txSvc(tx, gateway).resolve("admin-1", "iss-1", { resolution: "rider_strike", note: "first strike" });
    await flush();
    expect((gateway as unknown as { evictRiderFromSupply: ReturnType<typeof vi.fn> }).evictRiderFromSupply).not.toHaveBeenCalled();
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
    return new IssuesService(prisma, notifications, fakeGateway());
  }

  const baseTx = {
    order: { findUnique: async () => ({ riderId: "rider-1" }) },
    refund: { create: vi.fn(async () => ({})) },
    // FRAUD P2-4: rider_strike now row-locks + reads disputeStrikes before its increment.
    $executeRaw: async () => 1,
    rider: { findUnique: async () => ({ disputeStrikes: 0 }), update: vi.fn(async () => ({})) },
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
    return new IssuesService(prisma as unknown as PrismaService, noNotifications, fakeGateway());
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
