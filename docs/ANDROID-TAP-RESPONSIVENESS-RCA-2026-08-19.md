# Android tap responsiveness — root-cause analysis (2026-08-19)

**Owner report (2026-08-19):** *"Review the android app responsiveness. I noticed if I click a button
it takes time to respond."*

This is a different question from `docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md`, which analysed how
long a screen takes to **load** once it is on its way. This analyses the earlier segment: the gap
between the finger landing on a control and the app **acknowledging** it. Each finding names the
mechanism, the evidence in the repo, and the delivery lane.

**Status: findings 1, 2, 4, 5(part), 7(part), 9, 10 and 11 are IMPLEMENTED — see §5.** The owner
removed the OTA constraint on 2026-08-19 ("we are not doing OTA builds"), so the lane column below
records how each fix would have shipped rather than gating it. Finding 3 (the New Architecture) is
deliberately NOT implemented; §5.3 says why and what it would take.

Prior art it builds on and does not re-litigate: `docs/PERFORMANCE.md`,
`docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md` (§1.3 cold-boot request burst, §5.1 signed-URL churn —
both still make the *action* slow after the tap), `docs/KNOWN_BUGS.md` (`MOB-BOOT-03`).

---

## 0. Summary — ranked by expected user-visible impact

A tap has two independent latencies, and they fail for different reasons:

* **Acknowledgement** — does the control visibly change on touch-down? (§1)
* **Completion** — how long until the action lands? (§2)

"Takes time to respond" is almost always the first one. A button that dims instantly and then takes
400 ms feels fast; a button that does nothing for 400 ms and then jumps feels broken. Today this app
loses the first one structurally.

| # | Root cause | Layer | Fix lane |
|---|---|---|---|
| 1 | **92 of 127 `<Pressable>`s have no press state at all** — nothing changes on touch-down | perception | OTA (JS) |
| 2 | **`android_ripple` is used nowhere** — 100% of press feedback is JS-thread work, so it is exactly as late as the JS thread is busy | perception | OTA (JS) |
| 3 | **New Architecture is off** (Paper + async bridge) — every touch and every press-state repaint crosses the bridge | architecture | store build |
| 4 | **First navigation to a route evaluates its module graph inside the tap handler** — fixed for `/send` only; `/order/[id]`, `/food/order/[orderId]`, `/food/checkout`, `/rider/job` still pay 19–44 modules + the Maps SDK | completion | OTA (JS) |
| 5 | **Every `<Text>` runs `StyleSheet.flatten` + 2 allocations per render** (the Inter patch) | render cost | OTA (JS) |
| 6 | **Zero `StyleSheet.create`, 1,333 inline style literals, 10 memoized components** — every render re-allocates every style, so the bridge diff always sees a change | render cost | OTA (JS) |
| 7 | **1-second `setInterval` → `setState` on 3 screens** re-renders whole subtrees once a second, competing with the tap (corrected down from 7 — see §2.3) | render cost | OTA (JS) |
| 8 | **`LiveMap` glides the rider marker on the JS thread** (`useNativeDriver: false`, 900 ms per GPS fix) | render cost | OTA (JS) |
| 9 | **Un-debounced SecureStore write on every cart mutation**, including every keystroke of the order note | native queue | OTA (JS) |
| 10 | **Unmemoized root `AuthContext` value** — invalidates every consumer app-wide on each provider render | hygiene | OTA (JS) |
| 11 | **Nothing measures tap latency** — RUM has 7 events, none of them tap→feedback or tap→next-frame | measurement | OTA (JS) |

Findings 1, 2, 4 and 11 are where I would spend the effort. 3 is the largest single lever and also the
only one that cannot be shipped by OTA.

---

## 1. Acknowledgement — why the tap looks ignored

### 1.1 Most controls have no press state (the dominant cause)

Counted across `apps/mobile/src` + `apps/mobile/app` (excluding tests): **127 `<Pressable>` call
sites, 35 of which render a press state — 92 do not.** A bare `Pressable` renders a byte-identical
frame on `ACTION_DOWN`, so *all* of the action's latency reads as "the button didn't work". This is
why the complaint is about buttons generally rather than one slow screen.

Hotspots, by count of bare `Pressable`s in the file:

| File | Bare | What the user is tapping |
|---|---|---|
| `src/ui/shell/TabBar.tsx` | 1 (rendered once per tab) | **every root tab switch, customer and rider** |
| `src/ui/safety.tsx` | 5 | SOS / safety sheet controls |
| `src/ui/home/HomeHeader.tsx` | 4 | search field, bell, address row — the top of Home |
| `src/ui/rider/JobDetailsCard.tsx` | 4 | rider job actions |
| `app/rider/food-job.tsx` | 4 | rider food-job actions |
| `src/ui/AddressSearch.tsx` | 3 | suggestion rows in the send flow |
| `src/ui/shell/BrandHeader.tsx` | 3 | header actions |
| `app/food/cart.tsx`, `app/food/index.tsx` | 3 each | cart rows, restaurant list rows |

`src/ui/shell/TabBar.tsx:56-63` is the clearest case: `style` is a **static object**, so switching tabs
shows nothing at all until the destination screen commits.

The primitives that *do* have a press state are good models — `Button` (`src/ui/index.tsx:268`,
`cta → ctaPressed`) and `ServiceTiles` (`src/ui/shell/ServiceTiles.tsx:89`, scale 0.97 per the mock).

### 1.2 `android_ripple` is disabled everywhere, so feedback is JS-thread work

There is exactly one `android_ripple` in the codebase and it is `android_ripple={null}`
(`src/ui/shell/ServiceTiles.tsx:89`, deliberate — the mock draws scale-0.97, not a ripple).

That is a design decision I am not arguing with, but it has a performance consequence worth stating
explicitly, because it is the mechanism behind the whole complaint:

* **Android's `RippleDrawable` is drawn by the platform on the UI thread** the instant the touch is
  dispatched. It is *not* affected by what JavaScript is doing.
* **`Pressable`'s `pressed` state is React state.** The path is: touch → native → bridge → JS
  `setState` → React render → style recompute → bridge → native view update.

So every press indication in this app is queued behind whatever the JS thread is already doing. On an
idle screen that is a few milliseconds; on a screen mid-poll, mid-socket-push or mid-1s-clock-tick
(§2.3, §2.4) it is tens to hundreds. **This is the single biggest structural difference between how
this app feels and how a native Android app feels on the same handset**, and it is why the lag is
intermittent rather than constant.

The fix is not "add ripples" — it is that a JS-rendered press state needs the JS thread to be free,
which makes §2 load-bearing rather than optional, and that the 92 bare controls need *some* press
state. Where the mocks draw no press state at all, `android_ripple` is still the free option: it is
platform chrome, not drawn geometry, so it does not conflict with the parity rules in `CLAUDE.md`.

### 1.3 The app is running Paper (old architecture)

`newArchEnabled` appears **nowhere** — not in `app.config.ts`, not in the `expo-build-properties`
plugin block, not in any gradle config (there is no checked-in `android/` — this is a CNG project). On
Expo SDK 52 the flag defaults to `false` when absent, so the build runs the **old architecture**:
touch events are batched and serialised across the async bridge, and each press-state repaint is two
more crossings.

The repo already states this as fact elsewhere: `packages/shared/src/contracts.ts:538` notes that
"the Paper architecture exposes no compositor-presentation callback" when explaining why
`boot_home_paint` is a lower bound.

Fabric dispatches touches on the UI thread and removes this whole hop class. It is the largest single
lever available — and also the riskiest: it is a native change (new `runtimeVersion` fingerprint → a
store build, not an OTA), and `react-native-maps` is the app's most interop-sensitive dependency.
I would not move on this until §1.1/§1.2/§2.1 have shipped and §3's numbers exist to judge it by.

---

## 2. Completion — why the action itself takes time

### 2.1 First navigation to a route evaluates that route inside the tap handler

The repo already found and documented this mechanism, and already fixed it **for one route**.
`app/(tabs)/home.tsx:40-65` (`usePrewarmSendRoute`):

> *"a route's module graph is EVALUATED on the first navigation to it, not at launch … All of it used
> to be evaluated synchronously inside the tap handler, which is why the FIRST 'Send' tap of a session
> is the slow one and later taps are not."*

Every other route still pays it. Measured statically over `apps/mobile/app` — eager value imports only
(`import type` erased, lazy `require()` excluded), with the boot graph (`_layout.tsx` + `index.tsx`,
83 local modules) subtracted, so each row is what is genuinely *new* work on the tap:

| Route | New local modules on first tap | New heavy native deps |
|---|---|---|
| `app/food/order/[orderId].tsx` | **44** | react-native-maps, socket.io-client, expo-clipboard |
| `app/rider/food-job.tsx` | **39** | react-native-maps, socket.io-client |
| `app/rider/job.tsx` | **36** | expo-image-picker, expo-image-manipulator, react-native-maps, socket.io-client |
| `app/send.tsx` | 32 | react-native-maps — **already prewarmed (PERF-SEND-01)** |
| `app/order/[id].tsx` | **29** | react-native-maps, socket.io-client |
| `app/rider/(tabs)/index.tsx` | **24** | expo-web-browser, socket.io-client |
| `app/food/checkout.tsx` | **19** | react-native-maps |
| `app/(tabs)/home.tsx` | 18 | — |
| `app/food/[id].tsx` | 16 | — |
| `app/food/cart.tsx` | 13 | — |

`react-native-maps` alone is ~29 npm modules by the repo's own Metro measurement (`home.tsx:41-44`).
So **"Track order", "Place order" and the rider's "Open job" each pay roughly what "Send" used to pay
before PERF-SEND-01** — and unlike `/send`, nobody warms them.

This also explains a detail worth checking against the owner's experience: *the first tap of a session
on a given screen is slow, later taps to the same screen are not.* If that matches, this is the
dominant completion-side cause.

Everything below the top seven is small enough that prewarming it would not be worth the launcher's
idle time.

### 2.2 Every `<Text>` pays a flatten + two allocations, and no style is ever stable

Two findings that compound, and together make *any* re-render more expensive than it needs to be:

1. **`src/ui/fonts.ts:128-151`** patches `Text.render` and `TextInput.render` app-wide to inject the
   right Inter family. For every Text with a style (which is nearly all of them) that is a
   `StyleSheet.flatten` plus two fresh objects, **per Text, per render**. The patch itself is sound —
   it is what makes the weight-correct self-hosted font work without touching 1,300 call sites — but
   its cost scales with re-render frequency, which §2.3/§2.4 make high.
2. **There is not a single `StyleSheet.create` in the mobile app** — 1,333 inline `style={{…}}`
   literals, and only **10** `React.memo` components across 341 files. A fresh object every render
   means RN's shallow prop diff sees a change on every node and re-sends props across the bridge even
   when the rendered result is pixel-identical.

Neither is a bug on its own. Together they mean "a screen re-rendered" costs several times what it
should, and §2.3/§2.4 make screens re-render a lot.

### 2.3 Three screens re-render themselves once per second

> **Correction (same day, during implementation).** The first version of this section claimed
> *seven* screens and listed `app/rider/(tabs)/index.tsx:494,557`. Those two intervals are a **20 s**
> heartbeat and a **15 s** sent-offer sweep, not per-second — they were miscounted from a `setInterval`
> grep without reading the periods. Three of the remaining six sites are also already correctly
> scoped. The corrected finding is below and is materially smaller than first reported.

Six `setInterval(…, 1000)` sites drive component state. They split cleanly in two:

**Already correct — leaf-scoped by earlier work, and deliberately so:**

| Site | Why it is fine |
|---|---|
| `src/ui/rider/SentOfferCard.tsx:54` | the ticker lives INSIDE each card, and the rider board's own comment (`index.tsx:132`) records moving it there as a prior perf fix; it also stops the moment the auction resolves |
| `src/ui/order/AuctionClock.tsx:69` | same pattern, and its header cites SentOfferCard as the precedent |
| `src/ui/rider/TopUpFlow.tsx:91` | contained to the flow component |

**Screen-level — the real finding:**

| Site | Screen | Mitigation already present |
|---|---|---|
| `app/food/order/[orderId].tsx:105` | food order tracking | gated on `needsClock` — only ticks while a countdown is actually shown |
| `app/rider/food-job.tsx:441` | rider food job | gated on `needsClock` likewise |
| `app/verify.tsx:64` | OTP resend countdown | small screen; low impact |

Each tick on those three is a full unmemoized reconcile of a screen that (per §2.2) reallocates every
style and re-flattens every Text. If your tap lands inside that work, it waits for it. Both trackers
already gate the clock to the states that need it, which bounds the cost considerably.

`src/logic/use-now.ts` is **not** part of this — it defaults to 60 s and is used correctly.

### 2.4 The live map animates on the JS thread

`src/ui/LiveMap.tsx:123` glides the rider marker with
`AnimatedRegion.timing({ …, useNativeDriver: false })` over `GLIDE_MS = 900`. Region animation
genuinely cannot use the native driver, so this is a real constraint rather than an oversight, and the
file says so.

Scale check before anyone over-weights it: fixes arrive at `timeInterval: 10_000` /
`distanceInterval: 25` (`src/realtime/use-rider-location.ts:95`), so this is roughly a 900 ms JS-busy
window every ≥10 s **on the tracking screen only**. A real contributor there — stacked on top of that
screen's 1 s clock (§2.3) — not a whole-app cause.

`src/ui/BottomSheet.tsx:168` has the same shape: the default `translateY` path is native-driven, but
`heightMode` drops to `useNativeDriver: false`.

### 2.5 The cart writes to the Android keystore on every change

`src/food/cart-context.tsx:59-61`:

```ts
useEffect(() => {
  if (ready) void saveFoodCart(cart);
}, [cart, ready]);
```

`saveFoodCart` is `SecureStore.setItemAsync` (`src/net/food-cart-store.ts:13`) — an AndroidKeyStore
AES encryption plus a SharedPreferences write. It fires on **every** cart mutation: every `+`/`−` tap
on the quantity stepper, and **every keystroke of the order note** (`setOrderNote` writes to the same
state). It is fire-and-forget so it does not block the render, but it occupies the native-modules
thread that every other native call queues on. A debounce (~500 ms) or a move to plain AsyncStorage
(the cart is documented as PII-free) removes it.

### 2.6 Root context value is rebuilt on every render

`src/auth/auth-context.tsx:92` returns `value={{ session, loading, signIn, signOut }}` — a fresh
object literal, so every `AuthProvider` render invalidates the context for every consumer in the tree,
and `AuthProvider` wraps the entire app.

Being accurate about the size of this: `AuthProvider` only re-renders when `session` or `loading`
changes, so this is **not** a hot path today — it is hygiene, and a latent hazard if state is ever
added to that provider. `BootPhaseProvider` (`src/boot/boot-phase.tsx:38`) and `ToastProvider`
(`src/ui/Toast.tsx:141`) both memoize correctly; this is the odd one out.

---

## 3. The measurement gap — this is currently unfalsifiable

`ClientMetricEvent` (`packages/shared/src/contracts.ts:510-548`) has exactly seven events:
`position_glass`, `offer_glass`, `board_glass`, `apifetch`, `boot_paint`, `boot_home`,
`boot_home_paint`.

**None of them measures a tap.** The fleet can currently tell us how fast the server reaches the
glass and how long a cold start takes, but nothing about the segment the owner is actually reporting.
`docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md` §6 already listed `send_open_glass` as a gap; it was
never added, while `boot_home_paint` from the same table was.

Two events would close it, both fitting the existing batched-RUM shape and both OTA-able:

| Event | Measures | Catches |
|---|---|---|
| `tap_ack_ms` | `onPressIn` → the frame that paints the press state | §1 — JS-thread contention at press time |
| `nav_open_ms` | `onPress` → destination screen's first presented frame (same post-interaction technique as `boot_home_paint`, with the same lower-bound caveat) | §2.1 — first-tap route evaluation |

Without these, every fix below is judged by feel, and a regression is invisible until the owner
notices it again.

---

## 4. Recommended execution order

1. **OTA — press state on the 92 bare controls.** Cheapest change, biggest perceived win, no
   architectural risk. Do it in the primitives first (`TabBar`, `BrandHeader`, `AppBar`, `MenuRow`,
   `AccountRows`, the card rows) so most of the 92 are covered by a handful of edits. Where the mock
   draws a press state, use it; where it draws none, `android_ripple` is platform chrome and does not
   touch drawn geometry.
2. **OTA — the two RUM events (§3), shipped in the same batch as step 1** so there is a before/after.
3. **OTA — generalise `usePrewarmSendRoute` into a small prewarm registry** and warm the top routes
   from whichever screen links to them, during idle: `/order/[id]` + `/food/order/[orderId]` from
   Home/Orders, `/food/checkout` from the cart, `/rider/job` + `/rider/food-job` from the board. The
   mechanism is already written, tested and commented — this is applying it, not inventing it.
4. **OTA — trim the per-render cost:** `StyleSheet.create` in the primitives and the 1 s-clock
   screens; `React.memo` the clock components so a tick re-renders the clock, not the screen; debounce
   the cart persist (§2.5); memoize the auth context value (§2.6).
5. **Store build, only after 1–4 and with §3's numbers in hand — evaluate the New Architecture.**
   Native change, new fingerprint, no OTA rollback, and `react-native-maps` is the risk. Worth a
   spike, not a merge.

An owner check that would sharpen all of this in about a minute on the handset: **is the first tap
into a screen slow and later taps to the same screen fast?** If yes, §2.1 is the dominant
completion-side cause and step 3 moves up the list. If every tap feels equally slow, the cause is §1
and steps 1–2 are the whole answer.

---

## 5. What was implemented (2026-08-19)

Owner instruction, same day: *"we are not doing OTA builds. Proceed to implement the fixes and test
them."* Everything below is on branch `claude/android-button-responsiveness-ocymrf`.

### 5.1 Shipped

| # | Change | Where |
|---|---|---|
| 1, 2 | **`Tappable` — the one tappable primitive.** Every control now acknowledges the touch. On **Android the feedback is the platform ripple and nothing else**, so a press costs **zero JavaScript**: `RippleDrawable` paints on the UI thread from the touch event and cannot be delayed by a busy JS thread, whereas the `({ pressed })` style it replaces required a bridge hop, a `setState` and a re-render. Other platforms fall back to a pressed opacity. 92 call sites migrated. | `src/ui/Tappable.tsx` + 57 files |
| 1 | **Guardrail so it cannot rot.** A source scan fails CI if any `<Pressable>` carries neither a `pressed` style nor a real `android_ripple`, naming the exact file and line. Verified to fail on an injected regression before being kept. | `src/ui/__tests__/press-feedback-guardrail.test.ts` |
| 1 | **Codegen emits it too.** The mock→RN transpiler now wraps interactions in `Tappable`, and the structural checker treats it as transparent (it renders exactly one `Pressable` and adds no layout box) — so a regenerated view keeps its press feedback instead of silently reverting. | `tools/parity/codegen/{adopted,emit,normalize}.mjs` |
| 11 | **`tap_ack` + `nav_open` RUM events**, with tight frame-scale histogram buckets on the API. `tap_ack` measures JS-thread headroom at press time (`onPressIn` → next frame), sampled 1-in-4; `nav_open` pairs the last touch with the route change it caused, so redirects, deep links and socket-driven navigations never enter the histogram. | `packages/shared/src/contracts.ts`, `apps/api/src/observability/*`, `src/telemetry/{rum,tap-signal,nav-timing}` |
| 4 | **Route prewarm registry** — the generalisation of PERF-SEND-01, which warmed `/send` alone. Home now warms `send`+`order`+`foodOrder`, Orders warms both trackers, the cart warms `foodCheckout`, and the rider board warms both job screens — one route per interaction slot, so warming never hands the JS thread a single long block. | `src/boot/prewarm-routes.ts` + 4 screens |
| 9 | **Cart persistence debounced** (600 ms) with an unmount flush. A run of stepper taps, or a typed order note, was one AndroidKeyStore write *per keystroke*; it is now one write per burst. | `src/food/cart-context.tsx` |
| 10 | **Auth context value memoised**, with `signIn`/`signOut` stabilised so the memo actually holds. | `src/auth/auth-context.tsx` |
| 5, 7 | **Style hoisting in the tab bar** — on screen for the whole session and re-rendered on every route change. | `src/ui/shell/TabBar.tsx` |

Tests: **1392 mobile** (35 new) and **1786 API**, all green, plus `pnpm typecheck` and `pnpm lint`
across the workspace. The prewarm test found and fixed a real gap while it was being written: the
scheduled callback did not re-check the cancel flag, so a screen the user had already left could keep
evaluating route graphs.

### 5.2 Deliberately not done

- **The broad `StyleSheet.create` migration (§2.2).** 1,333 inline literals is a mechanical sweep of
  its own; done piecemeal alongside behavioural changes it is a large diff with real chance of a
  visual regression and no way to review it. The tab bar is converted as the pattern to follow.
- **Restructuring the two trackers' 1 s clocks (§2.3).** Both already gate the clock on `needsClock`,
  and `now` threads through five view components in a 1,000-line live-order screen. The rewiring risk
  outweighs a bounded once-per-second cost — especially now that a press costs no JS at all.
- **`LiveMap`'s JS-thread glide (§2.4).** Region animation genuinely cannot use the native driver;
  the only real fix is a different map-animation strategy, which is its own piece of work.

### 5.3 The New Architecture (finding 3) — still a spike, and here is why

Removing the OTA constraint removes one of the two reasons this was ranked last; the other stands.
`newArchEnabled` is a native flag: it changes the `runtimeVersion` fingerprint, cannot be rolled back
without another store build, and `react-native-maps` — the app's most interop-sensitive dependency, on
the send, tracking and rider screens — is the specific risk. **Nothing in this repo's CI can catch a
Fabric interop break**: there is no device lane, and the parity render lane runs react-native-web.
Flipping it here would mean shipping an unvalidated architecture change to internal testers on the
same build as eight validated fixes, and if the map broke there would be no way to tell which change
did it.

The honest sequencing is: land this PR, read `tap_ack`/`nav_open` from the fleet, then flip the flag
as its own build with `docs/QA-DEVICE-CHECKLIST.md` run on a handset — map render, marker glide,
address picker, sheet gestures. Happy to do that as the next PR on the owner's word.