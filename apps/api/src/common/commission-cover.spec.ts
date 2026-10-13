import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { assertRiderCoversCommission, jobCommission, liveCommissionRatePct, ridersWhoCoverCommission } from "./commission-cover";

type Delivered = { orderType: string; agreedFare?: number; suggestedFare?: number; deliveryFee?: number };

/** A db stub holding each rider's completed-job count and wallet balance (no row = never topped up), plus
 *  any jobs they have `delivered` but not yet closed. */
function db(riders: Record<string, { tripsCount: number; balance?: number; delivered?: Delivered[] }>) {
  return {
    order: {
      findMany: vi.fn(async ({ where }: { where: { riderId: { in: string[] }; status: string } }) =>
        where.status !== "delivered"
          ? []
          : where.riderId.in.flatMap((id) => (riders[id]?.delivered ?? []).map((o) => ({ riderId: id, agreedFare: null, suggestedFare: null, deliveryFee: null, ...o }))),
      ),
    },
    rider: {
      findMany: vi.fn(async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.filter((id) => riders[id]).map((id) => ({ profileId: id, tripsCount: riders[id]!.tripsCount })),
      ),
    },
    commissionAccount: {
      findMany: vi.fn(async ({ where }: { where: { riderId: { in: string[] } } }) =>
        where.riderId.in.filter((id) => riders[id]?.balance != null).map((id) => ({ riderId: id, balance: riders[id]!.balance })),
      ),
    },
  } as unknown as PrismaService & { rider: { findMany: ReturnType<typeof vi.fn> }; order: { findMany: ReturnType<typeof vi.fn> } };
}

describe("jobCommission (owner 2026-10-12: 10% of the biker's fare on every job)", () => {
  it("a parcel pays 10% of its agreed fare, floored at half the suggested fare (WD-012)", () => {
    expect(jobCommission({ orderType: "parcel", agreedFare: 4, suggestedFare: 4 }, 10)).toBe(0.4);
    expect(jobCommission({ orderType: "parcel", agreedFare: 1, suggestedFare: 10 }, 10)).toBe(0.5);
  });
  it("a restaurant / shop / pharmacy job pays 10% of its delivery fee, never the goods total", () => {
    expect(jobCommission({ orderType: "merchant", agreedFare: 25, deliveryFee: 3 }, 10)).toBe(0.3);
  });
  it("is 0 when the basis is missing or commission is off", () => {
    expect(jobCommission({ orderType: "merchant", agreedFare: 25, deliveryFee: null }, 10)).toBe(0);
    expect(jobCommission({ orderType: "parcel", agreedFare: 4 }, 0)).toBe(0);
  });
});

describe("ridersWhoCoverCommission — a biker can't take a job whose commission is more than their balance", () => {
  it("lets through a biker whose balance covers the commission (equal is enough), and drops one it doesn't", async () => {
    const ok = await ridersWhoCoverCommission(db({ a: { tripsCount: 40, balance: 0.4 }, b: { tripsCount: 40, balance: 0.39 } }), ["a", "b"], 0.4, 10);
    expect([...ok]).toEqual(["a"]);
  });
  it("a never-topped-up biker reads $0 — refused once their free jobs are used", async () => {
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 10 } }), ["a"], 0.3, 10)).has("a")).toBe(false);
  });
  it("the first 10 jobs are free: a biker with 0–9 completed jobs takes any job at $0", async () => {
    const ok = await ridersWhoCoverCommission(db({ new: { tripsCount: 0 }, tenth: { tripsCount: 9 } }), ["new", "tenth"], 5, 10);
    expect(ok).toEqual(new Set(["new", "tenth"]));
  });
  it("checks each biker against their own figure (a parcel's commission follows the biker's own fare)", async () => {
    const ok = await ridersWhoCoverCommission(
      db({ cheap: { tripsCount: 40, balance: 0.3 }, dear: { tripsCount: 40, balance: 0.3 } }),
      ["cheap", "dear"],
      (id) => (id === "cheap" ? 0.3 : 0.6),
      10,
    );
    expect([...ok]).toEqual(["cheap"]);
  });
  it("counts the commission still owed on delivered-but-not-closed jobs against the balance", async () => {
    // $1 balance, two delivered parcels at $4 (0.40 each) not yet closed → $0.20 left: a $0.40 job is refused.
    const two = [{ orderType: "parcel", agreedFare: 4, suggestedFare: 4 }, { orderType: "parcel", agreedFare: 4, suggestedFare: 4 }];
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 40, balance: 1, delivered: two } }), ["a"], 0.4, 10)).has("a")).toBe(false);
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 40, balance: 1.2, delivered: two } }), ["a"], 0.4, 10)).has("a")).toBe(true);
  });
  it("delivered-but-not-closed jobs use up the free first jobs", async () => {
    // 8 completed + 2 delivered = the 10 free jobs are spoken for; the next job needs the balance.
    const two = [{ orderType: "merchant", deliveryFee: 3 }, { orderType: "merchant", deliveryFee: 3 }];
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 8, delivered: two } }), ["a"], 0.3, 10)).has("a")).toBe(false);
    // 7 completed + 2 delivered: one free job is still left, and neither pending job is charged.
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 7, delivered: two } }), ["a"], 0.3, 10)).has("a")).toBe(true);
    // 9 completed + 2 delivered: one pending job falls past the allowance and is owed ($0.30 of $0.50).
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 9, balance: 0.5, delivered: two } }), ["a"], 0.3, 10)).has("a")).toBe(false);
    expect((await ridersWhoCoverCommission(db({ a: { tripsCount: 9, balance: 0.6, delivered: two } }), ["a"], 0.3, 10)).has("a")).toBe(true);
  });
  it("reads every biker's delivered jobs in one query", async () => {
    const d = db({ a: { tripsCount: 40, balance: 1 }, b: { tripsCount: 40, balance: 1 } });
    await ridersWhoCoverCommission(d, ["a", "b"], 0.3, 10);
    expect(d.order.findMany).toHaveBeenCalledTimes(1);
  });
  it("reads nothing and lets everyone through while commission is off", async () => {
    const d = db({});
    expect(await ridersWhoCoverCommission(d, ["a"], 5, 0)).toEqual(new Set(["a"]));
    expect(d.rider.findMany).not.toHaveBeenCalled();
  });
});

describe("assertRiderCoversCommission", () => {
  it("throws the commission_low_balance refusal (with a 'top up' message older apps key off)", async () => {
    await expect(assertRiderCoversCommission(db({ a: { tripsCount: 40, balance: 0 } }), "a", 0.3, 10)).rejects.toMatchObject({
      response: { reason: "commission_low_balance", message: expect.stringMatching(/top up/i), commission: 0.3 },
    });
  });
  it("passes when the balance covers it", async () => {
    await expect(assertRiderCoversCommission(db({ a: { tripsCount: 40, balance: 1 } }), "a", 0.3, 10)).resolves.toBeUndefined();
  });
});

describe("liveCommissionRatePct", () => {
  it("reads COMMISSION_RATE_PCT through the shared resolver, defaulting to 10%", () => {
    vi.stubEnv("COMMISSION_RATE_PCT", "");
    expect(liveCommissionRatePct()).toBe(10);
    vi.stubEnv("COMMISSION_RATE_PCT", "0");
    expect(liveCommissionRatePct()).toBe(0);
    vi.unstubAllEnvs();
  });
});
