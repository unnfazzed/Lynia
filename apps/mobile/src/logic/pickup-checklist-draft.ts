import * as SecureStore from "expo-secure-store";

/**
 * The rider's pickup item-verification ticks (`checkedItems` in app/rider/job.tsx) had no
 * persistence — unlike the customer's compose form (order-draft.ts) and the rider's bid-compose card
 * (rider-bid-draft.ts), which both autosave for exactly this reason. A process-death mid-verification
 * (the app force-remounts on relaunch) reset every tick back to "all collected" — the seeding effect
 * re-runs on mount and has no way to know the rider had already unticked a missing item. If the rider
 * didn't re-verify before tapping collect, that silently wrong "all items collected" record becomes
 * the durable compliance row for a later missing-item dispute. Only the index set is stored — no PII.
 */
export interface PickupChecklistDraft {
  orderId: string;
  checkedIndexes: number[];
}

export const PICKUP_CHECKLIST_DRAFT_KEY = "lynia.pickupChecklistDraft";

/**
 * Parse a stored draft, defaulting/rejecting malformed fields rather than trusting on-device JSON
 * verbatim — pulled out as a pure function so the recovery behavior is unit-testable without
 * SecureStore. `null` means "nothing usable to restore", not an error.
 */
export function parsePickupChecklistDraft(raw: string | null | undefined): PickupChecklistDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<PickupChecklistDraft> | null;
    if (!d || typeof d.orderId !== "string" || d.orderId.length === 0) return null;
    const checkedIndexes = Array.isArray(d.checkedIndexes)
      ? d.checkedIndexes.filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0)
      : [];
    return { orderId: d.orderId, checkedIndexes };
  } catch {
    return null;
  }
}

// Best-effort, mirroring order-draft.ts/rider-bid-draft.ts: a SecureStore failure must never reject,
// or a failed read would silently disable draft saving for the whole session. A draft is a
// convenience, never load-bearing — the rider can always re-tick manually.
export async function loadPickupChecklistDraft(): Promise<PickupChecklistDraft | null> {
  try {
    return parsePickupChecklistDraft(await SecureStore.getItemAsync(PICKUP_CHECKLIST_DRAFT_KEY));
  } catch {
    return null;
  }
}

export async function savePickupChecklistDraft(draft: PickupChecklistDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(PICKUP_CHECKLIST_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}

export async function clearPickupChecklistDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PICKUP_CHECKLIST_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
