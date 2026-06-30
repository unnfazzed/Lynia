import { apiFetch } from "./client";

export type ImageContentType = "image/jpeg" | "image/png";

export interface UploadTarget {
  uploadUrl: string;
  key: string;
}

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
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}
