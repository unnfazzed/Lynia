import * as ImageManipulator from "expo-image-manipulator";
import type { ImageContentType } from "../api/uploads";

/**
 * Client-side image downscale before upload (deferred 07-08 item). Camera photos on even a cheap
 * Android are 3–8 MB at 3000–4000px; the KYC selfie and the proof-of-pickup photo are viewed at card
 * size, so shipping full resolution over this market's flaky, expensive data is pure waste. Resizing
 * to a 1280px long edge + JPEG ~0.7 lands around 150–400 KB — a 10–20× data saving per upload.
 *
 * Design rule: the optimizer must NEVER block the flow. Any manipulation failure (corrupt file,
 * native module missing, OOM on a low-end phone) falls back to uploading the original bytes.
 *
 * NOTE: expo-image-manipulator is a NATIVE module — this ships with the next EAS build, not OTA.
 */

/** Long-edge cap for an uploaded photo. 1280px comfortably out-resolves every card/review surface
 *  these photos render on while cutting a 4000px camera frame ~10× by area. */
export const MAX_UPLOAD_DIMENSION = 1280;
/** JPEG quality for the re-encode — the visually-transparent-at-card-size sweet spot. */
export const UPLOAD_JPEG_QUALITY = 0.7;

/** A local image as the picker hands it over: file uri, pixel dimensions when known, and the
 *  content type the bytes actually are (what a presigned PUT must be minted over). */
export interface UploadImageSource {
  uri: string;
  width?: number;
  height?: number;
  contentType: ImageContentType;
}

/**
 * Pure decision logic: the single-axis resize action for an image of the given dimensions, or null
 * for "leave it alone". Single-axis because expo-image-manipulator preserves aspect ratio when only
 * one axis is given — constraining the LONG edge to {@link MAX_UPLOAD_DIMENSION} bounds both.
 * Null when the image is already within bounds (re-encoding a small image only degrades it) or when
 * dimensions are unknown/nonsense (we can't tell a thumbnail from a poster, and blindly resizing
 * would UPSCALE small images — skipping is the safe, cheap default).
 */
export function computeResizeTarget(
  width: number | undefined,
  height: number | undefined,
): { width: number } | { height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) return null;
  if (width! <= MAX_UPLOAD_DIMENSION && height! <= MAX_UPLOAD_DIMENSION) return null;
  return width! >= height! ? { width: MAX_UPLOAD_DIMENSION } : { height: MAX_UPLOAD_DIMENSION };
}

/**
 * Downscale + JPEG-compress a picked/captured image for upload. Returns the file to actually PUT:
 * the resized JPEG when downscaling applies and succeeds, otherwise the ORIGINAL source untouched —
 * this function never throws and never blocks the flow on the optimizer.
 *
 * The returned contentType is authoritative for the presign: the manipulator always emits JPEG here,
 * so a PNG source that gets downscaled must be presigned (and PUT) as image/jpeg, not its old type.
 */
export async function downscaleForUpload(source: UploadImageSource): Promise<{ uri: string; contentType: ImageContentType }> {
  const target = computeResizeTarget(source.width, source.height);
  if (!target) return { uri: source.uri, contentType: source.contentType };
  try {
    const result = await ImageManipulator.manipulateAsync(source.uri, [{ resize: target }], {
      compress: UPLOAD_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, contentType: "image/jpeg" };
  } catch {
    // Fall back to the original bytes — a failed optimization must cost data, never the upload.
    return { uri: source.uri, contentType: source.contentType };
  }
}
