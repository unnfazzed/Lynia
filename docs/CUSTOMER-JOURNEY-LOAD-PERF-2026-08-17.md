# Customer-journey load performance — root-cause analysis (2026-08-17)

**Owner report (2026-08-17):** *"When I click send button it takes time to load and show me the
next screen; map takes time to load and the pickup address takes time to auto complete; maps
initially shows a failed to load — same with restaurant; cold start also inefficiency showing
green screen then white."*

Scope of this review: the customer journey on the installed internal-track build (v0.40.1, shipped
2026-08-17, which contains PERF-SEND-01 `d83ed5a`, the splash unification `#779`, the map-signal fix
`#781` and the pickup auto-locate `#789`). This is an analysis, not a fix PR — each finding names
the mechanism, the evidence in the repo, and the fix with its delivery lane (OTA-able JS / API
deploy / store build / ops-GCP). Prior art it builds on: `docs/PERFORMANCE.md`,
`docs/MAPS-LOADING-REVIEW-2026-08-16.md`, `docs/SENTRY-TRIAGE-2026-08-17.md`,
`docs/KNOWN_BUGS.md` (`MOB-BOOT-03`, `MOB-MAP-01/02`, SEN-01…04).

---

## 0. Summary of root causes, ranked by expected user-visible impact

| # | Symptom | Root cause | Fix lane |
|---|---|---|---|
| 1 | Restaurants slow, photos re-download, list re-fetches full bodies | **Per-response V4 signed-URL minting** (`merchant.service.ts signPhoto`) — defeats ETag/304, defeats the phone's image cache, and costs up to 2 IAM `signBlob` RPCs per merchant per page | API deploy |
| 2 | Map "initially shows a failed to load", then loads | **9 s `onMapLoaded` timeout is a false-positive detector on a 600 ms-RTT link** — Android's signal means "ALL tiles rendered", which legitimately takes >9 s on 2G/3G; the failure card shows, then self-clears when tiles land | OTA (JS) |
| 3 | Map genuinely failing on the Play build | `MOB-MAP-02` — Android Maps key rejected (Play App Signing SHA-1 restriction mismatch, most likely), confirmed live by Sentry `compose-map-not-loaded map_ready=true` events | **ops/GCP** (no code) |
| 4 | Pickup address slow to auto-fill | Auto-locate **withholds the landmark until the LIVE GPS fix settles** (up to 9 s) even when a cached fix painted the pin instantly; reverse geocode is a further unbounded network call | OTA (JS) |
| 5 | Autocomplete → committed address feels slow | After the Places round-trips, **`AddressConfirmSheet` mounts a second full-screen native `MapView` in a Modal** — a second SDK surface + second tile load before the address commits | OTA (JS) |
| 6 | Cold start: green screen, then **white**, then home | The **redirect → home segment is unpainted and unmeasured**: `boot_home` fires when the redirect *decision* resolves, not when home paints; the native-stack content background defaults to white and no `contentStyle` is set | OTA (JS) |
| 7 | Cold start: green screen duration | Startup module graph (3.0 MB minified / 1,713 modules evaluated at boot; Sentry 676 KB + zod barrel 202 KB are the two biggest, both recorded non-fixes) + the font gate | store build / accepted |
| 8 | First screens' fetches slow/failing on cold start | **Cold-boot request burst** on a high-RTT link: bootstrap, version gate, flags, active orders, restaurants page (heavy — see #1), notifications unread, push registration, socket handshake all contend for the first connections | OTA (JS) |
| 9 | "Send" tap → compose screen beat | Largely fixed by PERF-SEND-01 (route chunk prewarmed, map mounts one interaction late); what remains is the **first-in-process Google Maps SDK init + tile fetch landing right as the screen settles**, plus 5 SecureStore reads and 2 queries at mount | partial OTA |

Nothing here contradicts the existing perf program; #1 is the same bug class the wave-1
pickup-photo fix already solved for order snapshots, now reproduced in the restaurants vertical.

---

## 1. Cold start — "green screen then white"

### 1.1 What the green phase is

Native splash (brand green, `app.config.ts` expo-splash-screen) → JS `SplashView` (identical green
frame) — the handoff is a no-op by design (#779). The green phase lasts: native process start +
Hermes bundle evaluation + the font gate + the four prewarmed device reads (`src/boot/prewarm.ts`).
`MOB-BOOT-03` already collapsed the serial chain; the remaining floor is the module graph
(1,713 modules / 3.0 MB minified evaluated at boot — `docs/PERFORMANCE.md` "Cold start"). The two
largest eager items (Sentry 676 KB / 317 modules; zod via the `@lynia/shared` barrel, 202 KB) are
documented deliberate non-fixes (`MOB-BOOT-03-SIB-1/-SIB-2`) — do not re-litigate them without
reading those entries.

### 1.2 The white phase — the actual defect

`app/index.tsx` holds the green `SplashView` until `bootResolved`, then returns
`<Redirect href="/home" />`. From that instant until `(tabs)/home`'s first frame:

- **The screen is painted by the navigator's default content background, which is white.**
  `app/_layout.tsx:87` renders `<Stack screenOptions={{ headerShown: false }} />` with no
  `contentStyle`; the green splash view unmounts immediately on redirect.
- **The segment is unmeasured.** `enqueueBoot("boot_home")` fires when `bootResolved` flips
  (`app/index.tsx:42-44`) — i.e. at the redirect *decision* — not when home actually paints. The
  white gap is precisely `real home paint − boot_home`, and the RUM taxonomy
  (`src/telemetry/rum.ts`: `boot_paint`, `boot_home`, 3 glass metrics, `apifetch`) has no event
  for it. On a Go-class handset the first commit of the Tabs navigator + the home tree +
  PersistQueryClientProvider hydration is where that time goes.

So the user-visible sequence green → white → home is: splash (held) → navigator default background
(unstyled, untimed) → home.

**Fixes (all JS/OTA-able):**

1. Set `contentStyle: { backgroundColor: tokens.color.bg }` (or `accentWash`) in the root Stack's
   `screenOptions` so no navigation transition can ever paint framework-default white. One line;
   also covers every later push (e.g. `/send`, `/food`).
2. Add a third boot event (`boot_home_paint`) enqueued from the home screen **after its first
   frame is actually presented** — via a post-frame signal (`InteractionManager.runAfterInteractions`
   or a `requestAnimationFrame` chained after the first commit), NOT a mount/layout effect: layout
   effects run before the native frame presents, so an effect-timed event would understate the
   customer-visible gap. (If only commit timing is practical, name the event for what it measures —
   `boot_home_commit` — rather than letting the name overclaim.) Either way the white gap becomes
   a fleet number the weekly performance watch can see and defend a fix against.
3. Optional, bigger: hold the green splash until home's first frame (move the `SplashScreen.hideAsync`
   trigger — or keep `SplashView` mounted as an overlay until `/home` signals first layout). This
   converts green→white→home into green→home. Weigh against perceived total splash time.

### 1.3 The cold-boot request burst

Once home mounts, the app concurrently fires: `/app/bootstrap` (root), `/app/version-gate`,
`/app/feature-flags` (+250 ms deliberate delay, B-O7), `GET /orders/active` (home poll seed),
`GET /restaurants` page 1 (heavy — §4), notifications unread count, push-token registration, the
socket handshake, and RUM flushes. On the target link (~600 ms RTT, few usable concurrent
connections) these contend; the losers are what the customer sees as "initially failed, then
worked" (§4.3).

Important nuance: the restaurants feed is **paint-relevant on home** — "Popular near you" renders
from `useRestaurantListFeed` — so a blind cold-boot stagger of that request would delay visible
content. The right shape is the Swiggy/warm-boot pattern the app already uses elsewhere: **hydrate
the `restaurant-list-store` snapshot before (or with) query initialization** so cached cards are in
the *first* render — today `loadRestaurantListSnapshot` runs in a post-render effect, so the
snapshot can never contribute to the first frame — and defer only the network *revalidation* until
after first paint. A stagger remains appropriate only for genuinely non-paint content (the
notifications dot), keeping the first connections for bootstrap + active orders.

---

## 2. "Send" tap → compose screen

What PERF-SEND-01 (in this build) already fixed: the 57-module `/send` route chunk is evaluated in
launcher idle time (`usePrewarmSendRoute`, `(tabs)/home.tsx:54`), and `ComposeMap` mounts the
native `MapView` one interaction *after* the push transition (`ComposeMap.tsx` `mapMounted`), so
the sheet/form is interactive from the first frame.

What remains on the tap path:

1. **First-in-process Google Maps SDK initialization + first tile fetch** land right as the
   transition settles. The SDK init runs on the UI thread and the tile fetch competes with the
   mount-time requests below on a 2G link — this is the "screen arrives, then visibly finishes
   loading" beat. There is no cheap JS fix; options are (a) accept (the deferral already keeps the
   form usable), or (b) pre-warm the SDK by mounting a 1×1 `MapView` during launcher idle —
   memory-costly on Go-class devices, so it needs a device measurement before shipping.
2. **Mount-time I/O fan-out**: `loadRecipients`, `loadDisclaimerAccepted`, `loadMyPickupPhone`
   (send.tsx), `loadRecents` + `loadSaved` (AddressSearch), permission check + `getLastKnown` +
   `getCurrentPosition` (auto-locate), plus two queries — `["me"]` (normally cache-fresh from
   bootstrap) and `["activeCustomerOrder"]` (a real RTT). All async and none block paint, but the
   network ones compete with tile fetches. `["activeCustomerOrder"]` could start from the
   bootstrap-seeded cache and revalidate lazily instead of racing the map.
3. **"Broadcast request" → order screen** is one `createOrder` RTT behind a spinner, and the order
   cache is pre-seeded so `/order/[id]` paints instantly (send.tsx:507-522). This is already the
   right shape; on a 600 ms–2 s RTT the wait is the network, not the app.

**Measurement gap:** nothing times tap→first-frame for `/send` (or any screen). A
`send_open_glass` sample (tap timestamp → first layout of the sheet) would make this tuning
verifiable from the fleet.

---

## 3. The map — slow to load, and "initially shows a failed to load"

### 3.1 The transient failure card is a false positive on slow links (JS fix)

`ComposeMap` shows "The map didn't load" when the platform load signal hasn't fired within
`MAP_LOAD_TIMEOUT_MS = 9_000` (`ComposeMap.tsx:39,124`). On Android the required signal is
`onMapLoaded` — **"the map finished rendering all tiles"**. On the program's own design link
(~600 ms RTT 2G/3G, `network-policy.ts`), a Harare tile set routinely takes longer than 9 s; the
card then appears, and self-clears the moment tiles land (`mapFailed = !considerLoaded && mapTimedOut`).
That is exactly the reported "initially shows a failed to load". The card also carries an alert
role and a Sentry event per attempt — so slow-link sessions are currently being *reported* as map
failures, polluting the `MOB-MAP-02` signal.

Fix options, cheapest first (all OTA-able) — with one constraint: **the true-failure path must not
lose its recovery affordance**. If the card is simply delayed to 20-25 s across the board, a
customer on a genuinely rejected key waits 11-16 s longer for the Retry pill; that trade-off must
be measured (via the elapsed-time tagging below) before shipping, not assumed:

- Stage the copy by *signature*, not by a single longer timer: at ~9 s show a passive "Map is
  taking a while…" line (no alert, no Sentry). Promote to the actionable failure card early
  (~the current 9-12 s) when the rejected-key signature is present — `onMapReady` fired, zero
  tiles, network reachable — and only late-promote (~20-25 s) in the ambiguous slow-tiles case
  (tiles trickling / reachability degraded). The card already self-clears, so erring later costs
  nothing *in that ambiguous branch only*.
- Tag the Sentry event with elapsed-time and reachability state so late-tiles sessions are
  separable from never-tiles sessions — this is also what makes the trade-off above measurable
  from the fleet before and after.

### 3.2 The map may also be genuinely failing on this build (ops, not code)

`docs/SENTRY-TRIAGE-2026-08-17.md`: real field events `compose-map-not-loaded` with
`map_ready=true`. **This is evidence, not proof** — ready-but-never-loaded is *consistent with* an
Android Maps key rejection (`MOB-MAP-02`), but §3.1 shows slow tile delivery produces the identical
observed state before `onMapLoaded` fires. Treat key rejection as the leading *hypothesis*: confirm
it by (a) checking the events carry `map_platform=android` + `map_load_signal=onMapLoaded` (the
SEN-02 tags), and (b) the primary sources — `adb logcat | grep -i "Google Maps Android API"` on the
handset (an `Authorization failure` line is conclusive) or the GCP key-restriction console. Most
likely cause if confirmed (per `MAPS-LOADING-REVIEW-2026-08-16.md` §3): the key is restricted to
the *upload* keystore's SHA-1, while Play re-signs with the *app-signing* key.
**Action (founder, minutes):** Play Console → App integrity → copy the app-signing certificate
SHA-1 → add it to the Maps key's Android restrictions alongside `zw.co.lynia`. No build needed —
key-side changes take effect on the next map open. Until that is confirmed fixed, some sessions'
"map failed" cards are true.

### 3.3 Interaction of the two

If the owner's handset shows the card and the map *then* loads → §3.1 (false positive, JS fix).
If the card shows and tiles never arrive without a retry → §3.2 (ops). Both are live; fix both.

---

## 4. Pickup address auto-complete / auto-fill

### 4.1 The auto-filled pickup landmark waits for the slowest input (JS fix)

`use-pickup-autolocate.ts` deliberately paints the *pin* from the cached fix immediately, but the
*landmark* (the visible "pickup address") is geocoded **only from the FINAL point** — i.e. after
`getCurrentPositionAsync` settles (up to `FIX_TIMEOUT_MS = 9_000`) plus an unbounded
`reverseGeocodeAsync` network round-trip (Play-services geocoder). The rationale in the file
("don't spend a second lookup") trades one cheap geocode for seconds of visible emptiness in the
common case. Result: the pin appears instantly, the address row stays blank for ~3–10+ s — the
reported "pickup address takes time to auto complete".

Fix: reverse-geocode the cached fix immediately so the address row fills with the pin, and let the
**live** fix's own geocode replace it when the live point is accepted. Two correctness rules for
the implementation: (a) a distance threshold (e.g. skip the second lookup under ~75 m) is a *cost
optimization only*, never an address-correctness rule — nearby points can sit across a road or
property boundary, so when the live point differs at all, its geocode result wins; (b) each geocode
result must stay associated with the point it was requested for, so an out-of-order completion
(cached-point result landing after the live-point result) can never overwrite the newer landmark —
the same monotonic-guard shape `AddressSearch.reqSeq` already uses. Cover both with tests
(`geocode.test.ts` today covers only `geocodeAsync`, not `reverseGeocodeAsync`). Bounding
`reverseGeocodeAsync` with `withTimeout` unblocks the *UI path* only — a `Promise.race` does not
cancel the underlying native geocoder work — which is acceptable here (the guarded callbacks
already ignore late results) but should be stated in the code, not discovered.

### 4.2 The search path pays two Google RTTs plus a second native map (JS fix)

Keyed autocomplete is: 300 ms debounce → autocomplete RTT (Google, `FAST_TIMEOUT_MS` 8 s) → tap →
place-details RTT → **`AddressConfirmSheet` opens a Modal containing a second full-screen native
`MapView`** (`AddressConfirmSheet.tsx:86-101`) that runs its own surface init + tile load before
the customer can confirm. On the target link the confirm step is often the longest part of the
"autocomplete" experience — and it is also the second producer of the Paper-teardown crash
candidate (SEN-04).

Options: (a) confirm on the *existing* compose map — recenter it on the resolved point and enter a
lightweight "nudge to confirm" mode instead of mounting a second map; (b) keep the sheet but make
tiles non-blocking (the pin + landmark + Confirm are usable immediately over the ground-color
canvas, tiles fade in); (c) at minimum, `initialRegion` tight on the rooftop point so the first
tile batch is one zoom level, not a metro area.

### 4.3 Keyless / degraded states

Unchanged from `MAPS-LOADING-REVIEW-2026-08-16.md`: no Places key → device geocoder (resolve on
submit only, no predictions); a mis-restricted key (`REQUEST_DENIED`) → empty suggestions forever
with the "look it up on this phone" escape. Sentry silence on `places-status-*` in the 08-17
triage is **suggestive, not conclusive**: the event only fires after a *qualifying* request (key
present, ≥3 characters typed, an HTTP-OK body carrying a non-OK Places status) — a build with no
key, or sessions where nobody typed a qualifying query, produce the same silence. Treat "the
Places key is healthy" as unconfirmed until a suggestion list is actually seen on-device
(`MAPS-LOADING-REVIEW-2026-08-16.md` §5.0's two-minute check); if it is healthy, autocomplete
slowness on the handset today is RTT + the confirm step, not the key.

---

## 5. Restaurants — slow to load, "initially failed to load"

### 5.1 Per-response signed-URL minting is the dominant inefficiency (API fix — biggest single win)

`merchant.service.ts` `signPhoto()` mints a fresh V4 signed read URL for **every photo on every
response** (`listRestaurants` → `toListItem` signs cover + logo per merchant; menu responses sign
every dish photo; search signs every hit). A V4 signature embeds its own timestamp, so every mint
is a different URL. Three compounding consequences:

1. **The phone's image cache never hits.** Every visit to home ("Popular near you"), the browse
   list, or a menu re-downloads every cover/logo/dish JPEG over metered 2G/3G — tens to hundreds
   of KB per screen, every time. This alone is most of "restaurant takes time to load". This is
   the *same mechanism* the wave-1 pickup-photo fix removed for order snapshots
   (`docs/PERFORMANCE.md`: "URL is now byte-stable across polls").
2. **ETag/304 revalidation is structurally dead** for `GET /restaurants` and menus: the body
   differs on every response, so the conditional-GET machinery (`api/client.ts`) never gets a 304
   — the full JSON re-downloads on every refetch/staleness pass.
3. **Server latency + quota**: with ambient Cloud Run credentials, each `getSignedUrl` is an IAM
   `signBlob` RPC — up to ~40 per list page (20 merchants × cover+logo), per request, against the
   project-shared quota `DS-07` already flagged.

Fix: micro-cache signed URLs keyed by object key (the `MicroCache` primitive already exists —
`apps/api/src/common/micro-cache.ts`) with a TTL of ~50 min of the 60-min validity, exactly
mirroring `PICKUP_PHOTO_URL_CACHE_TTL_MS`. URLs become byte-stable across responses for ~an hour →
image cache hits, 304s work again, signBlob calls collapse. No client change, no contract change,
deployable server-side today.

Follow-ons in impact order: adopt `expo-image` for remote photos (ranked backlog #3 — now doubly
worth it once URLs are stable; native change → store build); serve pre-resized thumbnail variants
(cards render ~170-360 px from 1280 px uploads — an upload-time resize or on-the-fly variant
would cut per-image bytes ~4-10×).

### 5.2 The transient "failed to load" on open

`food/index.tsx` shows the full-screen error view only when the fetch settled in error **and** no
snapshot exists (`FoodListErrorView`, line 61-63); with a snapshot it paints stale + retry. So the
reported "initially failed, then loaded" is one of: (a) first-ever session (no snapshot yet) whose
first fetch lost the cold-boot burst (§1.3) or timed out at 15 s and exhausted the 2 quick retries
(`shouldRetry` caps at 2 attempts with ≤4 s jittered backoff — on a link where the request itself
needs >15 s, both retries fail the same way and the error paints before a later manual/auto refetch
succeeds); or (b) the heavy page-1 payload (uncached photos + fresh-signed URLs, §5.1) simply
taking that long. §5.1's fix shrinks the payload and lets 304s work; deferring this feed a beat at
cold boot (§1.3) removes the contention; and the snapshot warm-paint already covers every session
after the first.

Also worth noting: `loadRestaurantListSnapshot` is read in an effect *after* the query fires, so
on the very first frame `restaurants` is null even when a snapshot exists — the loading skeleton
(not the error) covers this today; keep the read order in mind if the states are ever reworked.

---

## 6. Measurement gaps (make the next fix defensible from the fleet)

| Gap | Proposed RUM event |
|---|---|
| Redirect → home first paint (the white gap) | `boot_home_paint` (§1.2) |
| Send tap → compose sheet first frame | `send_open_glass` |
| Map mount → tiles rendered (per attempt, with outcome) | `map_tiles_ms` histogram; tag the existing Sentry event with elapsed + reachability |
| Autocomplete resolve → address committed (incl. confirm sheet) | `addr_confirm_glass` |

All four fit the existing batched-RUM shape (`src/telemetry/rum.ts`) and are OTA-able.

---

## 7. Recommended execution order

1. **Ops (no code, minutes):** verify/fix the Maps key's SHA-1 restriction against the Play
   app-signing certificate (`MOB-MAP-02`, §3.2). Highest certainty-to-effort ratio in this report.
2. **API deploy:** signed-URL micro-cache for restaurant/menu/search photos (§5.1).
3. **OTA batch (JS):** stack `contentStyle` background + `boot_home_paint` (§1.2); staged map
   timeout copy + report tagging (§3.1); cached-fix landmark geocode + geocoder timeout (§4.1);
   snapshot-first hydration of the restaurants feed + stagger for non-paint calls only (§1.3);
   RUM events (§6).
4. **Next store-build train:** `expo-image` adoption (backlog #3); revisit confirm-sheet map
   strategy (§4.2) alongside the SEN-04 crash trail; consider Maps SDK pre-warm only with a
   device memory measurement (§2).
5. **Owner check on-device after 1+2:** does the map card still appear? does the restaurant list
   paint from cache on second open? Report back through the weekly performance watch.
