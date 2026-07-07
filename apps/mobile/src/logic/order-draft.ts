import * as SecureStore from "expo-secure-store";
import type { PickedPoint } from "../ui/MapPicker";

// One compose row of "what are you sending?" — mirrors the contract's OrderItem.
export interface ItemRow {
  description: string;
  quantity: number;
}
export const emptyItem = (): ItemRow => ({ description: "", quantity: 1 });
// Contract caps: ≤10 rows, qty 1–99, description ≤140 (OrderItem).
export const MAX_ITEMS = 10;
export const MAX_QTY = 99;

// The form draft persisted between visits. PII (the two contact phone numbers) is DELIBERATELY
// excluded — a courier app must not stash a third party's phone in on-device storage. Everything
// here is the sender's own routing/pricing intent, which is safe to restore.
export interface FormDraft {
  pickupPoint: PickedPoint | null;
  pickupLandmark: string;
  dropPoint: PickedPoint | null;
  dropLandmark: string;
  items: ItemRow[];
  note: string;
  declaredValue: string;
  proposedFare: string;
}

// The liability-disclaimer policy the customer must accept before a first broadcast (A1-8). Bump this
// string when the disclaimer copy/terms change and the accept-to-continue gate re-shows.
export const DISCLAIMER_POLICY_VERSION = "2026-07-01";

// Reuse the same on-device primitive the auth session uses (expo-secure-store); a single key.
export const DRAFT_KEY = "lynia.orderDraft";
// All three are best-effort: a SecureStore reject (native read/write failure) must never reject —
// otherwise a failed read would leave `hydrated` unset and silently disable draft saving for the
// whole session. A draft is a convenience, never load-bearing.
export async function loadDraft(): Promise<FormDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as FormDraft & { itemDescription?: string };
    // Pre-line-items drafts stored a single `itemDescription` string — hydrate it as one row.
    // Rows are re-clamped to the contract caps in case a stale/foreign draft slips through.
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

// C5: a re-broadcast from the order screen carries THAT order's route/landmarks/items/price in as
// route params (`rb…`), so we can prefill the compose form instead of dumping the user on a blank one.
// Reuses the FormDraft shape the draft-restore path already consumes. Returns null when the params
// aren't a valid re-broadcast (normal home entry) so we fall back to the stored draft.
export type RebroadcastParams = Partial<Record<
  "rbPickupLat" | "rbPickupLng" | "rbPickupLandmark" | "rbDropLat" | "rbDropLng" | "rbDropLandmark" | "rbItems" | "rbFare",
  string | string[]
>>;
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
/**
 * Build the `rb…` route params that prefill the compose form from an existing order — the shared core of
 * both "re-broadcast this order" (the tracker's expired/bail recovery) and "send again" (a one-tap
 * reorder from trip history). Structured line-items ride as JSON; a history row that only has the
 * `itemDesc` summary is wrapped into a single item so the reorder still lands on a filled form. All
 * values are strings because route params are strings.
 */
export function buildRebroadcastParams(o: {
  pickup: { point: { lat: number; lng: number }; landmark?: string | null };
  dropoff: { point: { lat: number; lng: number }; landmark?: string | null };
  items?: { description: string; quantity: number }[] | null;
  itemDesc?: string | null;
  proposedFare?: string | number | null;
}): RebroadcastParams {
  const items =
    o.items && o.items.length > 0
      ? o.items
      : o.itemDesc && o.itemDesc.trim().length > 0
        ? [{ description: o.itemDesc.trim(), quantity: 1 }]
        : [];
  return {
    rbPickupLat: String(o.pickup.point.lat),
    rbPickupLng: String(o.pickup.point.lng),
    rbPickupLandmark: o.pickup.landmark ?? "",
    rbDropLat: String(o.dropoff.point.lat),
    rbDropLng: String(o.dropoff.point.lng),
    rbDropLandmark: o.dropoff.landmark ?? "",
    rbItems: JSON.stringify(items),
    rbFare: o.proposedFare != null ? String(o.proposedFare) : "",
  };
}

export function draftFromParams(p: RebroadcastParams): FormDraft | null {
  const pLat = Number(first(p.rbPickupLat));
  const pLng = Number(first(p.rbPickupLng));
  const dLat = Number(first(p.rbDropLat));
  const dLng = Number(first(p.rbDropLng));
  if (![pLat, pLng, dLat, dLng].every(Number.isFinite)) return null;
  let items: ItemRow[] = [emptyItem()];
  try {
    const parsed = JSON.parse(first(p.rbItems) ?? "[]") as ItemRow[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      items = parsed.slice(0, MAX_ITEMS).map((r) => ({
        description: (typeof r?.description === "string" ? r.description : "").slice(0, 140),
        quantity: Math.min(MAX_QTY, Math.max(1, Math.round(Number(r?.quantity) || 1))),
      }));
    }
  } catch {
    /* malformed items param — fall back to one empty row */
  }
  return {
    pickupPoint: { lat: pLat, lng: pLng },
    pickupLandmark: first(p.rbPickupLandmark) ?? "",
    dropPoint: { lat: dLat, lng: dLng },
    dropLandmark: first(p.rbDropLandmark) ?? "",
    items,
    note: "",
    declaredValue: "",
    proposedFare: first(p.rbFare) ?? "",
  };
}
