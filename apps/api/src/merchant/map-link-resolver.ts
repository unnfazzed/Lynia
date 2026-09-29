import { UnprocessableEntityException } from "@nestjs/common";
import { isShortMapLink, type LatLng, parseMapLocation } from "@lynia/shared";

/** Redirects followed at most (OV-6, T15). A phone's share link needs one; two covers a short link to a short link. */
const MAX_HOPS = 2;
const HOP_TIMEOUT_MS = 3_000;

/** The slice of `fetch` the resolver uses, so tests can drive it without a network. */
export type MapLinkFetch = (
  url: string,
  init: { method: "GET"; redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; headers: { get(name: string): string | null }; body?: { cancel(): Promise<void> } | null }>;

function unreadable(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    reason: "unreadable_link",
    message: "We couldn't read a location from that link. Drop a pin instead.",
  });
}

/**
 * The buyer's location from what they sent the business (merchant web upgrade L2, "Drop-off, v1").
 *
 * Coordinates written into the text — a long Google Maps link, `geo:`, plain "lat, lng" — are read
 * straight away. A Google Maps short link (`maps.app.goo.gl`, `goo.gl/maps`), which is what a phone's
 * "Share location" produces and which a browser can't follow cross-origin, is followed here, and only
 * that (T15, the SSRF guard):
 *  - https only, and each hop's host re-checked against the same two-host allow-list;
 *  - at most two hops, each with a 3-second timeout;
 *  - only the `Location` header is read — the body is never downloaded;
 *  - the coordinates come out of the Google Maps URL the redirect lands on.
 * Anything else is a 422 `unreadable_link`, and the business drops a pin instead.
 */
export async function resolveMapLink(text: string, fetchImpl: MapLinkFetch = fetch as unknown as MapLinkFetch): Promise<LatLng> {
  const direct = parseMapLocation(text);
  if (direct) return direct;

  let url = /https:\/\/\S+/i.exec(text.trim())?.[0];
  if (!url || !isShortMapLink(url)) throw unreadable();

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res: Awaited<ReturnType<MapLinkFetch>>;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: { "user-agent": "LyniaGo/1.0 (+https://lyniago.com)" },
      });
    } catch {
      throw unreadable();
    }
    // Never read the body: release it unread.
    void res.body?.cancel().catch(() => {});
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) throw unreadable();

    let next: string;
    try {
      next = new URL(location, url).toString();
    } catch {
      throw unreadable();
    }
    const point = parseMapLocation(next);
    if (point) return point;
    if (!isShortMapLink(next)) throw unreadable();
    url = next;
  }
  throw unreadable();
}
