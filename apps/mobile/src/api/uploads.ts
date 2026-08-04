import { STANDARD_TIMEOUT_MS } from "../net/network-policy";
import { apiFetch } from "./client";

export type ImageContentType = "image/jpeg" | "image/png";

export interface UploadTarget {
  uploadUrl: string;
  key: string;
  /** Exact headers the signed PUT must carry (Content-Type + the size-range bound). The signature is
   *  minted over these, so the PUT fails if they don't match. Optional for backward-compat with an
   *  older API that only signed the content type. */
  headers?: Record<string, string>;
}

/** Ask the backend for a short-lived signed PUT URL + the object key to persist (the rider's KYC photo). */
export function requestKycPhotoUpload(contentType: ImageContentType): Promise<UploadTarget> {
  return apiFetch("/uploads/kyc-photo", { method: "POST", body: { contentType } });
}

/** Same mint for the rider's proof-of-pickup photo (§5c): PUT the bytes to `uploadUrl`, then attach
 *  the returned `key` via attachPickupPhoto (orders.ts). */
export function requestPickupPhotoUpload(contentType: ImageContentType): Promise<UploadTarget> {
  return apiFetch("/uploads/pickup-photo", { method: "POST", body: { contentType } });
}

/** Same mint for the rider's proof-of-drop photo (KB-POD-DISPUTE Phase A): PUT the bytes, then attach
 *  the returned `key` (with GPS) via attachDeliveryProof (orders.ts). */
export function requestDeliveryProofUpload(contentType: ImageContentType): Promise<UploadTarget> {
  return apiFetch("/uploads/delivery-proof", { method: "POST", body: { contentType } });
}

/**
 * PUT the local image file straight to the signed URL — NOT via apiFetch: this is a raw binary upload
 * to GCS with no bearer token. The signature is minted over an exact header set (Content-Type, and now
 * a size-range bound), so the PUT must send those exact `headers` from the mint response or GCS rejects
 * it. Falls back to just the Content-Type for an older API that didn't return headers.
 * (If on-device blob upload proves flaky, swap to expo-file-system `uploadAsync` with BINARY_CONTENT.)
 */
export async function uploadImage(
  uploadUrl: string,
  fileUri: string,
  headers: Record<string, string>,
): Promise<void> {
  const blob = await (await fetch(fileUri)).blob();
  // Same STANDARD_TIMEOUT_MS bound apiFetch puts on every request (net/network-policy.ts, C-O2): on
  // a constrained link a stalled PUT would otherwise hang behind the in-button spinner for the OS
  // default (tens of seconds, or forever).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STANDARD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers, body: blob, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The upload timed out — check your connection and try again.", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}
