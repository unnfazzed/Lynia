# UI kit vs shipped app — full journey audit (2026-08-05)

**Trigger:** the installed Android build still asks the customer to drop **pins** for pickup and
drop-off, even though the address rows render a **search** magnifier and the shared UI kit specifies a
search-first flow. §1–4 diagnose that flow; §5 extends the review to every journey flow; §6 records the
adoption work.

**Scope of comparison:** `packages/design/` (the in-repo copy of the kit — same file path as the shared
link, `explorations/journey/All Screens Gallery.html`) against `apps/mobile/`, `apps/merchant/` and
`apps/admin/`.

> **Caveat on the source of truth.** This audit reads the kit **vendored in this repo**. The hosted
> claude.ai Design project could not be opened from this session (`DesignSync` requires an interactive
> `/design-login`; `WebFetch` returns 403 on `claude.ai/design/p/…`). If that project has been edited
> since the last sync into `packages/design/`, those edits are **not** covered here and would be
> additional deltas. Re-run this audit from an interactive session to close that gap.

---

## 1. Verdict

The search-first flow **is implemented in code** — but it ships **invisible**, and what does exist is a
**flattened, one-screen variant** of the three-screen flow the kit specifies. Two independent problems
stack:

1. **A provisioning gap makes the search UI render nothing at all** in store builds (§2).
2. **A design-fidelity gap** — the kit's dedicated `addr_search` and `addr_map_confirm` screens were
   never built; their content was compressed into a floating field on the composer (§3).

The app-wide review (§5) extends this to every journey flow. Headline: **foundations are in full
parity** (colour, spacing, radius, targets, type — token for token), and the food, rider, merchant and
admin surfaces track the kit closely. The gaps are flow-level, not a restyle — and three of them share
one shape: **shipped UI advertising a capability the build doesn't have** (§5.6).

§6 records what has been adopted in this PR and what remains.

---

## 2. Why the shipped app shows pins and no search

### 2.0 Confirmed on device — Maps is keyed, Places is not

A side-by-side of the kit's `home_empty` ("Send composer · no address") against a photo of the
installed Android build settles the root cause:

| Observation on the device | What it proves |
|---|---|
| **Google map tiles for Harare render**, with the Google logo attribution baked into the tile surface | The **Maps** key (`GOOGLE_MAPS_API_KEY`) *is* provisioned — `react-native-maps` is working |
| **No search field appears anywhere** between the address rows and the sheet | The **Places** key (`EXPO_PUBLIC_GOOGLE_PLACES_KEY`) is *not* provisioned. `AddressSearch` returned `null` |
| The kit's hint line **"Search an address, or tap the map to drop a pin."** is **absent** | The one piece of copy that told the customer search exists never shipped |
| Both address rows still show the **search magnifier** | The UI keeps promising search with nothing behind it |

The two keys are separate variables, and only one of them is in `.env.example` (line 86,
`GOOGLE_MAPS_API_KEY`). That asymmetry is visible on the device: a fully working map, and a
search path that renders nothing. This is §2.1 caught in the act.

---

Three findings, in the order they bite.

### 2.1 The search UI is key-gated and the key is never provisioned for EAS builds — **P0**

`AddressSearch` renders **nothing** when no Places key is configured:

- `apps/mobile/src/ui/AddressSearch.tsx:108` — `if (!placesEnabled()) return null;`
- `apps/mobile/src/config.ts:47-48` — the key is read from `EXPO_PUBLIC_GOOGLE_PLACES_KEY`, falling
  back to `extra.googlePlacesKey`.

That fallback is fed by `apps/mobile/app.config.ts:245`, which itself reads the same env var. So the
**only** source is a build-time environment variable. Where it is (and isn't) set:

| Path | Provides the key? |
|---|---|
| `.github/workflows/mobile-ota.yml:51` (OTA export) | ✅ from a GitHub secret |
| `apps/mobile/eas.json` (`preview` / `production` builds) | ❌ — declares `environment: preview/production` only; no `env` block. The value must exist in the **EAS server-side environment**, which nothing in this repo sets or asserts |
| `.env.example` | ❌ — lists `GOOGLE_MAPS_API_KEY` (line 86) but **not** `EXPO_PUBLIC_GOOGLE_PLACES_KEY` |
| `docs/LAUNCH-EXECUTION-RUNBOOK.md`, `LAUNCH-READINESS.md`, `PLAY-STORE-SUBMISSION.md` | ❌ — no provisioning step |

**Consequence:** unless someone set the variable by hand in the EAS dashboard, every store build has
`placesEnabled() === false`, `AddressSearch` returns `null`, and the customer is left with the
pin-on-map path — exactly the reported symptom. The degradation is **silent by design**: the component
is documented to hide itself so an unkeyed build still runs.

### 2.2 The documented key restriction breaks the REST endpoints the app actually calls — **P1**

`docs/SECURITY-OPS.md:43-45` instructs restricting the key to the Android package name + SHA-1 signing
cert. But `apps/mobile/src/api/places.ts` calls the **legacy Places web-service REST endpoints**:

- `https://maps.googleapis.com/maps/api/place/autocomplete/json`
- `https://maps.googleapis.com/maps/api/place/details/json`

Google's web-service APIs do **not** honour Android/iOS application restrictions — those apply to the
Maps/Places **SDKs**. A key restricted per the runbook returns `REQUEST_DENIED` for every autocomplete
call. `getJson` swallows non-OK responses (`return null`), `mapPredictions` then yields `[]`, and the
search box renders but stays **permanently empty with no error**.

So there are two distinct "looks broken" states: no key → **no search box**; app-restricted key →
**search box that never returns results**. Both read to a user as "the app still uses pins".

### 2.3 Nothing tests either path — **P1**

`apps/mobile/app/__tests__/send.test.tsx:110-114` mocks `AddressSearch` out wholesale, substituting a
`<Text>AddressSearch</Text>` stub. No test exercises `placesEnabled()` true or false. A build that
ships zero search UI passes CI green.

---

## 3. Structural deltas: kit vs shipped

The kit specifies a **three-step routed flow** (gallery ids `addr_search`, `addr_map_confirm`;
implementations at `packages/design/ui_kits/mobile/app.js:1236` and `:1286`, wired at `:470-495`):

```
composer row tap  →  full-screen Address search  →  Confirm pin on map  →  back to composer
```

Shipped `apps/mobile/app/send.tsx` implements a **single-screen inline** variant. Tapping an address
row only flips which pin the map edits (`src/ui/MapHome.tsx`, `AddressRow.onPress → props.onPick`); a
compact search field floats over the map at `send.tsx:675-679`.

### 3.1 Element-by-element

| Kit element | Shipped | Evidence |
|---|---|---|
| Dedicated `addr_search` screen: back arrow, "Set pickup"/"Set drop-off" title, slot dot, **autofocused** field | ✗ — inline field over the map; no route, no autofocus | no `app/address*` route exists |
| **"Use my current location"** row inside the search list, for **both** slots | ⚠ — floating map button only, and **pickup-only** | `ComposeMap.tsx:196` gates on `active === "pickup"`; drop-off has no location shortcut |
| **"Set the pin on the map"** row — explicit escape hatch from search back to the map | ✗ | kit `app.js:1270` (`onSetOnMap`) |
| SAVED (Home / Work slots) | ✅ | `AddressSearch.tsx:336-369` |
| RECENTS | ✅ (plus a star-to-promote affordance **not** in the kit) | `AddressSearch.tsx:371-403` |
| RESULTS list, two-line primary/secondary rows | ✅ | `AddressSearch.tsx:300-330` |
| **"Powered by Google" attribution footer** | ✗ — absent everywhere in the app | kit `app.js:1277`; Places ToS requires attribution when results display off a Google map |
| `addr_map_confirm` screen: draggable centre pin, **"Drag to adjust"** tooltip, resolved address (primary + secondary), **"Exact point set — syncs to Google Maps so your rider gets turn-by-turn"** reassurance, inline Landmark field, **"Confirm drop-off"** CTA | ✗ — **the entire screen is absent** | kit `app.js:1286-1320` |
| Landmark captured **at confirm time**, in context, one field | ⚠ — demoted to a collapsed "Landmarks & details" section further down the composer | `send.tsx:784` |
| Composer hint: **"Search an address, or tap the map to drop a pin."** | ✗ — replaced by **"Tap the map to drop your pickup pin."** | kit `screens.jsx:88` vs `ComposeMap.tsx:240` |
| Address rows live **inside the sheet**, above "What are you sending?" | ✗ — rows float **over the map**, above the sheet | kit `screens.jsx:174` vs `send.tsx:671` |
| Row trailing icon: `pencil` when filled / `search` when empty | ⚠ — `map-pin` when filled / `search` when empty | kit `screens.jsx:76` vs `MapHome.tsx:120` |
| Pin-discoverability tooltip: **dark high-contrast pill**, white text, centred over the map | ⚠ — low-contrast **light pill** with muted grey text, so the one remaining instruction is the faintest thing on screen | kit `screens.jsx:167` (`background: var(--ink)`, `color: #fff`) vs `ComposeMap.tsx:233-241` (`tokens.color.bg` + `tokens.color.muted`) |
| Footer "what's still missing" hint: one line — *"Add pickup & drop-off pins, an item, a price and both phones to broadcast."* | ⚠ — expanded to a four-line wall that names a collapsed section inline: *"…a pickup contact phone, a recipient phone, pickup & drop-off landmarks (under "Landmarks & details"), a price to send."* | kit `screens.jsx:171` vs `send.tsx:694-706` |
| Primary CTA copy: **"Broadcast request"** | **"Send to riders"** | kit `screens.jsx:173` vs `send.tsx:733` |
| Top bar: brand pill + **one** round action (account) | brand pill + **two** (notifications, account) — an addition, not a regression; notifications is a real screen in the kit | kit `screens.jsx:152-160` vs `MapHome.tsx:32-35` |
| Customer live-tracking **"Follow route in Google Maps"** row | ✗ on customer; ✅ on rider only | kit `app.js` `GMapsRow`; `HANDOFF.md:157`; shipped only at `src/ui/rider/JobDetailsCard.tsx:115` |

### 3.2 The specific mismatch reported

An **empty** address row renders a `search` magnifier (`MapHome.tsx:120`), but pressing it does not
open a search — it only changes which pin the map edits. Combined with §2.1 (no search field renders
at all in an unkeyed build) and the onboarding hint that says *"Tap the map to drop your pickup pin"*,
the shipped UI **promises search and delivers pins**. That is the reported defect, and it is a real
one, independent of the key.

---

## 4. Recommended fixes, in priority order

| # | Fix | Effort |
|---|---|---|
| 1 | Provision `EXPO_PUBLIC_GOOGLE_PLACES_KEY` in the EAS `production` + `preview` environments; add it to `.env.example` and to the launch runbook's pre-build checklist | XS |
| 2 | Correct `docs/SECURITY-OPS.md` §B: the web-service key needs **API restrictions + quota cap** (app restrictions are incompatible with the REST endpoints this app calls). Either keep a separate unrestricted-but-quota-capped key, or migrate `src/api/places.ts` to the Places SDK so app restrictions apply | XS (doc) / M (migration) |
| 3 | Make the empty-state row honest: either open a search when tapped, or drop the magnifier and show the pin icon. A `search` icon that only toggles a pin is the core UX lie | S |
| 4 | Add a keyless fallback state — when `placesEnabled()` is false, render a disabled field or an explicit "Search unavailable — set it on the map" line instead of `null`, so a mis-provisioned build is visible rather than silent | S |
| 5 | Test both paths: assert the search renders when keyed and that the keyless path degrades to the pin picker with a visible hint. Stop mocking `AddressSearch` in `send.test.tsx` | S |
| 6 | Build the kit's `addr_map_confirm` screen (drag-to-adjust + confirm + in-context landmark). This is the largest remaining fidelity gap and it's where the kit captures the landmark the contract requires | M |
| 7 | Add the "Powered by Google" attribution footer under autocomplete results (ToS compliance) | XS |
| 8 | Extend "Use my current location" to the drop-off slot, and surface it inside the search list as the kit specifies | S |
| 9 | Add the customer-side "Follow route in Google Maps" row on live tracking | S |
| 10 | Restore the composer hint to name **both** inputs: "Search an address, or tap the map to drop a pin." | XS |
| 11 | Restore the tooltip's dark high-contrast treatment — with search gone, it is the only instruction on screen and it currently renders as muted grey on white | XS |
| 12 | Cut the footer "what's missing" hint back toward the kit's single line; a four-line list that cites a collapsed section by name is harder to act on than the short form | XS |

---

## 5. App-wide review — all journey flows

Extended from the address flow to every surface. Method: the kit's own screen registries
(`window.LJ` / `RC` / `RJ` / `RJM` / `RR` in `explorations/`, plus the admin list in `gallery.jsx`)
enumerated and checked against shipped routes, components and states.

### 5.1 Foundations — ✅ full parity

Checked token-for-token; no drift found. This is why the app *reads* like the kit even where flows
diverge, and it means adoption work is flow-level, not a restyle.

| Foundation | Kit | Shipped | |
|---|---|---|---|
| Colour palette | `tokens/colors.css` | `packages/shared/src/design-tokens.ts` | ✅ identical hexes, incl. the `--cta-fill` / `accent` split |
| Primary CTA fill | `--action-primary` = `#00812F`, never raw accent | `Button` uses `tokens.color.cta` / `ctaPressed` | ✅ sunlight-contrast decision honoured |
| Spacing (8pt) + screen edge 16px | `tokens/spacing.css` | `space` | ✅ |
| Radius (input 12 / card 16 / pill) | `tokens/spacing.css` | `radius` | ✅ |
| Touch targets 44 / 52 | `--target-min` / `--target-primary` | `touchTargetMin` / `touchTargetPrimary` | ✅ |
| Typeface (Inter + Fredoka wordmark) | `tokens/fonts.css` | `font` | ✅ |

Raw `accent` still appears as a *fill* in seven places (brand header, splash, force-update, live dots,
celebrate). All are non-text graphics, which is exactly what the token comment reserves it for. ✅

### 5.2 Customer · parcel (kit `LJ`, 57 states)

Near-complete. Auction (finding / live / race / counter / expired / no-riders), tracking (code /
active / paused / dark), terminals (rider-cancelled, undelivered, cancel-with-reason, cancelled,
rate, completed), OTP edge states, on-hold, force-update, and the full trust & safety set (SOS idle /
confirm / contacts / offline-log-failed, report + block, trip help) are all shipped. The post-pickup
cancel even carries the kit's hand-back warning (`order/[id].tsx:1131`).

Gaps:

| Kit screen | Status | Fix |
|---|---|---|
| `addr_search` | ⚠ flattened into an inline field (§3) | §4 items 1–5, 8 — **done this PR** |
| `addr_map_confirm` | ❌ not built | §4 item 6 — **remaining** |
| Customer `GMapsRow` on live tracking | ❌ rider-only | §4 item 9 — **remaining** |

### 5.3 Customer · food (kit `RC`, 46 states)

The strongest-adopted area. The whole kitchen-confirm money handshake is shipped verbatim —
`await_accept`, `confirm_call`, `pay_push`, `pay_now`, `pay_wait`, `pay_manual` (the D-24 manual rail),
`pay_confirmed`, `pay_open` (still-unpaid reminder), `pay_failed` — plus cart edge states (sold out,
price changed, empty, under-minimum, small-order fee), offline-mid-checkout, prep countdown, and the
doorstep cash handshake.

Gaps:

| Kit screen | Status | Fix |
|---|---|---|
| `menu_closed` / `list_empty` — **"Remind/Notify me when they open"** | ❌ the closed and empty states ship without any notify-me affordance | Add a remind-me action; needs a small backend hook (subscribe to a restaurant's reopen) |
| `closed_interrupt` — "Keep my cart for tomorrow" | ⚠ shipped as "See other restaurants" / "Keep browsing"; the cart *is* preserved and the copy says so, but the kit's explicit save-for-later action isn't offered | Copy + one action — cheap |

### 5.4 Rider (kit `RJ` 69 + `RJM` 12 + `RR` 19)

KYC (intro → form → photo capture/preview/upload → pending → verified/failed/expired), the gate set
(out-of-area, cooldown, banned, KYC-locked), offers, active job, delivery OTP with lockout, bail,
undelivered, the merged Money tab and top-up gate, and rider-side safety are all shipped.

Gap — and it's the biggest one after addressing:

| Kit screen | Status | Fix |
|---|---|---|
| `RJM board` — **"one board", parcels and food in a single tagged list** | ⚠ **the copy ships, the behaviour doesn't.** `app/rider/(tabs)/index.tsx:730` tells the rider *"You're online — parcels and food orders arrive live, one queue"*, but food jobs are gated behind `merchantDispatchAutoEnabled`, which is dormant; today only a `food_offer` notification is pushed (`index.tsx:86-89`) | Either land the rider-facing food feed, or make the copy honest until it lands. **Same class of defect as the address rows: shipped UI promising a capability the build doesn't have.** |

### 5.5 Merchant & admin

- **Admin** — ✅ complete and ahead of the kit. All seven kit pages (overview, orders, riders,
  customers, cash, KYC, issues) plus `sos/` and a `merchants/` section the kit doesn't cover.
- **Merchant** — ✅ queue, menu, hours, shop, statement, login. Maps onto the kit's kitchen-tablet set.

### 5.6 The pattern worth naming

Three defects share one shape: **shipped UI advertises a capability the build doesn't actually have.**
The address rows' search magnifier with no search (§3.2), the rider board's "parcels and food, one
queue" with no food jobs (§5.4), and — the root of the first — a key-gated feature that degrades to
*invisible* rather than to *explained* (§2.1). Fix #4 in §4 is the general remedy: when a capability is
gated off, say so on screen. A silent `null` is how all three shipped unnoticed.

---

## 6. Adoption status

**Landed in this PR** — the search-first flow now behaves like the kit within the one-screen composer:

- `AddressSearch` no longer returns `null` when unkeyed. It renders a visible disabled field —
  *"Address search is unavailable — tap the map to set this pin."* A mis-provisioned build is now
  obvious on screen instead of silently degrading to pins.
- **Tapping an address row focuses that slot's search** (`focusSignal`). The magnifier on the row is a
  real affordance for the first time; the kit routes it to a search screen, this is the one-screen
  equivalent.
- The kit's caption is restored under the rows — *"Search an address, or tap the map to drop a pin."*
  (`AddressHint`), naming only the inputs that are actually live.
- The pin tooltip is back to the kit's **dark high-contrast pill** (ink fill, white label) and names
  both inputs when search is available.
- **"Use my location" now works for drop-off too**, not just pickup — the kit offers it for both roles.
- **"Powered by Google"** attribution renders with autocomplete results (Places ToS).
- `.env.example` documents `EXPO_PUBLIC_GOOGLE_PLACES_KEY` and its EAS-environment requirement.
- `docs/SECURITY-OPS.md` §B rewritten: the two keys take different restrictions, and an Android-app
  restriction on the Places **web-service** key returns `REQUEST_DENIED` on every call.
- Regression test (`src/ui/__tests__/address-search.test.tsx`) pinning both halves of the key gate.

**Still required — the one thing code cannot do:** provision `EXPO_PUBLIC_GOOGLE_PLACES_KEY` in the EAS
`production` and `preview` environments. Until that is set, the app now *says* search is unavailable
rather than pretending it never existed — but there is still no search.

**Next tranche, in priority order:**

1. Rider board: land the food feed or make the "one queue" copy honest (§5.4) — same defect class, and
   it's currently misleading riders about their earnings.
2. `addr_map_confirm` — the routed drag-to-adjust confirm screen, with landmark capture in context
   (§4 item 6). Largest remaining fidelity gap in the parcel flow.
3. Food "remind me when they open" (§5.3).
4. Customer-side "Follow route in Google Maps" on live tracking (§4 item 9).
5. Footer "what's missing" hint back toward the kit's single line (§4 item 12).

---

## 7. What already matches the kit

Checked and consistent — no action needed:

- **Food journey** — list, search, menu, item sheet, cart, checkout (cash + wallet), the kitchen
  confirm/pay handshake, prep countdown, doorstep hand-off (`apps/mobile/src/ui/food/`, `app/food/`).
- **One-app rider** — merged board, parcel/food offers, active job, delivery code, Money tab and
  top-up gate (`app/rider/`, `src/ui/rider/`).
- **Trust & safety** — SOS, report + block, get-help-with-this-order (`src/ui/safety.tsx`).
- **Parcel commit** — auction, counter-offer review, pre-broadcast liability disclaimer
  (`src/ui/order/`, `src/ui/home/DisclaimerSheet.tsx`).
- **Address search internals** — SAVED/RECENTS shortcuts, session tokens, debounce, race-guarded
  requests, and graceful network degradation are all faithful to the kit and well built. The problem
  is that this code never reaches the user, not that it is wrong.
