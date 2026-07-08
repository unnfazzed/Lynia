import * as SecureStore from "expo-secure-store";
// Import the on-device store keys from their owning modules so the sign-out wipe below can't drift from
// the keys those modules actually write (type-only-adjacent leaf modules — no runtime import cycle).
import { HISTORY_SNAPSHOT_KEY } from "../net/history-store";
import { RECENTS_KEY as SAVED_PLACES_RECENTS_KEY, SAVED_KEY as SAVED_PLACES_SAVED_KEY } from "../logic/saved-places";
import { MY_PICKUP_PHONE_KEY, RECIPIENTS_KEY } from "../logic/saved-recipients";
import { RIDER_IDENTITY_KEY } from "../logic/rider-identity";

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

// SecureStore can't enumerate keys, so we keep a tiny index of order ids that have a stored code.
// That lets sign-out delete every per-order code on a shared device (S1). Best-effort like the rest.
const CODE_INDEX_KEY = "lynia.deliveryCode.index";

async function readCodeIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(CODE_INDEX_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveDeliveryCode(orderId: string, code: string): Promise<void> {
  await SecureStore.setItemAsync(codeKey(orderId), code);
  // Record the order id so sign-out can clear it later — best-effort, never block the code save.
  try {
    const idx = await readCodeIndex();
    if (!idx.includes(orderId)) await SecureStore.setItemAsync(CODE_INDEX_KEY, JSON.stringify([...idx, orderId]));
  } catch {
    /* best-effort */
  }
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

// Whether we've shown the first-run permission-priming explainers (0·7/0·8) on this install. Stored
// so a user who's already been primed (and switches role later) isn't re-walked through them. Best-
// effort — a read failure just re-primes, which is harmless.
const PERMISSIONS_PRIMED_KEY = "lynia.permissionsPrimed";

export async function savePermissionsPrimed(): Promise<void> {
  try {
    await SecureStore.setItemAsync(PERMISSIONS_PRIMED_KEY, "1");
  } catch {
    /* best-effort */
  }
}
export async function loadPermissionsPrimed(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PERMISSIONS_PRIMED_KEY)) === "1";
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

// Orders the rider has already handed back (acknowledged the hand-back terminal for) on this device
// (R8 follow-up). A cancelled order stays reopenable for 24h, so its snapshot keeps surfacing on the
// board as a "hand this parcel back" prompt; once the rider taps "Back to board" we record the id here
// so the already-returned parcel doesn't nag them again. Bounded to the most recent ids to keep the
// blob tiny. Best-effort — a read failure just re-shows the prompt (safe), a write never traps the tap.
const HANDBACK_ACK_KEY = "lynia.handbackAck";
const HANDBACK_ACK_MAX = 20;

async function readHandbackAcks(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(HANDBACK_ACK_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function acknowledgeHandback(orderId: string): Promise<void> {
  try {
    const acks = await readHandbackAcks();
    if (acks.includes(orderId)) return;
    // Keep the newest ids, drop the oldest so the list can't grow without bound.
    const next = [...acks, orderId].slice(-HANDBACK_ACK_MAX);
    await SecureStore.setItemAsync(HANDBACK_ACK_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

export async function loadAcknowledgedHandbacks(): Promise<string[]> {
  return readHandbackAcks();
}

// The saved order-compose draft (home.tsx owns the write under this same key). Named here so sign-out
// can clear it — on a shared device the next user must not rehydrate the previous user's addresses.
const DRAFT_KEY = "lynia.orderDraft";

// Wipe all per-device, per-user state that must NOT survive a sign-out on a shared device (S1): the
// saved order draft (addresses), the accepted-disclaimer flag (so the next user still sees the
// liability gate), the role preference, and every stored one-time delivery code. The session key is
// cleared separately by `clearSession()`. Best-effort — a native failure must never trap sign-out.
export async function clearDeviceState(): Promise<void> {
  try {
    const codes = await readCodeIndex();
    await Promise.all([
      SecureStore.deleteItemAsync(DRAFT_KEY),
      SecureStore.deleteItemAsync(DISCLAIMER_KEY),
      SecureStore.deleteItemAsync(ROLE_PREF_KEY),
      SecureStore.deleteItemAsync(CODE_INDEX_KEY),
      SecureStore.deleteItemAsync(HANDBACK_ACK_KEY),
      // Address book: the saved Home/Work + recent places (addresses) and the recent recipients (the one
      // place we hold contact PII) must not survive to the next user on a shared device — exactly the
      // "next user must not rehydrate the previous user's addresses" rule above, now including recipients.
      SecureStore.deleteItemAsync(SAVED_PLACES_RECENTS_KEY),
      SecureStore.deleteItemAsync(SAVED_PLACES_SAVED_KEY),
      SecureStore.deleteItemAsync(RECIPIENTS_KEY),
      SecureStore.deleteItemAsync(MY_PICKUP_PHONE_KEY),
      // The cached trips list (holds this user's route landmarks) must not paint for the next user.
      SecureStore.deleteItemAsync(HISTORY_SNAPSHOT_KEY),
      // The cached chosen-rider identity (a third party's name + photo) must not survive to the next user.
      SecureStore.deleteItemAsync(RIDER_IDENTITY_KEY),
      ...codes.map((id) => SecureStore.deleteItemAsync(codeKey(id))),
    ]);
  } catch {
    /* best-effort */
  }
}

