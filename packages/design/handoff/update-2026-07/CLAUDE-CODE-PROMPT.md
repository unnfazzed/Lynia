# Claude Code — LyniaGo July 2026 update: new home, one rider app, restaurants vertical

Paste this into Claude Code with **unnfazzed/Lynia** connected, on the branch carrying the
refreshed `packages/design/`. Read `packages/design/handoff/update-2026-07/README.md` first for
the shape of the update and the suggested PR split.

---

## Context — what's already built, and what this is

The repo implements the **Send (parcel) product from the previous design handoff**: customer map
composer → auction → tracking → delivery code, the rider bid/job flow, safety flows, admin console.
**That implementation is correct — do not rebuild it.** This update layers three design changes on
top:

1. a new customer **home + IA** (the composer is demoted from root to the "Send" destination),
2. a **restructured rider app** (one board, one Money tab — several built screens are retired),
3. a net-new **Restaurants vertical** (customer food flow, rider food jobs, merchant kitchen tablet).

Tokens are unchanged. The accent rules from the previous handoff still bind: white-on-green fills =
`cta` #00812F; green text/icons = `accentText` #006630; bright `accent` #00B14F on non-text fills
only; selected states = `accentWash` bg + `accentText`; gold border/star only. Icons only from the
self-hosted subset `packages/design/assets/lynia-icons.js` — regenerate it before adding a name.

## The screen source of truth

`packages/design/explorations/journey/All Screens Gallery.html` — every current customer, rider and
merchant screen, journey-ordered, rendered live. Its map is `explorations/journey/gallery-map.js`;
tile ids there point into the renderer files:

- `screens.jsx` / `screens-safety.jsx` — Send customer (`window.LJ`)
- `rider-screens.jsx` / `-safety` / `-wallet` — rider, parcel-built (`window.RJ`)
- `rider-one-app.jsx` — the merged one-app rider surfaces (`window.RJM`) ← the new rider IA
- `../restaurants/r-customer-a.jsx`, `r-customer-b.jsx` — food customer (`window.RC`)
- `../restaurants/r-rider.jsx` — food rider (`window.RR`) · `r-merchant.jsx` — merchant (`window.RM`)

Flow context: `explorations/restaurants/Restaurants Journey Maps.html` (3 actors) and the two
journey maps in `explorations/journey/`. Preview everything before building (plain static HTML:
`npx serve packages/design`).

**A screen absent from the gallery is retired** even if the repo has it. Retired rider screens
(named in the `gallery-map.js` header): the old board/offline/online-empty, `offer_compose`,
`earnings` (weekly settlement), standalone `wallet`, `profile`, `gate_commission` — all replaced by
`RJM` equivalents. The old customer `home_launcher` intermediate is also retired: the home below IS
the app home.

---

## Workstream 1 — new customer home + IA (small, do first)

Reference: `RJM`-era home = gallery tile "Home · service tiles" (`RC home`), shipped-kit version at
`ui_kits/mobile/index.html` (root after login). Plan/record: `packages/design/HOME-2A-MERGE-PLAN.md`.

- Root after login = **launcher home**: green BrandHeader (full-bleed brand green — the sanctioned
  exception; white text/logo on it) + floating search → service tiles (Send · Food · Pharmacy
  "Soon" · More) → LiveOrderCard per running job (any service) → "Send again" reorder rail →
  "Restaurants near you" photo cards. Tab bar **Home | Orders | Account**.
- The existing map composer moves to the **Send** route unchanged — Send tile, search, and
  edit-order all land there; completing/cancelling returns to the launcher.
- **Orders is one list across services** (parcel + food share the history and the live-order card).
- Port the new primitives to RN, matching `packages/design/components/home/`:
  `BrandHeader`, `ServiceTiles`, `LiveOrderCard`, `ReorderRail`, `RestaurantCard`, `AppHome`
  (usage rules in `components/home/home.prompt.md`).
- Photo policy (readme + `home.prompt.md`): lazy-load, ~15–25KB thumbs, never block first paint,
  tinted-initial fallback on every photo surface. No stock photography — real merchant uploads only.

## Workstream 2 — one rider app (restructure)

Reference: `RIDER-ONE-APP-PLAN.md` + gallery category "Rider". Decisions are final (Jul 2026):

- **Tab bar: Jobs | Money | Account**, mirroring the customer shell. Rider root online board opens
  with the green BrandHeader variant (`showSearch=false`); inner screens keep white bars.
- **One board** (`RJM board`): parcels + food in a single list, each card tagged PARCEL / FOOD.
  Identical card anatomy: type icon, pickup → drop-off, distance, money line, one action
  ("Make an offer" / "Accept · 0:18"). Food offers pin to the top while their 60s timer runs;
  parcel broadcasts carry **no countdown** — a taken job simply disappears. One job at a time, no
  batching, no vertical opt-out (online = online for everything).
- **One active-job screen** (`RJM active_parcel` / `active_food`): the shared Stepper with
  per-type step lists; exception screens (wrong code, unreachable, dropped) written once, reused.
  The 6-digit delivery code closes both verticals.
- **One Money tab** (`RJM money`): prepaid commission balance (both services, same % per completed
  job, 0% at launch → 10% later, one server value `ratePct`), **cash-you're-holding split into
  "yours" vs "owed to a kitchen"**, one earnings ledger filterable Parcel / Food. Top-up gate
  (`RJM gate_topup`) replaces the commission gate; $2.00 floor, $5–$50 top-ups, EcoCash / InnBucks /
  O'mari rails.
- **Retire the weekly-settlement model everywhere** — rider Earnings screen, "owed weekly" copy, and
  the admin `cash.html` weekly-15% settlement page (align admin to the prepaid model).
- If the repo already contains the standalone wallet from `WALLET-CLAUDE-CODE-PROMPT.md`: keep its
  logic and top-up flow, but re-home the UI as the Money tab — one balance, no separate
  Earnings entry point.
- Notifications: one inbox; food offers use the looping alarm sound (they expire), parcel broadcasts
  a normal ping. One line format: "Parcel · Eastgate → Avenues · $3.00".

## Workstream 3 — restaurants vertical (net-new)

**Read `packages/design/RESTAURANTS-DECISIONS.md` in full before building.** It is the contract:
numbers N-01…N-23, decisions D-01…D-35, and the July revisions R-01…R-17 that changed the money
model late — the mockups already reflect the revisions. Highlights that are easy to get wrong:

- **Cash is collect-and-return by default (R-01).** The rider fronts nothing: takes the food
  against a recorded debt, collects the full amount at the door, keeps the delivery fee, rides the
  goods value straight back, and can take no new offers until the merchant confirms the returned
  cash. "Pay me upfront" survives only as a per-shop merchant setting (R-03); riders self-declare —
  **no float/headroom check exists anywhere** (R-10 deleted it).
- **The doorstep is a dual-confirm handshake, food first (R-04).** Customer taps "I gave $X", rider
  taps "I received $X", only then does the delivery code appear (masked `••• •••` during transit on
  CASH orders — R-09; offline press-and-hold reveal). A missing confirm within 2:00 freezes the trip
  and auto-calls support (R-05).
- **No payment clocks (R-16/R-17).** Mobile money is requested only after a logged phone call from
  the kitchen, confirmed by the merchant against their own statement **before cooking** (R-11); no
  payment window, no auto-cancel — end-of-day close is the only automatic exit (N-23). Prep time
  starts at payment confirm.
- **Rider sees PAID / NOT PAID everywhere (R-12).** 4-digit pickup code at the counter (N-16);
  6-digit delivery code unchanged. The return leg (failed delivery or cash return) is a real job
  with navigation, not a status change (D-15, R-01).
- **Tracker = the Express grammar re-labelled** (D-03): same 7-step component + a prep countdown
  ring. "Rider secured" is first-class for all three actors (D-04) — the merchant cooks only on it.
- **Every screen ships its five states** (D-19): default / loading (skeletons) / empty / error /
  offline. The gallery shows them as siblings — build them all.

Build order inside this workstream:
1. **Customer food flow** (same Expo app): list → menu → item sheet → cart (+ notes D-35) →
   checkout CASH/WALLET → kitchen-confirms band (call → pay → confirmed) → prep/track → handshake →
   code → rate. All exceptions in the gallery's "Exceptions & edge" act.
2. **Rider food jobs** (same app, rider role): offer variants (CASH collect / upfront / PAID),
   navigate → pickup code → to customer → doorstep handshake → return-cash leg + edge screens.
3. **Merchant kitchen tablet — new app** (`apps/merchant`, web, tablet-first 1024×680, degrades to
   phone). Sign-in unlocks the looping alarm (D-05: audio needs the login gesture; wake lock;
   reconnect discipline per §3 of the decisions doc). Queue → accept w/ prep chips → cook-signal
   screens → pickup confirm (count-and-acknowledge, D-06) → returned-cash count (N-21) → menu
   manager (categories D-29, photo-required dishes D-31, OOS D-10/N-14) → shop profile (D-30, cash
   rule R-03) → hours, weekly statement, end of day. Merchant phone numbers masked everywhere (D-17).

Interaction/persistence notes (alarm, reconnect, vibration, restart/offline tolerance) are in
`RESTAURANTS-DECISIONS.md` §3 — implement them as written.

## Do NOT silently implement — surface as PR-body checklists

- Open product questions: `RESTAURANTS-DECISIONS.md` §6 + the four questions at the end of §7
  (multi-drop debt limit, rider return-history visibility, count-confirm queue priority, 2:00
  handshake window) and `RIDER-ONE-APP-PLAN.md` "Inconsistencies" 2–4 where not already decided.
- The standing app-logic tickets from `packages/design/HANDOFF.md` (P0 contact phones, timeouts,
  409 rollback, OTP lockout, seam contracts C1–C9) — carry any still-open ones forward.

## Definition of done

1. `pnpm install && pnpm build` clean; `pnpm typecheck` and `pnpm lint` pass.
2. Customer root = launcher home; composer reachable only via Send; Orders spans services.
3. Rider app = Jobs | Money | Account; no Earnings/weekly-settlement remnants; retired screens gone.
4. Food flows match the gallery tiles state-for-state (incl. the five states per screen).
5. Merchant tablet runs the alarm/wake-lock/reconnect rules from §3.
6. Accent split holds everywhere (spot-check new food + merchant surfaces).
7. PR bodies carry the open-question checklists above as follow-ups, not silent decisions.
