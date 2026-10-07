import { describe, expect, it } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OrderSubstitutionService } from "./order-substitution.service";

// MJ-H4: pharmacy "Swap for…" could add prescription-only medicine with no prescription check, and the
// new line wasn't flagged rxRequired. A swap to an Rx item now needs an approved prescription, and an
// accepted one lands as an Rx line.

const PARACETAMOL = { id: "otc", merchantId: "m1", name: "Paracetamol 500mg", priceUsd: 1.5, isDraft: false, outOfStockUntil: null, rxRequired: false };
const AMOXICILLIN = { id: "amox", merchantId: "m1", name: "Amoxicillin 500mg", priceUsd: 6.2, isDraft: false, outOfStockUntil: null, rxRequired: true };
const LINE = { id: "line1", dishId: "out", nameSnapshot: "Flucloxacillin 250mg", priceUsd: 5, quantity: 1, available: true, rxRequired: true };

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    customerId: "c1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    merchantPaymentMethod: "cash",
    outOfStockPref: null,
    autoAccepted: false,
    kitchenConfirmedAt: new Date(),
    deliveryFee: 2,
    merchantGoodsTotal: 6,
    merchantDeliveryShare: null,
    merchantItems: [LINE],
    merchant: { name: "Avondale Pharmacy", busyMode: false },
    ...over,
  };
}

function build(opts: { prescription: { status: string } | null; round?: unknown; pharmacist?: boolean }) {
  const createdItems: Array<Record<string, unknown>> = [];
  const rounds: Array<Record<string, unknown>> = [];
  const tx: Record<string, unknown> = {
    $queryRaw: async () => [],
    merchantMember: {
      findFirst: async () => ({ merchantId: "m1", role: "owner", merchant: { businessType: "shop" } }),
      // The proposer's own team row (MJ-H4: only a pharmacist may swap in an Rx item). Default: a pharmacist.
      findUnique: async () => ({ isPharmacist: opts.pharmacist ?? true }),
    },
    order: { findFirst: async () => order(), updateMany: async () => ({ count: 1 }) },
    orderPrescription: { findUnique: async () => opts.prescription },
    merchantDish: {
      findMany: async ({ where }: { where: { id: { in: string[] }; rxRequired?: boolean } }) =>
        [PARACETAMOL, AMOXICILLIN].filter((d) => where.id.in.includes(d.id) && (where.rxRequired === undefined || d.rxRequired === where.rxRequired)),
    },
    merchantOrderSubstitution: {
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => (rounds.push(data), { id: "r1" }),
      findFirst: async () => opts.round ?? null,
      update: async () => ({}),
    },
    merchantOrderSubstitutionLine: { update: async () => ({}) },
    merchantOrderItem: {
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => (createdItems.push(data), { id: `new-${createdItems.length}` }),
    },
    orderEvent: { create: async () => ({}) },
  };
  tx.$transaction = async (fn: (t: unknown) => unknown) => fn(tx);
  const notifications = { notifyProfiles: async () => {} } as unknown as NotificationsService;
  const gateway = { emitFoodQueueChanged: () => {}, emitOrderStatus: () => {} } as unknown as TrackingGateway;
  const svc = new OrderSubstitutionService(tx as unknown as PrismaService, notifications, gateway);
  return { svc, createdItems, rounds };
}

const swapTo = (dishId: string) => ({ lines: [{ action: "swap" as const, itemId: "line1", dishId }] });

describe("OrderSubstitutionService — swapping in a 'Prescription needed' item (MJ-H4)", () => {
  it("refuses a swap to an Rx item while the order has no approved prescription", async () => {
    for (const prescription of [null, { status: "pending" }, { status: "declined" }]) {
      const { svc, rounds } = build({ prescription });
      await expect(svc.propose("owner-1", "o1", swapTo("amox"))).rejects.toMatchObject({ status: 409, response: { reason: "rx_swap_needs_prescription" } });
      expect(rounds).toHaveLength(0);
    }
  });

  it("refuses a swap to an Rx item proposed by a team member who isn't a pharmacist, even on an approved prescription", async () => {
    const { svc, rounds } = build({ prescription: { status: "approved" }, pharmacist: false });
    await expect(svc.propose("cashier-1", "o1", swapTo("amox"))).rejects.toMatchObject({ status: 409, response: { reason: "rx_swap_needs_pharmacist" } });
    expect(rounds).toHaveLength(0);
  });

  it("a pharmacist may on an approved prescription, and the line records it; an OTC swap never asks", async () => {
    const approved = build({ prescription: { status: "approved" } });
    await approved.svc.propose("pharmacist-1", "o1", swapTo("amox"));
    expect(approved.rounds).toHaveLength(1);
    const rxLines = (approved.rounds[0]!.lines as { create: Array<Record<string, unknown>> }).create;
    expect(rxLines[0]).toMatchObject({ swapDishId: "amox", swapRxRequired: true });
    const otc = build({ prescription: null, pharmacist: false });
    await otc.svc.propose("cashier-1", "o1", swapTo("otc"));
    expect(otc.rounds).toHaveLength(1);
    expect((otc.rounds[0]!.lines as { create: Array<Record<string, unknown>> }).create[0]).not.toHaveProperty("swapRxRequired");
  });

  it("an accepted swap lands as an rxRequired line from what the line RECORDED, not the dish as it reads now", async () => {
    const round = (dishId: string, swapRxRequired: boolean) => ({
      id: "r1",
      status: "open",
      deadlineAt: new Date(Date.now() + 60_000),
      lines: [{ id: "sl1", action: "swap", orderItemId: "line1", nameSnapshot: LINE.nameSnapshot, priceUsd: 5, fromQuantity: 1, swapDishId: dishId, swapNameSnapshot: "x", swapPriceUsd: 6.2, swapQuantity: 1, swapRxRequired }],
    });
    // Recorded as Rx at propose; the dish has since been edited (here: it now reads OTC) — still Rx.
    const rx = build({ prescription: { status: "approved" }, round: round("otc", true) });
    await rx.svc.confirm("c1", "o1", { roundId: "r1", answers: [{ lineId: "sl1", accept: true }] });
    expect(rx.createdItems[0]).toMatchObject({ dishId: "otc", rxRequired: true });
    const otc = build({ prescription: null, round: round("otc", false) });
    await otc.svc.confirm("c1", "o1", { roundId: "r1", answers: [{ lineId: "sl1", accept: true }] });
    expect(otc.createdItems[0]).toMatchObject({ dishId: "otc" });
    expect(otc.createdItems[0]).not.toHaveProperty("rxRequired");
  });
});
