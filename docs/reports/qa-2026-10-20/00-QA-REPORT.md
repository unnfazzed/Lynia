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

---

# Engineering review (gstack /plan-eng-review), 2026-10-20

**Target (fixed):** this report's findings and the Phase 3 fix/refactor proposal above
(`docs/reports/qa-2026-10-20/00-QA-REPORT.md`, PR unnfazzed/lynia#1279, branch `claude/cool-curie-xnt15t` @ `2aeaec15`, base main `330366e`).
Evidence: three read-only code traces (admin stuck/live logic; notify-me + keep-searching; idempotency + error shapes) and one
bounded live re-probe of the merchant hold card.

## Working plan (Phase 3 proposal under review)

| Item | Proposal | Status |
|---|---|---|
| QA-B01 | Notify me: send interest to server or fix copy | pending |
| QA-B02 | Overview Needs-attention agrees with Live breach monitor | pending |
| QA-B03 | Overview live count agrees with Live active count | pending |
| QA-B04 | Merchant Keep searching feedback | **retracted (false positive, see SC-1)** |
| FN-01 | Server fare sanity bound | pending |
| FN-02 / R-3 | Shared idempotency helper that checks the request body | pending |
| R-6 | One stuck/active definition for admin | pending (merged into B02/B03) |
| R-2/R-1 | One error body shape, consistent statuses | pending (scope question) |
| Hotspots | Split food-order.service.ts / rider.service.ts / contracts.ts | pending (scope question) |
| R-4 | API vs mobile flag defaults | pending (scope question) |
| QA-S01/S02 | Seed + QA harness fixes | pending |
| QA-B05–B07 | Web focus ring, duplicate boot fetches, lost typed pickup | pending |

## Scope Challenge — A. Assessment

**Factual corrections (no question needed):**

- **SC-1 QA-B04 retracted.** [P3] (confidence: 10/10) `apps/merchant/app/(app)/queue/order/page.tsx:689` —
  `onClick={() => void act(() => dispatchResume(order.id), "Searching again")}`. The live probe's `click "text=Keep searching"`
  matched multiple elements and `$B` refused (`Selector matched multiple elements`); that output had been discarded. Re-probed
  by ref: `POST /merchant/orders/16cf…/dispatch/resume → 201`, card became "Finding a biker. The code appears once one takes it."
  Not a defect. Side note: the hold card is not drawn in merchant-v2 / order-flow-v2; it stands on the archived joint-launch
  plan and `DESIGN-DEVIATIONS.md:2864` ("six rounds, then the kitchen's hold screen").
- **SC-2 QA-B01 reclassified.** On-device storage is an approved decision: `docs/DESIGN-DEVIATIONS.md:1049-1052` (D-28 §2,
  "the intent is recorded on-device (`logic/service-interest.ts`) … When the vertical gets a backend this becomes the local half
  of a sync"), handoff `calm-mint-v2-2026-10/mint2.js:39` marks `NEEDS BACKEND · notify-me list`. The defect is the promise:
  `apps/mobile/src/ui/home/copy.ts:69` "We’ll message you on WhatsApp the day they open in your area." No API, job or template
  exists to send it (no interest endpoint in `apps/api/src`; `orders.controller.ts:44 @Post("notify-me")` is the unrelated
  rider-availability waiter). Severity stays Medium (a promise to the public that cannot be kept).

**Root causes confirmed:**

- **SC-3 QA-B02.** [P2] (9/10) Banner = per-step SLA monitor (`apps/admin/app/layout.tsx:28` → `/admin/alerts` →
  `admin-live.service.ts:298 ordersBreaching: monitor.counts.breach`). Card = separate heuristic
  (`admin.service.ts:185 this.prisma.order.count({ where: { status: { in: [...IN_FLIGHT_STATUSES] }, updatedAt: { lt: stuckCutoff } } })`,
  `IN_FLIGHT_STATUSES` :26-32 starts at `"assigned"`, flat `STUCK_AFTER_MINUTES = 20` from `updatedAt`). A food order waiting for
  a biker (`requested`/`open_for_offers`) can never reach the card. `apps/admin/app/page.tsx:66` already fetches `/admin/alerts`
  but `buildAttention` (:261 `if (stuckOrders > 0) {`) never reads it. No test asserts the two agree.
- **SC-4 QA-B03.** [P3] (8/10) Overview counts every non-ended status (`page.tsx:242 const ENDED = [COMPLETED, CANCELLED, EXPIRED, UNDELIVERED]`)
  incl. `delivered` and `fleet_searching`; Live counts `LIVE_ORDER_STATUSES` rows with a timed stage (`admin-live.service.ts:186 if (!s) continue;`).
  Which order is the 9th is unconfirmed (needs a DB read).
- **SC-5 FN-02 is five sites, plus one latent 500.** [P2] (9/10) Same hand-rolled pattern (pre-check → create → P2002 → re-find),
  no body comparison, at `orders.service.ts:236`, `wallet.service.ts:529`, `issues.service.ts:74`, `food-order.service.ts:404`,
  `merchant-booking.service.ts:239`. New: `food-order.service.ts:628-630 where: { customerId, orderType: "merchant", idempotencyKey }`
  shares the `order_customer_idempotency_key` index (migration 0021) with parcel orders, so a parcel key reused on a food order
  raises P2002, the re-find returns null and `throw err` (:622) becomes a 500. [P3] (8/10, static read). Issues key is per opener,
  not per order (`issue_opener_idempotency_key`), so a reused key on another order returns the other order's issue [P3] (7/10).
- **SC-6 FN-01.** [P3] (9/10) `packages/shared/src/contracts.ts:12 export const FareUsd = z.number().positive().max(100_000)…`;
  no server check against `suggestedFare` in `orders.service.ts create`. Bound is a pricing-policy choice.
- **SC-7 R-2/R-1 is a wire-contract change.** [P2 if done carelessly] (9/10) `apps/mobile/src/api/client.ts:98-101` reads
  `parsed.code, parsed.reason, parsed.error` in that order; `isApiErrorBody` :485-488 requires `statusCode`; UI branches on
  `code_reissue_limit`, `account_banned`, `on_hold`. 316 `ConflictException` sites (~127 with reason). Installed apps (vc 47/48)
  must keep working (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c).
- **SC-8 Hotspot splits have no defect driving them.** Churn × size is real (`contracts.ts` 62 commits/3006 lines,
  `food-order.service.ts` 42/2289, `rider.service.ts` 28/2552 [measured: git log 45 d, wc -l]) but no QA finding roots there
  except SC-5, which R-3 touches anyway.

**What already exists:** a working per-step SLA monitor (`apps/api/src/admin/live-ops.ts` `stageOf`, tested in `live-ops.spec.ts`);
the merchant resume endpoint (`food-dispatch.service.ts:1022`); the all-exceptions filter (`common/all-exceptions.filter.ts:65`);
no idempotency helper in `apps/api/src/common/`.

**Complexity:** proposed changed files ≈ 20 [estimated] (admin.service.ts, admin page.tsx + test, admin-live.service.ts,
5 idempotency services + specs, schema.prisma + 1 migration, new `common/idempotency.ts`, contracts.ts, seed.ts,
journey-qa harness docs, ServiceSoonSheet/copy or a new interest module) and 2 new units (idempotency helper, interest
endpoint if built). Gate B trips (≥8 files, ≥2 new units).

**TODOS cross-reference:** `TODOS.md` has no idempotency, stuck-order, error-shape or service-interest items. Nothing blocks.

**Search check:** Layer 1 for idempotency is the IETF `Idempotency-Key` draft pattern (store key + request fingerprint,
409/422 on mismatch); Stripe returns an error when the same key arrives with different parameters. In-distribution knowledge
(Aside not available; WebSearch not run).

**Reality rows:**
REALITY: premise-table finding 8 premises checked, 1 false (QA-B04), unverified=1 (QA-B03's 9th order) apps/merchant/app/lib/orders-api.ts:72
REALITY: already-done pass no commits on origin/main since 2026-10-20 touch the named files (base 330366e) apps/api/src/admin/admin.service.ts:185
REALITY: surface-check pass routes verified: admin.controller.ts:278 @Get("alerts"), :289 @Get("overview"), merchant-order.controller.ts:282 @Post(":orderId/dispatch/resume")
REALITY: binding-decisions pass no branch decisions logged; ledger D-28 §2 (on-device interest), D-40 (OTP copy), D-101 (biker wording) bind docs/DESIGN-DEVIATIONS.md:1049
REALITY: numbers pass churn/size re-derived [measured: git log --since=45d, wc -l]; 316/127 exception counts [measured: grep, approximate] packages/shared/src/contracts.ts:12
REALITY: deferred-asks finding user asked "refactor the code" + "QA review"; error-shape unification and hotspot splits are candidates for deferral, listed in Gate B apps/mobile/src/api/client.ts:98-101
REALITY: pr-count pass no .gstack/ship-policy.json → default one PR per wave; proposal is one PR per remedy (see Section 1) docs/ROUTINES.md:1

## Scope Challenge — B. Scope record (post-answer)

feature answers: D3 R-2/R-1 error-shape unification = **A) Include** (recommended was Defer); D4 hotspot splits
(contracts.ts, food-order.service.ts, rider.service.ts) = **A) Include** (recommended was Defer); D5 R-4 flag defaults =
**A) Investigate now** (bounded, read-only, ≤30 min; no code change unless approved later); D6 QA-B05–B07 = **A) Include**
(replay each first; fix only what reproduces); structure: **D7 = A) Original arrangement** (new
`apps/api/src/common/idempotency.ts`, `apps/api/src/admin/order-health.ts`, `apps/api/src/common/api-error.ts`);
accepted scope: QA-B01, QA-B02, QA-B03, FN-01, FN-02/R-3 (+ SC-5 latent 500 and issues key scope), R-2/R-1, three hotspot
splits, R-4 investigation, QA-B05–B07 (replay-gated), QA-S01/S02; QA-B04 retracted (SC-1);
pending remedies: R1 (B01 approach), R2 (B02/B03 approach), R3 (FN-01 bound), R4 (R-3 body-check design),
R5 (R-2 compatibility rules), R6 (split boundaries).

**R-4 investigation result (D5):** not a defect. `apps/api/src/config/env.ts:428` "Env-var flags per the eng-review decision 3A:
fail-safe OFF by default" (`RESTAURANTS_ENABLED … .default("false")` :433); `apps/mobile/src/net/use-feature-flags.ts:19`
"`restaurantsEnabled` FAILS OPEN. Restaurants is fully launched"; tracked as MOB-BOOT-02 (`docs/KNOWN_BUGS.md:133`). Both
defaults are deliberate and documented. Disposition: closed, no remedy. QA harness note (S02) still applies: local QA must set them.

## Decision ledger

### R1: QA-B01 Notify me promise
Finding: SC-2, Medium, confidence 9/10, `apps/mobile/src/ui/home/copy.ts:69` + `src/ui/home/ServiceSoonSheet.tsx:64`, reviewer: eng review (trace + QA live probe)
Plan baseline: original proposal "send the interest to the server, or fix the copy"; nothing approved.
Runtime evidence: tap writes only `lynia.serviceInterest.v1` on device (QA checkpoints 058–073); no API, job or template exists; on-device storage approved by D-28 §2 (`DESIGN-DEVIATIONS.md:1049`); handoff marks `NEEDS BACKEND · notify-me list` (`calm-mint-v2-2026-10/mint2.js:39`).
Comparison grid:
| Choice | Current | A) Build the list | B) Change the copy | C) Leave as is |
|---|---|---|---|---|
| R1 interest storage | device only | device + server list (`POST /service-interest`, synced once after sign-in) | device only | device only |
| R1 copy | handoff verbatim, promises WhatsApp | unchanged (verbatim) | new copy without the promise + DESIGN-DEVIATIONS entry | unchanged |
| R1 launch message | none | admin export of the list per service/area; the send itself stays a manual ops step at launch | none | none |
| R2–R6 | pending | pending | pending | pending |
Question D8:
D8 — How do we make "Notify me" honest? Project/branch/task: claude/cool-curie-xnt15t, QA-B01. ELI10: The coming-soon sheet tells customers "We'll message you on WhatsApp the day they open in your area", but the tap is only saved on the phone, so nobody can ever send that message. Either we keep the promise (store the list on the server so ops can message those people at launch) or we stop making it (change the words, which needs a design-deviation entry because copy must match the mock). Stakes if we pick wrong: real customers wait for a message that never comes. Recommendation: A) Build the list because the design itself marks this NEEDS BACKEND and keeps the copy verbatim, so building it aligns the app to the mock instead of adding a deviation. Completeness: A=9/10, B=7/10, C=3/10. Pros / cons: A) Build the list (recommended) ✅ Keeps the mock copy verbatim and makes the promise keepable ✅ Ops get a real launch list per service and area ❌ New endpoint + table + sync; the WhatsApp send stays manual until a Bird template exists (human: ~2 days / CC: ~1 h). B) Change the copy ✅ Smallest change; no backend or data to hold ✅ Stops the false promise immediately ❌ Needs a DESIGN-DEVIATIONS entry and drifts from the drawn mock (human: ~1 h / CC: ~10 min). C) Leave as is ✅ No work this wave ✅ D-28 already covers the on-device storage ❌ The public keeps getting a promise nobody can keep. Net: keep the promise the design makes, rather than editing the design.
Header: Notify me
Options:
A) Build the list (recommended)
New POST /service-interest (auth, idempotent per profile+service), a ServiceInterest table (expand-only migration), the sheet syncs the device set once after sign-in, admin CSV export per service/area. Copy unchanged. Launch-day WhatsApp send stays a manual ops step.
B) Change the copy
Replace the WhatsApp promise with copy that promises nothing off-device; add a DESIGN-DEVIATIONS entry for owner approval. Storage stays on-device.
C) Leave as is
No change; record the false-promise risk in KNOWN_BUGS.

State: approved
Actual answer: A) Build the list (recommended), D8 answer 2026-10-20
Accepted scope: New POST /service-interest (auth, idempotent per profile+service), a ServiceInterest table (expand-only migration), the sheet syncs the device set once after sign-in, admin CSV export per service/area. Copy unchanged (handoff verbatim). Launch-day WhatsApp send stays a manual ops step. R2–R6 remain pending.
History: none

### R2: QA-B02 one "late order" rule for admin
Finding: SC-3, P2/Medium, confidence 9/10, `apps/api/src/admin/admin.service.ts:185` vs `apps/api/src/admin/admin-live.service.ts:298`, reviewer: eng review (trace)
Plan baseline: original proposal "Overview Needs-attention agrees with Live breach monitor"; D7 approved the new module `apps/api/src/admin/order-health.ts`. Rule not yet approved.
Runtime evidence: two rules today. Flat rule: `IN_FLIGHT_STATUSES` (assigned…en_route_dropoff) + `updatedAt` older than `STUCK_AFTER_MINUTES = 20`, used by the Overview card (`admin.service.ts:185`) and the order-detail stuck flag (`admin-orders.service.ts:679 const stuck = active && now - lastEventAt.getTime() > STUCK_AFTER_MS;`). Per-step rule: `live-ops.ts` `LIVE_SLA_MS` (no_bid 2 min … no_biker 6 min, pickup 20 min, delivery 20 min with no event), used by the banner and the Live page. The per-step rule covers every stage the flat rule covers (pickup/delivery at 20 min) plus pre-biker stages.
Comparison grid:
| Choice | Current | A) One rule: per-step SLA | B) Both rules, card shows union | C) Card reads the banner count only |
|---|---|---|---|---|
| R2 rule for Overview card | flat 20 min, in-flight only | per-step breach from `order-health.ts` (wraps `live-ops.stageOf`) | per-step breach ∪ flat 20-min in-flight | banner's `ordersBreaching` count, no rows |
| R2 rule for order-detail stuck flag | flat 20 min | per-step breach (same function) | flat 20 min (unchanged) | flat 20 min (unchanged) |
| R2 `STUCK_AFTER_MINUTES` in `@lynia/shared` | exported, used by card copy | removed; card copy names the stage limit instead | kept | kept |
| R2 module | none | `order-health.ts` (D7) | `order-health.ts` (D7) | `order-health.ts` (D7), thin |
| R1 | approved (D8 A) | unchanged | unchanged | unchanged |
| R2b active-count definition, R3–R6 | pending | pending | pending | pending |
Question D9:
D9 — Which rule decides that an order is "late" in the admin console? Project/branch/task: claude/cool-curie-xnt15t, QA-B02. ELI10: Today the red banner and the Live page use a per-step stopwatch (6 min with no biker, 15 min waiting on the customer, 20 min in delivery, and so on), while the Overview's "Needs attention" card uses one flat 20-minute rule that only looks at orders that already have a biker. So a food order nobody has picked up is "late" in one place and invisible in the other. Stakes if we pick wrong: ops trusts the calm card and misses orders that are actually stuck. Recommendation: A) One rule: per-step SLA because the per-step rule already covers everything the flat rule covers and more, and one function used everywhere means the screens can never disagree again. Completeness: A=10/10, B=7/10, C=5/10. Pros / cons: A) One rule: per-step SLA (recommended) ✅ Banner, card, Live and order detail all agree by construction ✅ Catches no-biker and waiting-on-customer orders the card misses today ❌ Retires STUCK_AFTER_MINUTES, so the order-detail flag fires on different orders than before (human: ~1 day / CC: ~30 min). B) Both rules, card shows union ✅ Nothing that flags today stops flagging ✅ Adds the missing pre-biker orders to the card ❌ Two rules to maintain; the order-detail flag can still disagree with Live (human: ~1 day / CC: ~30 min). C) Card reads the banner count only ✅ Smallest change; the numbers match immediately ✅ No rule changes anywhere ❌ The card shows a count with no order rows, and order detail still uses the old rule (human: ~2 h / CC: ~10 min). Net: one rule everywhere costs the same as two and ends the drift.
Header: Late rule
Options:
A) One rule: per-step SLA (recommended)
New order-health.ts exposes isLate(order) and lateOrders() built on live-ops stageOf/LIVE_SLA_MS; the Overview card, banner, Live page and order-detail stuck flag all use it; STUCK_AFTER_MINUTES/STUCK_AFTER_MS and IN_FLIGHT_STATUSES are retired; card copy names the stage and its limit.
B) Both rules, card shows union
order-health.ts returns per-step breaches plus flat 20-min in-flight orders for the card; order-detail flag and STUCK_AFTER_MINUTES unchanged.
C) Card reads the banner count only
The card shows the banner's ordersBreaching count linking to /live; no rule changes; order-health.ts is a thin wrapper.

State: approved
Actual answer: A) One rule: per-step SLA (recommended), D9 answer 2026-10-20
Accepted scope: New order-health.ts exposes isLate(order) and lateOrders() built on live-ops stageOf/LIVE_SLA_MS; the Overview card, banner, Live page and order-detail stuck flag all use it; STUCK_AFTER_MINUTES/STUCK_AFTER_MS and IN_FLIGHT_STATUSES are retired; card copy names the stage and its limit. R1 unchanged; R2b, R3–R6 remain pending.
History: none

### R2b: QA-B03 one "active orders" count
Finding: SC-4, P3/Low, confidence 8/10, `apps/admin/app/page.tsx:242` vs `apps/api/src/admin/admin-live.service.ts:209`, reviewer: eng review (trace)
Plan baseline: original proposal "Overview live count agrees with Live active count"; D7 module `order-health.ts`; R2 approved (D9 A, one late rule).
Runtime evidence: Overview = every status except completed/cancelled/expired/undelivered (includes `delivered`, `fleet_searching`), labelled "all types, not yet finished"; Live = `LIVE_ORDER_STATUSES` rows that have a timed stage (`admin-live.service.ts:186 if (!s) continue;`), labelled "Active orders". 9 vs 8 observed; which order differs is unverified.
Comparison grid:
| Choice | Current | A) Not-ended everywhere | B) Timed-only everywhere | C) Keep both, relabel |
|---|---|---|---|---|
| R2b Overview "Live orders" | not ended | not ended (from `order-health.ts activeOrderCount`) | timed live rows | not ended, label "Not finished" |
| R2b Live "Active orders" KPI | timed rows | not ended (same function); list still shows timed rows plus a "No timer: N" line | timed rows | timed rows, label "Timed on Live" |
| R1, R2 | approved | unchanged | unchanged | unchanged |
| R3–R6 | pending | pending | pending | pending |
Question D10:
D10 — What does "active orders" mean in the admin console? Project/branch/task: claude/cool-curie-xnt15t, QA-B03. ELI10: Overview said 9 live orders while the Live page said 8 at the same moment. Overview counts every order that isn't finished (including ones just delivered and ones searching their own fleet); Live only counts orders it can put a stopwatch on. Both labels claim to mean "not finished". Stakes if we pick wrong: ops sees two different numbers for the same thing and stops trusting both. Recommendation: A) Not-ended everywhere because both labels already promise that meaning, and the Live list can still show only timed rows with a small "No timer: N" line so nothing is hidden. Completeness: A=9/10, B=6/10, C=5/10. Pros / cons: A) Not-ended everywhere (recommended) ✅ One number on both screens, matching what both labels say ✅ Orders with no timer stay visible as a count instead of vanishing ❌ The Live KPI can exceed its row list, so the extra line is needed (human: ~3 h / CC: ~15 min). B) Timed-only everywhere ✅ The KPI always equals the rows on the Live page ✅ Smallest change to the Live page ❌ Delivered and fleet-searching orders drop out of Overview's count (human: ~2 h / CC: ~10 min). C) Keep both, relabel ✅ No logic change, just clearer words ✅ Zero risk to existing tests ❌ Two numbers stay; ops still has to know why they differ (human: ~1 h / CC: ~5 min). Net: one meaning, shown honestly.
Header: Active count
Options:
A) Not-ended everywhere (recommended)
order-health.ts activeOrderCount() = all statuses except completed/cancelled/expired/undelivered; Overview "Live orders" and Live "Active orders" both use it; the Live list keeps timed rows and adds a "No timer: N" line for the rest.
B) Timed-only everywhere
Both KPIs use the Live page's timed-row count; Overview drops delivered and fleet_searching from its number.
C) Keep both, relabel
No logic change; Overview label "Not finished", Live label "Timed on Live".

State: approved
Actual answer: A) Not-ended everywhere (recommended), D10 answer 2026-10-20
Accepted scope: order-health.ts activeOrderCount() = all statuses except completed/cancelled/expired/undelivered; Overview "Live orders" and Live "Active orders" both use it; the Live list keeps timed rows and adds a "No timer: N" line for the rest. R1, R2 unchanged; R3–R6 pending.
History: none

**Factual correction (FN-01):** the QA report (and JQ-R4-04) says the app's form blocks out-of-range fares. It does not at the
top end: `apps/mobile/src/logic/send-steps.ts:71 export const PRICE_MAX = 100_000;` and `priceOk` (:77-78) only checks
`price <= PRICE_MAX`. A typo of $9000 for $9.00 is sendable from the real app. FN-01 re-graded P3 → **P2** (confidence 8/10).

### R3: FN-01 fare sanity bound
Finding: SC-6 + correction above, P2, confidence 8/10, `packages/shared/src/contracts.ts:12` + `apps/mobile/src/logic/send-steps.ts:71`, reviewer: eng review (static read) + QA functional lane (live: $99,999 accepted)
Plan baseline: original proposal "server fare sanity bound"; nothing approved.
Runtime evidence: `FareUsd = z.number().positive().max(100_000)…`; server computes `suggestedFare` via `quoteFare` (`orders.service.ts:248`, `packages/shared/src/pricing.ts:37` base $1.50 + $0.60/km, 50c rounding); no check of `proposedFare` against it; app ceiling is the same $100,000.
Comparison grid:
| Choice | Current | A) Relative cap, shared | B) Absolute cap | C) Leave as is |
|---|---|---|---|---|
| R3 server bound on Send `proposedFare` | ≤ $100,000 | ≤ max(5 × suggestedFare, suggestedFare + $20), reason `fare_too_high` (409) | ≤ $200 in `FareUsd` (all fare fields) | ≤ $100,000 |
| R3 app behaviour | Review enabled to $100,000 | `priceOk` uses the same shared function, so Review stays disabled above it (existing disabled state, no new copy) | `PRICE_MAX = 200` | unchanged |
| R3 where the numbers live | — | `packages/shared/src/pricing.ts` `maxFareFor(suggested)` | `contracts.ts` constant | — |
| R3 raise-price path | `raisePrice` only checks `fare > current` | same bound applied | same cap applies (schema) | unchanged |
| R1, R2, R2b | approved | unchanged | unchanged | unchanged |
| R4–R6 | pending | pending | pending | pending |
Question D11:
D11 — How high may a customer set a parcel fare? Project/branch/task: claude/cool-curie-xnt15t, FN-01. ELI10: Customers name their own price for a parcel. Today both the app and the server accept anything up to $100,000, so a slip of the thumb ($9000 instead of $9.00) goes straight to bikers as a real cash job. A sensible ceiling tied to the suggested fare stops typos without blocking a generous tip. Stakes if we pick wrong: too tight blocks honest generous offers; none at all lets a typo become a cash dispute at the door. Recommendation: A) Relative cap, shared because it scales with distance (a long trip allows more) and the app and server use the same function, so the app never sends something the server will refuse. Completeness: A=9/10, B=6/10, C=3/10. Pros / cons: A) Relative cap, shared (recommended) ✅ Stops typo fares while allowing up to 5× the suggested price or +$20 ✅ One shared function, so app and server can never disagree ❌ The 5×/+$20 numbers are a pricing call you may want to tune (human: ~4 h / CC: ~20 min). B) Absolute cap ✅ Simplest rule to explain: nothing above $200 ✅ One constant in the contract ❌ Also caps merchant bookings and offers, and a flat number ignores trip length (human: ~2 h / CC: ~10 min). C) Leave as is ✅ No change to pricing behaviour at all ✅ Customers keep full freedom ❌ A typo still becomes a real $9000 cash job. Net: tie the ceiling to the trip, enforce it in one place.
Header: Fare cap
Options:
A) Relative cap, shared (recommended)
packages/shared/src/pricing.ts maxFareFor(suggested) = max(5 × suggested, suggested + $20); server rejects create/raise above it with reason fare_too_high (409); app priceOk uses the same function so Review stays disabled (no new copy).
B) Absolute cap
FareUsd max lowered to $200 for every fare field; app PRICE_MAX = 200.
C) Leave as is
No bound change; correct JQ-R4-04's note that the app blocks it.

State: approved
Actual answer: A) Relative cap, shared (recommended), D11 answer 2026-10-20
Accepted scope: packages/shared/src/pricing.ts maxFareFor(suggested) = max(5 × suggested, suggested + $20); server rejects create and raise-price above it with reason fare_too_high (409); app priceOk uses the same function so Review stays disabled (no new copy). R1, R2, R2b unchanged; R4–R6 pending.
History: none

### R4: FN-02 / R-3 idempotency body check
Finding: SC-5, P2, confidence 9/10, five sites (`orders.service.ts:236`, `wallet.service.ts:529`, `issues.service.ts:74`, `food-order.service.ts:404`, `merchant-booking.service.ts:239`) + latent 500 `food-order.service.ts:628-630` (P3, 8/10) + issues key per opener not per order (P3, 7/10), reviewer: eng review (trace) + QA functional lane (live replay $5→$50 returned original)
Plan baseline: D7 approved new module `apps/api/src/common/idempotency.ts`; scope includes FN-02/R-3 + the latent 500 + issues key scope. Design not approved.
Runtime evidence: every site does pre-check → create → catch P2002 → re-find; no body comparison; keys stored only as row columns with partial unique indexes (migrations 0021, 0029, 0036); no TTL. Mobile makes a fresh UUID per compose attempt (no live path sends a different body with an old key today).
Comparison grid:
| Choice | Current | A) Stored request fingerprint | B) Compare stored fields | C) Unify pattern, no body check |
|---|---|---|---|---|
| R4 mismatch detection | none | SHA-256 of the canonical request body stored in a new nullable `idempotency_fingerprint` column (orders, top_ups, issues); compared on replay | per-domain comparator of durable fields (fare, amount, orderId, item lines) | none |
| R4 mismatch response | replay original | 422 `{ statusCode, reason: "idempotency_key_reused", message }` | same 422 | replay original |
| R4 legacy rows (no fingerprint) | — | replay without check | n/a (fields always present) | — |
| R4 migration | none | 1 expand-only migration, 3 nullable columns, no backfill | none | none |
| R4 latent 500 (food key = parcel key) | 500 | lookup ignores orderType; a cross-type hit is a mismatch → 422 | same lookup fix → 422 | lookup ignores orderType; a cross-type hit → 409 `idempotency_key_reused` |
| R4 issues key scope | per opener | fingerprint includes orderId, so a cross-order reuse → 422 | comparator includes orderId → 422 | unchanged |
| R4 helper | none | `common/idempotency.ts` `withIdempotency({ find, create, fingerprint })` used by all 5 sites | same helper with `matches(existing, body)` | same helper without the check |
| R1, R2, R2b, R3 | approved | unchanged | unchanged | unchanged |
| R5, R6 | pending | pending | pending | pending |
Question D12:
D12 — What should happen when an idempotency key is reused with a different request? Project/branch/task: claude/cool-curie-xnt15t, FN-02 / R-3. ELI10: Apps send a one-time key with orders and top-ups so a double tap doesn't create two. Today, if the same key comes back with different contents ($5 top-up, then $50), the server silently returns the first result, so the second request looks successful but never happened. The standard fix (Stripe, the IETF draft) is to remember a fingerprint of the first request and refuse a mismatch. Stakes if we pick wrong: a money or order request appears to succeed while being dropped. Recommendation: A) Stored request fingerprint because it is the established pattern, works the same for all five endpoints, and the migration is three nullable columns with no backfill. Completeness: A=10/10, B=8/10, C=5/10. Pros / cons: A) Stored request fingerprint (recommended) ✅ One uniform check for all five endpoints, including food orders with item lists ✅ Industry-standard behaviour, and old rows keep working (no fingerprint, no check) ❌ Needs one expand-only migration on three busy tables (human: ~2 days / CC: ~1 h). B) Compare stored fields ✅ No migration at all ✅ Checks exactly the fields that matter for money ❌ Five hand-written comparators to keep in sync as bodies grow; item lists are fiddly (human: ~2 days / CC: ~1 h). C) Unify pattern, no body check ✅ Removes the duplicated code and fixes the latent 500 ✅ Smallest change with no new behaviour ❌ The silent-drop bug (FN-02) stays (human: ~1 day / CC: ~30 min). Net: fingerprint once, check everywhere.
Header: Idempotency
Options:
A) Stored request fingerprint (recommended)
common/idempotency.ts withIdempotency({find, create, fingerprint}) used by all 5 sites; new nullable idempotency_fingerprint (SHA-256 of canonical body) on orders, top_ups, issues (one expand-only migration, no backfill); mismatch → 422 reason idempotency_key_reused; legacy rows replay unchecked; food lookup ignores orderType; issues fingerprint includes orderId.
B) Compare stored fields
Same helper with a per-domain matches(existing, body) comparator over durable fields; no migration; same 422 on mismatch; same food lookup and issues fixes.
C) Unify pattern, no body check
Same helper without any body check; replays keep returning the original; food lookup fix returns 409 idempotency_key_reused on a cross-type hit.

State: approved
Actual answer: A) Stored fingerprint (recommended), D12 answer 2026-10-20
Accepted scope: common/idempotency.ts withIdempotency({find, create, fingerprint}) used by all 5 sites; new nullable idempotency_fingerprint (SHA-256 of canonical body) on orders, top_ups, issues (one expand-only migration, no backfill); mismatch → 422 reason idempotency_key_reused; legacy rows replay unchecked; food lookup ignores orderType; issues fingerprint includes orderId. R1–R3 unchanged; R5, R6 pending.
History: none

### R5: R-2/R-1 error-shape compatibility rules
Finding: SC-7, P2-if-careless, confidence 9/10, `apps/api/src/common/all-exceptions.filter.ts:65`, `apps/api/src/common/zod.pipe.ts`, `apps/mobile/src/api/client.ts:98-101,485-488`, reviewer: eng review (trace) + QA functional lane (R-1, R-2)
Plan baseline: D3 approved including R-2/R-1 this wave; D7 approved new module `apps/api/src/common/api-error.ts`. Compatibility rules not approved.
Runtime evidence: three body shapes (zod `{message, formErrors, fieldErrors}` with no statusCode; Nest default `{statusCode, message, error}`; domain `{reason, message}` often without statusCode). ~316 ConflictException sites, ~127 with reason [measured: grep, approximate]. Client: `errorCode` takes the first string of `code, reason, error`; `isApiErrorBody` needs `statusCode === status`; UI branches on `code_reissue_limit`, `account_banned`, `account_suspended`, `on_hold`, `account_on_hold`. Installed builds vc 47/48 are live (CLAUDE.md, Play).
Comparison grid:
| Choice | Current | A) Additive only | B) Additive + versioned status fixes | C) Additive + status fixes now |
|---|---|---|---|---|
| R5 body shape | 3 shapes | every error = `{ statusCode, reason, message }` (+ zod keeps `formErrors/fieldErrors`) via `api-error.ts`; existing reason strings unchanged | same | same |
| R5 status codes | 401 wrong delivery code, 403 wallet bounds, etc. | unchanged | corrected (wrong code → 422, bounds → 400) only for clients sending `x-app-version` ≥ the release that ships the client update; older apps keep old codes | corrected for everyone immediately |
| R5 reason-code registry | none | `packages/shared` `ApiErrorReason` union + a contract test that every throw site uses one | same | same |
| R5 never emit | — | `code` or `error` with a meaning different from `reason` | same | same |
| R1–R4 | approved | unchanged | unchanged | unchanged |
| R6 | pending | pending | pending | pending |
Question D13:
D13 — How far do we change API errors, given phones in the field still run older app builds? Project/branch/task: claude/cool-curie-xnt15t, R-2/R-1 (you chose to include it). ELI10: We are giving every API error one shape: a status, a short reason code, and a message. Adding fields is safe for old app versions, because they ignore what they don't know. Changing status numbers (for example 401 → 422 for a wrong delivery code) is not, because old apps branch on those numbers. Stakes if we pick wrong: a biker on an old build sees "you're signed out" instead of "wrong code" at the door. Recommendation: A) Additive only because it gets the single shape and the reason registry this wave with zero risk to vc 47/48; status corrections can follow once old builds age out. Completeness: A=8/10, B=10/10, C=6/10. Pros / cons: A) Additive only (recommended) ✅ One body shape and a typed reason registry, safe for every installed build ✅ Clients can branch on reason codes from now on ❌ The odd status numbers (401/403 for validation) stay for now (human: ~4 days / CC: ~3 h). B) Additive + versioned status fixes ✅ Fixes status numbers for new apps while old apps keep working ✅ The complete cleanup in one wave ❌ Version-gated behaviour in the error path is extra logic to test and remove later (human: ~6 days / CC: ~5 h). C) Additive + status fixes now ✅ Simplest code: one behaviour for everyone ✅ Correct HTTP semantics immediately ❌ Breaks installed builds that branch on 401/403, e.g. the delivery-code screen (client.ts:287). Net: ship the shape now, change numbers only when no old app depends on them.
Header: Error compat
Options:
A) Additive only (recommended)
api-error.ts helper; every error body becomes {statusCode, reason, message} (zod keeps formErrors/fieldErrors); existing reason strings unchanged; ApiErrorReason union in packages/shared + a contract test over throw sites; status codes unchanged; never emit code/error that disagree with reason.
B) Additive + versioned status fixes
Everything in A, plus corrected status codes (wrong delivery code → 422, amount bounds → 400) only for clients whose x-app-version is at or above the release that ships the matching client change; older builds keep today's codes.
C) Additive + status fixes now
Everything in A, plus corrected status codes for every client immediately.

State: approved
Actual answer: B) Additive + versioned fixes, D13 answer 2026-10-20 (recommended was A)
Accepted scope: Everything in A (api-error.ts helper; every error body {statusCode, reason, message}, zod keeps formErrors/fieldErrors; existing reason strings unchanged; ApiErrorReason union in packages/shared + contract test over throw sites; never emit code/error that disagree with reason), plus corrected status codes (wrong delivery code → 422, amount bounds → 400) only for clients whose x-app-version is at or above the release that ships the matching client change; older builds keep today's codes. Necessary implementation of this approved behaviour (no new choice): the mobile client starts sending x-app-version (none exists today; `apps/mobile/src/api/client.ts`), CORS allowedHeaders adds it (`apps/api/src/main.ts:119`), a missing header is treated as an old build. R1–R4 unchanged; R6 pending.
History: none

### R6: hotspot split boundaries
Finding: SC-8, P3, confidence 8/10, `packages/shared/src/contracts.ts` (3006 lines, 62 commits/45 d), `apps/api/src/merchant/food-order.service.ts` (2289/42), `apps/api/src/riders/rider.service.ts` (2552/28) [measured: wc -l, git log], reviewer: eng review
Plan baseline: D4 approved including all three splits this wave, behaviour-preserving. Boundaries and import strategy not approved.
Runtime evidence: `contracts.ts` is imported across api/mobile/admin/merchant as `@lynia/shared`; the two services are Nest providers injected by class. R4 and R5 edit all three files.
Comparison grid:
| Choice | Current | A) Domain modules + re-export | B) Domain modules + rewrite imports |
|---|---|---|---|
| R6 contracts.ts | one file | `contracts/` folder by domain (orders, merchant, rider, wallet, admin, auth); `contracts.ts` becomes a re-export barrel, so no import changes anywhere | same folder; every import across 4 apps points at the new module paths; old file deleted |
| R6 food-order.service.ts | one provider | placement / lifecycle / customer-view services behind the same `FoodOrderService` facade (callers unchanged) | three providers; controllers and specs inject the one they need |
| R6 rider.service.ts | one provider | onboarding+KYC / availability / jobs services behind the same `RiderService` facade | three providers; callers inject directly |
| R6 sequencing | — | after R4 and R5 merge (both edit these files) | after R4 and R5 merge |
| R1–R5 | approved | unchanged | unchanged |
Question D14:
D14 — How do we split the three biggest files without breaking every import? Project/branch/task: claude/cool-curie-xnt15t, hotspot splits (you chose to include them). ELI10: We will break each giant file into smaller files by topic, with no behaviour change. Either the old file stays as a thin front door that re-exports the new pieces (nobody else's code changes), or we update every place that imports it to point at the new pieces directly (cleaner, much bigger diff). Stakes if we pick wrong: a huge import-rewrite diff conflicts with every other open PR and slows review for days. Recommendation: A) Domain modules + re-export because it keeps each split PR small and conflict-free, and the facade can be removed later caller by caller. Note: options differ in kind, not coverage, so there is no completeness score. Pros / cons: A) Domain modules + re-export (recommended) ✅ Each split is a contained PR; callers across four apps don't change ✅ Existing tests keep passing untouched, which proves no behaviour changed ❌ A facade/barrel layer remains until callers migrate (human: ~3 days / CC: ~2 h). B) Domain modules + rewrite imports ✅ No leftover barrel or facade; dependencies are explicit ✅ depcruise can then enforce module boundaries ❌ Touches hundreds of import lines across api, mobile, admin and merchant; conflicts with in-flight work (human: ~5 days / CC: ~4 h). Net: split now behind a stable front door.
Header: Split style
Options:
A) Domain modules + re-export (recommended)
contracts/ by domain with contracts.ts as a re-export barrel; FoodOrderService and RiderService become facades over 3 smaller services each; no caller changes; done after R4 and R5 merge; one PR per file.
B) Domain modules + rewrite imports
Same domain split, but every import and injection site is updated to the new modules and the old files are deleted; done after R4 and R5 merge; one PR per file.

State: approved
Actual answer: A) Re-export front door (recommended), D14 answer 2026-10-20
Accepted scope: contracts/ by domain with contracts.ts as a re-export barrel; FoodOrderService and RiderService become facades over 3 smaller services each; no caller changes; done after R4 and R5 merge; one PR per file. R1–R5 unchanged.
History: none

## Scope Challenge — C. Result

Findings SC-1…SC-8 resolved through R1–R6 (D8–D14). Result: **scope accepted as-is** (no reduction; the owner widened it at D3/D4/D6).

## Section 1 — Architecture

```
            ┌──────────── apps/admin ────────────┐
 layout.tsx ─ /admin/alerts ─┐            page.tsx ─ /admin/overview ─┐   live/page.tsx ─ /admin/live ─┐
                             ▼                                         ▼                               ▼
              admin-live.service.alerts()           admin.service.overview()          admin-live.service.liveOrders()
                             └──────────────┬──────────────────────────┴───────────────┬───────────────┘
                                            ▼  (R2/R2b: one source)                     ▼
                          admin/order-health.ts  isLate()/lateOrders()/activeOrderCount()
                                            ▼
                          admin/live-ops.ts stageOf + LIVE_SLA_MS  (existing, tested)
                                            ▲
                     admin-orders.service.ts:679 order-detail stuck flag (R2: switches to isLate)

 POST /orders, /wallet/topups, /orders/:id/issues, food orders, merchant bookings
        └─► common/idempotency.ts withIdempotency({find, create, fingerprint})   (R4)
              ├─ key hit + fingerprint equal or null(legacy) → replay
              ├─ key hit + fingerprint differs              → 422 idempotency_key_reused
              └─ P2002 race → re-find → same two branches (never a bare 500)

 any throw ─► common/api-error.ts apiError(status, reason, message) ─► AllExceptionsFilter (R5)
              └─ status remap (401→422 wrong code, 403→400 bounds) only if x-app-version ≥ V_new
```

- [P2] (confidence: 8/10) `apps/api/src/privacy/privacy.service.ts:548` — R1's new ServiceInterest rows hold a profileId tied to a
  phone. `eraseAccount` must delete them and `docs/DATA-RETENTION.md:25` needs a row. Required proof of the approved R1 behaviour
  (privacy rule, not a new choice): carried into T-R1.
- [P2] (8/10) `.github/workflows/release-azure.yml:398` — `prisma migrate deploy` runs before traffic moves, so R4's nullable
  columns land before code reads them. Code must still tolerate `idempotency_fingerprint IS NULL` (legacy rows) — already in R4 scope.
- [P2] (8/10) R5 versioned remap: an old build sends no `x-app-version`, so it must get today's codes. Failure if inverted: biker
  on vc 47 sees a 422 the app does not handle at `apps/mobile/src/api/client.ts:287`. Covered by the R5 contract test (Section 3).
- [P3] (7/10) `apps/api/src/admin/admin-live.service.ts:26 const LIVE_ORDER_CAP = 300;` — R2/R2b now route Overview through the
  same read, so above 300 live orders the card and count truncate. Pilot volume is far below; note in order-health.ts.
- Security: R1 endpoint is customer-authenticated and writes only the caller's own rows; no admin data exposed. No new auth surface elsewhere.
- Distribution: no new artifacts. Mobile changes (R1 sync, R3 priceOk, R5 header) ship by OTA to `production` (JS-only).

Dispositions: all four are required work inside approved R1/R4/R5/R2 scope (no new choice).

## Section 2 — Code quality

- [P2] (8/10) `apps/api/src/admin/admin-orders.service.ts:679` — the stuck flag uses `lastEventAt`; `stageOf` needs order facts
  (`riderId`, `merchantPhase`, `dispatchStartedAt`, …). order-health.ts must expose one `factsFor(order)` mapper used by all four
  callers, or the four will build facts differently and drift again. Required by R2 (one rule).
- [P2] (8/10) R4 fingerprint canonicalisation — the hash must exclude `idempotencyKey` itself and any client-volatile fields (device
  clock, `x-device-id`) and sort object keys, or an honest retry would read as a mismatch. Required by R4.
- [P3] (8/10) `apps/api/src/merchant/food-order.service.ts:628-630` — the `orderType: "merchant"` filter is removed by R4; the
  cross-type case becomes a 422, not a 500. Covered.
- Shared-code rubric (R4): callers verified at five authored sites (Section A). Removed: 5 × (pre-check + P2002 catch) ≈ 5 × 15 = 75
  lines; added: helper ≈ 60 + fingerprint ≈ 25 + migration ≈ 10 [estimated]. Implementation net ≈ −0 to −20 lines; total grows with
  tests (+~120). Justified by reliability (FN-02, latent 500), not line savings.
- Diagrams: `live-ops.ts:10-21` stage table stays accurate; order-health.ts needs the Section 1 diagram as its header comment.

Dispositions: required work inside approved scope.

## Section 3 — Tests

Framework: vitest (all packages), `pnpm test`; API int specs `pnpm --filter @lynia/api test:int` (CLAUDE.md, apps/api/package.json).

```
CODE PATHS                                                    USER FLOWS
[+] admin/order-health.ts (new)                               [+] Ops: Overview vs Live agree
  ├── isLate() per stage            [★★★ TESTED] live-ops.spec.ts:62-86 (stageOf)   ├── [GAP] banner N ⇔ card N rows (page.test.tsx)
  ├── lateOrders() for card         [GAP] admin.service.spec.ts                       └── [GAP] Live KPI = Overview KPI incl. delivered/fleet_searching
  ├── activeOrderCount()            [GAP]
  └── factsFor() mapper             [GAP] one table-driven spec over all stages
[+] common/idempotency.ts (new)                               [+] Customer/biker double-submit
  ├── replay same body              [★★ TESTED] orders-idempotency.int.spec.ts:57   ├── [★★★] concurrent dedupe (int :75, :88)
  ├── different body → 422          [GAP] [→E2E int]                                  └── [GAP] legacy row (null fingerprint) replays
  ├── P2002 race → re-find          [★★ TESTED] orders.service.spec.ts:545
  └── cross-type key (food/parcel)  [GAP] → 422 not 500
[+] common/api-error.ts (new) + filter                        [+] Old app vs new app
  ├── shape {statusCode,reason,message} [GAP] contract test over throw sites     ├── [GAP] [→E2E] vc47 (no header): 401 wrong code unchanged
  ├── zod keeps fieldErrors         [★★ TESTED] zod.pipe.spec.ts                      └── [GAP] header ≥ V_new: 422 wrong code
  └── remap by x-app-version        [GAP]
[+] pricing.maxFareFor + priceOk (R3)                         [+] Customer typo fare
  ├── server create/raise > cap → 409 fare_too_high [GAP]   └── [GAP] Review disabled above cap (send-steps test)
[+] POST /service-interest + sync + export (R1)               [+] Notify me
  ├── idempotent per profile+service [GAP]                   ├── [GAP] tap → POST once after sign-in
  └── eraseAccount deletes rows     [GAP]                     └── [GAP] admin CSV per service/area
[+] Splits (R6)                    [★★★] existing 3841 api tests + barrel export snapshot [GAP]
COVERAGE: 6/24 paths tested (25%) | GAPS: 18 (2 E2E/int)   QUALITY: ★★★:3 ★★:3
```

REGRESSION (IRON RULE) — behaviour at risk and its required contract: see D15.

## Section 4 — Performance

- [P3] (8/10) Overview now pays for the live monitor read (`take: LIVE_ORDER_CAP` = 300 rows) per request; reuse
  `ALERTS_CACHE_MS = 15_000` (`admin-live.service.ts:32`) so Overview, banner and Live share one cached read. Scale: admin-only,
  a few requests/min [estimated]. Required by R2 (no new choice).
- R4 fingerprint: one SHA-256 over a < 10 KB body per write; negligible. R2b count: one `groupBy` already executed today. No N+1 introduced.

Dispositions: required work inside approved scope.

## Outside voice

Preflight: `codex` not installed (`command -v codex` empty), `codex_reviews` unset → native fallback; the bounded native fallback needs
TaskOutput/TaskStop with a Plan subagent, which this session cannot wait on as specified. **Outside voice unavailable.** Missing coverage, not a clean review.

### R7: regression contract for the wave (IRON RULE)
Finding: Section 3, P1 if missing, confidence 9/10, reviewer: eng review
Plan baseline: R2, R4, R5, R6 approved; behaviour-preserving parts carry required regression proof.
Runtime evidence: existing ★★–★★★ tests listed in the Section 3 diagram; no export snapshot, no no-header error test, no Overview/Live agreement test today.
Comparison grid:
| Choice | Current | A) Unit + integration | B) Unit only |
|---|---|---|---|
| R7 preserve: identical-body replay returns the original (5 endpoints) | int spec for /orders only | table-driven unit test over all 5 + extend `orders-idempotency.int.spec.ts` | table-driven unit test over all 5 |
| R7 preserve: no `x-app-version` → today's status codes | none | filter unit test + int test on wrong delivery code (401) | filter unit test |
| R7 preserve: splits change nothing | none | export-name snapshot of `@lynia/shared` + split PRs edit no test files + full suite green | same |
| R7 preserve: order-detail flag still fires for in-delivery > 20 min | admin-orders spec | extend that spec with the order-health path | same |
| R7 intended changes asserted | — | card shows pre-biker breaches; mismatch → 422; fare above cap → 409 | same |
| R1–R6 | approved | unchanged | unchanged |
Question D15:
D15 — How do we prove the refactor didn't break what works today? Project/branch/task: claude/cool-curie-xnt15t, regression contract (required; the question is how, not whether). ELI10: Four things must keep working exactly as now: a double-tap still returns the first order, old app builds still get the error codes they understand, the file splits change nothing, and order detail still flags a delivery that's gone quiet. Unit tests check each piece alone; integration tests run against a real database the way CI already does for orders. Stakes if we pick wrong: a refactor ships that silently changes behaviour for phones already in the field. Recommendation: A) Unit + integration because the two riskiest promises (replays, old-build error codes) cross the database and the HTTP filter, which unit tests mock away. Completeness: A=10/10, B=7/10. Pros / cons: A) Unit + integration (recommended) ✅ Replays and old-build error codes are proven end to end on a real database ✅ Reuses the existing int-spec harness CI already runs ❌ Slower CI and more test code to maintain (human: ~2 days / CC: ~1 h). B) Unit only ✅ Fast, simple tests with no database ✅ Still covers every branch in isolation ❌ Mocks can hide exactly the cross-layer breaks this wave risks (human: ~1 day / CC: ~30 min). Net: prove the risky promises where they can actually break.
Header: Regression
Options:
A) Unit + integration (recommended)
Table-driven unit tests over all 5 idempotency sites + extended orders-idempotency.int.spec.ts; filter unit test + int test that a no-header wrong delivery code stays 401; @lynia/shared export-name snapshot and no test edits in split PRs; extended admin-orders spec; assertions for the intended changes.
B) Unit only
The same contracts as unit tests only (no new int tests); export snapshot and no-test-edit rule unchanged.

State: pending
Actual answer: unanswered
Accepted scope: none
History: none

### R8: TODO — retire the versioned status remap
Finding: R5 consequence, P3, confidence 9/10, reviewer: eng review
Plan baseline: R5 approved (D13 B), which leaves version-gated logic in the error path.
Runtime evidence: none yet (future code).
Comparison grid:
| Choice | Current | A) Add to TODOS.md | B) Skip | C) Build now |
|---|---|---|---|---|
| R8 | none | TODO: remove the remap when Play shows < 2% of active installs below V_new | nothing | not possible yet (needs install data after release) |
Question D16:
D16 — Add a TODO to remove the version-gated error codes later? Project/branch/task: claude/cool-curie-xnt15t, R5 follow-up. ELI10: Your D13 choice keeps two behaviours in the error path (old builds get old codes). Once almost nobody runs an old build, that branch is dead weight and should go. Stakes if we pick wrong: the branch stays forever and confuses the next person. Recommendation: A) Add because removal needs install data that only exists after release. Note: options differ in kind, not coverage, so there is no completeness score. Pros / cons: A) Add ✅ Records the exact trigger (< 2% of installs below V_new) ✅ Keeps the error path from carrying dead logic forever ❌ One more TODO to track. B) Skip ✅ No new tracking item ✅ Fine if the remap is tiny ❌ Version branches tend to outlive everyone's memory. C) Build now ✅ Nothing left behind ✅ One less TODO ❌ Impossible before old builds age out. Net: write down the trigger now.
Header: TODO remap
Options:
A) Add to TODOS.md (recommended)
Retire the x-app-version status remap when < 2% of active Play installs run a build below V_new.
B) Skip
No TODO.
C) Build it now
Remove the remap in this wave (would break old builds).

State: pending
Actual answer: unanswered
Accepted scope: none
History: none

### R9: TODO — migrate callers off the split facades
Finding: R6 consequence, P3, confidence 9/10, reviewer: eng review
Plan baseline: R6 approved (D14 A), which leaves a contracts.ts barrel and two service facades.
Runtime evidence: none yet (future code).
Comparison grid:
| Choice | Current | A) Add to TODOS.md | B) Skip | C) Build now |
|---|---|---|---|---|
| R9 | none | TODO: move callers to the new modules file by file; delete barrel/facades when empty | nothing | would reverse D14 (rewrite imports now) |
Question D17:
D17 — Add a TODO to move callers off the re-export front doors later? Project/branch/task: claude/cool-curie-xnt15t, R6 follow-up. ELI10: D14 kept the old files as thin front doors so nothing else had to change. Over time callers should import the new pieces directly so the front doors can be deleted. Stakes if we pick wrong: the front doors become permanent and hide which module owns what. Recommendation: A) Add because it lets the migration ride future changes caller by caller. Note: options differ in kind, not coverage, so there is no completeness score. Pros / cons: A) Add ✅ Captures a clear finish line (delete when no caller left) ✅ Lets each migration ride a real change ❌ Another long-lived TODO. B) Skip ✅ The front doors work fine as they are ✅ No tracking cost ❌ The barrel tends to become permanent. C) Build now ✅ Clean end state immediately ✅ No leftover layer ❌ Reverses your D14 choice and brings the big import diff back. Net: track the cleanup, do it gradually.
Header: TODO facades
Options:
A) Add to TODOS.md (recommended)
Move callers to the new contracts/ and service modules as they are touched; delete the barrel and facades when unused.
B) Skip
No TODO.
C) Build it now
Rewrite all imports in this wave (reverses D14).

State: pending
Actual answer: unanswered
Accepted scope: none
History: none

### R10: TODO — automate the launch-day WhatsApp message
Finding: R1 consequence, P3, confidence 8/10, reviewer: eng review
Plan baseline: R1 approved (D8 A) with the launch-day send as a manual ops step.
Runtime evidence: no WhatsApp template exists for a service-launch message; Bird is the messaging vendor (docs/BIRD-SETUP.md).
Comparison grid:
| Choice | Current | A) Add to TODOS.md | B) Skip | C) Build now |
|---|---|---|---|---|
| R10 | none | TODO: Bird WhatsApp template + admin "notify this list" action, after template approval | manual export stays the process | build template + action this wave (template approval is outside code and can take days) |
Question D18:
D18 — Add a TODO to automate the "we're open" WhatsApp message? Project/branch/task: claude/cool-curie-xnt15t, R1 follow-up. ELI10: With D8 the app now keeps a real list of people who tapped Notify me, but sending the message at launch is a manual ops job from a CSV. Automating it needs a WhatsApp template that Meta must approve, which takes days and happens outside the code. Stakes if we pick wrong: at launch someone has to remember to send the messages by hand. Recommendation: A) Add because the template approval is the blocker, not the code. Note: options differ in kind, not coverage, so there is no completeness score. Pros / cons: A) Add ✅ Records the dependency on template approval clearly ✅ Keeps this wave unblocked ❌ Launch stays a manual step until done. B) Skip ✅ Manual CSV is fine at pilot scale ✅ No tracking cost ❌ Easy to forget on launch day. C) Build now ✅ The promise is fully automatic from day one ✅ No manual step ❌ Blocked on Meta template approval, which can stall the whole wave. Net: track it; the vendor sets the pace.
Header: TODO WhatsApp
Options:
A) Add to TODOS.md (recommended)
Bird WhatsApp template for "<service> is open near you" + an admin action to message the list, once Meta approves the template.
B) Skip
Manual CSV export stays the launch process.
C) Build it now
Template + admin action in this wave.

State: pending
Actual answer: unanswered
Accepted scope: none
History: none
