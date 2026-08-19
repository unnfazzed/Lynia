import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { withTimeout } from "../util";

/**
 * The customer home's DELIVER-TO location (home 8c header address row).
 *
 * The 8c handoff is explicit about what this value is: *"the user's current detected location
 * (reverse-geocoded street address) … This is a live GPS value, not a saved profile address; fall
 * back to last known address with a 'set location' prompt when permission is denied."* The pre-8c
 * header hardcoded the string "Harare", which is why this module exists.
 *
 * Three sources, in precedence order:
 *   1. MANUAL — a place the customer chose in the location sheet. It wins for as long as it stands,
 *      because a customer who has said "deliver here" must not be silently overruled by a GPS fix
 *      from wherever they happen to be standing. "Use my current location" in the sheet clears it.
 *   2. GPS — the live fix, reverse-geocoded. Refreshed each time the home screen mounts.
 *   3. LAST KNOWN — whatever (1) or (2) last resolved to, persisted, so a cold start with no
 *      permission (or no fix yet) paints an address instead of a blank row.
 * With none of the three the row becomes the prompt itself ("Set your location"), which opens the
 * same sheet — the row is never dead and never lies.
 *
 * Persistence uses SecureStore, the same primitive (and the same PRIVACY rule) as `saved-places.ts`:
 * only PLACE data is stored — a label and a lat/lng — never a contact or any other PII. Every store
 * call is best-effort; a native failure degrades to "no last known", never a throw.
 */

/** SecureStore slot. Exported so sign-out (`auth/session` `clearDeviceState`) clears it too — it
 *  holds an address, and an address must not survive into the next account on a shared handset. */
export const HOME_LOCATION_KEY = "lynia.homeLocation.v1";

/** GPS fix bound — the same 9s ceiling ComposeMap / MapPicker / the pickup auto-locate hook use. */
const FIX_TIMEOUT_MS = 9_000;

/** How stale a cached platform fix may be and still be worth painting while the live one lands. */
const LAST_KNOWN_MAX_AGE_MS = 120_000;

/** One header line at 12.5px on a 320px phone, beside a chevron — longer than this cannot help. */
const ADDRESS_MAX = 48;

/** The row's copy when there is nothing to show. It is a PROMPT, not an error: tapping it opens the
 *  location sheet, which is exactly what the customer needs to do next. */
export const SET_LOCATION_PROMPT = "Set your location";

export interface HomePlace {
  label: string;
  lat: number;
  lng: number;
  /**
   * The SUBURB/district this point falls in ("Belgravia"), when the geocoder names one. A coarser
   * answer than `label`, and a DIFFERENT question: the restaurant list's results summary asks "how
   * many places deliver to where I am", and the mock answers it with the area rather than the street
   * line ("5 places deliver to Belgravia" — RC.list). A street address in that sentence would read
   * as one delivery destination instead of the corridor being described.
   *
   * Optional because plenty of honest fixes resolve to a street with no named district — the summary
   * drops the area rather than inventing one.
   */
  area?: string;
}

export type HomeLocationSource = "gps" | "manual" | "last-known" | "none";

export interface HomeLocation {
  /** What the address row renders — a street address, or `SET_LOCATION_PROMPT`. */
  label: string;
  /** The point behind the label, for distance-sorting and fee estimates. Null when unknown. */
  point: { lat: number; lng: number } | null;
  /** The suburb behind the label, for prose that names the area. Null when the geocoder named none. */
  area: string | null;
  source: HomeLocationSource;
  /** A fix is in flight. The row keeps painting the previous label rather than flashing empty. */
  locating: boolean;
  /** Location permission is refused and cannot be asked again in-app. */
  denied: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without a device)
// ---------------------------------------------------------------------------

/** A house number, with or without a letter suffix ("12", "12A") — the part that leads a street line. */
const HOUSE_NUMBER = /^\d+[A-Za-z]?$/;

/**
 * A reverse-geocode result → the ONE line the header draws.
 *
 * The mock draws "12 Samora Machel Ave", i.e. a street address, so a street line is preferred over
 * everything else and only degrades when the geocoder has nothing finer: district → city →
 * subregion → region. Deliberately NOT `geocode.ts`'s `landmarkFromAddress`, which joins three parts
 * with commas to name a PIN for a rider ("Kwik Mart, Samora Machel Ave, Avenues"); this is a
 * one-line deliver-to label for the customer's own screen, and the two want different strings.
 */
export function homeAddressLabel(r: Partial<Location.LocationGeocodedAddress>): string {
  const street = (r.street ?? "").trim();
  const number = (r.streetNumber ?? "").trim();
  const name = (r.name ?? "").trim();

  let line = "";
  if (street && number) line = `${number} ${street}`;
  // Android's Geocoder often puts the house number (or the whole address line) in `name`.
  else if (street && HOUSE_NUMBER.test(name)) line = `${name} ${street}`;
  else if (name && name !== street) line = name;
  else line = street;

  const out = (line || r.district || r.city || r.subregion || r.region || "").trim();
  return out.slice(0, ADDRESS_MAX);
}

/**
 * A reverse-geocode result -> the SUBURB the point sits in, or "" when nothing names one.
 *
 * Coarsest-useful-first is wrong here: `city` for a Harare fix is "Harare", which is exactly the
 * imprecise answer the list header used to hardcode. So prefer the finest AREA the geocoder has
 * (district, then subregion) and only fall back to city/region when it knows nothing finer — an
 * area label that says "Harare" is honest when that is genuinely all we resolved, but it must never
 * be preferred over "Belgravia".
 */
export function homeAreaLabel(r: Partial<Location.LocationGeocodedAddress>): string {
  const area = (r.district ?? "").trim() || (r.subregion ?? "").trim() || (r.city ?? "").trim() || (r.region ?? "").trim();
  return area.slice(0, ADDRESS_MAX);
}

/** A finite coordinate in the real lat/lng domain — and never the geocoder's 0,0 "found nothing". */
export function isUsablePoint(p: { lat: number; lng: number } | null | undefined): p is { lat: number; lng: number } {
  if (!p) return false;
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** Total, defensive parse of the persisted slot — any missing/foreign field ⇒ null (dropped). */
export function parseStoredPlace(raw: string | null): { place: HomePlace; manual: boolean } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<HomePlace> & { manual?: unknown };
    if (typeof v.label !== "string" || !v.label.trim()) return null;
    if (!isUsablePoint({ lat: v.lat as number, lng: v.lng as number })) return null;
    // Both fields VALIDATE on the trimmed value, so both must STORE the trimmed value — otherwise a
    // slot holding " Belgravia " passes the check and then reaches the header with its padding.
    const area = typeof v.area === "string" && v.area.trim() ? v.area.trim().slice(0, ADDRESS_MAX) : undefined;
    return {
      // `area` is ADDITIVE — a slot written before this field existed parses fine and simply has no
      // suburb, so the summary line degrades to its area-less form instead of the parse dropping.
      place: { label: v.label.trim().slice(0, ADDRESS_MAX), lat: v.lat as number, lng: v.lng as number, ...(area ? { area } : {}) },
      manual: v.manual === true,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The device edge
// ---------------------------------------------------------------------------

export async function loadStoredLocation(): Promise<{ place: HomePlace; manual: boolean } | null> {
  try {
    return parseStoredPlace(await SecureStore.getItemAsync(HOME_LOCATION_KEY));
  } catch {
    return null;
  }
}

export async function saveStoredLocation(place: HomePlace, manual: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(HOME_LOCATION_KEY, JSON.stringify({ ...place, manual }));
  } catch {
    /* best-effort — a failed write just means the next cold start has no last-known address */
  }
}


/**
 * Granted, or granted after asking — and never asking when the OS would refuse to show the dialog.
 * Mirrors `use-pickup-autolocate.ts`: a hard-denied customer gets no prompt and no delay.
 */
async function ensurePermission(): Promise<"granted" | "denied"> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.granted) return "granted";
    if (!existing.canAskAgain) return "denied";
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

async function cachedPoint(): Promise<{ lat: number; lng: number } | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}

async function livePoint(): Promise<{ lat: number; lng: number } | null> {
  try {
    const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS);
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Best-effort labels for a point: the street line the header draws, and the suburb prose names.
 *
 * Both come out of the ONE reverse-geocode call — they are two readings of the same result, and
 * resolving them separately would double a network-ish call on every fix for no new information.
 * An empty `label` (never a throw) is the "geocoder couldn't help" signal callers already branch on.
 */
export async function addressFor(point: { lat: number; lng: number }): Promise<{ label: string; area?: string }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng });
    const first = results[0];
    if (!first) return { label: "" };
    const area = homeAreaLabel(first);
    return { label: homeAddressLabel(first), ...(area ? { area } : {}) };
  } catch {
    return { label: "" };
  }
}

/** Detect → reverse-geocode → a place, or null on any failure. Exported for the location sheet's
 *  "Use my current location", which needs the same resolution without mounting the hook again. */
export async function detectHomePlace(): Promise<HomePlace | null> {
  if ((await ensurePermission()) !== "granted") return null;
  const point = (await livePoint()) ?? (await cachedPoint());
  if (!isUsablePoint(point)) return null;
  const resolved = await addressFor(point);
  if (!resolved.label) return null;
  return { ...resolved, ...point };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface HomeLocationOptions {
  /**
   * DETECT-ONLY. The stored slot is shared with the customer home, which persists a MANUAL pick
   * there; a face that only ever answers "where am I" must neither believe that pick nor overwrite
   * it. With this on the hook still paints the stored label instantly (it is a fine last-known) but
   * always goes on to detect, and never writes back — so the customer's chosen deliver-to survives
   * a rider re-detecting, and the rider never sees a customer-picked address labelled as their
   * location. Off (the default) is the customer's behaviour, unchanged.
   */
  detectOnly?: boolean;
}

export interface HomeLocationApi extends HomeLocation {
  /** Re-detect from GPS, clearing any manual override. Resolves to the new place, or null. */
  useCurrentLocation: () => Promise<HomePlace | null>;
  /** Adopt a place the customer picked in the sheet — it becomes the manual override. */
  setManualPlace: (place: HomePlace) => void;
}

/**
 * The home's deliver-to location.
 *
 * Paints in three beats so the row is never empty and never stale for long: the persisted last-known
 * address lands synchronously-ish from SecureStore, the platform's cached fix refines it, and the
 * live fix (reverse-geocoded) replaces both. Failure at any beat leaves the previous beat's answer
 * standing — this must never turn into an error state on a working home screen.
 *
 * Runs its detection ONCE per mount (ref-guarded, not dep-driven), like the pickup auto-locate hook:
 * nothing about a re-render may re-drive a location the customer has since overridden.
 */
export function useHomeLocation({ detectOnly = false }: HomeLocationOptions = {}): HomeLocationApi {
  const [place, setPlace] = useState<HomePlace | null>(null);
  const [source, setSource] = useState<HomeLocationSource>("none");
  const [locating, setLocating] = useState(true);
  const [denied, setDenied] = useState(false);
  // Set the moment the customer picks a place in the sheet, so a GPS fix that resolves a beat later
  // cannot overwrite their explicit choice.
  const manualRef = useRef(false);
  // Bumped per manual pick, so a slow suburb lookup for pick N can never land on top of pick N+1.
  const pickSeq = useRef(0);
  // Read through a ref so the one-shot detection effect below can stay dependency-free.
  const detectOnlyRef = useRef(detectOnly);
  detectOnlyRef.current = detectOnly;
  const alive = useRef(true);
  const started = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const stored = await loadStoredLocation();
      if (!alive.current) return;
      if (stored) {
        // A stored MANUAL pick belongs to the customer face. Detect-only paints it as a last-known
        // label (better than an empty row for the beat before the fix lands) but never adopts it as
        // this face's answer, and never stops detecting because of it.
        manualRef.current = stored.manual && !detectOnlyRef.current;
        setPlace(stored.place);
        setSource(manualRef.current ? "manual" : "last-known");
      }
      // A manual choice is the customer's answer; do not go looking for a different one.
      if (manualRef.current) {
        setLocating(false);
        return;
      }

      const permission = await ensurePermission();
      if (!alive.current) return;
      if (permission !== "granted") {
        setDenied(true);
        setLocating(false);
        return;
      }

      const cached = await cachedPoint();
      if (!alive.current || manualRef.current) return;
      if (isUsablePoint(cached)) {
        const resolved = await addressFor(cached);
        if (!alive.current || manualRef.current) return;
        if (resolved.label) {
          setPlace({ ...resolved, ...cached });
          setSource("gps");
        }
      }

      const live = await livePoint();
      if (!alive.current || manualRef.current) return;
      if (!isUsablePoint(live)) {
        setLocating(false);
        return;
      }
      const resolved = await addressFor(live);
      if (!alive.current || manualRef.current) {
        setLocating(false);
        return;
      }
      if (resolved.label) {
        const next = { ...resolved, ...live };
        setPlace(next);
        setSource("gps");
        // Detect-only never writes: the slot holds the customer's deliver-to, and persisting a
        // rider's GPS fix over it would silently discard a manual pick they made on the other face.
        if (!detectOnlyRef.current) void saveStoredLocation(next, false);
      }
      setLocating(false);
    })();
  }, []);

  const useCurrentLocation = useCallback(async (): Promise<HomePlace | null> => {
    manualRef.current = false;
    setLocating(true);
    const detected = await detectHomePlace();
    if (!alive.current) return detected;
    setLocating(false);
    if (!detected) {
      setDenied(true);
      return null;
    }
    setDenied(false);
    setPlace(detected);
    setSource("gps");
    if (!detectOnlyRef.current) void saveStoredLocation(detected, false);
    return detected;
  }, []);

  const setManualPlace = useCallback((next: HomePlace): void => {
    manualRef.current = true;
    const seq = ++pickSeq.current;
    setPlace(next);
    setSource("manual");
    setLocating(false);
    void saveStoredLocation(next, true);

    // The sheet hands back a label + point and nothing else: a saved Home/Work slot and an address
    // search both resolve a `ResolvedPlace` (lat/lng/landmark/placeId), which has no suburb to give.
    // Without this, every pick blanked `area` and the food list's deliver-to silently fell back to a
    // bare street plus "N places deliver here".
    //
    // Resolving it HERE rather than plumbing `area` through saved-places + the Places API keeps
    // geocoding in the one module that owns it (LocationSheet is presentational by contract — the
    // `mobile-ui-no-api` boundary) and needs no change to the persisted ResolvedPlace shape.
    //
    // The customer's LABEL is their choice and is never touched; only the AREA is filled in, because
    // the suburb is a fact about the coordinates rather than a thing they chose.
    if (next.area) return;
    void (async () => {
      const resolved = await addressFor({ lat: next.lat, lng: next.lng });
      // Drop the answer if the screen is gone, the geocoder had no area, a LATER pick superseded
      // this one, or a re-detect cleared the manual override while this was in flight.
      if (!alive.current || !resolved.area) return;
      if (pickSeq.current !== seq || !manualRef.current) return;
      const patched: HomePlace = { ...next, area: resolved.area };
      setPlace(patched);
      void saveStoredLocation(patched, true);
    })();
  }, []);

  return {
    label: place?.label ?? SET_LOCATION_PROMPT,
    point: place ? { lat: place.lat, lng: place.lng } : null,
    area: place?.area ?? null,
    source: place ? source : "none",
    locating,
    denied,
    useCurrentLocation,
    setManualPlace,
  };
}
