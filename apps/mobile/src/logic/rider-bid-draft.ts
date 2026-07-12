import * as SecureStore from "expo-secure-store";
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

export async function clearRiderBidDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RIDER_BID_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
