import { apiFetch } from "./client";

export type ImageContentType = "image/jpeg" | "image/png";

export interface UploadTarget {
  uploadUrl: string;
  key: string;
}

// Mirrors client.ts REQUEST_TIMEOUT_MS — the signed-URL PUT bypasses apiFetch (raw binary to GCS)
// but must fail into the friendly-error path just as fast.
const UPLOAD_TIMEOUT_MS = 15_000;

/** Ask the backend for a short-lived signed PUT URL + the object key to persist (the rider's KYC photo). */
export function requestKycPhotoUpload(contentType: ImageContentType): Promise<UploadTarget> {
  return apiFetch("/uploads/kyc-photo", { method: "POST", body: { contentType } });
}

/**
 * PUT the local image file straight to the signed URL — NOT via apiFetch: this is a raw binary upload
 * to GCS with no bearer token, and the Content-Type must match the one the signature was minted for.
 * (If on-device blob upload proves flaky, swap to expo-file-system `uploadAsync` with BINARY_CONTENT.)
 */
export async function uploadImage(uploadUrl: string, fileUri: string, contentType: ImageContentType): Promise<void> {
  const blob = await (await fetch(fileUri)).blob();
  // Same 15s bound apiFetch puts on every request: on a constrained link a stalled PUT would
  // otherwise hang behind the in-button spinner for the OS default (tens of seconds, or forever).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The upload timed out — check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}
