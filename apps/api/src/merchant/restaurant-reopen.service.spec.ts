import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { harareEffectiveHours, harareStartOfNextDay } from "./harare-clock";
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

// MJ-RM13 (2026-10-07): both paths read open-ness off the UTC server clock (08:00 Harare is 06:00Z, so the
// push came ~2 h late, and 22:00–24:00 Harare read as open) and ignored a close by hand (`closedUntil`).
// They now use placeOrder's own rule: Harare's wall clock, and closed while closedUntil is ahead. The API
// container runs in UTC and so does this suite (no TZ is set), so these instants are what production sees.
describe("RestaurantReopenService — MJ-RM13: Harare time and closed-by-hand, exactly as placeOrder", () => {
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  afterEach(() => vi.useRealTimers());

  function setWith(merchant: Record<string, unknown>) {
    const upsert = vi.fn(async () => ({}));
    const { svc } = build({ merchant: { findFirst: async () => ({ id: "m1", hours: ALWAYS, closedUntil: null, ...merchant }) }, restaurantReopenReminder: { upsert } });
    return { svc, upsert };
  }

  it("setReminder: 08:30 Harare (06:30Z) is open — no reminder banked (the UTC clock read it as closed)", async () => {
    at("2026-08-05T06:30:00Z");
    const { svc, upsert } = setWith({});
    await expect(svc.setReminder("p1", "m1")).resolves.toEqual({ set: false, alreadyOpen: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("setReminder: 23:00 Harare (21:00Z) is closed — the reminder is banked, not 'go ahead and order'", async () => {
    at("2026-08-05T21:00:00Z");
    const { svc, upsert } = setWith({});
    await expect(svc.setReminder("p1", "m1")).resolves.toEqual({ set: true, alreadyOpen: false });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("setReminder: a kitchen closed by hand inside its hours is closed — the reminder is banked", async () => {
    at("2026-08-05T10:00:00Z");
    const { svc, upsert } = setWith({ closedUntil: new Date("2026-08-05T22:00:00Z") });
    await expect(svc.setReminder("p1", "m1")).resolves.toEqual({ set: true, alreadyOpen: false });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  function sweepWith(merchant: Record<string, unknown>) {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build({
      restaurantReopenReminder: {
        findMany: async () => [{ id: "r1", profileId: "p1", merchantId: "m1", merchant: { name: "Sadza Republic", hours: ALWAYS, closedUntil: null, pilotEnabled: true, ...merchant } }],
        updateMany,
      },
    });
    return { svc, updateMany };
  }

  it("runSweep: fires at 08:00 Harare (06:00Z), not two hours later", async () => {
    at("2026-08-05T06:01:00Z");
    const { svc, updateMany } = sweepWith({});
    await svc.runSweep();
    expect(notified.map((n) => n.title)).toEqual(["Sadza Republic is open"]);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("runSweep: a kitchen closed by hand stays pending inside its hours, and fires once the close ends", async () => {
    at("2026-08-05T10:00:00Z");
    const closed = sweepWith({ closedUntil: new Date("2026-08-05T22:00:00Z") });
    await closed.svc.runSweep();
    expect(notified).toHaveLength(0);
    expect(closed.updateMany).not.toHaveBeenCalled();

    at("2026-08-06T06:30:00Z"); // 08:30 Harare the next day: the close ended at Harare midnight.
    const reopened = sweepWith({ closedUntil: new Date("2026-08-05T22:00:00Z") });
    await reopened.svc.runSweep();
    expect(notified).toHaveLength(1);
  });

  it("runSweep: 23:00 Harare (21:00Z) is closed — nothing fires (the UTC clock read it as open)", async () => {
    at("2026-08-05T21:00:00Z");
    const { svc, updateMany } = sweepWith({});
    await svc.runSweep();
    expect(notified).toHaveLength(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("harare-clock — MJ-RM13 siblings (merchant.service setOpen / toListItem)", () => {
  it("harareStartOfNextDay is Harare's next midnight as an instant", () => {
    expect(harareStartOfNextDay(new Date("2026-10-07T13:30:00.250Z")).toISOString()).toBe("2026-10-07T22:00:00.000Z");
    // 00:30 Harare on the 8th: the next midnight is the 8th→9th, not 02:00 Harare on the 8th (UTC midnight).
    expect(harareStartOfNextDay(new Date("2026-10-07T22:30:00Z")).toISOString()).toBe("2026-10-08T22:00:00.000Z");
  });

  it("harareEffectiveHours drops Harare's today while closed by hand, even from 00:00 to 02:00 Harare", () => {
    const week = { tue: { open: "08:00", close: "22:00" }, wed: { open: "00:00", close: "23:00" } };
    // Wed 2026-10-07 00:30 Harare = Tue 22:30Z: the UTC day (Tue) is the wrong one to drop.
    const now = new Date("2026-10-06T22:30:00Z");
    const closedUntil = new Date("2026-10-07T22:00:00Z");
    expect(harareEffectiveHours(week as never, closedUntil, now)).toEqual({ tue: week.tue });
    // A close that has ended changes nothing.
    expect(harareEffectiveHours(week as never, new Date("2026-10-06T22:00:00Z"), now)).toBe(week);
    expect(harareEffectiveHours(null, null, now)).toBeNull();
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
