/**
 * Pure response mappers for Google Places API (New) (search-first addressing, customer-journey
 * §1·2/§1·3). Kept separate from the network client (`src/api/places.ts`) so the shape-mapping — the
 * part with real product semantics — is unit-testable without a key or a fetch. Every mapper is TOTAL:
 * a malformed/empty body maps to `[]` / `null`, never a throw, so the caller always falls back to the
 * pin-on-map path cleanly.
 *
 * Why "(New)": the legacy Places web service (`maps.googleapis.com/maps/api/place/…`) is a Legacy
 * product that Google does not offer to Cloud projects created after 2025-03-01. The keys moved to such
 * a project when `lynia-500911` was suspended (docs/plans/2026-09-24-gcp-to-azure-migration.md), so the
 * legacy endpoints would refuse the new key on every call — the same silent empty list as a dead key.
 */

/** One autocomplete suggestion row, flattened from a Places prediction. */
export interface PlaceSuggestion {
  placeId: string;
  /** Bold line — the place name / street (structuredFormat.mainText). */
  primary: string;
  /** Muted line — the area / city (structuredFormat.secondaryText). May be empty. */
  secondary: string;
}

/** A resolved place: exactly what the picked-point flow needs (same shape the MapPicker feeds). */
export interface ResolvedPlace {
  lat: number;
  lng: number;
  landmark: string;
  placeId: string;
}

/** Places (New) wraps every display string as `{ text, … }`. */
interface RawText {
  text?: unknown;
}

function textOf(t: RawText | undefined): string {
  return typeof t?.text === "string" ? t.text : "";
}

// --- Autocomplete (input → predictions) ---

interface RawSuggestion {
  placePrediction?: {
    placeId?: unknown;
    text?: RawText;
    structuredFormat?: { mainText?: RawText; secondaryText?: RawText };
  };
}

/**
 * The fault a Places (New) error body names, or null when the body is not an error.
 *
 * This matters because a refused call and an honest miss are indistinguishable downstream: both yield
 * `[]` from `mapPredictions`, so a dead key (a suspended project, an API that is not enabled, a key whose
 * restriction excludes Places) looks exactly like an address nobody could find. Places (New) reports a
 * refusal as an HTTP error whose body is the standard Google error envelope:
 *
 *   { "error": { "code": 403, "status": "PERMISSION_DENIED", "message": "…",
 *                "details": [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "SERVICE_DISABLED" }] } }
 *
 * The `reason` is the precise cause (`SERVICE_DISABLED`, `API_KEY_SERVICE_BLOCKED`, `API_KEY_INVALID`,
 * `BILLING_DISABLED`, `CONSUMER_SUSPENDED`, …), so it is appended when present: `PERMISSION_DENIED:SERVICE_DISABLED`.
 * A success — including an empty one, which comes back as `{}` — has no `error` and maps to null.
 */
export function placesFault(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  if (!error || typeof error !== "object") return null;
  const { status, code, details } = error as { status?: unknown; code?: unknown; details?: unknown };
  const head = typeof status === "string" && status ? status : typeof code === "number" ? `HTTP_${code}` : "UNKNOWN";
  const info = Array.isArray(details)
    ? (details as { reason?: unknown }[]).find((d) => typeof d?.reason === "string" && d.reason)
    : undefined;
  return info ? `${head}:${info.reason as string}` : head;
}

/**
 * Map an Autocomplete (New) body → suggestion rows. Drops anything that is not a place prediction with
 * a placeId: a `queryPrediction` (only sent under `includeQueryPredictions`, which is never set) and an
 * id-less prediction are both unselectable. An empty result arrives as `{}` (proto3 omits an empty
 * `suggestions`), which maps to `[]` like any other body without rows.
 */
export function mapPredictions(body: unknown): PlaceSuggestion[] {
  const suggestions = (body as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  const out: PlaceSuggestion[] = [];
  for (const raw of suggestions as RawSuggestion[]) {
    const p = raw?.placePrediction;
    const placeId = typeof p?.placeId === "string" ? p.placeId : null;
    if (!placeId) continue;
    // Prefer the structured main/secondary; fall back to the flat text for the primary line.
    const primary = textOf(p?.structuredFormat?.mainText) || textOf(p?.text);
    const secondary = textOf(p?.structuredFormat?.secondaryText);
    out.push({ placeId, primary, secondary });
  }
  return out;
}

// --- Details (place id → coordinates + landmark) ---

interface RawPlace {
  id?: unknown;
  formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  displayName?: RawText;
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
 * Map a Place Details (New) body → a resolved place, or null when it lacks usable coordinates.
 *
 * `name` is the tapped suggestion's main text. `src/api/places.ts` asks Details for `id`,
 * `formattedAddress` and `location` only, which are all Essentials-tier fields: adding `displayName`
 * would bill every lookup at the Pro tier, for a name the suggestion row already carries. A
 * `displayName` in the body still wins, so widening the field mask later needs no change here.
 * `placeId` is threaded through from the request when the body omits `id`.
 */
export function mapPlaceDetails(body: unknown, placeId: string, name = ""): ResolvedPlace | null {
  const place = body as RawPlace | null;
  const loc = place?.location;
  const lat = typeof loc?.latitude === "number" ? loc.latitude : null;
  const lng = typeof loc?.longitude === "number" ? loc.longitude : null;
  if (lat === null || lng === null) return null;
  const label = textOf(place?.displayName) || name;
  const formatted = typeof place?.formattedAddress === "string" ? place.formattedAddress : "";
  const resolvedId = typeof place?.id === "string" && place.id ? place.id : placeId;
  return { lat, lng, landmark: landmarkFrom(label, formatted), placeId: resolvedId };
}
