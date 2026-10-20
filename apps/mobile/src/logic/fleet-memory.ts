import * as SecureStore from "expo-secure-store";

/**
 * Own bikers OB-R13 (ledger D-117): "You're a public biker now" shows once, when the business a biker rode for stops
 * using Own bikers. The phone remembers the shop each account last rode for; a later read with no fleet and a
 * remembered shop is that moment. Leaving on purpose (OB-R12) forgets it first, so it never shows for that.
 * Best-effort: a keystore failure shows nothing.
 */
const keyFor = (profileId: string): string => `lynia.fleetShop.v1.${profileId}`;

/** Forgotten this session: the keystore delete is async, and the board (a mounted tab) may read before it lands. */
const forgotten = new Set<string>();

export async function rememberFleetShop(profileId: string, shop: string): Promise<void> {
  forgotten.delete(profileId);
  try {
    await SecureStore.setItemAsync(keyFor(profileId), shop);
  } catch {
    /* best-effort */
  }
}

export async function recalledFleetShop(profileId: string): Promise<string | null> {
  if (forgotten.has(profileId)) return null;
  try {
    return await SecureStore.getItemAsync(keyFor(profileId));
  } catch {
    return null;
  }
}

export async function forgetFleetShop(profileId: string): Promise<void> {
  forgotten.add(profileId);
  try {
    await SecureStore.deleteItemAsync(keyFor(profileId));
  } catch {
    /* best-effort */
  }
}
