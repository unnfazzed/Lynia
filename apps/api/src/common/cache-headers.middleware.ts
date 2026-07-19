import type { NextFunction, Request, Response } from "express";

/**
 * Deterministic Cache-Control defaults for a JSON API serving a mobile client on metered, high-RTT
 * links. Two goals, one middleware:
 *
 *  1. **Make revalidation the contract.** `private, no-cache` on GETs means: any cache (the phone's
 *     HTTP layer, our own client-side ETag store) MAY store the response but MUST revalidate before
 *     reuse. Express already stamps a weak ETag on every JSON body and answers a matching
 *     `If-None-Match` with an empty 304 (see main.ts, where the `etag` setting is pinned), so a
 *     revalidation costs headers only — the mobile client leans on exactly that (apps/mobile
 *     src/api/client.ts) to turn its 15/30s polling loops into ~0-byte round-trips when nothing
 *     changed. `private` keeps user-scoped bodies out of any shared intermediary.
 *
 *  2. **Kill heuristic caching.** With NO Cache-Control header, iOS's NSURLCache is allowed to
 *     heuristically cache responses (RFC 9111 §4.2.2) — for authorized, fast-moving JSON (an order
 *     snapshot mid-auction) a silently reused stale body is a correctness bug, not a perf win.
 *     Explicit `no-cache` (revalidate) / `no-store` (mutations) makes behavior identical on every
 *     client HTTP stack.
 *
 * A route that KNOWS better simply sets its own header afterwards — controllers run after this
 * middleware, and the last setHeader wins (e.g. the public version-gate opts into `public, max-age`).
 */
export function cacheHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD") {
    res.setHeader("Cache-Control", "private, no-cache");
  } else {
    // Mutation responses (created orders, wallet writes, token refreshes) must never be replayed
    // from any cache under any heuristic.
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}
