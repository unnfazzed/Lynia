import { Prisma } from "@prisma/client";
import { RESTAURANTS_COMMISSION } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";

/** Mirrors the shared mock shape used across the repo's other *.service.spec.ts files (e.g.
 *  rider.service.spec.ts): a plain object standing in for PrismaService, with a default
 *  $transaction that runs a callback against itself or no-ops an array (side-effect-only, matching
 *  how becomeMerchant/becomeRider actually use the array form — never destructuring its result). */
/** Default storage stub mints a deterministic, obviously-fake signed URL from the key — real enough
 *  that a test asserting "a photo key produces SOME url" can check it, without any test needing to
 *  hardcode GCS's actual signed-URL shape. */
const defaultStorageStub = { createReadUrl: async (key: string) => `https://signed.example/${key}` };

function svc(prisma: Partial<Record<string, unknown>>, storage: Partial<Record<string, unknown>> = defaultStorageStub) {
  const p = prisma as Record<string, unknown>;
  if (!p.$transaction) {
    p.$transaction = async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(p) : arg;
  }
  return new MerchantService(p as unknown as PrismaService, storage as never);
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

  it("hydrates a stored photo key into a signed read URL (bucket has no public objects)", async () => {
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
          photoUrl: "dish/m1/x.jpg",
          isDraft: false,
          outOfStockUntil: null,
          sortOrder: 0,
        }),
      },
    });
    const res = await s.clearDishOutOfStock("p1", "d1");
    expect(res.photoUrl).toBe("https://signed.example/dish/m1/x.jpg");
  });

  it("a signing failure is swallowed — photoUrl comes back null rather than the request failing", async () => {
    const s = svc(
      {
        merchant: { findUnique: async () => ({ id: "m1" }) },
        merchantDish: {
          findFirst: async () => ({ id: "d1", merchantId: "m1" }),
          update: async () => ({
            id: "d1",
            categoryId: "c1",
            name: "Sadza",
            description: null,
            priceUsd: 5,
            photoUrl: "dish/m1/x.jpg",
            isDraft: false,
            outOfStockUntil: null,
            sortOrder: 0,
          }),
        },
      },
      { createReadUrl: async () => { throw new Error("GCS unavailable"); } },
    );
    const res = await s.clearDishOutOfStock("p1", "d1");
    expect(res.photoUrl).toBeNull();
  });

  it("listDishes returns every dish for the merchant, ordered, with photo keys hydrated", async () => {
    let receivedWhere: unknown;
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findMany: async ({ where }: { where: unknown }) => {
          receivedWhere = where;
          return [
            { id: "d1", categoryId: "c1", name: "Sadza", description: null, priceUsd: 5, photoUrl: "dish/m1/a.jpg", isDraft: false, outOfStockUntil: null, sortOrder: 0 },
            { id: "d2", categoryId: "c1", name: "Chicken", description: null, priceUsd: 6, photoUrl: null, isDraft: true, outOfStockUntil: null, sortOrder: 1 },
          ];
        },
      },
    });
    const res = await s.listDishes("p1");
    expect(receivedWhere).toEqual({ merchantId: "m1" });
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ id: "d1", photoUrl: "https://signed.example/dish/m1/a.jpg" });
    expect(res[1]).toMatchObject({ id: "d2", photoUrl: null, isDraft: true });
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

  it("listRestaurants exposes only the merchant's geo-point (D-17: never the raw contactPhone/landmark on Merchant.location)", async () => {
    const s = svc({
      merchant: {
        findMany: async () => [
          {
            id: "m1",
            name: "Nandos",
            coverPhotoUrl: null,
            logoUrl: null,
            cuisineTags: [],
            priceLevel: 2,
            hours: null,
            location: { point: { lat: -17.82, lng: 31.05 }, landmark: "Corner of X and Y", contactPhone: "+263771234567" },
          },
        ],
      },
    });
    const res = await s.listRestaurants();
    expect(res.restaurants[0]!.location).toEqual({ lat: -17.82, lng: 31.05 });
    expect(JSON.stringify(res.restaurants[0])).not.toContain("771234567");
    expect(JSON.stringify(res.restaurants[0])).not.toContain("Corner of X and Y");
  });

  it("listRestaurants defaults location to null when the merchant hasn't set one", async () => {
    const s = svc({
      merchant: {
        findMany: async () => [{ id: "m1", name: "Nandos", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: null, location: null }],
      },
    });
    const res = await s.listRestaurants();
    expect(res.restaurants[0]!.location).toBeNull();
  });

  it("listRestaurants signs cover/logo keys into read URLs (plan §10 blocker: the media bucket blocks public reads, so a raw GCS key never renders on a customer's phone)", async () => {
    const s = svc({
      merchant: {
        findMany: async () => [
          { id: "m1", name: "Nandos", coverPhotoUrl: "merchant/m1/cover.jpg", logoUrl: "merchant/m1/logo.jpg", cuisineTags: [], priceLevel: 2, hours: null, location: null },
        ],
      },
    });
    const res = await s.listRestaurants();
    expect(res.restaurants[0]!.coverPhotoUrl).toBe("https://signed.example/merchant/m1/cover.jpg");
    expect(res.restaurants[0]!.logoUrl).toBe("https://signed.example/merchant/m1/logo.jpg");
  });

  it("listRestaurants surfaces the #673 rating + prep baseline; an unrated shop shows ratingAvg null (never a fake 0)", async () => {
    const s = svc({
      merchant: {
        findMany: async () => [
          { id: "m1", name: "Rated", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: null, location: null, foodRatingAvg: 4.6, foodRatingCount: 20, prepBaselineMinutes: 18 },
          { id: "m2", name: "Unrated", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: null, location: null, foodRatingAvg: 0, foodRatingCount: 0, prepBaselineMinutes: null },
        ],
      },
    });
    const res = await s.listRestaurants();
    expect(res.restaurants[0]).toMatchObject({ ratingAvg: 4.6, ratingCount: 20, prepBaselineMinutes: 18 });
    // Unrated: no star (null), not a misleading "0"; prep unset falls back client-side.
    expect(res.restaurants[1]).toMatchObject({ ratingAvg: null, ratingCount: 0, prepBaselineMinutes: null });
  });

  it("searchRestaurants returns matching PLACES + cross-restaurant DISHES joined to the pilot name (#673 part b)", async () => {
    const s = svc({
      merchant: {
        findMany: async ({ where }: { where: { name?: unknown } }) =>
          where?.name
            ? // PLACES query (name match)
              [{ id: "m1", name: "Sadza Republic", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: null, location: null, foodRatingAvg: 0, foodRatingCount: 0, prepBaselineMinutes: null }]
            : // pilots list (id + name), for the dish → restaurant-name join
              [{ id: "m1", name: "Sadza Republic" }, { id: "m2", name: "Mbuya's Kitchen" }],
      },
      merchantDish: {
        findMany: async () => [
          { id: "d1", name: "Sadza & beef stew", priceUsd: 4.5, photoUrl: null, merchantId: "m1", description: null, isDraft: false },
          { id: "d2", name: "Sadza & mazondo", priceUsd: 4.0, photoUrl: null, merchantId: "m2", description: null, isDraft: false },
        ],
      },
    });
    const res = await s.searchRestaurants("sadza");
    expect(res.restaurants.map((r) => r.id)).toEqual(["m1"]);
    expect(res.dishes).toEqual([
      { dishId: "d1", name: "Sadza & beef stew", priceUsd: 4.5, photoUrl: null, merchantId: "m1", merchantName: "Sadza Republic" },
      { dishId: "d2", name: "Sadza & mazondo", priceUsd: 4.0, photoUrl: null, merchantId: "m2", merchantName: "Mbuya's Kitchen" },
    ]);
  });

  it("searchRestaurants ignores a blank / 1-char query — never dumps the corridor", async () => {
    let queried = false;
    const s = svc({ merchant: { findMany: async () => { queried = true; return []; } } });
    expect(await s.searchRestaurants("  ")).toEqual({ restaurants: [], dishes: [] });
    expect(await s.searchRestaurants("a")).toEqual({ restaurants: [], dishes: [] });
    expect(queried).toBe(false);
  });

  /** Bare merchant row shape `toListItem` needs — real rows carry more Prisma columns, but the
   *  service only ever reads these off what `findMany` hands back. */
  function merchantRow(id: string) {
    return { id, name: `Kitchen ${id}`, coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: null, hours: null, location: null };
  }

  it("listRestaurants (B-O10): orders by name/id and requests one extra row to detect hasMore", async () => {
    let receivedArgs: Record<string, unknown> | undefined;
    const s = svc({
      merchant: {
        findMany: async (args: Record<string, unknown>) => {
          receivedArgs = args;
          return [merchantRow("m1")];
        },
      },
    });
    await s.listRestaurants();
    expect(receivedArgs).toMatchObject({
      where: { pilotEnabled: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 21, // RESTAURANTS_PAGE_SIZE (20) + 1
    });
    expect(receivedArgs?.cursor).toBeUndefined();
    expect(receivedArgs?.skip).toBeUndefined();
  });

  it("listRestaurants (B-O10) returns nextCursor + trims to one page when more rows exist than the page size", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => merchantRow(`m${i}`));
    const s = svc({ merchant: { findMany: async () => rows } });
    const res = await s.listRestaurants();
    expect(res.restaurants).toHaveLength(20);
    expect(res.restaurants.map((r) => r.id)).toEqual(rows.slice(0, 20).map((r) => r.id));
    expect(res.nextCursor).toBe("m19"); // the last row IN the trimmed page, not the lookahead row
  });

  it("listRestaurants (B-O10) omits nextCursor when the catalog fits in one page", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => merchantRow(`m${i}`));
    const s = svc({ merchant: { findMany: async () => rows } });
    const res = await s.listRestaurants();
    expect(res.restaurants).toHaveLength(5);
    expect(res.nextCursor).toBeUndefined();
  });

  it("listRestaurants (B-O10) passes a given cursor through as {id, skip:1} to resume the next page", async () => {
    let receivedArgs: Record<string, unknown> | undefined;
    const s = svc({
      merchant: {
        findMany: async (args: Record<string, unknown>) => {
          receivedArgs = args;
          return [merchantRow("m20")];
        },
      },
    });
    const res = await s.listRestaurants("m19");
    expect(receivedArgs).toMatchObject({ cursor: { id: "m19" }, skip: 1 });
    expect(res.restaurants[0]!.id).toBe("m20");
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
    // Same signing contract as listRestaurants: customers get a readable URL, never the raw key.
    expect(res.categories[0]!.dishes[0]!.photoUrl).toBe("https://signed.example/dish/x.jpg");
  });
});

describe("MerchantService.getWeeklyStatement (E3, N-13)", () => {
  it("aggregates delivered orders into sales + line items, and sums NO_RIDER cancellations as the cooked-food loss", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findMany: async () => [
          { id: "o1", deliveredAt: new Date("2026-07-29T10:00:00.000Z"), merchantPaymentMethod: "cash", merchantGoodsTotal: 13 },
          { id: "o2", deliveredAt: new Date("2026-07-29T11:00:00.000Z"), merchantPaymentMethod: "wallet", merchantGoodsTotal: 6 },
        ],
        aggregate: async () => ({ _sum: { merchantGoodsTotal: 8 } }),
      },
    });
    const res = await s.getWeeklyStatement("p1");
    expect(res.ordersDelivered).toBe(2);
    expect(res.foodSalesTotal).toBe(19);
    expect(res.commissionRatePct).toBe(RESTAURANTS_COMMISSION.currentRatePct);
    expect(res.commissionCharged).toBe(0);
    expect(res.illustrativeRatePct).toBe(RESTAURANTS_COMMISSION.illustrativeRatePct);
    expect(res.illustrativeCommission).toBeCloseTo(19 * (RESTAURANTS_COMMISSION.illustrativeRatePct / 100), 2);
    expect(res.cookedFoodLossTotal).toBe(8);
    expect(res.lineItems).toHaveLength(2);
    expect(res.lineItems[0]).toMatchObject({ orderId: "o1", paymentMethod: "cash", amount: 13, commission: 0 });
  });

  it("returns zeros with no delivered orders", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findMany: async () => [], aggregate: async () => ({ _sum: { merchantGoodsTotal: null } }) },
    });
    const res = await s.getWeeklyStatement("p1");
    expect(res.ordersDelivered).toBe(0);
    expect(res.foodSalesTotal).toBe(0);
    expect(res.cookedFoodLossTotal).toBe(0);
    expect(res.lineItems).toEqual([]);
  });
});

describe("MerchantService.getTodaySummary (E3, M4·6)", () => {
  it("aggregates today's delivered/rejected counts, wallet + confirmed-cash-return totals, and average prep time", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        count: async ({ where }: { where: { status: string } }) => (where.status === "delivered" ? 5 : 1),
        aggregate: async ({ where }: { where: Record<string, unknown> }) =>
          where.merchantPaymentMethod === "wallet" ? { _sum: { merchantGoodsTotal: 20 } } : { _sum: { debtAmount: 13 } },
        findMany: async () => [
          { readyAt: new Date("2026-07-30T10:20:00.000Z"), prepStartedAt: new Date("2026-07-30T10:00:00.000Z") },
          { readyAt: new Date("2026-07-30T11:10:00.000Z"), prepStartedAt: new Date("2026-07-30T11:00:00.000Z") },
        ],
      },
    });
    const res = await s.getTodaySummary("p1");
    expect(res.delivered).toBe(5);
    expect(res.rejected).toBe(1);
    expect(res.walletTaken).toBe(20);
    expect(res.cashTaken).toBe(13);
    expect(res.averagePrepMinutes).toBe(15);
  });

  it("averagePrepMinutes is null and totals are zero with no activity today", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { merchantGoodsTotal: null, debtAmount: null } }),
        findMany: async () => [],
      },
    });
    const res = await s.getTodaySummary("p1");
    expect(res.averagePrepMinutes).toBeNull();
    expect(res.cashTaken).toBe(0);
    expect(res.walletTaken).toBe(0);
  });
});
