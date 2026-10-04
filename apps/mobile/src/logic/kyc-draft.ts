import * as SecureStore from "expo-secure-store";

/**
 * The become-a-rider draft, persisted between visits so an app kill (the ID check's camera is a
 * classic out-of-memory-kill trigger on cheap Android) doesn't wipe a half-filled form. Mirrors the
 * customer profile draft (`profile-draft.ts`).
 *
 * Since D-75 (owner 2026-10-03) it holds only the NAME — the one thing become-a-rider still asks for,
 * and only on a legacy account without one (Calm Mint v2 C5's name fields). The national ID is no
 * longer typed before the check: the number is confirmed from the check afterwards (the server adopts
 * the vendor-verified number). The rider photo left with D-62, the bike plate with D-55.
 *
 * An older stored draft may still carry `idNumber`, `bikeReg` or photo fields; they are ignored on read
 * and dropped on the next save or clear. It stays in the OS keystore (expo-secure-store) and is cleared
 * the moment the rider is registered and on sign-out (see auth/device-state `clearDeviceState`), so a
 * shared device never shows the last rider's draft to the next.
 *
 * Every read/write fails soft — a draft is a convenience, never load-bearing.
 */
export interface KycDraft {
  firstName: string;
  lastName: string;
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
    };
  } catch {
    return null;
  }
}

/** True when the draft has anything worth restoring (so an all-empty draft doesn't show a "restored" cue). */
export function kycDraftHasContent(d: KycDraft): boolean {
  return d.firstName.trim().length > 0 || d.lastName.trim().length > 0;
}

export async function saveKycDraft(draft: KycDraft): Promise<void> {
  try {
    // Only the name — never whatever else an older draft carried.
    await SecureStore.setItemAsync(KYC_DRAFT_KEY, JSON.stringify({ firstName: draft.firstName, lastName: draft.lastName }));
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
