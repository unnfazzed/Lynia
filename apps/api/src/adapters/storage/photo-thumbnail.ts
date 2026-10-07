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
/** Far above any merchant photo (1600 x 1600 is 2.6 MP): refuse a decompression bomb outright. */
const MAX_INPUT_PIXELS = 40_000_000;

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

/** JPEG thumbnail of an image buffer. Throws on an undecodable input. */
export async function renderThumbnail(input: Buffer): Promise<Buffer> {
  // Loaded on first use: an API whose native image binary fails to load still boots and saves photos;
  // it just makes no thumbs (every caller falls back to the full photo).
  const sharp = (await import("sharp")).default;
  return sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // bake in EXIF orientation before the metadata is dropped
    .resize({ width: THUMB_MIN_SIDE, height: THUMB_MIN_SIDE, fit: "outside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }) // a transparent PNG logo must not turn black as a JPEG
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

const logger = new Logger("PhotoThumbnail");

/**
 * Read the photo at `photoKey`, write its thumb at {@link thumbKeyFor}, and return that key. NEVER
 * throws and never rejects: on any failure (missing object, undecodable bytes, storage error, image
 * library unavailable, or `timeoutMs` elapsed) it logs and returns null, and the caller saves the
 * photo without a thumb — readers then serve the full photo, exactly the behaviour before D7.
 */
export async function makePhotoThumbnail(
  storage: StorageAdapter,
  photoKey: string,
  timeoutMs: number = THUMB_SAVE_TIMEOUT_MS,
): Promise<string | null> {
  const work = (async (): Promise<string | null> => {
    const original = await storage.readObject(photoKey);
    if (!original) return null;
    const thumb = await renderThumbnail(original);
    const key = thumbKeyFor(photoKey);
    await storage.writeObject(key, thumb, "image/jpeg");
    return key;
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
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
