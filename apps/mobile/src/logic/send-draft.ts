import * as SecureStore from "expo-secure-store";
import { emptyItem, type ItemRow, MAX_ITEMS, MAX_QTY } from "./order-draft";
// Type-only: this module stays a leaf, because sign-out's clearDeviceState imports its key.
import type { SendStep, Stop } from "./send-steps";

/**
 * U17: the Send a parcel compose, kept across an app kill, a page reload and a browser swipe-back. The
 * handoff (`send-compose-v2` README "State") says "Persist the draft across steps and app backgrounding",
 * and the offline banner promises "What you've entered is saved." — which was only true in memory.
 *
 * What is stored: the two stops (point + label), the items, the note, the typed price, the step, and the
 * idempotency key of a send whose answer never came (U16: the frozen key, so a resend after a kill replays
 * it instead of opening a second auction). What is NOT stored: either phone number. The sender's own number
 * already has its own slot (`saved-recipients.ts`), and the recipient's is a third party's — it is never
 * written for a compose in progress.
 *
 * The slot is the old compose-draft key, which sign-out already clears on a shared device
 * (`clearDeviceState` in src/auth/device-state.ts imports SEND_DRAFT_KEY from here). Best-effort like
 * every other draft: a storage failure never rejects, and a draft is a convenience, never load-bearing.
 */

export const SEND_DRAFT_KEY = "lynia.orderDraft";
/** A draft older than this is dropped on read: a compose from yesterday is not the order of today. */
export const SEND_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Trailing debounce for the write (PERF19-02: never a keychain round trip per keystroke). */
export const SEND_DRAFT_DEBOUNCE_MS = 500;
/**
 * How long a stored unanswered-send key (U16) stays worth replaying. A send lost minutes ago may be live and
 * must not open a second auction; one lost hours ago is either live already (and on the Orders tab) or long
 * gone — replaying its key would make a NEW compose return that old order (the server answers a known key
 * with the order it made, whatever the body says).
 */
export const SEND_DRAFT_SENT_KEY_TTL_MS = 10 * 60 * 1000;

export interface SendDraft {
  savedAt: number;
  /** The account that wrote it. A draft is restored only into the same account (S1: a shared device). */
  profileId: string;
  step: SendStep;
  pickup: Stop | null;
  drop: Stop | null;
  items: ItemRow[];
  note: string;
  priceText: string;
  /** U16: the idempotency key of a send that got no definitive answer, or null. */
  sentKey: string | null;
  /** When that key went out (null with no key); the key is dropped on read after SEND_DRAFT_SENT_KEY_TTL_MS. */
  sentAt: number | null;
}

/** A stop label's cap — the same 160 as STOP_NAME_MAX in send-steps.ts (pinned equal by send-draft.test.ts). */
export const DRAFT_STOP_NAME_MAX = 160;

const SOURCES = new Set<Stop["source"]>(["gps", "search", "map", "prefill"]);

function parseStop(v: unknown): Stop | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<Stop>;
  if (typeof s.lat !== "number" || typeof s.lng !== "number" || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return null;
  if (typeof s.name !== "string" || s.name.trim().length === 0) return null;
  const source = SOURCES.has(s.source as Stop["source"]) ? (s.source as Stop["source"]) : "prefill";
  return {
    lat: s.lat,
    lng: s.lng,
    name: s.name.slice(0, DRAFT_STOP_NAME_MAX),
    ...(typeof s.placeId === "string" && s.placeId ? { placeId: s.placeId } : {}),
    source,
  };
}

function parseItems(v: unknown): ItemRow[] {
  if (!Array.isArray(v) || v.length === 0) return [emptyItem()];
  return v.slice(0, MAX_ITEMS).map((r: unknown) => {
    const row = (r ?? {}) as Partial<ItemRow>;
    return {
      description: typeof row.description === "string" ? row.description.slice(0, 140) : "",
      quantity: Math.min(MAX_QTY, Math.max(1, Math.round(Number(row.quantity) || 1))),
    };
  });
}

/** Nothing worth restoring: no drop-off, no item text, no note and no unanswered send. */
export function isBlankSendDraft(d: Pick<SendDraft, "drop" | "items" | "note" | "sentKey">): boolean {
  return d.drop == null && d.items.every((it) => it.description.trim().length === 0) && d.note.trim().length === 0 && d.sentKey == null;
}

/**
 * A stored draft, field by field, or null when there is nothing usable: unparseable, older than the TTL,
 * written by another account (or by no account), or blank. An unanswered-send key older than
 * SEND_DRAFT_SENT_KEY_TTL_MS is dropped. Pure (takes `now`), so the recovery rules are testable without storage.
 */
export function parseSendDraft(raw: string | null | undefined, now: number, profileId: string | null): SendDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Record<keyof SendDraft, unknown>> | null;
    if (!d || typeof d !== "object") return null;
    const savedAt = typeof d.savedAt === "number" ? d.savedAt : NaN;
    if (!Number.isFinite(savedAt) || now - savedAt > SEND_DRAFT_TTL_MS || savedAt - now > 60_000) return null;
    if (!profileId || d.profileId !== profileId) return null;
    const sentAt = typeof d.sentAt === "number" && Number.isFinite(d.sentAt) ? d.sentAt : null;
    const keyLive = typeof d.sentKey === "string" && d.sentKey.length > 0 && sentAt != null && now - sentAt <= SEND_DRAFT_SENT_KEY_TTL_MS && sentAt - now <= 60_000;
    const step = d.step === 2 || d.step === 3 || d.step === 4 ? d.step : 1;
    const draft: SendDraft = {
      savedAt,
      profileId,
      step,
      pickup: parseStop(d.pickup),
      drop: parseStop(d.drop),
      items: parseItems(d.items),
      note: typeof d.note === "string" ? d.note.slice(0, 280) : "",
      priceText: typeof d.priceText === "string" ? d.priceText.slice(0, 10) : "",
      sentKey: keyLive ? (d.sentKey as string) : null,
      sentAt: keyLive ? sentAt : null,
    };
    return isBlankSendDraft(draft) ? null : draft;
  } catch {
    return null;
  }
}

/**
 * Every read, write and clear goes through ONE promise chain, in call order: a write started before a
 * clear can never land after it (an order placed while a debounced save was still in the keychain would
 * otherwise come back as a draft).
 */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  const run = chain.then(op).catch(() => fallback);
  chain = run;
  return run;
}

export function loadSendDraft(profileId: string | null, now: number = Date.now()): Promise<SendDraft | null> {
  return serial(async () => parseSendDraft(await SecureStore.getItemAsync(SEND_DRAFT_KEY), now, profileId), null);
}

/** Write the draft, or clear the slot when it is blank (a GPS pickup alone is not a compose). */
export function saveSendDraft(draft: SendDraft): Promise<void> {
  return serial(async () => {
    if (isBlankSendDraft(draft)) await SecureStore.deleteItemAsync(SEND_DRAFT_KEY);
    else await SecureStore.setItemAsync(SEND_DRAFT_KEY, JSON.stringify(draft));
  }, undefined);
}

export function clearSendDraft(): Promise<void> {
  return serial(() => SecureStore.deleteItemAsync(SEND_DRAFT_KEY), undefined);
}
