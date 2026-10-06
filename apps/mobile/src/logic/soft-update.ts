import * as SecureStore from "expo-secure-store";
import { isVersionBelow } from "../config";

/**
 * First Run v2 U4a/U4b (ledger D-80 §2 #7): the soft "A new version is ready" banner. It shows when the
 * server's `recommendedVersion` is above this build, ONCE per version: tapping Update or ✕ settles that
 * version on this phone (README §4 `softUpdateDismissed[version]`), and only a newer recommendation brings
 * it back. Pure rule + best-effort storage, so the rule is unit-tested without a device.
 */
export const SOFT_UPDATE_KEY = "lynia.softUpdateDismissed.v1";

export function shouldShowSoftUpdate(input: { current: string; recommended: string | null | undefined; dismissed: string | null; hasStoreLink: boolean }): boolean {
  const { current, recommended, dismissed, hasStoreLink } = input;
  // The banner's only action is the store; with no listing configured there is nothing to offer.
  if (!recommended || !hasStoreLink) return false;
  if (!isVersionBelow(current, recommended)) return false;
  return dismissed !== recommended;
}

/** The version last dismissed on this phone, or null. A read failure shows the banner (it is only a nudge). */
export async function loadSoftUpdateDismissed(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SOFT_UPDATE_KEY);
  } catch {
    return null;
  }
}

export async function saveSoftUpdateDismissed(version: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SOFT_UPDATE_KEY, version);
  } catch {
    /* best-effort: worst case it shows once more next launch */
  }
}
