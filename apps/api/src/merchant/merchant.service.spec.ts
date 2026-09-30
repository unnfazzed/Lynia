import { Prisma } from "@prisma/client";
import { RESTAURANTS_COMMISSION } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService, OUT_OF_STOCK_UNTIL_BACK } from "./merchant.service";
import { withMembershipShim } from "./testing/membership-shim";

/** Mirrors the shared mock shape used across the repo's other *.service.spec.ts files (e.g.
 *  rider.service.spec.ts): a plain object standing in for PrismaService, with a default
 *  $transaction that runs a callback against itself or no-ops an array (side-effect-only, matching
 *  how becomeMerchant/becomeRider actually use the array form — never destructuring its result). */
/** Default storage stub mints a deterministic, obviously-fake signed URL from the key — real enough
 *  that a test asserting "a photo key produces SOME url" can check it, without any test needing to
 *  hardcode GCS's actual signed-URL shape. */
const defaultStorageStub = { createReadUrl: async (key: string) => `https://signed.example/${key}` };

/** L1: the caller's membership. Unless a test says otherwise, the caller is the owner of "m1" — so the
 *  pre-L1 tests (which only mock `merchant.findUnique`) keep testing what they always tested. */
const OWNER_OF_M1 = { merchantId: "m1", role: "owner", merchant: { businessType: "restaurant" } };

function svc(prisma: Partial<Record<string, unknown>>, storage: Partial<Record<string, unknown>> = defaultStorageStub) {
  const p = prisma as Record<string, unknown>;
  if (!p.merchantMember) p.merchantMember = { findUnique: async () => OWNER_OF_M1 };
  if (!p.$transaction) {
    p.$transaction = async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(p) : arg;
  }
  return new MerchantService(p as unknown as PrismaService, storage as never);
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

describe("MerchantService.becomeMerchant (L1 self-serve sign-up)", () => {
  const PIN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Next to the Siyaso rank", contactPhone: "+263771234567" };
  const body = (over: Record<string, unknown> = {}) =>
    ({ ownerName: "Farai Moyo", name: "Siyaso Spares", businessType: "shop", shopKind: "auto_parts", location: PIN, termsAccepted: true, ...over }) as never;

  /** A caller on no business yet: `become` writes a merchant + an owner member in one transaction, then
   *  `getMyMerchant` resolves the new membership (the second member lookup) and re-reads the row. */
  function harness(profile: Record<string, unknown> = { firstName: "", lastName: "", onHold: false, rider: null }) {
    let merchantData: Record<string, unknown> | undefined;
    let memberData: Record<string, unknown> | undefined;
    let profileData: unknown;
    let memberLookups = 0;
    const s = svc({
      profile: {
        findUnique: async () => profile,
        update: async ({ data }: { data: unknown }) => (profileData = data),
      },
      merchantMember: {
        findUnique: async () => (memberLookups++ === 0 ? null : { merchantId: "m-new", role: "owner", merchant: { businessType: merchantData?.businessType } }),
        create: async ({ data }: { data: Record<string, unknown> }) => (memberData = data),
      },
      merchant: {
        findFirst: async () => null, // no legacy owner row
        create: async ({ data }: { data: Record<string, unknown> }) => {
          merchantData = data;
          return { id: "m-new" };
        },
        findUnique: async () => ({
          id: "m-new",
          name: merchantData!.name,
          ownerProfile: { phone: "+263771234567" },
          description: null,
          coverPhotoUrl: null,
          logoUrl: null,
          cuisineTags: [],
          priceLevel: null,
          hours: null,
          cashRule: merchantData!.cashRule,
          busyMode: false,
          pilotEnabled: false,
          businessType: merchantData!.businessType,
          shopKind: merchantData!.shopKind,
          // L4: the caller's own team row, read with the business.
          members: [{ displayName: (memberData as { displayName?: string } | undefined)?.displayName ?? "" }],
        }),
      },
    });
    return { s, merchant: () => merchantData, member: () => memberData, profileUpdate: () => profileData };
  }

  it("creates the business and its OWNER membership, dormant, and never writes profiles.role (RCA C-4)", async () => {
    const h = harness();
    const res = await h.s.becomeMerchant("p1", body());
    expect(h.merchant()).toMatchObject({
      name: "Siyaso Spares",
      ownerProfileId: "p1",
      businessType: "shop",
      shopKind: "auto_parts",
      location: PIN,
      cashRule: "collect_and_return",
    });
    expect(h.member()).toMatchObject({ merchantId: "m-new", profileId: "p1", role: "owner", displayName: "Farai Moyo", addedByProfileId: "p1" });
    expect(h.member()!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(h.profileUpdate()).not.toHaveProperty("role");
    expect(res).toMatchObject({ id: "m-new", name: "Siyaso Spares", businessType: "shop", shopKind: "auto_parts", myRole: "owner", pilotEnabled: false });
    // L4: the top bar's "who is signed in" is their name on the team.
    expect(res.myName).toBe("Farai Moyo");
  });

  it("fills an EMPTY profile name from 'Your name' (first word, then the rest)", async () => {
    const h = harness();
    await h.s.becomeMerchant("p1", body());
    expect(h.profileUpdate()).toEqual({ firstName: "Farai", lastName: "Moyo" });
  });

  it("never overwrites a name the person already chose in the app", async () => {
    const h = harness({ firstName: "Tino", lastName: "", onHold: false, rider: null });
    await h.s.becomeMerchant("p1", body());
    expect(h.profileUpdate()).toBeUndefined();
  });

  it("a restaurant stores no shop kind, and honours an explicit cash rule", async () => {
    const h = harness();
    await h.s.becomeMerchant("p1", body({ businessType: "restaurant", shopKind: undefined, cashRule: "pay_upfront" }));
    expect(h.merchant()).toMatchObject({ businessType: "restaurant", shopKind: null, cashRule: "pay_upfront" });
  });

  it("D-48: takes a location with no landmark, storing the address line — or the business name — as the landmark riders read", async () => {
    const h = harness();
    const at = { point: PIN.point, contactPhone: PIN.contactPhone };
    await h.s.becomeMerchant("p1", body({ location: { ...at, address: "5th Street, Mbare" } }));
    expect(h.merchant()!.location).toEqual({ ...at, landmark: "5th Street, Mbare" });

    const h2 = harness();
    await h2.s.becomeMerchant("p1", body({ location: at }));
    expect(h2.merchant()!.location).toEqual({ ...at, landmark: "Siyaso Spares" });
  });

  it("D-48: a shop signed up without a kind (the mobile 'What do you sell?' asks only restaurant or shop) is stored as `other`", async () => {
    const h = harness();
    await h.s.becomeMerchant("p1", body({ shopKind: undefined }));
    expect(h.merchant()).toMatchObject({ businessType: "shop", shopKind: "other" });
  });

  it("409s already_member for a caller already on a business (a lost-response retry the web treats as success)", async () => {
    const s = svc({
      profile: { findUnique: async () => ({ firstName: "", lastName: "", onHold: false, rider: null }) },
      merchant: { findFirst: async () => null },
    }); // default membership: owner of m1
    await expect(s.becomeMerchant("p1", body())).rejects.toMatchObject({ status: 409, response: { reason: "already_member" } });
  });

  it("maps a concurrent-duplicate P2002 to the same already_member conflict", async () => {
    const s = svc({
      profile: { findUnique: async () => ({ firstName: "", lastName: "", onHold: false, rider: null }) },
      merchantMember: { findUnique: async () => null },
      merchant: { findFirst: async () => null },
      $transaction: async () => {
        throw p2002();
      },
    });
    await expect(s.becomeMerchant("p1", body())).rejects.toMatchObject({ response: { reason: "already_member" } });
  });

  it("refuses a held account, and a banned or suspended rider (OV-5: Send's standing rules)", async () => {
    for (const [profile, reason] of [
      [{ firstName: "", lastName: "", onHold: true, rider: null }, "on_hold"],
      [{ firstName: "", lastName: "", onHold: false, rider: { accountStatus: "banned" } }, "account_restricted"],
      [{ firstName: "", lastName: "", onHold: false, rider: { accountStatus: "suspended" } }, "account_restricted"],
    ] as const) {
      const h = harness(profile as Record<string, unknown>);
      await expect(h.s.becomeMerchant("p1", body())).rejects.toMatchObject({ status: 403, response: { reason } });
      expect(h.merchant()).toBeUndefined();
    }
  });

  it("an active rider can open a business", async () => {
    const h = harness({ firstName: "", lastName: "", onHold: false, rider: { accountStatus: "active" } });
    await expect(h.s.becomeMerchant("p1", body())).resolves.toMatchObject({ id: "m-new" });
  });

  it("refuses a pin outside the area LyniaGo covers (the Send corridor), before writing anything", async () => {
    const h = harness();
    const far = { ...PIN, point: { lat: -20.15, lng: 28.58 } }; // Bulawayo
    await expect(h.s.becomeMerchant("p1", body({ location: far }))).rejects.toMatchObject({ status: 400, response: { reason: "outside_service_area" } });
    expect(h.merchant()).toBeUndefined();
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

describe("MerchantService.setOpen — the Orders header's open/closed switch (D-48)", () => {
  function harness() {
    let data: Record<string, unknown> | undefined;
    const s = svc({
      merchant: {
        findUnique: async () => ({ id: "m1" }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { id: "m1", name: "Shop", ownerProfile: null, cuisineTags: [], hours: null, busyMode: false, pilotEnabled: true, ...args.data };
        },
      },
    });
    return { s, data: () => data };
  }

  it("closing holds until the next day starts, and the profile says until when", async () => {
    const h = harness();
    const res = await h.s.setOpen("p1", { open: false });
    const until = h.data()!.closedUntil as Date;
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    expect(until.getTime()).toBe(tomorrow.getTime());
    expect(res.closedUntil).toBe(until.toISOString());
  });

  it("opening clears it", async () => {
    const h = harness();
    const res = await h.s.setOpen("p1", { open: true });
    expect(h.data()).toEqual({ closedUntil: null });
    expect(res.closedUntil).toBeNull();
  });
});

describe("MerchantService attach-time photo verification (C1 / E8)", () => {
  const profileRow = {
    id: "m1",
    name: "Shop",
    ownerProfile: { phone: null },
    description: null,
    coverPhotoUrl: "banner/p1/old-cover.jpg",
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: null,
    cashRule: "collect_and_return",
    busyMode: false,
    pilotEnabled: false,
  };
  const dishRow = (photoUrl: string | null) => ({ id: "d1", categoryId: "c1", merchantId: "m1", name: "Sadza", description: null, priceUsd: 5, photoUrl, isDraft: !photoUrl, outOfStockUntil: null, sortOrder: 0 });

  function withVerifier(prisma: Record<string, unknown>, verify = vi.fn(async (_key: string, _kind: string) => ({}))) {
    const p = withMembershipShim({ $transaction: async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg), ...prisma });
    const s = new MerchantService(p as unknown as PrismaService, defaultStorageStub as never, undefined, undefined, undefined, {
      verify,
    } as unknown as UploadVerifier);
    return { s, verify };
  }

  it("updateProfile verifies a NEW cover + logo as kind `banner`, and skips the unchanged one", async () => {
    const update = vi.fn(async () => profileRow);
    const { s, verify } = withVerifier({ merchant: { findUnique: async () => profileRow, update } });
    await s.updateProfile("p1", { coverPhotoUrl: "banner/p1/old-cover.jpg", logoUrl: "banner/p1/logo.jpg" });
    expect(verify.mock.calls).toEqual([["banner/p1/logo.jpg", "banner"]]);
    expect(update).toHaveBeenCalledOnce();
  });

  it("400s a cover/logo key outside the caller's own banner namespace — never verified, so never deleted", async () => {
    const update = vi.fn();
    const { s, verify } = withVerifier({ merchant: { findUnique: async () => profileRow, update } });
    await expect(s.updateProfile("p1", { logoUrl: "kyc/victim/selfie.jpg" })).rejects.toThrow(/invalid photo key/i);
    await expect(s.updateProfile("p1", { coverPhotoUrl: "banner/other-owner/x.jpg" })).rejects.toThrow(/invalid photo key/i);
    expect(verify).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("a rejected photo is never recorded (profile, create dish, update dish)", async () => {
    const { UnprocessableEntityException } = await import("@nestjs/common");
    const reject = vi.fn(async () => {
      throw new UnprocessableEntityException({ reason: "upload_too_large" });
    });
    const profileUpdate = vi.fn();
    const dishCreate = vi.fn();
    const dishUpdate = vi.fn();
    const { s } = withVerifier(
      {
        merchant: { findUnique: async () => profileRow, update: profileUpdate },
        merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
        merchantDish: { findFirst: async () => dishRow(null), create: dishCreate, update: dishUpdate },
      },
      reject,
    );
    await expect(s.updateProfile("p1", { coverPhotoUrl: "banner/p1/new.jpg" })).rejects.toThrow(UnprocessableEntityException);
    await expect(s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5, photoUrl: "dish/p1/x.jpg" })).rejects.toThrow(UnprocessableEntityException);
    await expect(s.updateDish("p1", "d1", { photoUrl: "dish/p1/y.jpg" })).rejects.toThrow(UnprocessableEntityException);
    expect(reject.mock.calls).toEqual([["banner/p1/new.jpg", "banner"], ["dish/p1/x.jpg", "dish"], ["dish/p1/y.jpg", "dish"]]);
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(dishCreate).not.toHaveBeenCalled();
    expect(dishUpdate).not.toHaveBeenCalled();
  });

  it("dish photos must sit under the caller's own dish namespace", async () => {
    const { s, verify } = withVerifier({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantCategory: { findFirst: async () => ({ id: "c1", merchantId: "m1" }) },
      merchantDish: { findFirst: async () => dishRow("dish/p1/current.jpg") },
    });
    await expect(s.createDish("p1", { categoryId: "c1", name: "Sadza", priceUsd: 5, photoUrl: "banner/p1/x.jpg" })).rejects.toThrow(/invalid photo key/i);
    await expect(s.updateDish("p1", "d1", { photoUrl: "dish/p2/x.jpg" })).rejects.toThrow(/invalid photo key/i);
    expect(verify).not.toHaveBeenCalled();
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

  it("L5: out of stock for 1 hour, or until turned back on (RM.oos_sheet); none given is the rest of today", async () => {
    const untils: Array<Date | null> = [];
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      merchantDish: {
        findFirst: async () => ({ id: "d1", merchantId: "m1" }),
        update: async ({ data }: { data: { outOfStockUntil: Date | null } }) => {
          untils.push(data.outOfStockUntil);
          return { id: "d1", categoryId: "c1", name: "Sadza", description: null, priceUsd: 5, photoUrl: null, isDraft: false, outOfStockUntil: data.outOfStockUntil, sortOrder: 0 };
        },
      },
    });
    const before = Date.now();
    await s.setDishOutOfStock("p1", "d1", "one_hour");
    await s.setDishOutOfStock("p1", "d1", "until_back");
    await s.setDishOutOfStock("p1", "d1", "rest_of_today");
    await s.setDishOutOfStock("p1", "d1");

    const hour = untils[0]!.getTime() - before;
    expect(hour).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);
    expect(hour).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
    expect(untils[1]).toEqual(OUT_OF_STOCK_UNTIL_BACK);
    // The rest of today, and the same when an older client sends no duration.
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    expect(untils[2]!.getTime()).toBe(endOfToday.getTime());
    expect(untils[3]!.getTime()).toBe(endOfToday.getTime());
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
  it("listRestaurants only returns pilotEnabled RESTAURANTS — shops never appear (L1, plan D8)", async () => {
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
    expect(receivedWhere).toEqual({ pilotEnabled: true, businessType: "restaurant" });
    expect(res.restaurants).toHaveLength(1);
    expect(res.restaurants[0]!.id).toBe("m1");
    // D1 (browse): the raw weekly hours pass through untouched — open/closed is derived client-side.
    expect(res.restaurants[0]!.hours).toEqual({ mon: { open: "09:00", close: "21:00" } });
  });

  it("D-48: a restaurant closed by hand is served with today's window dropped, so every client reads it as closed", async () => {
    const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()]!;
    const week = { mon: { open: "09:00", close: "21:00" }, tue: { open: "09:00", close: "21:00" }, wed: { open: "09:00", close: "21:00" }, thu: { open: "09:00", close: "21:00" }, fri: { open: "09:00", close: "21:00" }, sat: { open: "09:00", close: "21:00" }, sun: { open: "09:00", close: "21:00" } };
    const row = { id: "m1", name: "Nandos", coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: 2, hours: week };
    const closed = svc({ merchant: { findMany: async () => [{ ...row, closedUntil: new Date(Date.now() + 3_600_000) }] } });
    const hours = (await closed.listRestaurants()).restaurants[0]!.hours as Record<string, unknown>;
    expect(hours[today]).toBeUndefined();
    expect(Object.keys(hours)).toHaveLength(6);

    const lapsed = svc({ merchant: { findMany: async () => [{ ...row, closedUntil: new Date(Date.now() - 1000) }] } });
    expect((await lapsed.listRestaurants()).restaurants[0]!.hours).toEqual(week);
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

describe("MerchantService.getTodaySummary (E3, M4·6; D-48 header tiles)", () => {
  /** order.aggregate serves three sums (wallet, confirmed cash, D-48 placed); order.findMany two reads
   *  (prep times, D-48 overdue cash) — told apart by what each asks for. */
  function summaryPrisma(opts: { overdue?: unknown[]; placed?: { count: number; sum: number | null }; today?: unknown[] } = {}) {
    return {
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        count: async ({ where }: { where: { status: string } }) => (where.status === "delivered" ? 5 : 1),
        aggregate: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.merchantPaymentMethod === "wallet") return { _sum: { merchantGoodsTotal: 20 } };
          if (where.prepStartedAt) return { _count: { _all: opts.placed?.count ?? 0 }, _sum: { merchantGoodsTotal: opts.placed?.sum ?? null } };
          return { _sum: { debtAmount: 13 } };
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          where.debtStatus === "open"
            ? (opts.overdue ?? [])
            : where.readyAt
              ? [
                  { readyAt: new Date("2026-07-30T10:20:00.000Z"), prepStartedAt: new Date("2026-07-30T10:00:00.000Z") },
                  { readyAt: new Date("2026-07-30T11:10:00.000Z"), prepStartedAt: new Date("2026-07-30T11:00:00.000Z") },
                ]
              : (opts.today ?? []),
      },
    };
  }

  it("aggregates today's delivered/rejected counts, wallet + confirmed-cash-return totals, and average prep time", async () => {
    const res = await svc(summaryPrisma()).getTodaySummary("p1");
    expect(res.delivered).toBe(5);
    expect(res.rejected).toBe(1);
    expect(res.walletTaken).toBe(20);
    expect(res.cashTaken).toBe(13);
    expect(res.averagePrepMinutes).toBe(15);
  });

  it("D-48: counts today's orders and their sales, and lists cash overdue past its due time with who owes it", async () => {
    const deliveredAt = new Date("2026-09-30T11:10:00.000Z");
    let overdueWhere: Record<string, unknown> | undefined;
    const prisma = summaryPrisma({
      placed: { count: 7, sum: 59.5 },
      overdue: [
        { id: "11111111-1111-4111-8111-111111111111", debtAmount: 9.5, deliveredAt, rider: { profile: { firstName: "Tino" } } },
        { id: "22222222-2222-4222-8222-222222222222", debtAmount: 4, deliveredAt, rider: null },
      ],
    });
    const findMany = prisma.order.findMany;
    prisma.order.findMany = async (args: { where: Record<string, unknown> }) => {
      if (args.where.debtStatus === "open") overdueWhere = args.where;
      return findMany(args);
    };
    const res = await svc(prisma).getTodaySummary("p1");
    expect(res.orders).toBe(7);
    expect(res.sales).toBe(59.5);
    expect(res.cashOverdue).toBe(13.5);
    expect(res.overdue).toEqual([
      { orderId: "11111111-1111-4111-8111-111111111111", amount: 9.5, riderName: "Tino", dueAt: "2026-09-30T11:40:00.000Z" },
      { orderId: "22222222-2222-4222-8222-222222222222", amount: 4, riderName: null, dueAt: "2026-09-30T11:40:00.000Z" },
    ]);
    // Open, not closed by the merchant, and delivered more than the 30-minute return window ago.
    expect(overdueWhere).toMatchObject({ debtStatus: "open", merchantClosedAt: null });
    expect((overdueWhere!.deliveredAt as { lt: Date }).lt.getTime()).toBeLessThanOrEqual(Date.now() - 30 * 60_000 + 1000);
  });

  it("D-48 C3: lists today's orders with how each ended, earning only when delivered or still on", async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 8, 30, h));
    const row = (id: string, over: Record<string, unknown>) => ({ id: `${id}0000000-0000-4000-8000-000000000000`, prepStartedAt: at(9), createdAt: at(9), deliveredAt: null, cancelledAt: null, merchantGoodsTotal: 12, ...over });
    const res = await svc(
      summaryPrisma({
        today: [
          row("a", { status: "delivered", deliveredAt: at(12) }),
          row("b", { status: "cancelled", prepStartedAt: null, cancelledAt: at(11) }),
          row("c", { status: "cancelled", cancelledAt: at(10) }),
          row("d", { status: "en_route_dropoff" }),
          row("e", { status: "undelivered" }),
        ],
      }),
    ).getTodaySummary("p1");
    expect(res.lines!.map((l) => [l.outcome, l.amount, l.at])).toEqual([
      ["delivered", 12, at(12).toISOString()],
      ["rejected", 0, at(11).toISOString()],
      ["cancelled", 0, at(10).toISOString()],
      ["in_progress", 12, at(9).toISOString()],
      ["not_delivered", 0, at(9).toISOString()],
    ]);
  });

  it("averagePrepMinutes is null and totals are zero with no activity today", async () => {
    const s = svc({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _count: { _all: 0 }, _sum: { merchantGoodsTotal: null, debtAmount: null } }),
        findMany: async () => [],
      },
    });
    const res = await s.getTodaySummary("p1");
    expect(res.averagePrepMinutes).toBeNull();
    expect(res.cashTaken).toBe(0);
    expect(res.walletTaken).toBe(0);
    expect(res.orders).toBe(0);
    expect(res.sales).toBe(0);
    expect(res.cashOverdue).toBe(0);
    expect(res.overdue).toEqual([]);
  });
});

/**
 * RCA 2026-08-17 §5.1: photo read-URLs are micro-cached by object key so they are byte-stable
 * across responses — the device image cache and the JSON ETag/304 machinery both key on the exact
 * string, and a fresh V4 signature per response defeated both (plus ~2 IAM signBlob RPCs per
 * merchant per list page). These exercise the REAL service wiring, not a bare MicroCache — in
 * particular the review-caught trap that a `.catch(() => null)` INSIDE the cached loader would make
 * one signing hiccup a cached null that blanks a photo for 14 h.
 */
describe("MerchantService photo-URL micro-cache (RCA 2026-08-17 §5.1)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    name: "Nandos",
    coverPhotoUrl: "merchant/m1/cover.jpg",
    logoUrl: null,
    cuisineTags: [],
    priceLevel: 2,
    hours: null,
    location: null,
    foodRatingAvg: 0,
    foodRatingCount: 0,
    prepBaselineMinutes: null,
    ...over,
  });

  function cachedSvc(opts: { env?: Record<string, string>; mint?: (key: string) => Promise<string> } = {}) {
    const mint = opts.mint ?? (async (key: string) => `https://signed.example/${key}`);
    const calls: string[] = [];
    const storage = {
      createReadUrl: async (key: string, expiresInSeconds?: number) => {
        calls.push(`${key}@${expiresInSeconds}`);
        return mint(key);
      },
    };
    const prisma = {
      merchant: { findMany: async () => [row()] },
      $transaction: async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg),
    };
    const s = new MerchantService(
      prisma as unknown as PrismaService,
      storage as never,
      (opts.env ?? {}) as never,
      undefined,
    );
    return { s, calls };
  }

  it("mints each object key ONCE across consecutive list responses (byte-stable URL, no re-sign)", async () => {
    const { s, calls } = cachedSvc();
    const first = await s.listRestaurants();
    const second = await s.listRestaurants();
    expect(first.restaurants[0]!.coverPhotoUrl).toBe("https://signed.example/merchant/m1/cover.jpg");
    // The SAME string, from the SAME single mint — this equality is the entire ETag/image-cache fix.
    expect(second.restaurants[0]!.coverPhotoUrl).toBe(first.restaurants[0]!.coverPhotoUrl);
    expect(calls).toHaveLength(1);
  });

  it("signs with the 24 h validity (public menu media, not the KYC lane's 15 min)", async () => {
    const { s, calls } = cachedSvc();
    await s.listRestaurants();
    expect(calls[0]).toBe(`merchant/m1/cover.jpg@${24 * 60 * 60}`);
  });

  it("never caches a rejected mint: the failed response serves null, the next one re-mints", async () => {
    let fail = true;
    const { s, calls } = cachedSvc({
      mint: async (key: string) => {
        if (fail) throw new Error("GCS unavailable");
        return `https://signed.example/${key}`;
      },
    });
    const first = await s.listRestaurants();
    expect(first.restaurants[0]!.coverPhotoUrl).toBeNull(); // degraded THIS response only

    fail = false;
    const second = await s.listRestaurants();
    // The trap this pins shut: were the catch inside the cached loader, this would still be null.
    expect(second.restaurants[0]!.coverPhotoUrl).toBe("https://signed.example/merchant/m1/cover.jpg");
    expect(calls).toHaveLength(2);
  });

  it("MICRO_CACHE_DISABLED routes every response straight to the mint (the ops escape hatch)", async () => {
    const { s, calls } = cachedSvc({ env: { MICRO_CACHE_DISABLED: "true" } });
    await s.listRestaurants();
    await s.listRestaurants();
    expect(calls).toHaveLength(2);
  });

  it("a TTL-0 override disables just this cache", async () => {
    const { s, calls } = cachedSvc({ env: { MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL: 0 as unknown as string } });
    await s.listRestaurants();
    await s.listRestaurants();
    expect(calls).toHaveLength(2);
  });

  it("distinct object keys are distinct cache entries", async () => {
    const mint = async (key: string) => `https://signed.example/${key}`;
    const calls: string[] = [];
    const storage = { createReadUrl: async (key: string) => { calls.push(key); return mint(key); } };
    const prisma = {
      merchant: { findMany: async () => [row({ logoUrl: "merchant/m1/logo.jpg" })] },
      $transaction: async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg),
    };
    const s = new MerchantService(prisma as unknown as PrismaService, storage as never, {} as never, undefined);
    const res = await s.listRestaurants();
    expect(res.restaurants[0]!.coverPhotoUrl).toContain("cover.jpg");
    expect(res.restaurants[0]!.logoUrl).toContain("logo.jpg");
    expect(calls.sort()).toEqual(["merchant/m1/cover.jpg", "merchant/m1/logo.jpg"]);
  });
});
