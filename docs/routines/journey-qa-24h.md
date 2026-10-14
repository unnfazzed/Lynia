# Journey QA: 24-hour routine plan (2026-10-14 → 2026-10-15)

Goal: a biker and a customer can each get through their core journeys without hitting a blocker, a
crash, a glitch, a slow screen or a dead end, **on a budget Android phone with a weak network**.

The owner's brief (2026-10-14):

- **Biker:** onboarding, KYC, bidding, tracking, finishing a send-package job, wallet top-up, and switching between customer and biker.
- **Customer:** onboarding, Send, and tracking orders.
- **What to look for:** blockers, UI/UX problems, system bugs, crashes and glitches, speed, low connectivity, budget phones.
- **Report only.** No new features or UI. Fixes only when they are absolutely necessary.
- **The code is the truth.** Docs are claims to check.
- **Save tokens.**

This plan is a one-off. It does **not** restart the dormant weekly lanes in `docs/ROUTINES.md`, and
it overrides that spec's "every routine fixes everything and auto-merges" rule for these runs: the
lanes only report, and one closing run fixes the must-fix items (see "Fix threshold" below).

---

## 1. Schedule (UTC; Harare = UTC+2), with one model per run

| # | Runs at (UTC) | Routine | Main model | Helpers it may start | What it does |
|---|---|---|---|---|---|
| R0 | 14 Oct 11:00 | Baseline & harness check | **Haiku** | none | Sets up the stack and runs the journey test suites. Records what is already red, so the other lanes don't rediscover it. |
| R7 | 14 Oct 11:30 | Field signals (real testers) | **Haiku** | none | Pulls Play crashes/ANRs, Expo metrics, slow screens by device and reviews, then maps each one to `file:line`. |
| R1 | 14 Oct 12:00 | Biker onboarding + KYC | **Sonnet** | 1 Opus verifier, only for P0/P1 | |
| R4 | 14 Oct 13:00 | Customer onboarding + Send | **Sonnet** | none | |
| R2 | 14 Oct 14:00 | Biker job loop: board → bid → accept → pick up → deliver → complete | **Sonnet** | 1 Opus verifier, only for P0/P1 | |
| R5 | 14 Oct 15:00 | Customer order tracking | **Sonnet** | none | |
| R3 | 14 Oct 16:00 | Biker wallet top-up + switching between customer and biker | **Sonnet** | 1 Opus verifier, only for P0/P1 | |
| R6 | 14 Oct 17:00 | Low connectivity + budget phone | **Sonnet** | 1 Haiku runner (throttled renders, bundle size) | |
| R8 | 14 Oct 20:00 | Synthesis + must-fix | **Opus** | none | Dedupes everything, fixes only the must-fix list, opens the PR and drives it to green. |
| R9 | 15 Oct 08:00 | Close-out check | **Haiku** | none | Checks R8's PR state and that every lane delivered. Reports any gaps. Writes no code. |

Why the models are split this way:

- **Haiku** gets the mechanical work: running commands, pulling data, filling tables.
- **Sonnet** gets the code-reading lanes, where judgement matters but the volume is high.
- **Opus** runs only twice: as a one-shot skeptic on P0/P1 findings in the sensitive areas (KYC gating,
  bid acceptance and assignment, money), and for the one run that changes code.
- Nothing runs on Opus "just in case".

How the lanes are spaced:

- The lanes run an hour apart, so every report lands on the shared branch before R8 starts.
- R8 starts 3 hours after the last lane, which leaves slack for a lane that overruns.

## 2. Token rules (every routine)

1. **Use the file map below; don't explore.** Each lane is handed its exact files. Do not list
   directories or read unrelated modules. `rg` first, then read narrow line windows (`sed -n a,bp`).
   Never read a file over 400 lines in full.
2. **Never read `docs/KNOWN_BUGS.md` in full** (it is 3,200+ lines). Dedup with
   `rg -n "<file name>|<symbol>|<lane id>" docs/KNOWN_BUGS.md`, then read only the rows that hit.
   Read the ONB-HP, KYC-R26 and NET-FF sections (2026-10-12) only where they touch your lane.
3. **Don't read the design handoffs, the gallery or parity docs.** This is not a pixel-parity audit.
   A "UI/UX issue" here means something that blocks, confuses, misleads, glitches or is slow, not a
   pixel mismatch with a mock.
4. **Run targeted tests only:** `pnpm --filter @lynia/mobile exec jest <paths>` and
   `pnpm --filter @lynia/api exec vitest run <paths>`. Never run the whole monorepo `pnpm test`,
   except R0 once and R8 before pushing.
5. **Caps:** at most **12 verified findings** per lane, P0 and P1 first. Stop exploring once you
   have 12, or after about 90 minutes. A clean lane with a short report is a fine result.
6. **Helpers:** start at most one, and only where the table above allows it. Give it a
   self-contained prompt that includes the `file:line` evidence, so it does not re-explore.
7. **No workflows.** Don't run the `lane-bug-hunt` workflow: its finder × 3-skeptic fan-out costs
   far more than this budget allows.
8. **Write the report once at the end.** Don't paste file dumps into it.

## 3. Shared harness: a real end-to-end stack with no vendors

The code supports a vendor-free QA mode (`apps/api/src/config/env.ts`):

- `OTP_CHANNEL=console` plus `OTP_TEST_PHONES`: requesting an OTP returns the code.
- `KYC_PROVIDER=stub`: KYC runs without calling Didit.
- `PAYMENT_RAIL=stub`: top-up without calling PayNow.

The seed (`apps/api/prisma/seed.ts`) creates a customer (`+263771111111`), 5 verified online
riders around Harare, and an open order.

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres redis          # postgis/postgis:16-3.4
export DATABASE_URL=postgresql://lynia:lynia@localhost:5432/lynia
pnpm --filter @lynia/api prisma:generate && pnpm db:migrate && pnpm db:seed
OTP_CHANNEL=console OTP_TEST_PHONES=+263771111111,+263772222222,+263773333333 \
KYC_PROVIDER=stub PAYMENT_RAIL=stub \
  pnpm --filter @lynia/api start:dev &      # :3000; wait on GET /health
```

Then drive the journey over HTTP (`curl` or a throwaway script in the scratchpad) against the real
controllers. Use `+263772222222` for a new customer and `+263773333333` for a new biker. The
integration specs exercise the real SQL, so run the ones for your lane:

```bash
pnpm --filter @lynia/api test:int src/riders/rider-onboarding.int.spec.ts   # etc.
```

**If Docker or the image pull fails:** note it in the report. Fall back to static review plus the
unit and jest tests, and say exactly which claims are static only. Do not spend more than 10 minutes
fighting the setup.

## 4. Severity and the fix threshold

| Sev | Meaning | What the lane does | What R8 does |
|---|---|---|---|
| **P0** | Crash, hard blocker (a user cannot finish the journey), money or data wrong or lost, or a security hole | Report it with a repro and `file:line`. An Opus skeptic confirms it (R1/R2/R3). | **Fixes it**: minimal diff plus a regression test |
| **P1** | Journey completes, but only with a workaround; stuck states that recover only on restart; spinners past 10 s on Slow 3G; double-submits | Report | Fixes it **only** if the fix is under about 30 lines, touches no UI, and adds no feature. Otherwise it becomes a ledger row. |
| **P2** | Glitch, confusing state, wrong or missing feedback, slow but working | Report | Ledger row only |
| **P3** | Polish | Report as one line, or skip | Nothing |

**Never, in any run:**

- new screens, new copy, layout changes or new features;
- touching `packages/design/**`;
- skipping or disabling a test.

**If a P0 can only be fixed with a UI change:** R8 reports it at the top of the PR body as
**NEEDS OWNER**, and does not build it.

## 5. Output protocol: one branch, one PR

- All lanes push **only their own report file** to the shared branch
  `claude/journey-qa-2026-10-15`, at `docs/reports/journey-qa-2026-10-15/<Rn>-<lane>.md`.
  - Run `git fetch && git pull --rebase` before pushing.
  - Each lane writes a different file, so rebases can't conflict.
  - Retry the push with backoff (2/4/8/16 s).
  - **Lanes open no PR and change no code.**
- Report format: a header (lane, model, harness status: dynamic or static only), then a table with
  the columns `id | sev | journey step | symptom (user's words) | repro | evidence file:line | test
  that proves it | already in KNOWN_BUGS?`.
  - IDs look like `JQ-R2-03`.
  - Measured timings go in a separate "Speed" table.
- **R8** works on the same branch:
  - writes `00-SUMMARY.md` (top blockers per journey, per side);
  - adds the new rows to `docs/KNOWN_BUGS.md` under a `## Journey QA 2026-10-15 (JQ)` section;
  - commits the must-fix fixes;
  - opens **one** draft PR, marks it ready once CI is green, and squash-merges on green (the
    CLAUDE.md merge-on-green policy).

---

## 6. Routine prompts

Every prompt starts with the same preamble. Paste it, then the lane block.

> **Preamble (all routines):** You are running routine `<Rn>` of the Lynia Journey QA plan. First run
> `git fetch origin main && git show origin/main:docs/routines/journey-qa-24h.md`, and follow §2
> (token rules), §3 (harness), §4 (severity, report only) and §5 (output) exactly. Treat the code as
> the truth: every finding cites `file:line` and a command output, test or HTTP trace. Biker copy
> reads "biker" in the UI, while code and routes say `rider`. Do not open a PR, edit code or merge.
> Push only your report to `claude/journey-qa-2026-10-15`, then end.

### R0: Baseline & harness check (Haiku)

1. Bring up §3. Record whether Docker, migrate, seed and API boot worked, and how long each took.
2. Run the mobile jest suites for the journey screens:
   - `app/rider/__tests__`
   - `app/__tests__`
   - `src/realtime/__tests__`
   - `src/kyc/__tests__`
   - `src/net/__tests__`
   - `src/query/__tests__`
3. Run all `apps/api` `*.int.spec.ts`.
4. Run the API unit tests for `offers`, `matching`, `orders`, `kyc`, `wallet`, `tracking`, `riders` and `auth`.
5. Run `node scripts/check-bundle-size.mjs` and compare against `apps/mobile/size-budget.json`.
6. Report every red test as a finding: the failing assertion plus `file:line`. Don't diagnose further.
   Write `R0-baseline.md`, including a "known-red" list for the other lanes to skip.

### R7: Field signals (Haiku, Expo connector)

1. Using the Expo tools, pull the following for the last 14 days of the closed-testing build:
   - `playstore_crashes` (crashes and ANRs);
   - `observe_metrics_summary` and `observe_metrics` (cold start, TTI and screen times, by device model, RAM and Android version);
   - `observe_routes` (the slowest routes);
   - `observe_events` (error events);
   - `playstore_reviews`.
2. For each crash or slow route, find the code it points to with a stack-frame or route `rg`, and
   cite `file:line`.
3. Sort the findings by user impact.
4. Flag anything that only happens on devices with ≤ 3 GB of RAM or Android ≤ 10. Those are the
   budget phones.
5. Write `R7-field.md`.
6. If the Expo tools are unavailable, say so in the report and stop. Do not substitute guesses.

### R1: Biker onboarding + KYC (Sonnet; Opus skeptic for P0/P1)

**Journey:** sign in → role fork → R1–R3 first run → permissions P1–P16 → personal details →
bike & documents → ID check (F1–F8 outcomes) → pending → approved → first time online.

**Files:**

- `apps/mobile/app/{phone,verify,onboarding,permissions}.tsx`
- `app/rider/{become,documents}.tsx`
- `app/profile/setup.tsx`
- `src/kyc/*`
- `src/permissions/*`
- `src/rider-route-gate.tsx`
- `src/rider-mode.ts`
- `apps/api/src/kyc/*`
- `apps/api/src/riders/{rider-profile.service,rider.service,online-gate,riders.controller}.ts`
- `apps/api/src/uploads/*`
- `apps/api/src/auth/auth.{service,controller}.ts`

**Dynamic:** run the whole journey over HTTP with `+263773333333`, using stub KYC (pass, reject and
retry). Then run `rider-onboarding.int.spec.ts` and `plate-review-backfill.int.spec.ts`.

**Hunt for:**

- dead ends: a denied permission, a rejected ID, a retry after rejection;
- resume after the app is killed mid-upload;
- a photo upload on a slow uplink: does it time out per `src/net/network-policy.ts`, and is it retried and resumable?
- a KYC webhook racing the app's poll;
- a pending state that never resolves;
- a biker who can go online before KYC passes, or who stays blocked after it passes;
- the one-ID-one-account rule.

Dedup against KNOWN_BUGS `KYC-R26` and `ONB-HP`.

### R4: Customer onboarding + Send (Sonnet)

**Journey:** cold start → splash → C1–C5 onboarding → phone/OTP → profile → permissions PC1–PC11 →
Home → Send (four steps, inline address editing) → price → place → order screen.

**Files:**

- `apps/mobile/app/{index,_layout,onboarding,phone,verify,permissions,send}.tsx`
- `app/(tabs)/home.tsx`
- `app/profile/setup.tsx`
- `src/boot/*`
- `src/auth/*`
- `src/query/{use-bootstrap,client,persist}.ts`
- `apps/api/src/auth/*`
- `apps/api/src/orders/{orders.controller,orders.service,waypoints}.ts`
- `apps/api/src/pricing/*`

**Dynamic:**

- Sign up `+263772222222` over HTTP and create a send order.
- Repeat the create with the same idempotency key and with a different one (`orders-idempotency.int.spec.ts`).
- Try OTP expiry, a wrong code, and the resend cap (`OTP_RL_PHONE_MAX`).
- Place an order with Places unavailable, so it has to fall back to pin-on-map.

**Hunt for:**

- a double-placed order on a slow network;
- a lost draft after backgrounding or process death;
- an OTP screen that can't be escaped;
- price and quote mismatches between the app and the API;
- boot paths that hang the splash.

### R2: Biker job loop (Sonnet; Opus skeptic for P0/P1)

**Journey:** go online → board shows the job → open the offer → bid → customer accepts → navigate →
pickup proof → deliver with the 6-digit code (3+3) → complete → commission debit.

**Files:**

- `apps/mobile/app/rider/(tabs)/index.tsx`
- `app/rider/offer/[jobId].tsx`
- `app/rider/job.tsx`
- `src/realtime/{use-rider-board,use-rider-job-socket,use-rider-location,use-rider-heartbeat,background-location-task,location-buffer,socket}.ts`
- `src/query/use-pickup-photo.ts`
- `apps/api/src/offers/*`
- `apps/api/src/matching/*`
- `apps/api/src/orders/order-lifecycle.*`
- `apps/api/src/tracking/*`
- `apps/api/src/riders/{online-gate,reliability}.ts`

**Dynamic:**

- Seeded online riders bid on a new order over HTTP.
- Two riders bid at the same time, then the customer accepts.
- The accepted rider cancels.
- Deliver with a wrong code, then the right one.
- Run `offer-loop`, `order-lifecycle` and `tracking` `.int.spec.ts`.

**Hunt for:**

- a bid that is accepted but whose job never appears for the rider (socket missed, no refetch);
- two riders who both believe they won;
- the board showing a job that is already taken;
- a lost stream of location updates in the background;
- complete tapped twice;
- debit missing or doubled;
- a job stuck after the app restarts.

Sensitive lane: the Opus skeptic must confirm every P0/P1 before it is reported as such.

### R5: Customer order tracking (Sonnet)

**Journey:** order placed → waiting for bids → biker assigned → live map → picked up → code shown →
delivered/undelivered/cancelled → Orders tab history → notification taps.

**Files:**

- `apps/mobile/app/order/[id].tsx`
- `app/(tabs)/orders.tsx`
- `app/notifications/index.tsx`
- `app/order-updates.tsx`
- `src/realtime/{use-order-socket,use-foreground-refetch,self-heal-gate,socket-identity}.ts`
- `src/query/{use-order-flow,use-customer-orders,use-sent-offers,seed-order,use-notifications-unread}.ts`
- `src/push/*`
- `apps/api/src/tracking/*`
- `apps/api/src/orders/{lifecycle.controller,cancel-reason}.ts`
- `apps/api/src/notifications/*`

**Dynamic:** drive an order through every terminal state over HTTP while a socket client listens.
Kill the socket mid-trip and confirm the screen recovers by refetching.

**Hunt for:**

- a map frozen on a stale position;
- the stage sheet stuck after a missed event;
- a push opening the wrong order;
- a cancel race with an accept;
- the code not shown or wrong;
- history missing just-finished orders.

### R3: Biker wallet top-up + switching between customer and biker (Sonnet; Opus skeptic for money P0/P1)

**Journey:** Money tab → top up (stub rail) → balance → job debit → low-balance gate → top-up gate.
Switch from customer to biker and back, both from Account and through a push or deep link.

**Files:**

- `apps/mobile/app/wallet/top-up.tsx`
- `app/rider/(tabs)/{money,account}.tsx`
- `app/(tabs)/account.tsx`
- `app/history/*`
- `src/query/{use-topup,use-wallet,use-history-feed}.ts`
- `src/rider-mode.ts`
- `src/rider-route-gate.tsx`
- `app/+native-intent.tsx`
- `apps/api/src/wallet/*`
- `apps/api/src/settlements/*`

**Dynamic:**

- Run a top-up over HTTP, replaying the confirm and webhook twice.
- Run the integrity check with `wallet-integrity.service`.
- Check that the sum of ledger rows equals the balance after a job.
- Switch roles while a job is active or an order is open.

**Hunt for:**

- money credited twice or never;
- a balance that is stale after a top-up;
- the top-up gate blocking a biker who has already paid;
- a role switch that strands the user on the wrong tab stack;
- a rider-only route reachable from customer mode, or the other way round;
- an active job hidden after switching;
- iOS and web, where rider mode must be absent.

### R6: Low connectivity + budget phone (Sonnet + 1 Haiku runner)

**Static review of:**

- `apps/mobile/src/net/*` (timeouts, reachability, the offline banner, NET-FF false flags);
- `src/query/{client,persist}.ts` (retry, cache, persistence);
- `src/realtime/socket.ts` (reconnect and backoff);
- every mutation the journeys use (place order, bid, accept, pickup, deliver, top-up): is it retry-safe after a timeout whose request actually reached the server?
- image and photo sizes;
- work done at boot (`src/boot/*`).

**The Haiku runner (dynamic):**

- Render the customer and biker journey screens through the react-native-web lane (`tools/parity/render-mobile.mjs`) in Playwright (Chromium at `/opt/pw-browsers`).
- Use CDP `Network.emulateNetworkConditions` for Slow 3G (400 kbps, 400 ms RTT) and offline toggles, with `Emulation.setCPUThrottlingRate` 6× as the budget-phone proxy.
- Record the time to first meaningful content per screen, any long tasks over 200 ms, console errors, and whether the offline and retry states appear and then clear.
- Also report the Android Hermes bundle size against its budget, and JS work on the critical boot path.

**Hunt for:**

- infinite spinners;
- silent failures with no retry;
- a "you're offline" banner while online (NET-FF);
- re-uploading whole photos on a retry;
- polling that drains data or battery;
- heavy re-renders on the map screens.

### R8: Synthesis + must-fix (Opus)

1. Check out `claude/journey-qa-2026-10-15`. Read all the `R*.md` reports (not the code yet).
2. Dedupe across lanes, then re-check each P0 and P1 against the code at `file:line`. Drop anything
   that doesn't reproduce.
3. Write `00-SUMMARY.md`:
   - the top problems per journey, biker and customer;
   - a speed table;
   - a low-connectivity verdict;
   - a NEEDS OWNER list.
4. Add the JQ rows to `docs/KNOWN_BUGS.md`, using `rg` to find where they go.
5. Fix the P0s, plus any P1s that pass the §4 filter. Each fix gets one regression test. No UI, no
   copy, no features, nothing in `packages/design/**`.
6. Run `pnpm typecheck && pnpm test` before pushing.
7. Open **one** draft PR. Subscribe to its activity, drive CI to green, mark it ready and
   squash-merge it on green.
8. If a fix touches anything mobile, note that it reaches testers only after a `closed`-profile EAS
   build. Do not dispatch that build; that is the owner's call.

### R9: Close-out (Haiku)

1. Check that R0–R8 each produced their file and that R8's PR is merged or green.
2. List any missing lane, red check or NEEDS OWNER item in a short comment on that PR.
3. No code.

---

## 7. Creating the triggers

- **Kind:** one-shot `run_once_at` Routines, with `create_new_session_on_fire=true`, so each run
  starts clean.
  - The prompt is the preamble plus the lane block above.
  - Connectors: `[]`, except R7 (`["Expo"]`) and R8/R9 (none; they use GitHub through the session).
- **Model:** set each Routine's model per §1 with `update_trigger` straight after it is created.
- **Plan on `main` first:** this plan must be on `main` before R0 fires, because the preamble reads
  it from `origin/main`.
- **Expected total:** roughly 3 Haiku runs, 6 Sonnet runs, Opus for a handful of skeptic checks, and
  1 Opus fix run. That is about a third of the cost of running the eight lanes on Opus.
