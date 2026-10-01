import * as SecureStore from "expo-secure-store";

/**
 * Calm Mint v2 R3 "You're verified" (ledger D-55) shows ONCE per account on this phone: the first time
 * a rider opens the board verified. Keyed by profile id, so a second account on the same phone still
 * gets its own welcome. Best-effort: a read failure shows nothing (never a welcome loop).
 */
export const RIDER_WELCOME_KEY = "lynia.riderWelcomed.v1";

export async function riderWelcomeSeen(profileId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(RIDER_WELCOME_KEY)) === profileId;
  } catch {
    return true;
  }
}

export async function markRiderWelcomeSeen(profileId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_WELCOME_KEY, profileId);
  } catch {
    /* best-effort */
  }
}
