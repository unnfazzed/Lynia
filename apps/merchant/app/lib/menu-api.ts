import type {
  MerchantCategoryRequest,
  MerchantCategoryResponse,
  MerchantDishRequest,
  MerchantDishResponse,
  MerchantProfileResponse,
  SetMerchantBusyModeRequest,
  UpdateMerchantCashRuleRequest,
  UpdateMerchantCategoryRequest,
  UpdateMerchantDishRequest,
  UpdateMerchantHoursRequest,
  UpdateMerchantProfileRequest,
} from "@lynia/shared";
import { authedFetch } from "./api-client";

export type {
  MerchantCategoryResponse,
  MerchantDishResponse,
  MerchantProfileResponse,
} from "@lynia/shared";

// ── Shop profile + hours + busy mode (D-30, R-03, N-17) ─────────────────────────────────────────

/** The full shop-front record (Shop/Hours pages need every field) — `GET /merchant/me` same as
 *  api-client.ts's own getMyMerchant, just typed against the full response instead of that helper's
 *  narrow {id,name} (E1 only ever needed the name for the queue header). */
export function getMerchantProfile(): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/me");
}

export function updateProfile(body: UpdateMerchantProfileRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/profile", { method: "PATCH", body });
}

export function updateHours(body: UpdateMerchantHoursRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/hours", { method: "PATCH", body });
}

export function updateCashRule(body: UpdateMerchantCashRuleRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/cash-rule", { method: "PATCH", body });
}

export function setBusyMode(body: SetMerchantBusyModeRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>("/merchant/busy-mode", { method: "PATCH", body });
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

/** N-14: "for the rest of today" is the only duration the server actually implements — the auto-reset
 *  at midnight is what makes it safe to offer as the one button (no forgot-to-turn-it-back-on risk). */
export function setDishOutOfStock(id: string): Promise<MerchantDishResponse> {
  return authedFetch<MerchantDishResponse>(`/merchant/dishes/${id}/out-of-stock`, { method: "POST" });
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

/** PUT the compressed bytes straight to GCS — NOT via authedFetch: this is a raw binary upload with no
 *  bearer token, the signed URL is its own auth. Mirrors apps/mobile/src/api/uploads.ts's uploadImage. */
export async function uploadPhotoBlob(uploadUrl: string, blob: Blob, headers: Record<string, string>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers, body: blob });
  } catch (err) {
    throw new Error("The upload timed out — check your connection and try again.", { cause: err });
  }
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}).`);
}
