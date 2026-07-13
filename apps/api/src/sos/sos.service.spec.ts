import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { type RaiseSosRequest, SOS_POLICY } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SosService } from "./sos.service";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function makeNotifications() {
  return { notifyOps: vi.fn(async () => {}), notifyProfiles: vi.fn(async () => {}) } as unknown as NotificationsService;
}

/** Live order (en_route_pickup is in PHONE_REVEAL_STATUSES). */
const liveOrder = { id: "ord-1", status: "en_route_pickup", customerId: "cust-1", riderId: "rider-1" };

function svc(order: unknown, notifications: NotificationsService, createSpy?: (a: unknown) => void) {
  const prisma = {
    order: { findUnique: async () => order },
    sosEvent: {
      create: async (args: unknown) => {
        createSpy?.(args);
        return { id: "sos-1" };
      },
    },
  } as unknown as PrismaService;
  return new SosService(prisma, notifications);
}

const body: RaiseSosRequest = { orderId: "ord-1", lat: -17.8, lng: 31.05 };

describe("SosService.raise", () => {
  it("rejects a caller not on the order", async () => {
    await expect(svc(liveOrder, makeNotifications()).raise("ord-1", body, "stranger")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an SOS on a non-live order", async () => {
    const done = { ...liveOrder, status: "expired" };
    await expect(svc(done, makeNotifications()).raise("ord-1", body, "cust-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates the SosEvent, pushes ops + the counterparty, and returns the emergency contacts", async () => {
    let createArgs: { data: Record<string, unknown> } | undefined;
    const notifications = makeNotifications();
    const s = svc(liveOrder, notifications, (a) => (createArgs = a as { data: Record<string, unknown> }));

    const res = await s.raise("ord-1", body, "cust-1");
    await flush();

    expect(createArgs!.data).toMatchObject({
      orderId: "ord-1",
      raisedByProfileId: "cust-1",
      raisedByRole: "customer",
      lat: -17.8,
      lng: 31.05,
    });
    // Ops always; the counterparty (the rider, here) gets the alert too.
    expect(notifications.notifyOps).toHaveBeenCalledTimes(1);
    expect(notifications.notifyProfiles).toHaveBeenCalledWith(["rider-1"], expect.objectContaining({ title: expect.any(String) }));
    // Contacts surfaced for the app: emergency number always present, safety line defaults to the
    // final SOS_POLICY constant (no env override here) — not the emergency number.
    expect(res.emergencyNumber).toBe("999");
    expect(res.safetyLine).toBe(SOS_POLICY.safetyLine);
    expect(res.safetyLine).not.toBe(res.emergencyNumber);
  });

  it("still returns the emergency contacts when the SosEvent DB write fails (safety-critical)", async () => {
    const notifications = makeNotifications();
    const prisma = {
      order: { findUnique: async () => liveOrder },
      sosEvent: { create: async () => { throw new Error("db down"); } },
    } as unknown as PrismaService;
    const s = new SosService(prisma, notifications);

    // A transient DB failure must NOT withhold the static 999 / safety-line numbers.
    const res = await s.raise("ord-1", body, "cust-1");
    expect(res.emergencyNumber).toBe("999");
    expect(res.safetyLine).toBe(SOS_POLICY.safetyLine);
    // Ops is still escalated even though the audit row didn't land.
    expect(notifications.notifyOps).toHaveBeenCalledTimes(1);
  });

  it("reads the safety line from the env var when set", async () => {
    process.env.SOS_SAFETY_LINE = "+263242700000";
    try {
      const res = await svc(liveOrder, makeNotifications()).raise("ord-1", body, "rider-1");
      expect(res.safetyLine).toBe("+263242700000");
    } finally {
      delete process.env.SOS_SAFETY_LINE;
    }
  });
});

describe("SosService.listRecent (DS13-05 — read-only ops surface)", () => {
  const row = (id: string, createdAt: Date, acknowledgedAt: Date | null = null) => ({
    id,
    orderId: "ord-1",
    raisedByProfileId: "cust-1",
    raisedByRole: "customer",
    lat: -17.8,
    lng: 31.05,
    acknowledgedAt,
    createdAt,
  });

  function svcWith(findMany: (args: { orderBy: unknown; take: number }) => Promise<unknown>) {
    const prisma = { sosEvent: { findMany } } as unknown as PrismaService;
    return new SosService(prisma, makeNotifications());
  }

  it("returns recent events newest-first with ISO timestamps, including acknowledgedAt (null when pending)", async () => {
    let orderBy: unknown;
    const s = svcWith(async (args) => {
      orderBy = args.orderBy;
      return [
        row("sos-2", new Date("2026-07-13T10:00:00Z"), new Date("2026-07-13T10:05:00Z")),
        row("sos-1", new Date("2026-07-12T10:00:00Z")),
      ];
    });
    const rows = await s.listRecent();
    expect(orderBy).toEqual([{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }]);
    expect(rows.map((r) => r.id)).toEqual(["sos-2", "sos-1"]);
    expect(rows[0]!.createdAt).toBe("2026-07-13T10:00:00.000Z");
    // acknowledgedAt: ISO string when set, null while still pending.
    expect(rows[0]!.acknowledgedAt).toBe("2026-07-13T10:05:00.000Z");
    expect(rows[1]!.acknowledgedAt).toBeNull();
  });

  // DS13-05 follow-up: a still-open SOS must never scroll out of view just because newer, already-
  // acknowledged events piled up after it — the console's whole reason to exist is that nothing raised
  // vanishes. The service can't prove Postgres's NULLS FIRST ordering from a mocked findMany, so this
  // asserts the query shape it hands to Prisma requests pending-first ordering (the DB does the sort).
  it("orders pending (unacknowledged) events ahead of acknowledged ones via NULLS FIRST", async () => {
    let orderBy: unknown;
    const s = svcWith(async (args) => {
      orderBy = args.orderBy;
      // Simulate what Postgres would already have sorted: pending row first even though it's older.
      return [
        row("sos-old-pending", new Date("2026-07-10T10:00:00Z"), null),
        row("sos-new-acked", new Date("2026-07-13T10:00:00Z"), new Date("2026-07-13T10:05:00Z")),
      ];
    });
    const rows = await s.listRecent();
    expect(orderBy).toEqual([{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }]);
    expect(rows[0]!.id).toBe("sos-old-pending");
    expect(rows[0]!.acknowledgedAt).toBeNull();
  });

  it("clamps the limit to [1, 200] (caps a large request, floors a non-positive one)", async () => {
    let take = -1;
    const s = svcWith(async (args) => { take = args.take; return []; });
    await s.listRecent(9999);
    expect(take).toBe(200); // capped
    await s.listRecent(0);
    expect(take).toBe(1); // floored to at least 1
    await s.listRecent(); // default
    expect(take).toBe(50);
  });
});

describe("SosService.acknowledge (DS13-05 — ops acknowledgement)", () => {
  /**
   * Prisma stub for the acknowledge $transaction. `updateManyCount` is what the CAS write returns (1 =
   * pending row transitioned, 0 = missing-or-already-acked); `existing` is the row the follow-up
   * findUnique sees when the CAS wrote nothing (null = missing). auditCreate records audit writes.
   */
  function svcFor(opts: {
    updateManyCount: number;
    existing?: { acknowledgedAt: Date | null } | null;
    auditCreate?: (args: unknown) => void;
  }) {
    const prisma = {
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          sosEvent: {
            updateMany: async () => ({ count: opts.updateManyCount }),
            findUnique: async () => opts.existing ?? null,
          },
          auditLog: { create: async (args: unknown) => { opts.auditCreate?.(args); return { id: "audit-1" }; } },
        }),
    } as unknown as PrismaService;
    return new SosService(prisma, makeNotifications());
  }

  it("sets acknowledgedAt and writes the audit row on the null→now transition", async () => {
    let auditArgs: { data: Record<string, unknown> } | undefined;
    const s = svcFor({ updateManyCount: 1, auditCreate: (a) => (auditArgs = a as { data: Record<string, unknown> }) });

    const res = await s.acknowledge("sos-1", "ops@lynia.co");
    expect(res.id).toBe("sos-1");
    expect(typeof res.acknowledgedAt).toBe("string");
    expect(Number.isNaN(Date.parse(res.acknowledgedAt))).toBe(false);
    // Audit row attributed to the real operator, action sos.acknowledge, target = the sos id.
    expect(auditArgs!.data).toMatchObject({ actor: "ops@lynia.co", action: "sos.acknowledge", target: "sos-1" });
  });

  it("is an idempotent no-op on an already-acknowledged row (no throw, no duplicate audit)", async () => {
    const acked = new Date("2026-07-13T09:00:00Z");
    let auditCalls = 0;
    const s = svcFor({ updateManyCount: 0, existing: { acknowledgedAt: acked }, auditCreate: () => (auditCalls += 1) });

    const res = await s.acknowledge("sos-1", "ops@lynia.co");
    // Returns the pre-existing ack time and writes NO second audit row.
    expect(res).toEqual({ id: "sos-1", acknowledgedAt: acked.toISOString() });
    expect(auditCalls).toBe(0);
  });

  it("throws NotFound when the SOS row doesn't exist", async () => {
    let auditCalls = 0;
    const s = svcFor({ updateManyCount: 0, existing: null, auditCreate: () => (auditCalls += 1) });
    await expect(s.acknowledge("missing", "ops@lynia.co")).rejects.toBeInstanceOf(NotFoundException);
    expect(auditCalls).toBe(0);
  });
});
