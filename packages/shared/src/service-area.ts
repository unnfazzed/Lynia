/**
 * Where LyniaGo serves: Harare metro plus the satellite towns the owner named on 2026-10-02 — "Chitungwiza,
 * Norton, Ruwa people should always be visible", plus Epworth, Domboshava, Mt Hampden and Goromonzi.
 *
 * The area is a union of discs, one per town, so a town is added or widened by editing one row. A point is
 * in the area when it is inside ANY disc. Harare's disc keeps the old 25 km pilot corridor, so nothing that
 * was served before stops being served. Centres are town centres; radii cover the built-up area with margin.
 *
 * ONE rule, used everywhere a location is checked: parcel pickup and drop-off (create + resend), restaurant /
 * shop / pharmacy delivery addresses, a rider going online, and where a merchant may register. There is NO
 * merchant-to-customer distance cap: anyone in the area may order from any merchant in the area (owner,
 * 2026-10-02); the delivery fee stays per km.
 */
import type { LatLng } from "./contracts";
import { haversineKm } from "./pricing";

export type ServiceZone = { readonly name: string; readonly lat: number; readonly lng: number; readonly radiusKm: number };

export const SERVICE_ZONES: readonly ServiceZone[] = [
  { name: "Harare", lat: -17.8292, lng: 31.0522, radiusKm: 25 },
  { name: "Chitungwiza", lat: -18.0127, lng: 31.0756, radiusKm: 10 },
  { name: "Norton", lat: -17.8833, lng: 30.7, radiusKm: 10 },
  { name: "Ruwa", lat: -17.8897, lng: 31.2447, radiusKm: 10 },
  { name: "Epworth", lat: -17.89, lng: 31.15, radiusKm: 6 },
  { name: "Domboshava", lat: -17.62, lng: 31.17, radiusKm: 10 },
  { name: "Mt Hampden", lat: -17.72, lng: 30.95, radiusKm: 8 },
  { name: "Goromonzi", lat: -17.87, lng: 31.37, radiusKm: 10 },
] as const;

/** The towns we serve, in display order — for "We deliver across …" lines. */
export const SERVICE_TOWNS: readonly string[] = SERVICE_ZONES.map((z) => z.name);

/** "Harare, Chitungwiza, Norton, …, Mt Hampden and Goromonzi". */
export function serviceTownsLabel(): string {
  const t = [...SERVICE_TOWNS];
  return t.length > 1 ? `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}` : (t[0] ?? "");
}

/** Whether a point is inside the service area (inside any town's disc). */
export function isInServiceArea(point: LatLng): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  return SERVICE_ZONES.some((z) => haversineKm(point, { lat: z.lat, lng: z.lng }) <= z.radiusKm);
}
