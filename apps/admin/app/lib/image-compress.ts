/**
 * Admin assist: a logo or cover ops uploads for a business must land under the same 250 KB banner budget
 * the API enforces on the owner's. The merchant web's apps/merchant/app/lib/image-compress.ts, trimmed to
 * what the console needs: the automatic centre crop (no drag-and-zoom frame), then quality and size steps
 * until the JPEG fits. Keep the numbers in step with that file.
 */

export const BANNER_MAX_BYTES = 250 * 1024;

/** width/height and long-edge cap per photo, as on the merchant web (MAX_DIMENSION_BY_KIND). */
export const SHOP_FRONT_PHOTO = {
  logo: { aspect: 1, maxDimension: 512 },
  cover: { aspect: 3, maxDimension: 1600 },
} as const;

export function centerCropRect(sourceWidth: number, sourceHeight: number, aspect: number): { x: number; y: number; width: number; height: number } {
  if (sourceWidth / sourceHeight > aspect) {
    const width = sourceHeight * aspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / aspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

const MAX_QUALITY_PASSES = 8;

/** Steps the JPEG quality down (floor 0.35) at each long edge, then the long edge down, until it fits. */
export async function encodeUnderBudget(encode: (maxDimension: number, quality: number) => Promise<Blob>, maxBytes: number, maxDimension: number): Promise<Blob> {
  let blob: Blob | null = null;
  for (const dimension of [maxDimension, ...[1200, 800, 600, 400].filter((d) => d < maxDimension)]) {
    let quality = 0.9;
    blob = await encode(dimension, quality);
    for (let pass = 0; blob.size > maxBytes && pass < MAX_QUALITY_PASSES; pass += 1) {
      const next = Math.max(0.35, quality * 0.82);
      if (next === quality) break;
      quality = next;
      blob = await encode(dimension, quality);
    }
    if (blob.size <= maxBytes) return blob;
  }
  return blob!;
}

/** Browser-only (canvas): centre-crop `file` to `aspect` and encode it as a JPEG under `maxBytes`. */
export async function compressImage(file: File, opts: { aspect: number; maxDimension: number; maxBytes: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centerCropRect(bitmap.width, bitmap.height, opts.aspect);
    const encode = (maxDimension: number, quality: number): Promise<Blob> => {
      const scale = Math.min(1, maxDimension / Math.max(crop.width, crop.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(crop.width * scale);
      canvas.height = Math.round(crop.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.reject(new Error("Couldn't prepare the photo — try a different browser."));
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo — try a different browser."))), "image/jpeg", quality),
      );
    };
    return await encodeUnderBudget(encode, opts.maxBytes, opts.maxDimension);
  } finally {
    bitmap.close();
  }
}
