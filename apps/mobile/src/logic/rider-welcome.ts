import * as SecureStore from "expo-secure-store";

/**
 * Calm Mint v2 R3 "You're verified" (ledger D-55) shows ONCE per account on this phone: the first time
 * a rider opens the board verified. Keyed by profile id, so a second account on the same phone still
 * gets its own welcome. Best-effort: a read failure shows nothing (never a welcome loop).
 *
 * Stored as a JSON SET of profile ids. It used to be a single slot (the last profile id welcomed), so a
 * second account on a shared phone overwrote the first — and switching back showed the first rider R3
 * again. An old single-id value is read as a one-id set and rewritten as a set on the next mark.
 */
export const RIDER_WELCOME_KEY = "lynia.riderWelcomed.v1";
/** Bounded so a phone passed between many accounts can't grow the keystore value without limit. */
const MAX_IDS = 20;

/** What this process already knows (read or written), so a remount draws its answer on the first frame. */
const known = new Map<string, boolean>();

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  if (!raw.startsWith("[")) return [raw]; // the old single-slot value
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The answer this process already holds for `profileId` (no keystore read) — null when not yet read. */
export function riderWelcomeSeenCached(profileId: string): boolean | null {
  return known.get(profileId) ?? null;
}

export async function riderWelcomeSeen(profileId: string): Promise<boolean> {
  try {
    const seen = parseIds(await SecureStore.getItemAsync(RIDER_WELCOME_KEY)).includes(profileId);
    known.set(profileId, seen);
    return seen;
  } catch {
    return true;
  }
}

export async function markRiderWelcomeSeen(profileId: string): Promise<void> {
  known.set(profileId, true);
  try {
    const ids = parseIds(await SecureStore.getItemAsync(RIDER_WELCOME_KEY)).filter((id) => id !== profileId);
    await SecureStore.setItemAsync(RIDER_WELCOME_KEY, JSON.stringify([...ids, profileId].slice(-MAX_IDS)));
  } catch {
    /* best-effort */
  }
}

/** Test seam: forget what this process has read. */
export function __resetRiderWelcomeCache(): void {
  known.clear();
}
