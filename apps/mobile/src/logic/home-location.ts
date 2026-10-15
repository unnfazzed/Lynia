import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { classifyLocation, type LocState, useOnAppActive } from "../permissions/location";
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
 *   2. GPS — the live fix, reverse-geocoded. Shared by every screen for the session and refreshed by
 *      the first mount after it is two minutes old (P06 — see the session store below).
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

/** The longest a DEVICE read (the keychain slot, the permission state, the platform's cached fix) may
 *  take before it counts as "nothing there". These normally answer in milliseconds; the bound only
 *  stops a hung native call from holding the shared detection — and every screen that joins it —
 *  forever (P06). Same 5 s as the boot reads (src/boot/prewarm.ts BOOT_READ_TIMEOUT_MS). */
const DEVICE_READ_TIMEOUT_MS = 5_000;

/** How stale a cached platform fix may be and still be worth painting while the live one lands. */
const LAST_KNOWN_MAX_AGE_MS = 120_000;

/** The detect-only face's last resort when the live fix fails indoors: an older platform fix still names
 *  the rider's area for the header (it only labels — the board's own fix drives jobs). Never used on the
 *  customer face, whose point becomes a delivery drop. */
const STALE_FIX_MAX_AGE_MS = 30 * 60_000;

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
    return parseStoredPlace(await withTimeout(SecureStore.getItemAsync(HOME_LOCATION_KEY), DEVICE_READ_TIMEOUT_MS));
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
 * Whether the app may read the position right now — a READ, never a request. Since First Run v2 (ledger
 * D-82, BRIEF 1–2) the OS dialog only ever opens from the PC1 explainer's own button (`useLocationAsk`,
 * logic/location-ask.ts); mounting Home (or the rider board) never asks, so nothing pops over the splash or over a screen
 * that didn't explain why. Approximate counts: it still fixes a position (PC3 asks to upgrade it).
 */
async function readGrant(): Promise<LocState> {
  try {
    return classifyLocation(await withTimeout(Location.getForegroundPermissionsAsync(), DEVICE_READ_TIMEOUT_MS));
  } catch {
    return "denied";
  }
}

const usable = (loc: LocState): boolean => loc === "granted" || loc === "coarse";

async function cachedPoint(maxAge: number = LAST_KNOWN_MAX_AGE_MS): Promise<{ lat: number; lng: number } | null> {
  try {
    const last = await withTimeout(Location.getLastKnownPositionAsync({ maxAge }), DEVICE_READ_TIMEOUT_MS);
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

/**
 * {@link addressFor}, bounded (P06): the platform geocoder is a network call, and on a stalled link it
 * waits out its own timeout (or, on the web shim, never settles). A lookup that hasn't answered within
 * the fix bound resolves to the empty label callers already treat as "the geocoder couldn't help".
 */
function boundedAddressFor(point: { lat: number; lng: number }): Promise<{ label: string; area?: string }> {
  return withTimeout(addressFor(point), FIX_TIMEOUT_MS).catch(() => ({ label: "" }));
}

/** Detect → reverse-geocode → a place, or null on any failure (no permission included — it never asks).
 *  Exported for the location sheet's "Use my current location", which needs the same resolution
 *  without mounting the hook again. */
export async function detectHomePlace(): Promise<HomePlace | null> {
  if (!usable(await readGrant())) return null;
  const point = (await livePoint()) ?? (await cachedPoint());
  if (!isUsablePoint(point)) return null;
  const resolved = await boundedAddressFor(point);
  if (!resolved.label) return null;
  return { ...resolved, ...point };
}

// ---------------------------------------------------------------------------
// The shared session store (P06)
//
// Nine screens mount `useHomeLocation` (Home, Account, the food list / menu / Review & place, the shop
// and pharmacy list / store / search). Each used to run the whole chain on mount — a keychain read, a
// permission read, a GPS fix and two reverse geocodes — so a four-screen food journey cost four fixes
// and up to eight geocodes, and Review & place's drop flipped under the customer's thumb as its own
// copy of the chain landed (refetching schedule slots on each flip). Now ONE store per face holds the
// answer for the session: a later mount paints it on its first frame, a mount while a detection is in
// flight joins it, and a mount only re-detects once the last GPS answer is older than
// {@link DETECT_TTL_MS}. A manual pick and "Use my current location" write the store, so every mounted
// screen agrees on the deliver-to.
//
// Two faces, two stores: the customer's (adopts and persists a manual pick) and the detect-only one
// (the rider board — paints the stored slot as a last-known label but never adopts a manual pick and
// never writes; see `HomeLocationOptions.detectOnly`).
// ---------------------------------------------------------------------------

/** How long a GPS answer stands before a newly mounted screen re-detects — the same two minutes a
 *  cached platform fix is trusted for. */
const DETECT_TTL_MS = LAST_KNOWN_MAX_AGE_MS;

type Face = "customer" | "detect";

interface Snapshot {
  place: HomePlace | null;
  source: HomeLocationSource;
  locating: boolean;
  denied: boolean;
}

interface Store {
  snap: Snapshot;
  /** A manual pick stands (customer face only) — no detection may overwrite it. */
  manual: boolean;
  /** Bumped by every manual pick, re-detect and reset: a detection chain started under an older
   *  generation never publishes. */
  gen: number;
  /** Bumped per manual pick, so a slow suburb lookup for pick N can never land on top of pick N+1. */
  pickSeq: number;
  /** When the last detection produced a GPS answer; null until one has. */
  detectedAt: number | null;
  /** The detection chain in flight, which a mounting screen joins instead of starting its own. */
  run: Promise<void> | null;
  /** A refresh asked for while `run` was in flight (a grant landed mid-chain): run once more after it. */
  rerun: boolean;
  listeners: Set<() => void>;
}

const INITIAL_SNAPSHOT: Snapshot = { place: null, source: "none", locating: true, denied: false };

function newStore(): Store {
  return { snap: INITIAL_SNAPSHOT, manual: false, gen: 0, pickSeq: 0, detectedAt: null, run: null, rerun: false, listeners: new Set() };
}

const stores: Record<Face, Store> = { customer: newStore(), detect: newStore() };

function publish(store: Store, patch: Partial<Snapshot>): void {
  store.snap = { ...store.snap, ...patch };
  for (const listener of store.listeners) listener();
}

/**
 * Forget the session's location — sign-out (`clearDeviceState`) calls this next to deleting the stored
 * slot, so the next account on a shared handset never paints the previous one's address. Also the
 * test seam.
 */
export function resetHomeLocationCache(): void {
  for (const store of Object.values(stores)) {
    store.gen += 1;
    store.pickSeq += 1;
    store.manual = false;
    store.detectedAt = null;
    store.run = null;
    store.rerun = false;
    publish(store, INITIAL_SNAPSHOT);
  }
}

/** Start a detection for `face` unless one is running, a manual pick stands, or the last answer is fresh.
 *  `queue` (a refresh after a grant) runs once more after an in-flight chain, which may have read the
 *  permission before the grant landed. */
function ensureDetection(face: Face, queue = false): void {
  const store = stores[face];
  if (store.manual) return;
  if (store.run) {
    if (queue) store.rerun = true;
    return;
  }
  if (store.detectedAt !== null && Date.now() - store.detectedAt < DETECT_TTL_MS) return;
  // Every step of the chain is time-bounded, so `run` always settles; `finally` (not `then`) clears it
  // even if a step throws, so a broken chain can never leave later mounts joined to nothing.
  const run = detect(face, store).catch(() => {
    if (store.run === run) publish(store, { locating: false });
  });
  store.run = run;
  void run.finally(() => {
    if (store.run !== run) return;
    store.run = null;
    if (store.rerun) {
      store.rerun = false;
      ensureDetection(face);
    }
  });
}

/**
 * Re-detect on every face that has no fresh GPS answer — call it the moment location is granted (the rider
 * permission flow, the board's re-read on focus/resume). Without it a screen mounted BEFORE the grant (the
 * rider board under P1, Home under the phone's settings) kept its "no permission" answer until it was
 * remounted, so a rider who had just allowed location still read "Set your location".
 */
export function refreshHomeLocation(): void {
  for (const face of Object.keys(stores) as Face[]) ensureDetection(face, true);
}

/**
 * The detection chain. Paints in up to three beats so the row is never empty and never stale for
 * long: the persisted last-known address (first run of the session only), the platform's cached fix,
 * and the live fix — each reverse-geocoded. The cached fix's geocode runs ALONGSIDE the live fix
 * rather than ahead of it, and both geocodes are bounded, so a stalled geocoder can neither delay the
 * live fix nor hold the row (P06/P21). Failure at any beat leaves the previous beat's answer standing.
 */
async function detect(face: Face, store: Store): Promise<void> {
  const gen = store.gen;
  const current = (): boolean => store.gen === gen && !store.manual;
  publish(store, { locating: true });

  if (!store.snap.place) {
    const stored = await loadStoredLocation();
    if (store.gen !== gen) return;
    if (stored) {
      // A stored MANUAL pick belongs to the customer face. Detect-only paints it as a last-known
      // label (better than an empty row for the beat before the fix lands) but never adopts it as
      // this face's answer, and never stops detecting because of it.
      store.manual = stored.manual && face === "customer";
      publish(store, { place: stored.place, source: store.manual ? "manual" : "last-known" });
    }
    // A manual choice is the customer's answer; do not go looking for a different one.
    if (store.manual) {
      publish(store, { locating: false });
      return;
    }
  }

  // A read, never an ask (D-82): without a grant the row stays on its prompt and H6 offers PC1.
  const permission = await readGrant();
  if (!current()) return;
  if (!usable(permission)) {
    publish(store, { denied: permission === "blocked", locating: false });
    return;
  }
  // Usable now — clear a "location is off" left by an earlier detection in this session (the customer
  // turned it on in Settings, or granted it from PC1).
  if (store.snap.denied) publish(store, { denied: false });

  // The live fix starts NOW, not after the cached fix's geocode (which used to be awaited first).
  const liveFix = livePoint();
  let liveLanded = false;
  const cached = await cachedPoint();
  if (!current()) return;
  if (isUsablePoint(cached)) {
    void boundedAddressFor(cached).then((resolved) => {
      // Dropped once the live answer has landed — a late cached label must never replace it.
      if (!current() || liveLanded || !resolved.label) return;
      publish(store, { place: { ...resolved, ...cached }, source: "gps" });
    });
  }

  let live = await liveFix;
  if (!current()) return;
  // Indoors / a cold GPS: the rider's header settles for an older fix rather than staying blank. No
  // `detectedAt`, so the next resume or refresh still tries for a live one.
  const stale = !isUsablePoint(live) && face === "detect" && !isUsablePoint(cached);
  if (stale) live = await cachedPoint(STALE_FIX_MAX_AGE_MS);
  if (!current()) return;
  if (!isUsablePoint(live)) {
    publish(store, { locating: false });
    return;
  }
  const resolved = await boundedAddressFor(live);
  if (!current()) return;
  if (resolved.label) {
    liveLanded = true;
    const next = { ...resolved, ...live };
    if (!stale) store.detectedAt = Date.now();
    publish(store, { place: next, source: "gps", locating: false });
    // Detect-only never writes: the slot holds the customer's deliver-to, and persisting a
    // rider's GPS fix over it would silently discard a manual pick they made on the other face.
    if (face === "customer") void saveStoredLocation(next, false);
    return;
  }
  publish(store, { locating: false });
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
 * The home's deliver-to location, from the session store above: the first screen to mount detects,
 * every other screen paints the same answer on its first frame (P06). A re-render never re-drives a
 * detection; only a mount past the TTL does, and never over a standing manual pick.
 */
export function useHomeLocation({ detectOnly = false }: HomeLocationOptions = {}): HomeLocationApi {
  const face: Face = detectOnly ? "detect" : "customer";
  const store = stores[face];
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  const getSnapshot = useCallback(() => store.snap, [store]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureDetection(face);
  }, [face]);
  // Back from the phone's settings (location granted or switched on there), or after a fix that failed
  // indoors: try again. A fresh answer or a manual pick makes this a no-op.
  useOnAppActive(() => ensureDetection(face));

  const useCurrentLocation = useCallback(async (): Promise<HomePlace | null> => {
    // Clears the manual override and supersedes any detection (or suburb lookup) in flight.
    store.manual = false;
    const gen = ++store.gen;
    publish(store, { locating: true });
    const detected = await detectHomePlace();
    if (store.gen !== gen) return detected;
    if (!detected) {
      const blocked = (await readGrant()) === "blocked";
      if (store.gen === gen) publish(store, { locating: false, denied: blocked });
      return null;
    }
    store.detectedAt = Date.now();
    publish(store, { place: detected, source: "gps", locating: false, denied: false });
    if (face === "customer") void saveStoredLocation(detected, false);
    return detected;
  }, [store, face]);

  const setManualPlace = useCallback(
    (next: HomePlace): void => {
      store.manual = true;
      store.gen += 1;
      const seq = ++store.pickSeq;
      publish(store, { place: next, source: "manual", locating: false });
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
        // Drop the answer if the geocoder had no area, a LATER pick superseded this one, or a
        // re-detect / sign-out cleared the manual override while this was in flight.
        if (!resolved.area) return;
        if (store.pickSeq !== seq || !store.manual) return;
        const patched: HomePlace = { ...next, area: resolved.area };
        publish(store, { place: patched });
        void saveStoredLocation(patched, true);
      })();
    },
    [store],
  );

  const { place } = snap;
  const lat = place?.lat;
  const lng = place?.lng;
  // One object per coordinate, not per render (P06): consumers memoise on it (distance sorts, fees).
  const point = useMemo(() => (lat !== undefined && lng !== undefined ? { lat, lng } : null), [lat, lng]);

  return {
    label: place?.label ?? SET_LOCATION_PROMPT,
    point,
    area: place?.area ?? null,
    source: place ? snap.source : "none",
    locating: snap.locating,
    denied: snap.denied,
    useCurrentLocation,
    setManualPlace,
  };
}
