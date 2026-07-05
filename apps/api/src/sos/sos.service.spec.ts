import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { RaiseSosRequest } from "@lynia/shared";
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
    // Contacts surfaced for the app: emergency number always present, safety line falls back to it.
    expect(res.emergencyNumber).toBe("999");
    expect(typeof res.safetyLine).toBe("string");
    expect(res.safetyLine.length).toBeGreaterThan(0);
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
