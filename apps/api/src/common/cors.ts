/**
 * Central CORS origin policy, shared by the HTTP app (main.ts) and the Socket.IO tracking gateway so
 * both enforce the SAME allow-list instead of the gateway's old `origin: "*"`.
 *
 * Policy: parse a comma-separated allow-list from `CORS_ALLOWED_ORIGINS`. A request is allowed when
 *   - it carries NO Origin header (native mobile clients, server-to-server, curl) — CORS is a browser
 *     protection, and Lynia's first-party clients are native apps that never send a browser Origin; or
 *   - its Origin is explicitly in the allow-list.
 * Everything else is refused. An empty list therefore denies all cross-origin browser requests while
 * leaving the native apps fully functional (default-deny, not the previous wildcard-allow).
 *
 * NOT only native clients any more: `apps/merchant` (the kitchen dashboard at its own hostname) calls
 * this API **from the browser** — sign-in, every queue mutation and the Socket.IO queue socket — so
 * its origin MUST be in this list or every call fails preflight. That is what an empty list on the
 * live service cost on 2026-08-18 (see docs/KNOWN_BUGS.md `OPS-CORS-01`): the dashboard shipped with
 * the right API URL baked in and still showed "Couldn't reach the server" on the login screen,
 * because the browser blocked the request before the API ever logged it.
 *
 * Read from `process.env` directly (not the validated Env) because the gateway's `@WebSocketGateway`
 * decorator is evaluated at class-definition time, before Nest's DI/config is available.
 */

/**
 * Normalises one origin for comparison: lowercased, trailing slashes stripped.
 *
 * Both halves exist because of how this list is written in practice — a human pasting a browser
 * address bar into a repo Variable or `gcloud run deploy --set-env-vars` produces
 * `https://Example.com/`, while the `Origin` header a browser actually sends is `https://example.com`
 * (scheme + host + optional port, never a path, never a trailing slash — RFC 6454 §6.1). Those two
 * strings are not equal, so an allow-list that LOOKS correct in the console denies every request,
 * with no server-side signal: a refused preflight leaves Nest's CORS middleware silent, falls through
 * to the router and 404s. Origins are case-insensitive in both scheme and host, and neither
 * normalisation can widen access beyond the host that was written down.
 */
function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

export function parseAllowedOrigins(raw: string | undefined = process.env.CORS_ALLOWED_ORIGINS): string[] {
  return (raw ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter((o) => o.length > 0);
}

/** True when an Origin is permitted under the policy above. `undefined`/empty Origin ⇒ allowed (native). */
export function isOriginAllowed(origin: string | undefined, allowList: string[] = parseAllowedOrigins()): boolean {
  if (!origin) return true;
  return allowList.includes(normalizeOrigin(origin));
}

/**
 * CORS `origin` option shaped for both `@nestjs/common` `enableCors` and Socket.IO — both accept a
 * `(origin, callback) => void` resolver. Never throws; a disallowed origin resolves to `false`, which
 * the frameworks turn into a missing `Access-Control-Allow-Origin` (the browser then blocks it).
 */
export function corsOriginResolver(
  allowList: string[] = parseAllowedOrigins(),
): (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void {
  return (origin, cb) => cb(null, isOriginAllowed(origin, allowList));
}
