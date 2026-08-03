import * as SecureStore from "expo-secure-store";
import { OFFER_WINDOW_MS } from "@lynia/shared";
import type { OpenOrder } from "../api/orders";

/**
 * JOURNEY-BUGS: the rider's in-progress bid-compose card (a selected order + typed price/ETA) had no
 * persistence at all — unlike the customer's compose form (order-draft.ts), which autosaves every
 * keystroke to SecureStore for exactly this reason. If Android reclaimed memory or the screen
 * force-remounted while a rider had a counter-offer typed mid-auction, it silently vanished with no
 * warning. `selected` is already the board's REDACTED public shape (point + landmark only, no
 * contactPhone) — nothing persisted here is PII.
 */
export interface RiderBidDraft {
  selected: OpenOrder;
  fare: string;
  eta: string;
  offerMode: "accept" | "counter";
}

export const RIDER_BID_DRAFT_KEY = "lynia.riderBidDraft";

/**
 * Parse a stored draft, defaulting/rejecting malformed fields rather than trusting on-device JSON
 * verbatim — pulled out as a pure function so the recovery behavior (a partial or foreign-shaped
 * blob shouldn't crash the hydrate, just fall back field-by-field) is unit-testable without
 * SecureStore. `null` means "nothing usable to restore", not an error.
 */
export function parseRiderBidDraft(raw: string | null | undefined): RiderBidDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<RiderBidDraft> | null;
    if (!d || typeof d.selected?.id !== "string") return null;
    return {
      selected: d.selected,
      fare: typeof d.fare === "string" ? d.fare : "",
      eta: typeof d.eta === "string" ? d.eta : "",
      offerMode: d.offerMode === "counter" ? "counter" : "accept",
    };
  } catch {
    return null;
  }
}

// Best-effort, mirroring order-draft.ts: a SecureStore failure must never reject, or a failed read
// would silently disable draft saving for the whole session. A draft is a convenience, never load-bearing.
export async function loadRiderBidDraft(): Promise<RiderBidDraft | null> {
  try {
    return parseRiderBidDraft(await SecureStore.getItemAsync(RIDER_BID_DRAFT_KEY));
  } catch {
    return null;
  }
}

export async function saveRiderBidDraft(draft: RiderBidDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_BID_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}

/**
 * A restored draft's `selected` order carries the SAME 90s auction window every sent-offer countdown
 * uses (createdAt + OFFER_WINDOW_MS) — but unlike a live session, `loadRiderBidDraft` used to restore
 * it unconditionally on cold start with no expiry check, and the only thing that ever cleared a dead
 * `selected` was a live WS `bid:expired`/`order:taken` event. A rider who killed the app mid-auction and
 * relaunched after the window closed (or while still offline, so the board socket never even connects)
 * got a phantom "Accept $X" compose card for an order that was already gone. Pulled out as a pure
 * function, keyed on an explicit `now`, so the cold-start gate is unit-testable without mounting the
 * screen or mocking Date.
 */
export function isRiderBidDraftExpired(draft: RiderBidDraft, now: number): boolean {
  const closesAt = new Date(draft.selected.createdAt).getTime() + OFFER_WINDOW_MS;
  if (Number.isNaN(closesAt)) return true; // an unparseable createdAt can't be trusted as still-open
  return closesAt <= now;
}

export async function clearRiderBidDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RIDER_BID_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}

/** A live offer the rider has sent — kept on-screen with a countdown to the auction close (C2). */
export interface SentOffer {
  order: OpenOrder;
  fare: string;
  etaMinutes: number;
  /** ISO auction close — createdAt + OFFER_WINDOW_MS, the same window the customer sees. */
  expiresAt: string;
}

/**
 * BH-05: build the "your offer is in" card entry from the EXACT fare/eta that were actually SENT
 * (the mutation's own variables), never from whatever the compose form currently shows. The rider can
 * edit the fare/eta fields between a failed send and the "already responded" 409 lost-response
 * recovery (the error state re-enables editing) — reading live form state at that later point showed
 * the just-edited, never-sent price as if it were the rider's real bid. Pulled out as a pure function
 * so this invariant (params win, not ambient state) is unit-testable without mounting the screen.
 */
export function buildSentOfferEntry(order: OpenOrder, sentFare: string, sentEtaNum: number): SentOffer {
  const expiresAt = new Date(new Date(order.createdAt).getTime() + OFFER_WINDOW_MS).toISOString();
  return { order, fare: sentFare, etaMinutes: Math.round(sentEtaNum), expiresAt };
}

/**
 * BH-21: unlike the single in-progress compose draft above, the LIST of offers a rider has already
 * sent this session (`sentOffers`, and the `bidIds` the board filter derives from it) used to live only
 * in `useState` — a process death (OS memory reclaim, crash, force-close) mid-auction wiped it with no
 * server-side reconstruction path (there is no `/offers/mine`-shaped endpoint), so on relaunch already-bid
 * orders silently reappeared as freshly biddable and their "your offer is in" cards never came back.
 * Persisted the same way as the compose draft (best-effort SecureStore, PII-free — `order` is already the
 * board's redacted public shape).
 */
export const RIDER_SENT_OFFERS_KEY = "lynia.riderSentOffers";

export function parseRiderSentOffers(raw: string | null | undefined): SentOffer[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is SentOffer =>
        !!e &&
        typeof e === "object" &&
        typeof (e as Partial<SentOffer>).order?.id === "string" &&
        typeof (e as Partial<SentOffer>).expiresAt === "string",
    );
  } catch {
    return [];
  }
}

export async function loadRiderSentOffers(): Promise<SentOffer[]> {
  try {
    return parseRiderSentOffers(await SecureStore.getItemAsync(RIDER_SENT_OFFERS_KEY));
  } catch {
    return [];
  }
}

// Best-effort, mirroring saveRiderBidDraft/clearRiderBidDraft above. An empty list deletes the key
// rather than storing "[]" so going offline (which clears sentOffers) also clears the persisted store.
export async function saveRiderSentOffers(offers: SentOffer[]): Promise<void> {
  try {
    if (offers.length === 0) {
      await SecureStore.deleteItemAsync(RIDER_SENT_OFFERS_KEY);
    } else {
      await SecureStore.setItemAsync(RIDER_SENT_OFFERS_KEY, JSON.stringify(offers));
    }
  } catch {
    /* best-effort */
  }
}

/** A restored sent-offer whose auction window already closed while the app was dead — same treatment
 *  as isRiderBidDraftExpired: drop it silently rather than showing a countdown for a window that's gone. */
export function isSentOfferExpired(offer: SentOffer, now: number): boolean {
  const closesAt = new Date(offer.expiresAt).getTime();
  if (Number.isNaN(closesAt)) return true;
  return closesAt <= now;
}

/** B-T3: how long a resolved offer (taken / expired / locally stale-closed) stays visible in "Your
 *  offers" after its auction closes before being swept out — long enough the rider sees the
 *  resolution message, short enough the list doesn't grow for a whole online shift. Before this, the
 *  only removal path was a full wipe on going offline, so `sentOffers` (and its SecureStore mirror)
 *  accumulated one entry per bid for the entire time a busy-market rider stayed online. */
export const SENT_OFFER_RETENTION_MS = 60_000;

/** True once an offer's auction has been closed longer than the retention window — ready to be swept
 *  from the on-screen list. Reuses `expiresAt` (no separate "resolvedAt" needed): a taken/expired push
 *  and the staleClosed self-heal in SentOfferCard both key off the same auction-close timestamp. */
export function isSentOfferStale(offer: SentOffer, now: number): boolean {
  const closesAt = new Date(offer.expiresAt).getTime();
  if (Number.isNaN(closesAt)) return true;
  return closesAt + SENT_OFFER_RETENTION_MS <= now;
}
