import * as ImagePicker from "expo-image-picker";
import { requestKycPhotoUpload, uploadImage } from "../api/uploads";
import { updateRiderProfile } from "../api/riders";
import { downscaleForUpload, type UploadImageSource } from "./image-downscale";
import type { PhotoSource } from "./rider-documents";

/**
 * Manual KYC (ledger D-122, owner 2026-11-04): the biker's ID-front, licence and selfie-with-ID photos while
 * Didit is unfunded. Built for low-end phones: the existing downscale (1280px, JPEG 0.7, ~150-300 KB) so an
 * upload works on 2G/3G, the BACK camera for documents (the front one for the selfie), and gallery always
 * allowed (the phone's own camera app is often better than in-app capture).
 */
export type KycDocSlot = "idFront" | "licence" | "selfieId";
export const KYC_DOC_SLOTS: readonly KycDocSlot[] = ["idFront", "licence", "selfieId"];
/** The PATCH /riders/me field each slot writes. */
const SLOT_FIELD = { idFront: "idFrontKey", licence: "licenceKey", selfieId: "selfieIdKey" } as const;

export type KycDocs = { idFront: boolean; licence: boolean; selfieId: boolean };

/** Camera or gallery; documents shoot on the back lens, the selfie on the front. */
export async function pickKycDoc(slot: KycDocSlot, from: PhotoSource): Promise<UploadImageSource | "denied" | "blocked" | null> {
  const perm = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain === false ? "blocked" : "denied";
  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
  const cameraType = slot === "selfieId" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back;
  const result = from === "camera" ? await ImagePicker.launchCameraAsync({ ...opts, cameraType }) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled) return null;
  const a = result.assets[0];
  if (!a) return null;
  return { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" };
}

/** Downscale (never blocks), mint a `kyc/<you>/` upload, PUT the bytes, attach the key to the slot. */
export async function saveKycDoc(slot: KycDocSlot, shot: UploadImageSource, onProgress?: (fraction: number) => void): Promise<KycDocs | undefined> {
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
  const next = await updateRiderProfile({ [SLOT_FIELD[slot]]: key });
  onProgress?.(1);
  return next.kycDocs;
}

/**
 * Bike & documents progress in manual mode ("N of 6"): the ID check, the three document photos, the biker
 * photo and the plate. Outside manual mode the E1 count ("N of 3") is unchanged.
 */
export function manualDocsProgress(rider: { kycStatus?: string | null; hasPhoto?: boolean; bikeReg?: string | null; kycDocs?: Partial<KycDocs> | null } | null | undefined): { done: number; total: number } {
  if (!rider) return { done: 0, total: 6 };
  const d = rider.kycDocs ?? {};
  const done =
    (rider.kycStatus === "verified" ? 1 : 0) +
    (d.idFront ? 1 : 0) +
    (d.licence ? 1 : 0) +
    (d.selfieId ? 1 : 0) +
    (rider.hasPhoto ? 1 : 0) +
    (rider.bikeReg?.trim() ? 1 : 0);
  return { done, total: 6 };
}

/** All three document photos are on file. */
export function kycDocsComplete(docs: Partial<KycDocs> | null | undefined): boolean {
  return !!docs?.idFront && !!docs.licence && !!docs.selfieId;
}

/** "DD/MM/YYYY" (what Zimbabwean licences print) → "YYYY-MM-DD", or null when it isn't a real date. */
export function parseLicenceExpiry(raw: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" for the field. */
export function formatLicenceExpiry(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** The expiry day has passed (valid through the day itself, UTC) — mirrors the server's online gate. */
export function licenceExpiredOn(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(`${iso}T00:00:00Z`).getTime() < today;
}
