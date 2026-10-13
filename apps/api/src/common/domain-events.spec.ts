import { describe, expect, it, vi } from "vitest";
import { DomainEventsService, domainEventCreateArgs } from "./domain-events";

describe("DomainEventsService (admin console v2 §3)", () => {
  const svc = new DomainEventsService();

  it("writes one row with the event's fields", async () => {
    const create = vi.fn(async () => ({}));
    await svc.record({ domainEvent: { create } }, {
      type: "offer.bid",
      actorId: "r1",
      actorRole: "rider",
      subjectType: "offer",
      subjectId: "of1",
      orderId: "o1",
      data: { fare: 3.5, etaMinutes: 7 },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        type: "offer.bid",
        actorId: "r1",
        actorRole: "rider",
        subjectType: "offer",
        subjectId: "of1",
        orderId: "o1",
        data: { fare: 3.5, etaMinutes: 7 },
      },
    });
  });

  it("defaults the optional fields to null and omits empty data", () => {
    expect(domainEventCreateArgs({ type: "rider.online", subjectType: "rider", subjectId: "r1" })).toEqual({
      data: { type: "rider.online", actorId: null, actorRole: null, subjectType: "rider", subjectId: "r1", orderId: null },
    });
    expect(domainEventCreateArgs({ type: "rider.online", subjectType: "rider", subjectId: "r1", data: { gone: undefined } }).data).not.toHaveProperty(
      "data",
    );
  });

  it("never stores GPS or a phone number in data, whatever a caller passes", () => {
    const args = domainEventCreateArgs({
      type: "order.broadcast",
      subjectType: "order",
      subjectId: "o1",
      data: { lat: -17.8, lng: 31.0, Latitude: 1, phone: "+263…", location: "x", radiusM: 5000, ridersReached: 3 },
    });
    expect(args.data.data).toEqual({ radiusM: 5000, ridersReached: 3 });
  });

  it("never rejects: a failed write is logged and swallowed", async () => {
    const create = vi.fn(async () => {
      throw new Error("connection reset");
    });
    await expect(svc.record({ domainEvent: { create } }, { type: "rider.online", subjectType: "rider", subjectId: "r1" })).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
  });

  it("is a no-op on a client without the delegate (a unit-test double)", async () => {
    await expect(svc.record({}, { type: "rider.online", subjectType: "rider", subjectId: "r1" })).resolves.toBeUndefined();
    await expect(svc.record(undefined, { type: "rider.online", subjectType: "rider", subjectId: "r1" })).resolves.toBeUndefined();
  });

  it("batchOps hands a batch transaction zero or one create", () => {
    const op = { kind: "prisma-promise" };
    const create = vi.fn(() => op);
    expect(svc.batchOps({ domainEvent: { create } }, { type: "rider.onboarding_step", subjectType: "rider", subjectId: "r1" })).toEqual([op]);
    expect(svc.batchOps({}, { type: "rider.onboarding_step", subjectType: "rider", subjectId: "r1" })).toEqual([]);
  });

  it("riderStep / riderOffline / merchantPhase shape their events", async () => {
    const create = vi.fn(async () => ({}));
    const db = { domainEvent: { create } };
    await svc.riderStep(db, "r1", "first_topup", { actorRole: "system", actorId: null, data: { rail: "ecocash" } });
    await svc.riderOffline(db, "r1", "admin_ban", { actorId: "ops", actorRole: "admin" });
    await svc.merchantPhase(db, { orderId: "o1", merchantId: "m1", phase: "accept", actorId: "p1" });
    expect(create.mock.calls.map((c) => (c as unknown as [{ data: unknown }])[0].data)).toEqual([
      expect.objectContaining({ type: "rider.onboarding_step", actorRole: "system", actorId: null, subjectId: "r1", data: { step: "first_topup", rail: "ecocash" } }),
      expect.objectContaining({ type: "rider.offline", actorRole: "admin", actorId: "ops", subjectId: "r1", data: { reason: "admin_ban" } }),
      expect.objectContaining({ type: "merchant.phase", actorRole: "merchant", subjectType: "order", subjectId: "o1", orderId: "o1", data: { phase: "accept", merchantId: "m1" } }),
    ]);
  });
});
