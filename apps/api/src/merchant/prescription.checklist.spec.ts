import { describe, expect, it } from "vitest";
import { ApprovePrescriptionRequest, DeclinePrescriptionRequest } from "@lynia/shared";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { PrescriptionService } from "./prescription.service";
import { withMembershipShim } from "./testing/membership-shim";

// Merchant v2 P1 (ledger D-77): the pharmacist's checklist is stored with the check, for the audit trail.

const ALL = { nameMatches: true, signedStamped: true, recentDate: true } as const;

function build() {
  const writes: Array<Record<string, unknown>> = [];
  const prisma = withMembershipShim({
    merchant: { findUnique: async () => ({ id: "m1" }) },
    merchantMember: {
      findFirst: async () => ({ merchantId: "m1", role: "owner", merchant: { businessType: "shop" } }),
      findUnique: async () => ({ merchantId: "m1", role: "owner", isPharmacist: true, merchant: { businessType: "shop" } }),
    },
    order: { findFirst: async () => ({ id: "o1" }) },
    orderPrescription: {
      findUnique: async () => ({ status: "pending", order: { status: "requested", merchantPhase: "preparing" } }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { count: 1 };
      },
    },
  } as Record<string, unknown>);
  const gateway = { emitFoodQueueChanged: () => {} } as unknown as TrackingGateway;
  const svc = new PrescriptionService(prisma as unknown as PrismaService, {} as NotificationsService, gateway, {} as StorageAdapter);
  return { svc, writes };
}

describe("Merchant v2 P1 · the Rx checklist (D-77)", () => {
  it("approve stores the three ticks with the check", async () => {
    const { svc, writes } = build();
    await svc.approve("owner-1", "o1", ALL);
    expect(writes[0]).toMatchObject({ status: "approved", checklist: ALL });
  });

  it("an older screen without the checklist still approves, and stores none", async () => {
    const { svc, writes } = build();
    await svc.approve("owner-1", "o1");
    expect(writes[0]).toMatchObject({ status: "approved" });
    expect(writes[0]).not.toHaveProperty("checklist");
  });

  it("the contract takes approval only with every box ticked; a decline carries what was ticked", () => {
    expect(ApprovePrescriptionRequest.safeParse({ checklist: ALL }).success).toBe(true);
    expect(ApprovePrescriptionRequest.safeParse(undefined).success).toBe(true);
    expect(ApprovePrescriptionRequest.safeParse({ checklist: { ...ALL, recentDate: false } }).success).toBe(false);
    expect(DeclinePrescriptionRequest.safeParse({ reason: "expired", checklist: { ...ALL, recentDate: false } }).success).toBe(true);
  });
});
