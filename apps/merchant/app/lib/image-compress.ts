/**
 * D-32 "we compress on the merchant's behalf and say so": a 4MB camera photo has to land under the
 * dish (300KB)/banner (250KB) budget the signed upload URL enforces server-side. Canvas-based resize +
 * iterative JPEG-quality reduction — the browser equivalent of apps/mobile's
 * src/logic/image-downscale.ts, which can't be reused directly (React Native `Image`/`expo-image-
 * manipulator` vs. this app's plain DOM `Image`/`<canvas>`).
 *
 * Scope cut, flagged rather than silently decided: the gallery mock (r-merchant.jsx RM.shop_crop /
 * RM.dish_photo) shows an interactive drag-and-zoom crop frame before the compress step. This ships
 * the compress+preview half of D-32 without that interaction — the source image is center-cropped to
 * the target aspect ratio automatically, with no reposition/zoom control. A real drag-to-reposition
 * crop UI is a follow-up, not built here.
 */

export interface CompressOptions {
  maxBytes: number;
  /** width/height, e.g. 3/1 for the cover banner, 1/1 for a dish or logo photo. */
  aspect: number;
  /** Long-edge cap in device pixels — keeps the canvas (and therefore the first-pass JPEG) small
   *  before quality reduction even starts, so a 4000px camera photo doesn't do 10 wasted encode passes. */
  maxDimension: number;
}

/** Starts high and steps down by a fixed ratio each pass — few enough steps that a slow tablet GPU
 *  doesn't stall the UI for seconds, coarse enough that landing under budget rarely takes more than
 *  4-5 passes for a real camera photo. Floors at 0.35: below that JPEG artifacting makes a food photo
 *  actively worse, so a photo that still won't fit at 0.35 is capped there rather than degraded further
 *  (the signed URL's own size range is the final backstop either way). */
export function nextQuality(current: number): number {
  return Math.max(0.35, current * 0.82);
}

/** The source-crop rectangle (in source pixels) that centers the target aspect ratio inside the
 *  source image — the "automatic center-crop" half of the D-32 scope cut above. Pure and unit-tested;
 *  the canvas draw itself just consumes this rectangle. */
export function centerCropRect(sourceWidth: number, sourceHeight: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > aspect) {
    // Source is wider than the target — crop the sides.
    const width = sourceHeight * aspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  // Source is taller than (or equal to) the target — crop top/bottom.
  const height = sourceWidth / aspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

/** Output canvas dimensions: the crop rect's own aspect, capped at `maxDimension` on the long edge. */
export function outputDimensions(cropWidth: number, cropHeight: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
  return { width: Math.round(cropWidth * scale), height: Math.round(cropHeight * scale) };
}

const MAX_QUALITY_PASSES = 8;

/** Side-effecting (Canvas/Image are browser-only, so this never runs under the app's node-environment
 *  vitest config — apps/merchant/vitest.config.ts, matching how apps/mobile's uploadImage is likewise
 *  untested at the DOM/network boundary). Draws the center-cropped source into a canvas sized by
 *  {@link outputDimensions}, then re-encodes at decreasing JPEG quality (via {@link nextQuality}) until
 *  the blob is under `maxBytes` or the pass budget runs out — whichever first. */
export async function compressImage(file: File, opts: CompressOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centerCropRect(bitmap.width, bitmap.height, opts.aspect);
    const { width, height } = outputDimensions(crop.width, crop.height, opts.maxDimension);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't prepare the photo for upload — try a different browser.");
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, quality);
    for (let pass = 0; blob.size > opts.maxBytes && pass < MAX_QUALITY_PASSES; pass += 1) {
      quality = nextQuality(quality);
      blob = await canvasToBlob(canvas, quality);
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo for upload — try a different browser."))),
      "image/jpeg",
      quality,
    );
  });
}
