import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RestaurantReopenService } from "./restaurant-reopen.service";

const notified: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    notified.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;

function build(methods: Record<string, unknown>) {
  notified.length = 0;
  const prisma = methods as unknown as PrismaService;
  return { svc: new RestaurantReopenService(prisma, notifications), prisma: methods };
}

/** A week that is open 08:00–22:00 every day, and one that is never open. */
const ALWAYS = Object.fromEntries(
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { open: "08:00", close: "22:00" }]),
);
const NEVER = {};

describe("RestaurantReopenService.setReminder", () => {
  it("banks a reminder for a closed kitchen", async () => {
    const upsert = vi.fn(async (_args: { update: { notifiedAt: Date | null } }) => ({}));
    const { svc } = build({
      merchant: { findFirst: async () => ({ id: "m1", hours: NEVER }) },
      restaurantReopenReminder: { upsert },
    });

    await expect(svc.setReminder("p1", "m1")).resolves.toEqual({ set: true, alreadyOpen: false });
    expect(upsert).toHaveBeenCalledTimes(1);
    // Re-arms a previously-fired row rather than stacking a duplicate.
    expect(upsert.mock.calls[0][0]).toMatchObject({ update: { notifiedAt: null } });
  });

  it("declines — and banks nothing — when the kitchen is already open", async () => {
    const upsert = vi.fn();
    const { svc } = build({
      merchant: { findFirst: async () => ({ id: "m1", hours: ALWAYS }) },
      restaurantReopenReminder: { upsert },
    });

    // Hours read as open 08:00–22:00 local; pick a time inside that window.
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0));
    await expect(svc.setReminder("p1", "m1")).resolves.toEqual({ set: false, alreadyOpen: true });
    expect(upsert).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("404s for a merchant outside the pilot allowlist — invisible to browse, unsubscribable too", async () => {
    const { svc } = build({
      // findFirst filters on pilotEnabled, so a non-allowlisted merchant comes back null.
      merchant: { findFirst: async () => null },
      restaurantReopenReminder: { upsert: vi.fn() },
    });
    await expect(svc.setReminder("p1", "m1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("RestaurantReopenService.runSweep", () => {
  it("pushes once per open kitchen, to all its waiters, and retires their rows", async () => {
    const updateMany = vi.fn(async (_args: { where: { id: { in: string[] } } }) => ({ count: 2 }));
    const { svc } = build({
      restaurantReopenReminder: {
        findMany: async () => [
          { id: "r1", profileId: "p1", merchantId: "m1", merchant: { name: "Sadza Republic", hours: ALWAYS, pilotEnabled: true } },
          { id: "r2", profileId: "p2", merchantId: "m1", merchant: { name: "Sadza Republic", hours: ALWAYS, pilotEnabled: true } },
        ],
        updateMany,
      },
    });

    vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0));
    await svc.runSweep();
    vi.useRealTimers();

    // One push, both recipients — not one send per waiter.
    expect(notified).toHaveLength(1);
    expect(notified[0].profileIds).toEqual(["p1", "p2"]);
    expect(notified[0].title).toBe("Sadza Republic is open");
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["r1", "r2"] } } });
  });

  it("leaves a still-closed kitchen's reminders pending", async () => {
    const updateMany = vi.fn();
    const { svc } = build({
      restaurantReopenReminder: {
        findMany: async () => [
          { id: "r1", profileId: "p1", merchantId: "m1", merchant: { name: "Kombi Grill", hours: NEVER, pilotEnabled: true } },
        ],
        updateMany,
      },
    });

    await svc.runSweep();

    expect(notified).toHaveLength(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("skips a merchant that has left the pilot allowlist", async () => {
    const updateMany = vi.fn();
    const { svc } = build({
      restaurantReopenReminder: {
        findMany: async () => [
          { id: "r1", profileId: "p1", merchantId: "m1", merchant: { name: "Gone", hours: ALWAYS, pilotEnabled: false } },
        ],
        updateMany,
      },
    });

    vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0));
    await svc.runSweep();
    vi.useRealTimers();

    expect(notified).toHaveLength(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("retires rows BEFORE pushing, so a push failure can't re-fire every minute", async () => {
    const order: string[] = [];
    const failing = {
      notifyProfiles: async () => {
        order.push("push");
        throw new Error("expo down");
      },
    } as unknown as NotificationsService;
    const prisma = {
      restaurantReopenReminder: {
        findMany: async () => [
          { id: "r1", profileId: "p1", merchantId: "m1", merchant: { name: "Huku House", hours: ALWAYS, pilotEnabled: true } },
        ],
        updateMany: async () => {
          order.push("retire");
          return { count: 1 };
        },
      },
    } as unknown as PrismaService;
    const svc = new RestaurantReopenService(prisma, failing);

    vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0));
    // The sweep swallows the push failure — it must never throw out of the interval callback.
    await expect(svc.runSweep()).resolves.toBeUndefined();
    vi.useRealTimers();

    expect(order).toEqual(["retire", "push"]);
  });

  it("does nothing when there is nothing pending", async () => {
    const { svc } = build({ restaurantReopenReminder: { findMany: async () => [], updateMany: vi.fn() } });
    await svc.runSweep();
    expect(notified).toHaveLength(0);
  });
});

describe("RestaurantReopenService.getReminder / clearReminder", () => {
  it("reports a pending row as set, and a fired row as not set", async () => {
    const a = build({ restaurantReopenReminder: { findUnique: async () => ({ notifiedAt: null }) } });
    await expect(a.svc.getReminder("p1", "m1")).resolves.toEqual({ set: true });

    const b = build({ restaurantReopenReminder: { findUnique: async () => ({ notifiedAt: new Date() }) } });
    await expect(b.svc.getReminder("p1", "m1")).resolves.toEqual({ set: false });

    const c = build({ restaurantReopenReminder: { findUnique: async () => null } });
    await expect(c.svc.getReminder("p1", "m1")).resolves.toEqual({ set: false });
  });

  it("clearing is idempotent — removing one that isn't there is not an error", async () => {
    const deleteMany = vi.fn(async () => ({ count: 0 }));
    const { svc } = build({ restaurantReopenReminder: { deleteMany } });
    await expect(svc.clearReminder("p1", "m1")).resolves.toEqual({ set: false });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});
