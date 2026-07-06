# Lynia — Launch-Readiness Review Strategy

> **The program that takes the build from *pilot-ready* to *launch-ready*.** `PILOT-READINESS.md` is the
> status board and stays the single source of truth for *where the build stands*; this document defines
> the **review campaign** — three tracks (Engineering · Performance · UI/UX), each a set of gates with
> machine-checkable exit tests, plus the **agentic execution model** that lets the whole campaign run as
> parallel Claude lanes under the gstack sprint flow. Date: 2026-07-05. Branch:
> `claude/launch-readiness-strategy-3l72q3`.
>
> The **LR1–LR21** gate IDs defined here are stable identifiers (like `T0–T13`, `ET1–ET10`, `DT1–DT13`)
> — do not renumber. Tick status is tracked in the scorecard below as gates close.

## 0. Posture — what "launch-ready" means here

Pilot-ready is done: the core loop is CAS-guarded and integration-tested against real PostGIS in CI,
both app surfaces exist, the API is live on GCP behind an HTTPS LB, and 300+ API tests pass. What
pilot-ready did **not** have to prove — and launch must — is the following, which is exactly where the
residual risk is concentrated:

1. **Hardened** — the deliberate lean-pilot deferrals (Cloud SQL public IP, Redis BASIC, ZONAL SQL,
   `*` bucket CORS — `infra/terraform/README.md`), the QA bypasses (`OTP_TEST_PHONES`, stub KYC, noop
   push), and the audit surfaces no adversarial pass has yet swept end-to-end (full-surface authz
   matrix, abuse limits beyond OTP, supply chain).
2. **Bulletproof** — behavior under *failure*, not just under test: Redis/SQL/vendor outages, WS
   reconnect storms, deploy-mid-delivery, a real restore drill. Today these are designed-for but
   undrilled.
3. **Proven at scale** — every SLO in `OBSERVABILITY.md` is a *target*; none has been measured under
   load because the OTEL collector is (by decision) not yet live. Known ceilings — `take`-cap
   pagination (50/100/500), the `take: 500` presence scan, settlement regenerate-on-read, city-wide
   broadcast fallback — have never been priced in numbers.
4. **Device-proven UI** — the entire mobile surface has shipped against Expo Go + emulators; native
   maps, FCM tokens, GPS degradation (T11), background/resume mid-delivery, and low-end-Android /
   3G behavior (the actual Harare network reality) are untested on hardware.

**Definition of done:** every LR gate below is green, the founder/vendor items from the
`PILOT-READINESS.md` runbook are wired, and the go/no-go checklist (§5) passes in one sitting.

## 1. Principles (how the campaign runs)

- **Evidence over assertion.** Every gate has an exit test a machine (CI job, load run, drill script,
  device checklist) can pass or fail. "Reviewed and looks fine" closes nothing.
- **Adversarial verification.** An audit finding becomes a fix task only after an *independent* pass
  (different session/agent, prompted to refute) confirms it. Prevents plausible-but-wrong churn; this
  is the `/review` + `/codex` pairing the repo already uses, made mandatory.
- **Loop until dry.** Audit rounds repeat until **two consecutive rounds surface nothing new** in a
  track. A fixed number of passes is how tails get missed.
- **Review before merge, CI as arbiter.** The FCM feature merged red twice and unreviewed
  (ENG-REVIEW §2c). That class is closed by process: branch protection on `main`, required CI, no
  self-merge of unreviewed agent work. Every fix lands **with the test that would have caught it**.
- **One lane, one worktree, disjoint files.** Parallel fix lanes never share file ownership;
  integration happens through PRs, not shared working trees.
- **Prod is founder-touched only.** Agents prepare Terraform plans, drill scripts, and runbooks;
  `terraform apply` / `gcloud` against `lynia-500911` is executed by the founder. Load tests target a
  **staging stack**, never `lyniago.lyniafinance.com` while the pilot runs. Secrets never enter
  prompts, transcripts, or the repo.
- **Status is held once.** Gate ticks live in the scorecard here; `PILOT-READINESS.md` keeps overall
  build status; findings append to the per-discipline review logs as dated sections, as always.

## 2. The launch scorecard

> **Status legend:** ⬜ not started · 🔍 audited — findings open · 🛠️ fixes landed, gate not fully closed · ✅ closed. **Rounds 1–2 executed — see §6.**

| ID | Track | Gate | Owner | Status |
|----|-------|------|-------|--------|
| LR1 | Eng | Full-surface authorization matrix + HTTP-level authz test suite | agent | 🛠️ IDOR/ban fixed (on `main`); **HTTP e2e authz suite landed**; full-matrix expansion TODO |
| LR2 | Eng | Launch-mode boot guard (QA bypasses provably off) | agent | ✅ `main`'s prod env-guard rejects default JWT secret + console OTP + test-phones + stub KYC |
| LR3 | Eng | Abuse hardening: global throttling, exception filter, payload caps | agent | 🛠️ Redis throttle (`main`) + **exception filter + 1 MB body cap** (this branch) |
| LR4 | Eng | Secrets & supply-chain sweep + branch protection | agent + founder | 🛠️ `main` CI: pnpm-audit + gitleaks + codeql; branch protection (founder) pending |
| LR5 | Eng | Money-path re-audit + settlement auto-pause scheduler | agent | 🛠️ prepaid per-ride model (`main`, read-only); admin fare/refund/cancel/ban 400s **fixed** (R2) |
| LR6 | Eng | Chaos drills: Redis / SQL / vendor outage / deploy-mid-delivery | agent + founder | ⬜ |
| LR7 | Eng | Deferred infra hardening executed + backup/restore drill | founder (agent-prepped) | ⬜ |
| LR8 | Eng | PII/data-protection review (retention, encryption, ZW CDPA) | agent + founder | 🛠️ national IDs AES-GCM-encrypted at rest; **retention schedule + right-to-erasure built** (`docs/DATA-RETENTION.md`); founder ratifies windows + enables KYC-media lifecycle |
| LR9 | Perf | Observability live: collector sidecar in release path, alerts paging | founder (agent-prepped) | ⬜ |
| LR10 | Perf | Load model: the launch envelope, in numbers | agent + founder | 🛠️ envelope + SLO thresholds authored (`docs/LOAD-MODEL.md`); founder ratifies |
| LR11 | Perf | Load-test harness (k6) + staging stack; SLO table measured green | agent | 🛠️ **k6 harness authored** (`apps/api/load/`); needs a staging stack + OTEL live (founder) to run |
| LR12 | Perf | Contention at load: offer storm, select races, pool vs max_connections | agent | ⬜ |
| LR13 | Perf | Soak + reconnect-storm + deploy-under-load runs | agent | ⬜ |
| LR14 | Perf | Capacity ceilings documented with break points + levers + triggers | agent | ⬜ |
| LR15 | Perf | Cost model at 1× / 5× / 20× envelope | agent | ⬜ |
| LR16 | UI | On-device `/qa`: dev build, maps, FCM, GPS degradation, bg/resume | founder (device) + agent | 🛠️ device checklist authored (`docs/QA-DEVICE-CHECKLIST.md`); needs hardware |
| LR17 | UI | Real-network pass: low-end Android, 3G/EDGE, offline honesty | founder (device) + agent | 🛠️ checklist authored; needs a low-end device + throttled network |
| LR18 | UI | Journey audits ×3 (customer / rider / admin) — error-state honesty | agent | 🛠️ mobile auction + rider-job honest error+retry **shipped**; admin dead-refund-write flagged |
| LR19 | UI | Design-system adherence + accessibility (TalkBack, scaling, AA) | agent + device | ⬜ |
| LR20 | UI | Crash telemetry + store readiness (listing, privacy, data-safety) | agent + founder | 🛠️ Sentry wiring runbook + store/privacy checklist authored; founder executes on the dev build |
| LR21 | All | Go/no-go: QA off, vendors on, one clean end-to-end real delivery | founder | ⬜ |

---

## Track E — Engineering: bulletproof & hardened (LR1–LR8)

### LR1 — Full-surface authorization matrix

Past reviews audited authz *by feature* (the `x-user-id` gate, history/`me`, device tokens, KYC
webhook). No pass has enumerated **every REST endpoint and WS event** in one matrix. The API has ~15
controllers plus the `tracking.gateway.ts` socket surface; the test suite is 34 unit + 4 integration
specs with **no HTTP-level e2e layer**, so guard *wiring* (vs guard *logic*) is largely untested.

- **Do:** generate the matrix — every route/event × {auth required, role, resource-ownership rule,
  order-state gate (§5d reveal window), rate limit} — from the code, not the docs. Then attack it:
  IDOR on every `:id` param, role escalation, state-gate bypass, WS room-join spoofing
  (`tracking.gateway.ts` handshake + room names), admin mutation reachability.
- **Build:** a **supertest-based HTTP e2e suite** (`apps/api/test/e2e/`) asserting 401/403/404 for
  every cell of the matrix — this is the missing test layer, and it makes the matrix regression-proof.
- **Exit test:** matrix doc appended to `ENG-REVIEW.md`; e2e suite in CI; zero CONFIRMED authz
  findings open.

### LR2 — Launch-mode boot guard

The QA bypasses are opt-in and documented (`PILOT-READINESS.md` §QA), but "launch = remember to clear
four repo variables" is a human-memory gate on an account-takeover-adjacent surface
(`OTP_TEST_PHONES` returns codes in responses; `KYC_PROVIDER=stub` auto-verifies riders).

- **Do:** add `LAUNCH_MODE=true` to `config/env.ts` — when set, **boot fails** if `OTP_CHANNEL !==
  "whatsapp"/"sms"`, `KYC_PROVIDER !== "didit"`, `PUSH_PROVIDER !== "fcm"`, `OTP_TEST_PHONES` is
  non-empty, or `JWT_SIGNING_SECRET` is the dev default. Mirror as a fail-fast check in
  `release.yml`'s validate step (the LR-gate version of the existing "Validate required deploy
  config").
- **Exit test:** unit tests for every refusal combination; a staging deploy with `LAUNCH_MODE=true` +
  a QA var provably fails to boot.

### LR3 — Abuse hardening beyond OTP

Rate limiting exists only on OTP send (per-phone 5/hr, per-IP 20/hr, global 5k/day —
`auth.service.ts`). Everything else leans on Cloud Run. There is **no global exception filter**
(typed `HttpException`s mitigate, but unexpected 500s have no normalized shape and could leak
internals), and no explicit body-size caps.

- **Do:** Redis-backed per-user/per-IP throttles on the abuse-shaped writes — order create, offer
  create, `POST /client-metrics` (bounded but floodable), OTP verify, refresh; a global `APP_FILTER`
  normalizing unexpected errors (no stack/internals in prod responses, one log line with correlation
  id); explicit JSON body limit in `main.ts`; a WS connection/event budget per socket.
- **Exit test:** throttle + filter unit tests; k6 abuse scenario (LR11 harness) shows 429s not 5xxs,
  and error responses are shape-stable.

### LR4 — Secrets & supply-chain sweep

- **Do:** secret-scan the full git history; `pnpm audit` + lockfile review (pin/upgrade criticals);
  verify the WIF/keyless posture end-to-end (no lingering SA keys, `wif.tf` scope still
  `unnfazzed/Lynia`); **enable branch protection** on `main` (required CI checks, required review —
  closes the ENG-REVIEW §2c red-merge class); add a lint job to CI (typecheck is currently the only
  static gate; `packages/design/_adherence.oxlintrc.json` suggests oxlint is already in the family).
- **Exit test:** scan/audit reports clean or triaged in `ENG-REVIEW.md`; a test PR demonstrably
  cannot merge red or unreviewed.

### LR5 — Money-path re-audit + the missing scheduler

Settlements are idempotent-by-design (`@@unique([riderId, periodStart])`, never-reset-actioned-status)
but two seams need closing before money matters:

- **Auto-pause has no scheduler** — `POST /admin/cash/settlements/auto-pause` is callable-only. Wire
  Cloud Scheduler → the endpoint (OIDC-authed) or a BullMQ repeatable job; overdue riders must pause
  without a human remembering.
- **`GET /admin/cash/settlements` regenerates the period on every read** — fine at pilot rider
  counts, a write-amplifying read at scale; move generation to the scheduled job, make the read a
  read.
- **Re-audit** the engine (`settlements.service.ts`) adversarially: concurrent
  generate/record-payment, week-boundary/timezone edges, the documented `refundsNetted = 0` deferral
  (confirm it stays safe-by-construction until the refund ledger exists), commission flip at the
  0%→X% trigger.
- **Exit test:** scheduler observed firing in staging; concurrency tests added; findings closed in
  `ENG-REVIEW.md`.

### LR6 — Chaos drills (designed-for ≠ drilled)

The failure design exists (Error & Rescue registry, best-effort side effects, the DB reconciler,
fail-closed KYC webhook). None of it has been *watched happening* on the deployed stack. Script each
drill against staging, observe, record actual vs designed behavior:

| Drill | Expected (by design) |
|-------|----------------------|
| Redis unavailable 5 min | boot-guard blocks *new* multi-instance boots; running API: BullMQ jobs queue-fail but **DB reconciler** still closes stale orders; OTP send degrades loud; sockets fall back; no data loss |
| Cloud SQL restart mid-delivery | requests 5xx briefly, pool recovers, no stuck lifecycle states (CAS re-entrant), reconciler sweeps |
| Didit outage | `becomeRider` → retryable 503, no half-onboarded rider (ENG-REVIEW §4) |
| WhatsApp outage / bad template | `requestOtp` fails loud, not silent-success |
| Deploy (revision roll) mid-delivery | WS reconnect → REST snapshot self-heal (ET4); no reconnect storm amplification |
| Expiry-job loss (flush BullMQ) | orders past window closed by reconciler within its 15-min sweep |

- **Exit test:** drill runbook committed (`docs/plans/` or `infra/`), every row executed with
  observed-behavior notes; divergences filed and fixed.

### LR7 — Deferred infra hardening, executed

The four deliberate deferrals in `infra/terraform/README.md` flip from "pilot-lean" to "launch-debt":

1. **Cloud SQL public IP off** — prerequisite: move migrations off the GitHub-hosted runner to a
   VPC-internal path (Cloud Run Job running `prisma migrate deploy`), then `ipv4_enabled = false`.
2. **Redis `STANDARD_HA` + Cloud SQL `REGIONAL`** — the availability tier the pilot skipped.
3. **Bucket CORS** from `*` to the real admin origin.
4. **Backups/DR:** verify automated backups + PITR on `lynia-pg`, then run a **real restore drill**
   into a scratch instance and boot the API against it. A backup that has never restored is a hope.

Plus: `terraform validate`/`plan` as a CI job (the ENG-REVIEW §3 method note — it has never run in
CI), and the org-policy `allUsers`/ingress verification before any re-arm.

- **Exit test:** Terraform diff applied by founder; restore drill documented with timings (RTO/RPO
  numbers in `ENG-REVIEW.md`); CI runs `terraform validate` on PRs touching `infra/`.

### LR8 — PII & data protection

KYC images, national-ID data, GPS traces, and phone numbers are held for a Zimbabwean user base —
review against Zimbabwe's **Cyber and Data Protection Act (2021)**: retention windows (KYC media,
`order_events` GPS trail, `device_tokens` of departed users), deletion path for a user who leaves,
encryption posture (at rest is GCP-default; confirm TLS-only paths incl. Redis AUTH), what the admin
console exposes to which admin roles, and the privacy policy the Play Store listing (LR20) needs.

- **Exit test:** retention/deletion policy documented + implemented where code is needed; privacy
  policy drafted; findings closed.

---

## Track P — Performance: proven, not presumed (LR9–LR15)

### LR9 — Observability first (the enabler — nothing else in this track works without it)

The SLO table in `OBSERVABILITY.md` is fully instrumented but **dormant** (no collector). Execute the
documented activation runbook: collector sidecar + Managed Prometheus, import the dashboard, create
notification channels, and — critically — **fold the sidecar into `release.yml`** (the doc's own
"operational drift" warning: today any normal deploy silently drops the sidecar).

- **Exit test:** `offer_received_latency_ms_bucket` (and friends) visible in Metrics Explorer PromQL;
  a synthetic SLO breach pages a real channel; a normal `/ship` deploy keeps the sidecar.

### LR10 — The load model (define the envelope before testing it)

Agree the numbers launch must survive — proposed starting envelope for one Harare corridor, founder
to ratify (×5 is the stress multiple):

| Parameter | 1× envelope | Stress (×5) |
|---|---|---|
| Riders online (concurrent) | 100 | 500 |
| Customers active (concurrent) | 200 | 1,000 |
| Orders created / peak hour | 300 | 1,500 |
| Concurrent live deliveries | 40 | 200 |
| GPS fixes / rider / sec | 1/3s | 1/3s |
| Offers per broadcast | 5 | 15 |
| WS connections | ~350 | ~1,700 |
| OTP sends / hour | 150 | 750 |

Derived: sustained API RPS, WS event rates (fan-out = deliveries × watchers + board rooms), Redis
ops/sec, and the DB write rate (throttled 10s GPS flush × riders + lifecycle writes).

- **Exit test:** this table ratified and committed; k6 scenarios (LR11) parameterized from it.

### LR11 — Load harness + staging stack, SLOs measured green

- **Staging:** a second, small Terraform stack (or same-project second Cloud Run service + scratch
  SQL/Redis) — production shape, QA `console` OTP so the harness can authenticate without vendors.
- **Harness:** k6 scenario pack in-repo (`apps/api/load/` or `infra/load/`): signup/OTP mint,
  order-create burst (corridor-valid coords) + broadcast fan-out, offer storm, customer select,
  full lifecycle drive, tracking rooms (Socket.IO clients × fix rate), history/admin reads, and the
  LR3 abuse scenario. CI-runnable nightly at 1×, manually at ×5.
- **Assert:** every p95 in the `OBSERVABILITY.md` SLO table at 1×, **measured server-side via the
  LR9 pipeline** (not just k6 client timings); client RUM histograms sane from a device on the
  staging build.
- **Exit test:** 1× run green on all SLOs; ×5 run completed with breaches triaged into LR14
  ceilings or fixes.

### LR12 — Contention at load

The CI concurrency tests prove correctness at N=2. Load-test the same invariants at N=real:

- 15 riders bidding + customer select storm on one order → exactly one `assigned`, losers get clean
  `taken` outcomes (`match_select_total{outcome}` counters confirm).
- Select-vs-expiry races across hundreds of simultaneous expiries (jitter working: no thundering
  herd on the queue).
- `one_active_ride` under parallel selects of the same rider.
- **Connection math:** Prisma `connection_limit` (default 10) × Cloud Run max instances vs Cloud SQL
  `max_connections` — set `--max-instances` and `DATABASE_CONNECTION_LIMIT` so the product can't
  exhaust the DB; document the numbers in `release.yml` comments.
- **Exit test:** invariants hold at ×5; connection math committed and enforced by deploy flags.

### LR13 — Soak, reconnect storm, deploy-under-load

- **Soak:** 2h at 1× — watch for memory growth (coalesce timers, presence watchdog, socket rooms),
  Redis key growth (TTLs actually expiring), and p95 drift.
- **Reconnect storm:** kill all sockets at once (revision roll under load) — reconnection is
  jittered/survivable, REST snapshot path absorbs the read burst, no duplicate emits after re-join.
- **Exit test:** soak report (flat memory, stable p95); storm drill notes; fixes filed for any drift.

### LR14 — Capacity ceilings, priced and levered

Turn the known bounded-not-scalable spots into a table of **measured break point → lever → trigger**,
so scaling is a playbook, not a surprise. Candidates: `take`-cap lists (open board 50, history 100,
admin lists) → cursor pagination; presence scan `take: 500` → partitioned scan; city-wide broadcast
fallback → region rooms (the deliberately-deferred Redis online-set / per-region rooms decision);
settlement regenerate-on-read → LR5 scheduler; single-corridor haversine gate → PostGIS
multi-corridor. Each row: measured limit from LR11/×5, the lever, and the metric trigger that says
"build it now."

- **Exit test:** table committed here (appendix) with real numbers; deferred levers each have a
  named metric trigger.

### LR15 — Cost model

Project the GCP bill at 1× / 5× / 20× (Cloud Run instances, SQL tier, Redis tier post-LR7, LB,
egress — the pilot baseline is ~$95–110/mo per ENG-REVIEW §3b) so scaling decisions have a price tag
and the credits runway is known.

- **Exit test:** cost table committed; founder acknowledges runway.

---

## Track U — UI/UX: device-proven (LR16–LR20)

### LR16 — On-device `/qa` (the device-gated backlog, retired)

Greenlight the dev build (the standing gate in `PILOT-READINESS.md`), then run the full gstack `/qa`
pass on hardware: native map + tap-to-pin, live tracking map on both sides, FCM device token
mint/registration/receipt for every notice type, KYC in-app browser hand-off + poll-while-pending,
**GPS degradation (T11)** — permission revoked mid-delivery, GPS off, backgrounded rider — and
background/kill/resume on both roles mid-delivery (socket resume → REST snapshot honesty).

- **Exit test:** the T11/DT5/DT7 device checklist executed and logged in `DESIGN-REVIEW.md`; every
  divergence filed; `PILOT-READINESS.md` device gate closed.

### LR17 — Real-network pass (the Harare reality)

All testing so far is emulator/Wi-Fi. Re-run the core journeys on a **low-end Android device**
(≤2GB RAM class) under **throttled 3G/EDGE and flapping connectivity**: cold start, order create,
auction wait, live tracking (marker interpolation under 2–5s latency), OTP hand-off, plus
airplane-mode mid-flow on every screen. Verify the 15s `AbortController` timeouts actually surface
retry UI (not hangs), `OfflineBanner` honesty, `websocket→polling` fallback engages, and optimistic
UI rollbacks read correctly when the network eats the write.

- **Exit test:** journey matrix (screen × network condition) executed on device; findings fixed or
  filed; data usage per delivery measured (expensive-data reality check).

### LR18 — Journey audits ×3 (agentic, screen-by-screen)

Three parallel audit lanes walking every screen state against the code — the error-state-honesty
class (a systemic P1 once already, ENG-REVIEW §2):

- **Customer:** splash → phone/verify → home/map → create → auction (incl. zero-offers, expiry,
  re-broadcast) → tracking → OTP → rate → history/profile.
- **Rider:** become → KYC (pending / declined+reason / retry-lock / on-hold / out-of-service-area)
  → online gate (all four `onlineRefusalReason`s) → board (empty / geo-scoped) → bid → job screen →
  lifecycle drive → earnings ledger.
- **Admin:** all pages × the four failure banners (`unconfigured`/`unreachable`/`not-implemented`/
  `error`), mutation confirm flows, cash console, audit-trail visibility.
- Every state: loading skeleton, empty, error (honest, retryable), success; copy consistency.
- **Exit test:** per-journey state matrices appended to `DESIGN-REVIEW.md`; zero CONFIRMED
  dishonest-state findings open.

### LR19 — Design-system adherence + accessibility

`/design-review` over both apps against `DESIGN.md`/`packages/design` (token drift is already
CI-guarded — extend adherence linting via the existing oxlint config); then an accessibility pass:
TalkBack on the core journeys, ≥44px targets (spec'd — verify), font-scaling ×1.3, WCAG AA contrast
on both themes, focus order on admin.

- **Exit test:** adherence report + a11y checklist in `DESIGN-REVIEW.md`; violations fixed.

### LR20 — Crash telemetry + store readiness

There is client RUM but **no crash reporter** — at launch, a crash on a tester's phone is invisible.
Add Sentry (React Native) or Crashlytics behind the existing best-effort pattern (and to the admin
app). Then the store package: Play listing, versioning/build-number discipline in `app.config.ts`,
privacy policy URL (from LR8), the Play data-safety form (matches what the app actually collects:
location, phone, KYC), and a staged-rollout plan (internal → closed track → corridor).

- **Exit test:** a forced test crash appears in the dashboard from a release build; Play internal
  track accepts the build; data-safety form drafted.

---

## 3. Agentic execution model — how this scales with Claude

The campaign is designed to run as **parallel Claude lanes** with humans only where hardware, prod
access, or vendor accounts are required. This follows the repo's gstack flow and the multi-agent
patterns already proven here (worktree lanes in ENG-REVIEW §Plan, paired `/review`+`/codex` passes).

### Roles per gate

```
 auditor(s)  ──▶  adversarial verifier  ──▶  fix lane  ──▶  independent review  ──▶  CI + human merge
 (read-only,      (separate session,         (worktree,      (/review + /codex,       (branch-protected
  fan out per      prompted to REFUTE        one gate,        staff-engineer +         main, required
  dimension)       each finding)             tests-first)     second opinion)          checks)
```

- **Auditors** are read-only fan-outs: one per audit dimension (e.g. LR1 spawns one auditor per
  controller group + one for the WS gateway). They produce findings with file:line evidence.
- **Verifiers** independently try to refute each finding before it costs fix time. Only CONFIRMED
  findings become tasks. Kill anything the verifier can't reproduce from the code.
- **Fix lanes** run in isolated git worktrees, one gate per lane, disjoint file ownership, each fix
  paired with its regression test. Lanes never push to `main` — PRs only.
- **Reviews:** every lane's PR gets the gstack `/review` (staff-engineer audit) + `/codex`
  (independent second opinion) before merge — the discipline ENG-REVIEW §2c says was skipped once
  and must not be again. `/security-review` additionally gates the LR1–LR4 PRs.
- **Loop until dry:** after all lanes in a track merge, re-run the track's auditors. Two consecutive
  clean rounds close the track.

### gstack mapping

| Campaign step | gstack skill |
|---|---|
| Anything architectural surfaced (cursor pagination, scheduler, region rooms) | `/plan-eng-review` before building |
| Fix-lane PR gate | `/review` + `/codex` |
| LR16 device pass | `/qa` |
| LR18/LR19 UI audits | `/design-consultation` → `/design-review` |
| Post-campaign release | `/ship` |
| Any web research (vendor docs, CDPA, Play policy) | `/browse` |

### Parallelization plan (lanes and dependencies)

| Lane | Gates | Depends on |
|------|-------|------------|
| E-audit | LR1, LR3, LR4, LR5 audits (parallel auditor fan-out) | — |
| E-fix | LR1–LR5 fixes (split per gate into worktrees) | E-audit CONFIRMED findings |
| E-infra | LR7 Terraform prep + LR6 drill scripts | — (founder applies/executes) |
| P-enable | LR9 collector + staging stack + LR10 model | — |
| P-prove | LR11–LR15 | P-enable |
| U-audit | LR18, LR19 (three journey lanes + adherence, parallel) | — |
| U-device | LR16, LR17 | dev build greenlight |
| U-ship | LR20 | LR8 (privacy), device build |

E-audit, E-infra, P-enable, and U-audit all start **day one, in parallel**. The critical path is
P-enable → P-prove (staging + collector before any measurement) and the dev-build greenlight → U-device.

### Guardrails for agent lanes

- Read-only auditors get no write tools; fix lanes get no deploy tools.
- No agent runs `terraform apply`, `gcloud`, or anything against project `lynia-500911` — agents
  emit plans/diffs/runbooks, the founder executes.
- Load generation only against the staging URL; the live pilot URL is out of bounds for harnesses.
- No secrets in prompts or committed files; vendor keys move only via the Secret Manager pattern in
  `PILOT-READINESS.md`.
- Every lane's output is a PR + a dated section in the matching review log — no drive-by pushes.

## 4. Sequencing

| Phase | Content | Gate coverage |
|-------|---------|---------------|
| **0 — Enablers** (~days) | Branch protection + CI lint job (LR4 slice) · staging stack + collector live (LR9) · load model ratified (LR10) · dev-build greenlight requested · drill/terraform prep started (LR6/LR7) | unblocks everything |
| **1 — Audit fan-out** (parallel) | E-audit + U-audit + LR8 lanes run; findings verified adversarially | LR1/3/4/5/8/18/19 findings |
| **2 — Fix lanes** (parallel worktrees) | CONFIRMED findings fixed with tests; LR2 boot guard; LR5 scheduler; LR20 crash telemetry; each PR through `/review`+`/codex` | LR1–LR5, LR18–LR20 |
| **3 — Proof** | Load/contention/soak/storm runs (LR11–LR13) · chaos drills (LR6) · infra hardening applied + restore drill (LR7) · on-device `/qa` + real-network pass (LR16/LR17) · ceilings + cost committed (LR14/LR15) | LR6/7/11–17 |
| **4 — Launch gate** | QA vars cleared + `LAUNCH_MODE=true` · vendor flags on (founder runbook) · go/no-go checklist in one sitting | LR21 |

Phases 1–3 overlap heavily; the phase boundary that is *hard* is 3→4 (no launch gate until every
proof run is green).

## 5. Go/no-go checklist (LR21 — run in one sitting, all must pass)

- [ ] Scorecard LR1–LR20 all ✅ (each closed by its exit test, not by assertion).
- [ ] `PILOT-READINESS.md` founder runbook complete: WhatsApp BSP live, real Didit ZIM-ID run done
      (false-reject rate recorded + acceptable), Firebase/FCM live.
- [ ] QA vars cleared, `LAUNCH_MODE=true` deployed, boot green (LR2 guard passing *in prod config*).
- [ ] One **real end-to-end delivery** on production: real phone signup (WhatsApp OTP) → real KYC'd
      rider → order → auction → select → live tracking → OTP hand-off → rate — while watching the
      LR9 dashboard.
- [ ] Alerts page a human; the on-call/rollback runbook (redeploy previous revision via
      `release.yml`) has been exercised once.
- [ ] Restore drill done within the target RTO; backups verified current.
- [ ] Play Store track approved; crash telemetry receiving from the release build.
- [ ] Rollback decision pre-agreed: what metric/incident triggers pausing signups vs full rollback.

---

## 6. Round log

> Each round: verifiable gates + an adversarial audit fan-out, findings independently verified before
> they become fix tasks, fixes land with a regression test. Loop until two consecutive clean rounds.

### Round 1 — 2026-07-06

Audited LR1–LR5 + LR18 with adversarial verification. Found **7 shipping-blockers under a green CI**:
two IDOR (order snapshot leaked live GPS/parcel to any authenticated non-party; offers list exposed
the bid sheet + rider PII), a mid-session ban bypass, a broken admin mutation path, an
error-swallowing admin modal, a default-JWT-secret boot gap, and no launch guard for the QA bypasses.
Fixed across 6 parallel lanes; an eng+design review then caught 3 more (a cash-enum bug, a
WS-throttler regression, a launch-guard gap), all fixed.

**Convergence note:** while this branch was in review, `main` **independently fixed the same IDOR + ban
issues** (its merged `codebase-bug-review` + `security` branches), added its **own Redis-backed
throttle guard** and a **stricter production env boot-guard** (rejects the default/weak JWT secret,
console OTP, `OTP_TEST_PHONES`, and stub KYC in prod — which closes LR2 more cleanly than a separate
flag), and **replaced the weekly settlement model** with prepaid per-ride commission. So Round 1's
fixes are largely **already on `main`** by a different hand — the campaign's value was confirming the
holes were real, and it converged with the parallel work.

**Rebased onto `main`.** Rather than merge a now-redundant branch (it would have re-introduced the old
settlement model + a duplicate throttler), this branch was rebased onto current `main` and carries only
what `main` still lacks:
- **Global exception filter** (`AllExceptionsFilter`, `APP_FILTER`) — safe generic 500 + correlation
  id, no stack/internal leak. (`main` had none.)
- **1 MB request-body cap** in `main.ts` (rawBody KYC-HMAC path intact).
- **HTTP-level authz e2e suite** (`*-authz.e2e.spec.ts`, supertest, infra-free) — locks in `main`'s
  IDOR fixes: order-snapshot stranger→403/party→200, offers-list non-owner→403, AdminGuard, logout.

### Round 2 — 2026-07-06 (on `main`'s expanded surface)

Adversarial audit of `main`'s **new** code (trust/safety Issues/Reports/SOS modules, prepaid
commission, the new throttle guard, duplicate-ID KYC). The T&S modules audited **clean** (JWT identity,
server-derived subjects, `ParseUUIDPipe`, admin guards, CAS on `issues.resolve`). The real bugs were the
recurring **admin body-shape class** — the console posts the audit envelope `{action,target,reasonCode}`
but the endpoints bind `{reason}`/`{agreedFare}`/`{refundAmount}`:

- **Every destructive admin mutation 400'd** — cancel, fare, suspend, ban (only `lift` worked, by
  accident via `ReasonOptional`), and the dispute **refund**. Ops could not correct a fare, cancel an
  order, suspend/ban a rider, or record a refund through the console. **All fixed**; the refund body is
  now typed against the shared `ResolveIssueRequest`, so this class is a **compile error** going forward.
  *(Audit reported fare+refund; verifying against the code found the wider cancel/suspend/ban set too.)*
- **Mobile error-honesty** re-applied on `main`'s screens (auction + rider-job → honest error+retry).
- **Flagged, not silently changed (needs a product decision):** dispute **refund rows are dead writes**
  — nothing consumes them since the settlement rewrite went read-only, yet the console copy still
  promises "netted off the rider's next settlement." Either wire refund consumption or make the copy
  honest. **PII note:** national IDs are stored/compared in plaintext (duplicate-ID flag) — an LR8 item.

**Verification (local, current `main` + this branch):** typecheck ✅ 5/5 · build ✅ · **API 496 tests**
· **mobile 65 tests**.

### Round 3 — 2026-07-06 (verify + full contract sweep) → CLEAN

Independently verified all four Round-2 admin fixes (each PASS against its endpoint's zod schema —
field names, required fields, number-vs-string coercion, and `.optional()`-vs-`.nullish()` null
handling all correct), then swept **every** client→API write path in the repo for the recurring
"wrong body shape" class: all admin server actions, and all `apps/mobile/src/api/*.ts` request bodies
vs the shared contracts (including the `.strict()` refresh + RUM schemas). **No new confirmed
wire-shape bug** — the class has **converged**. Only two minor non-blockers noted: a dead/defensive
`setKyc` failed-branch (decline is routed through `decideKyc`, which sends the reason correctly), and
a refund cap ($1000) vs fare cap ($100k) inconsistency (likely intentional for the pilot).

**CI on the rebased branch is fully green** — typecheck·build·test, the PostGIS integration suite,
dependency-audit + gitleaks, and CodeQL all pass. (One CI-only miss was caught and fixed: the rebase
dropped the `supertest` devDep the e2e suite needs — it passed locally on stale `node_modules` but
failed CI's frozen-lockfile install; re-added.)

**Track status:** Round 3 is the **first clean round** after Round 2. The engineering-audit surface
(authz, admin money-path contracts, error-honesty) is **converging** — one more clean round formally
closes it under loop-until-dry. The remaining campaign work is the **performance track (LR9–LR15)**,
which needs a staging stack + the OTEL collector (founder infra), and the device/UI track (LR16–LR20).

---

*Findings from this campaign append to `ENG-REVIEW.md` / `DESIGN-REVIEW.md` / `CEO-REVIEW.md` as
dated sections per discipline; status ticks live in the §2 scorecard; overall build status remains in
`PILOT-READINESS.md`.*
