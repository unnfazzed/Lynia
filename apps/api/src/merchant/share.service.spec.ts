import { ConflictException, NotFoundException } from "@nestjs/common";
import { shopLink } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { serviceOf, ShareService } from "./share.service";

type M = {
  id: string;
  name: string;
  businessType: "restaurant" | "shop";
  shopKind: string | null;
  pilotEnabled: boolean;
  applicationStatus: string;
  logoUrl: string | null;
  logoThumbKey: string | null;
  coverPhotoUrl: string | null;
  coverThumbKey: string | null;
};

const ON: Pick<Env, "RESTAURANTS_ENABLED" | "SHOPS_ENABLED" | "PHARMACY_ENABLED"> = {
  RESTAURANTS_ENABLED: "true",
  SHOPS_ENABLED: "true",
  PHARMACY_ENABLED: "true",
};

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const PHARMACY = "22222222-2222-4222-8222-222222222222";
const GROCER = "33333333-3333-4333-8333-333333333333";

/** Matches the handful of MerchantWhereInput shapes the visibility rules produce. */
function matches(m: M, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, want]) => {
    if (key === "OR") return (want as Record<string, unknown>[]).some((w) => matches(m, w));
    const have = (m as unknown as Record<string, unknown>)[key];
    if (want && typeof want === "object") {
      const op = want as { not?: unknown; in?: unknown[] };
      if ("not" in op) return have !== op.not;
      if ("in" in op) return (op.in ?? []).includes(have);
    }
    return have === want;
  });
}

function unique(): never {
  throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function setup(opts: { env?: Partial<Env>; draws?: string[] } = {}) {
  const merchants = new Map<string, M>();
  const codes = new Map<string, string>(); // merchantId → code
  const signed: string[] = [];
  const add = (over: Partial<M> & Pick<M, "id" | "name">) =>
    merchants.set(over.id, {
      businessType: "restaurant",
      shopKind: null,
      pilotEnabled: true,
      applicationStatus: "live",
      logoUrl: null,
      logoThumbKey: null,
      coverPhotoUrl: null,
      coverThumbKey: null,
      ...over,
    });

  const prisma = {
    merchant: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const m = [...merchants.values()].find((x) => matches(x, where));
        return m ? { id: m.id, name: m.name, businessType: m.businessType, shopKind: m.shopKind } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => merchants.get(where.id) ?? null,
    },
    merchantShareCode: {
      findUnique: async ({ where }: { where: { merchantId?: string; code?: string } }) => {
        if (where.merchantId) {
          const code = codes.get(where.merchantId);
          return code ? { code, merchantId: where.merchantId } : null;
        }
        const hit = [...codes.entries()].find(([, c]) => c === where.code);
        return hit ? { merchantId: hit[0], code: hit[1] } : null;
      },
      create: async ({ data }: { data: { merchantId: string; code: string } }) => {
        if (codes.has(data.merchantId) || [...codes.values()].includes(data.code)) unique();
        codes.set(data.merchantId, data.code);
        return { code: data.code };
      },
    },
  };
  const storage = {
    createReadUrl: async (key: string) => {
      signed.push(key);
      return `https://signed.example/${key}`;
    },
  };
  const svc = new ShareService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageAdapter,
    { ...ON, ...opts.env } as Env,
  );
  return { svc, add, codes, signed, merchants };
}

describe("ShareService.linkFor (merchant app)", () => {
  it("mints a code once for a live business and keeps it", async () => {
    const { svc, add, codes } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    const first = await svc.linkFor(KITCHEN);
    expect(first.live).toBe(true);
    expect(first.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(first.link).toBe(shopLink("Chicken Inn Avondale", first.code!));
    expect(await svc.linkFor(KITCHEN)).toEqual(first);
    expect(codes.size).toBe(1);
  });

  it("DR6: a business that isn't live gets no row and no code", async () => {
    const { svc, add, codes } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale", pilotEnabled: false, applicationStatus: "approved" });
    expect(await svc.linkFor(KITCHEN)).toEqual({ live: false, code: null, link: null });
    expect(codes.size).toBe(0);
  });

  it("a live shop whose section is switched off is not live", async () => {
    const { svc, add } = setup({ env: { PHARMACY_ENABLED: "false" } });
    add({ id: PHARMACY, name: "Belgravia Pharmacy", businessType: "shop", shopKind: "pharmacy" });
    expect((await svc.linkFor(PHARMACY)).live).toBe(false);
  });
});

describe("ShareService.codeFor", () => {
  it("draws again on a collision", async () => {
    const { svc, codes } = setup();
    const db = svc as unknown as { prisma: { merchantShareCode: { create: (a: { data: { merchantId: string; code: string } }) => Promise<{ code: string }> } } };
    const real = db.prisma.merchantShareCode.create;
    let calls = 0;
    db.prisma.merchantShareCode.create = async (args) => {
      calls++;
      if (calls === 1) unique(); // the first draw is taken
      return real(args);
    };
    const code = await svc.codeFor(KITCHEN);
    expect(calls).toBe(2);
    expect(codes.get(KITCHEN)).toBe(code);
  });

  it("gives up with a 409 after eight collisions in a row", async () => {
    const { svc } = setup();
    const always = svc as unknown as { prisma: { merchantShareCode: { create: () => never; findUnique: () => null } } };
    always.prisma.merchantShareCode.findUnique = () => null;
    always.prisma.merchantShareCode.create = () => unique();
    await expect(svc.codeFor(KITCHEN)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ShareService.resolve (signed in)", () => {
  it("opens the right store for each service, with the canonical link", async () => {
    const { svc, add } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    add({ id: PHARMACY, name: "Belgravia Pharmacy", businessType: "shop", shopKind: "pharmacy" });
    add({ id: GROCER, name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" });
    for (const [id, service] of [
      [KITCHEN, "restaurants"],
      [PHARMACY, "pharmacy"],
      [GROCER, "shops"],
    ] as const) {
      const code = await svc.codeFor(id);
      const res = await svc.resolve(code.toLowerCase()); // any case
      expect(res.merchantId).toBe(id);
      expect(res.service).toBe(service);
    }
    const kitchenCode = await svc.codeFor(KITCHEN);
    expect((await svc.resolve(kitchenCode)).link).toBe(`https://lyniago.com/s/chicken-inn-avondale-${kitchenCode}`);
  });

  it("R6: unknown, malformed, not-live, suspended and switched-off codes are all the same 404", async () => {
    const { svc, add, merchants } = setup({ env: { RESTAURANTS_ENABLED: "true" } });
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    const code = await svc.codeFor(KITCHEN);

    const gone = async (c: string) => {
      const err = await svc.resolve(c).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      return (err as NotFoundException).message;
    };
    const unknown = await gone("ZZZZZZ");
    expect(await gone("not a code")).toBe(unknown);
    merchants.get(KITCHEN)!.pilotEnabled = false; // paused
    expect(await gone(code)).toBe(unknown);
    merchants.get(KITCHEN)!.pilotEnabled = true;
    merchants.get(KITCHEN)!.applicationStatus = "suspended";
    expect(await gone(code)).toBe(unknown);
  });

  it("a restaurant link doesn't open while restaurants are switched off", async () => {
    const { svc, add } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    const code = await svc.codeFor(KITCHEN);
    const off = setup({ env: { RESTAURANTS_ENABLED: "false" } });
    off.add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    off.codes.set(KITCHEN, code);
    await expect(off.svc.resolve(code)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ShareService.card (public, DR16)", () => {
  it("returns only the name, signed thumbnails, the service and kind, and the link", async () => {
    const { svc, add, signed } = setup();
    add({
      id: GROCER,
      name: "Avondale Fresh",
      businessType: "shop",
      shopKind: "grocery",
      logoUrl: "banner/p1/logo.jpg",
      logoThumbKey: "banner/p1/logo.jpg.thumb.jpg",
      coverPhotoUrl: "banner/p1/cover.jpg",
      coverThumbKey: "banner/p1/cover.jpg.thumb.jpg",
    });
    const code = await svc.codeFor(GROCER);
    const card = await svc.card(code);
    expect(Object.keys(card).sort()).toEqual(["coverThumbUrl", "link", "logoThumbUrl", "name", "service", "shopKind"]);
    expect(card).toMatchObject({ name: "Avondale Fresh", service: "shops", shopKind: "grocery" });
    expect(card.link).toBe(`https://lyniago.com/s/avondale-fresh-${code}`);
    // Thumbnails only, never the full photos.
    expect(signed).toEqual(["banner/p1/logo.jpg.thumb.jpg", "banner/p1/cover.jpg.thumb.jpg"]);
  });

  it("no photo → null thumbnails (the tint + initial fallback); restaurants have no kind", async () => {
    const { svc, add } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    const card = await svc.card(await svc.codeFor(KITCHEN));
    expect(card).toMatchObject({ logoThumbUrl: null, coverThumbUrl: null, shopKind: null, service: "restaurants" });
  });

  it("a stale thumbnail (not the current photo's) is not served", async () => {
    const { svc, add } = setup();
    add({ id: KITCHEN, name: "K", logoUrl: "banner/p1/new.jpg", logoThumbKey: "banner/p1/old.jpg.thumb.jpg" });
    const card = await svc.card(await svc.codeFor(KITCHEN));
    expect(card.logoThumbUrl).toBeNull();
  });

  it("not live → 404, so the landing page names no shop", async () => {
    const { svc, add, merchants } = setup();
    add({ id: KITCHEN, name: "Chicken Inn Avondale" });
    const code = await svc.codeFor(KITCHEN);
    merchants.get(KITCHEN)!.pilotEnabled = false;
    await expect(svc.card(code)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("serviceOf", () => {
  it("maps business type and kind to the store section", () => {
    expect(serviceOf({ businessType: "restaurant", shopKind: null })).toBe("restaurants");
    expect(serviceOf({ businessType: "shop", shopKind: "pharmacy" })).toBe("pharmacy");
    expect(serviceOf({ businessType: "shop", shopKind: "hardware" })).toBe("shops");
  });
});
