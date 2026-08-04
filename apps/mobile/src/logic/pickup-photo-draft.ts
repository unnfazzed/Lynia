import * as SecureStore from "expo-secure-store";

// Duplicated from api/uploads.ts's ImageContentType rather than imported: that module imports
// api/client.ts, which (via auth/session.ts → auth/device-state.ts, wired in for the sign-out
// wipe) would import back into this file — a real dependency cycle depcruise correctly rejects.
type PickupPhotoContentType = "image/jpeg" | "image/png";

/**
 * C-O7 (LC-C09): the optional proof-of-pickup photo's capture/upload state (PickupChecklist.tsx)
 * used to live only in local component state — an app kill strictly between capture and the
 * attach POST completing silently dropped the in-progress/failed photo with no retry affordance
 * surviving relaunch, unlike the item ticks themselves (pickup-checklist-draft.ts) or the KYC
 * form's photo (kyc-draft.ts). Mirrors C-O5's "persist the marker BEFORE firing the request"
 * pattern: the captured asset is written here the instant capture succeeds (before the downscale/
 * PUT/attach chain runs), cleared only once the attach actually lands, and left in place on any
 * failure — network-only or an app kill — so a relaunch can offer "finish adding this photo" with
 * the SAME captured asset instead of forcing a fresh camera shot. Best-effort like every other
 * draft — a SecureStore failure must never block the upload itself.
 */
export interface PickupPhotoDraft {
  orderId: string;
  uri: string;
  width?: number;
  height?: number;
  contentType: PickupPhotoContentType;
}

export const PICKUP_PHOTO_DRAFT_KEY = "lynia.pickupPhotoDraft";

/**
 * Parse a stored draft, rejecting malformed fields rather than trusting on-device JSON verbatim —
 * pulled out as a pure function so the recovery behavior is unit-testable without SecureStore.
 * `null` means "nothing usable to restore", not an error.
 */
export function parsePickupPhotoDraft(raw: string | null | undefined): PickupPhotoDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<PickupPhotoDraft> | null;
    if (
      !d ||
      typeof d.orderId !== "string" ||
      d.orderId.length === 0 ||
      typeof d.uri !== "string" ||
      d.uri.length === 0 ||
      (d.contentType !== "image/jpeg" && d.contentType !== "image/png")
    ) {
      return null;
    }
    return {
      orderId: d.orderId,
      uri: d.uri,
      width: typeof d.width === "number" ? d.width : undefined,
      height: typeof d.height === "number" ? d.height : undefined,
      contentType: d.contentType,
    };
  } catch {
    return null;
  }
}

// Best-effort, mirroring pickup-checklist-draft.ts/kyc-draft.ts: a SecureStore failure must never
// reject, or a failed read would silently disable draft saving for the whole session. A draft is a
// convenience, never load-bearing — the rider can always re-shoot manually.
export async function loadPickupPhotoDraft(): Promise<PickupPhotoDraft | null> {
  try {
    return parsePickupPhotoDraft(await SecureStore.getItemAsync(PICKUP_PHOTO_DRAFT_KEY));
  } catch {
    return null;
  }
}

export async function savePickupPhotoDraft(draft: PickupPhotoDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(PICKUP_PHOTO_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}

export async function clearPickupPhotoDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PICKUP_PHOTO_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
