/**
 * Where LyniaGo serves: **all of Zimbabwe** (owner, 2026-10-12, ledger D-99). "As long as someone is in
 * Zimbabwe they will see the restaurants and shops… Some people want to do orders for other people while in
 * Mutare but delivery is in Harare. Also Bikers can get any order despite their location."
 *
 * ONE rule, used everywhere a location is checked: parcel pickup and drop-off (create + resend), restaurant /
 * shop / pharmacy delivery addresses, a rider going online, and where a merchant may register. Browsing has no
 * location check at all. There is NO merchant-to-customer distance cap; the delivery fee stays per km.
 *
 * The border is Natural Earth's 1:50m Zimbabwe outline (public domain), simplified to ~2 km. A point within
 * {@link BORDER_MARGIN_KM} of the line also counts, so border towns and posts (Victoria Falls, Kariba,
 * Chirundu, Forbes, Beitbridge) are never refused for the simplification. This replaces the 2026-10-02 union
 * of town discs (Harare + Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden, Goromonzi).
 */
import type { LatLng } from "./contracts";

/** Zimbabwe's border as [lat, lng] pairs, clockwise from the Crooks Corner tripoint (SA / Mozambique). */
export const ZIMBABWE_BORDER: readonly (readonly [number, number])[] = [
  [-22.402, 31.286], [-22.307, 31.074], [-22.298, 30.71], [-22.33, 30.462], [-22.291, 30.192], [-22.184, 29.904],
  [-22.146, 29.662], [-22.194, 29.364], [-22.08, 29.238], [-22.066, 29.108], [-22.019, 29.043], [-21.941, 29.014],
  [-21.797, 29.025], [-21.651, 28.532], [-21.554, 28.014], [-21.262, 27.844], [-21.064, 27.668], [-20.531, 27.7],
  [-20.484, 27.625], [-20.479, 27.279], [-20.232, 27.258], [-20.101, 27.178], [-19.892, 26.678], [-19.538, 26.167],
  [-19.082, 25.951], [-18.939, 25.94], [-18.797, 25.81], [-18.649, 25.76], [-18.441, 25.558], [-18.142, 25.386],
  [-17.969, 25.242], [-17.915, 25.224], [-17.793, 25.26], [-17.845, 25.45], [-17.825, 25.641], [-17.858, 25.742],
  [-17.951, 25.864], [-17.97, 25.998], [-17.911, 26.138], [-17.929, 26.332], [-18.023, 26.577], [-18.042, 26.779],
  [-17.958, 27.02], [-17.512, 27.438], [-17.061, 27.758], [-16.896, 27.931], [-16.663, 28.399], [-16.531, 28.759],
  [-16.424, 28.834], [-16.037, 28.874], [-15.988, 28.914], [-15.776, 29.288], [-15.644, 29.731], [-15.643, 30.397],
  [-15.978, 30.408], [-15.995, 30.437], [-16.024, 31.236], [-16.153, 31.427], [-16.214, 31.689], [-16.429, 31.941],
  [-16.448, 32.244], [-16.589, 32.636], [-16.677, 32.741], [-16.712, 32.949], [-16.884, 32.877], [-17.038, 32.885],
  [-17.252, 32.971], [-18.083, 32.957], [-18.359, 32.993], [-18.729, 32.885], [-18.828, 32.723], [-18.941, 32.701],
  [-19.002, 32.715], [-19.059, 32.827], [-19.104, 32.849], [-19.389, 32.777], [-19.559, 32.831], [-19.873, 33.007],
  [-19.984, 32.993], [-20.515, 32.672], [-20.66, 32.492], [-20.949, 32.478], [-21.137, 32.355], [-21.297, 32.431],
  [-22.298, 31.43],
];

/** How far outside the drawn border a point still counts as in Zimbabwe (km). */
export const BORDER_MARGIN_KM = 10;

/**
 * The widest distance between any two points we serve, with margin (metres): Zimbabwe is ~1,000 km corner to
 * corner. Used as the "everywhere" reach for rider broadcasts and the board, so every online rider sees every
 * open order (owner, 2026-10-12).
 */
export const NATIONWIDE_REACH_M = 1_500_000;

/** Where we deliver, for "We deliver across …" lines. */
export function serviceTownsLabel(): string {
  return "Zimbabwe";
}

/**
 * The towns LyniaGo is live in, for copy that names where we are ("6 places in Harare and Bulawayo"): owner,
 * 2026-10-20, ledger D-120. Where we SERVE is still all of Zimbabwe ({@link serviceTownsLabel}); this names where
 * there are businesses and bikers today. Add a town here when it goes live.
 */
export function liveTownsLabel(): string {
  return "Harare and Bulawayo";
}

/** Ray-casting point-in-polygon on the lat/lng border. */
function insideBorder(lat: number, lng: number): boolean {
  let inside = false;
  const n = ZIMBABWE_BORDER.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = ZIMBABWE_BORDER[i]!;
    const [yj, xj] = ZIMBABWE_BORDER[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (km) from a point to the nearest border segment, on a local equirectangular projection — exact
 *  enough at a 10 km margin. */
function kmToBorder(lat: number, lng: number): number {
  const kmLat = 111.32;
  const kmLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  const n = ZIMBABWE_BORDER.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = (ZIMBABWE_BORDER[j]![1] - lng) * kmLng;
    const ay = (ZIMBABWE_BORDER[j]![0] - lat) * kmLat;
    const bx = (ZIMBABWE_BORDER[i]![1] - lng) * kmLng;
    const by = (ZIMBABWE_BORDER[i]![0] - lat) * kmLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Whether a point is inside the service area: in Zimbabwe, or within {@link BORDER_MARGIN_KM} of its border. */
export function isInServiceArea(point: LatLng): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  return insideBorder(point.lat, point.lng) || kmToBorder(point.lat, point.lng) <= BORDER_MARGIN_KM;
}
