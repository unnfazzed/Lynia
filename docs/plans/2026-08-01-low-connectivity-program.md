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
- [x] A-T2 Dependency/import-graph audit of `apps/mobile` **(2026-08-02)**: both Day-0 candidates
      CONFIRMED — `packages/shared/src/index.ts:3`'s `export * from "./fixtures"` ships a 299-line
      test-only fixture module into every `@lynia/shared` consumer despite having zero production
      consumers anywhere in the repo (its only user is its own sibling self-test, which already
      imports it via a relative path, not the barrel); and `contracts.ts:5`'s `import { z } from
      "zod"` transitively pulls zod v4's `export * as locales from "../locales/index.js"` — ~872 KB
      raw source of 50-language error-message tables, confirmed unused anywhere in the app, and not
      tree-shakeable by Metro's default (non-package-exports) resolution. Ledgered `LC-A03`/`LC-A04`,
      appended as `A-O11`/`A-O12`. Full dependency sweep of `apps/mobile/package.json` (30 deps)
      found no other dead weight — the handful of 0-direct-import packages (`expo-linking`,
      `expo-application`, `react-native-screens`, `expo-build-properties`) are all genuinely needed
      transitively (autolinked native modules required by `expo-router`/`expo-notifications`/
      `posthog-react-native`, or build-time config plugins) and add no avoidable bytes; `lucide-
      react-native` and `@expo-google-fonts/inter` already use the correct per-icon/per-weight
      import discipline (A-T1). See `docs/LC-A-REPORT-2026-08-02.md`.
- [x] A-T3 Bundled-asset inventory **(2026-08-02)**: real `expo export --platform android` run is
      the authoritative asset list (26 assets) — 3 self-hosted Inter TTFs (400/600/700, ~1.03 MB,
      already correctly per-weight-scoped by A-T1, and confirmed the subpath `require()`s do NOT
      pull in the sibling `.ttf.png` glyph-specimen images the package also ships) plus ~7.5 KB of
      tiny default icons from `expo-router`/`@react-navigation/elements` (framework defaults, not
      app content, not actionable). The launcher `icon.png`/`adaptive-icon.png`/`splash-icon.png`
      in `apps/mobile/assets/` are native-build-only (config-plugin-baked into Android resources at
      `expo prebuild`/EAS build time) — confirmed absent from the `expo export` asset list, so they
      cost zero OTA/export bytes; their native-binary cost is A-T5's territory, unmeasured while
      EAS is dormant. Confirmed `apps/mobile` has **zero** dependency on `@lynia/design` (not in
      `package.json`, zero imports) — the brand SVGs/rail payment-method PNGs/handoff screenshots
      living there never enter the mobile bundle at all; no dynamic-load candidate exists for the
      fonts either (first paint is font-gated per B-T1, so lazy-loading them off-device would add a
      network round-trip to the zero-RTT cold-boot path). One new finding: the 3 Inter TTFs ship
      full Unicode coverage (Latin+Cyrillic+Greek+Vietnamese, ~342-344 KB each) though the app's
      source only ever renders Basic Latin + a handful of symbols/punctuation (verified: 23 distinct
      non-ASCII codepoints across all of `apps/mobile/src`+`app`, all common punctuation/symbols,
      zero non-Latin script). A real `pyftsubset` test subsetting to a generous Latin+symbols+emoji
      range still cut each file **65.3%** (342,408→118,960 / 343,632→119,168 / 344,072→119,260
      bytes) — ledgered `LC-A05`, appended as `A-O13`. See `docs/LC-A-REPORT-2026-08-02b.md`.
- [ ] A-T4 Wire-bytes profile: trace every request+response of (a) the customer order journey,
      (b) one rider steady-state hour, byte-estimate each from the serialized shapes, set the §2
      session-data budgets from evidence.
- [ ] A-T5 Native binary levers inventory (report-only while EAS dormant): ABI/AAB delivery
      config, resource shrinking, per-device download measurement path.

**Optimization checklist (seeded; audit rounds append; re-ranked 2026-08-02 steer #2 — see
`docs/LC-STEER-2026-08-02b.md` §4 for rationale):**
- [ ] A-O12 **(re-ranked to #1, was #12)** **A-T2 finding (LC-A04):** stop zod v4's ~872 KB
      locale-tables barrel (`zod/v4/classic/external.js`'s `export * as locales from
      "../locales/index.js"`, 50 languages, confirmed unused) from riding into the Android bundle
      via `contracts.ts`'s `import { z } from "zod"`. Likely needs a Metro `resolveRequest`
      redirect (the same pattern already used for the `@posthog/core` subpath in
      `apps/mobile/metro.config.js`) to substitute a locale-free zod entry point, or a narrower
      official zod import path if one preserves the "classic" `z.object`/`z.string()` API
      contracts.ts relies on — verify the substitute still passes `packages/shared`'s zod-parse
      self-tests before landing. Current Hermes budget headroom is 0.4% (23.7 KB), so this is
      likely the highest-leverage single item on this checklist — promoted ahead of the queue
      because it is the *only* item on this list that shrinks the Hermes bundle itself (A-O1/4/5/
      6/7/9/10 are [data]/round-trip diet, not [size]; A-O2/3 are CI-guardrail meta; A-O8 needs a
      native build train). (S/M)
- [ ] A-O11 **(re-ranked to #2, was #11)** **A-T2 finding (LC-A03):** drop `export * from
      "./fixtures"` from `packages/shared/src/index.ts` — the 299-line test-fixture module has
      zero production consumers (only its own self-test, which already imports it via a relative
      path); repoint `fixtures.test.ts`'s import if needed and give the module a separate,
      non-barrel entry point (or leave it un-exported from the package root) so it never rides
      into a runtime bundle. Zero behavior change, pure dead-weight removal — promoted alongside
      A-O12 for the same reason (only bundle-shrinking items on this list, and the razor-thin 0.4%
      Hermes headroom makes both urgent). (S)
- [ ] A-O13 **(new, ranked #3)** **A-T3 finding (LC-A05):** subset the 3 self-hosted Inter TTFs
      (`src/ui/fonts.ts`) to the glyph ranges the app actually renders instead of shipping each
      weight's full Google-Fonts charset (Latin+Cyrillic+Greek+Vietnamese). A real `pyftsubset`
      test against a generous Basic Latin + Latin-1/Extended-A + general punctuation/symbols/math/
      box-drawing/misc-symbols/dingbats/emoji range (covering every one of the 23 distinct
      non-ASCII codepoints found anywhere in `apps/mobile/src`+`app`, with headroom for names/notes
      users type) cut each file 65.3% (342,408→118,960 / 343,632→119,168 / 344,072→119,260 bytes),
      ~669 KB total off the ~7.13 MiB export. Ranked below A-O11/A-O12 (not above) because it's a
      different budget line: fonts don't change often, and `expo-updates` skips re-downloading an
      asset whose content hash is already cached on-device from install or a prior update, so this
      is primarily an **install-size / first-OTA** win, not a **recurring-every-OTA** win the way
      shrinking the Hermes bundle is. Effort M, not S, despite being mechanical: needs a
      subsetting step wired into the build (e.g. a `pyftsubset`/`fonttools`-based prebuild script,
      since RN/Hermes loads native `.ttf`/`.otf` directly — WOFF2 isn't a viable format swap here),
      a codified "safe range" that gets re-validated as UI copy changes (a grep-based regression
      check pinning the non-ASCII codepoint set is the natural guard), and explicit sign-off that
      dropping non-Latin scripts is acceptable for user-generated free text (names, order notes,
      KYC fields) — a user who types e.g. a Cyrillic or CJK character would see a tofu box for that
      one glyph. Emoji were included in the tested range defensively but are very likely moot:
      Inter carries no color-emoji glyphs, so RN/Android already renders emoji via the system
      font-fallback chain regardless of what's in the app's own font file. (M)
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
- [x] B-D0 **CONFIRMED CRITICAL — FIXED (2026-08-02)** — `apps/merchant/app/components/KitchenConnectionProvider.tsx:112` unbounded render loop (unmemoized context value + tick-bumping alarm effect); `value`/`alarm` now memoized with `useMemo`, and `ring()`/`silence()`/`testRing()`/`arm()` only bump the `alarmTick` re-render trigger on an actual controller-state transition instead of unconditionally (the real trigger — the queue screen's `[unansweredCount, alarm]` alarm-sync effect re-fired itself forever). Render-count regression pin in `KitchenConnectionProvider.test.tsx` (confirmed it hangs against the pre-fix code). Ledger: LC-B04. See `docs/LC-DAY0-AUDIT-2026-08-01.md`, `docs/LC-B-REPORT-2026-08-02.md`.
- [x] B-T1 **AUDITED (2026-08-02)** — Boot-path trace: `app/_layout.tsx` chain traced module-load →
      first-paint. Classification: **first-frame-critical** = `useAppFonts()` (bundled, no network;
      gates the native splash), `AuthProvider`'s `loadSession()` + `index.tsx`'s
      `loadOnboardingSeen()`/`loadRolePreference()` (all local SecureStore reads, no network — these
      three already fire concurrently, not chained, since they're separate effects mounted in the same
      commit); **deferrable / already deferred** = `PersistQueryClientProvider`'s disk-cache restore
      (renders children immediately, hydrates in the background per TanStack's `isRestoring` gate),
      `usePushRegistration`/`PushSync` (check-don't-request, mounts as a null sibling, never blocks
      render — ALR-04), `useServerMinVersion`/`AppNavigator` (fail-open null while pending, renders the
      `Stack` immediately), `useBootstrap`/`BootstrapSync` (fire-and-forget seed, screens self-serve on
      failure), RUM/Sentry/PostHog init (all inert-until-configured or fire-and-forget). **Zero network
      round-trips gate first paint** — the DoveMark splash → `bootDestination()` redirect chain is
      100% local reads. The signed-in boot's network calls (`/app/bootstrap`, `/app/version-gate`, the
      push-token register POST) fire concurrently (not sequentially chained), so the §2 "≤3 sequential
      round-trips" target holds as coded. **Zero new defects** — the chain already reflects
      ALR-01/02/04 + the warm-boot/bootstrap-aggregate work; single-flight token refresh
      (`api/client.ts`) and the query-cache hydrate-only-if-newer semantics rule out the two race
      hypotheses checked (concurrent-401 refresh storm at boot, bootstrap-vs-persisted-cache
      overwrite). **Confirmed via trace, not re-ledgered (Lane A's territory):** the customer home
      screen's `useFeatureFlags()` double-fire (`app/(tabs)/home.tsx:46` + `:109`'s nested
      `RestaurantsRail`, both hitting `/app/feature-flags` independently since the hook has no
      cross-call-site cache) still reproduces — this is exactly A-O10's already-seeded finding, left
      to Lane A. Refined B-O3/B-O4 below with concrete evidence; appended B-O7 (new, speculative,
      needs on-device confirmation). See `docs/LC-B-REPORT-2026-08-02.md`.
- [ ] B-T2 Re-render audit of the heaviest screens (home, `order/[id]`, rider board, food
      browse) incl. the KNOWN ComposeMap/JobDetailsCard/board-card memo boundaries.
- [ ] B-T3 List + memory audit: every list without virtualization, every unbounded in-memory
      accumulation, image memory behavior on 1–2 GB devices.
- [ ] B-T4 Animation/JS-thread audit: native-driver coverage, tickers, work in render bodies.

**Optimization checklist (seeded; audit rounds append; re-ranked 2026-08-02 steer #2 — see
`docs/LC-STEER-2026-08-02b.md` §4 for rationale):**
- [ ] B-O1 History/board/notifications lists → FlatList + cursor pagination — KNOWN backlog. (M)
- [ ] B-O2 Memo boundaries for ComposeMap / JobDetailsCard / board-card (with render-isolation
      tests, the AuctionClock pattern) — KNOWN backlog. (M)
- [ ] B-O7 **(re-ranked to #3, was #7)** Cold-boot request prioritization — defer the push-token
      register POST (`use-push-registration.ts`) and, where feasible, `/app/version-gate` /
      `/app/feature-flags` a beat behind `/app/bootstrap` (e.g. a short delay/idle-callback, or firing
      off `BootstrapSync`'s settle instead of mount) so they don't contend for bandwidth with the
      first-paint-critical aggregate on a constrained 2G/3G link. Impact unconfirmed without an
      on-device 2G trace — audit-only finding from B-T1, not implemented that run. Promoted ahead
      of B-O5/B-O3/B-O6 because it's concrete and S-effort with evidence behind it, unlike O3/O6
      below which are blocked on hardware/native-build access this environment doesn't have. (S)
- [ ] B-O5 Socket self-heal refetch cadence on reconnect attempts — KNOWN backlog. (S)
- [ ] B-O3 Overlap/defer boot keystore reads — KNOWN backlog. **B-T1 evidence:** `loadSession()`
      (`src/auth/session.ts`) and `loadOnboardingSeen()`/`loadRolePreference()`
      (`src/auth/device-state.ts`, read from `app/index.tsx`) already fire concurrently at the
      JS-effect level — same commit, no artificial await-chain between them. The remaining risk is
      native-side: Android Keystore/StrongBox decrypt calls can serialize inside the OS on Go-class
      hardware, which a code trace can't observe. Needs an on-device profile (systrace/logcat
      timestamps across the 3 native calls on an A53-class device) before further JS-side change is
      worth making — **deprioritized below O7/O5 (2026-08-02 steer #2): blocked on hardware access
      this environment doesn't have, not on anything a firing can act on today.** (S)
- [ ] B-O6 Native font embedding (config plugin) — KNOWN backlog; **needs native build train**. (L)
- [ ] ~~B-O4 Push-registration off the first-paint path~~ — **struck through (2026-08-02 steer #2):
      superseded by B-O7.** B-T1's evidence showed the render-blocking half was already fixed
      (ALR-04); the only remaining scope — bandwidth contention on cold boot — was rescoped into
      B-O7 verbatim by the same report. Keeping both as separate unchecked items would double-count
      one piece of work.

### Lane C — offline & 2G resilience (Opus 4.8, `0 6 * * *`)

**Confirmed Day-0 defects — FIX FIRST (one per firing, before the territories below; regression test each; C01 is sensitive-auth → 4-question treatment). See `docs/LC-DAY0-AUDIT-2026-08-01.md`.**
- [x] C-D0a **CONFIRMED CRITICAL — FIXED (interactive, 2026-08-01)** — `apps/api/src/common/redis.ts`: opt-in `REDIS_FAIL_FAST` (`enableOfflineQueue:false` + 2s `commandTimeout`) applied to the OTP/rate-limit, MicroCache-L2 and tracking geo/position request-path clients; the Socket.IO pub/sub adapter keeps the default. Regression spec in `redis.spec.ts` (asserts the fail-fast config + that a disconnected client rejects rather than pends). Residual: full per-caller rollout is done for the hot paths; the health probe keeps its existing 2s race. See docs/LC-C-REPORT-2026-08-01.md.
- [x] C-D0b **CONFIRMED CRITICAL — FIXED (2026-08-02)** — `apps/merchant/app/lib/use-queue-poll.ts:31`: hung request freezes the kitchen board (latch stuck, no timeout). Fixed together with C-D0c: bounded fetch timeout + self-healing `InflightLatch` + independent `/healthz` active-probe in `reachability.ts`. See docs/LC-C-REPORT-2026-08-02.md.
- [x] C-D0c **CONFIRMED HIGH — FIXED (2026-08-02)** — `apps/merchant/app/lib/api-client.ts:76`: no request timeout anywhere → one stalled 2G request froze the board with "Connected" still showing. `MERCHANT_FETCH_TIMEOUT_MS = 10_000` (`AbortSignal.timeout`) added to every fetch call site.
- [x] C-D0d **CONFIRMED HIGH — FIXED (2026-08-02)** — `apps/merchant/app/lib/api-client.ts:166`: a blip/5xx on `/auth/refresh` signed the merchant out mid-shift. Fixed opportunistically alongside C-D0c since adding the fetch timeout there would otherwise have made this bug's transient-failure path newly reachable via a timeout in addition to its existing network-throw/5xx triggers — `doRefresh` now distinguishes `dead` (401/403, sign out) from `transient` (network/timeout/5xx, keep session).
- [x] C-D0e **CONFIRMED MEDIUM — FIXED (2026-08-02)** — `apps/merchant/app/lib/use-queue-poll.ts:33`: a refetch requested while a poll was in flight (the common post-accept/reject case) was silently dropped instead of coalesced, and a stale out-of-order response had no sequencing guard against clobbering a fresher one. Fixed with a coalesced trailing refetch (a pending flag fires one more round the instant the in-flight request settles) + a monotonic per-hook generation counter (only the latest generation's response is applied to state). Regression tests in `use-queue-poll.test.ts` (confirmed both fail against the pre-fix code). Ledger: LC-C05. See `docs/LC-C-REPORT-2026-08-02b.md`.

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
- [x] D-D0b **CONFIRMED HIGH — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/components/queue/QueueBoard.tsx:128`: mark-ready / pickup-code reveal now propagate rejections instead of firing as bare `void`; `OrderCard` owns per-order busy+error state (mirrors `PaymentBucketActions.run()`) for both, and `ReturnsSection`'s previously-bare "Confirm the food is back" goods-return button gets the same per-order busy+error treatment. Regression tests in `QueueBoard.test.tsx`. See docs/LC-D-REPORT-2026-08-02.md.
- [x] D-D0c **CONFIRMED HIGH — FIXED (LC loop D, 2026-08-02)** — `apps/admin/app/components/ConfirmModal.tsx:118`: dismissal paths not guarded + `formKey` re-minted per open → wallet-credit double-apply. All three dismiss paths (Escape/backdrop/Cancel) now guard on a new explicit `submitting` state — not `useTransition`'s `pending`, which turned out not to track an async callback's real duration in React 18 (empirically confirmed: it flips back to `false` right after the callback's first `await`, before guarding would ever matter). Regression tests in the new `ConfirmModal.test.tsx`. Ledger: LC-D06. See docs/LC-D-REPORT-2026-08-02.md.
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

**Update (2026-08-02 steer #2):** since the first steer run, the sprint cadence (8×/day per lane,
`docs/routines/harare-loops.md`) drove all four lanes through their remaining Day-0 defects in one
day: LC-B04 (PR #473), LC-C02/C03/C04 (PR #474), LC-D02/LC-D03/LC-D06 (PRs #476/#478/#481), and
LC-C05 (PR #479) are now all FIXED — every Day-0-confirmed defect across all four lanes is closed
except D-D0d/D-D0e/D-D0f (MEDIUM, still OPEN → LC-D). LC-A completed its first audit territory
(A-T2, PR #480) and LC-B its second (B-T1, PR #483), both clean audits that seeded new optimization
items (A-O11/A-O12, B-O7) rather than finding fresh defects. All 11 LC-branded PRs today merged
clean — no stalled lane, no trigger repair needed. See `docs/LC-STEER-2026-08-02b.md` for the full
re-rank and budget-risk detail.

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
