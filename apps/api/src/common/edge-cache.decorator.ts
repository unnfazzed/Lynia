import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, UseInterceptors } from "@nestjs/common";
import type { Response } from "express";
import { type Observable, tap } from "rxjs";

/** How long Cloudflare may serve a browse response from its edge before asking the API again. */
export const EDGE_CACHE_SECONDS = 60;
export const EDGE_CACHE_CONTROL = `public, max-age=0, s-maxage=${EDGE_CACHE_SECONDS}`;

/**
 * Sets the shareable Cache-Control only once the handler has SUCCEEDED. Nest's own @Header also stamps
 * error responses, which would let the edge cache a 404 or a kill-switch 503 for a minute; an error here
 * leaves the global `private, no-cache` (cache-headers.middleware.ts) in place.
 */
@Injectable()
export class EdgeCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        if (!res.headersSent) res.setHeader("Cache-Control", EDGE_CACHE_CONTROL);
      }),
    );
  }
}

/**
 * Lets Cloudflare's edge keep a copy of a response that is the SAME for every customer (docs/AZURE-EXIT.md,
 * "Latency"; owner decision 2026-11-15, option A). The API runs in Germany; a cached menu answers from
 * Harare/Johannesburg in ~30 ms instead of ~180 ms.
 *
 * `max-age=0` keeps phones revalidating on every request (the ETag/304 contract in
 * cache-headers.middleware.ts); only the shared edge cache (`s-maxage`) holds a copy, for 60 s.
 *
 * ONLY for responses that do not depend on who asks. A cached copy is served without reaching the auth
 * guard, so the body must be fine for anyone to read: the restaurant/shop catalogue is (option A: menus,
 * prices and photo links are effectively public). Never put this on anything user-scoped.
 */
export const EdgeCache = (): MethodDecorator => UseInterceptors(EdgeCacheInterceptor);
