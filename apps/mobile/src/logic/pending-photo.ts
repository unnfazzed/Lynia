import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import type { UploadImageSource } from "./image-downscale";

/**
 * KB-04 (owner 2026-11-12): on a low-memory phone Android often kills LyniaGo while the phone's own camera
 * app is open. The photo the biker just took is then handed to a fresh process, and unless the app asks for
 * it (`ImagePicker.getPendingResultAsync`) it is lost: the biker lands back on the board with nothing, which
 * reads as "the camera doesn't work". Budget Samsung A0x/A1x, Tecno, ZTE and Mobicel phones are most of the
 * biker fleet (PostHog, 2026-11).
 *
 * So every camera/gallery launch for a biker photo first writes which photo it is for (`markPickStarted`),
 * and a screen that can take that photo asks `recoverPendingPhoto` on mount. The marker lives in the
 * keystore (survives the process), expires after 30 minutes, and is cleared once the picker returns
 * normally. Every read/write fails soft.
 */
export type PhotoTarget = "idFront" | "licence" | "selfieId" | "riderPhoto";

export const PENDING_PHOTO_KEY = "lynia.pendingPhoto.v1";
const MAX_AGE_MS = 30 * 60 * 1000;

interface Marker {
  target: PhotoTarget;
  at: number;
}

const TARGETS: readonly PhotoTarget[] = ["idFront", "licence", "selfieId", "riderPhoto"];

export async function markPickStarted(target: PhotoTarget, now: number = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_PHOTO_KEY, JSON.stringify({ target, at: now } satisfies Marker));
  } catch {
    /* best-effort */
  }
}

export async function clearPick(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_PHOTO_KEY);
  } catch {
    /* best-effort */
  }
}

/** The photo a launch was for, while it is still fresh — null when there is none (or it expired). */
export async function peekPendingTarget(now: number = Date.now()): Promise<PhotoTarget | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_PHOTO_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Marker>;
    if (!m.target || !TARGETS.includes(m.target) || typeof m.at !== "number" || now - m.at > MAX_AGE_MS) {
      await clearPick();
      return null;
    }
    return m.target;
  } catch {
    return null;
  }
}

/**
 * The photo Android kept for a killed app, with the photo it was for — or null. Only asks the picker when a
 * fresh marker says a launch was in flight, and clears the marker either way.
 */
export async function recoverPendingPhoto(only?: readonly PhotoTarget[], now: number = Date.now()): Promise<{ target: PhotoTarget; shot: UploadImageSource } | null> {
  const target = await peekPendingTarget(now);
  if (!target || (only && !only.includes(target))) return null;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    if (!result || "code" in result || result.canceled) return null;
    const a = result.assets?.[0];
    if (!a) return null;
    return { target, shot: { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" } };
  } catch {
    return null;
  } finally {
    await clearPick();
  }
}
