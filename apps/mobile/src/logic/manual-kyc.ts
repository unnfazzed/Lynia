import * as ImagePicker from "expo-image-picker";
import { ApiError } from "../api/client";
import { requestKycPhotoUpload, uploadImage } from "../api/uploads";
import { updateRiderProfile } from "../api/riders";
import { downscaleForUpload, type UploadImageSource } from "./image-downscale";
import { clearPick, markPickStarted } from "./pending-photo";
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
  // KB-04: Android may kill the app while the picker is open — remember which photo this was for.
  await markPickStarted(slot);
  const result = from === "camera" ? await ImagePicker.launchCameraAsync({ ...opts, cameraType }) : await ImagePicker.launchImageLibraryAsync(opts);
  await clearPick();
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

/** All three document photos are on file. */
export function kycDocsComplete(docs: Partial<KycDocs> | null | undefined): boolean {
  return !!docs?.idFront && !!docs.licence && !!docs.selfieId;
}

/** A refused photo (wrong type, too large) rather than a connection problem: the retry won't help. */
export function isRefusedUpload(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 422 || e.status === 400);
}
