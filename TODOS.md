# TODOS

Deferred work with context. Each entry records what/why/trigger so a pickup months later
starts from reasoning, not archaeology.

## Wallet / commission (from /plan-eng-review 2026-07-13, rider-wallet design)

### 1. EcoCash provider-statement reconciliation

- **What:** Periodic job (or ops procedure) matching Econet's merchant statement exports
  against confirmed `TopUp` rows.
- **Why:** The nightly integrity job (`WalletIntegrityService`, `POST /admin/wallet/integrity-check`,
  scheduled in `infra/terraform/scheduler.tf`) proves our own ledger is internally consistent —
  balance == sum(ledger), every confirmed top-up credited, no orphan credits; only statement
  matching catches money that reached the merchant account but never credited a wallet (or a
  credit with no matching receipt).
- **Pros:** Closes the last money-visibility gap; turns "where did the rider's $5 go"
  disputes into a lookup.
- **Cons:** Needs statement-export access from Econet; meaningless at pilot volume.
- **Context:** Deliberately cut from the wallet build (Approach A, design doc
  `docs/plans/2026-rider-wallet-design.md`). The wallet ships with an internal
  ledger-vs-balance integrity job only — that job (design step 6) was specified but unbuilt
  until roadmap item 1.3 landed it; this remaining item is the *external* statement-matching half.
- **Trigger / blocked by:** EcoCash rail live (wallet PR2) AND commission rate flipped
  AND sustained top-up volume (guide: >20 confirmed top-ups/week).

### 2. InnBucks / O'mari automation decision checkpoint

- **What:** A decision checkpoint: when manual credits exceed ~25/week OR median credit
  turnaround exceeds ~30 minutes during ops hours, decide per rail — automate it or drop
  it from the accepted deposit methods.
- **Why:** The launch design puts a human in the money path for these two rails (rider
  pays the merchant account, ops credits the wallet). Fine at pilot scale; silently
  unworkable at hundreds of riders. Without a written tripwire, the trigger fires as an
  ops incident instead of a scheduled decision.
- **Pros:** Converts creeping ops pain into a measurable, scheduled decision.
- **Cons (stated plainly):** The wallet's Approach A hardwires the top-up flow around the
  EcoCash client — automating additional rails later is a refactor of live money code,
  not a drop-in. That cost was accepted knowingly at design review (D6).
- **Context:** Manual-first for these rails was a deliberate office-hours decision
  (D2, 2026-07-13); this is its expiry alarm. Shadow-accrual metrics (would-be commission
  at the calibration rate) approximate future top-up volume before the flip.
- **Depends on:** Post-flip top-up volume data; thresholds above are launch guesses to
  calibrate against reality.

### 3. Generate wallet visual mockups with the gstack designer

- **What:** Run `$D variants` against the wallet screens now fully specified in
  `docs/plans/2026-rider-wallet-design.md` (UI Specification block): Wallet balance
  hero, show-the-math receipt rows, USSD wait state, gate state — pick a direction on
  the comparison board.
- **Why:** The 2026-07-13 design review ran text-only — the designer binary was
  present but needs an `OPENAI_API_KEY` the remote container doesn't have. The spec is
  complete; nobody has *seen* the wallet yet.
- **Context:** The brief is assemblable directly from the UI Specification block +
  `docs/DESIGN.md` tokens. Run before (or as part of) the build's
  `/design-consultation` → `/design-html` pass so layouts are coded from an approved
  visual, not from prose.
- **Depends on:** `OPENAI_API_KEY` (or `$D setup`) on the machine running it; best on
  a local session where the comparison board can open in a browser.

## Observability / crash reporting

### 1. Activate mobile Sentry (EAS build secrets) — after Expo setup

- **What:** Set the EAS build env vars that switch on the already-merged mobile crash reporting:
  `EXPO_PUBLIC_SENTRY_DSN` (plaintext) + `SENTRY_AUTH_TOKEN` (secret) + `EXPO_PUBLIC_SENTRY_ENVIRONMENT`,
  and a GitHub repo secret `EXPO_PUBLIC_SENTRY_DSN` for the OTA/QA-APK lanes (they build on the runner,
  so the EAS variable is out of scope there). Org/project are no longer env vars — `lyniago` /
  `lynia-mobile` are committed as plugin props in `app.config.ts`. Then cut a `preview` build and fire
  **both** crash tests from the TEST BUILD banner's long-press. Commands: `docs/LAUNCH-EXECUTION-RUNBOOK.md` §5.
- **Why:** `@sentry/react-native` is fully wired (`src/telemetry/sentry.ts`, `app/_layout.tsx`,
  the `app.config.ts` plugin, `metro.config.js`) but **inert until `EXPO_PUBLIC_SENTRY_DSN` is set** —
  so mobile crashes (JS **and** native) on riders'/customers' phones are still invisible until this is
  done. The API half is already live in production.
- **Context:** The dedicated React Native project **exists** (`lyniago/lynia-mobile`, created 2026-08-05),
  separate from the API's `lynia-api` Node project so native symbolication + mobile release-health work
  and events aren't mixed. Full step-by-step (dashboard + `eas env:create` CLI) is in
  `docs/LAUNCH-EXECUTION-RUNBOOK.md` §5, with the device exit test in `docs/QA-DEVICE-CHECKLIST.md` → LR20.
  Native SDK ⇒ needs a **new binary** (EAS build), NOT OTA; verification is device-gated. The bundle
  size cost (+974 KB Hermes, +19%) was measured and accepted; a trim was investigated and ruled out
  (Expo tree-shaking needs the package-exports resolution `metro.config.js` deliberately avoids).
- **Trigger / blocked by:** Founder's EAS/Expo account setup complete. The EAS project already exists
  (`25b2785d-94e0-4ecc-9940-bd9f9d8eb27c`); only the env vars + a release build remain.

## Merchant verticals (from /plan-eng-review 2026-07-27, plan §0b)

### DispatchDecision retention policy

- **What:** Pruning/archival rule for the append-only `DispatchDecision` log (every AUTO tick
  logs candidates, offers, outcomes).
- **Why:** It is the batching-decision dataset, but unbounded on the hot DB; without an owner it
  becomes a slow-creep table nobody prunes.
- **Pros:** Prevents unbounded growth; keeps the batching analysis window intact deliberately
  rather than accidentally.
- **Cons:** Meaningless at pilot volume — months from mattering.
- **Context:** The log exists to be mined ("batching when the log shows 3+ concurrent orders
  within ~2km/10min", plan §5); retention must preserve enough history for that analysis.
- **Trigger / blocked by:** `DispatchDecision` table exists (P4) AND row count > ~500k or 6
  months of data, whichever first.

### Post-launch flag cleanup (the Piranha pass)

- **What:** Delete `RESTAURANTS_ENABLED` / `MERCHANT_*` kill switches, the golden-matrix
  flags-off legs, and dead flag branches once Restaurants is permanently live.
- **Why:** Stale flags are dead branches with security edges; the repo's own precedent is that
  kill switches persist forever unless scheduled for removal (eng review outside-voice #11).
- **Pros:** Keeps `env.ts` and the test matrix honest; removes untested code paths.
- **Cons:** None real — calendar entry.
- **Context:** Uber built Piranha because nobody deletes flags voluntarily. Solo founder needs
  the tripwire written down.
- **Trigger / blocked by:** Restaurants stable in prod ~4 weeks with the kill switch never pulled.

### Merchant commission settlement infrastructure

- **What:** The actual weekly billing/settlement path (statements, payment collection,
  reconciliation) for merchant commission.
- **Why:** Launch runs 0% commission with ledger accrual only; the concept defers settlement
  infra ~6–8 months, but nothing tracked says so — the accruing ledger silently becomes real
  money owed with no way to collect it.
- **Pros:** Converts an implicit deferral into a scheduled decision with a tripwire.
- **Cons:** Pure paperwork today.
- **Context:** Mirrors the wallet TODOs' tripwire style. Commission ledger entries accrue from
  the first merchant order; settlement is the missing half.
- **Trigger / blocked by:** Any decision to schedule commission rate > 0% — settlement must be
  built BEFORE the rate flips.

## Merchant web upgrade (from /plan-ceo-review 2026-09-29, `docs/plans/2026-09-29-merchant-web-upgrade-plan.md` §11)

### TODO-1 · Retire the `owner_profile_id` fallback and repair flipped roles

- **What:** Once every merchant route reads `merchant_members`, drop the resolver's
  `merchants.owner_profile_id` fallback, and reset `Profile.role = merchant` values that the old
  `POST /merchant/become` flipped (RCA C-4) back to `customer`.
- **Why:** The fallback is a second source of truth kept only for the L1 rollout window. The flipped roles
  break those people's customer app, and nothing reads `role = merchant` any more.
- **Pros:** One access path. Merchant owners get their customer app back.
- **Cons:** It's a data fix in production; it needs a dry-run count first.
- **Context:** The L1 migration `0053` backfills an owner row for every existing merchant. The resolver
  backfills any row it finds missing. After two weeks with zero fallback hits (log `merchant.access.fallback`),
  the fallback is dead code.
- **Effort:** human S / CC S. **Priority:** P2.
- **Trigger / blocked by:** L1 shipped plus two weeks with no fallback hits in the logs.

### TODO-2 · A merchant socket feed for bookings

- **What:** Push booking changes to the merchant web over the existing `merchant:queue:<id>` room, and stop
  polling every 3 s during the 90-second pick window.
- **Why:** Polling is right for 2G at pilot scale. At about 100× pilot volume (roughly 300 live windows) it
  becomes about 100 req/s on the order snapshot, the API's hottest read path.
- **Pros:** Instant offers, less load. **Cons:** A reconnect path to get right on flaky links.
- **Context:** Send's gateway already emits `offers:changed` and `order:status` to `order:<id>` rooms. Only
  the order's customer and rider may subscribe, and a business's booking account has no socket, so a
  merchant-side relay is needed.
- **Effort:** human M / CC S. **Priority:** P3.
- **Trigger / blocked by:** booking snapshot p95 latency or request rate alarms, or more than 50
  concurrent booking windows.

### TODO-3 · Rider-app half of Book a rider and Your riders (one mobile release)

- **What:** In the rider app:
  - a "Refuse: prohibited goods" action on an assigned business booking that carries no strike, doesn't
    re-broadcast and files a report to ops;
  - "{Business} calls you their rider" with an opt-out;
  - the declared value on the job card.
- **Why:** v1 changes nothing in the rider app. Refusal goes through "Report a problem" plus an ops
  cancel, and preferred riders have no say. `declaredValue` is stored but no API read returns it, so
  riders never see the liability figure.
- **Pros:** Rider consent and a clean refusal path. **Cons:** A Play release through Closed testing.
- **Context:** Design doc L2 "Prohibited goods" and L3 "The rider's side"; CEO review CEO-7.
- **Effort:** human M / CC M. **Priority:** P2.
- **Trigger / blocked by:** the next planned rider-app release after L3 ships.

### TODO-4 · Web Push for bookings and orders

- **What:** Web Push to the merchant web for new offers, a rider's cancel and new restaurant orders on a
  backgrounded phone.
- **Why:** v1 asks the merchant to stay on the page for 90 seconds. A shop owner switching to WhatsApp
  misses the window.
- **Pros:** Fewer expired bookings. **Cons:** VAPID keys, permission prompts, iOS limits.
- **Context:** Design doc Open Question 3.
- **Effort:** human M / CC M. **Priority:** P2.
- **Trigger / blocked by:** the pilot's expired-booking rate above about 20%.

### TODO-5 · The Piranha pass now covers shop bookings

- **What:** When `RESTAURANTS_ENABLED` is retired (the "Post-launch flag cleanup" entry above), note that
  it also gates `/merchant/bookings`. Retire it for both, or split a bookings switch first.
- **Why:** Pulling the restaurants switch in an incident also stops every shop's Book a rider (CEO-4).
- **Pros:** No surprise outage coupling. **Cons:** Paperwork.
- **Context:** Plan §11 F1.4.
- **Effort:** human S / CC S. **Priority:** P3.
- **Trigger / blocked by:** the Piranha pass itself.

### TODO-6 · Reach for a business's own riders beyond Send's radius

- **What:** Let a business's preferred riders see its open bookings on their board beyond Send's widening
  radius (5 → 8 → 12 km). For example, the board also lists open orders whose broadcast sent-set holds
  the caller, with the push and the listing agreeing.
- **Why:** The CEO review dropped an extra push to preferred riders up to 10 km away (OV-2). A rider
  opening that push lands on a 5 km board (`apps/mobile/app/rider/(tabs)/index.tsx:694`) that doesn't list
  the job for 30–60 s (`apps/api/src/orders/orders.service.ts:563`). Being in the sent set would also make
  `expandBroadcast` skip them (`matching.service.ts:335-340`).
- **Pros:** A shop's own courier gets its jobs from farther away. **Cons:** A change on Send's hottest
  read path.
- **Context:** Must stay Send-side with no merchant import (depcruise `express-no-merchant-coupling`).
- **Effort:** human M / CC S. **Priority:** P3.
- **Trigger / blocked by:** pilot data showing preferred riders' offers arriving late or not at all
  because they were out of range.

### TODO-7 · "Share my location" link for buyers

- **What:** The business sends the buyer a `wa.me` message with a LyniaGo link. The buyer taps it, the
  browser asks for their location, and it fills the booking's drop-off.
- **Why:** v1 takes a pasted Google Maps link (short links resolved server-side) or a pin the business
  drops. A buyer who can't produce a link leaves the business guessing, and wrong drop-offs end as
  undelivered.
- **Pros:** Accurate drop-offs without the buyer knowing how to share a map link. **Cons:** A public page
  with its own abuse surface (rate limits, one-time tokens).
- **Context:** Design doc L2 "Drop-off, v1"; CEO review OV-6.
- **Effort:** human M / CC S. **Priority:** P2.
- **Trigger / blocked by:** the pilot's `undelivered` reason `wrong_address` above about 10% of business
  bookings.

### TODO-8 · Merchant terms: write them, publish them, name them at sign-up

- **What:** A merchant terms page (like `GET /legal/privacy`), and the sign-up's one-tap line naming it
  next to the privacy notice ("I accept LyniaGo's merchant terms and privacy notice").
- **Why:** The design doc makes the terms text a dependency. L1 ships the line with the privacy notice
  only, because there are no terms to link. A business signing up today accepts nothing about
  prohibited goods, the $150 Send limit or liability.
- **Pros:** Sign-ups accept real terms, and `merchant_members.terms_accepted_at` means what it says.
  **Cons:** Needs a lawyer or owner-approved text. Businesses that signed up earlier accepted only the
  privacy notice.
- **Context:** Design doc L1.4 and the L2 "Prohibited goods" section; ledger D-43 §3.
- **Effort:** human M (the text) / CC S (the page and the line). **Priority:** P1.
- **Trigger / blocked by:** before the founder sends the sign-up link to shops (which waits for L2).

### TODO-9 · A support WhatsApp number for the merchant web

- **What:** A `NEXT_PUBLIC_SUPPORT_WHATSAPP` build arg (Dockerfile and `deploy-merchant-azure.yml`), from a
  repository variable, that turns on "Message LyniaGo on WhatsApp" on a restaurant's go-live card and
  the Help nav item. Both stay hidden while the number is unset, as the mobile help row does.
- **Why:** The design doc puts a WhatsApp button on the not-live checklist, and Help routes to WhatsApp
  (L5). There is no number anywhere to point them at: the mobile app's `EXPO_PUBLIC_SUPPORT_WHATSAPP` is
  unset too.
- **Pros:** New restaurants can reach ops before the go-live call. **Cons:** A build arg per deployable.
- **Context:** Ledger D-43 §3.
- **Effort:** human S (pick the number) / CC S. **Priority:** P2.
- **Trigger / blocked by:** the owner choosing the support number. Build it with L5's Help item.
- **Status (L2, 2026-09-29):** the plumbing is built: the build arg, `SUPPORT_WHATSAPP` in
  `apps/merchant/app/lib/config.ts`, a shop's Help nav item and the "message LyniaGo" link on a picked-up
  booking. All of it stays hidden until the owner sets the `MERCHANT_SUPPORT_WHATSAPP` repository
  variable (international digits, e.g. `263771234567`) and the merchant web redeploys. The restaurant
  go-live card's button and restaurant Help land with L5.
