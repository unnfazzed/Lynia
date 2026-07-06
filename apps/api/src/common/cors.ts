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
 * Read from `process.env` directly (not the validated Env) because the gateway's `@WebSocketGateway`
 * decorator is evaluated at class-definition time, before Nest's DI/config is available.
 */
export function parseAllowedOrigins(raw: string | undefined = process.env.CORS_ALLOWED_ORIGINS): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/** True when an Origin is permitted under the policy above. `undefined`/empty Origin ⇒ allowed (native). */
export function isOriginAllowed(origin: string | undefined, allowList: string[] = parseAllowedOrigins()): boolean {
  if (!origin) return true;
  return allowList.includes(origin);
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
