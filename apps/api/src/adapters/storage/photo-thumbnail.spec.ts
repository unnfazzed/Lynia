import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { currentThumbKey, makePhotoThumbnail, renderThumbnail, THUMB_MIN_SIDE, thumbKeyFor } from "./photo-thumbnail";
import type { StorageAdapter } from "./storage.interface";

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg({ quality: 90 })
    .toBuffer();

function memStorage(objects: Record<string, Buffer>, over: Partial<StorageAdapter> = {}) {
  const writes: Array<{ key: string; body: Buffer; contentType: string }> = [];
  const storage = {
    readObject: vi.fn(async (key: string) => objects[key] ?? null),
    writeObject: vi.fn(async (key: string, body: Buffer, contentType: string) => {
      writes.push({ key, body, contentType });
    }),
    ...over,
  } as unknown as StorageAdapter;
  return { storage, writes };
}

describe("photo thumbnails (D7: P04 / MJ-RL20)", () => {
  it("renders a JPEG whose shorter side is 400 px, keeping the aspect ratio", async () => {
    const dish = await sharp(await renderThumbnail(await jpeg(1600, 1200))).metadata();
    expect(dish).toMatchObject({ format: "jpeg", width: 533, height: THUMB_MIN_SIDE });
    // A 3:1 cover keeps 400 px of height for the square tile it is cropped into.
    const cover = await sharp(await renderThumbnail(await jpeg(1600, 533))).metadata();
    expect(cover).toMatchObject({ width: 1201, height: THUMB_MIN_SIDE });
  });

  it("never upscales a photo already smaller than the thumb", async () => {
    const meta = await sharp(await renderThumbnail(await jpeg(256, 256))).metadata();
    expect(meta).toMatchObject({ width: 256, height: 256 });
  });

  it("flattens a transparent PNG logo onto white instead of black", async () => {
    const png = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { data } = await sharp(await renderThumbnail(png)).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });

  it("is a fraction of the original's bytes", async () => {
    const original = await jpeg(1600, 1600);
    const thumb = await renderThumbnail(original);
    expect(thumb.length).toBeLessThan(original.length);
  });

  it("makePhotoThumbnail writes the thumb next to the photo, never over it", async () => {
    const { storage, writes } = memStorage({ "dish/p1/a.jpg": await jpeg(1600, 1600) });
    await expect(makePhotoThumbnail(storage, "dish/p1/a.jpg")).resolves.toBe("dish/p1/a.jpg.thumb.jpg");
    expect(writes.map((w) => [w.key, w.contentType])).toEqual([["dish/p1/a.jpg.thumb.jpg", "image/jpeg"]]);
    expect((await sharp(writes[0]!.body).metadata()).width).toBe(400);
  });

  it("never throws: a missing photo, undecodable bytes, a storage error or a timeout all give null", async () => {
    expect(await makePhotoThumbnail(memStorage({}).storage, "dish/p1/missing.jpg")).toBeNull();
    const garbage = memStorage({ "dish/p1/x.jpg": Buffer.from("not an image at all") });
    expect(await makePhotoThumbnail(garbage.storage, "dish/p1/x.jpg")).toBeNull();
    expect(garbage.writes).toEqual([]);
    const readFails = memStorage({}, { readObject: vi.fn(async () => Promise.reject(new Error("503"))) });
    expect(await makePhotoThumbnail(readFails.storage, "dish/p1/x.jpg")).toBeNull();
    const writeFails = memStorage({ "dish/p1/x.jpg": await jpeg(800, 800) }, { writeObject: vi.fn(async () => Promise.reject(new Error("403"))) });
    expect(await makePhotoThumbnail(writeFails.storage, "dish/p1/x.jpg")).toBeNull();
    const hangs = memStorage({}, { readObject: vi.fn(() => new Promise<Buffer | null>(() => undefined)) });
    expect(await makePhotoThumbnail(hangs.storage, "dish/p1/x.jpg", 20)).toBeNull();
  });

  it("a stored thumb key is served only while it is the thumb of the current photo", () => {
    expect(thumbKeyFor("dish/p1/a.jpg")).toBe("dish/p1/a.jpg.thumb.jpg");
    expect(currentThumbKey("dish/p1/a.jpg", "dish/p1/a.jpg.thumb.jpg")).toBe("dish/p1/a.jpg.thumb.jpg");
    expect(currentThumbKey("dish/p1/b.jpg", "dish/p1/a.jpg.thumb.jpg")).toBeNull();
    expect(currentThumbKey("dish/p1/a.jpg", null)).toBeNull();
    expect(currentThumbKey(null, "dish/p1/a.jpg.thumb.jpg")).toBeNull();
  });
});
