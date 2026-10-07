import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  currentThumbKey,
  makePhotoThumbnail,
  renderThumbnail,
  SAVE_THUMB_SLOTS,
  THUMB_MIN_SIDE,
  THUMB_SAVE_CONCURRENCY,
  THUMB_SOURCE_MAX_BYTES,
  ThumbSlots,
  thumbKeyFor,
} from "./photo-thumbnail";
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
    expect(await makePhotoThumbnail(hangs.storage, "dish/p1/x.jpg", { timeoutMs: 20, slots: new ThumbSlots(2) })).toBeNull();
  });

  it("a stored thumb key is served only while it is the thumb of the current photo", () => {
    expect(thumbKeyFor("dish/p1/a.jpg")).toBe("dish/p1/a.jpg.thumb.jpg");
    expect(currentThumbKey("dish/p1/a.jpg", "dish/p1/a.jpg.thumb.jpg")).toBe("dish/p1/a.jpg.thumb.jpg");
    expect(currentThumbKey("dish/p1/b.jpg", "dish/p1/a.jpg.thumb.jpg")).toBeNull();
    expect(currentThumbKey("dish/p1/a.jpg", null)).toBeNull();
    expect(currentThumbKey(null, "dish/p1/a.jpg.thumb.jpg")).toBeNull();
  });

  it("reads the source with a size cap and the deadline's AbortSignal", async () => {
    const { storage } = memStorage({ "dish/p1/a.jpg": await jpeg(800, 800) });
    await makePhotoThumbnail(storage, "dish/p1/a.jpg", { slots: new ThumbSlots(2) });
    const [key, maxBytes, signal] = vi.mocked(storage.readObject).mock.calls[0]!;
    expect([key, maxBytes]).toEqual(["dish/p1/a.jpg", THUMB_SOURCE_MAX_BYTES]);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("D7 review: thumbnail work is bounded", () => {
  it("the save paths share a gate of 2: a third save while two are in progress skips its thumb without reading", async () => {
    expect(SAVE_THUMB_SLOTS.size).toBe(THUMB_SAVE_CONCURRENCY);
    expect(THUMB_SAVE_CONCURRENCY).toBe(2);
    const slots = new ThumbSlots(2);
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const original = await jpeg(800, 800);
    const { storage, writes } = memStorage({}, { readObject: vi.fn(async () => (await gate, original)) });
    const first = makePhotoThumbnail(storage, "dish/p1/a.jpg", { slots });
    const second = makePhotoThumbnail(storage, "dish/p1/b.jpg", { slots });
    await expect(makePhotoThumbnail(storage, "dish/p1/c.jpg", { slots })).resolves.toBeNull();
    expect(vi.mocked(storage.readObject).mock.calls.map((c) => c[0])).toEqual(["dish/p1/a.jpg", "dish/p1/b.jpg"]);
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual(["dish/p1/a.jpg.thumb.jpg", "dish/p1/b.jpg.thumb.jpg"]);
    expect(writes).toHaveLength(2);
    // The slots come back once the work ends: the next save makes its thumb.
    expect(slots.busy).toBe(0);
    await expect(makePhotoThumbnail(storage, "dish/p1/c.jpg", { slots })).resolves.toBe("dish/p1/c.jpg.thumb.jpg");
  });

  it("at the deadline the read is aborted, nothing is written, and the slot stays held until the work really stops", async () => {
    const slots = new ThumbSlots(1);
    let release!: () => void;
    const late = new Promise<void>((r) => (release = r));
    let seenSignal: AbortSignal | undefined;
    const original = await jpeg(800, 800);
    const { storage, writes } = memStorage(
      {},
      {
        readObject: vi.fn(async (_k: string, _max: number, signal?: AbortSignal) => {
          seenSignal = signal;
          await late; // a store that ignores the signal and answers late
          return original;
        }),
      },
    );
    await expect(makePhotoThumbnail(storage, "dish/p1/a.jpg", { timeoutMs: 20, slots })).resolves.toBeNull();
    expect(seenSignal?.aborted).toBe(true);
    expect(slots.busy).toBe(1);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(writes).toEqual([]);
    expect(slots.busy).toBe(0);
  });

  it("only JPEG and PNG are decoded; anything else is refused before decoding", async () => {
    const webp = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#123456" } }).webp().toBuffer();
    await expect(renderThumbnail(webp)).rejects.toThrow(/not a JPEG or PNG \(webp\)/);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600"/></svg>');
    await expect(renderThumbnail(svg)).rejects.toThrow(/not a JPEG or PNG/);
  });

  it("refuses a source over 12 MP (a decompression bomb)", async () => {
    const big = await sharp({ create: { width: 4000, height: 3200, channels: 3, background: "#000000" } }).jpeg({ quality: 30 }).toBuffer();
    await expect(renderThumbnail(big)).rejects.toThrow(/pixel limit/i);
  });
});
