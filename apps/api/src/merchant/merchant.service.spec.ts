import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";

/** Mirrors the shared mock shape used across the repo's other *.service.spec.ts files (e.g.
 *  rider.service.spec.ts): a plain object standing in for PrismaService, with a default
 *  $transaction that runs a callback against itself or no-ops an array (side-effect-only, matching
 *  how becomeMerchant/becomeRider actually use the array form — never destructuring its result). */
function svc(prisma: Partial<Record<string, unknown>>) {
  const p = prisma as Record<string, unknown>;
  if (!p.$transaction) {
    p.$transaction = async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(p) : arg;
  }
  return new MerchantService(p as unknown as PrismaService);
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

describe("MerchantService.becomeMerchant", () => {
  it("409s with a stable reason if the profile is already a merchant", async () => {
    const s = svc({ merchant: { findUnique: async () => ({ id: "m1" }) } });
    await expect(s.becomeMerchant("p1", { name: "Nandos" })).rejects.toMatchObject({
      response: { reason: "already_merchant" },
    });
  });

  /** findUnique is called twice by becomeMerchant: once as the pre-check (must miss), once as the
   *  post-transaction re-read (must hit) — a call counter distinguishes the two without needing a
   *  real DB's read-your-writes. */
  function becomeMerchantMock() {
    let profileUpdated: unknown;
    let merchantCreated: { name: string; ownerProfileId: string; cashRule?: string } | undefined;
    let findUniqueCalls = 0;
    const s = svc({
      merchant: {
        findUnique: async () => {
          findUniqueCalls += 1;
          if (findUniqueCalls === 1) return null;
          return {
            id: "m1",
            name: merchantCreated!.name,
            ownerProfile: { phone: "+263771234567" },
            description: null,
            coverPhotoUrl: null,
            logoUrl: null,
            cuisineTags: [],
            priceLevel: null,
            hours: null,
            cashRule: merchantCreated!.cashRule ?? "collect_and_return",
            busyMode: false,
            pilotEnabled: false,
          };
        },
        create: async ({ data }: { data: typeof merchantCreated }) => {
          merchantCreated = data;
          return { id: "m1" };
        },
      },
      profile: { update: async ({ data }: { data: unknown }) => (profileUpdated = data) },
    });
    return { s, getProfileUpdated: () => profileUpdated, getMerchantCreated: () => merchantCreated };
  }

  it("upgrades the profile role and creates the Merchant row, then returns the fresh profile", async () => {
    const { s, getProfileUpdated, getMerchantCreated } = becomeMerchantMock();
    const res = await s.becomeMerchant("p1", { name: "Nandos" });
    expect(getProfileUpdated()).toEqual({ role: "merchant" });
    expect(getMerchantCreated()).toMatchObject({ name: "Nandos", ownerProfileId: "p1", cashRule: "collect_and_return" });
    expect(res.name).toBe("Nandos");
    expect(res.ownerPhoneMasked).toBe("+263•••••4567");
    expect(res.cashRule).toBe("collect_and_return");
  });

  it("defaults cashRule to collect_and_return when omitted, honors an explicit pay_upfront", async () => {
    const { s, getMerchantCreated } = becomeMerchantMock();
    await s.becomeMerchant("p1", { name: "Nandos", cashRule: "pay_upfront" });
    expect(getMerchantCreated()?.cashRule).toBe("pay_upfront");
  });

  it("maps a concurrent-duplicate P2002 to the same already_merchant conflict", async () => {
    const s = svc({
      merchant: { findUnique: async () => null, create: async () => ({ id: "m1" }) },
      profile: { update: async () => ({}) },
      $transaction: async () => {
        throw p2002();
      },
    });
    await expect(s.becomeMerchant("p1", { name: "Nandos" })).rejects.toMatchObject({
      response: { reason: "already_merchant" },
    });
  });
});

describe("MerchantService profile self-service", () => {
  it("getMyMerchant 404s a non-merchant caller", async () => {
    const s = svc({ merchant: { findUnique: async () => null } });
    await expect(s.getMyMerchant("p1")).rejects.toThrow(/not found/i);
  });

  it("updateProfile only writes the fields provided", async () => {
    let receivedData: unknown;
    const s = svc({
      merchant: {
        findUnique: async () => ({ id: "m1" }),
        update: async ({ data }: { data: unknown }) => {
          receivedData = data;
          return {
            id: "m1",
            name: "New Name",
            ownerProfile: { phone: null },
            description: null,
            coverPhotoUrl: null,
            logoUrl: null,
            cuisineTags: [],
            priceLevel: null,
            hours: null,
            cashRule: "collect_and_return",
            busyMode: false,
            pilotEnabled: false,
          };
        },
      },
    });
    const res = await s.updateProfile("p1", { name: "New Name" });
    expect(receivedData).toEqual({ name: "New Name" });
    expect(res.name).toBe("New Name");
  });

  it("setBusyMode toggles the plain boolean", async () => {
    let receivedData: unknown;
    const s = svc({
      merchant: {
        findUnique: async () => ({ id: "m1" }),
        update: async ({ data }: { data: unknown }) => {
          receivedData = data;
          return {
            id: "m1",
            name: "Shop",
            ownerProfile: null,
            description: null,
            coverPhotoUrl: null,
            logoUrl: null,
            cuisineTags: [],
            priceLevel: null,
            hours: null,
            cashRule: "collect_and_return",
            busyMode: true,
            pilotEnabled: false,
          };
        },
      },
    });
    const res = await s.setBusyMode("p1", { active: true });
    expect(receivedData).toEqual({ busyMode: true });
    expect(res.busy).toBe(true);
  });
});

describe("MerchantService categories (D-29)", () => {
  it("rejects a half-specified availability window", async () => {
    const s = svc({ merchant: { findUnique: async () => ({ id: "m1" }) } });
    await expect(s.createCategory("p1", { name: "Breakfast", availableFrom: "07:00" })).rejects.toThrow(
      /must be set together/i,
    );
  });

  it("deletes an empty category", async () => {
    let deletedId: string | undefined;
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: {
        findFirst: async () => ({ id: "c1", merchantId: "m1", _count: { dishes: 0 } }),
        delete: async ({ where }: { where: { id: string } }) => {
          deletedId = where.id;
        },
      },
    });
    const res = await s.deleteCategory("p1", "c1");
    expect(res).toEqual({ ok: true });
    expect(deletedId).toBe("c1");
  });

  it("refuses to delete a non-empty category", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1", _count: { dishes: 2 } }) },
    });
    await expect(s.deleteCategory("p1", "c1")).rejects.toThrow(/remove all dishes/i);
  });

  it("404s a category id that belongs to another merchant", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => null },
    });
    await expect(s.deleteCategory("p1", "someone-elses-category")).rejects.toThrow(/not found/i);
  });
});

describe("MerchantService dishes (D-31 draft state, N-14 OOS)", () => {
  it("a dish saved without a photo is created as a draft", async () => {
    let created: { isDraft?: boolean } = {};
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
      merchantDish: {
        create: async ({ data }: { data: { isDraft?: boolean } }) => {
          created = data;
          return {
            id: "d1",
            categoryId: "c1",
            name: "Sadza",
            description: null,
            priceUsd: 5,
            photoUrl: null,
            isDraft: data.isDraft,
            outOfStockUntil: null,
            sortOrder: 0,
          };
        },
      },
    });
    const res = await s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5 });
    expect(created.isDraft).toBe(true);
    expect(res.isDraft).toBe(true);
  });

  it("a dish saved with a photo is NOT a draft", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
      merchantDish: {
        create: async ({ data }: { data: { isDraft?: boolean; photoUrl?: string } }) => ({
          id: "d1",
          categoryId: "c1",
          name: "Sadza",
          description: null,
          priceUsd: 5,
          photoUrl: data.photoUrl,
          isDraft: data.isDraft,
          outOfStockUntil: null,
          sortOrder: 0,
        }),
      },
    });
    const res = await s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5, photoUrl: "dish/p1/x.jpg" });
    expect(res.isDraft).toBe(false);
  });

  it("404s create against a category owned by another merchant", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => null },
    });
    await expect(s.createDish("p1", { categoryId: "not-mine", name: "Sadza", priceUsd: 5 })).rejects.toThrow(
      /category not found/i,
    );
  });

  it("updateDish: a photo landing clears the draft flag", async () => {
    let receivedData: { isDraft?: boolean; photoUrl?: string } = {};
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1", isDraft: true }),
        update: async ({ data }: { data: typeof receivedData }) => {
          receivedData = data;
          return {
            id: "d1",
            categoryId: "c1",
            name: "Sadza",
            description: null,
            priceUsd: 5,
            photoUrl: data.photoUrl,
            isDraft: data.isDraft,
            outOfStockUntil: null,
            sortOrder: 0,
          };
        },
      },
    });
    const res = await s.updateDish("p1", "d1", { photoUrl: "dish/p1/y.jpg" });
    expect(receivedData.isDraft).toBe(false);
    expect(res.isDraft).toBe(false);
  });

  it("updateDish: omitting photoUrl never re-drafts a dish that already has one", async () => {
    let receivedData: Record<string, unknown> = {};
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1", isDraft: false, photoUrl: "dish/p1/y.jpg" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          receivedData = data;
          return {
            id: "d1",
            categoryId: "c1",
            name: "New name",
            description: null,
            priceUsd: 5,
            photoUrl: "dish/p1/y.jpg",
            isDraft: false,
            outOfStockUntil: null,
            sortOrder: 0,
          };
        },
      },
    });
    const res = await s.updateDish("p1", "d1", { name: "New name" });
    expect(receivedData.isDraft).toBeUndefined();
    expect(receivedData.photoUrl).toBeUndefined();
    expect(res.isDraft).toBe(false);
  });

  it("setDishOutOfStock marks the dish out of stock until end of today (N-14)", async () => {
    let receivedUntil: Date | null | undefined;
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1" }),
        update: async ({ data }: { data: { outOfStockUntil: Date | null } }) => {
          receivedUntil = data.outOfStockUntil;
          return {
            id: "d1",
            categoryId: "c1",
            name: "Sadza",
            description: null,
            priceUsd: 5,
            photoUrl: null,
            isDraft: false,
            outOfStockUntil: data.outOfStockUntil,
            sortOrder: 0,
          };
        },
      },
    });
    const res = await s.setDishOutOfStock("p1", "d1");
    expect(receivedUntil).toBeInstanceOf(Date);
    expect(receivedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(res.outOfStock).toBe(true);
  });

  it("clearDishOutOfStock nulls the field and reports back in stock", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1" }),
        update: async () => ({
          id: "d1",
          categoryId: "c1",
          name: "Sadza",
          description: null,
          priceUsd: 5,
          photoUrl: null,
          isDraft: false,
          outOfStockUntil: null,
          sortOrder: 0,
        }),
      },
    });
    const res = await s.clearDishOutOfStock("p1", "d1");
    expect(res.outOfStock).toBe(false);
  });

  it("a stale outOfStockUntil in the past reads as back in stock (auto-reset, no job)", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1" }),
        update: async () => ({
          id: "d1",
          categoryId: "c1",
          name: "Sadza",
          description: null,
          priceUsd: 5,
          photoUrl: null,
          isDraft: false,
          outOfStockUntil: new Date(Date.now() - 60_000),
          sortOrder: 0,
        }),
      },
    });
    const res = await s.setDishOutOfStock("p1", "d1");
    expect(res.outOfStock).toBe(false);
  });
});

describe("MerchantService customer read API (flag + pilotEnabled allowlist)", () => {
  it("listRestaurants only returns pilotEnabled merchants", async () => {
    let receivedWhere: unknown;
    const s = svc({
      merchant: {
        findMany: async ({ where }: { where: unknown }) => {
          receivedWhere = where;
          return [
            { id: "m1", name: "Nandos", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: { mon: { open: "09:00", close: "21:00" } } },
          ];
        },
      },
    });
    const res = await s.listRestaurants();
    expect(receivedWhere).toEqual({ pilotEnabled: true });
    expect(res.restaurants).toHaveLength(1);
    expect(res.restaurants[0]!.id).toBe("m1");
    // D1 (browse): the raw weekly hours pass through untouched — open/closed is derived client-side.
    expect(res.restaurants[0]!.hours).toEqual({ mon: { open: "09:00", close: "21:00" } });
  });

  it("listRestaurants defaults hours to null when the merchant hasn't set any", async () => {
    const s = svc({
      merchant: {
        findMany: async () => [{ id: "m1", name: "Nandos", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: null }],
      },
    });
    const res = await s.listRestaurants();
    expect(res.restaurants[0]!.hours).toBeNull();
  });

  it("getRestaurantMenu 404s a merchant that isn't pilotEnabled (even if it exists)", async () => {
    const s = svc({ merchant: { findFirst: async () => null } });
    await expect(s.getRestaurantMenu("m1")).rejects.toThrow(/not found/i);
  });

  it("getRestaurantMenu excludes hidden categories and draft dishes, derives outOfStock", async () => {
    const s = svc({
      merchant: {
        findFirst: async () => ({ id: "m1", name: "Nandos", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2 }),
      },
      merchantCategory: {
        findMany: async ({ where, include }: { where: { hidden: boolean }; include: unknown }) => {
          // The service already filters hidden:false in the query; a fake DB just honors the where.
          expect(where.hidden).toBe(false);
          expect(include).toBeTruthy();
          return [
            {
              id: "c1",
              name: "Mains",
              dishes: [
                {
                  id: "d1",
                  name: "Peri Peri",
                  description: null,
                  priceUsd: 8,
                  photoUrl: "dish/x.jpg",
                  outOfStockUntil: null,
                },
              ],
            },
          ];
        },
      },
    });
    const res = await s.getRestaurantMenu("m1");
    expect(res.categories).toHaveLength(1);
    expect(res.categories[0]!.dishes).toHaveLength(1);
    expect(res.categories[0]!.dishes[0]!.outOfStock).toBe(false);
    expect(res.categories[0]!.dishes[0]!.priceUsd).toBe(8);
  });
});
