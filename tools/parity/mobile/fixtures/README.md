# Mobile parity fixtures — the recipe

A fixture makes one mobile screen render its **populated** state in the parity lane, so its app column
in a sheet shows real UI instead of an honest "pending". Each fixture is a `.mjs` file here named after
the screen state it renders (e.g. `food_list.mjs`, `rider_board.mjs`).

## Shape

A fixture default-exports `{ wrap?, props? }`:

- `wrap(el)` — wraps the screen element in providers (almost always `withQuery(...)`).
- `props` — props passed to the screen. Route screens take **no props**; they read route params via
  `useLocalSearchParams()`, so use `setParams(...)` instead (see below).

Two data mechanisms, from `./_harness.mjs`, used together:

1. **`installRouter(routes)`** — swaps `globalThis.fetch`. The api client and plain-fetch hooks all call
   the global fetch, so this feeds the **real** hooks/queries and they paint the live state. Declare the
   endpoints your screen hits:
   ```js
   installRouter([
     { match: "/restaurants", json: { restaurants: [ ... ] } },
     { match: /^\/orders\/[^/]+$/, json: orderSnapshot },
     { match: "/wallet", method: "GET", json: { balanceUsd: 12.5, ... } },
   ]);
   ```
   `match` is a string (exact path or suffix), RegExp, or `(path)=>bool`. `json` is the body or
   `(path)=>body`. Unlisted requests answer an inert `{}` 200 (fail-safe). `/app/feature-flags`
   defaults to all-ON so flag-gated verticals render; override it to align a flag-OFF mock.
   **Call `installRouter` at module top level** (it must run before the screen mounts).

2. **`withQuery(seed?)`** — the `wrap`. `seed(qc)` primes a react-query cache key *synchronously* for
   screens that read the cache directly (deterministic, no network wait). Often you need no seed — the
   router feeds the queries — so `withQuery()` bare is enough.

`setParams({ id: "..." })` sets the expo-router params the shim serves to `useLocalSearchParams()`.
Call it at module top level for `/food/[id]`, `/order/[id]`, `/food/order/[orderId]`, etc.

## Worked example (`food_list.mjs`)

```js
import { installRouter, withQuery } from "./_harness.mjs";
const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
installRouter([{ match: "/restaurants", json: { restaurants: [ /* RestaurantListItem[] */ ] } }]);
export default { wrap: withQuery() };
```

## How to build one

1. Read the screen (`apps/mobile/app/<path>.tsx`) and the hooks/api it calls. Note the endpoints
   (`apiFetch("/…")`) and any `useLocalSearchParams()` fields.
2. Get real data shapes from the zod contracts in `packages/shared/src/contracts.ts`, or reuse the
   factories in `@lynia/shared/fixtures` (`makeOrder`, `makeWallet`, `makeLedgerEntry`, `makeKycState`…).
3. Write the fixture; render it:
   ```
   node render-mobile.mjs --component "app/<path>.tsx" --fixture <name> --out out/<name>.png
   ```
4. **Open the PNG and confirm it shows the populated state**, not a skeleton/empty/error. Tune the
   router data until it does. (Compare against the mock with `node render-mock.mjs --src <SRC> --id <id>`.)

## Gotchas

- Data is async (router → hook → re-render). The renderer waits ~600ms; bump via
  `window.__PARITY_SETTLE_MS = 1200` at module top level for a slow multi-fetch screen.
- Amounts on the wire: order/offer *serialised* fares are strings (`"12.00"`); wallet/request amounts
  are plain numbers. Mirror the contract or zod parse rejects it and the screen falls to its error state.
- uuid fields must be uuid-shaped (`z.string().uuid()`), or a parse fails silently into fail-safe.
- Don't edit `bundle.mjs`, the shims, or `app-targets.mjs` in a fixture PR unless a screen needs a new
  native-module shim — those are shared. Report the app-target entry; it's assembled centrally.
