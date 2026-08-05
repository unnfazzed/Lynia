# UI kit vs shipped app — address/compose audit (2026-08-05)

**Trigger:** the installed Android build still asks the customer to drop **pins** for pickup and
drop-off, even though the address rows render a **search** magnifier and the shared UI kit specifies a
search-first flow.

**Scope of comparison:** `packages/design/` (the in-repo copy of the kit — same file path as the shared
link, `explorations/journey/All Screens Gallery.html`) against `apps/mobile/`.

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

The rest of the app (food, one-app rider board, money/gate, trust & safety, auction) tracks the kit
well (§5). This is a localized regression in one flow, not general staleness.

---

## 2. Why the shipped app shows pins and no search

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

---

## 5. What already matches the kit

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
