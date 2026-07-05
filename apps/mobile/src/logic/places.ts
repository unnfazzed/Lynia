/**
 * Pure response mappers for the Google Places REST API (search-first addressing, customer-journey
 * §1·2/§1·3). Kept separate from the network client (`src/api/places.ts`) so the shape-mapping — the
 * part with real product semantics — is unit-testable without a key or a fetch. Every mapper is TOTAL:
 * a malformed/empty body maps to `[]` / `null`, never a throw, so the caller always falls back to the
 * pin-on-map path cleanly.
 */

/** One autocomplete suggestion row, flattened from a Places prediction. */
export interface PlaceSuggestion {
  placeId: string;
  /** Bold line — the place name / street (structured_formatting.main_text). */
  primary: string;
  /** Muted line — the area / city (structured_formatting.secondary_text). May be empty. */
  secondary: string;
}

/** A resolved place: exactly what the picked-point flow needs (same shape the MapPicker feeds). */
export interface ResolvedPlace {
  lat: number;
  lng: number;
  landmark: string;
  placeId: string;
}

// --- Autocomplete (input → predictions) ---

interface RawPrediction {
  place_id?: unknown;
  description?: unknown;
  structured_formatting?: { main_text?: unknown; secondary_text?: unknown };
}

/** Map a Places Autocomplete body → suggestion rows. Drops any prediction missing a place_id. */
export function mapPredictions(body: unknown): PlaceSuggestion[] {
  const preds = (body as { predictions?: unknown } | null)?.predictions;
  if (!Array.isArray(preds)) return [];
  const out: PlaceSuggestion[] = [];
  for (const raw of preds as RawPrediction[]) {
    const placeId = typeof raw?.place_id === "string" ? raw.place_id : null;
    if (!placeId) continue;
    const sf = raw.structured_formatting ?? {};
    // Prefer the structured main/secondary; fall back to the flat description for the primary line.
    const primary =
      (typeof sf.main_text === "string" && sf.main_text) ||
      (typeof raw.description === "string" ? raw.description : "") ||
      "";
    const secondary = typeof sf.secondary_text === "string" ? sf.secondary_text : "";
    out.push({ placeId, primary, secondary });
  }
  return out;
}

// --- Details (place_id → coordinates + landmark) ---

interface RawDetails {
  result?: {
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
    name?: unknown;
    formatted_address?: unknown;
    place_id?: unknown;
  };
}

/** Build a human landmark from a Details result — name + address, deduped, capped to the Waypoint max. */
function landmarkFrom(name: string, formatted: string): string {
  const parts = [name, formatted].filter((s) => s.length > 0);
  // If the name is already the head of the formatted address, don't repeat it ("Eastgate Mall,
  // Eastgate Mall, Robert Mugabe Rd" → "Eastgate Mall, Robert Mugabe Rd").
  const joined = parts.length === 2 && formatted.startsWith(name) ? formatted : parts.join(", ");
  return joined.slice(0, 160).trim();
}

/**
 * Map a Places Details body → a resolved place, or null when it lacks usable coordinates. `placeId` is
 * threaded through from the request when the body omits it (Details doesn't always echo it back).
 */
export function mapPlaceDetails(body: unknown, placeId: string): ResolvedPlace | null {
  const result = (body as RawDetails | null)?.result;
  const loc = result?.geometry?.location;
  const lat = typeof loc?.lat === "number" ? loc.lat : null;
  const lng = typeof loc?.lng === "number" ? loc.lng : null;
  if (lat === null || lng === null) return null;
  const name = typeof result?.name === "string" ? result.name : "";
  const formatted = typeof result?.formatted_address === "string" ? result.formatted_address : "";
  const resolvedId = typeof result?.place_id === "string" ? result.place_id : placeId;
  return { lat, lng, landmark: landmarkFrom(name, formatted), placeId: resolvedId };
}
