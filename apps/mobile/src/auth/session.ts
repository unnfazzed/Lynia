import * as SecureStore from "expo-secure-store";

/** The authenticated session, persisted in the device keychain (not AsyncStorage — these are secrets). */
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profileId: string;
  role: string;
}

const KEY = "lynia.session";

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

// The one-time delivery handover code is returned once by `select`; persist it per-order so it
// survives a remount/relaunch (the server keeps only the hash and can't re-send it).
const codeKey = (orderId: string): string => `lynia.deliveryCode.${orderId}`;

export async function saveDeliveryCode(orderId: string, code: string): Promise<void> {
  await SecureStore.setItemAsync(codeKey(orderId), code);
}
export async function loadDeliveryCode(orderId: string): Promise<string | null> {
  return SecureStore.getItemAsync(codeKey(orderId));
}

