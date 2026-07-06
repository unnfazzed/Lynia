import * as SecureStore from "expo-secure-store";
import type { PickedPoint } from "../ui/MapPicker";

/**
 * The compose-form draft, shared between the compose screen (home.tsx, which reads it on mount) and
 * the order screen (which SEEDS it from an expired order so "Nudge price & re-broadcast" doesn't make
 * the customer re-type the whole request — customer-journey 2·b3). Kept in one module so the storage
 * key and shape can't drift between the writer and the reader.
 *
 * PII (the two contact phone numbers) is DELIBERATELY excluded — a courier app must not stash a third
 * party's phone on-device — so a re-broadcast re-asks only the phones, never the routing/pricing intent.
 */
export interface ComposeItemRow {
  description: string;
  quantity: number;
}
export interface FormDraft {
  pickupPoint: PickedPoint | null;
  pickupLandmark: string;
  dropPoint: PickedPoint | null;
  dropLandmark: string;
  items: ComposeItemRow[];
  note: string;
  declaredValue: string;
  proposedFare: string;
}

// Contract caps mirrored so a stale/foreign draft can't smuggle out-of-bounds values into the form.
export const MAX_ITEMS = 10;
export const MAX_QTY = 99;

export const emptyItem = (): ComposeItemRow => ({ description: "", quantity: 1 });

// Reuse the same on-device primitive the auth session uses (expo-secure-store); a single key.
const DRAFT_KEY = "lynia.orderDraft";

// All three are best-effort: a SecureStore reject (native read/write failure) must never reject —
// a draft is a convenience, never load-bearing.
export async function loadDraft(): Promise<FormDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as FormDraft & { itemDescription?: string };
    // Pre-line-items drafts stored a single `itemDescription` string — hydrate it as one row.
    const rows = Array.isArray(d.items) ? d.items : [{ description: d.itemDescription ?? "", quantity: 1 }];
    d.items = rows.slice(0, MAX_ITEMS).map((r) => ({
      description: (typeof r?.description === "string" ? r.description : "").slice(0, 140),
      quantity: Math.min(MAX_QTY, Math.max(1, Math.round(Number(r?.quantity) || 1))),
    }));
    if (d.items.length === 0) d.items = [emptyItem()];
    return d;
  } catch {
    return null;
  }
}
export async function saveDraft(draft: FormDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}
export async function clearDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Seed a compose draft from an order the customer is re-broadcasting (2·b3). Copies the routing,
 * items, note and price so the form comes back pre-filled; phones are intentionally left blank (PII).
 * `nudge` optionally bumps the price by a small step so the re-broadcast starts above the ask that
 * just failed — the whole point of "nudge & re-broadcast".
 */
export async function seedDraftFromOrder(order: {
  pickup: { point: { lat: number; lng: number }; landmark: string };
  dropoff: { point: { lat: number; lng: number }; landmark: string };
  items?: { description: string; quantity: number }[] | null;
  note?: string | null;
  proposedFare: string;
}): Promise<void> {
  const base = Number(order.proposedFare);
  const nudged = Number.isFinite(base) ? Math.max(base, base + 0.5) : base;
  const items = (order.items ?? [])
    .map((it) => ({ description: it.description.slice(0, 140), quantity: Math.min(MAX_QTY, Math.max(1, it.quantity)) }))
    .slice(0, MAX_ITEMS);
  await saveDraft({
    pickupPoint: { lat: order.pickup.point.lat, lng: order.pickup.point.lng },
    pickupLandmark: order.pickup.landmark,
    dropPoint: { lat: order.dropoff.point.lat, lng: order.dropoff.point.lng },
    dropLandmark: order.dropoff.landmark,
    items: items.length > 0 ? items : [emptyItem()],
    note: order.note ?? "",
    declaredValue: "",
    proposedFare: Number.isFinite(nudged) ? nudged.toFixed(2) : "",
  });
}
