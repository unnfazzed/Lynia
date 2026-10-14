# R0 — Harness + baseline

Lane: R0 · Model: Sonnet · Harness: **live** (native PG16 + PostGIS 3.4, redis, API on :3000) · main SHA: `28e4437` (28e4437 at CI-read time) · run 2026-10-14 ~12:00 UTC

## 1. Known-red list (main CI)

Latest completed `ci.yml` run on `main`: run 38552330535 (sha 28e4437, "docs(routines): JQ R7 …"), **conclusion: success. No red job, no red test.** The two previous runs (0d83889, c8e0a03) are also green.

| Job | Result |
|---|---|
| typecheck · build · test (api, mobile, admin, merchant) | success (mobile tests ≈100 s) |
| prisma migrate · constraint proof (PostGIS) incl. offer-loop ET1-3 | success |
| dependency audit · secret scan, docs links, website, terraform, actionlint, parity render | success |
| reverse-drift freeze | skipped (no `packages/design` change) |
| **mobile js bundle · size budget** | **success, but every measuring step was skipped** ("Detect mobile-relevant changes" found none), so there is **no bundle measurement for this SHA**. Budget in `apps/mobile/size-budget.json`: export total 8,168,000 B / Hermes 7,807,000 B (last measured 8,107,677 / 7,746,522 on 2026-10-13). Not re-measured here (plan: no local suite re-runs). |

## 2. Harness status (§3)

| Step | Worked | Time |
|---|---|---|
| `pnpm install --frozen-lockfile` | yes | 26 s |
| `@lynia/shared` build, prisma generate, `db:migrate` (all migrations to 0103) | yes | 10 s |
| Docker | **no** (`dockerd` binary exists, no daemon/socket; not attempted) | – |
| PostGIS | yes, via `apt-get install postgresql-16-postgis-3` **after `sudo apt-get update`** | 18 s |
| role/db `lynia` + `CREATE EXTENSION postgis`, redis | yes | <5 s |
| 6 int specs (before seed) | **all pass** — offer-loop 3, order-lifecycle 24, orders-idempotency 3, tracking 8, rider-onboarding 3, refresh-rotation 5 | 2–5 s each |
| `db:seed` | yes (1 admin, 1 customer, 5 riders, 1 open parcel order, 1 merchant) | – |
| API build + start, `/healthz` | yes → `{"status":"ok","db":true,"redis":true,…}` | ~20 s build, <5 s boot |

**Plan correction:** §3 says `apt-get install` of PostGIS works; on a fresh box it fails with "Unable to locate package" until `sudo apt-get update` is run. `up.sh` does this.

## 3. Happy path (all through `harness/drive.mjs`, ms per call)

Customer `+263772222222` → biker `+263774444444` → completed, **no step failed; final order status `completed`**.

| Step | ms | Step | ms |
|---|---|---|---|
| otp request (cold) / verify | 108 / 32 | bid (accept, $3, 8 min) | 39 |
| PATCH /auth/me | 15 | list offers / select | 14 / 28 |
| riders/become (auto → `verified`) | 32 | stages confirmed→en_route_dropoff (4) | 10–23 |
| online / heartbeat | 25 / 10 | reveal code / deliver | 6 / 13 |
| create Send | 37 | rating (→ completed) | 36 |
| board (order present) | 30 | | |

All calls are localhost, so these are server-side floor timings, not field numbers (R6 covers network).

## 4. Notes for later lanes

- **Not a finding, but check:** the biker's `/wallet/ledger` is `{"entries":[]}` and balance 0 after the first completed job. Consistent with the "10 free jobs" rule (no commission charged); R3 should confirm the free-job counter and that paid jobs write a ledger row.
- `/auth/otp/verify` returns tokens; `drive.mjs login` handles both flat and nested shapes. `x-device-id` is sent per phone to dodge the 3-accounts-per-device cap.
- Waypoints require `landmark` and `contactPhone` in the shared contract (`packages/shared/src/contracts.ts:53-57`), while the Send handoff says "no landmarks" — R4 should check what the app sends for these.
- Re-running `drive.mjs` re-uses the same phones; once `+263774444444` is already a biker `become` is idempotent, but orders accumulate. Use `up.sh` against a fresh DB (drop & recreate `lynia`) for a clean slate.
- `up.sh` sources env, starts services, runs int specs only when `profiles` is empty, seeds if the admin is missing, rebuilds/starts the API and exports `ADMIN_JWT`. `KYC_MODE=manual . up.sh` restarts the API in manual mode.
- Sockets: run scripts with `NODE_PATH=apps/mobile/node_modules`.
- Upload endpoints were not exercised (static-only per plan).
