/**
 * Where one order, one prescription check, one booking and one hand-over link live. The merchant web is
 * a static export served from Cloudflare (docs/MERCHANT-WEB.md), so a page can't have an id in its path
 * (`/queue/<id>`): there is no server to render a page per id. The id rides in the query string instead,
 * and every link into these pages is built here so none can drift.
 */
export const orderHref = (id: string): string => `/queue/order?id=${encodeURIComponent(id)}`;
export const prescriptionHref = (id: string): string => `/queue/rx?id=${encodeURIComponent(id)}`;
export const bookingHref = (id: string): string => `/deliveries/booking?id=${encodeURIComponent(id)}`;
export const handoverHref = (token: string): string => `/h?t=${encodeURIComponent(token)}`;

/**
 * The old path-style links (`/queue/<id>`, `/queue/<id>/rx`, `/deliveries/<id>`, `/h/<token>`): a
 * bookmark, a tab left open across the move, or a hand-over link texted before it. The 404 page sends
 * them to the same page under its new address. Null for anything else.
 */
function dec(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function legacyHref(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "");
  let m = /^\/queue\/([^/]+)\/rx$/.exec(path);
  if (m) return prescriptionHref(dec(m[1]!));
  m = /^\/queue\/([^/]+)$/.exec(path);
  if (m && m[1] !== "order" && m[1] !== "rx") return orderHref(dec(m[1]!));
  m = /^\/deliveries\/([^/]+)$/.exec(path);
  if (m && m[1] !== "booking" && m[1] !== "new") return bookingHref(dec(m[1]!));
  m = /^\/h\/([^/]+)$/.exec(path);
  if (m) return handoverHref(dec(m[1]!));
  return null;
}
