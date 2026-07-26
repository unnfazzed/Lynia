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
  // to sign in. Treat any read/parse failure as "no session" — the user re-authenticates, which is
  // recoverable, unlike a permanently-stuck launch. Matches loadRolePreference/loadOnboardingSeen.
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
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
