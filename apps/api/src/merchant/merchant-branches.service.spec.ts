import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { MerchantAccess } from "./merchant-access";
import { BRANCH_CREATE_ACTION, BRANCH_SWITCH_ACTION, MerchantBranchesService } from "./merchant-branches.service";
import type { MerchantService } from "./merchant.service";

/* ── An in-memory slice of the tables branches touch (docs/plans/2026-09-30-multi-branch-owners.md) ── */

interface Merchant {
  id: string;
  name: string;
  ownerProfileId: string | null;
  pilotEnabled: boolean;
  location: unknown;
  [field: string]: unknown;
}
interface Member {
  id: string;
  merchantId: string;
  profileId: string;
  role: "owner" | "staff";
  displayName: string;
  termsAcceptedAt: Date | null;
  activeAt: Date | null;
  createdAt: Date;
}
interface Category { id: string; merchantId: string; name: string; sortOrder: number; availableFrom: string | null; availableTo: string | null; hidden: boolean }
interface Dish { categoryId: string; merchantId: string; name: string; description: string | null; priceUsd: number; photoUrl: string | null; isDraft: boolean; sortOrder: number }

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const PIN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Opposite Avondale shops", contactPhone: "+263771234567" };
const TERMS = new Date("2026-09-01T08:00:00Z");

/** The resolver's order: latest `activeAt` first (nulls last), then oldest. */
function byActive(a: Member, b: Member): number {
  const at = a.activeAt?.getTime() ?? -Infinity;
  const bt = b.activeAt?.getTime() ?? -Infinity;
  return bt - at || a.createdAt.getTime() - b.createdAt.getTime();
}

function makeWorld() {
  const merchants = new Map<string, Merchant>();
  const members: Member[] = [];
  const categories: Category[] = [];
  const dishes: Dish[] = [];
  const audit: Array<{ actor: string; action: string; target: string; note: string | null }> = [];
  const profiles = new Map<string, { onHold: boolean }>();
  /** Set to make a second branch land between the guard and the lock (a double tap). */
  let racingBranch: { name: string } | null = null;

  const prisma = {
    profile: { findUnique: async ({ where }: { where: { id: string } }) => profiles.get(where.id) ?? null },
    merchant: {
      count: async ({ where }: { where: { id: { in: string[] }; name: { equals: string; mode: "insensitive" } } }) =>
        [...merchants.values()].filter((m) => where.id.in.includes(m.id) && m.name.toLowerCase() === where.name.equals.toLowerCase()).length,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const m = merchants.get(where.id);
        if (!m) throw new Error("not found");
        return { ...m, members: members.filter((x) => x.merchantId === m.id) };
      },
      create: vi.fn(async ({ data }: { data: Omit<Merchant, "id" | "pilotEnabled"> }) => {
        const row = { pilotEnabled: false, ...data, id: uuid() } as Merchant;
        merchants.set(row.id, row);
        return { id: row.id };
      }),
    },
    merchantMember: {
      findMany: async ({ where }: { where: { profileId: string } }) =>
        members
          .filter((m) => m.profileId === where.profileId)
          .sort(byActive)
          .map((m) => ({ ...m, merchant: merchants.get(m.merchantId)! })),
      updateMany: async ({ where, data }: { where: { profileId: string; merchantId: string }; data: { activeAt: Date } }) => {
        const rows = members.filter((m) => m.profileId === where.profileId && m.merchantId === where.merchantId);
        for (const r of rows) r.activeAt = data.activeAt;
        return { count: rows.length };
      },
      create: vi.fn(async ({ data }: { data: Omit<Member, "id" | "createdAt"> }) => {
        const row = { ...data, activeAt: data.activeAt ?? null, id: uuid(), createdAt: new Date() } as Member;
        members.push(row);
        return row;
      }),
    },
    merchantCategory: {
      findMany: async ({ where }: { where: { merchantId: string } }) =>
        categories.filter((c) => c.merchantId === where.merchantId).map((c) => ({ ...c, dishes: dishes.filter((d) => d.categoryId === c.id) })),
      createMany: vi.fn(async ({ data }: { data: Category[] }) => {
        categories.push(...data);
        return { count: data.length };
      }),
    },
    merchantDish: {
      createMany: vi.fn(async ({ data }: { data: Dish[] }) => {
        dishes.push(...data);
        return { count: data.length };
      }),
    },
    auditLog: {
      create: async ({ data }: { data: { actor: string; action: string; target: string; note: string | null } }) => {
        audit.push(data);
        return data;
      },
    },
    // The person's profile lock. A racing double tap commits its branch just before we get it.
    $executeRaw: vi.fn(async () => {
      if (racingBranch) {
        const owner = members.find((m) => m.role === "owner")!;
        const id = uuid();
        merchants.set(id, { id, name: racingBranch.name, ownerProfileId: owner.profileId, pilotEnabled: false, location: PIN });
        members.push({ ...owner, id: uuid(), merchantId: id, activeAt: new Date(), createdAt: new Date() });
        racingBranch = null;
      }
      return 1;
    }),
    $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
  };

  const gateway = { evictFromMerchantQueue: vi.fn(async () => {}) };
  // `/merchant/me` for whichever branch the person is now working on.
  const merchantService = {
    getMyMerchant: vi.fn(async (profileId: string) => ({ id: members.filter((m) => m.profileId === profileId).sort(byActive)[0]?.merchantId })),
  };
  const svc = new MerchantBranchesService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway, merchantService as unknown as MerchantService);

  const business = (id: string, name: string, over: Partial<Merchant> = {}) => {
    merchants.set(id, { id, name, ownerProfileId: null, pilotEnabled: true, location: { ...PIN, landmark: `${name} pin` }, ...over });
  };
  const member = (merchantId: string, profileId: string, role: Member["role"], over: Partial<Member> = {}) => {
    profiles.set(profileId, profiles.get(profileId) ?? { onHold: false });
    members.push({ id: uuid(), merchantId, profileId, role, displayName: "Mai Moyo", termsAcceptedAt: TERMS, activeAt: null, createdAt: new Date(Date.now() - 60_000), ...over });
  };
  const raceBranch = (name: string) => {
    racingBranch = { name };
  };
  return { svc, prisma, gateway, merchants, members, categories, dishes, audit, profiles, business, member, raceBranch };
}

const OWNER_AT_M1: MerchantAccess = { merchantId: "m1", role: "owner", businessType: "restaurant" };

describe("MerchantBranchesService (multi-branch owners)", () => {
  let w: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    w = makeWorld();
    w.business("m1", "Mama's Kitchen · CBD", {
      ownerProfileId: "mai",
      description: "Sadza and stews",
      logoUrl: "banner/mai/logo.jpg",
      coverPhotoUrl: "banner/mai/cover.jpg",
      cuisineTags: ["Traditional"],
      priceLevel: 2,
      hours: { mon: { open: "08:00", close: "20:00" } },
      cashRule: "collect_and_return",
      prepBaselineMinutes: 20,
      businessType: "restaurant",
      shopKind: null,
    });
    w.member("m1", "mai", "owner");
  });

  describe("list", () => {
    it("a person on one business gets a list of one, active", async () => {
      expect(await w.svc.list("mai")).toEqual({
        branches: [{ id: "m1", name: "Mama's Kitchen · CBD", landmark: "Mama's Kitchen · CBD pin", role: "owner", active: true, pilotEnabled: true }],
      });
    });

    it("the branch last switched to comes first and is the one active", async () => {
      w.business("m2", "Mama's Kitchen · Avondale", { pilotEnabled: false, location: null });
      w.member("m2", "mai", "owner", { activeAt: new Date() });
      const { branches } = await w.svc.list("mai");
      expect(branches.map((b) => [b.id, b.active])).toEqual([
        ["m2", true],
        ["m1", false],
      ]);
      expect(branches[0]).toMatchObject({ landmark: null, pilotEnabled: false });
    });
  });

  describe("switchTo", () => {
    beforeEach(() => {
      w.business("m2", "Mama's Kitchen · Avondale");
      w.member("m2", "mai", "owner");
    });

    it("moves every later call to that branch, audit-logged, and drops the old branch's live queue", async () => {
      expect(await w.svc.switchTo(OWNER_AT_M1, "mai", { merchantId: "m2" })).toEqual({ id: "m2" });
      expect((await w.svc.list("mai")).branches[0]).toMatchObject({ id: "m2", active: true });
      expect(w.audit).toEqual([{ actor: "mai", action: BRANCH_SWITCH_ACTION, target: "m2", note: "m1" }]);
      expect(w.gateway.evictFromMerchantQueue).toHaveBeenCalledWith("mai", "m1");
    });

    it("a business the person isn't on reads as missing, and nothing moves", async () => {
      w.business("m9", "Someone else's shop");
      w.member("m9", "tendai", "owner");
      await expect(w.svc.switchTo(OWNER_AT_M1, "mai", { merchantId: "m9" })).rejects.toMatchObject({ status: 404 });
      expect(w.members.find((m) => m.merchantId === "m9" && m.profileId === "mai")).toBeUndefined();
      expect(w.audit).toEqual([]);
      expect(w.gateway.evictFromMerchantQueue).not.toHaveBeenCalled();
    });

    it("switching to the branch already active changes nothing", async () => {
      expect(await w.svc.switchTo(OWNER_AT_M1, "mai", { merchantId: "m1" })).toEqual({ id: "m1" });
      expect(w.audit).toEqual([]);
      expect(w.gateway.evictFromMerchantQueue).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    const body = (over: Record<string, unknown> = {}) => ({ name: "Mama's Kitchen · Avondale", location: PIN, ...over }) as never;

    it("opens a dormant branch with the shop front, hours and cash rule, owned by the caller, and switches to it", async () => {
      const res = await w.svc.create(OWNER_AT_M1, "mai", body());
      const branch = [...w.merchants.values()].find((m) => m.name === "Mama's Kitchen · Avondale")!;
      expect(res).toEqual({ id: branch.id });
      expect(branch).toMatchObject({
        ownerProfileId: "mai",
        pilotEnabled: false,
        description: "Sadza and stews",
        logoUrl: "banner/mai/logo.jpg",
        coverPhotoUrl: "banner/mai/cover.jpg",
        cuisineTags: ["Traditional"],
        priceLevel: 2,
        hours: { mon: { open: "08:00", close: "20:00" } },
        cashRule: "collect_and_return",
        prepBaselineMinutes: 20,
        businessType: "restaurant",
        location: { point: PIN.point, landmark: PIN.landmark, contactPhone: PIN.contactPhone },
      });
      expect(w.members.find((m) => m.merchantId === branch.id)).toMatchObject({
        profileId: "mai",
        role: "owner",
        displayName: "Mai Moyo",
        termsAcceptedAt: TERMS,
      });
      expect(w.audit).toEqual([{ actor: "mai", action: BRANCH_CREATE_ACTION, target: branch.id, note: "m1" }]);
      expect(w.gateway.evictFromMerchantQueue).toHaveBeenCalledWith("mai", "m1");
      // No menu unless asked.
      expect(w.prisma.merchantCategory.createMany).not.toHaveBeenCalled();
    });

    it("copies the menu when asked: every category and item, back in stock, under the new branch", async () => {
      w.categories.push({ id: "c1", merchantId: "m1", name: "Mains", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false });
      w.categories.push({ id: "c2", merchantId: "m1", name: "Breakfast", sortOrder: 1, availableFrom: "07:00", availableTo: "11:00", hidden: true });
      w.dishes.push({ categoryId: "c1", merchantId: "m1", name: "Sadza & beef", description: null, priceUsd: 5, photoUrl: "dish/mai/a.jpg", isDraft: false, sortOrder: 0 });
      w.dishes.push({ categoryId: "c2", merchantId: "m1", name: "Tea & bread", description: "Two slices", priceUsd: 1.5, photoUrl: null, isDraft: true, sortOrder: 0 });

      const { id } = (await w.svc.create(OWNER_AT_M1, "mai", body({ copyMenu: true }))) as { id: string };
      const copied = w.categories.filter((c) => c.merchantId === id);
      expect(copied.map((c) => [c.name, c.availableFrom, c.hidden])).toEqual([
        ["Mains", null, false],
        ["Breakfast", "07:00", true],
      ]);
      expect(copied.every((c) => c.id !== "c1" && c.id !== "c2")).toBe(true);
      const items = w.dishes.filter((d) => d.merchantId === id);
      expect(items).toEqual([
        { categoryId: copied[0]!.id, merchantId: id, name: "Sadza & beef", description: null, priceUsd: 5, photoUrl: "dish/mai/a.jpg", isDraft: false, sortOrder: 0 },
        { categoryId: copied[1]!.id, merchantId: id, name: "Tea & bread", description: "Two slices", priceUsd: 1.5, photoUrl: null, isDraft: true, sortOrder: 0 },
      ]);
      // The original menu is untouched.
      expect(w.dishes.filter((d) => d.merchantId === "m1")).toHaveLength(2);
    });

    it("an empty menu copies nothing", async () => {
      await w.svc.create(OWNER_AT_M1, "mai", body({ copyMenu: true }));
      expect(w.prisma.merchantCategory.createMany).not.toHaveBeenCalled();
      expect(w.prisma.merchantDish.createMany).not.toHaveBeenCalled();
    });

    it("refuses a name the owner already uses, whatever the case, so a double tap opens one branch", async () => {
      await expect(w.svc.create(OWNER_AT_M1, "mai", body({ name: "mama's kitchen · cbd" }))).rejects.toMatchObject({
        status: 409,
        response: { reason: "branch_name_taken" },
      });
      w.raceBranch("Mama's Kitchen · Avondale");
      await expect(w.svc.create(OWNER_AT_M1, "mai", body())).rejects.toMatchObject({ response: { reason: "branch_name_taken" } });
      expect([...w.merchants.values()].filter((m) => m.name === "Mama's Kitchen · Avondale")).toHaveLength(1);
    });

    it("another owner's business name is no clash", async () => {
      w.business("m9", "Mama's Kitchen · Avondale");
      w.member("m9", "tendai", "owner");
      await expect(w.svc.create(OWNER_AT_M1, "mai", body())).resolves.toBeDefined();
    });

    it("stops at the branch limit", async () => {
      for (let i = 2; i <= 20; i++) {
        w.business(`m${i}`, `Branch ${i}`);
        w.member(`m${i}`, "mai", "owner");
      }
      await expect(w.svc.create(OWNER_AT_M1, "mai", body())).rejects.toMatchObject({ status: 409, response: { reason: "branch_limit" } });
      expect(w.prisma.merchant.create).not.toHaveBeenCalled();
    });

    it("re-checks ownership under the lock: someone support just demoted to Staff opens nothing", async () => {
      w.members[0]!.role = "staff";
      await expect(w.svc.create(OWNER_AT_M1, "mai", body())).rejects.toMatchObject({ status: 403, response: { reason: "owner_only" } });
      expect(w.prisma.merchant.create).not.toHaveBeenCalled();
    });

    it("refuses a held account and a pin outside the service area", async () => {
      await expect(w.svc.create(OWNER_AT_M1, "mai", body({ location: { ...PIN, point: { lat: -20.15, lng: 28.58 } } }))).rejects.toMatchObject({
        status: 400,
        response: { reason: "outside_service_area", message: "That address is outside the area LyniaGo covers for now." },
      });
      w.profiles.set("mai", { onHold: true });
      await expect(w.svc.create(OWNER_AT_M1, "mai", body())).rejects.toMatchObject({ status: 403, response: { reason: "on_hold" } });
      expect(w.prisma.merchant.create).not.toHaveBeenCalled();
    });
  });
});
