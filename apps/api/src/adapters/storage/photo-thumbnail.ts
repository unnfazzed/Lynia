import { Logger } from "@nestjs/common";
import type { StorageAdapter } from "./storage.interface";

/**
 * D7 (owner 2026-10-07, findings P04 / MJ-RL20): the small variant of a menu dish / shop item / shop cover
 * / logo photo. The full photo (up to 1600 px, ~300 KB) is what the merchant uploads; every list row,
 * tile, rail card and 40 px swap thumbnail draws it at 40-148 dp, so the customer menu used to download
 * megabytes it then downsampled on decode. The thumb is made on the server when the photo key is saved
 * (and by `scripts/backfill-photo-thumbnails.ts` for photos saved before this), stored NEXT TO the
 * original under a derived key, never over it.
 *
 * JPEG, because every client renders it: expo-image (Android/iOS), react-native-web and the merchant
 * web's plain `<img>`.
 */

/** The thumb lives at `<photo key>.thumb.jpg`, in the photo's own upload namespace. */
export const THUMB_SUFFIX = ".thumb.jpg";
/**
 * The thumb's SHORTER side, in px (`fit: "outside"`): a 3:1 cover keeps enough height for the 104 dp
 * square tile it is cropped into, and the largest thumb consumer (the 148 dp Popular card) is ~3x of
 * it. Never upscaled: a photo already smaller stays its size.
 */
export const THUMB_MIN_SIDE = 400;
export const THUMB_JPEG_QUALITY = 72;
/** How long a save waits for its thumb before going ahead without one (the backfill picks it up). */
export const THUMB_SAVE_TIMEOUT_MS = 5_000;
/** Well above any merchant photo (1600 x 1600 is 2.6 MP; a 12 MP phone original is the most a hand-placed
 *  object could be): refuse a decompression bomb outright. */
export const MAX_INPUT_PIXELS = 12_000_000;
/** Largest source photo the thumbnailer will read: far above the 300 KB / 250 KB upload budgets. */
export const THUMB_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
/** Thumbnails made at once by save paths, process-wide. A save that finds it full skips its thumb. */
export const THUMB_SAVE_CONCURRENCY = 2;
/** A slot whose work still hasn't settled this long after it started is given back regardless. */
const SLOT_HARD_CEILING_MS = 60_000;

export function thumbKeyFor(photoKey: string): string {
  return `${photoKey}${THUMB_SUFFIX}`;
}

/**
 * The thumb key to serve for this photo, or null. A stored thumb key is trusted only while it is the
 * thumb OF the current photo key, so a stale one (the photo changed and its thumb failed) is never
 * served for the new photo.
 */
export function currentThumbKey(photoKey: string | null | undefined, storedThumbKey: string | null | undefined): string | null {
  return photoKey && storedThumbKey && storedThumbKey === thumbKeyFor(photoKey) ? storedThumbKey : null;
}

/** Formats the thumbnailer decodes: the two the upload path accepts (upload-verifier.ts). */
const DECODABLE_FORMATS = new Set(["jpeg", "png"]);

/** JPEG thumbnail of an image buffer. Throws on an undecodable input, or one that is not a JPEG or PNG. */
export async function renderThumbnail(input: Buffer): Promise<Buffer> {
  // Loaded on first use: an API whose native image binary fails to load still boots and saves photos;
  // it just makes no thumbs (every caller falls back to the full photo).
  const sharp = (await import("sharp")).default;
  const options = { failOn: "error" as const, limitInputPixels: MAX_INPUT_PIXELS };
  // Read the header first: only JPEG and PNG reach the full decoder (no SVG, TIFF, HEIF… parsing).
  const { format } = await sharp(input, options).metadata();
  if (!format || !DECODABLE_FORMATS.has(format)) throw new Error(`not a JPEG or PNG (${format ?? "unknown"})`);
  return sharp(input, options)
    .rotate() // bake in EXIF orientation before the metadata is dropped
    .resize({ width: THUMB_MIN_SIDE, height: THUMB_MIN_SIDE, fit: "outside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }) // a transparent PNG logo must not turn black as a JPEG
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** A counting gate: `tryAcquire` takes a slot or says it's full, never waits. */
export class ThumbSlots {
  private inUse = 0;
  constructor(readonly size: number) {}
  tryAcquire(): boolean {
    if (this.inUse >= this.size) return false;
    this.inUse++;
    return true;
  }
  release(): void {
    this.inUse = Math.max(0, this.inUse - 1);
  }
  get busy(): number {
    return this.inUse;
  }
}

/** The process-wide gate every save path shares: at most {@link THUMB_SAVE_CONCURRENCY} thumbs at once. */
export const SAVE_THUMB_SLOTS = new ThumbSlots(THUMB_SAVE_CONCURRENCY);

export interface MakeThumbnailOptions {
  timeoutMs?: number;
  /** The concurrency gate; `null` = none (the backfill bounds its own concurrency). */
  slots?: ThumbSlots | null;
}

const logger = new Logger("PhotoThumbnail");

/**
 * Read the photo at `photoKey`, write its thumb at {@link thumbKeyFor}, and return that key. NEVER
 * throws and never rejects: on any failure (gate full, missing or oversized object, undecodable bytes,
 * storage error, image library unavailable, or `timeoutMs` elapsed) it logs and returns null, and the
 * caller saves the photo without a thumb — readers then serve the full photo, exactly the behaviour
 * before D7.
 *
 * The deadline is real, not just a stopped wait: the storage calls get an AbortSignal (where the SDK
 * takes one), the thumb is never written once the deadline has passed, and the gate slot is held until
 * the work has actually stopped, so a hung read can't let more work pile up behind it.
 */
export async function makePhotoThumbnail(storage: StorageAdapter, photoKey: string, opts: MakeThumbnailOptions = {}): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? THUMB_SAVE_TIMEOUT_MS;
  const slots = opts.slots === undefined ? SAVE_THUMB_SLOTS : opts.slots;
  if (slots && !slots.tryAcquire()) {
    logger.warn(`Skipped the thumbnail for ${photoKey}: ${slots.size} already in progress (the backfill can make it later)`);
    return null;
  }
  const deadline = new AbortController();
  const work = (async (): Promise<string | null> => {
    const original = await storage.readObject(photoKey, THUMB_SOURCE_MAX_BYTES, deadline.signal);
    if (!original) return null;
    deadline.signal.throwIfAborted();
    const thumb = await renderThumbnail(original);
    // Past the deadline the save has already gone ahead without a thumb: writing one now would leave an
    // object nothing records.
    deadline.signal.throwIfAborted();
    const key = thumbKeyFor(photoKey);
    await storage.writeObject(key, thumb, "image/jpeg", deadline.signal);
    return key;
  })();
  // The slot is freed when the work really ends, not when the caller stops waiting for it, with a hard
  // ceiling so a storage call that never settles (the GCS client takes no signal) can't hold it forever.
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    slots?.release();
  };
  void work.then(release, release);
  setTimeout(release, SLOT_HARD_CEILING_MS).unref?.();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      deadline.abort(new Error(`thumbnail deadline of ${timeoutMs} ms passed`));
      resolve(null);
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    const key = await Promise.race([work, timeout]);
    if (!key) logger.warn(`No thumbnail for ${photoKey} (missing photo or timed out); serving the full photo`);
    return key;
  } catch (err) {
    logger.warn(`Thumbnail for ${photoKey} failed (serving the full photo): ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
    // A late failure after the timeout must not surface as an unhandled rejection.
    work.catch(() => undefined);
  }
}
