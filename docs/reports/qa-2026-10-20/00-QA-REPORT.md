# QA report (report-only): mixed-lynia, 2026-10-20

> Copied from the gstack run directory `.gstack/qa-reports/run-20261020T105229Z/` (git-ignored). Screenshots are in
> `screenshots/`. The `exploration-NNN.json` checkpoints and `.qa-evidence` captures stay in that run directory and are not
> committed, so their links resolve only there.

- **Caller:** /qa-only (user-authorized, report-only; no product edits)
- **Branch / revision:** `claude/cool-curie-xnt15t` @ `330366e` (= main)
- **Mode:** Full, Standard tier (critical + high + medium; lows listed, not scored as blockers)
- **Targets:** customer web `http://localhost:8081` (expo web export, 360×720), merchant `http://localhost:3100`
  (Next dev, 360×720), admin `http://localhost:3200` (Next dev, 1440×900), API `http://localhost:3000` (NestJS `dist/main.js`)
- **Isolation:** all LOCAL. Docker Postgres/PostGIS + Redis, `pnpm db:seed` data, `OTP_CHANNEL=console KYC_PROVIDER=stub
  PAYMENT_RAIL=stub PUSH_PROVIDER=noop`. No production, no vendors. Synthetic `+26377xxxxxxx` identities; dev OTP codes
  come from the API's own `devCode` field / console sender (dev-only, synthetic accounts).
- **Browser driver:** gstack headless Chromium (`$B`); Aside not available on Linux.
- **Surface order:** functional (API + biker) ran in a parallel sub-agent with its own phones; browser surfaces sequential.
- **Overall status:** **inconclusive** per the evidence tool (browser roots carry no functional evidence rows by design;
  functional root has superseded harness captures and one inconclusive capture). Pass is not claimed.

## Charters

### Browser (clock: 900 s per surface)

| # | Contract | Risk | Entrypoint | Isolation | Exit |
|---|---|---|---|---|---|
| B1 | Customer web boots to Home, sign-in by OTP succeeds, Home renders services | Public users blocked at the door | `:8081/` | new phone `+263775550101` | Home visible after OTP, or blocked |
| B2 | Customer browse: Restaurants list → seeded merchant menu → add item → Review & place | Food ordering broken | Home → Restaurants | same | order placed or failure evidenced |
| B3 | Customer Send a parcel composer: 4 steps reachable, validation on empty fields | Core parcel flow | Home → Send | same | composer submits or blocks with copy |
| B4 | Orders tab / order screen / Notifications / Account render, no console errors | Dead tabs | tab bar | same | each tab visited |
| B5 | Merchant sign-in, board renders seeded orders, accept/advance an order | Merchants can't fulfil | `:3100/` | seeded merchant `+263773333333` | lifecycle step advanced |
| B6 | Merchant tabs (menu/shop front, money, settings) render | Dead pages | merchant tab bar | same | each tab visited |
| B7 | Admin console pages load with live API data (no demo fallback), links not broken | Ops blind | `:3200/` | admin JWT via `ADMIN_API_TOKEN` | all nav targets visited |

Expected for all: no uncaught console errors, no 4xx/5xx on same-origin links, mock copy renders, controls respond.

### Functional (no total timer; per-command timeouts 30 s)

| # | Contract | Risk | Entrypoint |
|---|---|---|---|
| F1 | Auth: OTP request/verify, refresh rotation, invalid code, missing/invalid JWT, wrong role | Account takeover / lockout |  `/auth/*` |
| F2 | Customer Send: create, invalid input rejection, idempotency replay, cancel, raise price | Double orders, junk orders | `/orders` |
| F3 | Biker loop: become → KYC stub → online → bid → select → stages → deliver → rate | Bikers can't earn | `/riders/*`, `/offers` |
| F4 | Wallet: top-up intent idempotency, admin credit, commission cover check | Money errors | `/wallet/*`, `/admin/*` |
| F5 | Merchant orders: list, accept, ready, handover; cross-merchant authz | Data leaks across merchants | `/merchant/*` |
| F6 | Admin authz: customer/biker JWT on admin routes refused | Privilege escalation | `/admin/*` |
| F7 | Concurrency: two bikers selected / double accept race on one order | Double assignment | `/offers/*` |

---

## Bottom line

**No Critical or High defects on any surface.** 3 Medium, 6 Low (+1 known), plus 2 dev-tooling gaps. The core money/auth/order
contracts (40 functional checks incl. races and 84 admin routes × 7 identities) all held. The Medium findings are
places where the UI tells the user or operator something that isn't true.

| Severity | Browser | Functional | Total |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 3 | 0 | 3 |
| Low | 4 | 2 (+1 known) | 6 |
| Dev tooling | 1 | 1 | 2 |
## Top 3 things to fix

1. **QA-B02:** Admin Overview says "Nothing needs you right now" while the same page's banner and the Live page show 5 orders past the time limit.
2. **QA-B01:** Customer "Notify me" on a coming-soon service shows "We'll let you know" but sends no request to the server.
3. **QA-B04:** Merchant "Keep searching" on a no-biker order sends no write and shows no change.

---

## Browser section

| Field | Value |
|---|---|
| Framework | Expo Router + react-native-web (customer); Next.js App Router dev (merchant, admin) |
| Probe budget / guarded command time | 900 s per surface (3 clocks) / not summed: per-probe guard receipts are retained inside each checkpoint |
| Pages visited | customer 11, merchant 9, admin 18 (+54 links fetched) |
| Screenshots | 38 (`screenshots/`) |
| Stop reason | customer: charters done/blocked with 420 s left; merchant: done with ~540 s left; admin: done within budget |

### Health score: 94/100 (provisional: accessibility only partly tested)

| Category | Score | Basis |
|---|---|---|
| Console | 100 | 0 product console errors. Excluded: `503` from flag-off API (designed state), `429`/`401` from harness lane interference and a deliberate wrong-OTP probe |
| Links | 100 | admin 54/54 same-origin → 200; customer legal links call `window.open` with the hosted URL |
| Visual | 97 | QA-B05 (low) |
| Functional | 84 | QA-B01, QA-B02 (medium) |
| UX | 89 | QA-B04 (medium), QA-B07 (low) |
| Performance | 97 | QA-B06 (low) |
| Content | 97 | QA-B03 (low) |
| Accessibility | 100 (provisional) | only keyboard reachability of merchant order cards checked (pass) |

### Issues

#### QA-B01 · Medium · Functional · customer `/home`: "Notify me" is never sent to the server

- **Observed:** On a coming-soon service sheet ("Restaurants are coming soon … We'll message you on WhatsApp the day
  they open in your area"), tapping **Notify me** switches the button to "We'll let you know". The network log shows
  no request other than `POST /client-metrics`. localStorage gains the key `lynia.secure:lynia.serviceInterest.v1`.
- **Expected:** a promise to message the user needs a server-side record of who asked, or the copy must not promise one.
- **Confirmation:** replayed: Food sheet ([checkpoint 058](browser/exploration-058.json)–[060](browser/exploration-060.json)),
  then from a fresh load on the Shops sheet ([071](browser/exploration-071.json)–[073](browser/exploration-073.json)). Same result both times.
- **Evidence:** `screenshots/c-food-flagoff.png`, `screenshots/c-notify.png`.
- **Hypothesis (untested):** `src/…/service-interest.ts` stores interest locally only. `docs/DESIGN-DEVIATIONS.md` names
  that file only for its location ask, so storage is not a ledgered decision. Check the handoff's intent before fixing.

#### QA-B02 · Medium · Functional · admin `/`: "Needs attention" says nothing is wrong while 5 orders are late

- **Observed:** Overview shows the red banner "5 orders past the time limit" and, on the same page, "Needs attention:
  Nothing needs you right now". `/live` lists those 5 orders (3 "No biker yet", over by 4–18 min).
- **Expected:** the Needs-attention card surfaces late/stuck orders (its own empty copy says "Stuck orders … will surface here").
- **Confirmation:** replayed by reload ([checkpoint 008](browser-admin/exploration-008.json)–[011](browser-admin/exploration-011.json)).
- **Evidence:** `screenshots/a-home.png`, `screenshots/a-live.png`.
- **Hypothesis:** the two widgets use different stuck-order rules (Live uses per-step limits; Overview a separate
  query). Related history: KNOWN_BUGS WD-028 (old hardcoded 25-min rule), ADM-03.

#### QA-B03 · Low · Content · admin: live-order counts disagree

- **Observed:** Overview "Live orders **9**" vs Live "Active orders **8**", same moment, replayed.
- **Evidence:** [checkpoint 009](browser-admin/exploration-009.json), [011](browser-admin/exploration-011.json).
- **Hypothesis:** different status sets in the two counts.

#### QA-B04 · Medium · UX · merchant `/queue/order`: "Keep searching" does nothing visible

- **Observed:** On a "No biker yet" order, **Keep searching** issues one `GET /merchant/orders/:id` and nothing else; the
  card, copy and step stay identical.
- **Expected:** the merchant sees that searching continues (state/timer change or confirmation), or a write re-broadcasts.
- **Confirmation:** replayed from a fresh load ([checkpoint 043](browser-merchant/exploration-043.json)–[048](browser-merchant/exploration-048.json)).
- **Evidence:** `screenshots/m-order-detail.png`, `screenshots/m-keepsearching.png`.
- **Hypothesis:** by design it may only dismiss/refresh; check `handoff/merchant-v2/BRIEF.md` before changing.

#### QA-B05 · Low · Visual · customer `/send`: double focus ring on the address field (observed once)

- Focused PICKUP input draws the browser's black outline inside the green drawn ring. `screenshots/c-send-search.png`.

#### QA-B06 · Low · Performance · customer `/home`: catalogue endpoints fetched ~3× each at boot (observed once)

- With services flagged off, 6 endpoints produced 17 requests in ~3 s; stable afterwards (no runaway). [checkpoint 051](browser/exploration-051.json)–[052](browser/exploration-052.json).

#### QA-B07 · Low · UX · customer `/send`: typed pickup text discarded when switching to "Tap the map" (observed once)

- Typed "12 Samora Machel Ave, Harare", chose "Tap the map to set the pin": field reverts to "Set pickup location".
  `screenshots/c-send-typed.png`, `screenshots/c-send-pin.png`.

#### Retracted / not findings (kept for the record)

- **OTP "on WhatsApp" copy:** approved deviation D-40; merchant's "Sent by SMS" reflects the actual channel. Not a bug.
- **Merchant order cards not keyboard-reachable:** disproved on replay (all cards tab-reachable).
- **Service worker serving a stale bundle:** both builds had the same hash (Metro cache); SW behaved correctly.
- **Merchant money mismatch ($7.50 / $9.00 / $0.00 for one order):** seed orders have fares that don't match items; an
  API-created order was consistent ($4.50 everywhere). See QA-S01.

### Console health

| Error | Count | Where | Disposition |
|---|---|---|---|
| `Failed to load resource: 503` | 17 | customer `/home` | flag-off API response (designed state), excluded |
| `429` / `401` | 3 | merchant `/login` | harness: OTP throttle shared with functional lane; deliberate wrong code |

### Checkpoints

Customer (`browser/`): [001](browser/exploration-001.json) … [120](browser/exploration-120.json) (120 files, all retained).
Merchant (`browser-merchant/`): [001](browser-merchant/exploration-001.json) … [077](browser-merchant/exploration-077.json).
Admin (`browser-admin/`): [001](browser-admin/exploration-001.json) … [061](browser-admin/exploration-061.json).
Each was written by a shell helper (`p.sh`) that copies the previous guarded command's output verbatim, not by the
Write tool; disclosed as a deviation from the browser-checkpoint rule.

---

## Functional section

| Field | Value |
|---|---|
| Runtime / tools | Node 22, harness `docs/reports/journey-qa-2026-10-15/harness/drive.mjs`, `gstack-qa-evidence` captures |
| Fixture ownership | phones `+2637766000xx`, seeded merchant read-mostly; rival merchant "QA Rival Kitchen" created |
| Probe budget / stop reason | unbounded, 30 s per command / complete except one not-run contract |

### Contract outcomes

| Contract | Evidence | Expected → observed | Outcome |
|---|---|---|---|
| F1 auth (OTP cap, burst throttle, refresh rotation, logout) | capture 002 | as designed | pass (001 superseded: probe bug) |
| F2 Send create/replay/concurrent dedupe/403/raise/cancel | capture 003 | dedupe under 3 concurrent; other users 403 | pass, with FN-01/FN-02 |
| F3 biker loop (PII off board, stage machine, delivery code) | capture 005 | as designed | pass (004 superseded) |
| F4 wallet (top-up idempotency/clamp, admin credit dedupe, ledger integrity) | capture 007 | as designed | pass (006 superseded) |
| F5 merchant queue/accept/ready, rival authz | captures 009, 010 | rival can't see/act, no existence oracle | pass (008 setup-blocked: flags off) |
| F5 manual accept path | — | — | **not run** (seeded merchant `auto_accept=true`, shared) |
| F6 admin authz, 84 routes × 7 identities incl. `alg:none`/expired | capture 011 | all 401/403; no 5xx | pass |
| F7 races (select×select, select×cancel, double stage/deliver/rate, 12 concurrent wrong codes) | capture 012 | single winner; 5-attempt cap held | pass |
| F7 code lockout recovery | captures 013 → 014 | rotate then deliver after throttle window | inconclusive → pass |

Evidence: `functional/annotations.json`, `functional/evidence.json`, `functional/.qa-evidence/001…014` (captures 006/007/011 private: env holds ADMIN_JWT).

### Findings

- **FN-01 · Low · new:** `POST /orders` accepts a $99,999 fare (`FareUsd` max 100,000, `packages/shared/src/contracts.ts:12`).
  Known JQ-R4-04 cases (a $0.01 fare snapped to $0.50, a 0 m trip, 366 km at $3) still reproduce. The app form blocks all of them.
- **FN-02 · Low · new:** a replayed idempotency key with a *different* body silently returns the original (`POST /orders`
  fare 3→9; `POST /wallet/topups` $5→$50). No live client path today (the app makes a fresh key per attempt).
- **Known, still present:** JQ-R4-03/04 (server trusts client form for Send).

### By design (checked, not bugs)

Negative balance after reversal (owner decision 3, `wallet.service.ts:1039`); refresh-token reuse doesn't revoke the
family (`auth.service.ts:924`); merchant accept 409 under `auto_accept`; wrong delivery code → 401 (client handles it).

### Proposed tests (report-only; not created)

- QA-B01. Value: protects=a Notify me tap creates a server-side interest record; fails_when=interest is stored only on the device; why_new=no test covers where interest is persisted; seam=none; no_claim=WhatsApp delivery (vendor not exercised).
- QA-B02. Value: protects=Overview Needs-attention lists every order Live marks past its limit; fails_when=the two queries diverge; why_new=existing AlertStrip tests cover chips, not this card; seam=none; no_claim=real-time refresh cadence.
- FN-02. Value: protects=a replay with a different body returns 409/422; fails_when=the server returns the cached original; why_new=idempotency specs replay identical bodies only; seam=none; no_claim=other domains' hand-rolled idempotency.

---

## Static baseline (repo-native)

| Check | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm depcruise` | exit 0; 13 known violations ignored, **10 stale entries in the baseline** |
| API int specs (offer-loop, order-lifecycle, idempotency, tracking, rider-onboarding, refresh-rotation) | 46/46 pass |
| `pnpm test` | exit 0, 6/6 packages (api 3841, merchant 763, shared 347, admin 293, mobile) |

## Dev-tooling gaps (not product defects)

- **QA-S01:** `prisma/seed.ts` creates merchant orders paid by `wallet` (order flow v2 is cash-only) with fares that don't
  match their items, so merchant Money/detail screens show inconsistent amounts on seed data.
- **QA-S02:** the journey-QA harness (`up.sh`, `journey-qa-24h.md` §3) doesn't set `RESTAURANTS_ENABLED/SHOPS_ENABLED/PHARMACY_ENABLED`
  (API defaults them off, `env.ts:433`; mobile defaults on), doesn't set `CORS_ALLOWED_ORIGINS` for the web surfaces, and
  assumes native Postgres even when Docker holds :5432. The web build refuses a loopback API URL (correct guard), so a local
  web QA needs a non-loopback host and `expo export --clear`.

## Refactor-relevant observations (input to Phase 2)

- **R-1** HTTP statuses carry domain meaning inconsistently (wrong delivery code = 401; wallet amount bounds = 403 while schema = 400).
- **R-2** Three error body shapes (schema `{message, formErrors, fieldErrors}`, Nest default, domain `{reason, message}`); many 409s lack `reason`.
- **R-3** Idempotency hand-rolled per domain (orders, food orders, top-ups, admin credit, reversals, offers); none checks body (root of FN-02).
- **R-4** Flag defaults disagree between API (off) and mobile (on).
- **R-5** Two silent money clamps (top-up [$3,$50], Send fare 50c snap).
- **R-6** Admin Overview and Live compute stuck/active orders separately (QA-B02/B03 symptoms).

## Coverage limits and cleanup

- Not covered: biker app UI (native-only, not in the web build; biker flows covered via API only), OTP code-entry
  screen (dev auto-fill), geolocation flows (headless can't answer the prompt), Send submit end-to-end in the browser
  (no address committable without Places/geo locally), customer food browse/order in the browser (flags were off
  when that surface ran), admin settings/flag toggles, real devices, production.
- Interference: functional lane restarted the API once (flags on) and exhausted the seeded merchant's OTP throttle; I
  reset that Redis key once.
- Left running (owned, for Phase 3): Docker Postgres/Redis, API, merchant/admin Next dev, static web server. Leftover
  data: ~15 ended parcel orders, 5 open food orders at Sadza Republic, rival merchant, one biker at −$45.
- No product code, tests, config or git state changed.
