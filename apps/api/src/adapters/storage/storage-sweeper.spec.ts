import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { ORPHAN_MIN_AGE_MS, StorageSweeper } from "./storage-sweeper";
import type { StorageAdapter, StoredObject } from "./storage.interface";

const NOW = new Date("2026-09-24T03:00:00Z");
const old = new Date(NOW.getTime() - ORPHAN_MIN_AGE_MS - 60_000);
const fresh = new Date(NOW.getTime() - 60 * 60_000);

/** `where: { <col>: { in: keys } }` (or an OR of those) → the rows whose column is in `keys`. */
function table(rows: Array<Record<string, string | null>>) {
  return {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const clauses = (where.OR as Array<Record<string, { in: string[] }>> | undefined) ?? [where as Record<string, { in: string[] }>];
      return rows.filter((r) => clauses.some((c) => Object.entries(c).some(([col, cond]) => cond.in.includes(r[col] as string))));
    }),
  };
}

function harness(objects: StoredObject[], refs: { riders?: string[]; pickup?: string[]; proof?: string[]; dish?: string[]; cover?: string[]; logo?: string[] } = {}) {
  const deleted: string[] = [];
  const storage = {
    listObjects: (prefix: string) =>
      (async function* () {
        for (const o of objects) if (o.key.startsWith(prefix)) yield o;
      })(),
    deleteObject: vi.fn(async (k: string) => {
      deleted.push(k);
    }),
  } as unknown as StorageAdapter;
  const prisma = {
    rider: table((refs.riders ?? []).map((photoUrl) => ({ photoUrl }))),
    profile: table([]),
    order: table([...(refs.pickup ?? []).map((k) => ({ pickupPhotoKey: k, deliveryProofKey: null })), ...(refs.proof ?? []).map((k) => ({ pickupPhotoKey: null, deliveryProofKey: k }))]),
    merchantDish: table((refs.dish ?? []).map((photoUrl) => ({ photoUrl }))),
    merchant: table([...(refs.cover ?? []).map((k) => ({ coverPhotoUrl: k, logoUrl: null })), ...(refs.logo ?? []).map((k) => ({ coverPhotoUrl: null, logoUrl: k }))]),
  } as unknown as PrismaService;
  return { sweeper: new StorageSweeper(prisma, storage), deleted };
}

describe("StorageSweeper.sweepOrphans (C1 / E2)", () => {
  it("deletes only blobs older than 24 h that no row references, across every upload prefix", async () => {
    const { sweeper, deleted } = harness(
      [
        { key: "kyc/r1/attached.jpg", createdAt: old },
        { key: "kyc/r1/orphan.jpg", createdAt: old },
        { key: "kyc/r1/in-flight.jpg", createdAt: fresh },
        { key: "pickup/r1/attached.jpg", createdAt: old },
        { key: "pickup/r1/orphan.jpg", createdAt: old },
        { key: "delivery-proof/r1/attached.jpg", createdAt: old },
        { key: "delivery-proof/r1/orphan.jpg", createdAt: old },
        { key: "dish/o1/attached.jpg", createdAt: old },
        { key: "dish/o1/orphan.jpg", createdAt: old },
        { key: "banner/o1/cover.jpg", createdAt: old },
        { key: "banner/o1/logo.jpg", createdAt: old },
        { key: "banner/o1/orphan.jpg", createdAt: old },
      ],
      {
        riders: ["kyc/r1/attached.jpg"],
        pickup: ["pickup/r1/attached.jpg"],
        proof: ["delivery-proof/r1/attached.jpg"],
        dish: ["dish/o1/attached.jpg"],
        cover: ["banner/o1/cover.jpg"],
        logo: ["banner/o1/logo.jpg"],
      },
    );
    const res = await sweeper.sweepOrphans(NOW);
    expect(deleted.sort()).toEqual(
      ["kyc/r1/orphan.jpg", "pickup/r1/orphan.jpg", "delivery-proof/r1/orphan.jpg", "dish/o1/orphan.jpg", "banner/o1/orphan.jpg"].sort(),
    );
    expect(res).toEqual({ scanned: 12, deleted: 5 });
  });

  it("never touches an object younger than 24 h, even unreferenced (an upload mid-flow)", async () => {
    const { sweeper, deleted } = harness([{ key: "dish/o1/new.jpg", createdAt: fresh }]);
    await expect(sweeper.sweepOrphans(NOW)).resolves.toEqual({ scanned: 1, deleted: 0 });
    expect(deleted).toEqual([]);
  });

  it("checks references in batches, so a big bucket is not one giant IN (…)", async () => {
    const objects = Array.from({ length: 450 }, (_, i) => ({ key: `pickup/r/${i}.jpg`, createdAt: old }));
    const { sweeper, deleted } = harness(objects, { pickup: ["pickup/r/7.jpg"] });
    await sweeper.sweepOrphans(NOW);
    expect(deleted).toHaveLength(449);
    expect(deleted).not.toContain("pickup/r/7.jpg");
  });
});
