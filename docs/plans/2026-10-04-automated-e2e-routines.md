# Automated pre-launch E2E — report-only Claude routines (2026-10-04)

**Owner ask (2026-10-04):** run the four launch journeys as automated tests instead of human testers,
keep infrastructure cost at zero, run them as Claude routines on Opus 5.5 only, report results without
changing anything, review the results with gstack, and spread the work over 24 hours so it doesn't hit
usage limits.

## 1. Where the tests run: zero infra cost

Each routine starts a **throwaway copy of Lynia inside its own container** and tests against that. No
staging stack, no production calls, no vendor spend.

| Option | Monthly cost | Real codes / ID checks | Pollutes production | Chosen |
|---|---|---|---|---|
| Production (api.lyniago.com) | $0 extra | yes: real codes, billed ID checks | yes | no |
| Azure staging tier (armed) | ongoing Azure spend | no | no | no |
| **Local stack in the routine container** | **$0** | **no** | **no** | **yes** |

Proven in this session (2026-10-04):
- `docker compose up -d` (PostGIS 16 + Redis 7)
- `pnpm install --frozen-lockfile` (~25 s)
- `pnpm --filter @lynia/shared build`
- `migrate:deploy`: all migrations apply
- The API boots with `NODE_ENV=development OTP_CHANNEL=console OTP_TEST_PHONES=… KYC_PROVIDER=stub PUSH_PROVIDER=noop RESTAURANTS_ENABLED=true`, and `/healthz` is ok
- `POST /auth/otp/request` returns `devCode`. Verify needs a device id, which each run takes from the auth code.

Docker in the container needs `dockerd` started first. The merchant web (`apps/merchant`, `next dev
--port 3100`) is driven with Playwright against the local API. Chromium is preinstalled at
`/opt/pw-browsers`.

**Limits.** This proves the server logic, the database records and the merchant web. It does **not**
cover any of these:
- the native phone app screens, push, GPS or camera
- the real code delivery
- the real ID check (stubbed)
- the live server's config

Those stay in the human script (artifact "LyniaGo Launch Tests") for later.

## 2. What each run tests (report only)

The journeys are the same as the human script, driven through the HTTP API as separate users. The
merchant web is the one exception: it is tested in a real browser.

- **J1 Rider registration:**
  - sign in by OTP
  - `POST /riders/become` with the stub ID check, which verifies the rider
  - go online
  - admin views
  - wrong code, rate limits
- **J2 Send a parcel:**
  - customer posts a parcel; two riders bid
  - the customer chooses one; the losing rider sees the offer close
  - lifecycle to delivered with the delivery code; wrong code shows tries left
  - rating
  - cancel paths
  - expiry with no offers
- **J3 Business sign-up and items:**
  - merchant web sign-up (Restaurant)
  - category, dishes with photos, a draft dish, hours
  - admin go-live refusal, then success
  - the restaurant appears in the customer list
- **J4 Restaurant order:**
  - place a cash order
  - merchant accepts; auto-dispatch reaches the rider
  - pickup code, door cash confirm, delivery code
  - merchant cash-back confirm
  - `merchant_debt_ledger` nets to 0.00
  - the 3-minute auto-cancel and a short count

Every step records **expected vs actual, PASS/FAIL/BLOCKED**, plus the HTTP status, the response
excerpt and the database check, with screenshots for web steps.

## 3. Hard rules for every run (report, not change)

1. **No code changes.** The only files a run may add are under `docs/e2e-runs/2026-10-05/`. Before
   committing, `git status --porcelain` must show nothing outside that folder.
2. **Never contact production or vendors.** Only `localhost` is allowed; `api.lyniago.com`,
   `merchant.lyniago.com`, Didit, Bird and FCM are off limits.
3. **Don't fix anything.** A failure is written up with repro steps and the file:line the run suspects.
4. **Commit and push reports** to the branch `claude/e2e-reports-2026-10-05` only. Open no PR except
   the final run's **draft** report PR, and never merge it.
   - This deliberately overrides the merge-on-green routine policy in CLAUDE.md for these runs, by
     owner instruction.
5. **Opus 5.5 only:** the routines are pinned to `claude-opus-5-5`.

## 4. Schedule over 24 hours (usage-aware)

There are seven one-shot routines, each starting a **fresh session** about 3 hours 20 minutes apart, so no two runs
overlap and usage has time to recover.

| # | When (UTC) | Run |
|---|---|---|
| 1 | 2026-10-05 06:00 (08:00 Harare) | Bootstrap harness + J1 Rider |
| 2 | 2026-10-05 09:20 (11:20 Harare) | J2 Send a parcel |
| 3 | 2026-10-05 12:40 (14:40 Harare) | J3 Business sign-up (merchant web + admin API) |
| 4 | 2026-10-05 16:00 (18:00 Harare) | J4 Restaurant order + money checks |
| 5 | 2026-10-05 19:20 (21:20 Harare) | J5 Shops and pharmacies end to end (owner 2026-10-04: shops are launched, and pharmacies "must be launched too in full", D-76): shop sign-up + items, go-live, Shops list, cash shop order with sealed-bag photo, auto-cancel, SHOPS_ENABLED off/on; then Pharmacy sign-up, Pharmacy list, pharmacist tick, an over-the-counter order and a prescription order (approve and decline) with RX_ENABLED on |
| 6 | 2026-10-05 22:40 (00:40 Harare) | gstack review of results: eng + design lenses, report only |
| 7 | 2026-10-06 02:00 (04:00 Harare) | Consolidated report + draft PR (reports only) |

How each run is kept within usage limits:
- At most 2 subagents per run, and no workflows.
- About 60 minutes of work per run.
- If a limit is hit, the run writes what it has as a PARTIAL report, pushes it and stops. It never
  retries in a loop.

Each run is self-contained. It boots its own stack and seeds what it needs through the API, because
containers don't share state.

## 5. Outputs

- `docs/e2e-runs/2026-10-05/J1-rider.md` … `J4-order.md`: one per journey.
- `docs/e2e-runs/2026-10-05/REVIEW.md`: the gstack review findings, ranked.
- `docs/e2e-runs/2026-10-05/SUMMARY.md`: pass/fail table, failures with repro, and what the automation
  could not cover.
- A draft PR containing only these files.

## 6. Engineering review (gstack /plan-eng-review, 2026-10-04)

**Scope Challenge:** accepted as-is. The plan adds no app code: one plan doc, seven routine prompts and
report files. Complexity gate not tripped (fewer than 8 files, no new services).
**Owner direction (2026-10-04):** tests must cost nothing, and there are no existing users to protect.
So production stays off-limits *because of cost* (real OTP sends and billed Didit checks), not data.
Free read-only GETs to production are allowed for a config snapshot.

Findings and dispositions (auto-decided as recommended, per the owner's "make sensible decisions"):

| # | Sev | Conf | Evidence | Finding | Disposition |
|---|---|---|---|---|---|
| E1 | P1 | 9/10 | `apps/api/src/auth/admin.guard.ts`: `if (req.user?.role !== "admin") throw new ForbiddenException("Admin only")` | Admin backend checks need an admin login. Locally there is none. | **Accepted.** Each run signs in a test phone, then promotes it in the LOCAL database only: `UPDATE profiles SET role='admin' WHERE phone=…`. Never on production. |
| E2 | P1 | 9/10 | `auth.controller.ts:40`: `@Headers("x-device-id") deviceId` and the probe "A device id is required to create an account." | New accounts need an `x-device-id` header, and a device can create only 3 accounts a day. | **Accepted.** Give each test account its own device id, and set the rate-limit env vars high for the local API. |
| E3 | P1 | 8/10 | CLAUDE.md "every scheduled routine ships a PR and auto-merges it" and "fix every defect" | The routine policy contradicts report-only. | **Accepted.** Every prompt states the owner override, and runs `git status --porcelain` as a guard: any path outside `docs/e2e-runs/` fails the run. |
| E4 | P2 | 8/10 | Plan §4: runs are independent containers | If run N fails to push, the review run has nothing to review. | **Accepted.** Runs 5 and 6 list missing reports as `NOT RUN` and never re-execute journeys. |
| E5 | P2 | 9/10 | `apps/merchant/app/lib/config.ts`: `process.env.NEXT_PUBLIC_API_BASE_URL … ?? "http://localhost:3000"` | The merchant web defaults to the local API. | **Accepted.** Run 3 uses `next dev --port 3100` with no env change. CORS for :3100 is set through `CORS_ALLOWED_ORIGINS=http://localhost:3100`. |
| E6 | P2 | 7/10 | Shared contracts: 90 s auction window, 3-minute merchant accept | The timeout checks need real waits. | **Accepted.** Budget about 5 minutes of wall-clock per run, with no polling faster than 5 s. |
| E7 | P2 | 9/10 | Probe output: `docker.sock` refused until `dockerd` was started | Docker isn't running at session start. | **Accepted.** The bootstrap starts `dockerd` first, then `pnpm install --frozen-lockfile`, the shared build, `migrate:deploy`, and boots the API. |
| E8 | P3 | 8/10 | Owner: "strictly Opus 5.5" | Model pinning. | **Accepted.** `update_trigger model=claude-opus-5-5` on all seven routines. Fresh-session routines pick it up. |

Architecture (one run):

```
routine fire (fresh session, Opus 5.5)
  └─ bootstrap: dockerd → compose up (postgis, redis) → pnpm i → shared build → migrate
       └─ API :3000  (NODE_ENV=development, OTP console + test phones, KYC stub, push noop)
            ├─ journey driver (node script, fetch + x-device-id per user)  ──► PASS/FAIL rows
            ├─ psql checks (orders, merchant_debt_ledger, audit_logs)       ──► DB evidence
            └─ [run 3] merchant web :3100 ◄─ Playwright (/opt/pw-browsers)  ──► screenshots
  └─ report → docs/e2e-runs/2026-10-05/<file>.md → guard (git status) → push claude/e2e-reports-2026-10-05
```

**Tests:** these runs are the tests. Coverage per journey is listed in §2. Not covered: the native
app UI, push, GPS and real vendors (§1 Limits).
**Performance:** about 5 minutes of bootstrap and 30–60 minutes of journey work per run. Nothing in
it is per-request heavy.
**Outside voice:** Codex is not used. Its findings were folded in from this session's own probes.

## 7. Design review (gstack /plan-design-review, 2026-10-04)

**UI scope:** the plan adds no app screens. What it designs is the output the owner reads on a phone:
- the four journey reports
- REVIEW.md and SUMMARY.md
- the merchant-web screenshots

Score for design completeness: **5/10 before review, 9/10 after.** A 10 would also send a
push-friendly digest, which is out of scope.

| # | Dimension | Before | Gap | Fix (applied to the run prompts) |
|---|---|---|---|---|
| X1 | Hierarchy | 4 | Reports would open with logs and setup noise. | Every report opens with a verdict line, then a table (step · expected · actual · PASS/FAIL/BLOCKED), then details. SUMMARY.md opens with one sentence: "N of M steps passed; K launch blockers". |
| X2 | Scanning on a phone | 4 | Wide tables and raw JSON don't read on a 360 px screen. | One table, three columns at most. Evidence goes in collapsed `<details>` blocks, with JSON excerpts of 10 lines or fewer. |
| X3 | Severity language | 5 | A FAIL alone doesn't say whether it blocks launch. | Each failure is tagged **Launch blocker**, **Fix soon** or **Polish**, with one plain-English sentence on what a real user would hit. |
| X4 | Visual evidence | 6 | No rule for when screenshots are taken. | Run 3 takes a 360×720 screenshot at every merchant-web step and at every failure, saved as `docs/e2e-runs/2026-10-05/img/J3-<step>.png` and linked inline. |
| X5 | Copy fidelity | 6 | The script's expected text comes from the code. | Mismatches between the screen text and the design handoff copy (`packages/design/handoff/*`) are reported as **Polish**, quoting both strings. |
| X6 | Empty / partial states | 5 | A run that died midway has no defined look. | A partial report says `PARTIAL — stopped at <step> because <reason>`, and every remaining step is marked `NOT RUN`. |
| X7 | Not covered | 6 | Readers may assume the phone app UI was tested. | Every report and SUMMARY end with "Not tested by automation": native screens, push, GPS, real codes, real ID check. |

All seven were auto-decided as recommended, per the owner's "make sensible decisions". No mockups:
there are no new screens.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng review | owner request | lock in the automated E2E plan | 1 | DONE | 8 (3×P1, 4×P2, 1×P3), all accepted |
| Design review | owner request | report and screenshot clarity | 1 | DONE | 7 (X1–X7), all accepted; 5/10 → 9/10 |

VERDICT: plan approved for scheduling with E1–E8 and X1–X7 folded in.
OUTSIDE COVERAGE / CROSS-MODEL: Codex not configured in this container; single-model review.

NO UNRESOLVED DECISIONS
