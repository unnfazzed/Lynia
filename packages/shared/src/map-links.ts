import type { LatLng } from "./contracts";

// The shared package compiles with no DOM or Node lib, but the two runtimes that call this file (the
// merchant web's browsers and the API on Node) both provide a WHATWG `URL`. Declare the slice used here.
declare const URL: {
  new (input: string): {
    protocol: string;
    hostname: string;
    pathname: string;
    search: string;
    searchParams: { get(name: string): string | null };
  };
};
type URL = InstanceType<typeof URL>;

/**
 * Reading a location out of what a buyer sends a business (merchant web upgrade L2, "Drop-off, v1"): a
 * Google Maps link, a `geo:` URI, or plain "lat, lng". Shared so the merchant web reads a pasted link
 * instantly and the API reads the long link a short one resolves to with the same rules.
 *
 * Only coordinates written into the text are used. A place link without coordinates (a name and a place
 * id) reads as nothing, and the business drops a pin instead.
 */

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function point(lat: string, lng: string): LatLng | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!inRange(la, ln)) return null;
  return { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(ln * 1e6) / 1e6 };
}

const NUM = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
/** "lat,lng" with optional spaces or a "+" (Google writes "-17.8,+31.0" in search links). */
const PAIR = new RegExp(String.raw`^\s*(${NUM})\s*,\s*\+?(${NUM})\s*$`);

function pair(text: string | null | undefined): LatLng | null {
  if (!text) return null;
  const m = PAIR.exec(text);
  return m ? point(m[1]!, m[2]!) : null;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

function isGoogleMapsHost(host: string): boolean {
  return host === "maps.google.com" || host === "google.com" || host === "www.google.com" || /^(www\.)?google\.[a-z.]{2,6}$/.test(host);
}

/** Coordinates from a Google Maps URL, most specific first. */
function fromGoogleMapsUrl(url: URL): LatLng | null {
  const path = decode(url.pathname);
  // A place's own coordinates (`!3d<lat>!4d<lng>`) beat the viewport centre in `@<lat>,<lng>`.
  const place = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(path + decode(url.search));
  if (place) {
    const p = point(place[1]!, place[2]!);
    if (p) return p;
  }
  for (const key of ["q", "query", "ll", "daddr", "destination", "center"]) {
    const p = pair(url.searchParams.get(key));
    if (p) return p;
  }
  // `/maps/search/-17.83,+31.05` and `/maps/place/-17.83,31.05`.
  const segment = /\/maps\/(?:search|place)\/([^/@]+)/.exec(path);
  if (segment) {
    const p = pair(segment[1]);
    if (p) return p;
  }
  const at = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(path);
  if (at) return point(at[1]!, at[2]!);
  return null;
}

/**
 * The location in a pasted text, or null. Reads:
 *  - plain "lat, lng" ("-17.8292, 31.0522");
 *  - `geo:` URIs ("geo:-17.8292,31.0522?z=17");
 *  - Google Maps links (`@lat,lng`, `!3d…!4d…`, `?q=`, `?query=`, `?ll=`, `/maps/search/lat,lng`), including
 *    the `maps.google.com/maps?q=-17.83%2C31.05` form WhatsApp shares a location as.
 * A short link (`maps.app.goo.gl`) holds no coordinates itself; see `isShortMapLink`.
 */
export function parseMapLocation(text: string): LatLng | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const direct = pair(trimmed);
  if (direct) return direct;

  const geo = /^geo:(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i.exec(trimmed);
  if (geo) return point(geo[1]!, geo[2]!);

  // A link inside a longer message ("I'm here: https://…").
  const urlText = /https?:\/\/\S+/i.exec(trimmed)?.[0];
  if (!urlText) return null;
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (isGoogleMapsHost(host)) return fromGoogleMapsUrl(url);
  // A Firebase-style short-link landing (`maps.app.goo.gl/?link=<long url>`).
  const link = url.searchParams.get("link");
  if (link && link !== urlText) return parseMapLocation(link);
  return null;
}

/**
 * A Google Maps short link — the form a phone's "Share location" produces — which only the API can
 * resolve (the browser can't read a cross-origin redirect). The API follows it for exactly these hosts:
 * `maps.app.goo.gl`, and `goo.gl` under `/maps` (plan 2026-09-29 OV-6, T15).
 */
export function isShortMapLink(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && url.pathname.startsWith("/maps"));
}
