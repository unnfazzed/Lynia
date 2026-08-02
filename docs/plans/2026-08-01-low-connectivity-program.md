# Harare low-connectivity program — spec + master backlog

Created 2026-08-01 (interactive session, user-directed). This is the canonical spec for the
**LC loops** (`docs/routines/harare-loops.md` carries the verbatim trigger prompts;
`docs/ROUTINES.md` + `docs/routines/routine-chain.md` carry policy + schedule). §5's checklists
are the loops' shared work queue — ticking a box in the same PR as the work is how the program
tracks progress; this file is therefore **live state, edited by every LC PR**.

## §1 Mission & device floor

Make LyniaGo genuinely good for its real users: **Android Go-class phones (1–2 GB RAM, Android
8.1+, A53-class CPUs — the itel/Tecno/Samsung-A0x tier) on metered prepaid 2G/3G data (~300–600 ms
RTT, frequent dead zones) in Harare.** Four dimensions, each owned by one loop lane:

| Dimension | Lane | The bar |
|---|---|---|
| **[size]** install/download + OTA bytes | LC-A | Every byte of Play download and every OTA is money out of a prepaid user's pocket; growth must be intentional (DoorDash discipline, `docs/APP-SIZE.md`) |
| **[data]** per-session bytes on the wire | LC-A | A shift of rider work or a customer order must cost KB, not MB |
| **[runtime]** cold start, jank, memory | LC-B | Starts fast, scrolls smoothly, survives low-RAM process death |
| **[resilience]** degraded-network journeys | LC-C | Every core journey survives 600 ms RTT, dead zones, and mid-flow drops — no lost work, no spinner traps, no stale-shown-as-fresh |

Plus a fifth stream in LC-D: **journey blockers** across mobile + admin + merchant through the
low-end lens, and a **read-only infra/CI soundness watch** (findings → ledger, founder applies).

Explicitly out of scope (user decision 2026-08-01): USSD/WhatsApp/SMS ordering channels (true
keypad feature phones are NOT a target — low-end *Android* is), terraform mutations, new
permanent standing routines.

## §2 Budgets (enforced, ratchet-down)

| Budget | Current | Enforcement | Direction |
|---|---|---|---|
| Hermes JS bundle (OTA cost) | 6,455,000 B budget vs ~5.0 MB measured 2026-07-20 | `apps/mobile/size-budget.json` + `ci.yml mobile-bundle-size` (fails PRs over budget) | A-T1 ratchets to measured+5%; budgets only move DOWN in LC PRs; a legitimate raise needs same-PR justification |
| Android export total (JS+assets) | 12,690,000 B budget | same | same |
| Native per-device download | unmeasured (EAS/`mobile-release.yml` dormant) | A-T5 inventories levers + baseline path; report-only until EAS armed | no new native dep without stated size cost |
| Session data (core journeys) | unbaselined | A-T4 traces every request in the core journeys and sets byte budgets from evidence | provisional targets: customer order journey ≤150 KB; rider steady-state ≤300 KB/h — **provisional until A-T4** |
| Cold start | warm-paint shipped for home/profile/history/wallet | B-T1 baselines the boot path | targets: warm boot paints with ZERO network round-trips before first frame; cold boot interactive in ≤3 sequential round-trips |

Budget regressions found by any routine are defects (owning lane files + fixes per universal
policy 2). The weekly LC steer ratchets budgets down where 2+ weeks of headroom exists.

## §3 DoorDash lessons applied (2026-08-01 research pass)

New/refining lessons mined from the DoorDash engineering blog (beyond those already encoded:
Entity-Cache→MicroCache, app-size budgeting, migration discipline, AI-reviewer precision). Each
feeds a concrete item below.

1. **Multi-layer size monitoring** — beyond a per-PR gate: post a human-readable size diff on
   every merge, and gate asset-adding PRs on a format/necessity review.
   ([Shrinking your mobile app](https://careersatdoordash.com/blog/doordash-shrinking-your-mobile-app/))
   → items A-O2, A-O3.
2. **Cold-start: defer everything not needed for first frame** — their launch went −60% largely
   by deferring SDK/module init off the startup path.
   ([iOS launch time −60%](https://careersatdoordash.com/blog/how-we-reduced-our-ios-app-launch-time-by-60/))
   → territory B-T1 (deferrable init inventory).
3. **Compress large *cached* payloads; pick the compressor by decompression cost** (they chose
   LZ4 for Redis-cached menus).
   ([Speeding up Redis with compression](https://careersatdoordash.com/blog/speeding-up-redis-with-compression/))
   → forward-looking note in `docs/PERFORMANCE.md` backlog for the MicroCache Redis L2 path.
4. **Order flows as idempotent, resumable state machines with an explicit unwind path** — retry
   instead of orphaning; ~1% of orders/day saved by graceful retry.
   ([Reliable checkout](https://careersatdoordash.com/blog/building-a-more-reliable-checkout-service-with-kotlin/))
   → C-T1/C-T2's audit bar: every step retryable-or-unwound, no limbo states.
5. **Adopt new reliability machinery as a fallback first; checkpoint non-idempotent side effects**
   so retries skip completed sub-steps.
   ([Cadence as fallback](https://careersatdoordash.com/blog/building-reliable-workflows-cadence-as-a-fallback-for-event-driven-processing/))
   → C guidance for any external-call retry work (push/SMS providers have no natural idempotency key).
6. **Client reliability policy belongs to the contract, not call sites** — central
   timeout/retry/backoff definitions enforced by the shared client.
   ([gRPC client standard](https://careersatdoordash.com/blog/building-a-grpc-client-standard-with-open-source/))
   → item C-O2 (central mobile fetch/retry policy tuned for 600 ms RTT).
7. **Retry storms are a first-class failure mode** — synchronized client retries amplify a
   backend slowdown into an outage; prefer jitter/backoff + adaptive limits over reactive scaling.
   ([Aperture](https://careersatdoordash.com/blog/failure-mitigation-for-microservices-an-intro-to-aperture/))
   → C-O2 includes jittered backoff; noted for PW on the server side.
8. **Serve stale-but-valid on upstream failure (soft/hard dual TTL)** — degradation as a cache
   *feature*; kept their platform up through a multi-hour upstream outage.
   ([Proxy cache](https://careersatdoordash.com/blog/high-performance-proxy-cache-for-doordash-services/))
   → item C-O4 (MicroCache serve-stale mode — never money/assignment/auth).
9. **Server-driven WebView content for low-interactivity screens** — help/KYC-instructions
   content updates without OTA bytes.
   ([Dasher FAQ hub](https://careersatdoordash.com/blog/revamping-dasher-faq-hub-through-server-driven-content-and-webview/))
   → §9 product decision (not scheduled).
10. **Precomputed geo-grid for travel estimates** — the scaling playbook for when bucketed
    PostGIS counts stop being enough.
    ([Fast travel estimates](https://careersatdoordash.com/blog/doordash-fast-travel-estimates/))
    → forward-looking note only.
11. **OTP deliverability is carrier-specific and needs monitoring + fallback**; skip re-challenges
    for low-risk actions — flaky networks make extra friction lockouts.
    ([Frictionless MFA](https://careersatdoordash.com/blog/building-frictionless-mfa-to-protect-against-account-takeovers/))
    → item D-O2 (OTP delivery/verify success telemetry by carrier) + §9 (provider redundancy).

## §4 Phase structure & policies

**Audit-first, then optimize** (user decision 2026-08-01). Each lane works through its Audit
territories (one per firing), then its Optimization checklist (one item per firing), then
self-disables. All `docs/ROUTINES.md` universal policies apply: merge-on-green, never-merge-red,
docs-in-same-PR, sensitive-lane doctrine.

**Defects vs optimizations:** a *defect* found in audit mode is fixed the SAME run with a
regression test (universal policy 2). An *optimization* is appended to the lane checklist — that
is the allowed deferral. **Day-0 bootstrap exception (user-approved sequencing):** defects
confirmed by the 2026-08-01 Day-0 sweep are ledgered OPEN in `docs/KNOWN_BUGS.md` with an owning
LC lane and stand FIRST on that lane's checklist, because the Day-0 session's deliverable is the
program itself; the first lane firings burn them down. Trivial Day-0 fixes shipped in the
program PR directly.

**Dedup:** LC lanes participate in the standard bug-dedup protocol (Phase-0 ledger read, sibling
open-PR read, `LC-*` ledger rows, sibling-sweep evidence for defects). `docs/PERFORMANCE.md`
backlog items are KNOWN, not fresh findings; server-side pure latency/cost work remains the
weekly performance watch's lane (PW) — LC touches the server only for payload shape ([data]) and
resilience seams ([resilience]).

## §5 Lane checklists (the shared work queue — tick in the same PR as the work)

> Ordering within a lane = priority. The weekly steer re-ranks; lanes always take the FIRST
> unchecked item. Effort: S <1 day, M 1–3 days, L multi-day / needs native build or founder.

### Lane A — size & data diet (Opus 5, `0 3 * * 1-6`)

**Audit territory:**
- [x] A-T1 Fresh size baseline **(Day-0)**: `expo export` measured Android total **7.13 MiB**
      (was 12.51 MiB — the LC-A01 font fix cut −5.4 MB), Hermes 6.43 MiB; `size-budget.json`
      ratcheted 12,690,000 → 7,850,000 and `docs/APP-SIZE.md` history reconciled (commit `9affb36`).
- [ ] A-T2 Dependency/import-graph audit of `apps/mobile` (heavy libs, duplicate capabilities,
      unused deps, remaining barrel imports). **Day-0 seeded two unverified candidates to confirm
      first:** `packages/shared/src/contracts.ts:5` (zod v4 i18n locale tables ~392 KB?) and
      `packages/shared/src/index.ts:3` (CJS barrel shipping test fixtures / server-only constants).
- [ ] A-T3 Bundled-asset inventory (fonts/images): format, compression, necessity,
      dynamic-load candidates.
- [ ] A-T4 Wire-bytes profile: trace every request+response of (a) the customer order journey,
      (b) one rider steady-state hour, byte-estimate each from the serialized shapes, set the §2
      session-data budgets from evidence.
- [ ] A-T5 Native binary levers inventory (report-only while EAS dormant): ABI/AAB delivery
      config, resource shrinking, per-device download measurement path.

**Optimization checklist (seeded; audit rounds append):**
- [ ] A-O1 Socket-gate the offers-list 15s poll (keep a slow safety net) — KNOWN backlog. (S)
- [ ] A-O2 Merge-time size diff: extend the `mobile-bundle-size` job to post the measured bytes
      + delta vs base as a PR comment / job summary line, so growth is visible even under budget
      (DoorDash lesson 1). (S)
- [ ] A-O3 Asset-PR guardrail: CI notice when a PR adds files under `apps/mobile/assets/`
      prompting the format/necessity check (DoorDash lesson 1). (S)
- [ ] A-O4 Review rider-offline 8s activeJob poll cadence — KNOWN backlog. (S)
- [ ] A-O5 Cap/paginate `getSnapshot.events[]` (client+API seam) — KNOWN backlog. (M)
- [ ] A-O6 RUM/telemetry upload batching + cadence review on metered data — **Day-0 candidate:**
      `apps/mobile/src/telemetry/rum.ts:87` ships a ~0.9 KB POST every 10s with no sampling. (S)
- [ ] A-O9 **Day-0 candidate:** food journeys run ungated full-order polls — customer
      `app/food/order/[orderId].tsx:96` (2 polls, live GPS defeats 304) and rider
      `app/rider/food-job.tsx:60` (3 polls 8s+5s+5s), unlike their socket-gated parcel siblings. (M)
- [ ] A-O10 **Day-0 candidate:** cold start pays 3 redundant config round trips —
      `apps/mobile/src/net/use-feature-flags.ts:45` (`/app/version-gate` duplicates a `/app/bootstrap`
      field; `/app/feature-flags` refetched per hook, no dedup). (S)
- [ ] A-O7 ALR-07: double GPS stream while foregrounded (~2× location upload) — KNOWN ledger. (M)
- [ ] A-O8 `expo-image` migration (disk/mem cache, downsampling) — KNOWN backlog; **needs native
      build train**. (L)

### Lane B — Go-class runtime perf (Opus 5, `0 4 * * *`)

**Audit territory (confirmed Day-0 defects FIRST — fix each this run with a regression test, then the sweeps):**
- [ ] B-D0 **CONFIRMED CRITICAL** — `apps/merchant/app/components/KitchenConnectionProvider.tsx:112` unbounded render loop (unmemoized context value + tick-bumping alarm effect); `useMemo` the value/alarm, depend on stable callbacks, add a bounded-render-count regression test. See `docs/LC-DAY0-AUDIT-2026-08-01.md`.
- [ ] B-T1 Boot-path trace: everything from process start → first interactive frame
      (`app/_layout.tsx` chain), classify each init as first-frame-critical vs deferrable
      (DoorDash lesson 2); includes KNOWN keystore-read overlap + push-registration timing.
- [ ] B-T2 Re-render audit of the heaviest screens (home, `order/[id]`, rider board, food
      browse) incl. the KNOWN ComposeMap/JobDetailsCard/board-card memo boundaries.
- [ ] B-T3 List + memory audit: every list without virtualization, every unbounded in-memory
      accumulation, image memory behavior on 1–2 GB devices.
- [ ] B-T4 Animation/JS-thread audit: native-driver coverage, tickers, work in render bodies.

**Optimization checklist (seeded; audit rounds append):**
- [ ] B-O1 History/board/notifications lists → FlatList + cursor pagination — KNOWN backlog. (M)
- [ ] B-O2 Memo boundaries for ComposeMap / JobDetailsCard / board-card (with render-isolation
      tests, the AuctionClock pattern) — KNOWN backlog. (M)
- [ ] B-O3 Overlap/defer boot keystore reads — KNOWN backlog. (S)
- [ ] B-O4 Push-registration off the first-paint path — KNOWN backlog. (S)
- [ ] B-O5 Socket self-heal refetch cadence on reconnect attempts — KNOWN backlog. (S)
- [ ] B-O6 Native font embedding (config plugin) — KNOWN backlog; **needs native build train**. (L)

### Lane C — offline & 2G resilience (Opus 4.8, `0 6 * * *`)

**Confirmed Day-0 defects — FIX FIRST (one per firing, before the territories below; regression test each; C01 is sensitive-auth → 4-question treatment). See `docs/LC-DAY0-AUDIT-2026-08-01.md`.**
- [x] C-D0a **CONFIRMED CRITICAL — FIXED (interactive, 2026-08-01)** — `apps/api/src/common/redis.ts`: opt-in `REDIS_FAIL_FAST` (`enableOfflineQueue:false` + 2s `commandTimeout`) applied to the OTP/rate-limit, MicroCache-L2 and tracking geo/position request-path clients; the Socket.IO pub/sub adapter keeps the default. Regression spec in `redis.spec.ts` (asserts the fail-fast config + that a disconnected client rejects rather than pends). Residual: full per-caller rollout is done for the hot paths; the health probe keeps its existing 2s race. See docs/LC-C-REPORT-2026-08-01.md.
- [x] C-D0b **CONFIRMED CRITICAL — FIXED (2026-08-02)** — `apps/merchant/app/lib/use-queue-poll.ts:31`: hung request freezes the kitchen board (latch stuck, no timeout). Fixed together with C-D0c: bounded fetch timeout + self-healing `InflightLatch` + independent `/healthz` active-probe in `reachability.ts`. See docs/LC-C-REPORT-2026-08-02.md.
- [x] C-D0c **CONFIRMED HIGH — FIXED (2026-08-02)** — `apps/merchant/app/lib/api-client.ts:76`: no request timeout anywhere → one stalled 2G request froze the board with "Connected" still showing. `MERCHANT_FETCH_TIMEOUT_MS = 10_000` (`AbortSignal.timeout`) added to every fetch call site.
- [x] C-D0d **CONFIRMED HIGH — FIXED (2026-08-02)** — `apps/merchant/app/lib/api-client.ts:166`: a blip/5xx on `/auth/refresh` signed the merchant out mid-shift. Fixed opportunistically alongside C-D0c since adding the fetch timeout there would otherwise have made this bug's transient-failure path newly reachable via a timeout in addition to its existing network-throw/5xx triggers — `doRefresh` now distinguishes `dead` (401/403, sign out) from `transient` (network/timeout/5xx, keep session).
- [ ] C-D0e **CONFIRMED MEDIUM** — `apps/merchant/app/lib/use-queue-poll.ts:33`: dropped post-mutation refetch + out-of-order responses resurrect an answered takeover; add request-generation sequencing + coalesced trailing refetch.

**Audit territory** (per territory: trace under (a) 2–5 s per request, (b) connection death at
every step boundary, (c) process kill+relaunch at every step boundary; audit bar = DoorDash
lesson 4 — every step retryable or explicitly unwound, no limbo states):
- [ ] C-T1 Customer order journey: create → auction → accept → tracking → delivery code.
- [ ] C-T2 Rider shift journey: go online → board → bid → job → proof/OTP → earnings.
- [ ] C-T3 Onboarding + OTP + KYC capture (incl. photo upload resumability on slow uplink).
- [ ] C-T4 Merchant order-intake on a tablet over mobile data (miss-an-order risk when dropped).
- [ ] C-T5 Reconnect semantics across ALL realtime hooks + the server catch-up seam (what a
      client that was gone 90 s actually recovers, and at what byte cost).

**Optimization checklist (seeded; audit rounds append):**
- [ ] C-O1 ALR-09: offline mutation UX (explicit queued/failed/retry states — never a silent
      drop) — KNOWN ledger. (M)
- [ ] C-O2 Central client network policy: one module defining timeout/retry/backoff-with-jitter
      tuned for 600 ms RTT, replacing per-call-site defaults (DoorDash lessons 6+7); every
      retriable mutation must name its server-side idempotency guarantee. (M)
- [ ] C-O3 Share one Socket.IO connection across realtime hooks (fewer handshakes on lossy
      radio) — KNOWN backlog. (M)
- [ ] C-O4 MicroCache serve-stale-on-upstream-failure mode (soft/hard dual TTL; candidates:
      nearby-count, bootstrap; NEVER money/assignment/auth) (DoorDash lesson 8). (M)

### Lane D — journey & soundness sweep (Opus 4.8, `0 7 * * *`)

**Confirmed Day-0 defects — FIX FIRST (one per firing, before the territories below; regression test each; D06 is sensitive-money → 4-question treatment). See `docs/LC-DAY0-AUDIT-2026-08-01.md`.**
- [x] D-D0a **CONFIRMED CRITICAL — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/components/queue/NewOrderTakeover.tsx`: `submitAccept`/`submitReject` now reset `submitting` on the success path (previously only on error), and `QueueBoard` renders both `NewOrderTakeover` and `NoRiderHoldTakeover` with `key={order.id}` so the takeover fully remounts at the order boundary instead of reusing the same instance across orders — closing the leak for `unavailable`/`showReject` too. Regression test in the new `QueueBoard.test.tsx` (jsdom + Testing Library, newly wired for the merchant app — verified it fails on the pre-fix code and passes after). See docs/LC-D-REPORT-2026-08-02.md.
- [ ] D-D0b **CONFIRMED HIGH** — `apps/merchant/app/components/queue/QueueBoard.tsx:128`: mark-ready / pickup-code / debt-settle fired as bare `void promise` — route through a `run()` helper with per-order busy+error state.
- [ ] D-D0c **CONFIRMED HIGH** — `apps/admin/app/components/ConfirmModal.tsx:118`: dismissal paths not `pending`-guarded + `formKey` re-minted per open → wallet-credit double-apply. Guard Escape/backdrop/Cancel on `pending`; mint `formKey` deterministically.
- [ ] D-D0d **CONFIRMED MEDIUM** — `apps/merchant/app/lib/reachability.ts:98`: offline discipline dead on Menu/Shop/Hours/Statement; give `ReachabilityStore` an independent healthz producer + catch the two swallowing mutations.
- [ ] D-D0e **CONFIRMED MEDIUM** — `apps/merchant/app/(app)/hours/page.tsx:408` + `menu/page.tsx`: busy-mode / back-in-stock / starter-category taps have no `catch`; write the `ApiError` into the existing rendered error state (mirror the sibling handlers).
- [ ] D-D0f **CONFIRMED MEDIUM** — `apps/admin/app/riders/[id]/page.tsx:269`: money ledgers silently truncate at the server cap; disclose the cap + add paging.

**Audit territory:**
- [ ] D-T1 Admin console journey sweep (actions, cash, customers, issues, merchants, orders,
      riders, sos): silent failures, missing states, unpaginated tables, stale-after-mutation.
- [ ] D-T2 Merchant app journey sweep (login → shift → intake loop) through the tablet lens.
- [ ] D-T3 Notification/deep-link coherence under low connectivity (push arrives late/duplicated/
      out of order — where does it strand the user?).
- [ ] D-T4 Infra soundness I (READ-ONLY → report + ledger): failure domains + scaling — the
      Redis-down/degraded behavior seam, DB connection math, health checks, alert coverage.
- [ ] D-T5 Infra soundness II (READ-ONLY → report + ledger): backup/PITR/restore-drill parity,
      CI/deploy gaps beyond KNOWN items, mobile release/OTA pipeline fitness.

**Optimization checklist (seeded; audit rounds append):**
- [ ] D-O1 Low-connectivity state pattern for both web apps: standard error/retry/stale
      components where D-T1/T2 find gaps. (M)
- [ ] D-O2 OTP delivery + verify success telemetry by carrier (Econet/NetOne/Telecel) so
      deliverability regressions are visible (DoorDash lesson 11). (M)

## §6 The loops

Schedule/cap/revert: `docs/routines/routine-chain.md`. Prompts: `docs/routines/harare-loops.md`.
Models (user directive): LC-A/B `claude-opus-5`, LC-C/D `claude-opus-4-8`, steer
`claude-fable-5` — **intended** assignment; programmatic pinning is unavailable
(`model_update_disabled`), so the founder applies it in the claude.ai Routines UI (see the model
caveat in `docs/routines/routine-chain.md`). Each lane: one increment per firing, one in-flight PR per lane
(babysit-don't-fork), self-disable on completion. The Sunday steer re-ranks §5, checks budget
trends, repairs stalled lanes (in-place `update_trigger` + mirror reconciliation), and makes the
completion calls.

## §7 Day-0 sweep (2026-08-01) — summary

Full report + verification-status honesty note: `docs/LC-DAY0-AUDIT-2026-08-01.md`. Ledger rows:
`docs/KNOWN_BUGS.md` "Day-0 LC sweep (2026-08-01)".

**How it ran:** a multi-agent loop-until-dry engine per surface (diverse Go-class/2G finder lenses
→ 3-skeptic adversarial verify → sibling-sweep), Opus finders/verifiers, Fable synthesis. The
account hit its usage limit twice; each surface resumed from cache. Round-1 finders completed for
all four surfaces; **infra, API, and web candidates were adversarially verified; mobile
verification did not complete** (its verifier agents died on the second limit). Mobile's 40
candidates are therefore recorded as CANDIDATES, not CONFIRMED — the LC lanes re-run verify. This
is logged loudly rather than papered over as a "dry" result.

**Shipped in the bootstrap PR (trivial, self-verified):** LC-A01 per-weight Inter imports
(**−5.4 MB / −43%** Android export, budget ratcheted down), LC-A02 dead `expo-localization`
removed, LC-D01 restored the dropped `with-remove-ad-id` manifest-strip plugin (a real regression).

**Confirmed (verified) findings — ledgered OPEN, first on lane checklists (not fixed unattended;
several are sensitive-path):**

| Sev | Count | Where they went |
|---|---|---|
| CRITICAL | 4 | `redis.ts` API-hang (LC-C), kitchen render loop (LC-B), kitchen board freeze (LC-C), 2nd-order-unanswerable (LC-D) + CGNAT rate-limit `armor.tf` (founder) |
| HIGH | 6 | merchant no-timeout / auth-refresh-logout (LC-C), fire-and-forget mutations + admin wallet-credit double-apply (LC-D), `audit_logs` index (PW), Cloud SQL IOPS / release.yml scaling / no-uptime-check (founder) |
| MEDIUM | 6 | queue race, reachability-dead, settings swallow-fail, ledger-cap (LC-D/LC-C), `orders.merchant_id` index (PW) |

Why not fixed here: this bootstrap session's deliverable is the program itself, and the confirmed
defects include sensitive-path changes (the shared auth/OTP Redis client; the admin
wallet-credit idempotency key) that the repo's sensitive-lane doctrine says must not ship as
unverified behavior changes — exactly the care the LC lanes exist to apply. The lanes fire within
a day (LC-C 06:00, LC-B 04:00, LC-D 07:00 UTC) and take these first. The two additive-index
findings are the performance-watch lane's.

**Update (2026-08-02 steer):** LC-C01 was fixed same-day, ahead of the scheduled 06:00 UTC firing
(PR #471). All four `LC-INF*` founder-gated infra items were also applied same-day (PR #470,
reviewed interactively, not auto-merged) — Cloud Armor rate budget, Cloud SQL disk/IOPS, prod
`--max-instances`, and a black-box `/healthz` uptime check. See `docs/KNOWN_BUGS.md`
"Day-0 LC sweep" for current status per item.

## §8 Exit criteria

The program is DONE when: every §5 box is checked (or struck with a reason by the steer) → §2
budgets green for 2 consecutive steer runs → C-T1..T5 journeys re-verified post-fixes → all four
lane triggers self-disabled → the steer writes the closing report, folds the durable lens into
the weekly performance watch's expectations, and disables itself. The grid hours revert to idle
and the chain cap returns to 20.

## §9 Founder-gated / open questions (not lane work)

- LB `log_config.sample_rate = 1.0` and Cloud Run `max_instances = 3` (`infra/terraform/`) —
  KNOWN cost/capacity items; founder applies.
- CDN/edge layer (Cloud CDN or H3-capable edge) — deliberate DNS-only posture stands
  (`docs/CLOUDFLARE.md`); revisit post-launch.
- EAS arming — unlocks A-T5 per-device download measurement, A-O8, B-O6 (the native build train).
- SMS/OTP provider redundancy + carrier-level deliverability monitoring beyond D-O2's telemetry
  (vendor choice + cost).
- Server-driven WebView channel for help/KYC-instruction content (DoorDash lesson 9) — product
  decision; saves OTA bytes if adopted.
- Any infra findings D-T4/T5 ledger as OPEN (read-only doctrine).
