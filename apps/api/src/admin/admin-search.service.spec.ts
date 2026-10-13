import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminSearchService, planSearch } from "./admin-search.service";

const RIDER = "11111111-1111-4111-8111-111111111111";
const ORDER = "a1b2c3d4-1111-4111-8111-111111111111";

type Args = { where?: Record<string, unknown>; take?: number };

function fakePrisma() {
  const calls: Record<string, Args[]> = { profile: [], merchant: [], order: [], topUp: [] };
  const rec = (k: string, out: unknown[]) => async (a: Args) => {
    calls[k]!.push(a);
    return out;
  };
  const prisma = {
    profile: {
      findMany: async (a: Args) => {
        calls.profile!.push(a);
        return a.where && "rider" in a.where
          ? [{ id: RIDER, firstName: "Tendai", lastName: "Moyo", phone: "+263771234567", rider: { kycStatus: "verified" } }]
          : [];
      },
    },
    merchant: { findMany: rec("merchant", [{ id: "m1", name: "Chicken Inn", businessType: "restaurant", pilotEnabled: true }]) },
    order: { findMany: rec("order", [{ id: ORDER, orderType: "parcel", status: "completed", createdAt: new Date(), customer: { firstName: "Rudo", lastName: "Dube" } }]) },
    topUp: {
      findMany: rec("topUp", [
        { id: "t1t1t1t1-0000-4000-8000-000000000000", riderId: RIDER, amount: { toString: () => "5" }, status: "confirmed", rail: "ecocash", providerRef: "123456", rider: { profile: { firstName: "Tendai", lastName: "Moyo" } } },
      ]),
    },
  };
  return { prisma: prisma as unknown as PrismaService, calls };
}

describe("planSearch (console v2 §4)", () => {
  it("normalises every spelling of a ZW number to one E.164 equality", () => {
    for (const q of ["0771234567", "+263 77 123 4567", "263771234567", "771234567"]) {
      expect(planSearch(q).phone, q).toBe("+263771234567");
    }
  });

  it("falls back to a national-digits fragment for a partial number", () => {
    expect(planSearch("0771234")).toMatchObject({ phone: null, phoneFragment: "771234" });
    expect(planSearch("+263 771 234")).toMatchObject({ phone: null, phoneFragment: "771234" });
    // Too few national digits to be worth a scan.
    expect(planSearch("077123").phoneFragment).toBeNull();
    expect(planSearch("tendai").phoneFragment).toBeNull();
  });

  it("reads names as words and short ids as a uuid range", () => {
    expect(planSearch("tendai moyo").words).toEqual(["tendai", "moyo"]);
    expect(planSearch("tendai").idRange).toBeNull();
    expect(planSearch("#a1b2c3").idRange).toEqual({ gte: "a1b2c300-0000-0000-0000-000000000000", lte: "a1b2c3ff-ffff-ffff-ffff-ffffffffffff" });
    // A leading # means an id, never a name.
    expect(planSearch("#a1b2c3").words).toEqual([]);
  });
});

describe("AdminSearchService.search", () => {
  it("runs nothing for a query under 3 characters", async () => {
    const { prisma, calls } = fakePrisma();
    const res = await new AdminSearchService(prisma).search("ab");
    expect(res).toMatchObject({ tooShort: true, total: 0 });
    expect(Object.values(calls).flat()).toHaveLength(0);
  });

  it("matches a phone as an exact equality, bikers and customers apart, capped", async () => {
    const { prisma, calls } = fakePrisma();
    const res = await new AdminSearchService(prisma).search("077 123 4567");
    expect(calls.profile).toHaveLength(2);
    for (const c of calls.profile!) {
      expect(c.take).toBe(8);
      expect(c.where!.OR).toEqual([{ phone: "+263771234567" }]);
    }
    expect(calls.profile![1]!.where).toMatchObject({ role: "customer", NOT: { phone: { startsWith: "business:" } } });
    // A phone is also a merchant owner's. With spaces it is neither an id prefix nor a reference.
    expect(calls.merchant![0]!.where).toEqual({ OR: [{ ownerProfile: { phone: "+263771234567" } }] });
    expect(calls.order).toHaveLength(0);
    expect(calls.topUp).toHaveLength(0);
    expect(res.groups.bikers[0]).toEqual({ id: RIDER, label: "Tendai Moyo", sub: "+263•••••4567 · ID check verified", href: `/riders/${RIDER}` });
    expect(res.total).toBe(2);
  });

  it("matches a short order id by primary-key range and a Paynow reference by equality", async () => {
    const { prisma, calls } = fakePrisma();
    const res = await new AdminSearchService(prisma).search("#a1b2c3");
    expect(calls.order![0]!.where).toEqual({ id: { gte: "a1b2c300-0000-0000-0000-000000000000", lte: "a1b2c3ff-ffff-ffff-ffff-ffffffffffff" } });
    expect(res.groups.orders[0]).toMatchObject({ label: "#a1b2c3", sub: "Parcel · Completed · Rudo Dube", href: `/orders/${ORDER}` });

    const ref = fakePrisma();
    const r2 = await new AdminSearchService(ref.prisma).search("123456");
    expect(ref.calls.topUp![0]!.where).toEqual({ OR: [{ providerRef: "123456" }, { id: { gte: "12345600-0000-0000-0000-000000000000", lte: "123456ff-ffff-ffff-ffff-ffffffffffff" } }] });
    expect(r2.groups.topups[0]).toMatchObject({ sub: "$5.00 · confirmed · 123456 · Tendai Moyo", href: `/riders/${RIDER}` });
  });

  it("matches names word by word, case-insensitively", async () => {
    const { prisma, calls } = fakePrisma();
    await new AdminSearchService(prisma).search("Tendai Mo");
    expect(calls.profile![0]!.where!.OR).toEqual([
      {
        AND: [
          { OR: [{ firstName: { contains: "Tendai", mode: "insensitive" } }, { lastName: { contains: "Tendai", mode: "insensitive" } }] },
          { OR: [{ firstName: { contains: "Mo", mode: "insensitive" } }, { lastName: { contains: "Mo", mode: "insensitive" } }] },
        ],
      },
    ]);
    expect(calls.order).toHaveLength(0);
  });
});
