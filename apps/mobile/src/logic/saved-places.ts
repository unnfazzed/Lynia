import * as SecureStore from "expo-secure-store";
import type { ResolvedPlace } from "../api/places";

/**
 * On-device "saved places" + "recents" for the search-first address entry (customer-journey §1·2). When
 * the search field is idle the AddressSearch surfaces the customer's Home/Work slots and their last few
 * picked places, so a repeat drop-off is one tap instead of a re-type.
 *
 * Persisted with the SAME on-device primitive the auth session + compose draft use (expo-secure-store),
 * one key each. Everything here is BEST-EFFORT — a native read/write failure must never throw, because
 * recents/saved are a convenience layered on top of the live Places search, never load-bearing: a miss
 * just shows an empty idle list and the search still works.
 *
 * PRIVACY: we store ONLY place data (lat/lng/placeId/landmark) — exactly the ResolvedPlace shape the
 * MapPicker/Places flow already produces. No contact phones or any other PII lands here (mirrors the
 * compose-draft rule), so a stashed Home address is a place, not a person.
 */

const RECENTS_KEY = "lynia.savedPlaces.recents";
const SAVED_KEY = "lynia.savedPlaces.saved";

/** Keep the recents list short — the idle panel is a shortcut, not a history log. */
export const MAX_RECENTS = 5;

/** The two named slots the SAVED section fills (customer-journey §1·2). */
export type SavedSlot = "home" | "work";

export interface SavedPlaces {
  home: ResolvedPlace | null;
  work: ResolvedPlace | null;
}

/** A total, defensive parse of a stored ResolvedPlace — any missing/foreign field ⇒ null (dropped). */
function coercePlace(v: unknown): ResolvedPlace | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<ResolvedPlace>;
  if (
    typeof r.lat !== "number" ||
    typeof r.lng !== "number" ||
    typeof r.landmark !== "string" ||
    typeof r.placeId !== "string" ||
    r.placeId.length === 0
  ) {
    return null;
  }
  // Re-narrow to just the place fields so a stale blob can't smuggle extra keys back onto the form.
  return { lat: r.lat, lng: r.lng, landmark: r.landmark, placeId: r.placeId };
}

/** Bound a recents list: drop malformed rows, dedupe by placeId (first wins), cap to MAX_RECENTS. */
function clampRecents(rows: unknown): ResolvedPlace[] {
  if (!Array.isArray(rows)) return [];
  const out: ResolvedPlace[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const place = coercePlace(raw);
    if (!place || seen.has(place.placeId)) continue;
    seen.add(place.placeId);
    out.push(place);
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

// --- Recents (last few picked places, most-recent first) ---

export async function loadRecents(): Promise<ResolvedPlace[]> {
  try {
    const raw = await SecureStore.getItemAsync(RECENTS_KEY);
    if (!raw) return [];
    return clampRecents(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Remember a picked place at the head of the recents list. Deduped by placeId (re-picking an existing
 * recent floats it back to the top rather than duplicating) and capped to MAX_RECENTS. Returns the new
 * list so the caller can update its state without a follow-up read.
 */
export async function addRecent(place: ResolvedPlace): Promise<ResolvedPlace[]> {
  const clean = coercePlace(place);
  if (!clean) return loadRecents();
  const existing = await loadRecents();
  const next = clampRecents([clean, ...existing]);
  try {
    await SecureStore.setItemAsync(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}

// --- Saved slots (Home / Work) ---

export async function loadSaved(): Promise<SavedPlaces> {
  try {
    const raw = await SecureStore.getItemAsync(SAVED_KEY);
    if (!raw) return { home: null, work: null };
    const d = JSON.parse(raw) as Partial<SavedPlaces>;
    return { home: coercePlace(d.home), work: coercePlace(d.work) };
  } catch {
    return { home: null, work: null };
  }
}

/**
 * Set (or clear, with `null`) one named slot. Reads the current pair, updates the one slot, writes back.
 * Returns the new pair so the caller can update its state without a follow-up read.
 */
export async function saveSlot(slot: SavedSlot, place: ResolvedPlace | null): Promise<SavedPlaces> {
  const current = await loadSaved();
  const next: SavedPlaces = { ...current, [slot]: place ? coercePlace(place) : null };
  try {
    await SecureStore.setItemAsync(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}
