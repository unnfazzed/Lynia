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

// Which starting role the user picked at the post-OTP role fork (one account, two roles). Persisted
// so an existing user isn't re-prompted on every sign-in — verify.tsx routes straight home once set.
// All best-effort: a native read/write failure must never trap the sign-in flow.
export type StartRole = "customer" | "rider";
const ROLE_PREF_KEY = "lynia.rolePreference";

export async function saveRolePreference(role: StartRole): Promise<void> {
  try {
    await SecureStore.setItemAsync(ROLE_PREF_KEY, role);
  } catch {
    /* best-effort */
  }
}
export async function loadRolePreference(): Promise<StartRole | null> {
  try {
    const v = await SecureStore.getItemAsync(ROLE_PREF_KEY);
    return v === "customer" || v === "rider" ? v : null;
  } catch {
    return null;
  }
}

// Whether the first-install onboarding carousel (customer/rider 0·2) has been shown on this device.
// Persisted so the intro appears exactly once per install, before auth. Best-effort — a read failure
// just re-shows the carousel once (harmless) and a write failure never traps the hand-off to /phone.
const ONBOARDING_KEY = "lynia.onboardingSeen";

export async function saveOnboardingSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "1");
  } catch {
    /* best-effort */
  }
}
export async function loadOnboardingSeen(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === "1";
  } catch {
    return false;
  }
}

// Latest liability-disclaimer policy version the customer has accepted on this device (A1-8). Stored
// so the accept-to-continue gate isn't re-shown every broadcast. Best-effort — a read failure just
// re-shows the gate, which is safe.
const DISCLAIMER_KEY = "lynia.disclaimerAccepted";

export async function saveDisclaimerAccepted(policyVersion: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DISCLAIMER_KEY, policyVersion);
  } catch {
    /* best-effort */
  }
}
export async function loadDisclaimerAccepted(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DISCLAIMER_KEY);
  } catch {
    return null;
  }
}

