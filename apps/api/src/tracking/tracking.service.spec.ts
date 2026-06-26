import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

function svc(findUnique: () => Promise<unknown>) {
  return new TrackingService({ order: { findUnique } } as unknown as PrismaService);
}

describe("TrackingService.canAccessOrder", () => {
  it("denies access to a missing order", async () => {
    expect(await svc(async () => null).canAccessOrder("u1", "o1")).toBe(false);
  });
  it("allows the order's customer", async () => {
    const s = svc(async () => ({ customerId: "u1", riderId: "r9" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(true);
  });
  it("allows the assigned rider", async () => {
    const s = svc(async () => ({ customerId: "c9", riderId: "u1" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(true);
  });
  it("denies an unrelated user", async () => {
    const s = svc(async () => ({ customerId: "c9", riderId: "r9" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(false);
  });
});

describe("TrackingService.isAssignedRider", () => {
  it("denies a missing order", async () => {
    expect(await svc(async () => null).isAssignedRider("u1", "o1")).toBe(false);
  });
  it("denies a rider who is not assigned", async () => {
    const s = svc(async () => ({ riderId: "r9", status: "assigned" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(false);
  });
  it("denies the assigned rider when the ride is not active", async () => {
    const s = svc(async () => ({ riderId: "u1", status: "completed" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(false);
  });
  it("allows the assigned rider on an active ride", async () => {
    const s = svc(async () => ({ riderId: "u1", status: "en_route_pickup" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(true);
  });
});
