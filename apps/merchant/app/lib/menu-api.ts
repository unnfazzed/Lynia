import type {
  DishOutOfStockFor,
  MerchantCategoryRequest,
  MerchantCategoryResponse,
  MerchantDishRequest,
  MerchantDishResponse,
  MerchantProfileResponse,
  SetMerchantBusyModeRequest,
  UpdateMerchantCategoryRequest,
  UpdateMerchantDishRequest,
  UpdateMerchantHoursRequest,
  UpdateMerchantOrderSettingsRequest,
  UpdateMerchantProfileRequest,
} from "@lynia/shared";
import { authedFetch, getMyMerchant } from "./api-client";
import { API_BASE_URL } from "./config";
import { getReachabilityStore } from "./reachability";

export type {
  MerchantCategoryResponse,
  MerchantDishResponse,
  MerchantProfileResponse,
} from "@lynia/shared";

// ── Shop profile + hours + busy mode (D-30, R-03, N-17) ─────────────────────────────────────────

/** The full shop-front record (Shop/Hours pages need every field) — `GET /merchant/me`, the same shared
 *  read as api-client.ts's own {@link getMyMerchant} (MJ-P2: one request for every screen asking at once). */
export function getMerchantProfile(): Promise<MerchantProfileResponse> {
  return getMyMerchant();
}

export function updateProfile(body: UpdateMerchantProfileRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/profile", { method: "PATCH", body });
}

export function updateHours(body: UpdateMerchantHoursRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/hours", { method: "PATCH", body });
}

/** D-48 (merchant mobile B1/B5): the Orders header's open/closed switch. */
export function setOpen(open: boolean): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/open", { method: "PATCH", body: { open } });
}

export function setBusyMode(body: SetMerchantBusyModeRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/busy-mode", { method: "PATCH", body });
}

/** Auto-accept (owner only): how the restaurant takes orders — accept automatically, and whether
 *  customers with a live order can see the business's number. */
export function updateOrderSettings(body: UpdateMerchantOrderSettingsRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/order-settings", { method: "PATCH", body });
}

// ── Categories (D-29) ────────────────────────────────────────────────────────────────────────────

export function listCategories(): Promise<MerchantCategoryResponse[]> {
  return authedFetch<MerchantCategoryResponse[]>("/merchant/categories");
}

export function createCategory(body: MerchantCategoryRequest): Promise<MerchantCategoryResponse> {
  return authedFetch<MerchantCategoryResponse>("/merchant/categories", { method: "POST", body });
}

export function updateCategory(id: string, body: UpdateMerchantCategoryRequest): Promise<MerchantCategoryResponse> {
  return authedFetch<MerchantCategoryResponse>(`/merchant/categories/${id}`, { method: "PATCH", body });
}

/** 409s "Remove all dishes from this category before deleting it" (surfaced verbatim) if non-empty. */
export function deleteCategory(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/categories/${id}`, { method: "DELETE" });
}

// ── Dishes (D-31 draft state, N-14 OOS) ─────────────────────────────────────────────────────────

export function listDishes(): Promise<MerchantDishResponse[]> {
  return authedFetch<MerchantDishResponse[]>("/merchant/dishes");
}

export function createDish(body: MerchantDishRequest): Promise<MerchantDishResponse> {
  return authedFetch<MerchantDishResponse>("/merchant/dishes", { method: "POST", body });
}

export function updateDish(id: string, body: UpdateMerchantDishRequest): Promise<MerchantDishResponse> {
  return authedFetch<MerchantDishResponse>(`/merchant/dishes/${id}`, { method: "PATCH", body });
}

export function deleteDish(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/dishes/${id}`, { method: "DELETE" });
}

/** `RM.oos_sheet` (merchant web upgrade L5): until turned back on, the rest of today or one hour. An API
 *  from before L5 ignores the duration and uses the rest of today, N-14's always-safe choice. */
export function setDishOutOfStock(id: string, forHowLong: DishOutOfStockFor = "rest_of_today"): Promise<MerchantDishResponse> {
  return authedFetch<MerchantDishResponse>(`/merchant/dishes/${id}/out-of-stock`, { method: "POST", body: { for: forHowLong } });
}

export function clearDishOutOfStock(id: string): Promise<MerchantDishResponse> {
  return authedFetch<MerchantDishResponse>(`/merchant/dishes/${id}/out-of-stock`, { method: "DELETE" });
}

// ── Photo upload (D-32: compress on the merchant's behalf, offline-queued retry) ───────────────────

export interface UploadTarget {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
}

/** Mint a signed PUT URL for a dish photo (≤300KB, D-32's own budget — enforced by the signed URL's
 *  size range, not just the client's own compression target). */
export function mintDishPhotoUpload(): Promise<UploadTarget> {
  return authedFetch<UploadTarget>("/uploads/merchant-dish-photo", { method: "POST", body: { contentType: "image/jpeg" } });
}

/** Mint a signed PUT URL for the shop's cover banner or logo (≤250KB). Same endpoint serves both —
 *  the bucket key namespaces by profile, not by which shop-front slot the photo fills. */
export function mintBannerPhotoUpload(): Promise<UploadTarget> {
  return authedFetch<UploadTarget>("/uploads/merchant-banner-photo", { method: "POST", body: { contentType: "image/jpeg" } });
}

/** MJ-RL21: how long one photo PUT may take before it ends in Retry — sized for a 300 KB upload on 2G
 *  (~5 KB/s). Without it a stalled upload spun "Uploading…" for minutes. */
export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

/** PUT the compressed bytes straight to GCS — NOT via authedFetch: this is a raw binary upload with no
 *  bearer token, the signed URL is its own auth. Mirrors apps/mobile/src/api/uploads.ts's uploadImage.
 *
 *  LC-D##: still reports network-level failures into the shared ReachabilityStore even though this
 *  call bypasses authedFetch entirely — otherwise a drop that first manifests as a failed photo
 *  upload (PhotoPicker's own error+retry UI handles the upload itself fine) left the header's
 *  connectivity pill showing "Connected" for up to the 20s active-probe interval, a blind spot in
 *  the one signal `actionsDisabled` reads app-wide. */
export async function uploadPhotoBlob(
  uploadUrl: string,
  blob: Blob,
  headers: Record<string, string>,
  timeoutMs: number = PHOTO_UPLOAD_TIMEOUT_MS,
  /** Shop front v1 (D-115): the upload's progress, 0–100. Passing it sends the PUT through XHR, the one
   *  browser API that reports upload progress; without it the PUT stays a fetch. */
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (onProgress) return putWithProgress(uploadUrl, blob, headers, timeoutMs, onProgress);
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers, body: blob, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    getReachabilityStore(API_BASE_URL).reportUnreachable();
    throw new Error("The upload timed out — check your connection and try again.", { cause: err });
  }
  getReachabilityStore(API_BASE_URL).reportReachable();
  // The upload URL is create-only: a transport retry of a PUT that already landed answers 409 (the blob
  // exists). The bytes are there, and attach verifies them, so that is a success (E13).
  if (!res.ok && res.status !== 409) throw new Error(`Photo upload failed (${res.status}).`);
}

/** `uploadPhotoBlob`'s XHR twin: the same timeout, reachability reports, 409-is-success rule and messages. */
function putWithProgress(uploadUrl: string, blob: Blob, headers: Record<string, string>, timeoutMs: number, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.timeout = timeoutMs;
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    });
    const unreachable = () => {
      getReachabilityStore(API_BASE_URL).reportUnreachable();
      reject(new Error("The upload timed out — check your connection and try again."));
    };
    xhr.addEventListener("error", unreachable);
    xhr.addEventListener("timeout", unreachable);
    xhr.addEventListener("load", () => {
      getReachabilityStore(API_BASE_URL).reportReachable();
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 409) resolve();
      else reject(new Error(`Photo upload failed (${xhr.status}).`));
    });
    xhr.send(blob);
  });
}
