import { normalizeNationalId } from "@lynia/shared";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { updateRiderProfile } from "../api/riders";
import { requestKycPhotoUpload, uploadImage } from "../api/uploads";
import { downscaleForUpload, type UploadImageSource } from "./image-downscale";

/**
 * Ledger D-79 (owner 2026-10-06): Bike & documents can add what R1/R3 said could wait — the rider's photo
 * and bike plate — and Personal details shows a verified national ID masked. The pure parts live here so
 * they're tested without a screen.
 */

/** The plate rule `PATCH /riders/me` applies (sign-up's: 3–20 characters once trimmed). */
export const PLATE_MIN = 3;
export const PLATE_MAX = 20;

/** The plate as the server will store it: trimmed, single spaces, upper-case. */
export function normalizePlate(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

export function plateIsValid(raw: string): boolean {
  const p = normalizePlate(raw);
  return p.length >= PLATE_MIN && p.length <= PLATE_MAX;
}

/**
 * First Run v2 E4 (ledger D-81): the plate rule Bike & documents' sheet applies — three letters and four
 * digits, an optional space ("ABC 1234"), after `normalizePlate`. Stricter than the server's 3–20, which
 * still accepts older plates on file.
 */
export const PLATE_RE = /^[A-Z]{3}\s?\d{4}$/;

export function plateMatchesFormat(raw: string): boolean {
  return PLATE_RE.test(normalizePlate(raw));
}

/**
 * Bike & documents' Bike row and Settings' "Bike & documents" row: "Verified" only for what was actually
 * checked (First Run v2 E5, D-81). Since migration 0078 that is ops' plate check (`plateStatus`); a server
 * that predates it falls back to review R-8's rule (a verified rider with a plate on file).
 */
export function bikeVerified(rider: { kycStatus?: string | null; bikeReg?: string | null; plateStatus?: string | null } | null | undefined): boolean {
  if (!rider || !rider.bikeReg?.trim()) return false;
  if (rider.plateStatus != null) return rider.plateStatus === "verified";
  return rider.kycStatus === "verified";
}

/**
 * First Run v2 E1 progress ("N of 3"): the ID check, the rider photo, the bike plate. A plate counts once
 * it is on file, checking or not (E4c draws "2 of 3" for a plate still being checked).
 */
export function bikeDocsProgress(rider: { kycStatus?: string | null; hasPhoto?: boolean; bikeReg?: string | null } | null | undefined): { done: number; total: 3 } {
  if (!rider) return { done: 0, total: 3 };
  const done = (rider.kycStatus === "verified" ? 1 : 0) + (rider.hasPhoto ? 1 : 0) + (rider.bikeReg?.trim() ? 1 : 0);
  return { done, total: 3 };
}

/** A national ID shown read-only: every character but the last three masked ("••••••••A42"). */
export function maskNationalId(raw: string | null | undefined): string {
  const id = normalizeNationalId(raw ?? "");
  if (id.length <= 3) return id;
  return `${"•".repeat(id.length - 3)}${id.slice(-3)}`;
}

/** Where a new rider photo comes from. */
export type PhotoSource = "camera" | "gallery";

/**
 * Opens the camera or the gallery. Null when the rider cancelled; "denied" when the phone refused access.
 * The camera opens on the FRONT lens (E2b "Face the camera": the rider photographs themself).
 */
export async function pickRiderPhoto(from: PhotoSource): Promise<UploadImageSource | "denied" | null> {
  const perm = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return "denied";
  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
  const result = from === "camera" ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled) return null;
  const a = result.assets[0];
  if (!a) return null;
  return { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" };
}

/**
 * Downscale (never blocks: the original goes up if the optimizer fails), mint a `kyc/<you>/` upload,
 * PUT the bytes, then attach the key. Throws when any step fails, so the screen can say so.
 */
export async function saveRiderPhoto(
  shot: UploadImageSource,
  onProgress?: (fraction: number) => void,
): Promise<{ hasPhoto: boolean; bikeReg: string | null; plateStatus?: "none" | "checking" | "verified" }> {
  // E2d's bar: the chain's real stages (fetch has no byte progress) — prepared, upload minted, bytes up, attached.
  onProgress?.(0.1);
  let asset: { uri: string; contentType: UploadImageSource["contentType"] } = shot;
  try {
    asset = await downscaleForUpload(shot);
  } catch {
    /* upload the original */
  }
  onProgress?.(0.3);
  const { uploadUrl, key, headers } = await requestKycPhotoUpload(asset.contentType);
  onProgress?.(0.4);
  await uploadImage(uploadUrl, asset.uri, headers ?? { "Content-Type": asset.contentType });
  onProgress?.(0.85);
  const next = await updateRiderProfile({ photoUrl: key });
  onProgress?.(1);
  return next;
}

// ── E6: an upload that didn't finish keeps the photo on this phone ─────────────────────────────────
// Written the moment the rider taps "Use photo" (before the chain runs), cleared once the attach lands,
// left in place on any failure or an app kill — so "Try again" re-sends the SAME shot (the pickup-photo
// draft pattern, src/logic/pickup-photo-draft.ts). Best-effort: storage failing never blocks the upload.
export const RIDER_PHOTO_DRAFT_KEY = "lynia.riderPhotoDraft.v1";

export function parseRiderPhotoDraft(raw: string | null | undefined): UploadImageSource | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<UploadImageSource> | null;
    if (!d || typeof d.uri !== "string" || !d.uri || (d.contentType !== "image/jpeg" && d.contentType !== "image/png")) return null;
    return { uri: d.uri, width: typeof d.width === "number" ? d.width : undefined, height: typeof d.height === "number" ? d.height : undefined, contentType: d.contentType };
  } catch {
    return null;
  }
}

export async function loadRiderPhotoDraft(): Promise<UploadImageSource | null> {
  try {
    return parseRiderPhotoDraft(await SecureStore.getItemAsync(RIDER_PHOTO_DRAFT_KEY));
  } catch {
    return null;
  }
}

export async function saveRiderPhotoDraft(shot: UploadImageSource): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_PHOTO_DRAFT_KEY, JSON.stringify(shot));
  } catch {
    /* best-effort */
  }
}

export async function clearRiderPhotoDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RIDER_PHOTO_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
