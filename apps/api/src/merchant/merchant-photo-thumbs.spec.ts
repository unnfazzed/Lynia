import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import type { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";
import { withMembershipShim } from "./testing/membership-shim";

/** D7 (owner 2026-10-07, P04 / MJ-RL20): thumbnails made when a photo key is saved, served as an additive
 *  `thumbUrl` / `coverThumbUrl` / `logoThumbUrl` next to the full photo. */

const photo = () => sharp({ create: { width: 1600, height: 1600, channels: 3, background: "#aa5522" } }).jpeg().toBuffer();

function storageWith(objects: Map<string, Buffer>, over: Record<string, unknown> = {}) {
  return {
    createReadUrl: async (key: string) => `https://signed.example/${key}`,
    readObject: vi.fn(async (key: string) => objects.get(key) ?? null),
    writeObject: vi.fn(async (key: string, body: Buffer) => void objects.set(key, body)),
    ...over,
  };
}

function svc(prisma: Record<string, unknown>, storage: Record<string, unknown>) {
  // The caller owns "m1" (the membership shim derives that from merchant.findUnique).
  const merchant = (prisma.merchant ?? {}) as Record<string, unknown>;
  prisma.merchant = { findUnique: async () => ({ id: "m1" }), ...merchant };
  const p = withMembershipShim({ $transaction: async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg), ...prisma });
  const verify = vi.fn(async () => ({}));
  return new MerchantService(p as unknown as PrismaService, storage as never, undefined, undefined, undefined, { verify } as unknown as UploadVerifier);
}

const dishRow = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  categoryId: "c1",
  merchantId: "m1",
  name: "Sadza",
  description: null,
  priceUsd: 5,
  photoUrl: null,
  photoThumbKey: null,
  isDraft: true,
  outOfStockUntil: null,
  sortOrder: 0,
  ...over,
});

const merchantRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "Gava",
  ownerProfile: { phone: null },
  description: null,
  coverPhotoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg",
  logoUrl: null,
  coverThumbKey: null,
  logoThumbKey: null,
  cuisineTags: [],
  priceLevel: 2,
  hours: null,
  location: null,
  cashRule: "collect_and_return",
  busyMode: false,
  pilotEnabled: true,
  foodRatingAvg: 0,
  foodRatingCount: 0,
  prepBaselineMinutes: null,
  ...over,
});

describe("D7 thumbnails on save", () => {
  it("createDish makes the thumb from the stored photo and records it; the response carries thumbUrl", async () => {
    const objects = new Map([["dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", await photo()]]);
    const storage = storageWith(objects);
    let created: Record<string, unknown> = {};
    const s = svc(
      {
        merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
        merchantDish: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created = data;
            return dishRow(data);
          },
        },
      },
      storage,
    );
    const res = await s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5, photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg" });
    expect(created).toMatchObject({ photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", photoThumbKey: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg", isDraft: false });
    expect((await sharp(objects.get("dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg")!).metadata()).width).toBe(400);
    expect(res).toMatchObject({ photoUrl: "https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", thumbUrl: "https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg" });
  });

  it("a thumb that cannot be made never fails the save: the dish saves with its photo and no thumbUrl", async () => {
    const broken = storageWith(new Map(), { readObject: vi.fn(async () => Promise.reject(new Error("GCS 503"))) });
    let created: Record<string, unknown> = {};
    let updated: Record<string, unknown> = {};
    const s = svc(
      {
        merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
        merchantDish: {
          findFirst: async () => dishRow({ photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000d.jpg", photoThumbKey: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000d.jpg.thumb.jpg", isDraft: false }),
          create: async ({ data }: { data: Record<string, unknown> }) => ((created = data), dishRow(data)),
          update: async ({ data }: { data: Record<string, unknown> }) => ((updated = data), dishRow({ ...data })),
        },
      },
      broken,
    );
    const res = await s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5, photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg" });
    expect(created.photoUrl).toBe("dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg");
    expect(created).not.toHaveProperty("photoThumbKey");
    expect(res.photoUrl).toBe("https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg");
    expect(res).not.toHaveProperty("thumbUrl");

    // A NEW photo whose thumb fails clears the old photo's thumb key rather than leaving it behind.
    await s.updateDish("p1", "d1", { photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000b.jpg" });
    expect(updated).toMatchObject({ photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000b.jpg", photoThumbKey: null, isDraft: false });
  });

  it("re-saving the same photo makes no new thumb; a profile save thumbs only the photo that changed", async () => {
    const objects = new Map([["banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg", await photo()]]);
    const storage = storageWith(objects);
    let dishData: Record<string, unknown> = {};
    let profileData: Record<string, unknown> = {};
    const s = svc(
      {
        merchant: {
          findUnique: async () => merchantRow(),
          update: async ({ data }: { data: Record<string, unknown> }) => ((profileData = data), merchantRow(data)),
        },
        merchantDish: {
          findFirst: async () => dishRow({ photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", isDraft: false }),
          update: async ({ data }: { data: Record<string, unknown> }) => ((dishData = data), dishRow({ photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg" })),
        },
      },
      storage,
    );
    await s.updateDish("p1", "d1", { photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", name: "Sadza 2" });
    expect(dishData).not.toHaveProperty("photoThumbKey");
    await s.updateProfile("p1", { coverPhotoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg", logoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg" });
    expect(profileData).toMatchObject({ logoThumbKey: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg.thumb.jpg" });
    expect(profileData).not.toHaveProperty("coverThumbKey");
    expect(storage.readObject.mock.calls.map((c) => c[0])).toEqual(["banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg"]);
  });
});

describe("D7 thumbnails on reads", () => {
  const readStorage = storageWith(new Map());

  it("the customer list, menu and search carry signed thumb URLs next to the full photos", async () => {
    const thumbed = merchantRow({
      coverPhotoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg",
      coverThumbKey: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg.thumb.jpg",
      logoUrl: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg",
      logoThumbKey: "banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg.thumb.jpg",
    });
    const dish = { id: "d1", name: "Peri", description: null, priceUsd: 8, photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", photoThumbKey: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg", outOfStockUntil: null, merchantId: "m1" };
    const s = svc(
      {
        merchant: {
          // The search's pilot-name join selects id + name; every other read takes the whole row.
          findMany: async (args: { select?: unknown }) => (args.select ? [{ id: "m1", name: "Gava" }] : [thumbed]),
          findFirst: async () => thumbed,
        },
        merchantCategory: { findMany: async () => [{ id: "c1", name: "Mains", dishes: [dish] }] },
        merchantDish: { findMany: async () => [dish] },
        merchantOrderItem: { groupBy: async () => [] },
      },
      readStorage,
    );
    const list = await s.listRestaurants();
    expect(list.restaurants[0]).toMatchObject({
      coverPhotoUrl: "https://signed.example/banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg",
      coverThumbUrl: "https://signed.example/banner/p1/aaaaaaaa-0000-4000-8000-00000000000e.jpg.thumb.jpg",
      logoThumbUrl: "https://signed.example/banner/p1/aaaaaaaa-0000-4000-8000-00000000000f.jpg.thumb.jpg",
    });
    const menu = await s.getRestaurantMenu("m1");
    expect(menu.categories[0]!.dishes[0]).toMatchObject({
      photoUrl: "https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg",
      thumbUrl: "https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg",
    });
    const search = await s.searchRestaurants("peri");
    expect(search.dishes[0]).toMatchObject({ thumbUrl: "https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg" });
  });

  it("the merchant's dish list carries thumbUrl; no thumb or a stale one sends no thumbUrl at all", async () => {
    const s = svc(
      {
        merchantDish: {
          findMany: async () => [
            dishRow({ id: "d1", photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg", photoThumbKey: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg", isDraft: false }),
            dishRow({ id: "d2", photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000b.jpg", photoThumbKey: null, isDraft: false }),
            // The photo changed and its thumb failed: the old thumb is never served for the new photo.
            dishRow({ id: "d3", photoUrl: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000c.jpg", photoThumbKey: "dish/p1/aaaaaaaa-0000-4000-8000-00000000000d.jpg.thumb.jpg", isDraft: false }),
          ],
        },
      },
      readStorage,
    );
    const [a, b, c] = await s.listDishes("p1");
    expect(a!.thumbUrl).toBe("https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000a.jpg.thumb.jpg");
    expect(b).not.toHaveProperty("thumbUrl");
    expect(c).not.toHaveProperty("thumbUrl");
    expect(c!.photoUrl).toBe("https://signed.example/dish/p1/aaaaaaaa-0000-4000-8000-00000000000c.jpg");
  });
});
