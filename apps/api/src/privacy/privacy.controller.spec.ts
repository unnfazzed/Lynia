import { describe, expect, it, vi } from "vitest";
import type { StorageSweeper } from "../adapters/storage/storage-sweeper";
import { PrivacyController } from "./privacy.controller";
import type { PrivacyService } from "./privacy.service";

const purgeResult = { gpsScrubbed: 3, sessionsPurged: 2 };

describe("PrivacyController.purge — retention job + orphan upload sweep (C1 / E2)", () => {
  it("runs the orphan sweep as the second step and reports both", async () => {
    const order: string[] = [];
    const privacy = { purgeExpiredData: vi.fn(async () => (order.push("purge"), purgeResult)) } as unknown as PrivacyService;
    const sweeper = { sweepOrphans: vi.fn(async () => (order.push("sweep"), { scanned: 10, deleted: 4 })) } as unknown as StorageSweeper;
    await expect(new PrivacyController(privacy, sweeper).purge()).resolves.toEqual({ ...purgeResult, orphanSweep: { scanned: 10, deleted: 4 } });
    expect(order).toEqual(["purge", "sweep"]);
  });

  it("a sweep failure never fails the retention purge (own try/catch) — reported as orphanSweep: null", async () => {
    const privacy = { purgeExpiredData: vi.fn(async () => purgeResult) } as unknown as PrivacyService;
    const sweeper = { sweepOrphans: vi.fn(async () => { throw new Error("storage down"); }) } as unknown as StorageSweeper;
    await expect(new PrivacyController(privacy, sweeper).purge()).resolves.toEqual({ ...purgeResult, orphanSweep: null });
  });

  it("a purge failure still fails the job, and the sweep doesn't run", async () => {
    const privacy = { purgeExpiredData: vi.fn(async () => { throw new Error("db down"); }) } as unknown as PrivacyService;
    const sweeper = { sweepOrphans: vi.fn() } as unknown as StorageSweeper;
    await expect(new PrivacyController(privacy, sweeper).purge()).rejects.toThrow(/db down/);
    expect(sweeper.sweepOrphans).not.toHaveBeenCalled();
  });
});
