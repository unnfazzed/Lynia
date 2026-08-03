import * as SecureStore from "expo-secure-store";

/**
 * The post-OTP "Tell us who you are" profile-setup form draft (LC-C10), persisted between renders so an
 * app kill while typing — a classic OOM-kill trigger on a low-end Android device — doesn't wipe a
 * half-filled name/ID. This screen collects the exact same fields (firstName/lastName/idNumber) as the
 * become-a-rider KYC form, which already gets this treatment via `kyc-draft.ts`; this module mirrors
 * that pattern for the customer-onboarding-critical screen `verify.tsx` routes every brand-new account
 * through first (`needsProfile`), which had no draft at all before this fix.
 *
 * Stored ONLY in the OS keystore via expo-secure-store (encrypted at rest, same place the KYC draft and
 * session token live) since it holds a national ID — the user's own identity data. Cleared the moment
 * the profile PATCH lands (the draft has served its purpose) and on sign-out (see
 * `auth/device-state.ts`'s `clearDeviceState`) so a shared device never leaks the last user's ID to the
 * next. Every read/write fails soft — a draft is a convenience, never load-bearing.
 */
export interface ProfileDraft {
  firstName: string;
  lastName: string;
  idNumber: string;
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
      idNumber: typeof d.idNumber === "string" ? d.idNumber : "",
    };
  } catch {
    return null;
  }
}

/** True when the draft has anything worth restoring (so an all-empty draft doesn't show a "restored" cue). */
export function profileDraftHasContent(d: ProfileDraft): boolean {
  return d.firstName.trim().length > 0 || d.lastName.trim().length > 0 || d.idNumber.trim().length > 0;
}

export async function saveProfileDraft(draft: ProfileDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_DRAFT_KEY, JSON.stringify(draft));
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
