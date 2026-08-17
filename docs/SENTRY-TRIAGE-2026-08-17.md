# Sentry triage — 2026-08-17

Two unresolved issues on the `lynia-mobile` project (14d, all environments):

| Sentry issue | Title | Events | Users | Age |
|---|---|---|---|---|
| `LYNIA-MOBILE-1` | `Error: compose-map-not-loaded (onMapReady=true)` — `useEffect$argument_0(apps/mobile/src/ui/ComposeMap.tsx)` | 5 | 1 | 13 h |
| `LYNIA-MOBILE-2` | `AssertionError` — *(No error message)*, Unhandled, `com.facebook.infer.annotation.…` | 1 | 1 | 7 min |

---

## 1. `compose-map-not-loaded (onMapReady=true)` — FIXED

### 1.1 What the event actually proves

This event was added on 2026-08-16 (`docs/MAPS-LOADING-REVIEW-2026-08-16.md` §6) so that the next blank
map would arrive "with a device and a version attached" instead of as a user's description. Its arrival
is therefore the instrumentation working. Two things follow from it, and only the first was expected.

**The 2026-08-16 JS fix is live on the handset.** `compose-map-not-loaded` exists only in that change
set, so an event bearing it proves the bundle carrying it is the one running. That also makes a *silence*
meaningful: the same change set reports a non-OK Places status as `places-status-<STATUS>`
(`src/api/places.ts:91`), and no such issue exists in the 14-day window. Per the decision table in
`MAPS-LOADING-REVIEW-2026-08-16.md` §5.0, the `REQUEST_DENIED` branch — a provisioned-but-mis-restricted
Places key, which looks identical to "no such address" — is therefore **not** what the handset is in.

**`onMapReady=true` is the signature §2.1 predicted.** The Android Maps SDK fires `onMapReady` as soon as
it holds a `GoogleMap` object, *including immediately after rejecting the API key*; `onMapLoaded` fires
only once tiles have actually rendered. Ready-but-never-loaded is the authorization-failure fingerprint,
and it is what `MOB-MAP-02` describes. **That remains an ops/GCP item — it is not repairable in this
repo** (§3 of the review: Play App Signing SHA-1 mismatch, Maps SDK disabled/billing lapsed, or the key
never reaching the merged manifest).

### 1.2 The defect this triage found: the same event fires on iOS over a *working* map

`onMapReady=true` has a second producer, and it is a bug in our code.

react-native-maps annotates the event the fallback waits for:

```
/**
 * Callback that is called when the map has finished rendering all tiles.
 *
 * @platform iOS: Google Maps only
 * @platform Android: Supported
 */
onMapLoaded?: (event: NativeSyntheticEvent<{}>) => void;
```
<sub>`react-native-maps@1.18.4`, `lib/MapView.d.ts:233-239` — verified against the installed package.</sub>

`onMapLoaded` is bridged from the **Google Maps iOS SDK**, so iOS emits it only under
`PROVIDER_GOOGLE`. This app passes **no `provider` to any `MapView`** (`ComposeMap`, `MapPicker`,
`LiveMap`, `AddressConfirmSheet` — `PROVIDER_GOOGLE` appears nowhere in `apps/mobile/src`) and
configures no `ios.config.googleMapsApiKey`, while `app.config.ts:126` declares
`platforms: ["android", "ios"]`. Every iOS map is therefore an Apple `MKMapView`, which never emits
`onMapLoaded` at all.

Requiring it there did not make the check weaker — it **inverted** it. The 9-second timer
(`MAP_LOAD_TIMEOUT_MS`) could only ever expire, so on iOS, every session:

1. showed **"The map didn't load"** over a perfectly good Apple map, after 9 s;
2. **lost the pin hint** — "Tap the map to drop your pickup pin" was gated on the same `mapLoaded`
   flag (`ComposeMap.tsx:320`), so the one cue that the map *is* the input never rendered; and
3. **sent this Sentry event**, indistinguishable from the real Android key rejection.

The condition is unconditional on iOS, so it is not a race or a slow-network artefact.

**Why the test suite did not catch it.** `compose-map-failure.test.tsx` replaces `react-native-maps`
with a stand-in whose `onMapReady`/`onMapLoaded` the test fires *by hand* — so the mock emitted
`onMapLoaded` on demand regardless of platform, and the platform-conditional behaviour was
unrepresentable. (`jest-expo` defaults to the iOS platform, so the suite was nominally running as the
platform that was broken.)

### 1.3 Fix

The event that proves a map drew is platform-dependent, because the failure mode is platform-dependent.
`src/logic/map-load-signal.ts` (new) makes that choice explicit and testable:

| Platform | Required signal | Why |
|---|---|---|
| Android | `onMapLoaded` | The only signal that outlives a rejected API key — unchanged, and still the thing that catches `MOB-MAP-02`. |
| iOS / other | `onMapReady` | Annotated Supported on both platforms. Strictly weaker — it proves the view initialised, not that tiles drew — but the failure it cannot catch is an API-key rejection, and Apple Maps has no API key to reject. |

`ComposeMap` now derives `considerLoaded = mapLoaded || (signal === "onMapReady" && mapReady)`, so a
real `onMapLoaded` still wins on every platform (and would start arriving on iOS the day the app adopts
`PROVIDER_GOOGLE`); `onMapReady` only stands in where the platform never emits the stronger event. Both
the failure card and the pin hint key off it.

### 1.4 The report itself was not actionable — also fixed

The finding above was *invisible in the issue that reported it*, which is its own defect:

- **The varying part was in the message.** Sentry fingerprints on the message, so
  `compose-map-not-loaded (onMapReady=${mapReady})` opens a **separate issue per value** — one failure
  split in two — while burying the fields worth filtering on inside a string. The message is now
  constant and the variance moved to tags: `map_platform`, `map_load_signal`, `map_ready`,
  `map_attempt`. `map_load_signal` is the one that separates the two causes above.
- **`captureException` attached no context at all.** `src/telemetry/sentry.ts` now takes an optional
  `{ tags, extra }`, passed as the SDK's `captureContext` argument (not `withScope`, so nothing is left
  pushed if a caller throws mid-report).
- **Retries were silent.** `retryMap` never cleared the one-shot `reported` flag, so "I pressed Retry
  four times and it never came back" was indistinguishable from "it failed once" — and the retry pill,
  the card's primary affordance, had no measurable effect. Reporting is now once per *attempt*, capped
  at `MAX_MAP_FAILURE_REPORTS = 3` per compose session so a retry loop on a metered 2G link does not
  become an upload loop.

> **Expect a new issue fingerprint.** The constant message means recurrences group under a new
> `compose-map-not-loaded` issue rather than continuing `LYNIA-MOBILE-1`; the old one can be resolved.
> Triage the new one by `map_load_signal`: `onMapLoaded` = a real Android tile/authorization failure
> (`MOB-MAP-02`, ops); `onMapReady` = the map never initialised at all, which is a different bug.

### 1.5 Tests

`src/logic/__tests__/map-load-signal.test.ts` (new) pins the per-platform contract against the upstream
JSDoc. `compose-map-failure.test.tsx` gains an injected signal — the existing Android assertions keep
their meaning, and a new block covers the iOS regression, the retained pin hint, a map that never
initialises at all (still caught), `PROVIDER_GOOGLE` forward-compatibility, the tag payload, and the
retry/cap behaviour.

**Proved by mutation** (per the 2026-08-17 test-quality convention): reverting `considerLoaded` to the
pre-fix `mapLoaded` fails exactly the two iOS assertions — "does not accuse a working map when
onMapReady is the only event the platform emits" and "keeps the pin hint" — while every Android
assertion stays green, which is the correct blast radius.

---

## 2. `AssertionError` (`com.facebook.infer.annotation`) — NOT fixed; made diagnosable

**Be clear about the status: this crash is not resolved.** The discriminating stack frame is not in the
repo and was not available to this triage, and no honest fix can be written without it. What follows is
what the codebase *does* settle, what it rules out, and the one change made so the next occurrence
answers the question.

### 2.1 What is established from the repo

| Finding | Evidence |
|---|---|
| **New Architecture (Fabric) is OFF** — this is an old-architecture (Paper) crash | `newArchEnabled` appears nowhere in the repo; `@expo/config-plugins@9.0.17` `BuildProperties.js:58` defaults it to `false`, and `expo-template-bare-minimum@52.0.46` ships `newArchEnabled=false`. Corroborated by `app/send.tsx:46` calling `UIManager.setLayoutAnimationEnabledExperimental(true)`, which is meaningful only under Paper. |
| **The thrower is not react-native-maps** | `react-native-maps@1.18.4`'s `android/` tree contains no `com.facebook.infer.annotation` import and no `Assertions.` call at all. It can be the view being torn down, but not the frame that threw. |
| **It is not `NativeViewHierarchyManager`** | That class throws `IllegalViewOperationException` / `NoSuchNativeViewException` and uses `SoftAssertions` — never `Assertions.assertNotNull`. The widely-cited "Trying to resolve view with tag …" crash is a different exception type; chasing it would waste the next occurrence. |
| **It is the one-argument `assertNotNull(T)` overload** | The two-argument form throws *with* a message; Sentry reports "(No error message)". A real narrowing constraint. |
| **This crash class is undocumented** | No hit for `AssertionError`, `assertNotNull`, `infer.annotation`, `resolveView`, or `SurfaceMountingManager` anywhere in `docs/`, including `KNOWN_BUGS.md`. |

Leading candidates under Paper, from RN 0.76.9 source, all bare `assertNotNull`: the **bridge-teardown
family** (`BridgeReactContext.java:142` `getCatalystInstance`, `ReactContext.java:367+` queue-thread
getters) — reached when a long-lived native callback fires after context teardown, and this app has
several (`expo-location` `watchPositionAsync`, the background location task, `expo-notifications`); and
the **child-management family** (`UIImplementation.java:358–380` `manageChildren`) — the Paper
add/remove path that a `key` change on a native view and a `Modal` teardown both traverse.

### 2.2 Why `/send` is the screen worth suspecting

Three things coexist there, all confirmed in code:

- `ComposeMap.tsx` remounts a native `MapView` by changing its `key` (`key={mapNonce}`) — **the only
  `key`-driven native-view remount in the app** — and that path is reachable *only after* the
  `compose-map-not-loaded` condition §1 reports. The two Sentry issues are linked by construction.
- `send.tsx:46` arms `LayoutAnimation` **process-globally at module scope**, and `app/(tabs)/home.tsx`
  prewarms that module at launcher idle — so the opt-in is live before `/send` is ever opened.
  `configureNext` applies to the next UIManager batch, whatever is in it.
- `AddressConfirmSheet` renders a **second** `MapView` inside a `Modal`, so confirming a searched
  address briefly puts two live Google maps on screen, one in a separate Android window, and tears one
  down in the same batch as a multi-field parent state update.

This is a hypothesis about *where to look*, not a diagnosis. The 35-minute gap between the two events
mildly disfavours a same-commit remount race and mildly favours the teardown family; both stay open.

### 2.3 What changed

Nothing that claims to fix the crash. One thing that makes the leading hypothesis falsifiable:

- **`addBreadcrumb` added to `src/telemetry/sentry.ts`, and emitted from `retryMap`** as
  `compose-map-retry` with the attempt number. Before this the app set **no tag, no user, no context and
  no breadcrumb anywhere** — a native crash arrived with literally nothing to reconstruct it from.
  Breadcrumbs upload only if an event is later sent, so this costs nothing on a metered link, and it is
  deliberately *not* subject to the §1.4 report cap: the retry past the cap is exactly the one worth
  having on the trail if the process dies right after it.

### 2.4 What would settle it — three reads off the next event

1. **The frame directly below `Assertions.assertNotNull`.** It discriminates between every candidate
   above. R8 mapping upload is enabled (`app.config.ts:158`), so it should deobfuscate.
2. **The thread name.** `main` ⇒ the UI/view-hierarchy family; `mqt_native_modules` ⇒ the
   bridge/queue-thread family. A clean binary split.
3. **`app.in_foreground` on the event.** Backgrounded implicates teardown; foregrounded implicates the
   mount/unmount path — and a `compose-map-retry` breadcrumb immediately before it would now say so.

**Deliberately not done:** `attachViewHierarchy` / `attachScreenshot` in `initSentry` would be the most
useful attachments for a view-hierarchy assertion, but both add real payload to every error event and
this app targets metered 2G/3G (the same reason `tracesSampleRate` defaults to 0). That is an owner
call, not a silent flip — recommended as a temporary measure while this crash is being chased.

---

## 3. Not addressed here

- **`MOB-MAP-02`** — the Android Maps key not being accepted by the installed build — is unchanged and
  remains an ops/GCP item (Play App Signing SHA-1 vs. the key's restriction list, Maps SDK enablement,
  billing). §1 makes it *reportable*; it does not make it fixable from this repo, and no OTA can carry a
  native key (`REL-01`).
- **`app/rider/(tabs)/__tests__/index.test.tsx`** timed out once at 5 s under full-suite parallel load
  and passed on re-run (161 suites / 1210 tests green) and in isolation (25/25). Load-sensitive flake,
  untouched by this change, recorded here rather than silently ignored.
