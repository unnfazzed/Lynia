import { GOOGLE_PLACES_KEY, placesEnabled } from "../config";
import { mapPlaceDetails, mapPredictions, placesFault, type PlaceSuggestion, type ResolvedPlace } from "../logic/places";
import { FAST_TIMEOUT_MS } from "../net/network-policy";
import { captureException } from "../telemetry/sentry";
import { fetchSignal } from "../net/fetch-signal";

/**
 * Google Places API (New) client for search-first addressing (customer-journey §1·2/§1·3). These call
 * Google DIRECTLY (not the Lynia API), reading the key from config. The whole module is key-gated: with
 * no key every call resolves to the empty/absent result so the caller falls back to the pin-on-map
 * picker.
 *
 * Shape-mapping lives in `src/logic/places.ts` (pure, unit-tested); this file is only the network edge:
 * build the request, fetch, bound it, and hand the raw body to the mapper. Errors NEVER throw out of
 * here — a keyless build, a network drop, or a refused key all degrade to []/null so the search box
 * simply shows nothing and the pin stays the primary path.
 *
 * Places API (New), not the legacy `maps.googleapis.com/maps/api/place/…` web service: the legacy
 * product is not available to Cloud projects created after 2025-03-01, and the key now lives in one
 * (see the header of `src/logic/places.ts`). The key travels in the `X-Goog-Api-Key` header, so it no
 * longer rides in a URL that proxies and crash reports can log. REST + fetch only — no native SDK.
 */

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";

// Bias results toward the pilot corridor (Harare) and restrict them to Zimbabwe, so a short query
// surfaces local places first. Not a hard filter beyond the country — a valid out-of-area place still
// resolves (the service corridor is enforced later, on broadcast). 50 km is the API's maximum radius.
const BIAS_CENTER = { latitude: -17.8292, longitude: 31.0522 };
const BIAS_RADIUS_M = 50000;
const REGION_CODES = ["zw"];

// Details has no default field list (a request without a mask is an error), and the mask sets the
// billing tier. These three are all Essentials; the place's name comes from the tapped suggestion
// instead of `displayName`, which would bill every lookup at the Pro tier (see `mapPlaceDetails`).
const DETAILS_FIELDS = "id,formattedAddress,location";

type PlacesRequest = { method: "GET" | "POST"; headers: Record<string, string>; body?: string };

/**
 * One bounded request → the parsed JSON body, or null when there is none to read.
 *
 * The body is read on a non-2xx status too. Places (New) refuses a dead or mis-restricted key with an
 * HTTP 403 whose JSON names the reason, and discarding it is exactly how such a key used to hide: the
 * old client returned null for any non-OK status, so the fault report below never saw the refusal.
 */
async function requestJson(url: string, init: PlacesRequest): Promise<unknown | null> {
  const controller = new AbortController();
  // FAST_TIMEOUT_MS (net/network-policy.ts, C-O2): a stalled Places call must fail into the pin
  // fallback fast, not hang behind a spinner on a constrained link.
  const timer = setTimeout(() => controller.abort(), FAST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: fetchSignal(controller) });
    return (await res.json()) as unknown;
  } catch {
    // Abort / offline / non-JSON — treat as "no result" so the flow falls back to the pin.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Autocomplete an address query → suggestion rows. Returns [] when the key is absent, the input is too
 * short to be worth a call, or the request fails. `sessionToken` groups an autocomplete+details pair
 * into one billable session (pass the same token to `placeDetails`).
 */
export async function autocompletePlaces(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (!placesEnabled() || q.length < 3) return [];
  const body = await requestJson(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_KEY as string },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: REGION_CODES,
      locationBias: { circle: { center: BIAS_CENTER, radius: BIAS_RADIUS_M } },
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  reportFault(body);
  return mapPredictions(body);
}

/**
 * Report each distinct Places refusal ONCE per app run. A dead key — a suspended project, an API not
 * enabled on the project, a key restricted to the wrong API — is refused on every call, and the mapper
 * turns that into the same `[]` a genuine no-match produces, so the search box looks live, returns
 * nothing forever, and nothing anywhere says why. Once per fault because it is a configuration fault,
 * not an event: it will recur on literally every keystroke. Per DISTINCT fault, not once overall, so a
 * transient first refusal (a 429 on a busy minute) cannot use up the report a real configuration
 * fault needs later in the same run. The message is `places-status-<STATUS>[:<REASON>]`, built from
 * Google's status and reason enums only — never its message text, which can quote the key.
 */
const reportedFaults = new Set<string>();
function reportFault(body: unknown): void {
  const fault = placesFault(body);
  if (!fault || reportedFaults.has(fault)) return;
  reportedFaults.add(fault);
  captureException(new Error(`places-status-${fault}`));
}

/**
 * Resolve a chosen suggestion → coordinates + landmark (the picked-point the MapPicker would otherwise
 * produce). `name` is the suggestion's main text, used as the landmark's lead (see DETAILS_FIELDS).
 * Returns null when the key is absent or the lookup fails — the caller then leaves the flow on the pin
 * path.
 */
export async function placeDetails(placeId: string, sessionToken?: string, name?: string): Promise<ResolvedPlace | null> {
  if (!placesEnabled() || placeId.length === 0) return null;
  const session = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const body = await requestJson(`${DETAILS_URL}${encodeURIComponent(placeId)}${session}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": GOOGLE_PLACES_KEY as string, "X-Goog-FieldMask": DETAILS_FIELDS },
  });
  reportFault(body);
  return mapPlaceDetails(body, placeId, name);
}

export { placesEnabled } from "../config";
export type { PlaceSuggestion, ResolvedPlace } from "../logic/places";
