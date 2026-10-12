import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { nudgeTitle, RIDER_NUDGE, RiderNudgeService } from "./rider-nudge.service";
import type { TrackingService } from "./tracking.service";

const HANDOFF = resolve(__dirname, "../../../../packages/design/handoff");

function harness(opts: { offline?: string[]; claimed?: string[] | null; waiting?: number; throws?: boolean } = {}) {
  const offlineRidersNear = vi.fn(async () => {
    if (opts.throws) throw new Error("db down");
    return opts.offline ?? ["r1", "r2"];
  });
  const claimRiderNudges = vi.fn(async (ids: string[]) => (opts.claimed === undefined ? ids : opts.claimed));
  const notifyProfiles = vi.fn(async () => {});
  const prisma = { $queryRaw: vi.fn(async () => [{ n: BigInt(opts.waiting ?? 1) }]) };
  const service = new RiderNudgeService(
    prisma as unknown as PrismaService,
    { offlineRidersNear, claimRiderNudges } as unknown as TrackingService,
    { notifyProfiles } as unknown as NotificationsService,
  );
  return { service, offlineRidersNear, claimRiderNudges, notifyProfiles };
}

const point = { lat: -17.83, lng: 31.05 };

describe("RiderNudgeService.nudgeOfflineRiders (owner 2026-10-12, cold start)", () => {
  it("asks the offline riders near the job, throttled per rider, with the board's count and the go-online line", async () => {
    const h = harness({ offline: ["r1", "r2", "r3"], claimed: ["r1", "r3"], waiting: 3 });
    await h.service.nudgeOfflineRiders(point, "parcel");
    expect(h.offlineRidersNear).toHaveBeenCalledWith(point.lat, point.lng, RIDER_NUDGE.radiusM, RIDER_NUDGE.maxRiders);
    expect(h.claimRiderNudges).toHaveBeenCalledWith(["r1", "r2", "r3"], RIDER_NUDGE.perRiderTtlS);
    expect(h.notifyProfiles).toHaveBeenCalledWith(["r1", "r3"], {
      title: "3 parcels near you",
      body: "Go online when you want jobs.",
      data: { kind: "rider_demand_nudge" },
      collapseKey: "rider:demand_nudge",
    });
  });

  it("sends nothing when nobody is near, everyone was nudged recently, or there's no Redis to throttle with", async () => {
    for (const opts of [{ offline: [] }, { claimed: [] }, { claimed: null }]) {
      const h = harness(opts);
      await h.service.nudgeOfflineRiders(point, "job");
      expect(h.notifyProfiles).not.toHaveBeenCalled();
    }
  });

  it("never throws", async () => {
    const h = harness({ throws: true });
    await expect(h.service.nudgeOfflineRiders(point, "job")).resolves.toBeUndefined();
    expect(h.notifyProfiles).not.toHaveBeenCalled();
  });
});

describe("nudge copy — the handoffs' own strings", () => {
  it("counts parcels with rider-v2's board row, and any job with the owner-approved mixed count", () => {
    expect(nudgeTitle("parcel", 1)).toBe("1 parcel near you");
    expect(nudgeTitle("parcel", 4)).toBe("4 parcels near you");
    expect(nudgeTitle("job", 1)).toBe("1 job near you");
    expect(nudgeTitle("job", 2)).toBe("2 jobs near you");
    expect(nudgeTitle("job", 0)).toBe("1 job near you");
  });

  it("matches the design package byte for byte", () => {
    const riderKit = readFileSync(resolve(HANDOFF, "rider-v2/design/rv-kit.jsx"), "utf8");
    expect(riderKit).toContain(`nearYou: "${nudgeTitle("parcel", 4)}"`);
    expect(riderKit).toContain(`nearYou1: "${nudgeTitle("parcel", 1)}"`);
    const firstRun = readFileSync(resolve(HANDOFF, "first-run-v2/copy.ts"), "utf8");
    expect(firstRun).toContain(`doneBody:'${RIDER_NUDGE.body}'`);
  });
});
