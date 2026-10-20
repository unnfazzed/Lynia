# Journey QA: 24-hour routine plan (2026-10-14 → 2026-10-15)

**Goal:** a biker and a customer can each get through their core journeys without hitting a blocker, a
crash, a glitch, a slow screen or a dead end, **on a budget Android phone with a weak network**.

The owner's brief (2026-10-14):

- **Biker:** onboarding, KYC, bidding, tracking, completing a send-package job, wallet top-up, and switching between customer and biker.
- **Customer:** onboarding, Send, and tracking orders.
- **Look for:** blockers, UI/UX issues, system bugs, crashes and glitches, speed, low connectivity and budget phones.
- **Report only.** No new features and no new UI. Fixes only when they are absolutely necessary.
- **The code is the truth.** Docs are claims to verify.
- **Save tokens.**

This plan was verified against the code on 2026-10-14 by an Opus planning review at extra-high
effort. It checked every path, route and env var below, citing `file:line`.

It is a one-off plan. It does **not** restart the dormant weekly lanes in `docs/ROUTINES.md`, and it
overrides that spec's "every routine fixes everything and auto-merges" rule for these runs:

- the lanes report only;
- one closing run fixes the must-fix items (see §5).

---

## 1. Schedule (UTC; Harare = UTC+2) and the model for each run

| # | Fires (UTC) | Routine | Model | Helper allowed | Live or static |
|---|---|---|---|---|---|
| R0 | 14 Oct 12:00 | Harness + baseline | **Sonnet** | none | Live. Publishes the shared harness scripts. |
| R7 | 14 Oct 12:05 | Field signals (real testers) | **Haiku** | none | Read-only (Expo/Play) |
| R1 | 14 Oct 13:30 | Biker onboarding + KYC | **Sonnet** | 1 Opus skeptic, P0/P1 only | Live |
| R4 | 14 Oct 14:30 | Customer onboarding + Send | **Sonnet** | none | Live |
| R2 | 14 Oct 15:30 | Biker job loop + the customer's live view of it | **Sonnet** | 1 Opus skeptic, P0/P1 only | Live; records a trace for R5 |
| R3 | 14 Oct 16:30 | Biker wallet top-up + switching between customer and biker | **Sonnet** | 1 Opus skeptic, money P0/P1 only | Live (wallet); static (switch) |
| R5 | 14 Oct 17:30 | Customer order tracking | **Sonnet** | none | Static, plus R2's trace (no harness boot) |
| R6 | 14 Oct 18:30 | Low connectivity + budget phone | **Sonnet** | none | Live, through a latency/drop proxy |
| R8 | 14 Oct 21:30 | Synthesis + must-fix | **Opus** | none | Writes code |
| R9 | 15 Oct 09:00 | Close-out | **Haiku** | none | Read-only |

Why the models are split this way:

- **Haiku** only does pure data pulls.
- **Sonnet** does the code-reading and journey-driving lanes.
- **R0 runs on Sonnet, not Haiku**, because it writes the harness every later lane reuses. Getting
  that right once is cheaper than six lanes each rediscovering the routes.
- **Opus** is used only for:
  - a one-shot skeptic pass on P0/P1 findings in the sensitive areas: KYC gating, bid acceptance and assignment, money;
  - R8, the only run that changes code.

On timing:

- R1 and the later lanes start after R0, so they inherit its harness.
- R5 starts after R2, so it can read R2's trace.
- R8 has a 3-hour buffer after the last lane.

## 2. Token rules (every routine)

1. **Use the file map in your lane block; don't explore.**
   - `rg` first, then read narrow windows (`sed -n a,bp`).
   - Never read a file over 400 lines in full.
   - Don't list directories outside your lane.
2. **Use the route table (§4) and the harness (§3). Don't rediscover endpoints.**
3. **Never read `docs/KNOWN_BUGS.md` in full** (it is 3,200+ lines).
   - Dedup with `rg -n "<file>|<symbol>|<id>" docs/KNOWN_BUGS.md` and read only the rows that hit.
   - The 2026-10-12 sections `ONB-HP`, `KYC-R26` and `NET-FF` are the most relevant.
4. **Skip the design handoffs, the gallery and the parity docs.** This is not a pixel audit. A "UI/UX
   issue" here means something that blocks, confuses, misleads, glitches or is slow.
5. **Run targeted tests only.**
   - Mobile: `pnpm --filter @lynia/mobile exec jest '<path>'`. Escape parentheses in paths, e.g. `'app/rider/\(tabs\)'`.
   - API unit tests: `pnpm --filter @lynia/api exec vitest run <path>`.
   - API int specs: `pnpm --filter @lynia/api test:int <path>`. The plain `vitest run` excludes `*.int.spec.ts` and forces commission to 0%.
   - The full suite is for R8 only.
6. **Caps:** at most **12 verified findings** per lane, P0 and P1 first. Stop at 12 or after about 90
   minutes. A clean lane with a short report is a good result.
7. **Helpers:** at most one, and only where §1 allows it. Give it a self-contained prompt with the
   `file:line` evidence, so it doesn't re-explore.
8. **No workflows.** `lane-bug-hunt`'s finder × 3-skeptic fan-out is far over budget.
9. **Write the report once, at the end. Keep file dumps out of it.**

## 3. Shared harness: a real stack with no vendors

There is **no Docker daemon** in the cloud container (`/var/run/docker.sock` is missing).
`redis-server` and Postgres 16 are installed natively, but PostGIS is not. Spend at most **10 minutes**
on getting PostGIS. If it fails, say so in the report and run static-only, naming each claim that is
static.

```bash
pnpm install --frozen-lockfile && pnpm --filter @lynia/shared build    # shared resolves to dist/
redis-server --daemonize yes
# PostGIS, option (a): sudo dockerd >/tmp/dockerd.log 2>&1 & sleep 5 && docker compose up -d postgres
# PostGIS, option (b): sudo apt-get update && sudo apt-get install -y postgresql-16-postgis-3 && sudo pg_ctlcluster 16 main start
#                       then create the role and database lynia/lynia (CREATEDB) and CREATE EXTENSION postgis
export NODE_ENV=development
export DATABASE_URL='postgresql://lynia:lynia@localhost:5432/lynia?schema=public'
export REDIS_URL=redis://localhost:6379
export OTP_CHANNEL=console KYC_PROVIDER=stub KYC_MODE=auto PAYMENT_RAIL=stub PUSH_PROVIDER=noop
# QA-S02: the API defaults every vertical OFF; production (and the app's fail-open default) has them ON.
export RESTAURANTS_ENABLED=true SHOPS_ENABLED=true PHARMACY_ENABLED=true
# QA-S02: browser surfaces need their origins allowed (empty = every browser origin refused).
export CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:8082,http://localhost:3100,http://localhost:3200
# Dev defaults for the JWT/PII secrets are fine (only refused in production). Commission defaults to 10% after 10 free jobs.
pnpm --filter @lynia/api prisma:generate && pnpm db:migrate
pnpm --filter @lynia/api test:int src/<lane>.int.spec.ts      # BEFORE seeding: int specs deleteMany profiles/riders/orders
pnpm db:seed
pnpm --filter @lynia/api build && (cd apps/api && node dist/main.js > /tmp/api.log 2>&1 &)
until curl -sf localhost:3000/healthz; do sleep 2; done      # /healthz, not /health
# Admin JWT (admin sign-in by OTP is refused):
ADMIN_ID=$(psql "$DATABASE_URL" -tAc "select id from profiles where phone='+263770000000'")
ADMIN_JWT=$(cd apps/api && node -e 'console.log(require("jsonwebtoken").sign({role:"admin"},"dev-insecure-secret-change-me-please",{subject:process.argv[1],expiresIn:"2h",algorithm:"HS256"}))' "$ADMIN_ID")
```

### Facts the harness depends on

- **The API does not load `.env`.** Export the variables.
- **Sockets:** `socket.io-client` lives only in `apps/mobile`. The harness scripts are ESM, which ignores
  `NODE_PATH`, so symlink `harness/node_modules` → `apps/mobile/node_modules` (JQ-R2-02; the 2026-10-15
  `up.sh` does this, and the link is gitignored).
- **psql:** libpq rejects Prisma's `?schema=public`, so call psql with `${DATABASE_URL%%\?*}` (JQ-R4-01/02).
- **OTP:** with `OTP_CHANNEL=console` in development, `POST /auth/otp/request` returns `devCode` for
  **any** `+263` phone (`auth.service.ts:482-485`). `OTP_TEST_PHONES` only matters in production.
- **Seeded accounts:**
  - customer `+263771111111`;
  - admin `+263770000000`;
  - **merchant `+263773333333`** (don't use it as a biker: `role_not_allowed`);
  - riders `+263782000000` … `+263782000004`.
- **Fresh test phones:** customer `+263772222222`, biker `+263774444444`.
- **The `/riders/become` gate:** it needs a name set first (`PATCH /auth/me`), or it fails with
  `name_required`.
- **KYC outcomes can't be chosen through the stub vendor:**
  - With `KYC_MODE=auto` the rider is verified instantly at `/riders/become` (`rider.service.ts:458-464`).
  - To test pending, failed or retry, restart the API with `KYC_MODE=manual` and decide with
    `POST /admin/riders/:profileId/kyc` (admin JWT).
  - To test the webhook race: set `riders.kyc_ref`, then POST an unsigned body to `/kyc/callback`.
    Only a dev + stub stack accepts that (`kyc.controller.ts:138-141`).
- **A top-up on the stub rail never completes.** The intent expires after 90 s
  (`wallet.service.ts:505-507`), and there is no confirm call or webhook.
  - Credit through the admin routes in §4 instead.
  - Test replays with the `idempotencyKey` on `POST /wallet/topups`.
  - The Paynow webhook only runs with `PAYMENT_RAIL=paynow` plus its four secrets.
- **Seeded riders can't bid as-is.** They have 30–70 trips and a $0 wallet, so the commission-cover
  check refuses them (`offers.service.ts:146`, `matching.service.ts:121`).
  - Credit them first, or use a fresh biker, who gets 10 free jobs.
  - Bids stay choosable only while the rider is reachable (about 15 min, `common/rider-selectable.ts`),
    so send `POST /riders/heartbeat` before bidding.
- **The rider has no "complete" call.**
  - `POST /orders/:id/deliver` with the 6-digit code makes the order `delivered`.
  - It becomes `completed` when the customer rates it (`POST /orders/:id/rating`) or when it auto-closes.
  - Commission is charged at completion (`wallet.service.ts:292`, `order-lifecycle.transitions.ts:306-324`).
- **Postgres in Docker (QA-S02):** if `docker compose up -d postgres` holds `:5432` (postgis, `lynia/lynia`),
  use it; don't also start the native cluster. `up.sh` checks for the container first.
- **Customer web build (QA-S02):** a release-mode web build refuses a loopback API URL (`src/config.ts`), so
  point it at the Docker bridge, and clear Metro's cache or it can serve an older bundle:
  `cd apps/mobile && EXPO_PUBLIC_LYNIA_WEB=1 EXPO_NO_WEB_SETUP=1 EXPO_PUBLIC_API_URL=http://172.17.0.1:3000 pnpm exec expo export --clear --platform web --output-dir <dir>`,
  then `EXPO_PUBLIC_API_URL=http://172.17.0.1:3000 node apps/customer-web/finish-build.mjs <dir>` and serve `<dir>` on `:8081`.
- **Upload URLs** (`/uploads/*`) will probably 500 locally, because there are no storage credentials.
  Treat photo upload as static-only.
- **Socket lifetime:** the server closes a socket when its access token expires (15 min,
  `tracking.gateway.ts`). That matters for long trips.

### R0 publishes the harness, every later lane reuses it

R0 commits `docs/reports/journey-qa-2026-10-15/harness/up.sh` (the block above, made idempotent) and
`drive.mjs`. `drive.mjs` exposes these helpers:

- `login(phone)` through `devCode`;
- `adminJwt()`;
- `setName`, `become`, `credit(riderId, amt)`, `heartbeat`;
- `createSend`, `bid`, `select`, `stage(to)`, `pickupPhoto`, `revealCode`, `deliver(code)`, `rate`, `cancel`;
- `listen(orderId)`, a socket listener that logs events with timestamps.

**Lanes import it. They never rewrite it.**

## 4. Route table (no global prefix; bearer token on everything except OTP, `/kyc/callback` and `/healthz`)

| Step | Method + path | Body / notes | Code |
|---|---|---|---|
| Request OTP | POST `/auth/otp/request` | `{phone}` → `{sent, channel, deliveryChannel, devCode}` | auth.controller.ts:37 |
| Verify OTP | POST `/auth/otp/verify` | `{phone, code}`; optional `x-device-id` (3 new accounts per device per day) → tokens, role, needsProfile | :50 |
| Name / me | PATCH `/auth/me {firstName,lastName}` · GET `/auth/me` | GET includes the KYC state | :92 / :83 |
| Bootstrap | GET `/app/bootstrap` | | app-bootstrap.controller.ts:39 |
| Rider profile | PATCH `/riders/profile {firstName,lastName,idNumber}` | | riders.controller.ts:82 |
| Become biker (starts KYC) | POST `/riders/become {bikeReg?, photoUrl?}` | | :92 |
| KYC retry / launched | POST `/riders/kyc/retry {force?}` · POST `/riders/kyc/launched` | | :104 / :115 |
| KYC decision (manual mode) | POST `/admin/riders/:profileId/kyc` | admin; `{status: pending\|verified\|failed\|expired, reasonCode?, resetAttempts?}` | kyc.controller.ts:240 |
| KYC webhook | POST `/kyc/callback` | `{session_id: kyc_ref, status, webhook_type:"status.updated"}` | :116 |
| Upload URL | POST `/uploads/{kyc-photo,pickup-photo,delivery-proof} {contentType}` | probably 500s locally | uploads.controller.ts:48/62/76 |
| Online / heartbeat | PATCH `/riders/online {online,lat,lng}` · POST `/riders/heartbeat {lat,lng}` | | :120 / :129 |
| Create Send | POST `/orders` | `{pickup:{point:{lat,lng}}, dropoff, proposedFare, idempotencyKey?, disclaimerVersion?}`; 20/min | orders.controller.ts:22 |
| Raise price | POST `/orders/:id/price {proposedFare}` | | :138 |
| Board | GET `/orders/open?lat&lng&radiusM` · WS `board:subscribe` | | :75 |
| Bid / withdraw | POST `/orders/:id/offers {type:accept\|counter, offeredFare, etaMinutes}` · DELETE `/orders/:id/offers/mine` | commission-cover check | offers.controller.ts:19 / :30 |
| List bids | GET `/orders/:id/offers` | | :36 |
| **Customer accepts a bid** | POST `/orders/:id/offers/:offerId/select` | | matching.controller.ts:15 |
| Rider stages | POST `/orders/:id/status {to}` | confirmed → en_route_pickup → picked_up → en_route_dropoff | lifecycle.controller.ts:30 |
| Pickup photo | POST `/orders/:id/pickup-photo {key}` | not required for parcels | :52 |
| Delivery code (customer) | POST `/orders/:id/delivery-code/reveal` · `/rotate` | | :118 / :127 |
| Deliver | POST `/orders/:id/deliver {code}` | 6 digits, 5 attempts (`order-lifecycle.service.ts:415`) | :75 |
| Complete | POST `/orders/:id/rating {score,…}` (customer) | | :96 |
| Undelivered / cancel | POST `/orders/:id/undelivered {reason}` · POST `/orders/:id/cancel {reason}` | | :86 / :147 |
| Read | GET `/orders/:id`, `/orders/mine/active-orders`, `/orders/mine/history`, `/orders/history` | | orders.controller.ts |
| Wallet | GET `/wallet`, `/wallet/config`, `/wallet/ledger` | | wallet.controller.ts |
| Top-up | POST `/wallet/topups {amount, rail:"ecocash", phone, idempotencyKey?}` · GET `/wallet/topups/:id` | stub: stays pending, expires after 90 s | :45 / :51 |
| Credit (stands in for the stub rail) | POST `/admin/riders/:id/wallet-credit {amount, rail:"manual", idempotencyKey}` · POST `/admin/topups/:id/credit-paid {reason}` | admin; daily cap | admin.controller.ts:731 / :768 |
| Integrity check | POST `/admin/wallet/integrity-check` | admin | wallet-integrity.controller.ts:17 |
| Socket | `io(API,{auth:{token}})`; emit `subscribe:order`, `board:subscribe`, `rider:location`; listen `order:status`, `position` | closed when the token expires (15 min) | tracking.gateway.ts:159 / :234 |

## 5. Severity and the fix threshold

| Sev | Meaning | Lane | R8 |
|---|---|---|---|
| **P0** | Crash; hard blocker (the user cannot finish the journey); money or data wrong or lost; a security hole | Report with a repro and `file:line`. In R1/R2/R3 the Opus skeptic must confirm it. | **Fix**: minimal diff plus one regression test |
| **P1** | Completes only with a workaround; stuck until restart; a double-submit; a wait longer than the `src/net/network-policy.ts` timeout tier with no feedback | Report | Fix **only if** the fix is under about 30 lines, touches no UI and adds no feature. Otherwise it becomes a ledger row. |
| **P2** | Glitch, confusing or wrong feedback, slow but works | Report | Ledger row |
| **P3** | Polish | One line, or skip | Nothing |

**Never, in any run:**

- new screens, copy, layout or features;
- touching `packages/design/**`;
- skipping or disabling a test.

**If a P0 needs a UI change to fix,** R8 lists it as **NEEDS OWNER** at the top of the PR. It does not
build it.

**Mark findings that main already fixes.** Testers run builds older than #1185/#1187, and OTA updates
publish only by manual dispatch. Tag a finding `fixed-on-main-not-shipped` when main already fixes it.
That is a shipping problem, not a code fix.

## 6. Output protocol: one branch, one PR

- **Shared branch:** `claude/journey-qa-2026-10-15`. The first lane to find it missing creates it from
  `origin/main`.
- **What lanes push:** only `docs/reports/journey-qa-2026-10-15/<Rn>-<lane>.md`, plus R0's `harness/`
  and R2's `R2-trace.jsonl`.
  - `git pull --rebase` before pushing; files never overlap.
  - Retry the push with backoff (2/4/8/16 s).
  - **Lanes open no PR and change no code.**
- **Report layout:** a header (lane, model, harness: live or static-only, main SHA), then a table with
  the columns `id | sev | journey step | what the user sees | repro | evidence file:line | proof (test,
  trace or command) | in KNOWN_BUGS? | fixed-on-main-not-shipped?`.
  - IDs look like `JQ-R2-03`.
  - Timings go in a separate "Speed" table.
- **R8:**
  - writes `00-SUMMARY.md` on the same branch;
  - adds a `## Journey QA 2026-10-15 (JQ)` section to `docs/KNOWN_BUGS.md`;
  - commits the fixes;
  - opens **one** PR and squash-merges it on green (the CLAUDE.md merge-on-green policy).

---

## 7. Routine prompts (the preamble plus one lane block)

> **Preamble (every routine):** You are routine `<Rn>` of the Lynia Journey QA plan. Read
> `docs/routines/journey-qa-24h.md` on `origin/main` (`git fetch origin main && git show
> origin/main:docs/routines/journey-qa-24h.md`). Follow §2 (tokens), §3 (harness), §4 (routes), §5
> (severity; report only) and §6 (output) exactly. The code is the truth: every finding cites
> `file:line` plus a test, trace or command output. The UI says "biker"; code and routes say `rider`.
> Rider mode is Android-only (`src/rider-mode.ts`). Jest runs as iOS with rider mode mocked on, so
> testing the iOS/web gate needs a per-test override. Don't open a PR, edit app code or merge. Push your
> report to `claude/journey-qa-2026-10-15`, then stop.

### R0: Harness + baseline (Sonnet)

1. **Known-red list from main's latest CI.** Read the last completed `ci.yml` run on `main` with
   GitHub Actions (list runs, then the job logs). Don't re-run the suites locally. Record:
   - every red job and test;
   - the `mobile-bundle-size` measurement against `apps/mobile/size-budget.json`.
2. **Bring up §3.** Record whether each step worked and how long it took. Spend at most 10 minutes on PostGIS.
3. **Write `harness/up.sh` and `harness/drive.mjs`** (§3).
4. **Prove the harness with one full happy path, timing each call:**
   1. new customer `+263772222222`: login → create Send;
   2. new biker `+263774444444`: login → name → become (auto-verified) → online → heartbeat → bid;
   3. select → stages → reveal code → deliver → rate;
   4. check `/wallet/ledger`.
5. **Run the int specs before seeding:** `offer-loop`, `order-lifecycle`, `orders-idempotency`,
   `tracking`, `rider-onboarding`, `refresh-rotation`. Then seed again.
6. **Report:** any step that fails is a finding. Write `R0-baseline.md` with the known-red list, harness
   status, the happy-path timings, and anything the later lanes must know.

### R7: Field signals (Haiku; Expo, plus Sentry/PostHog if connected)

These sources were checked on 2026-10-14 at 10:26 UTC. Don't spend calls re-proving the results,
except as noted.

- **Expo Observe is empty.** `observe_versions` and `observe_event_names` return nothing, because the app
  ships no EAS Observe SDK. Skip all `observe_*` tools.
- **Play crashes work (fixed 2026-10-15).** `playstore_crashes` (package `zw.co.lynia`) had failed with
  `invalid_grant: account not found`: the Expo account held a dead key from the suspended `lynia-500911`
  project. That key is removed and `play-upload@lyniago-app` has the reports permission. Pull it every
  run; "No crash or ANR issues found" is a real empty result.
- **Sentry and PostHog are readable through their own claude.ai connectors** (connected 2026-10-14
  ~10:30 UTC). The Expo connector itself has no tools for them.
  - **Sentry works and has real data.**
    - Org `lyniago`, `regionUrl: https://us.sentry.io`, projects `lynia-mobile` and `lynia-api`.
    - Known issues on 2026-10-14: `LYNIA-MOBILE-3` and `LYNIA-MOBILE-6`, both "compose-map-not-loaded"
      (`src/ui/ComposeMap`, `app/order/[id]`; 3 users).
  - **PostHog works on the EU org.** The connector was reconnected 2026-10-14 ~10:50 UTC.
    - Org `LyniaGo-iqIUfRem`, project `219333` (`https://eu.posthog.com/project/219333/`).
    - Last 30 days: **2,538 `$screen` events** (latest 2026-10-14 08:16 UTC). Custom events are nearly
      absent: 1 `rider_screen_shown` and 1 `rider_go_online`.
    - **So build the journeys from `$screen` paths**, using `$screen_name`: `query-paths` and
      `query-funnel` on screen views. Don't use custom events.
    - `read-data-schema` returned an internal error on 2026-10-14. Use `execute-sql` on `events` instead.
    - The Expo↔PostHog link's refresh token is revoked (`eas integrations:posthog:connect` fails), but
      the EAS env already holds the EU key and host. Record it as NEEDS OWNER: re-link it in Expo →
      Connections.
  - **LogRocket and Vexo** are linked in the Expo dashboard, but `apps/mobile` contains no SDK for either,
    so they have no data. Skip both.

Steps:

1. **Build info.** Use `build_list` (`appFullName: "@lyniago/lynia"`, ANDROID, limit 5) to find the build
   closed testers run now. Record its commit SHA and date, and compare them with `main`'s
   #1185/#1187/#1160 merges.
2. **Sentry.** Load the Sentry tools with `ToolSearch` (e.g. `select:mcp__Sentry__search_issues,mcp__Sentry__get_sentry_resource`).
   - Run `search_issues` on `lynia-mobile` and `lynia-api` (org `lyniago`, the regionUrl above, period
     14d, sorted by `user`, limit 10).
   - Run `get_sentry_resource` on each issue that hits a journey.
   - Group the issues by signature, and add release, device model, RAM and OS version.
   - If the Sentry tools don't load in this session, record that and continue.
3. **PostHog (EU project 219333).** Use the `exec` tool, and `execute-sql` on `events` filtered by `$screen_name`:
   - the funnel drop-off for the two journeys:
     - customer: onboarding → OTP verified → Send placed;
     - biker: become → KYC verified → first bid → first delivery;
   - which screens are slow or hit errors.

   - where sessions end, i.e. the last screen before quitting;
   - screens with long dwell, i.e. waiting;
   - repeat visits that suggest a loop.

   Map each `$screen_name` to its route file with `rg`.
   Note it as a finding that the app emits almost no custom journey events (`src/telemetry/analytics.tsx`).
4. **Play.** Make one `playstore_crashes` attempt (see above). If it works, also pull `playstore_reviews`.
5. **Map to code.** Map each crash, error or funnel cliff to code with `rg` on its stack frames, event or
   route, citing `file:line`. Flag anything that only happens on devices with ≤ 3 GB of RAM or Android ≤ 10.
6. **NEEDS OWNER**, for each of these that stayed unreachable:
   - the Sentry connector;
   - the PostHog connector;
   - the Play credential;
   - client RUM sent to `/client-metrics` (`apps/api/src/observability/client-metrics.controller.ts`),
     which has no connector.
7. Write `R7-field.md`.

### R1: Biker onboarding + KYC (Sonnet; Opus skeptic for P0/P1)

**Journey:** sign in → role fork → first run R1–R3 → permissions P1–P16 → personal details →
bike & documents → ID check (outcomes F1–F8) → pending → approved → first time online.

**Files:**

- Screens: `apps/mobile/app/{phone,verify,onboarding,permissions}.tsx`, `app/rider/{become,documents}.tsx`,
  `app/rider/(tabs)/index.tsx` (KYC pending/outcome UI and the permission board), `app/profile/setup.tsx`.
- `src/kyc/{KycCheckHost.tsx,launch-hint.ts,verify.ts,navigation.ts}`
- `src/logic/{become-state,kyc-outcome,kyc-draft,rider-gate,rider-perm-flow,rider-documents,national-id,rider-welcome,image-downscale}.ts`
- `src/ui/firstrun/RiderPermBoard*`, `src/permissions/*`
- `src/auth/{device-state,session-role-sync,dev-code-handoff}.ts`
- `src/api/{riders,uploads}.ts`
- `src/rider-route-gate.tsx`, `src/rider-mode.ts`
- API: `apps/api/src/kyc/*`, `riders/{rider.service,rider-profile.service,online-gate,riders.controller}.ts`,
  `auth/auth.{service,controller}.ts`, `uploads/*`, `adapters/storage/{azure-blob.storage,upload-verifier}.ts`

**Check first (recent changes):**

- #1160: `rider.service.ts`, `become.tsx`, `rider/(tabs)/index.tsx`, `kyc-reconcile.service.ts`,
  `auth/device-state.ts`, `kyc/launch-hint.ts`.
- #1185: the auth calling-code check, refused sessions and rate-limit refunds.
- #1185: the Azure upload link is now create-only, so a retried PUT gets 409; the new client treats
  409 as success. Builds without that client show "Photo upload failed" on a slow-network retry.
  Confirm this, and tag it `fixed-on-main-not-shipped` if it holds.

**Live runs:**

- `+263774444444` through become (auto mode).
- Restart with `KYC_MODE=manual` and run pending → failed → `/riders/kyc/retry` → verified.
- The webhook race: `/kyc/callback` against the app's poll.
- Try to go online before KYC passes, and check the biker is not still blocked after it passes.
- The one-ID-one-account rule: become with an `idNumber` that is already in use.

**Hunt for:**

- dead ends after a denied permission or a rejected ID;
- resuming after the app is killed mid-step (`kyc-draft`);
- a pending state that never resolves;
- the role fork sending a biker to the wrong home.

### R4: Customer onboarding + Send (Sonnet)

**Journey:** cold start → splash → C1–C5 → phone/OTP → profile → permissions PC1–PC11 → Home → Send
(4 steps) → price → place → order screen.

**Files:**

- Screens: `apps/mobile/app/{index,_layout,onboarding,phone,verify,permissions,send}.tsx`,
  `app/(tabs)/home.tsx`, `app/profile/setup.tsx`.
- Boot and auth: `src/boot/*` (incl. `BootSplash.tsx`, `boot-readiness.ts`), `src/auth/*`,
  `src/query/{use-bootstrap,client,persist}.ts`.
- Send: `src/logic/{send-draft,send-steps,order-draft,use-placing-guard,fare-band,otp,boot-route,sign-in-route}.ts`,
  `src/ui/send/*`, `src/api/{auth,orders,places}.ts`.
- API: `apps/api/src/auth/*`, `app-bootstrap/*`, `orders/{orders.controller,orders.service,waypoints}.ts`,
  `pricing/*`.

**Check first:**

- #1185: `phone.tsx`, `verify.tsx`.
- #1160: the boot splash, `use-bootstrap.ts`, `app/index.tsx`, `_layout.tsx`, `onboarding.tsx`, `permissions.tsx`.
- #1155: `orders.service.ts`, `waypoints.ts`.
- **Field signal:** Sentry `LYNIA-MOBILE-3` "compose-map-not-loaded" in `src/ui/ComposeMap` (the Send map; 2 users, 10 events). Find why the map fails to load, e.g. a slow link, a missing key or a WebView/tiles timeout.

**Live runs:**

- Sign up `+263772222222`: wrong code, expired code, the resend cap (`OTP_RL_PHONE_MAX`), and the
  per-device cap on new accounts.
- `POST /orders` twice with the same `idempotencyKey`, and with none.
- The 20/min rate limit.
- Create with an out-of-area pickup.

**Hunt for:**

- an order placed twice on a slow network (`use-placing-guard`);
- a draft lost after backgrounding or process death;
- an OTP screen with no way out;
- the app's fare band disagreeing with the server's check;
- a splash that hangs at boot;
- Places failing without falling back to pin-on-map.

### R2: Biker job loop + the customer's live view (Sonnet; Opus skeptic for P0/P1)

**Journey:** online → board → offer → bid → customer selects → stages → (pickup photo) → reveal
code → deliver → customer rates → completed → commission debit.

**Files:**

- Screens: `apps/mobile/app/rider/(tabs)/index.tsx`, `app/rider/offer/[jobId].tsx`, `app/rider/job.tsx`
  (the send-package job; `food-*` is out of scope).
- Realtime: `src/realtime/{use-rider-board,use-rider-job-socket,use-rider-location,use-rider-heartbeat,background-location-task,location-buffer,socket}.ts`.
- `src/logic/{rider-job,rider-job-stage,rider-bid-draft,board-poll,journey,pickup-photo-draft,delivery-proof}.ts`
- `src/ui/rider/{job-resume,use-back-to-board,board}*`
- `src/api/{offers,orders,rider-v2,client}.ts`
- `src/query/{use-pickup-photo,use-sent-offers}.ts`, `src/net/last-active-store.ts`
- API:
  - bid `offers/offers.service.ts:42`;
  - select `matching/matching.service.ts:58`;
  - deliver-code check `orders/order-lifecycle.service.ts:415`;
  - `orders/order-lifecycle.*`;
  - `common/{commission-cover,rider-selectable,offer-window,broadcast-policy}.ts`;
  - `tracking/*`;
  - `riders/{online-gate,reliability}.ts`.

**Check first:**

- #1185: `tracking.gateway.ts` `scheduleAuthExpiry` (closes the socket at 15 min) and `evictFromOrderRoom`.
- #1187: `socket.ts` renew-and-reconnect, and `client.ts` `renewSessionForSocket`.
- #1185: `commission-cover.ts` now counts delivered-but-open jobs as owed.
- #1157: "no bids while on a job".
- #1155/#1156: background location, the heartbeat, `offer-expiry.service.ts`, `rider-nudge.service.ts`.
- **For the Opus skeptic:** #1188's `domain-events.ts` writes inside the match, offer and lifecycle
  transactions. It says it "never fails the caller", but in Postgres a caught error still aborts the
  whole transaction. Confirm or refute this.

**Live runs** (with `listen()` attached as both the customer and the rider, saving everything to
`R2-trace.jsonl`):

- The happy path.
- Two bikers bid at once, and the customer selects one.
- Selecting a biker whose heartbeat has lapsed.
- The chosen biker cancels.
- A wrong code ×5, then the right code.
- `/deliver` twice and `/rating` twice.
- A trip that runs past the 15-minute token expiry: does the socket recover?

**Hunt for:**

- a biker who was selected but never sees the job;
- two bikers who both think they won;
- a job on the board that is already taken;
- position updates that stop while the app is in the background;
- a job stuck after a restart;
- commission debit missing or doubled.

### R3: Biker wallet top-up + switching between customer and biker (Sonnet; Opus skeptic for money P0/P1)

**Files:**

- Wallet screens: `apps/mobile/app/wallet/top-up.tsx`, `app/rider/(tabs)/{money,account}.tsx`,
  `app/(tabs)/account.tsx`, `app/history/*`.
- Wallet logic: `src/ui/rider/TopUpFlow.tsx`, `src/logic/{topup,money,money-feed,gates,wallet-ledger}.ts`,
  `src/query/{use-topup,use-wallet,use-history-feed}.ts`, `src/api/wallet.ts`.
- **The switch is client-only. There is no API route for it.** A profile has one role, and
  `/riders/become` flips it once, from customer to rider (`rider.service.ts:476`). Read
  `src/logic/{switch-to-customer,boot-route,sign-in-route,native-intent,side-nav}.ts`,
  `src/auth/{session,session-role-sync}.ts` (`saveRolePreference`), `src/push/push.ts:154`,
  `app/+native-intent.tsx`, `src/rider-route-gate.tsx` and `src/rider-mode.ts`.
- API: `apps/api/src/wallet/*`, `common/commission-cover.ts`, `adapters/payments/*`,
  `packages/shared/src/policy.ts`. Skip `settlements/*`, which is only an admin read view.

**Check first:**

- #1173: `wallet.service.ts`, `topup-reconcile.service.ts`, `TopUpFlow.tsx`, migration 0090.
- #1185: the daily cap on manual credits.
- #1188/#1189: `wallet-integrity.service.ts`, migration 0092 (one free-job receipt per order).
- #1169/#1172: `topup.ts`, `gates.ts`, `money.tsx`.
- #1154: `online-gate.ts`, `free-jobs-reminder.ts`.
- #1160: `session-role-sync.ts`, `native-intent.ts`, `side-nav.ts`.

**Live runs:**

- A stub top-up: confirm it expires after 90 s, and check what the app shows (the timeline in `logic/topup.ts`).
- The same `idempotencyKey` twice.
- An admin credit with the same `idempotencyKey` twice, and up to the daily cap.
- Free jobs 1–10, then the 11th job's commission debit.
- A balance below cover: does bid or select refuse with a clear reason?
- Run `/admin/wallet/integrity-check` and confirm the sum of the ledger equals the balance.

**Static checks for the switch:**

- switching while a job is active or an order is open;
- a push for the other side arriving while on this side;
- a rider-only route opened from customer mode;
- the iOS/web gate.

**Hunt for:**

- money credited twice or never;
- a balance that stays stale after a credit;
- the top-up gate blocking a biker who has paid;
- the switch stranding the user on the wrong tab stack, or hiding an active job.

### R5: Customer order tracking (Sonnet, static + R2's trace; no harness boot)

**Journey:** placed → waiting for bids → biker chosen → live map → picked up → code → delivered,
undelivered or cancelled → Orders tab history → notification taps.

**Files:**

- Screens: `apps/mobile/app/order/[id].tsx` (includes the accept-bid UI), `app/(tabs)/orders.tsx`,
  `app/notifications/index.tsx`, `app/order-updates.tsx`.
- `src/logic/{order-stage,order-offers,order-tracking,eta}.ts`
- `src/ui/order/{OrderSheet,OrderMap,panels,cards}*`
- `src/realtime/{use-order-socket,use-foreground-refetch,self-heal-gate,socket-identity}.ts`
- `src/query/{use-customer-orders,seed-order,use-notifications-unread}.ts`
- `src/net/{order-copy-store,offline-banner-owner}.ts`, `src/push/*`
- API: `tracking/{tracking.gateway,tracking.service}.ts` (#1185 removed the REST controller),
  `orders/{lifecycle.controller,cancel-reason}.ts`, `notifications/*`.

**Field signal:** Sentry `LYNIA-MOBILE-6` "compose-map-not-loaded" in `app/order/[id]`. Find why the order screen's map fails to load and what the customer sees when it does.

**Inputs:**

- Read `R2-trace.jsonl` from the shared branch.
- For each status change the server sent, check how `order-stage` and `use-order-socket` render it,
  and what happens when that event is missed. Is there a refetch on reconnect or foreground?
- Run `pnpm --filter @lynia/mobile exec jest app/order src/realtime src/logic/__tests__/order`.

**Hunt for:**

- a map frozen on a stale position;
- the stage sheet stuck after a missed event;
- a push opening the wrong order;
- a cancel racing an accept;
- the code missing or stale after rotation;
- history without a just-finished order;
- the socket closing at 15 minutes as the customer sees it.

### R6: Low connectivity + budget phone (Sonnet; live through a proxy, static for the device side)

1. **A latency/drop proxy.** Put a small Node TCP proxy in front of `:3000` that adds 400 ms of latency
   and drops ~10 % of responses **after** the request has reached the server. Route `drive.mjs`
   through it.
   - Measure retry safety for: order create, bid, select, stage, deliver, rate and top-up. Only order
     create and top-up carry an `idempotencyKey`. What does a retried bid, select or deliver do?
   - Measure socket reconnects through #1187's backoff (1 s → 60 s).
2. **Static review:**
   - `src/api/client.ts` (timeouts, single-flight refresh);
   - `src/net/*` (tiers in `network-policy.ts`; reachability and NET-FF false-offline flags);
   - `src/query/{client,persist}.ts`, `src/realtime/socket.ts`;
   - `src/logic/image-downscale.ts`, `src/api/uploads.ts` (the 409 handling);
   - polling intervals that cost data or battery;
   - work done during boot (`src/boot/*`).
3. **Run** `pnpm --filter @lynia/mobile exec jest app/order/__tests__ src/net src/realtime`. This
   covers the offline cold start and the order-screen perf tests.
4. **Budget phone, static only:**
   - the Hermes bundle against its budget (from R0, which read main's CI);
   - image sizes;
   - re-renders on the map screens.

   Say plainly that this is static.
5. **Optional, only if 30 minutes or more remain:**
   - Build a web export with a **non-loopback** `EXPO_PUBLIC_API_URL`, because a production build refuses
     loopback (`src/config.ts:65-70`).
   - Point Chromium (`/opt/pw-browsers`) at it with `--host-resolver-rules`, and set `CORS_ALLOWED_ORIGINS`.
   - Apply CDP Slow 3G and 6× CPU throttling, then time the customer Home → Send → order screens.
   - Don't use the parity renderer: it serves fixtures, so throttling would measure nothing.

### R8: Synthesis + must-fix (Opus)

1. Check out `claude/journey-qa-2026-10-15` and read every `R*.md`.
2. Dedupe across lanes. Re-verify each P0 and P1 at `file:line` against current `main`, and drop
   anything that doesn't reproduce.
3. Write `00-SUMMARY.md`:
   - the top problems per journey, biker and customer;
   - a speed table;
   - a low-connectivity verdict;
   - a `fixed-on-main-not-shipped` list (which tells the owner whether a `closed`-profile build is due);
   - NEEDS OWNER.
4. Add the JQ section to `docs/KNOWN_BUGS.md`; use `rg` to find where it goes.
5. Fix every P0, plus the P1s that pass §5. Each fix gets one regression test. No UI, copy, features or
   `packages/design/**`.
6. Run `pnpm typecheck && pnpm test` before pushing. Run int specs for any API change.
7. Open **one** PR, subscribe to it, drive CI to green, and squash-merge on green.
8. Do not dispatch an EAS build; that is the owner's call. Say in the summary whether one is needed.

### R9: Close-out (Haiku)

1. Confirm R0–R8 each produced their file, and that R8's PR is merged or green.
2. Post one short comment on that PR listing any missing lane, red check or NEEDS OWNER item.
3. No code.

---

## 8. How the routines are wired (created 2026-10-14 ~09:53 UTC)

A trigger that starts a fresh session on firing gets **no repo source and no connectors**. So each
routine instead has its own pre-created cloud session, and a one-shot trigger fires into it:

- the session is created with `create_session`, with this repo as its source, `outcome_branch`
  set to `claude/journey-qa-2026-10-15`, the §1 model, and the tag `journey-qa-2026-10-15`;
- a one-shot `run_once_at` trigger then fires into that session through `persistent_session_id`.

The trigger prompt is short. It points at this file's preamble and the routine's lane block, so
**this file is the single source of truth**: edit it on `main` before a lane fires, and that lane
picks up the change.

The fired sessions' harness pushes a draft PR for the branch. Every lane prompt therefore says:

- reuse ONE draft PR for the branch;
- never merge it;
- don't subscribe to its PR activity.

Only R8 owns and merges the PR.

| # | Fires (UTC) | Model | Session | Trigger |
|---|---|---|---|---|
| R0 | 14 Oct 12:00 | Sonnet | `session_01E1ZQnUUHSZWW98KQjop9BV` | `trig_01SjK1YYFXkZhn9gGPQyhRNs` |
| R7 | 14 Oct 12:05 | Haiku | `session_01EF1dXy6hfD7FaEQZY3Z1eX` | `trig_01WmhBVyRJv3a3UnFDHo9HJ6` |
| R1 | 14 Oct 13:30 | Sonnet | `session_01E6ypq34xKdMz8w9QbJPb8M` | `trig_01T5fwJw1m96rb2thXoNVWji` |
| R4 | 14 Oct 14:30 | Sonnet | `session_01AjMoZRhkuSCsj7EYhyA3fe` | `trig_01FcsWAb3YrpodE3Hxes1MxP` |
| R2 | 14 Oct 15:30 | Sonnet | `session_0197sUN8DRrbLotAX3u2Ux3H` | `trig_01SuNhw19apSsWYPtiDT6vF8` |
| R3 | 14 Oct 16:30 | Sonnet | `session_0186NFtnBoioL6b3rXA32R6R` | `trig_01PHrodg7j7c37djVGaVBHwE` |
| R5 | 14 Oct 17:30 | Sonnet | `session_01U8zreNDrJCbf66Leqbm2Lm` | `trig_01Fry5v5PVMbH5pPsjtWAdcB` |
| R6 | 14 Oct 18:30 | Sonnet | `session_01MU92QbexbEGpeYQuWEg6BX` | `trig_015bLV2DCGU81SUvhJeUKFqz` |
| R8 | 14 Oct 21:30 | Opus | `session_019iPdmYjPbxH8qynyJsMqEY` | `trig_01Q9nQdmVeobT6gHeXW715CE` |
| R9 | 15 Oct 09:00 | Haiku | `session_01JNpdi7GW8px4yYTDRwmSrR` | `trig_01AhCXT4HBCamJMnwS7gdFVj` |

**To cancel a lane,** delete its trigger. **To re-run a lane,** use `fire_trigger`, or send a message
to its session.

**Rough cost:** 2 Haiku runs, 7 Sonnet runs, a handful of one-shot Opus skeptic calls and 1 Opus fix
run. The R0 harness and the §4 route table spare every later lane from rediscovering the stack.
