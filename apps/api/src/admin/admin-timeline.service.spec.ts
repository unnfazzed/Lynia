import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { decodeCursor } from "./admin-read.shared";
import { AdminTimelineService, eventLine, merge, orderLine } from "./admin-timeline.service";

const RIDER = "11111111-1111-4111-8111-111111111111";
const ORDER = "a1b2c3d4-1111-4111-8111-111111111111";
const dec = (v: string) => ({ toString: () => v }) as never;

const order = {
  id: ORDER,
  orderType: "parcel",
  status: "cancelled",
  proposedFare: dec("5"),
  agreedFare: dec("4.5"),
  createdAt: new Date("2026-10-13T08:00:00Z"),
  assignedAt: new Date("2026-10-13T08:05:00Z"),
  deliveredAt: null,
  cancelledAt: new Date("2026-10-13T08:20:00Z"),
  cancelledByRole: "rider",
  cancelStage: "before_pickup",
  undeliveredAt: null,
  undeliveredReason: null,
  updatedAt: new Date("2026-10-13T08:20:00Z"),
  merchant: null,
};

describe("timeline lines (console v2 §4)", () => {
  it("writes one short line per order milestone, from the person's side, in biker wording", () => {
    expect(orderLine(order, "created", "customer")).toMatchObject({ kind: "order", line: "Sent a parcel · $5.00", ref: { label: "#a1b2c3", href: `/orders/${ORDER}` } });
    expect(orderLine(order, "assigned", "rider").line).toBe("Took the job · $4.50");
    expect(orderLine(order, "assigned", "customer").line).toBe("A biker took the order");
    expect(orderLine(order, "cancelled", "customer")).toMatchObject({ line: "Cancelled · by biker · before pickup", tone: "mut" });
    expect(orderLine({ ...order, orderType: "merchant", merchant: { name: "Chicken Inn" } }, "created", "customer").line).toBe("Ordered from Chicken Inn");
    expect(orderLine(order, "expired", "customer")).toMatchObject({ line: "Expired, no biker took it", tone: "bad" });
  });

  it("writes event lines and skips types it doesn't show", () => {
    expect(eventLine({ type: "rider.offline", data: { reason: "reliability_hold" }, orderId: null })).toMatchObject({ line: "Went offline · reliability hold", tone: "bad" });
    expect(eventLine({ type: "rider.offline", data: { reason: "manual" }, orderId: null })?.line).toBe("Went offline");
    expect(eventLine({ type: "rider.onboarding_step", data: { step: "first_job" }, orderId: ORDER })).toMatchObject({ line: "First job done", ref: { label: "#a1b2c3" } });
    expect(eventLine({ type: "kyc.attempt", data: { decision: "failed", reason: "document_expired", resolvedBy: "admin" }, orderId: null })).toMatchObject({
      kind: "kyc",
      line: "ID check failed · document expired · by ops",
      tone: "bad",
    });
    expect(eventLine({ type: "order.fare_raise", data: { from: 4, to: 5 }, orderId: ORDER })?.line).toBe("Raised the fare $4.00 → $5.00");
    expect(eventLine({ type: "merchant.phase", data: { phase: "reject" }, orderId: ORDER })).toMatchObject({ line: "Rejected the order", tone: "bad" });
    expect(eventLine({ type: "merchant.availability", data: { change: "busy_on" }, orderId: null })?.line).toBe("Turned on busy");
    expect(eventLine({ type: "menu.stock", data: { outOfStock: true }, orderId: null, dishName: "Sadza" })?.line).toBe("Sadza out of stock");
    expect(eventLine({ type: "offer.bid", data: {}, orderId: ORDER })).toBeNull();
  });
});

function r(key: string, iso: string, extra: Record<string, unknown> = {}) {
  return { key, at: iso, atDate: new Date(iso), kind: "event" as const, line: key, tone: "" as const, ref: null, by: null, ...extra };
}

describe("merge", () => {
  it("pages a union exactly: newest first, no row skipped or repeated", () => {
    const a = [r("a:3", "2026-10-13T10:00:00Z"), r("a:1", "2026-10-13T07:00:00Z")];
    const b = [r("e:2", "2026-10-13T09:00:00Z"), r("e:0", "2026-10-13T06:00:00Z")];
    const p1 = merge([a, b], null, 2);
    expect(p1.rows.map((x) => x.key)).toEqual(["a:3", "e:2"]);
    const c = decodeCursor(p1.nextCursor);
    const p2 = merge([a, b], c, 2);
    expect(p2.rows.map((x) => x.key)).toEqual(["a:1", "e:0"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("hides an event that duplicates the audit row written with it", () => {
    const rows = [
      r("a:1", "2026-10-13T10:00:01Z", { kind: "audit", dupe: "kyc" }),
      r("e:1", "2026-10-13T10:00:00Z", { kind: "kyc", dupe: "kyc" }),
      r("e:2", "2026-10-12T10:00:00Z", { kind: "kyc", dupe: "kyc" }),
    ];
    expect(merge([rows], null).rows.map((x) => x.key)).toEqual(["a:1", "e:2"]);
  });
});

describe("AdminTimelineService.personTimeline", () => {
  function fake(isRider: boolean) {
    const seen: string[] = [];
    const list = (name: string, out: unknown[] = []) => async () => {
      seen.push(name);
      return out;
    };
    const prisma = {
      profile: {
        findUnique: async () => ({ id: RIDER, rider: isRider ? { profileId: RIDER } : null }),
        findMany: async () => [{ id: "55555555-5555-4555-8555-555555555555", firstName: "Ops", lastName: "Admin", role: "admin", rider: null }],
      },
      auditLog: {
        findMany: list("audit", [
          { id: "a1", actor: "55555555-5555-4555-8555-555555555555", action: "rider.suspend", reasonCode: "safety_report", note: null, amount: null, createdAt: new Date("2026-10-13T11:00:00Z") },
        ]),
      },
      domainEvent: { findMany: list("events", [{ id: "e1", type: "rider.online", data: null, orderId: null, createdAt: new Date("2026-10-13T07:00:00Z") }]) },
      order: { findMany: async () => (seen.push("order"), [order]) },
      topUp: { findMany: list("topups", [{ id: "t1", rail: "ecocash", amount: dec("5"), status: "declined", declineReason: "insufficient_funds", initiatedAt: new Date("2026-10-13T06:00:00Z") }]) },
      commissionLedger: { findMany: list("ledger", [{ id: "l1", type: "ride_commission", amount: dec("-0.45"), balanceAfter: dec("4.55"), orderId: ORDER, createdAt: new Date("2026-10-13T08:30:00Z") }]) },
      $queryRaw: list("raw"),
    };
    return { prisma: prisma as unknown as PrismaService, seen };
  }

  it("a biker's timeline merges jobs, events, audit, top-ups and the ledger", async () => {
    const { prisma, seen } = fake(true);
    const view = await new AdminTimelineService(prisma).personTimeline(RIDER);
    expect(seen).not.toContain("raw");
    expect(view!.rows.map((x) => [x.kind, x.line])).toEqual([
      ["audit", "Suspended · safety report"],
      ["wallet", "Commission −$0.45 · balance $4.55"],
      ["order", "Cancelled · by biker · before pickup"],
      ["order", "Took the job · $4.50"],
      ["event", "Went online"],
      ["topup", "Top-up $5.00 · EcoCash · declined · insufficient funds"],
    ]);
    expect(view!.rows[0]!.by).toBe("Ops Admin");
    expect(view!.nextCursor).toBeNull();
  });

  it("a customer's timeline reads their orders and fare raises, not wallet rows", async () => {
    const { prisma, seen } = fake(false);
    const view = await new AdminTimelineService(prisma).personTimeline(RIDER);
    expect(seen).toContain("raw");
    expect(seen).not.toContain("topups");
    expect(seen).not.toContain("ledger");
    expect(view!.rows.map((x) => x.line)).toContain("Sent a parcel · $5.00");
  });

  it("is null for an unknown profile", async () => {
    const prisma = { profile: { findUnique: async () => null } } as unknown as PrismaService;
    expect(await new AdminTimelineService(prisma).personTimeline(RIDER)).toBeNull();
  });
});
