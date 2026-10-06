import { normalizeNationalId } from "@lynia/shared";
import * as ImagePicker from "expo-image-picker";
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
 * Bike & documents' Bike row (review R-8): "Verified" only for a verified rider who has a plate on file.
 * Since D-75 no plate is collected at sign-up, so a verified rider without one has nothing to call
 * verified. Settings' Bike & documents row follows the same rule.
 */
export function bikeVerified(rider: { kycStatus?: string | null; bikeReg?: string | null } | null | undefined): boolean {
  return !!rider && rider.kycStatus === "verified" && !!rider.bikeReg?.trim();
}

/** A national ID shown read-only: every character but the last three masked ("••••••••A42"). */
export function maskNationalId(raw: string | null | undefined): string {
  const id = normalizeNationalId(raw ?? "");
  if (id.length <= 3) return id;
  return `${"•".repeat(id.length - 3)}${id.slice(-3)}`;
}

/** Where a new rider photo comes from. */
export type PhotoSource = "camera" | "gallery";

/** Opens the camera or the gallery. Null when the rider cancelled; "denied" when the phone refused access. */
export async function pickRiderPhoto(from: PhotoSource): Promise<UploadImageSource | "denied" | null> {
  const perm = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return "denied";
  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
  const result = from === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled) return null;
  const a = result.assets[0];
  if (!a) return null;
  return { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" };
}

/**
 * Downscale (never blocks: the original goes up if the optimizer fails), mint a `kyc/<you>/` upload,
 * PUT the bytes, then attach the key. Throws when any step fails, so the screen can say so.
 */
export async function saveRiderPhoto(shot: UploadImageSource): Promise<{ hasPhoto: boolean; bikeReg: string | null }> {
  let asset: { uri: string; contentType: UploadImageSource["contentType"] } = shot;
  try {
    asset = await downscaleForUpload(shot);
  } catch {
    /* upload the original */
  }
  const { uploadUrl, key, headers } = await requestKycPhotoUpload(asset.contentType);
  await uploadImage(uploadUrl, asset.uri, headers ?? { "Content-Type": asset.contentType });
  return updateRiderProfile({ photoUrl: key });
}
