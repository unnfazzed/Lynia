import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { backfillPhotoThumbnails, type BackfillPrisma } from "./photo-thumbnail-backfill";
import type { StorageAdapter } from "./storage.interface";

type Row = Record<string, string | null>;

/** A tiny in-memory table honouring what the backfill asks of Prisma: `not: null` / `gt` / OR filters,
 *  Prisma-style cursor paging (a cursor row that no longer exists gives an EMPTY page, as Prisma does),
 *  and a guarded `updateMany`. */
function table(rows: Row[]) {
  const matches = (r: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([col, cond]) => {
      if (col === "OR") return (cond as Array<Record<string, unknown>>).some((c) => matches(r, c));
      if (cond && typeof cond === "object" && "not" in cond) return r[col] != null;
      if (cond && typeof cond === "object" && "gt" in cond) return String(r[col]) > String((cond as { gt: string }).gt);
      return r[col] === cond;
    });
  return {
    rows,
    findMany: vi.fn(async (args: { where: Record<string, unknown>; take: number; cursor?: { id: string } }) => {
      const sorted = rows.filter((r) => matches(r, args.where)).sort((a, b) => a.id!.localeCompare(b.id!));
      if (args.cursor && !sorted.some((r) => r.id === args.cursor!.id)) return [];
      const from = args.cursor ? sorted.findIndex((r) => r.id === args.cursor!.id) + 1 : 0;
      return sorted.slice(from, from + args.take).map((r) => ({ ...r }));
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
  };
}

async function harness() {
  const photo = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#884422" } }).jpeg().toBuffer();
  const objects = new Map<string, Buffer>([
    ["dish/p1/a.jpg", photo],
    ["dish/p1/b.jpg", photo],
    ["dish/p1/done.jpg", photo],
    ["dish/p1/done.jpg.thumb.jpg", photo],
    ["banner/p1/cover.jpg", photo],
    ["banner/p1/logo.png", photo],
  ]);
  const storage = {
    stat: vi.fn(async (k: string) => (objects.has(k) ? { size: objects.get(k)!.length, contentType: "image/jpeg", etag: null } : null)),
    readObject: vi.fn(async (k: string) => objects.get(k) ?? null),
    writeObject: vi.fn(async (k: string, body: Buffer) => void objects.set(k, body)),
  } as unknown as StorageAdapter;
  const dishes = table([
    { id: "d1", photoUrl: "dish/p1/a.jpg", photoThumbKey: null },
    // A stale thumb (the photo changed and its thumb failed) is redone.
    { id: "d2", photoUrl: "dish/p1/b.jpg", photoThumbKey: "dish/p1/old.jpg.thumb.jpg" },
    { id: "d3", photoUrl: "dish/p1/done.jpg", photoThumbKey: "dish/p1/done.jpg.thumb.jpg" },
    { id: "d4", photoUrl: null, photoThumbKey: null },
    // Its photo is gone from the bucket: counted as failed, left alone.
    { id: "d5", photoUrl: "dish/p1/lost.jpg", photoThumbKey: null },
  ]);
  const merchants = table([{ id: "m1", coverPhotoUrl: "banner/p1/cover.jpg", logoUrl: "banner/p1/logo.png", coverThumbKey: null, logoThumbKey: null }]);
  const prisma = { merchantDish: dishes, merchant: merchants } as unknown as BackfillPrisma;
  return { prisma, storage, dishes, merchants, objects };
}

describe("backfillPhotoThumbnails (D7)", () => {
  it("a dry run counts what it would make and writes nothing", async () => {
    const h = await harness();
    const counts = await backfillPhotoThumbnails(h.prisma, h.storage, { apply: false, pageSize: 2 });
    expect(counts).toEqual({ scanned: 6, skipped: 1, made: 5, failed: 0 });
    expect(h.storage.writeObject).not.toHaveBeenCalled();
    expect(h.dishes.updateMany).not.toHaveBeenCalled();
  });

  it("makes and records every missing or stale thumb, paging by id, and a second run is a no-op", async () => {
    const h = await harness();
    const first = await backfillPhotoThumbnails(h.prisma, h.storage, { apply: true, pageSize: 2, concurrency: 2 });
    expect(first).toEqual({ scanned: 6, skipped: 1, made: 4, failed: 1 });
    expect(h.dishes.rows.map((r) => r.photoThumbKey)).toEqual([
      "dish/p1/a.jpg.thumb.jpg",
      "dish/p1/b.jpg.thumb.jpg",
      "dish/p1/done.jpg.thumb.jpg",
      null,
      null,
    ]);
    expect(h.merchants.rows[0]).toMatchObject({ coverThumbKey: "banner/p1/cover.jpg.thumb.jpg", logoThumbKey: "banner/p1/logo.png.thumb.jpg" });
    // Originals are never overwritten.
    expect(vi.mocked(h.storage.writeObject).mock.calls.map((c) => c[0]).every((k) => k.endsWith(".thumb.jpg"))).toBe(true);

    vi.mocked(h.storage.writeObject).mockClear();
    const second = await backfillPhotoThumbnails(h.prisma, h.storage, { apply: true, pageSize: 2 });
    expect(second).toEqual({ scanned: 6, skipped: 5, made: 0, failed: 1 });
    expect(h.storage.writeObject).not.toHaveBeenCalled();
  });

  it("resumes without trusting a thumb that merely exists: an unrecorded (maybe truncated) thumb is made again", async () => {
    const h = await harness();
    h.objects.set("dish/p1/a.jpg.thumb.jpg", Buffer.from("half a jpeg"));
    const counts = await backfillPhotoThumbnails(h.prisma, h.storage, { apply: true });
    expect(counts.failed).toBe(1); // only d5, whose photo is gone
    expect(h.dishes.rows[0]!.photoThumbKey).toBe("dish/p1/a.jpg.thumb.jpg");
    expect((await sharp(h.objects.get("dish/p1/a.jpg.thumb.jpg")!).metadata()).format).toBe("jpeg");
  });

  it("a row deleted mid-run never ends the walk early (pages are `id > last`, not a cursor row)", async () => {
    const h = await harness();
    // Page 1 is d1, d2 (pageSize 2); d2 — the last id of that page — is deleted while the page is worked.
    vi.mocked(h.storage.readObject).mockImplementationOnce(async (k: string) => {
      const i = h.dishes.rows.findIndex((r) => r.id === "d2");
      h.dishes.rows.splice(i, 1);
      return h.objects.get(k) ?? null;
    });
    const counts = await backfillPhotoThumbnails(h.prisma, h.storage, { apply: true, pageSize: 2, concurrency: 1 });
    // d3 (already done) and d5 (photo gone) on the later pages were still reached, and so were the shops.
    expect(counts.scanned).toBe(6);
    expect(h.merchants.rows[0]).toMatchObject({ coverThumbKey: "banner/p1/cover.jpg.thumb.jpg" });
  });

  it("never records a thumb onto a row whose photo changed mid-run", async () => {
    const h = await harness();
    // The merchant swaps d1's photo between the read and the write.
    vi.mocked(h.storage.readObject).mockImplementationOnce(async (k: string) => {
      h.dishes.rows[0]!.photoUrl = "dish/p1/new.jpg";
      return h.objects.get(k) ?? null;
    });
    await backfillPhotoThumbnails(h.prisma, h.storage, { apply: true, concurrency: 1 });
    expect(h.dishes.rows[0]).toMatchObject({ photoUrl: "dish/p1/new.jpg", photoThumbKey: null });
  });
});
