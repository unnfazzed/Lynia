/**
 * Parse the `TRUST_PROXY` env value into the shape Express's `app.set('trust proxy', …)` expects, so
 * `req.ip` (and the X-Forwarded-For client IP the per-IP rate limits key off) resolves to the real
 * caller rather than the load balancer's socket address.
 *
 * Accepted forms (kept a string in env so all three round-trip):
 *   - a hop count, e.g. "1"  → trust that many proxies from the right (1 = a single LB in front, the
 *     GCP external HTTPS LB → Cloud Run default). req.ip becomes the (n+1)th-from-right XFF entry.
 *   - "true" / "false"       → trust the leftmost XFF (SPOOFABLE — avoid) / disable (dev / direct).
 *   - anything else          → a subnet allow-list passed verbatim, e.g. "loopback, 10.0.0.0/8".
 */
export function parseTrustProxy(value: string): number | boolean | string {
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
