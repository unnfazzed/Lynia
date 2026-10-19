# TODOS

Deferred work with context. Each entry records what/why/trigger so a pickup months later
starts from reasoning, not archaeology.

## Wallet / commission (from /plan-eng-review 2026-07-13, rider-wallet design)

### 1. EcoCash provider-statement reconciliation

- **What:** Periodic job (or ops procedure) matching Econet's merchant statement exports
  against confirmed `TopUp` rows.
- **Why:** The nightly integrity job (`WalletIntegrityService`, `POST /admin/wallet/integrity-check`,
  run nightly by the `caj-lynia-wallet-integrity` job in `infra/azure/jobs.tf`) proves our own ledger is internally consistent —
  balance == sum(ledger), every confirmed top-up credited, no orphan credits; only statement
  matching catches money that reached the merchant account but never credited a wallet (or a
  credit with no matching receipt).
- **Pros:** Closes the last money-visibility gap; turns "where did the rider's $5 go"
  disputes into a lookup.
- **Cons:** Needs statement-export access from Econet; meaningless at pilot volume.
- **Context:** Deliberately cut from the wallet build (Approach A, design doc
  `docs/archive/plans/2026-rider-wallet-design.md`). The wallet ships with an internal
  ledger-vs-balance integrity job only — that job (design step 6) was specified but unbuilt
  until roadmap item 1.3 landed it; this remaining item is the *external* statement-matching half.
- **Trigger / blocked by:** EcoCash rail live (wallet PR2) AND sustained top-up volume (guide: >20
  confirmed top-ups/week). The rider commission is already on: 10% after a rider's first 10 jobs
  (`COMMISSION` in `packages/shared/src/policy.ts`, owner 2026-10-12).

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
- **Why:** Merchant commission is still 0% (`RESTAURANTS_COMMISSION` in
  `packages/shared/src/restaurants-order.ts`; the rider commission is separate) with ledger accrual only; the concept defers settlement
  infra ~6–8 months, but nothing tracked says so — the accruing ledger silently becomes real
  money owed with no way to collect it.
- **Pros:** Converts an implicit deferral into a scheduled decision with a tripwire.
- **Cons:** Pure paperwork today.
- **Context:** Mirrors the wallet TODOs' tripwire style. Commission ledger entries accrue from
  the first merchant order; settlement is the missing half.
- **Trigger / blocked by:** Any decision to schedule commission rate > 0% — settlement must be
  built BEFORE the rate flips.
- **Partly real now (2026-10-19):** Own bikers bills merchants for real: a weekly fleet bill per owner
  (`merchant_fleet_statements`, closed hourly, due the Friday after, marked paid in the console). That is the first
  merchant charge, and the place merchant commission settlement should grow from (one bill per owner). See
  `docs/designs/own-bikers.md` amendments 12–13 and `apps/api/src/merchant/fleet-bills.ts`.

## Merchant web upgrade (from /plan-ceo-review 2026-09-29, `docs/archive/plans/2026-09-29-merchant-web-upgrade-plan.md` §11)

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
- **Partly superseded (2026-10-19):** the consent half ("{Business} calls you their rider" with an opt-out) is
  replaced by Own bikers, where a biker joins a business only by accepting its invite link, and leaves any time
  (`docs/designs/own-bikers.md`, ledger D-117). Preferred riders itself is retired behind `PREFERRED_RETIRED`. The
  prohibited-goods refusal and the declared value on the job card are still open.

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

- **What:** A `NEXT_PUBLIC_SUPPORT_WHATSAPP` build arg (`deploy-merchant-web.yml`), from a
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

## Own bikers (from /plan-ceo-review 2026-10-19, `docs/designs/own-bikers.md`)

### Delete the Preferred riders code

- **What:** Remove Preferred riders: `merchant/preferred-riders.ts`, the preferred-first block in
  `NearestRiderDispatchStrategy`, `PREFERRED_OFFER_BONUS` and the offer `preferred` flag, `merchant-riders.*` and its
  routes, `PreferredRetirementService`, the `PREFERRED_RETIRED` flag, and the `merchant_preferred_riders` table (a
  migration; the OB-M5 invite suggestions read it, so move those to their own source or drop them first).
- **Why:** Own bikers replaces it (owner decision D6). The code stays only so unsetting the flag can roll the
  retirement back.
- **Pros:** One way a business has its own bikers; less dispatch code. **Cons:** Rollback is gone after this.
- **Context:** T9 shipped the retirement behind `PREFERRED_RETIRED` (plan amendment 14, Distribution Plan).
- **Effort:** human S / CC S. **Priority:** P2.
- **Trigger / blocked by:** `PREFERRED_RETIRED=true` in production for two weeks with no rollback.

### Fleet batching: multi-order trips for Own bikers

- **What:** Let an Own biker carry 2–3 nearby orders on one trip.
- **Why:** Big multi-branch chains batch at rush hour. Today the `one_active_ride` unique index
  (`apps/api/prisma/migrations/0001_init/migration.sql:150`) allows one active ride per biker.
- **Pros:** Chain throughput. It's a selling point for big clients.
- **Cons:** It changes the core order lifecycle (one rider per active order, codes, cash handshake, tracking).
- **Context:** The CEO review outside voice (finding #6) raised it. It was kept out of the Own bikers v1 scope
  (SCOPE REDUCTION mode). Start from the index, `ACTIVE_RIDE_STATUSES` and the dispatch "one active ride"
  gate.
- **Effort:** human XL / CC L. **Priority:** P2.
- **Trigger / blocked by:** Own bikers v1 live with at least one chain.
