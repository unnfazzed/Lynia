import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { PrescriptionService } from "./prescription.service";

// MJ-H5 / U43: an Rx order at a pharmacy with nobody ticked as pharmacist could never be packed ("Check
// the prescription before marking packed") and the customer couldn't cancel it. Placement refuses it.

function build(pharmacists: number, env: Partial<Env> = { RX_ENABLED: "true" }) {
  const counted: unknown[] = [];
  const prisma = {
    merchantMember: { count: async (args: unknown) => (counted.push(args), pharmacists) },
  };
  const svc = new PrescriptionService(prisma as unknown as PrismaService, {} as NotificationsService, {} as TrackingGateway, {} as StorageAdapter, env as Env);
  return { svc, counted };
}

const PHARMACY = { id: "m1", shopKind: "pharmacy" };

describe("PrescriptionService.prepareForPlacement — a pharmacist must be on the team (MJ-H5 / U43)", () => {
  it("refuses Rx lines with rx_unavailable when the pharmacy has no ticked pharmacist", async () => {
    const { svc, counted } = build(0);
    await expect(svc.prepareForPlacement("c1", PHARMACY, 1, undefined)).rejects.toMatchObject({ status: 409, response: { reason: "rx_unavailable" } });
    expect(counted).toEqual([{ where: { merchantId: "m1", isPharmacist: true } }]);
  });

  it("goes on to the prescription itself once a pharmacist is ticked", async () => {
    const { svc } = build(1);
    await expect(svc.prepareForPlacement("c1", PHARMACY, 1, undefined)).rejects.toMatchObject({ response: { reason: "prescription_required" } });
  });

  it("an order with no Rx lines never asks", async () => {
    const { svc, counted } = build(0);
    await expect(svc.prepareForPlacement("c1", PHARMACY, 0, undefined)).resolves.toBeNull();
    expect(counted).toHaveLength(0);
  });

  it("RX_ENABLED off and a non-pharmacy still refuse, without a team read", async () => {
    const off = build(1, { RX_ENABLED: "false" });
    await expect(off.svc.prepareForPlacement("c1", PHARMACY, 1, undefined)).rejects.toMatchObject({ response: { reason: "rx_unavailable" } });
    const grocery = build(1);
    await expect(grocery.svc.prepareForPlacement("c1", { id: "m2", shopKind: "grocery" }, 1, undefined)).rejects.toMatchObject({ response: { reason: "rx_unavailable" } });
    expect([...off.counted, ...grocery.counted]).toHaveLength(0);
  });
});
