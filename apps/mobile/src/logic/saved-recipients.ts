import * as SecureStore from "expo-secure-store";

/**
 * On-device "recent recipients" — the last few {name, phone} pairs a customer sent to, so a repeat send
 * is a one-tap chip instead of re-typing a phone number at the drop-off field. This is the send-a-parcel
 * analogue of `saved-places` (Home/Work + recents), and it deliberately reuses the SAME on-device
 * primitive: expo-secure-store, one key, best-effort everywhere.
 *
 * PRIVACY — this is the ONE place we persist contact PII, so the rules are strict and explicit:
 *   • Stored ONLY on this device, in the OS keystore (expo-secure-store), NEVER sent to the server as a
 *     "contact book" — it's a local typing shortcut, nothing more.
 *   • It holds the RECIPIENT the sender themselves typed (name optional + phone). That's the sender's own
 *     address book, the same data the OS Contacts app holds — not third-party data we harvested.
 *   • Capped short (a shortcut, not a CRM), deduped by normalised phone, and every read/write fails soft
 *     to an empty list so a keystore miss can never break the compose form.
 *   • Cleared on sign-out alongside the session (see auth/session clearing), so a shared device doesn't
 *     leak the last sender's recipients to the next account.
 */

const KEY = "lynia.savedRecipients.v1";

/** Keep it a shortcut, not a history log. */
export const MAX_RECIPIENTS = 5;

export interface Recipient {
  /** The recipient's name, if the sender gave one (compose has no name field today, so usually ""). */
  name: string;
  /** The contact phone exactly as typed (kept human-readable; matched on a normalised form). */
  phone: string;
}

/** Digits-only form used for dedupe/match so "+263 77 123 4567" and "0771234567" don't both persist. */
export function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** A minimum-length gate so we never stash a half-typed number as a "recipient". */
function isUsablePhone(phone: string): boolean {
  return normalizePhone(phone).length >= 6;
}

function coerce(v: unknown): Recipient | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<Recipient>;
  if (typeof r.phone !== "string" || !isUsablePhone(r.phone)) return null;
  return { name: typeof r.name === "string" ? r.name.trim().slice(0, 80) : "", phone: r.phone.trim().slice(0, 20) };
}

/** Parse + dedupe (by normalised phone, first wins) + cap. Pure so the clamping is unit-testable. */
export function clampRecipients(rows: unknown): Recipient[] {
  if (!Array.isArray(rows)) return [];
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = coerce(raw);
    if (!r) continue;
    const key = normalizePhone(r.phone);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

export async function loadRecipients(): Promise<Recipient[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    return clampRecipients(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Remember a recipient at the head of the list. Re-sending to the same phone floats it to the top
 * (and refreshes its name) rather than duplicating. Returns the new list so the caller can update state
 * without a follow-up read. Best-effort — a write failure just means the shortcut won't appear next time.
 */
export async function rememberRecipient(recipient: Recipient): Promise<Recipient[]> {
  const clean = coerce(recipient);
  if (!clean) return loadRecipients();
  const existing = await loadRecipients();
  const key = normalizePhone(clean.phone);
  const next = clampRecipients([clean, ...existing.filter((r) => normalizePhone(r.phone) !== key)]);
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}

/** Wipe all saved recipients (sign-out / a "clear" affordance). Best-effort. */
export async function clearRecipients(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* best-effort */
  }
}
