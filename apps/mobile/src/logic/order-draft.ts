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

// The compose-form's restorable field shape. NOT persisted between visits anymore — the send flow no
// longer stashes a draft, so a killed-and-relaunched app opens a blank form (start afresh). This shape
// survives only as the in-memory prefill the re-broadcast / "send again" path builds from an existing
// order (see draftFromParams below). PII (the two contact phone numbers) is DELIBERATELY excluded — a
// courier app must not carry a third party's phone through routing state.
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

// C5: a re-broadcast from the order screen carries THAT order's route/landmarks/items/price in as
// route params (`rb…`), so we can prefill the compose form instead of dumping the user on a blank one.
// Builds the in-memory FormDraft the compose screen hydrates from. Returns null when the params aren't
// a valid re-broadcast (normal home entry) so the screen opens a blank form.
export type RebroadcastParams = Partial<Record<
  "rbPickupLat" | "rbPickupLng" | "rbPickupLandmark" | "rbDropLat" | "rbDropLng" | "rbDropLandmark" | "rbItems" | "rbFare" | "rbNote",
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
  // UX-2026-07-16: the customer's note for the rider (e.g. access instructions, "handle with care") —
  // previously dropped silently on every re-send/reorder path, even though the server's OWN automatic
  // rider-bail rebroadcast (order-lifecycle.service.ts cloneForRebroadcast) already carries it verbatim.
  note?: string | null;
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
    rbNote: o.note ?? "",
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
    note: first(p.rbNote) ?? "",
    declaredValue: "",
    proposedFare: first(p.rbFare) ?? "",
  };
}
