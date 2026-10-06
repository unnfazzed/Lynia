import { describe, expect, it, vi } from "vitest";
import { buildFcmMessage } from "../adapters/push/fcm.push";
import { androidChannelFor, JOB_ALERTS_CHANNEL, type PushAdapter, type PushMessage } from "../adapters/push/push.interface";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

/**
 * First Run v2 P12 (ledger D-81, owner 2026-10-06): rider job pings and food-offer alarms post on the
 * Android channel `job-alerts`, which the app creates loud (HIGH importance + sound) and checks for a muted
 * alarm; every other push stays on the app's default channel.
 */
describe("job-alerts Android channel", () => {
  it("maps the job-alert kinds, and only those", () => {
    expect(JOB_ALERTS_CHANNEL).toBe("job-alerts");
    expect(androidChannelFor({ kind: "broadcast" })).toBe("job-alerts");
    expect(androidChannelFor({ kind: "food_offer" })).toBe("job-alerts");
    for (const kind of ["offer", "riders_available", "issue", "food_ready_time"]) expect(androidChannelFor({ kind })).toBeUndefined();
    expect(androidChannelFor({ orderId: "o1", status: "assigned" })).toBeUndefined();
    expect(androidChannelFor(undefined)).toBeUndefined();
  });

  it("FCM carries it as android.notification.channelId; no channel ⇒ no notification block; a silent push never gets one", () => {
    const base: PushMessage = { token: "t", title: "New delivery nearby", body: "…" };
    expect(buildFcmMessage({ ...base, channelId: "job-alerts", ttlSeconds: 90 }).android).toEqual({ ttl: 90_000, notification: { channelId: "job-alerts" } });
    expect(buildFcmMessage(base).android).toBeUndefined();
    expect(buildFcmMessage({ ...base, channelId: "job-alerts", silent: true }).android).toBeUndefined();
  });

  function deps() {
    const prisma = {
      deviceToken: {
        findMany: vi.fn().mockResolvedValue([{ token: "r1", profileId: "rider", platform: "android" }]),
        deleteMany: vi.fn(),
      },
    };
    const push: PushAdapter = {
      send: vi.fn(),
      sendEach: vi.fn().mockImplementation(async (msgs: PushMessage[]) => msgs.map(() => ({ ok: true, invalidToken: false }))),
    };
    return { push, service: new NotificationsService(prisma as unknown as PrismaService, push) };
  }

  it("the new-delivery ping to nearby riders goes on job-alerts", async () => {
    const { push, service } = deps();
    await service.notifyNewBroadcast("o1", ["rider"], { pickup: "Avondale", fare: "3.50" });
    expect(push.sendEach).toHaveBeenCalledWith([expect.objectContaining({ token: "r1", channelId: "job-alerts", data: { orderId: "o1", kind: "broadcast" } })]);
  });

  it("the food-offer alarm (notifyProfiles with kind food_offer) goes on job-alerts", async () => {
    const { push, service } = deps();
    await service.notifyProfiles(["rider"], { title: "New food job", body: "…", data: { orderId: "o1", kind: "food_offer" } });
    expect(push.sendEach).toHaveBeenCalledWith([expect.objectContaining({ channelId: "job-alerts" })]);
  });

  it("any other push stays on the default channel", async () => {
    const { push, service } = deps();
    await service.notifyProfiles(["rider"], { title: "Hi", body: "…", data: { kind: "issue" } });
    const sent = (push.sendEach as ReturnType<typeof vi.fn>).mock.calls[0]![0] as PushMessage[];
    expect(sent[0]).not.toHaveProperty("channelId");
  });
});
