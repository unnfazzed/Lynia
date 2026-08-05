/**
 * D-32 "we compress on the merchant's behalf and say so": a 4MB camera photo has to land under the
 * dish (300KB)/banner (250KB) budget the signed upload URL enforces server-side. Canvas-based resize +
 * iterative JPEG-quality reduction — the browser equivalent of apps/mobile's
 * src/logic/image-downscale.ts, which can't be reused directly (React Native `Image`/`expo-image-
 * manipulator` vs. this app's plain DOM `Image`/`<canvas>`).
 *
 * M4·6 / M5·2 (r-merchant.jsx:1450-1479, 1378-1402) add the drag-and-zoom crop frame in front of this
 * step. The interaction lives in components/menu/PhotoCropSheet.tsx; the only thing it needs from here
 * is the ability to hand `compressImage` an explicit source rectangle instead of the automatic centre
 * crop — see {@link CompressOptions.crop} and {@link cropRectFromView}. No new dependency: the frame is
 * pointer events over the same `<canvas>` draw this file already does.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompressOptions {
  maxBytes: number;
  /** width/height, e.g. 3/1 for the cover banner, 1/1 for a dish or logo photo. */
  aspect: number;
  /** Long-edge cap in device pixels — keeps the canvas (and therefore the first-pass JPEG) small
   *  before quality reduction even starts, so a 4000px camera photo doesn't do 10 wasted encode passes. */
  maxDimension: number;
  /** M4·6/M5·2: the merchant's own reposition, in SOURCE pixels. Omitted = the automatic centre crop
   *  {@link centerCropRect} still used by any caller that doesn't offer the frame. */
  crop?: CropRect;
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
 *  source image — the default when the caller offers no reposition frame, and the `zoom: 1, centred`
 *  starting point {@link cropRectFromView} pans and zooms away from. Pure and unit-tested; the canvas
 *  draw itself just consumes this rectangle. */
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

/** M4·6/M5·2's frame state: `zoom` 1 = the whole {@link centerCropRect} fills the dashed frame,
 *  2 = twice as close. `panX`/`panY` are normalised in [-1, 1] — how far off-centre the visible
 *  rectangle sits inside the slack the current zoom leaves, so the same pair stays meaningful when the
 *  zoom changes. Clamped here rather than at the pointer handler, so the crop can never escape the
 *  source image no matter what a drag does. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function cropRectFromView(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
  view: { zoom: number; panX: number; panY: number },
): CropRect {
  const base = centerCropRect(sourceWidth, sourceHeight, aspect);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const width = base.width / zoom;
  const height = base.height / zoom;
  // Slack is measured against the WHOLE source, not just the base rect: zooming in on a 3:1 banner
  // frees vertical room the un-zoomed centre crop never had, and the merchant should be able to use it.
  const slackX = (sourceWidth - width) / 2;
  const slackY = (sourceHeight - height) / 2;
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  return {
    x: slackX + clamp(view.panX) * slackX,
    y: slackY + clamp(view.panY) * slackY,
    width,
    height,
  };
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
    const crop = opts.crop ?? centerCropRect(bitmap.width, bitmap.height, opts.aspect);
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
