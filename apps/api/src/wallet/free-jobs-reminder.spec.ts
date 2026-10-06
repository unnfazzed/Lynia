import { COMMISSION } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import { RESERVED_AUDIT_ACTIONS } from "../admin/admin-audit.service";
import type { Env } from "../config/env";
import { FEED_READ_ACTIONS } from "../notifications/notifications-feed.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { FREE_JOBS_ACTION, FREE_JOBS_COPY, freeJobsMilestoneAt } from "./free-jobs-reminder";
import { WalletService } from "./wallet.service";

const TOTAL = COMMISSION.freeFirstJobs;

/** A completion-transaction stub: the rider's post-increment count and the audit rows already written. */
function tx(tripsCount: number, existing: Array<{ target: string; action: string }> = []) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    client: {
      rider: { findUnique: vi.fn(async () => ({ tripsCount })) },
      auditLog: {
        findFirst: vi.fn(async (a: { where: { target: string; action: string } }) =>
          existing.find((e) => e.target === a.where.target && e.action === a.where.action) ? { id: "a1" } : null,
        ),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          created.push(a.data);
          return { id: "new" };
        }),
      },
    },
  };
}

function wallet(ratePct: string | undefined, notifications?: NotificationsService) {
  return new WalletService({ COMMISSION_RATE_PCT: ratePct, COMMISSION_SHADOW_RATE_PCT: 10 } as unknown as Env, {} as PrismaService, notifications);
}

describe("freeJobsMilestoneAt (D-78)", () => {
  it("fires once at one free job left and once at none, never otherwise", () => {
    expect(freeJobsMilestoneAt(TOTAL - 1)).toBe("one_left");
    expect(freeJobsMilestoneAt(TOTAL)).toBe("used_up");
    for (const n of [0, 1, TOTAL - 2, TOTAL + 1, TOTAL + 40]) expect(freeJobsMilestoneAt(n)).toBeNull();
    expect(freeJobsMilestoneAt(null)).toBeNull();
    expect(freeJobsMilestoneAt(Number.NaN)).toBeNull();
  });
});

describe("WalletService.noteFreeJobsMilestone (D-78, inside the completion transaction)", () => {
  it("records the one-left milestone as its audit row and returns it", async () => {
    const t = tx(TOTAL - 1);
    const out = await wallet("10").noteFreeJobsMilestone(t.client as never, "r1");
    expect(out).toBe("one_left");
    expect(t.created).toEqual([expect.objectContaining({ action: FREE_JOBS_ACTION.one_left, target: "r1", actor: "system:free-jobs" })]);
  });

  it("records the used-up milestone on the last free job", async () => {
    const t = tx(TOTAL);
    expect(await wallet("10").noteFreeJobsMilestone(t.client as never, "r1")).toBe("used_up");
    expect(t.created[0]).toMatchObject({ action: FREE_JOBS_ACTION.used_up });
  });

  it("is idempotent per rider and milestone: an existing row means no second reminder", async () => {
    const t = tx(TOTAL, [{ target: "r1", action: FREE_JOBS_ACTION.used_up }]);
    expect(await wallet("10").noteFreeJobsMilestone(t.client as never, "r1")).toBeNull();
    expect(t.created).toEqual([]);
  });

  it("stays silent between and after the milestones", async () => {
    for (const n of [1, TOTAL + 1]) {
      const t = tx(n);
      expect(await wallet("10").noteFreeJobsMilestone(t.client as never, "r1")).toBeNull();
      expect(t.created).toEqual([]);
    }
  });

  it("stays silent while commission is off (the 0% launch rate): there is nothing to top up for", async () => {
    const t = tx(TOTAL - 1);
    expect(await wallet(undefined).noteFreeJobsMilestone(t.client as never, "r1")).toBeNull();
    expect(t.client.rider.findUnique).not.toHaveBeenCalled();
    expect(t.created).toEqual([]);
  });
});

describe("WalletService.sendFreeJobsReminder (D-78, after commit)", () => {
  it("pushes the owner's copy verbatim with the free_jobs kind", () => {
    const notifyProfiles = vi.fn(async () => {});
    const w = wallet("10", { notifyProfiles } as unknown as NotificationsService);
    w.sendFreeJobsReminder("r1", "one_left");
    expect(notifyProfiles).toHaveBeenCalledWith(["r1"], {
      title: "One commission-free job left",
      body: "After your next job, commission comes off your prepaid balance. Top up in Money so you can keep going online.",
      data: { kind: "free_jobs", milestone: "one_left" },
    });
    w.sendFreeJobsReminder("r1", "used_up");
    expect(notifyProfiles).toHaveBeenLastCalledWith(["r1"], {
      title: "Your free jobs are used up",
      body: "Commission now comes off your prepaid balance. Top up in Money to keep going online.",
      data: { kind: "free_jobs", milestone: "used_up" },
    });
  });

  it("does nothing without a milestone", () => {
    const notifyProfiles = vi.fn(async () => {});
    wallet("10", { notifyProfiles } as unknown as NotificationsService).sendFreeJobsReminder("r1", null);
    expect(notifyProfiles).not.toHaveBeenCalled();
  });
});

describe("free-jobs reminder rows (D-78)", () => {
  it("are read back by the Notifications feed and reserved against forgery", () => {
    for (const action of Object.values(FREE_JOBS_ACTION)) {
      expect(FEED_READ_ACTIONS).toContain(action);
      expect(RESERVED_AUDIT_ACTIONS.has(action)).toBe(true);
    }
    expect(FREE_JOBS_COPY.used_up.title).toBe("Your free jobs are used up");
  });
});
