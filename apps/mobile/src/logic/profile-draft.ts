import * as SecureStore from "expo-secure-store";

/**
 * The post-OTP C5 name form's draft (LC-C10), persisted so an app kill while typing — a classic OOM-kill
 * trigger on a low-end Android device — doesn't wipe a half-filled name. verify.tsx routes every brand-new
 * account here first (`needsProfile`).
 *
 * C5 collects a first name and a surname only (D-55: no national ID at sign-up), so that is all the draft
 * holds; a draft written by an older build that still carries an `idNumber` is read as its names alone.
 * Stored in the OS keystore via expo-secure-store, cleared the moment the profile PATCH lands (the draft
 * has served its purpose) and on sign-out (`auth/device-state.ts`'s `clearDeviceState`) so a shared
 * device never shows the last user's name to the next. The screen debounces its writes (one keystore
 * write per pause, not per keystroke). Every read/write fails soft — a draft is a convenience, never
 * load-bearing.
 */
export interface ProfileDraft {
  firstName: string;
  lastName: string;
}

/** SecureStore key — exported so sign-out (`clearDeviceState`) clears the same slot. */
export const PROFILE_DRAFT_KEY = "lynia.profileDraft.v1";

export async function loadProfileDraft(): Promise<ProfileDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<ProfileDraft>;
    return {
      firstName: typeof d.firstName === "string" ? d.firstName : "",
      lastName: typeof d.lastName === "string" ? d.lastName : "",
    };
  } catch {
    return null;
  }
}

/** True when the draft has anything worth restoring (so an all-empty draft doesn't show a "restored" cue). */
export function profileDraftHasContent(d: ProfileDraft): boolean {
  return d.firstName.trim().length > 0 || d.lastName.trim().length > 0;
}

export async function saveProfileDraft(draft: ProfileDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_DRAFT_KEY, JSON.stringify({ firstName: draft.firstName, lastName: draft.lastName }));
  } catch {
    /* best-effort */
  }
}

export async function clearProfileDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PROFILE_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
