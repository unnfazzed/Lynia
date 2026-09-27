import * as SecureStore from "expo-secure-store";
import { randomUuidV4 } from "../util";

// RF-10: the non-auth per-order/per-flow SecureStore groups this module used to also own (delivery
// codes, confirmItemsPending, pendingRating, riderJobTerminal, senderRatingPending, pendingTopup,
// rolePreference, onboarding/permissions/disclaimer flags, handback acks, clearDeviceState) now live in
// device-state.ts. Re-exported here so none of this module's existing importers need to change.
export * from "./device-state";

/** The authenticated session, persisted in the device keychain (not AsyncStorage — these are secrets). */
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profileId: string;
  role: string;
  // Captured from the server at sign-in (needsProfile: firstName === ""). Kept durable across an
  // interrupted /profile/setup (app kill, dropped PATCH response) — the bootstrap redirect (index.tsx)
  // reads this on every launch instead of only right after verifyOtp, so a killed setup step re-prompts
  // on relaunch rather than silently landing the still-unnamed account on /home forever (BH-15).
  needsProfile?: boolean;
}

const KEY = "lynia.session";

// Keychain calls can fail TRANSIENTLY — the Android Keystore is briefly unavailable right after boot or
// under memory pressure on low-end handsets. A session read that fails is believed as "signed out" and
// routes the user to the OTP screen for the rest of the launch; a write that fails leaves a rotated
// refresh token unsaved. So a THROW is retried briefly before it is believed. (A read that finds nothing
// is an answer, not a failure, and is never retried.)
const KEYCHAIN_ATTEMPTS = 3;
const KEYCHAIN_RETRY_MS = 150;

// iOS: keep the session readable while the device is locked (after the first unlock since boot), so a
// launch the OS starts in the background — a push, a relaunch while locked — doesn't read "no session"
// and hold that for the life of the process. expo-secure-store applies it when it CREATES the item (an
// existing item only gets its value updated), so it takes effect from the next sign-in; reads ignore it,
// which keeps every existing session readable. Android ignores the option.
const SESSION_KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function withKeychainRetry<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt >= KEYCHAIN_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, KEYCHAIN_RETRY_MS * attempt));
    }
  }
}

// KB-IDENTITY-BINDING L1: a stable per-install device id, sent as `x-device-id` on every API call so the
// server can throttle new-account creation per device and surface the L0 recycle signal. Generated once
// and persisted in the keychain; a reinstall mints a new one (a soft signal, not a hardware guarantee —
// that's L3 attestation). Deliberately NOT wiped on sign-out (clearDeviceState) — it's the device's id,
// not the user's, and clearing it would defeat the per-device signup cap on the very next signup.
const DEVICE_ID_KEY = "lynia.deviceId";
let deviceIdCache: string | null = null;

/** The device's stable install id (created + persisted on first use). Cached in-memory after first read. */
export async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = randomUuidV4();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    deviceIdCache = id;
    return id;
  } catch {
    // getItemAsync/setItemAsync can both THROW (not just return null), same documented keystore
    // failure loadSession above guards against. Left unhandled, client.ts's `.catch(() => null)`
    // turns this into a silently-omitted x-device-id header — and the server now hard-requires that
    // header to create a new account (auth.service.ts, KB-IDENTITY-BINDING L1), so a broken keystore
    // permanently blocks onboarding with no recovery path. Fall back to a process-lifetime-only id
    // (never persisted, so a relaunch mints a new one) rather than propagating the failure: it still
    // satisfies the server's per-device signup gate for this session instead of dead-ending signup.
    const id = randomUuidV4();
    deviceIdCache = id;
    return id;
  }
}

export async function loadSession(): Promise<Session | null> {
  // The getItemAsync read itself can THROW, not just the JSON.parse: expo-secure-store surfaces a
  // native error when the keystore entry can't be decrypted (a documented failure mode on low-end
  // Android after OS updates / keystore corruption / resource pressure). If that rejection escapes,
  // the boot load in auth-context never resolves and the app hangs on the splash forever with no way
  // to sign in. Treat a read that STILL fails after the retries (and a corrupt blob) as "no session" —
  // the user re-authenticates, which is recoverable, unlike a permanently-stuck launch. Matches
  // loadRolePreference/loadOnboardingSeen.
  try {
    const raw = await withKeychainRetry(() => SecureStore.getItemAsync(KEY, SESSION_KEYCHAIN_OPTIONS));
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await withKeychainRetry(() => SecureStore.setItemAsync(KEY, JSON.stringify(session), SESSION_KEYCHAIN_OPTIONS));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
