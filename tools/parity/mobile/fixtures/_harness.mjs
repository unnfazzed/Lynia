/**
 * Shared fixture harness for the parity mobile renderer.
 *
 * A mobile screen renders its *populated* state only if the data it reads is there. Two mechanisms,
 * used together per screen:
 *
 *   1. installRouter(routes) — a `globalThis.fetch` router. The api client (src/api/client.ts) and the
 *      plain-fetch hooks (use-feature-flags) both call the *global* fetch, resolved at call time, so
 *      swapping it here intercepts every request. A fixture declares the handful of endpoints its
 *      screen hits and the JSON they return; everything else answers an inert `{}` 200 (fail-safe-off,
 *      the same direction the real hooks degrade). This lets the REAL hooks/queries run and paint the
 *      live state — closer to the device than hand-stubbing each hook, and it scales across screens.
 *
 *   2. withQuery(seed) — wraps the screen in a QueryClientProvider. Pass a `seed(qc)` to prime a cache
 *      key synchronously (deterministic, no network wait) for screens that read react-query directly;
 *      omit it to just provide the client while the router feeds the queries.
 *
 * setParams(p) sets the expo-router route params the shim serves (window.__PARITY_ROUTE_PARAMS) for
 * screens that read useLocalSearchParams (e.g. /food/[id], /order/[id]).
 *
 * Call installRouter()/setParams() at fixture module top level — they run at import, before the entry
 * mounts the screen (bundle.mjs imports Screen then the fixture, and mounts after both).
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Feature flags default ON in parity so flag-gated verticals (Food tile/rail, merchant dispatch)
 *  render their built state — the app's own default is fail-safe-OFF, which would blank them. A
 *  fixture that wants the flag-OFF mock aligns to it by overriding this route. */
const DEFAULT_ROUTES = [
  {
    match: "/app/feature-flags",
    json: { restaurantsEnabled: true, merchantDispatchAutoEnabled: true, merchantWalletEnabled: true },
  },
];

function pathOf(input) {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  try {
    return new URL(url, "http://parity.local").pathname;
  } catch {
    return url;
  }
}

/**
 * Install a fetch router. Each route: { match, json, status?, method? }
 *   match  — RegExp, string (exact path or suffix), or (path)=>boolean
 *   json   — the response body, or (path)=>body
 *   status — default 200
 *   method — restrict to a verb (default: any)
 * Later-listed fixture routes win over the defaults (fixture routes are matched first).
 */
export function installRouter(routes = []) {
  const table = [...routes, ...DEFAULT_ROUTES];
  globalThis.fetch = async (input, init = {}) => {
    const path = pathOf(input);
    const method = String(init.method || "GET").toUpperCase();
    for (const r of table) {
      if (r.method && String(r.method).toUpperCase() !== method) continue;
      const m = r.match;
      const hit =
        typeof m === "function" ? m(path) : m instanceof RegExp ? m.test(path) : path === m || path.endsWith(m);
      if (!hit) continue;
      // `json: null` is a REAL staged answer ("no active order") — only an omitted `json` falls back
      // to the inert `{}`; `?? {}` here silently turned a staged null into a truthy object and made
      // the delete-account screen paint its blocking strip against a fixture that staged none.
      const body = typeof r.json === "function" ? r.json(path) : "json" in r ? r.json : {};
      return new Response(JSON.stringify(body), {
        status: r.status || 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
}

/** A `wrap` that provides a QueryClient. `seed(qc)` optionally primes caches synchronously. */
export function withQuery(seed) {
  return (el) => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    if (seed) seed(qc);
    return React.createElement(QueryClientProvider, { client: qc }, el);
  };
}

/** Merge expo-router route params the shim will serve to useLocalSearchParams(). */
export function setParams(p) {
  if (typeof window === "undefined") return;
  window.__PARITY_ROUTE_PARAMS = { ...(window.__PARITY_ROUTE_PARAMS || {}), ...p };
}

/** Convenience: a fresh RFC-4122 v4-shaped id suffix so seeded fixtures satisfy z.string().uuid(). */
export const UUID = {
  restaurant: "0a1b2c3d-0000-4000-8000-0000000000a1",
  dish: "0a1b2c3d-0000-4000-8000-0000000000a2",
  order: "0a1b2c3d-0000-4000-8000-000000000001",
};
