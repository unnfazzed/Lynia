import * as SecureStore from "expo-secure-store";

/**
 * The become-a-rider (KYC) form draft, persisted between visits so launching the camera mid-form — a
 * classic out-of-memory-kill trigger on cheap Android — doesn't wipe a half-filled form (including a
 * re-typed national ID). Mirrors the customer compose draft (`order-draft.ts`), with two differences:
 *
 *   • It holds the rider's national ID, so it is stored ONLY in the OS keystore via expo-secure-store
 *     (encrypted at rest — the same place the session token and saved recipients live), NEVER sent to
 *     the server as anything but the real KYC submission. It's the user's OWN identity data.
 *   • It is cleared the moment KYC is submitted (the draft has served its purpose) and on sign-out
 *     (see auth/session `clearDeviceState`) so a shared device never leaks the last rider's ID to the next.
 *
 * `photoKey` is the already-uploaded GCS object key (not image bytes), safe to keep so a restored form
 * doesn't force a re-capture; `photoUri` is the local preview path (may not survive a process death,
 * restored best-effort). Every read/write fails soft — a draft is a convenience, never load-bearing.
 *
 * `pendingPhoto` (C-O8/LC-C11) is a captured-but-not-yet-(successfully)-uploaded photo, written the
 * instant a capture/pick is fired — BEFORE the downscale/presign/PUT chain runs — and cleared only
 * once the upload actually lands. It exists precisely because `photoKey`/`photoUri` above are ONLY
 * ever set on a successful upload: an app kill strictly between firing the PUT and it resolving used
 * to leave zero trace that an upload was ever attempted, forcing a full re-shoot on relaunch instead
 * of the one-tap "Try again" resume a network-only failure already gets.
 */
export interface KycDraft {
  firstName: string;
  lastName: string;
  idNumber: string;
  bikeReg: string;
  photoKey: string | null;
  photoUri: string | null;
  pendingPhoto: PendingKycPhoto | null;
}

/**
 * The captured asset shape needed to resume an interrupted KYC photo upload. Content type is
 * duplicated as a literal union here rather than imported from `image-downscale.ts`'s
 * `UploadImageSource` — importing that module into this file would recreate the exact dependency
 * cycle `pickup-photo-draft.ts` already documents avoiding: `image-downscale.ts` → `api/uploads.ts`
 * → `api/client.ts` → `auth/session.ts` → `auth/device-state.ts` → back to this file's
 * `KYC_DRAFT_KEY` export.
 */
export interface PendingKycPhoto {
  uri: string;
  width?: number;
  height?: number;
  contentType: "image/jpeg" | "image/png";
}

function parsePendingKycPhoto(v: unknown): PendingKycPhoto | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<PendingKycPhoto>;
  if (typeof p.uri !== "string" || p.uri.length === 0) return null;
  if (p.contentType !== "image/jpeg" && p.contentType !== "image/png") return null;
  return {
    uri: p.uri,
    width: typeof p.width === "number" ? p.width : undefined,
    height: typeof p.height === "number" ? p.height : undefined,
    contentType: p.contentType,
  };
}

/** SecureStore key — exported so sign-out (`clearDeviceState`) clears the same slot. */
export const KYC_DRAFT_KEY = "lynia.kycDraft.v1";

export async function loadKycDraft(): Promise<KycDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(KYC_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<KycDraft>;
    return {
      firstName: typeof d.firstName === "string" ? d.firstName : "",
      lastName: typeof d.lastName === "string" ? d.lastName : "",
      idNumber: typeof d.idNumber === "string" ? d.idNumber : "",
      bikeReg: typeof d.bikeReg === "string" ? d.bikeReg : "",
      photoKey: typeof d.photoKey === "string" ? d.photoKey : null,
      photoUri: typeof d.photoUri === "string" ? d.photoUri : null,
      pendingPhoto: parsePendingKycPhoto(d.pendingPhoto),
    };
  } catch {
    return null;
  }
}

/** True when the draft has anything worth restoring (so an all-empty draft doesn't show a "restored" cue). */
export function kycDraftHasContent(d: KycDraft): boolean {
  return (
    d.firstName.trim().length > 0 ||
    d.lastName.trim().length > 0 ||
    d.idNumber.trim().length > 0 ||
    d.bikeReg.trim().length > 0 ||
    d.photoKey != null ||
    d.pendingPhoto != null
  );
}

export async function saveKycDraft(draft: KycDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(KYC_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}

export async function clearKycDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KYC_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
