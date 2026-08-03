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
| Native per-device download | unmeasured (EAS/`mobile-release.yml` dormant) | A-T5 (2026-08-03) confirmed the delivery config (AAB split) + shrink levers (R8/resources) are already optimal and the measurement path already exists in `mobile-release.yml`; the number itself stays blocked on a founder arming `EAS_RELEASE_ENABLED` | no new native dep without stated size cost |
| Session data (core journeys) | baselined 2026-08-03 (A-T4, field-by-field trace, not live capture): customer parcel journey ≈181 KB/26min (172 KB resp + 9.3 KB req; WS-primary tracking); customer food journey ≈360-405 KB/26min (poll-only, no socket exists for food orders); rider steady-state hour ≈173-422 KB (parcel job leg) or ≈422-653 KB (food job leg), range driven by RUM sampling assumption | report-only, no CI gate yet; A-T4 traced every request+response against the real service/response-builder code, accounting for `apps/api/src/main.ts:92-99`'s gzip/brotli compression (≥1 KB bodies only) and the client's ETag conditional-GET layer (`apps/mobile/src/api/client.ts:91-118`) | provisional ≤150 KB / ≤300 KB/h targets retired as unrealistic pre-fix; new evidence-based near-term targets: customer parcel journey ≤120 KB, customer food journey ≤150 KB, rider steady-state hour ≤200 KB/h — A-O9 (food dual-poll, 2026-08-03f) and A-O6 (RUM sampling, 2026-08-03g) have both now landed; re-baselining against these targets in practice is the weekly steer's job; A-O14/A-O7 add further headroom |
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
- [x] A-T4 Wire-bytes profile **(2026-08-03)**: field-by-field trace (not live capture) of every
      request+response in the customer order journey — parcel (WS-primary tracking) and food
      (poll-only, no socket wired: confirmed via `food/order/[orderId].tsx:93-94`'s own comment) —
      and one rider steady-state hour (idle board + one job leg, run separately for parcel vs food),
      arithmetic checked field-by-field against the real service/response-builder code
      (`orders.service.ts`, `food-order.service.ts`, `contracts.ts` schemas), accounting for the
      API's gzip/brotli compression (`apps/api/src/main.ts:92-99`, ≥1 KB bodies only, WS traffic
      exempt) and the client's ETag conditional-GET layer (`apps/mobile/src/api/client.ts:91-118`).
      Findings: **customer parcel journey ≈181 KB** (26-min session: 172 KB response + 9.3 KB
      request; RUM telemetry — already-ledgered A-O6 — alone accounts for ≈140 KB of that);
      **customer food journey ≈360-405 KB** for the same envelope, 7-8× the parcel cost, entirely
      attributable to the poll-only tracking phase plus the already-known A-O9 dual-poll finding;
      **rider steady-state hour ≈173-422 KB** (parcel job leg) or **≈422-653 KB** (food job leg) — a
      single 20-minute food job alone can exceed the old 300 KB/h provisional target. Re-confirmed
      A-O7 (GPS double-stream, still live at both cited call sites) and A-O9 (food dual-poll,
      ETag-defeated because the embedded rider GPS busts the weak ETag on nearly every poll) with
      fresh per-tick byte figures. Found **A-O1 (offers-list socket-gating) already implemented** in
      current code — both `openOrders`(15s, `apps/mobile/app/rider/(tabs)/index.tsx:467`) and
      `activeJob`(8s, `:247`) only poll when `board.connected` is false — ticked below with citation
      as a confirmed-complete finding, not counted as an optimize-mode increment. Four NEW findings
      ledgered `LC-A06`…`LC-A09`, appended as `A-O14`…`A-O17` below and re-ranked by [data] impact.
      Zero fixed-this-run defects — every finding is a byte-diet optimization on already-correct
      functionality (matches the A-T2/A-T3 precedent). §2's session-data budget row updated from
      "provisional" to evidence-baselined near-term targets. See `docs/LC-A-REPORT-2026-08-03.md`.
- [x] A-T5 **AUDITED (2026-08-03)** — Native binary levers inventory (report-only while EAS
      dormant): confirmed **already optimal** — `eas.json`'s `production` profile builds an AAB
      (`android.buildType: "app-bundle"`), so Play's automatic per-device split already covers ABI
      + density + language without any manual `splits`/`resConfigs` Gradle config (the QA sideload
      APK is intentionally universal-ABI per `docs/APP-SIZE.md`, not a real delivery shape); R8 +
      resource shrinking are already enabled via `expo-build-properties` in `app.config.ts` and
      measured effective (`docs/APP-SIZE.md`: dex −75%); the per-device measurement path exists
      (`mobile-release.yml`'s AAB-size step) and deliberately avoids vendoring `bundletool`
      (documented supply-chain rationale), but stays numerically unmeasured until a founder arms
      `EAS_RELEASE_ENABLED` — not something a JS/config-only firing can close. **Zero defects, zero
      new optimization items** — closes Lane A's audit-territory phase; Lane A moves permanently
      into OPTIMIZE MODE. See `docs/LC-A-REPORT-2026-08-03b.md`.

**Optimization checklist (seeded; audit rounds append; re-ranked 2026-08-02 steer #2 — see
`docs/LC-STEER-2026-08-02b.md` §4 for rationale — and again 2026-08-03 by the A-T4 wire-bytes
evidence: A-O9 and A-O6 promoted to #4/#5 since A-T4 quantified them as the two largest per-session
[data] byte levers by a wide margin — A-O9's food dual-poll alone costs ≈94-271 KB/session and
A-O6's RUM telemetry ≈68-324 KB/h, dwarfing A-O1/4/5/10 — while A-O11/A-O12 stay ahead of everything
since they gate the razor-thin Hermes CI budget, a harder constraint than [data] bytes):**
- [x] A-O12 **DONE (2026-08-03c)** **(re-ranked to #1, was #12)** **A-T2 finding (LC-A04):** stop
      zod v4's ~872 KB locale-tables barrel (`zod/v4/classic/external.js`'s `export * as locales
      from "../locales/index.js"`, 50 languages, confirmed unused) from riding into the Android
      bundle via `contracts.ts`'s `import { z } from "zod"`. Shipped as a Metro `resolveRequest`
      redirect in `apps/mobile/metro.config.js` (the same pattern already used for the
      `@posthog/core` subpath) — scoped by importer path to zod's own `v4/classic/external.{js,cjs}`
      **and** `v4/core/index.{js,cjs}` (a second, independent re-export of the same barrel found
      only once the first cut's narrower pattern measured zero improvement) to an empty stub;
      `packages/shared`'s zod-parse tests (157 tests, contracts.ts schemas) all still pass.
      Measured via `expo export --platform android`: Hermes bundle 6,439,957 → 6,189,900 bytes
      (−250,057 B / −3.9%), headroom 0.2% → 4.1%. See `docs/LC-A-REPORT-2026-08-03c.md`.
- [x] A-O11 **DONE (2026-08-03d)** **(re-ranked to #2, was #11)** **A-T2 finding (LC-A03):**
      dropped `export * from "./fixtures"` from `packages/shared/src/index.ts`. A repo-wide
      re-check this run found one real barrel consumer the original A-T2 sweep missed —
      `apps/api/src/offers/offers.service.spec.ts` imported `makeOffer` via `@lynia/shared` (not
      `apps/mobile`/`apps/admin`/`apps/merchant`, so never a mobile-bundle cost either way, but it
      would have broken on removal) — so instead of leaving the module fully unexported, gave
      `fixtures.ts` a proper non-barrel entry point: a new `"./fixtures"` subpath in
      `packages/shared/package.json`'s `exports` map, and repointed that one import to
      `@lynia/shared/fixtures`. `fixtures.test.ts` needed no change (already used the relative
      import). Measured via `expo export --platform android`: Hermes bundle 6,194,115 → 6,189,316
      bytes (−4,799 B / −0.08%), Android export total 7,238,815 → 7,234,016 bytes (−4,799 B).
      `packages/shared`'s 157 tests + `offers.service.spec.ts`'s 19 tests pass; full monorepo
      `pnpm typecheck && pnpm lint && pnpm test` green. See `docs/LC-A-REPORT-2026-08-03d.md`.
- [x] A-O13 **DONE (2026-08-03e)** **A-T3 finding (LC-A05):** subset the 3 self-hosted Inter TTFs
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
      **Shipped 2026-08-03e:** all three prerequisites delivered — `apps/mobile/scripts/
      subset-fonts.mjs` (pyftsubset via the `fonttools` Python package, dev-time only, never runs in
      CI) regenerates the committed assets in `apps/mobile/assets/fonts/` from the Unicode ranges
      pinned in the new `scripts/font-safe-ranges.mjs` (shared with the checker so the two can't
      drift); `scripts/check-font-charset.mjs` (wired into `pnpm lint`, zero dependencies like
      `check-bundle-size.mjs`) scans every `.ts`/`.tsx` under `app/`+`src/` and fails CI if a future
      string introduces a codepoint outside the safe ranges; the sign-off on dropping non-Latin
      scripts is recorded explicitly in `docs/APP-SIZE.md` and `docs/KNOWN_BUGS.md` (LC-A05) — a
      free-text character outside the range shows a tofu box, unchanged from today's behavior for
      any character already outside Inter's charset, and neither Shona nor Ndebele (Zimbabwe's other
      official languages, both Latin-script) needs anything beyond the retained Latin Extended-A/B
      block. `fonts.ts` now `require()`s the local subset assets; `@expo-google-fonts/inter` moved
      from a runtime dependency to a devDependency (only the subsetting script's source material).
      Measured via `expo export --platform android`: **Android export total 7,240,457 → 6,546,466
      bytes (−693,991 B / −9.6%)**; each font file 342-344 KB → 112-113 KB (−67.3%, exceeding the
      65.3% test estimate). Hermes bundle unchanged (fonts are export assets, not JS) —
      `size-budget.json` left untouched this run per the A-O11/A-O12 precedent (ratcheting is the
      weekly steer's job). All 705 mobile tests + full monorepo `pnpm typecheck && pnpm lint && pnpm
      test` green. See `docs/LC-A-REPORT-2026-08-03e.md`.
- [x] A-O9 **DONE (2026-08-03f)** **(re-ranked to #4, was #10 — 2026-08-03 A-T4 evidence)** food
      journeys ran ungated full-order polls — customer `app/food/order/[orderId].tsx` (the
      post-dispatch `trackQ`, live GPS defeats 304) and rider `app/rider/food-job.tsx` (the
      `activeJob` poll shared with the parcel screen), unlike their socket-gated parcel siblings. The
      key finding that shrank this from the estimated L effort: the WS room/gateway plumbing was
      **already fully generic** — `canAccessOrder`/`isAssignedRider`/`assignedRiderId`
      (`tracking.service.ts`) and `emitOrderStatus`/`subscribeOrder` (`tracking.gateway.ts`) key off
      the shared `Order` row with no `orderType` filter, and `FoodDispatchService` already calls
      `gateway.emitOrderStatus(orderId, "assigned"|"requested")` into that exact room — so
      `useOrderSocket`/`useRiderJobSocket` (unmodified) subscribe correctly for a food order today;
      zero server changes were needed. Wired both hooks in, gated `trackQ`'s 10s poll and the rider's
      `activeJob` 8s poll on the returned `connected` flag (mirroring the already-audited A-O1
      pattern: the poll survives only as the reconnect/offline fallback). Deliberately left
      poll-only: `useFoodOrder` (customer's pre-dispatch/kitchen-phase poll — no WS event exists for
      those transitions yet) and the rider's `foodQ`/`returnLegQ` (cash-handshake/debt-ledger
      fields) — both carry money-adjacent state the lane rules bar trading for bytes; see the report
      for the reasoning and the two follow-on items this left on the table.
      **Evidence** (field-by-field trace, `Buffer.byteLength(JSON.stringify(...))` on a realistic
      payload per the real response-builder code, mirroring A-T4's methodology): customer `trackQ`
      over a 22-min tracking window drops from ~132×1,079 B ≈ 139.1 KB to ~13.8 KB while the socket
      stays connected (−125.3 KB, −90%); rider `activeJob` over a 20-min job leg drops from
      ~150×1,138 B ≈ 166.7 KB to ~12.6 KB (−154.1 KB, −92%). `useFoodOrder`/`foodQ`'s unchanged
      polls are unaffected. All 4 new wiring-regression tests pass (2 files); full monorepo
      `pnpm typecheck && pnpm lint && pnpm test` green (721 mobile / 1516 API tests, unchanged
      elsewhere). See `docs/LC-A-REPORT-2026-08-03f.md`.
- [x] A-O6 **DONE (2026-08-03g)** **(ranked #5, was #9 — 2026-08-03 A-T4 evidence)** RUM/telemetry
      upload batching + cadence review on metered data — **Day-0 candidate:**
      `apps/mobile/src/telemetry/rum.ts:87` shipped a POST every 10s whenever the
      buffer was non-empty (not sampled). A-T4 measured real batch sizes by sample count (1 sample
      ≈79B, 10 ≈349B, 20-cap ≈649B) — smaller than the ledger's original ~0.9KB/flush estimate in
      the common case, but during any active-tracking or food-polling window the buffer was
      essentially always non-empty (an `apiFetch` sample enqueues on every request), so the realistic
      cost was ≈68-324 KB/hour depending on request volume — the #2 [data] lever after A-O9. Needed
      real sampling (e.g. 1-in-N or time-boxed), not just batching.
      **Shipped:** `enqueueApiFetch` now keeps 1-in-4 `apifetch` samples via a deterministic modulo
      counter (glass samples — `position_glass`/`offer_glass`/`board_glass` — stay unsampled: they're
      already bounded by real WS push frequency and each is independently informative); the
      `dropped` skew-counter is untouched by sampled-out calls (kept semantically separate from
      clock-skew discards). `FLUSH_INTERVAL_MS` widened 10s → 30s (AppState background/inactive
      still flushes immediately, so nothing is lost on backgrounding — only the foreground
      quiet-buffer cadence widened) so a mostly-quiet buffer stops paying a POST's fixed per-request
      overhead every 10s for 1-2 samples. Measured via a synthetic driver over the real
      `buildBatches()` logic against A-T4's traced request rates: active customer tracking
      (~3s/apifetch) 54,000 B/h → 15,000 B/h (**−72.2%**), 360 → 120 req/h (**−66.7%**); rider
      steady-state food job leg (~1.5s/apifetch) 90,000 B/h → 24,000 B/h (**−73.3%**), 360 → 120
      req/h (**−66.7%**). 11 new regression tests in the module's first dedicated test file
      (`__tests__/rum.test.ts`) cover the pure functions, the exact 1-in-4 sampling cadence, the
      widened flush interval, and the still-immediate background flush. No bundle-size impact
      (JS-logic-only, no new deps/assets); full monorepo `pnpm typecheck && pnpm lint && pnpm test`
      green. See `docs/LC-A-REPORT-2026-08-03g.md`.
- [ ] A-O14 **(new, ranked #6 — A-T4 finding, LC-A06)** `MerchantOrderResponse`
      (`packages/shared/src/contracts.ts:945-1007`, 39 fields) is serialized unconditionally by
      `food-order.service.ts`'s `toResponse()` (`:781-842`) regardless of order phase — unlike the
      parcel `OrderSnapshot`'s `getSnapshot()`, which deliberately nulls out phase-irrelevant fields
      (`orders.service.ts:887-905`). Debt-ledger/refund/cash-handshake fields (11 fields) ride every
      poll even mid-delivery on a wallet-paid order that will never touch them — ≈500B of guaranteed
      null padding per poll. Compounds directly with A-O9: since A-O9's fix will keep polling (or a
      lighter poll) alive as a fallback even after a food WS lands, trimming this response by
      phase/status (mirroring `getSnapshot`'s pattern) removes real bytes from every future poll too.
      (S/M)
- [x] A-O1 **(confirmed already implemented — 2026-08-03 A-T4 evidence)** Socket-gate the
      offers-list 15s poll (keep a slow safety net). Current code already does this: both
      `openOrders`(15s, `apps/mobile/app/rider/(tabs)/index.tsx:467`) and `activeJob`(8s, `:247`)
      set `refetchInterval` to `false` whenever `board.connected` is true, falling back to the
      timed poll only when the board socket is down (the self-heal safety net) — confirmed by
      reading the current hook wiring, not just the interval literal. No code change needed; item
      closed as already-satisfied rather than re-implemented.
- [ ] A-O17 **(new, ranked #7 — A-T4 finding, LC-A07)** Three independent Socket.IO connections
      (`apps/mobile/src/realtime/socket.ts:12-13`'s `createSocket()` opens a fresh `io(...)` per
      call, no sharing/singleton) run concurrently during an active rider job — the board socket
      (`use-rider-board.ts:56`, stays mounted since the `(tabs)` screen isn't unmounted when
      `/rider/job` is pushed on top), the job socket (`use-rider-job-socket.ts:48`), and the
      location-stream socket (`use-rider-location.ts:64`) — each with its own transport handshake
      and its own ~25s engine.io ping/pong keepalive (no `pingInterval`/`pingTimeout` override found
      server-side), tripling background keepalive chatter and tripling reconnect-driven self-heal
      REST refetches on any blip. A multiplexed single connection (Socket.IO namespaces on one
      transport) would collapse this to one handshake + one keepalive stream. (M)
- [ ] A-O15 **(new, ranked #8 — A-T4 finding, LC-A08)** `apps/mobile/app/(tabs)/home.tsx:121-132`
      runs its own 30s `refetchInterval` poll of `/orders/mine/active-order` for as long as the
      customer sits on the Home tab, plus force-invalidates it on every focus (`:121-126`) and
      foreground (`:134-137`) event — duplicating the same logical data `useBootstrap` already seeds
      from `/app/bootstrap` (`use-bootstrap.ts:17`) at cold start. A customer who lingers on Home
      before ordering (the common case — it's the launcher screen) pays 2+ extra round trips/minute
      for data that's usually unchanged. Same redundant-polling shape as A-O10, just for
      order-state instead of config; a shared cache key / longer stale-time would close it. (S)
- [ ] A-O4 Review rider-offline 8s activeJob poll cadence — KNOWN backlog; re-confirmed still live
      2026-08-03 (A-T4): `activeJob` (`apps/mobile/app/rider/(tabs)/index.tsx:247`) has no
      `enabled: online` gate (unlike its sibling `openOrders` at `:461`), so it polls every 8s
      indefinitely even while the rider is fully offline with the board tab open. (S)
- [ ] A-O5 Cap/paginate `getSnapshot.events[]` (client+API seam) — KNOWN backlog; re-confirmed
      2026-08-03 (A-T4): `orders.service.ts:907` ships `events: order.events` with no `.slice()`/cap,
      inflating every parcel job-detail poll ~55B/event as a job progresses. (M)
- [ ] A-O16 **(new, ranked #12 — A-T4 finding, LC-A09)** Google Places autocomplete/details calls
      (`apps/mobile/src/api/places.ts:62-75`, wired from `AddressSearch.tsx:173`'s 300ms debounce)
      are uncapped and have no prefix-level response memoization — typing a full address fires a
      fresh ~1-2KB Google response per settled keystroke pause with heavy content overlap between
      calls (e.g. "12", "12 Josiah", "12 Josiah Tongogara" each a full independent fetch). Estimated
      ≈9.4 KB/order in address entry alone (Phase 2a of the A-T4 trace). Outside Lynia's own
      ETag/caching infrastructure (a direct Google REST call), so this needs its own prefix-cache
      layer, not a server-side fix. Ranked below the in-house items since it's real but
      third-party-bounded cost, not a defect in Lynia's own response shaping. (S/M)
- [ ] A-O10 **Day-0 candidate:** cold start pays 3 redundant config round trips —
      `apps/mobile/src/net/use-feature-flags.ts:45` (`/app/version-gate` duplicates a `/app/bootstrap`
      field; `/app/feature-flags` refetched per hook, no dedup). (S)
- [ ] A-O7 ALR-07: double GPS stream while foregrounded (~2× location upload) — KNOWN ledger;
      re-confirmed still live 2026-08-03 (A-T4): both `use-rider-location.ts:88-91` (foreground
      stream) and `background-location-task.ts:85-103` (background-task stream) emit the same
      `rider:location` event in parallel at matching 10s/25m intervals — measured ≈13.2 KB of pure
      duplicate GPS bytes per 20-minute active job window. (M)
- [ ] A-O2 Merge-time size diff: extend the `mobile-bundle-size` job to post the measured bytes
      + delta vs base as a PR comment / job summary line, so growth is visible even under budget
      (DoorDash lesson 1). (S)
- [ ] A-O3 Asset-PR guardrail: CI notice when a PR adds files under `apps/mobile/assets/`
      prompting the format/necessity check (DoorDash lesson 1). (S)
- [ ] A-O8 `expo-image` migration (disk/mem cache, downsampling) — KNOWN backlog; **needs native
      build train**. (L)
- [ ] A-O18 **(new, ranked #13 — A-O9 follow-on, 2026-08-03f)** the two food polls A-O9 deliberately
      left alone: customer `useFoodOrder` (`use-food-order.ts`, 4s/15s poll for the pre-dispatch/
      kitchen-confirm phase) and rider `foodQ`/`returnLegQ` (`food-job.tsx`, kitchen/cash-handshake
      fields, 5s). Unlike A-O9's target, these carry data no WS event currently exists for —
      `food-order.service.ts` never calls `gateway.emitOrderStatus`/any gateway method for its own
      kitchen-phase transitions (accept, markReady, item-approval, payment-confirm), only
      `FoodDispatchService` does (dispatch-phase only). Closing this needs NEW server-side emits from
      `food-order.service.ts`'s own transitions — a bigger, `apps/api/src/orders/`-adjacent-but-not
      change than A-O9's pure client-side reuse — and, for the cash-handshake/debt-ledger fields
      specifically, care that a missed push can't silently understate what's owed (money-adjacent;
      sensitive-lane doctrine questions apply once a server diff is on the table). (M/L)

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
- [x] B-T2 **AUDITED (2026-08-02)** — Re-render audit of home/`order/[id]`/`food/order/[orderId]`/
      rider-board/food-browse + the ComposeMap/JobDetailsCard/board-card memo boundaries (agentic
      lane-bug-hunt: 5 lenses → adversarial verify → sibling-sweep). **2 CONFIRMED correctness
      defects, fixed this run:** `LC-B05` — `home.tsx`'s (and sibling `send.tsx`'s) active-order
      cache write-back (`qc.setQueryData(orderKey(id), activeOrder)`) fired even while blurred
      beneath `/order/[id]`, unguarded by the `homeFocused` state that already gates its own poll;
      an unrelated foreground-refetch of `activeOrderQ` (real trigger: `useForegroundRefetch`'s
      AppState listener, which doesn't know or care which route is visible) could then blindly
      replace the SAME `orderKey(id)` cache entry `use-order-socket.ts` streams live GPS
      position/status into — bypassing that hook's own `lastPositionRef`/`reconcileAfterRefetch`
      anti-rollback guard and rolling the rider's pin backward on the live tracking map for one
      tick. Fixed by gating both write-back effects on `homeFocused` (mirrors the existing poll
      gate) — a write only ever seeds the cache ahead of navigating TO the order screen, never
      clobbers it while already there. Render-count-agnostic regression test in
      `app/(tabs)/__tests__/home.test.tsx` (confirmed it fails against the pre-fix code: cached
      rider position regresses to the stale HTTP value instead of the fresher socket-applied one).
      `LC-B06` — three sites derive `now` via `useMemo(() => new Date(), deps)` intending a "recompute
      on data change" clock (`food/search.tsx:19` with `[]`, `food/index.tsx:17` and
      `(tabs)/home.tsx`'s `RestaurantsRail` with `[feed.restaurants]`) but `useRestaurantListFeed`'s
      default TanStack Query structural sharing keeps the SAME object reference across a no-change
      refetch, so `now` stayed pinned at first render in practice — a restaurant open at screen-open
      kept showing "Open now" / "Closing in N min" (and stayed included in the "Open now" filter on
      `food/index.tsx`) after it had actually closed, for as long as the screen stayed mounted.
      Fixed with a new shared `useNow(intervalMs=60_000)` hook (`src/logic/use-now.ts`) — a real
      60s-interval clock, minute-granularity being all `isMerchantOpenNow`/`minutesUntilClose` need
      — wired into all three sites. Regression test `src/logic/__tests__/use-now.test.tsx` (fake
      timers; confirms the clock actually advances rather than freezing after first render).
      **2 pure-optimization findings (no wrong output) appended to the checklist below, not fixed
      this run** — the rider-board keystroke cascade (`B-O9`, refining `B-O2`) and the food-order /
      rider-food-job unconditional 1s ticker (`B-O8`). **1 candidate refuted** — ComposeMap's
      inline Marker `coordinate` object was confirmed real by the finder but 2-of-3 verifiers ruled
      it a duplicate of the already-tracked `B-O2` (no fresh correctness defect beyond the known
      missing-memo backlog). See `docs/LC-B-REPORT-2026-08-02.md`.
- [x] B-T3 **AUDITED (2026-08-03)** — List + memory audit: every list without virtualization, every
      unbounded in-memory accumulation, image memory behavior on 1–2 GB devices (3 lenses, read-only
      Explore agents — the lane-bug-hunt workflow's custom-lane arg silently fell back to the
      hardcoded wallet lane again, the same tooling misconfiguration as `LC-B-SIB-1/2`; see the note
      below and the new `LC-B-SIB-3/4` ledger rows it produced off-lane). **2 CONFIRMED defects,
      fixed this run:** `LC-B07` — the customer restaurant browse/search screens
      (`apps/mobile/app/food/index.tsx`, `food/search.tsx`) rendered `GET /restaurants` (which,
      unlike every other list endpoint — history capped 50, board capped 50, notifications capped
      30 — has **zero server-side cap**) through a plain `ScrollView` + `.map()`, mounting every
      matching restaurant's cover-photo `Image` concurrently regardless of catalog size — a real
      OOM trajectory on a 1-2GB device as merchant onboarding grows the corridor's catalog, not yet
      triggered at today's pilot scale but the one list in the app that gets strictly worse as the
      business grows rather than staying flat. Fixed by converting both screens to `FlatList` (this
      codebase's first — a template for `B-O1`), which windows the concurrently-mounted/decoded
      images to what's on-screen independent of catalog size; the query itself staying uncapped is
      left as `B-O10` below. Regression tests in `app/food/__tests__/index.test.tsx` /
      `search.test.tsx` (assert a single `FlatList` receives the full dataset, pinning the
      virtualization so a future "just add a row" edit can't quietly revert to `ScrollView`).
      `LC-B08` — the rider board's "Your offers" list (`sentOffers`,
      `apps/mobile/app/rider/(tabs)/index.tsx`) had exactly one removal path (a full wipe on going
      offline) — a taken/expired resolution only flipped the card's own display state
      (`board.takenOrderIds`/`expiredOrderIds`), never dropped the entry, so a busy-market rider who
      stayed online for a long shift accumulated one permanent "not chosen"/"window closed" card per
      bid for the rest of the session, plus a growing per-write SecureStore payload
      (`saveRiderSentOffers` persists the whole list on every change). Fixed with a periodic sweep
      (15s interval while online) that evicts offers `SENT_OFFER_RETENTION_MS` (60s) past their
      auction close — long enough the resolution message has been seen, short enough the list stays
      bounded regardless of shift length. New `isSentOfferStale` pure gate + regression tests in
      `src/logic/__tests__/rider-bid-draft.test.ts`. **6 pure-optimization findings appended to the
      checklist below** (`B-O10`..`B-O15`), not fixed this run — none breaks anything today, all are
      real waste at scale. `pnpm typecheck && pnpm lint && pnpm test` all green (679 mobile + 1511
      API tests). See `docs/LC-B-REPORT-2026-08-03.md`.
- [x] B-T4 **AUDITED (2026-08-03)** — Animation/JS-thread audit: every `Animated`/`LayoutAnimation`
      call site for native-driver coverage, every `setInterval`/self-rescheduling ticker for correct
      gating, and render-body work in frequently-re-rendering screens (3 lenses, read-only Explore
      agents — the `lane-bug-hunt` custom-lane tooling misconfiguration, already root-caused at
      `LC-B-SIB-1..4`, reproduced again on a first attempt, so this ran as the same linear-audit
      fallback B-T3 used). **Zero DEFECTS** — every candidate is correctness-intact, pure JS-thread
      waste. **3 CONFIRMED, adversarially-verified optimization findings appended to the checklist**
      (`B-O16`..`B-O18`): merchant `OrderCard`'s shared `useNow()` 1s ticker (`apps/merchant/app/
      components/queue/OrderCard.tsx:244`) fires even for the `payment`/`ready` buckets that never
      read `now` — `PaymentBucketActions`'s own doc comment already states "No clock (M2·7 never
      blocks the board)"; `AuctionClock`'s 20s urgency-color crossfade
      (`apps/mobile/src/ui/order/AuctionClock.tsx:105`) runs `useNativeDriver: false` with no
      documented blocker, unlike the neighboring, deliberately-`false` `LiveMap` region animation,
      despite this app's RN 0.76 supporting native-driven color interpolation; and merchant
      `QueueBoard`/`OrderCard` has no `React.memo` boundary, so every 5s queue poll rebuilds and
      re-renders every order card regardless of whether that order's own data changed — the
      merchant-app sibling of the mobile rider-board gap `B-O2` already tracks. **2 candidates
      confirmed as already-tracked duplicates, not re-ledgered**: the render-body finder
      independently re-derived both `B-O8` sites (`food/order/[orderId].tsx` and `rider/
      food-job.tsx`'s unconditional 1s tickers) and additionally found that `food/order/
      [orderId].tsx`'s `awaiting_item_approval` branch recomputes an unmemoized `.filter()`/
      `.filter()`/`.reduce()` over `order.items` on every one of those ticks — folded into `B-O8`'s
      existing scope since fixing the ticker's gating removes this cost too, not a separate item.
      **2 marginal notes considered and left unticketed**: `send.tsx`'s `LayoutAnimation.
      configureNext` is reduce-motion-gated but not device-tier-gated (no precedent anywhere in this
      codebase for the latter, so not actionable without inventing a new pattern); unmemoized
      `.filter()` calls in `(tabs)/orders.tsx` (already-capped ~30-50-row list) and `food/index.tsx`
      (ties into the already-tracked, uncapped-catalog `B-O10`) are real but rated too low-impact by
      the finder itself to warrant a dedicated item. No KNOWN_BUGS.md ledger rows added — matching
      the B-T3 precedent of keeping pure-waste, correctness-intact findings in this checklist only
      (LC-B## rows are reserved for fixed defects or confirmed-but-deferred bugs). `pnpm typecheck
      && pnpm lint && pnpm test` all green. See `docs/LC-B-REPORT-2026-08-03b.md`.

**Optimization checklist (seeded; audit rounds append; re-ranked 2026-08-02 steer #2 — see
`docs/LC-STEER-2026-08-02b.md` §4 for rationale):**
- [x] B-O1 History/notifications lists → FlatList **(2026-08-03b)**. Converted both to FlatList
      (this lane's third and fourth FlatList adoptions after B-T3's restaurant catalog), windowing
      the concurrently-mounted rows to what's on-screen — a real scroll-smoothness win on Go-class
      hardware even though both lists are already server-capped (history 50, notifications 30; the
      "cursor pagination" half of this item's original title is therefore not applicable — pagination
      exists to bound an otherwise-unbounded list, and these already are, unlike food's `B-O10`).
      Regression tests in `app/history/__tests__/index.test.tsx` / `app/notifications/__tests__/
      index.test.tsx` (assert a single FlatList receives the full dataset, pinning virtualization
      against a future "just add a row" ScrollView regression, matching B-T3's precedent). **Split
      off the rider board's own list as `B-O1b` below** (also server-capped at 50, same rationale) —
      that screen is one monolithic ScrollView carrying the entire KYC/location/online-gate state
      tree with no existing header/list seam, so a FlatList conversion needs a real structural split
      of that tree rather than a drop-in swap; riskier to do blind in the same pass as two clean
      conversions, on a screen with zero existing test coverage as a safety net. `pnpm typecheck &&
      pnpm lint && pnpm test` all green (688 mobile + 1516 API tests).
- [x] B-O1b / B-O12 **(2026-08-03c, split from B-O1, bundled with B-O12)** Rider board's "Open
      orders" list (`apps/mobile/app/rider/(tabs)/index.tsx`) was ScrollView + `.map()` over up to
      50 `JobCard`s (plus the smaller `sentOffers` list above it) — same render-cost shape B-O1 fixed
      for history/notifications — inside a screen that's one monolithic KYC/location/online-gate
      ternary tree. Implemented as an early return rather than weaving a ternary through the existing
      JSX: a new `showOpenOrdersList` boolean (`online && !meQ.isLoading && !meQ.isError &&
      !knownUnverified && !locDenied && gate == null`) — exactly the condition the old inline
      `ranked.map()` rendered under — gates a `return` to a FlatList-based render (`ListHeaderComponent`
      = active-job banner + online toggle + sent-offers, `data`/`renderItem` = the open-orders list,
      `ListEmptyComponent` = the error/loading/empty three-way, `ListFooterComponent` = the `selected`
      compose card + the confirm-switch/back-to-customer/error/info block); every other state (loading,
      getMe error, KYC, no-GPS, gate refusal, offline) falls through unchanged to the ORIGINAL
      ScrollView return below it, so a gated screen can never see a stale `ranked` leak through a
      FlatList `data` prop — the original return is untouched code, not a re-derived copy, so there's
      no risk of the two branches drifting on what a gated state should show. The pieces the two
      returns share (active-job banner, online-toggle card, sent-offers section, `selected` compose
      card, the confirm-switch/back-to-customer/error/info footer) are hoisted into local consts used
      by both, so a future edit to one can't silently miss the other. The confirm-switch/back-to-
      customer/error/info footer specifically stays UNCONDITIONAL in both branches (rendered inside
      `ListFooterComponent` in the FlatList branch, and in its original untouched position in the
      ScrollView branch) rather than moving only into the footer as originally scoped — the original
      code renders it regardless of KYC/location/gate state (a rider stuck on any gated screen still
      needs a way back to the customer view), and folding it only into `ListFooterComponent` would
      have silently dropped that escape hatch from every gated screen. Regression test
      `app/rider/(tabs)/__tests__/index.test.tsx` (new — this screen had zero prior coverage): the
      online/verified/no-gate state renders exactly one FlatList carrying the full open-orders
      dataset; the not-yet-a-rider and KYC-pending gated states render no FlatList and don't leak the
      mocked open-order fixture into the tree. `B-O12` (nothing bounded the `openOrders` TanStack Query
      cache across a long connected shift — `boardNewOrder`'s prepend in `use-rider-board.ts` had no
      cap, and the 15s REST poll that would otherwise reset it to the server's own capped snapshot is
      disabled the whole time the board socket stays connected) bundled into the same pass per plan:
      capped the prepend at `OPEN_ORDERS_CACHE_CAP = 50`, mirroring the server's own `take: 50` in
      `orders.service.ts`'s `listOpen`. Regression test in `use-rider-board.test.tsx` (80 pushes never
      grow the cache past 50, and confirms the cap keeps the MOST RECENT orders, not an arbitrary
      truncation). `B-O13` (the `expiredOrderIds`/`takenOrderIds` Sets in the same hook) was left
      alone — already ranked lowest-priority/optional in this same checklist, unrelated to this pass's
      scope. `pnpm typecheck && pnpm lint && pnpm test` all green (6/6 packages; 1516 API + 705
      mobile tests, including the two new regression tests above).
- [x] B-O2 Memo boundaries for ComposeMap / JobDetailsCard / board-card **(2026-08-03d, bundled with
      B-O9 per that item's own note)**. All three wrapped in `React.memo`. Verified empirically
      first (throwaway scratch test, deleted before landing) that `React.Profiler`'s `onRender`
      fires on every commit that reaches a Profiler boundary EVEN WHEN the memoized child below it
      bails on unchanged props — it cannot distinguish "ran" from "bailed" in this React
      18.3.1/react-test-renderer combination, so it's the wrong tool for a render-isolation
      regression pin here (unlike the AuctionClock pattern's own Probe-counts-its-own-renders
      technique, which works because AuctionClock's PARENT is the thing being counted, not the
      memoized boundary itself). Instead added `src/testing/render-count.ts` (`countMemoRenders`),
      which patches the `React.memo` wrapper's mutable `.type` field with a call-counting
      passthrough — verified both directions (bails on unchanged props, fires on changed props) and
      verified each new test actually FAILS against the pre-memo code before landing the fix,
      matching this lane's regression-pin convention. `board-card` = `JobCard`
      (`src/ui/rider/JobCard.tsx`) — every prop primitive except `onAction`, which B-O9 (below)
      makes stable. `JobDetailsCard` (`src/ui/rider/JobDetailsCard.tsx`) — its `riderPoint` prop was
      the real pitfall: `job.tsx`/`food-job.tsx` built it as a fresh `{lat,lng}` object literal
      inline on every render, which a default shallow-prop memo comparison can't tell apart from a
      real change; both screens now `useMemo` it off the primitive `currentLat`/`currentLng` fields
      (placed ahead of `job.tsx`'s several early-return branches — the rules of hooks forbid a hook
      call after a conditional return, which the original non-hook inline computation had been
      sitting after). `ComposeMap` (`src/ui/ComposeMap.tsx`) — the customer compose screen already
      passed it referentially-stable props (`pickupPoint`/`dropPoint` state,
      already-`useCallback`'d reverse-geocode handlers), so the memo holds with no caller-side
      changes needed there. Render-isolation regression tests: `JobCard.test.tsx` (does-not-re-render
      + still-re-renders-on-real-prop-change), new `JobDetailsCard.test.tsx` (same two, plus a third
      pinning the exact "same values, new object" pitfall the caller-side `riderPoint` `useMemo`
      fixes — mocks `LiveMap` since react-native-maps can't mount in this test environment, matching
      the `live-tracking-isolation.test.tsx` precedent), new `ComposeMap.test.tsx` (same two,
      mocking `react-native-maps` itself with a trivial `MapView`/`Marker`/`Polyline` stand-in so
      the REAL `ComposeMap` — not a probe — is under test). `pnpm typecheck && pnpm lint && pnpm
      test` all green (101/101 suites, 713 mobile tests).
- [x] B-O9 **(2026-08-03d, bundled into B-O2 above per this item's own note)** `ranked` is now
      `useMemo`'d (deps: `openQ.data`, `bidIds`, `loc`) instead of recomputed inline in the render
      body, and the FlatList `renderItem` prop is now a `useCallback` (`renderJobCard`, deps:
      `chooseOrder`) instead of an inline arrow — `chooseOrder` itself was already made a
      `useCallback` (deps: `loc`) as part of the same pass. Deliberately did NOT give each row a
      per-order-id cached `onAction` closure (an earlier draft of this fix did, via a `Map<string,
      () => void>` keyed by order id) — that traded one re-render inefficiency for a real one: an
      unbounded-growth cache with no eviction path, exactly the kind of thing this lane's own B-T3
      audit flags elsewhere (`LC-B08`/`B-O13`'s sentOffers/expiredOrderIds shapes). Verified
      instead (`@react-native/virtualized-lists`' `VirtualizedListCellRenderer.js`) that
      `CellRenderer` is a `React.PureComponent`, so a referentially-stable `data` + `renderItem`
      alone is sufficient: `PureComponent`'s own shallow-prop check skips re-invoking `renderItem`
      for a row whose `item` didn't change, so `JobCard`'s B-O2 memo boundary doesn't even need to
      run for the common case — the row is never re-created in the first place. The `onAction={() =>
      chooseOrder(o)}` closure inside `renderJobCard` is still freshly allocated whenever `renderItem`
      IS invoked (initial mount, or the data actually changing) — correct and unavoidable there,
      since the list genuinely changed. Regression test: new describe block in
      `app/rider/(tabs)/__tests__/index.test.tsx` opens the compose card via a row's "Make an offer"
      action, types into the ETA field (a plain top-level `useState`, unrelated to the open-orders
      list), and asserts the mounted `FlatList`'s `data`/`renderItem` props are the exact same
      references before and after. `food/search.tsx`'s weaker sibling (unmemoized filter + fresh
      per-row closures) stays out of scope per this item's own note — that filter's
      keystroke-recompute is semantically necessary, not wasted.
- [x] B-O8 **(2026-08-03e)** `food/order/[orderId].tsx`'s countdown ticker
      (`setInterval(() => setNow(Date.now()), 1000)`, empty deps, no phase gating) used to keep
      re-rendering the whole screen once/sec for the entire order lifetime even once none of the
      rendered branches read `now` — the exact anti-pattern `PERF20-02` already fixed by extracting
      `AuctionClock` in the sibling `order/[id].tsx`, but that sibling-sweep never reached this
      food-order screen (since RF-18 this screen is a thin phase-dispatcher over extracted view
      components, so a self-ticking-component extraction per phase would mean threading `now` through
      5 separate files for no behavioural gain — gating the ONE interval was the lower-risk, equally
      effective fix). Fixed with a `needsClock` boolean (`!!order &&` one of
      `awaiting_accept`/`awaiting_item_approval`/`awaiting_payment`/`preparing`/the post-dispatch live
      tracker — exactly the branches that receive the `now` prop below it) gating the effect, so
      `ready_for_pickup`/`undelivered`/`delivered`/`completed`/`cancelled` never start the interval.
      `rider/food-job.tsx`'s identical unconditional ticker (`nowMs`, feeding only the no-show
      wait-countdown and the cash-handshake card, both reachable only from the main active-job
      render) got the same treatment: the interval effect moved below the `deliveredFood`/
      `undeliveredFoodReason`/`ackedHandbacks` state it now gates on (`needsClock = order != null &&
      !deliveredFood && !undeliveredFoodReason && !(status === "cancelled" && not yet acked)`), so the
      delivered/undelivered/cancelled-handback terminal screens — where a rider can sit for the rest
      of their shift between jobs — stop ticking too. Regression tests spy on `global.setInterval` and
      assert the 1000ms interval is/isn't created per phase (new describe block in
      `app/food/order/__tests__/order-screen.test.tsx`; new `app/rider/__tests__/food-job-socket-gate.test.tsx`,
      this screen's first test coverage) — confirmed both fail against the pre-fix code (interval
      fires unconditionally) before landing. `pnpm typecheck && pnpm lint && pnpm test` all green.
- [x] B-O9 **(duplicate ID — steer dedup, 2026-08-03b)** This entry and the `[x] B-O9` entry above
      (right after `B-O2`) are the SAME finding: `B-T2`'s original audit text (this entry, appended
      2026-08-02) and PR #525's fix-summary (the entry above, appended 2026-08-03d) both landed under
      the id `B-O9` — a numbering collision, not two separate items. PR #525 (2026-08-03) fixed
      exactly what this entry describes (`ranked` now `useMemo`'d, `chooseOrder`/`onAction` now
      `useCallback`'d, bundled with `B-O2`'s memo boundaries) and ticked the OTHER `B-O9` entry, but
      never marked this older duplicate resolved — leaving a stale unchecked item that could have
      cost a future firing a wasted increment re-implementing already-shipped work. Ticking done here
      too, pointing at the entry above for the real fix detail. **Doc-hygiene note for future lane
      firings:** append new checklist findings with a fresh, never-reused id even when they refine an
      item already in flight (e.g. this should have been `B-O9b` or similar).
- [x] B-O11 **DONE (2026-08-03h)** KYC/pickup-photo preview `Image`s rendered the ORIGINAL
      (undownscaled, ~3000-4000px) camera capture instead of the already-downscaled upload asset
      sitting right there — `apps/mobile/app/rider/become.tsx:103` and
      `src/ui/rider/PickupChecklist.tsx:64` both called `downscaleForUpload` (1280px/0.7 JPEG) for
      the UPLOAD but set the on-screen preview from the pre-downscale `asset.uri`, not the
      already-produced `prepared.uri`, in the branch where the upload had just succeeded. Fixed
      with the one-line swap at both sites (`setPhotoUri(prepared.uri)` instead of
      `setPhotoUri(asset.uri)`); the `catch` branches' rollback-to-previous-uri behavior is
      untouched. This preview stays mounted for the rest of a multi-field KYC/pickup form, and
      `become.tsx`'s own comment already flags camera capture as an OOM-kill risk on low-end
      phones — this closes real avoidable peak-memory pressure (holding a ~342-344px-sibling-scale
      full-res bitmap decoded for `Image` alongside everything else on-screen, for the rest of the
      form) in the single most OOM-sensitive flow in the app, purely by swapping which
      already-computed uri two `setState` calls reference — no new state, no new native work.
      **Evidence:** new regression tests pin the wiring rather than asserting on bytes (a
      render-isolation-style test for a data-flow bug, mirroring this lane's `AuctionClock`
      convention of a test that fails against the pre-fix code) —
      `app/rider/__tests__/become-photo-preview.test.tsx` and
      `src/ui/rider/__tests__/pickup-checklist-photo-preview.test.tsx` each mock
      `downscaleForUpload` to return a uri distinct from the picker's mocked capture uri, drive a
      full capture→upload flow, and assert the rendered preview `Image`'s `source.uri` is the
      downscaled one; both confirmed to FAIL against the pre-fix code (asserting the original
      capture uri instead) before landing. `pnpm typecheck && pnpm lint && pnpm test` all green
      (732 mobile + 1516 API tests, 6/6 packages).
- [ ] B-O7 **(re-ranked to #6, was #3 then #7)** Cold-boot request prioritization — defer the
      push-token register POST (`use-push-registration.ts`) and, where feasible,
      `/app/version-gate` / `/app/feature-flags` a beat behind `/app/bootstrap` (e.g. a short
      delay/idle-callback, or firing off `BootstrapSync`'s settle instead of mount) so they don't
      contend for bandwidth with the first-paint-critical aggregate on a constrained 2G/3G link.
      Impact unconfirmed without an on-device 2G trace — audit-only finding from B-T1, not
      implemented that run. Still ahead of B-O5/B-O3/B-O6 because it's concrete and S-effort with
      evidence behind it, unlike O3/O6 below which are blocked on hardware/native-build access this
      environment doesn't have — but behind B-O11 as of this steer (see above). (S)
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
- [ ] B-O10 **(new, B-T3 finding)** `GET /restaurants` (`apps/api/src/merchant/merchant.service.ts:313`
      `listRestaurants`) has zero server-side cap — no `take`, no cursor, unlike every other list
      endpoint (history 50, board 50, notifications 30). `LC-B07` (fixed this run) bounded the
      client-side memory cost with a `FlatList`, but the query and the in-memory JS array of
      restaurant data itself stay unbounded — worth a cursor-paginated `useInfiniteQuery` (mirroring
      `useHistoryFeed`'s shape once it exists) as the corridor's merchant catalog grows past a page.
      The one list in this lane that's actually uncapped, unlike `B-O1`/`B-O1b`'s already-server-
      capped lists — the cursor-pagination half of `B-O1`'s original title turned out to belong here
      instead, once `B-O1`'s own audit found history/board/notifications all already bounded. (M)
- [x] B-O12 **(2026-08-03c — see the B-O1b entry above, fixed in the same pass)** Capped the
      `boardNewOrder` prepend at `OPEN_ORDERS_CACHE_CAP = 50` (mirrors the server's own `take: 50`)
      instead of adding a periodic resync — simpler and sufficient to bound the cache regardless of
      shift length. Regression test in `use-rider-board.test.tsx`.
- [ ] B-O13 **(new, B-T3 finding)** `expiredOrderIds`/`takenOrderIds` `Set`s in
      `apps/mobile/src/realtime/use-rider-board.ts:35,38` grow for the rider's whole online session
      with no eviction (every `bid:expired`/`order:taken` push adds an id, nothing ever removes
      one) — geo-scoped so realistic growth over a shift is tens-to-low-hundreds of short strings;
      real but the absolute footprint is unlikely to matter on its own. Same shape as the now-fixed
      `LC-B08` (`sentOffers`); low priority on its own, worth revisiting if bundled with `B-O12`. (S)
- [ ] B-O14 **(new, B-T3 finding)** Merchant kitchen board's `ackSecuredIds`/`ackHoldIds` `Set`s
      (`apps/merchant/app/components/queue/QueueBoard.tsx:108-109,143,188`) never shrink for the
      always-mounted kitchen tablet's whole shift — bounded in practice by one restaurant's daily
      order volume (tens to a few hundred), so low real-world impact; noted for completeness, not
      worth a dedicated fix on its own. (S)
- [ ] B-O15 **(new, B-T3 finding)** Delivery-code device index (`CODE_INDEX_KEY`,
      `apps/mobile/src/auth/device-state.ts:38,73-74`) appends one order id per completed order for
      the life of the install with no cap, cleared only on sign-out — disk growth (SecureStore), not
      JS-heap, driven by ordinary order volume over weeks/months rather than a session/socket loop.
      Trivial `.slice(-N)` fix matching the same file's own `HANDBACK_ACK_MAX = 20` pattern. Lowest
      priority of this batch — not a memory-pressure risk, just inconsistent with the rest of the
      file's discipline. (S)
- [ ] B-O16 **(new, B-T4 finding)** Merchant `OrderCard`'s shared `useNow()` hook
      (`apps/merchant/app/lib/use-now.ts`, default 1000ms interval) is called unconditionally at
      `apps/merchant/app/components/queue/OrderCard.tsx:244`, ticking every mounted card once/sec
      regardless of `bucket` — but `now` is only read by the `waiting` (line 272) and `preparing`
      (line 291) branches. A `payment`-bucket card (`PaymentBucketActions`'s own comment: "No clock
      (M2·7 never blocks the board)... only ever renders as an ordinary card") or a `ready`-bucket
      card (fully static/callback-driven JSX, lines 307-346) re-renders once/sec for however long it
      sits in that bucket — potentially minutes on an awaiting-payment order — for zero visible
      benefit, on the always-mounted kitchen tablet the whole Go-class mandate targets. Fix: extract
      the two clock-consuming branches into small self-ticking sub-components (mirroring the
      `SentOfferCard`/`AuctionClock` extraction pattern already used elsewhere in this codebase) so
      `payment`/`ready` cards mount with zero interval, or gate `useNow()`'s call behind `bucket ===
      "waiting" || bucket === "preparing"`. (S)
- [ ] B-O17 **(new, B-T4 finding)** Merchant `QueueBoard`/`OrderCard` has no `React.memo` boundary
      (confirmed via grep — zero `memo(` usage in either file) — the merchant-app sibling of the
      mobile rider-board gap `B-O2` already tracks for `JobCard`/`ComposeMap`. `use-queue-poll.ts`'s
      5s poll and `QueueBoard.tsx`'s `groupQueue()`/bucket-array derivation (lines ~204-209) build
      fresh arrays every poll tick regardless of whether the underlying order data changed, and with
      no memo boundary every `OrderCard` re-renders in lockstep even when its own order object is
      referentially unchanged (TanStack Query's structural sharing would otherwise let an unchanged
      order skip re-render if the card were memoized). Bundle with `B-O16` — fixing `OrderCard`'s
      ticker scope is the natural point to also add the memo boundary in the same pass. (M)
- [ ] B-O18 **(new, B-T4 finding)** `AuctionClock`'s 20s urgency-color crossfade
      (`apps/mobile/src/ui/order/AuctionClock.tsx:105`, `Animated.timing(urgencyAnim, { toValue: to,
      duration: 200, useNativeDriver: false })`, driving an `Animated.Text`'s `color` interpolation)
      runs on the JS thread with no documented blocker — unlike the neighboring `LiveMap.tsx`
      `AnimatedRegion.timing(..., useNativeDriver: false)`, which carries an explicit doc-comment
      explaining `AnimatedRegion` can't use the native driver. This app's RN 0.76.9 has supported
      native-driven color-style interpolation for several years, so `color` here is very likely
      switchable to `useNativeDriver: true`. Lowest priority of this batch — a single 200ms
      transition fired at most twice per ~90s auction (entering/leaving the last 20s window), not a
      sustained cost — but a trivial one-line fix once confirmed safe on-device. (S)

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
- [x] C-T1 **AUDITED (2026-08-02)** — Customer order journey: create → auction → accept →
      tracking → delivery code, traced end to end under all 3 adversarial conditions. **Result:
      the journey is largely reference-quality already** — create has a durable idempotency
      nonce + server-side unique-index CAS + dedicated recovery banner; the ~90s auction window
      is driven server-side (BullMQ + a DB reconciler sweep) so it resolves correctly regardless
      of the customer's connectivity, with socket+15s-poll+foreground-refetch redundancy and a
      durable `hadOffers` counter so a cold-start-after-expiry never shows a false "no riders
      took this price"; accept is a transactional CAS (`updateMany` on `status`) immune to
      double-accept, with a one-time-delivery-code re-issue fallback for a lost response; live
      tracking has an explicit staleness threshold (`PRESENCE_ESCALATION_MS`) that visibly dims
      the pin and suppresses ETA rather than ever painting a stale position as live, plus an
      out-of-order-write guard (`lastPositionRef`) against a REST refetch rolling a WS-pushed
      position backward; delivery-code confirm is `SELECT … FOR UPDATE` + CAS-guarded, so a lost-
      response retry can never double-apply/double-charge, and the rider side explicitly
      reconciles a 409 against the order's true state instead of treating it as a bare failure.
      **One genuine defect found and FIXED this run** (LC-C06, below — a lost-work/double-apply
      risk in order creation, not the CAS-protected steps). Two narrower gaps found are UX-only
      (no data loss, no double-apply) and appended to the optimization checklist as C-O5/C-O6
      rather than force-fixed under time pressure. Full trace: `docs/LC-C-REPORT-2026-08-02c.md`.
- [x] C-T2 **AUDITED (2026-08-03)** — Rider shift journey: go online → board → bid → job →
      proof/OTP → earnings, traced end to end under all 3 adversarial conditions. **Result: also
      reference-quality, same bar as C-T1** — going online/heartbeat is a guarded CAS that re-
      derives the precise refusal reason on a lost race (KYC/on-hold/cooldown/suspended), with
      the 20s liveness beat treating a transient failure as "reconnecting" (never a false
      offline) and only a genuine 403 flipping the switch; the board self-heals on every
      socket connect/connect_error by invalidating both `openOrders` and `activeJob` (so a push
      missed while dark is recovered immediately, not just on the next 15s poll), with a per-
      socket serialized `boardSubscribe`/`boardLeave` (BH-25b) and a race-correct `orderTaken`
      handler that never tells the WINNING rider "someone else was picked"; a bid draft
      (`RIDER_BID_DRAFT_KEY`) survives an app kill and drops itself on restore if its 90s auction
      window already closed, and a lost-response retry lands on the server's own
      `(order_id, rider_id)` unique constraint, reconciled client-side into the same "your offer
      is in" state as a live success; every job-lifecycle mutation (advance, confirm-delivery,
      undeliver, rate-the-sender) reconciles its own 409 by re-fetching and checking whether the
      requested transition already landed, so a lost-response retry is never mistaken for a real
      failure; the pickup-item confirmation and rate-the-sender taps both persist a durable
      pending marker before firing, self-healing a full app-kill via a reconciliation effect; the
      delivery-OTP attempt counter converges to the server's value in both directions
      (KB-OTP-COUNT-SYNC); and the earnings/wallet screen already shows an explicit "showing your
      last known balance" banner on a refresh failure rather than silently painting stale data as
      fresh. **No defect met the DEFECT bar this run** (lost work / dead end / double-apply /
      stale-as-fresh) — one narrow new gap was found (the optional proof-of-pickup photo's
      capture/upload state lives only in local component state and is silently dropped by an app
      kill mid-upload) and appended to the optimization checklist as C-O7/LC-C09 rather than
      force-fixed, consistent with how C-O5/C-O6 were triaged: it never gates "Confirm collected"
      and no order data or money is at risk, only an easily-retaken optional photo. Full trace:
      `docs/LC-C-REPORT-2026-08-03.md`.
- [x] C-T3 **AUDITED (2026-08-03)** — Onboarding + OTP + KYC capture traced end to end under all 3
      adversarial conditions: phone entry → send-OTP → verify → post-OTP profile setup →
      becomeRider → KYC document/selfie capture+upload → KYC status polling. **Result: mostly
      reference-quality, matching C-T1/C-T2's bar** — every mutation on this journey (OTP verify,
      refresh rotation, `completeProfile`, `becomeRider`, the KYC webhook) is guarded by a
      server-side CAS/unique-constraint/monotonic-resolution check, so a lost-response retry is
      never a double-apply; the KYC webhook is idempotent via row-lock + `kycResolvedAt` monotonic
      CAS; `becomeRider`'s `already_rider` 409 is explicitly reconciled client-side into success
      rather than a dead-end error; the become-a-rider form already persists its own draft
      (`kyc-draft.ts`) so an app kill mid-capture doesn't lose the typed ID, and a failed photo
      upload retains the same captured asset for one-tap retry instead of forcing a re-shoot; the
      rider KYC-status gate distinguishes a network failure from "not verified" and offers an
      explicit refresh rather than trusting a stale cache forever. **One genuine defect found and
      FIXED this run** (LC-C10, below — the post-OTP profile-setup screen, the FIRST screen a
      brand-new account of either role lands on, had none of the KYC form's draft persistence for
      the identical class of fields). No further gaps rose to the DEFECT bar (the OTP-verify
      screen's un-persisted 6-digit code and the un-persisted typed phone number on the send-OTP
      screen are both cheap-to-retype, non-load-bearing inputs — consistent with what the rest of
      the app already treats as fine not to persist, e.g. the OTP code itself). One narrower gap
      (KYC-photo upload doesn't persist the captured asset ahead of the PUT, so an app-kill
      mid-upload forces a fresh camera capture instead of a resumed retry) is UX-only — appended
      to the optimization checklist as C-O8/LC-C11 rather than force-fixed, consistent with how
      C-O5/C-O6/C-O7 were triaged. Full trace: `docs/LC-C-REPORT-2026-08-03b.md`.
- [x] C-T4 **AUDITED (2026-08-03)** — Merchant order-intake on a tablet over mobile data, traced end
      to end under all 3 adversarial conditions. **Result: new-order delivery itself is
      reference-quality already** — the 5s poll (`use-queue-poll.ts`) is the sole, working delivery
      channel (no socket ever consumed it, so no socket-disconnect risk exists for delivery
      specifically); the alarm is purely derived every render from `unansweredCount` (never
      edge-triggered), so it correctly re-arms on two orders landing back-to-back, an out-of-order
      poll response (guarded by the existing generation counter), or a background/foreground cycle
      (the `visibilitychange` refetch); the 3-min accept countdown is rendered straight from the
      server's own `acceptDeadlineAt` ISO timestamp every poll, never invented client-side, so it
      can't drift out of sync; and a full app/tab kill+relaunch while an order is `awaiting_accept`
      correctly re-surfaces it with the right remaining time with no manual navigation trick, no
      double-counting. **One genuine defect found and FIXED this run** (LC-C12, below — the server's
      merchant-presence check that gates the N-03 auto-cancel safety net was structurally unable to
      ever see a connected tablet, since no client code joined the socket room it checks). One
      narrower gap (accept/reject's error path doesn't proactively refetch, relying on the ambient
      ≤5s poll to clear stale buttons — self-heals, CAS-protected, no double-apply) is appended to the
      optimization checklist as C-O9/LC-C13 rather than force-fixed, consistent with how
      C-O5/C-O6/C-O7/C-O8 were triaged. Full trace: `docs/LC-C-REPORT-2026-08-03c.md`.
- [x] C-T5 **AUDITED (2026-08-03)** — Reconnect semantics across all 5 realtime hooks (customer
      `use-order-socket`, rider `use-rider-board`/`use-rider-job-socket`/`use-rider-location`,
      merchant `queue-socket`/`KitchenConnectionProvider`) + the server catch-up seam
      (`tracking.gateway.ts`'s `handleConnection`/`handleDisconnect`/`scanPresence`/
      `subscribeOrder`/`boardSubscribe`), traced for what a client gone 90s actually recovers and
      at what byte cost. **Result: reference-quality, matching C-T1-C-T4's bar** — every hook
      re-syncs via a REST invalidate/refetch on both `connect` and `connect_error` (not just a
      clean reconnect), so a push missed while dark is always caught up by the next successful
      round trip, never left stuck; room membership (order/board/merchant-queue) is rejoined on
      every reconnect since Socket.IO doesn't persist it; the trickiest cross-hook case — a
      rider-bail auto-rebroadcast (F-01), which hands the customer to a BRAND NEW order id purely
      via a live push — turns out to be triple-covered: a dedicated push notification carries the
      new id, `getSnapshot` on a `cancelled` order does an on-demand reverse lookup
      (`rebroadcastOfId`) and exposes `rebroadcastedToId` on the plain REST snapshot so a bare
      reconnect-refetch recovers the link with no live event needed, and `order/[id].tsx:1001`
      already reads that field as a client-side fallback with its own "follow your re-sent
      request" button; the rider board's locally-only `expiredOrderIds`/`takenOrderIds` (built
      purely from live pushes) has a documented self-heal (`SentOfferCard`'s `staleClosed`, a
      10s-grace local fallback) for the case a resolution push is missed entirely; GPS catch-up
      coalesces to the single freshest fix on reconnect (no stale-trail flood) and durably
      persists to PG on disconnect so a pruned coalesce buffer never loses the last-known position;
      and the server's presence watchdog (`scanPresence`) is already hardened against the
      multi-instance/false-positive edge cases (cluster-wide `fetchSockets` liveness checks before
      escalating, one-shot dedup with an explicit recovery re-arm). **Zero DEFECTS** — every
      candidate gap (a rider job silently returning to "No active job" on a missed
      `job:cancelled` before pickup; a captured-not-refreshed socket auth token) turned out to
      either already self-heal via an existing mechanism (the OS push notification + R8's
      hand-back lookback for the collected-parcel case) or converge within a bounded number of
      retries with no data loss. **1 CONFIRMED, evidenced optimization finding** (`LC-C14`,
      appended as `C-O10` below): the mobile realtime sockets' shared `createSocket` uses a
      captured `auth` object instead of the refresh-safe `auth` CALLBACK pattern the merchant's
      `queue-socket.ts` already adopted for the identical reason — real, but needs an outage past
      the 900s access-token TTL to matter, so it doesn't meet the same-run DEFECT bar (self-heals,
      no lost work). No code changes this run. Full trace: `docs/LC-C-REPORT-2026-08-03d.md`.

**Optimization checklist (seeded; audit rounds append; re-ranked 2026-08-03 steer — C-O5/C-O6/C-O7
promoted ahead of C-O1/C-O2/C-O4: they're concrete, S-effort, evidenced-this-week fixes from
completed C-T1/C-T2 traces, vs. C-O1/C-O2/C-O4's broader M-effort backlog scope with no fresh
measurement behind it; C-O3 struck as a duplicate of Lane A's A-O17):**
- [x] C-O5 **DONE (2026-08-03f)** **(C-T1 finding, LC-C07)** Rider delivery-confirm terminal marker
      (`saveRiderJobTerminal`) was written only after a response (success or 409-reconciled)
      arrived — an app kill strictly between sending `confirmDelivery` and processing any
      response dropped the delivered-acknowledgement/rate-the-sender screen on relaunch (the order
      itself was correctly `delivered` server-side; only the terminal UX was lost). Fixed by
      writing a provisional marker in `deliverM`'s new `onMutate` — BEFORE the request fires —
      promoted to final on success (no extra write needed, it's already durable) and rolled back
      only on a definitive non-409 rejection (401 wrong code, 403 lockout) or a 409 reconciled via
      a direct `getOrder` check to "still not delivered"; left in place on a genuinely ambiguous
      failure (network error/timeout/5xx, or the reconciliation check itself failing), which stays
      safe because `reconcileRiderJobTerminal()` only ever promotes a marker once the order has
      actually left the active feed — an inert leftover marker for a request that truly failed
      just sits unused while the order stays active. `apps/mobile/app/rider/job.tsx:305`,
      `apps/api/src/orders/order-lifecycle.service.ts:343`. Regression tests in the new
      `app/rider/__tests__/job.test.tsx` (confirmed the kill-mid-request case fails pre-fix — no
      marker meant a dead-end "No active job" screen instead of the acknowledgement terminal — plus
      a second case pinning the 401 rollback). `pnpm typecheck && pnpm lint && pnpm test` green.
      See `docs/LC-C-REPORT-2026-08-03f.md`. (S)
- [ ] C-O6 **(C-T1 finding, LC-C08)** `order/[id].tsx`'s `selectM` (accept-an-offer) mutation's `onError`
      shows the same muted "that rider was just taken" notice for BOTH a genuine race-loss AND a
      lost-response case where the customer's OWN pick actually landed — self-heals within one
      render via `onSettled`'s unconditional invalidate, but a slow reconnect could make the
      misleading flash user-perceptible. Align with the rider-side `deliverM`/`advanceM` pattern
      (`apps/mobile/app/rider/job.tsx:283`) that reconciles a 409 by re-fetching and checking
      whether the requested transition already landed before deciding it's a real conflict.
      `apps/mobile/app/order/[id].tsx:365`. (S)
- [ ] C-O7 **(C-T2 finding, LC-C09)** `PickupChecklist`'s optional proof-of-pickup photo
      capture/upload state (`photoUri`/`photoBusy`/`failedPhoto`) lives only in local component
      state — an app kill between capture and the attach POST completing silently drops the
      in-progress/failed photo with no retry affordance surviving relaunch, unlike the item ticks
      themselves (which persist via `savePickupChecklistDraft`). Never gates "Confirm collected"
      and no order data or money is at risk — purely a lost "nice to have" evidence photo. Mirror
      the durable-marker pattern C-O5 proposes for the delivery terminal: persist the chosen
      asset uri + upload stage to SecureStore before firing so a relaunch mid-upload can offer
      "finish adding this photo" instead of silently starting over.
      `apps/mobile/src/ui/rider/PickupChecklist.tsx:44`. (S)
- [ ] C-O1 **(re-ranked to #4, was #1)** ALR-09: offline mutation UX (explicit queued/failed/retry
      states — never a silent drop) — KNOWN ledger. (M)
- [ ] C-O2 **(re-ranked to #5, was #2)** Central client network policy: one module defining
      timeout/retry/backoff-with-jitter tuned for 600 ms RTT, replacing per-call-site defaults
      (DoorDash lessons 6+7); every retriable mutation must name its server-side idempotency
      guarantee. (M)
- [ ] ~~C-O3 Share one Socket.IO connection across realtime hooks (fewer handshakes on lossy
      radio) — KNOWN backlog.~~ — **struck through (2026-08-03 steer): superseded by Lane A's
      `A-O17` (LC-A07).** Both items are the identical fix — one multiplexed Socket.IO connection
      across the board/job/location realtime hooks instead of three independent `io(...)` calls
      (`apps/mobile/src/realtime/socket.ts:12-13`) — found from two angles (C-O3's resilience
      framing: fewer handshakes to re-establish after a drop; A-O17's [data]/battery framing: one
      keepalive stream instead of three). A-O17 carries the concrete file:line evidence from
      A-T4's 2026-08-03 trace, so Lane A owns the implementation; keeping both unchecked would
      double-count one piece of work across two lanes. The resilience benefit ships automatically
      when A-O17 lands — no separate C-side work needed.
- [ ] C-O4 **(re-ranked to #6, was #4)** MicroCache serve-stale-on-upstream-failure mode (soft/hard
      dual TTL; candidates: nearby-count, bootstrap; NEVER money/assignment/auth) (DoorDash
      lesson 8). (M)
- [ ] C-O8 **(new, ranked #7 — C-T3 finding, LC-C11)** The become-a-rider KYC form's photo capture
      (`apps/mobile/app/rider/become.tsx`'s `doUpload`) only commits `photoUri`/`photoKey` to the
      durable `kyc-draft.ts` draft on a SUCCESSFUL upload — an app kill strictly between firing the
      presigned-URL PUT and it resolving leaves the draft exactly as it was before the attempt (no
      corruption, but also no memory that an upload was ever tried), so the rider must relaunch the
      camera and re-capture from scratch instead of getting the same one-tap "Try again" resume a
      network-only failure already gets via `failedAsset`. Persisting the captured asset's local uri
      (and an "upload in flight" marker) to the draft BEFORE firing the PUT — mirroring C-O5's
      "write the marker before the request" pattern — would let a relaunch offer "finish uploading
      this photo" instead of a full re-shoot. Never blocks submission and no data is lost (the GCS
      object was never completed either way), so this is a resume-convenience optimization, not a
      defect. `apps/mobile/app/rider/become.tsx:86-114`, `apps/mobile/src/logic/kyc-draft.ts`. (S)
- [ ] C-O9 **(new, ranked #8 — C-T4 finding, LC-C13)** `NewOrderTakeover.submitAccept`/`submitReject`'s
      catch block sets a local error string and re-enables the buttons on a 409 (or any rejection) but
      never calls `refetch()` — unlike the success path (`withRefetch`, LC-D17), which awaits a refetch
      end-to-end before the caller sees it settle. The stale, already-resolved order's Accept/Reject
      buttons stay tappable until the next ambient queue poll (≤5s) or a `visibilitychange` refetch
      removes it from `awaitingAccept`. Self-heals within that window and the server's per-order CAS
      turns a mistaken retry into a harmless 409 — no double-apply — but it's a real, reproducible
      confusion window on a slow reconnect. Align the error path with the rider-side reconcile pattern
      (`apps/mobile/app/rider/job.tsx:283`): call `refetch()` in the catch, not just on success.
      `apps/merchant/app/components/queue/NewOrderTakeover.tsx` (`submitAccept`/`submitReject`). (S)
- [ ] C-O10 **(new, ranked #9 — C-T5 finding, LC-C14)** `apps/mobile/src/realtime/socket.ts`'s
      `createSocket` passes a captured `auth: { token }` OBJECT to `io()` — Socket.IO's own
      internal auto-reconnect (a bare network drop, no React involved) replays that same object on
      every retry, so a dead zone outlasting the 900s access-token TTL leaves the socket retrying
      with a now-expired token until an unrelated REST call (any hook's own `connect_error`
      handler, or a poll fallback) happens to 401 and rotates the session, which only then tears
      down and rebuilds the socket via the hook's `token` dependency. Self-heals (every hook's
      `connect_error` handler already fires a REST call on each retry) and needs a >15min outage
      to matter, so this is a hardening item, not a same-run defect. Fix: switch `createSocket` to
      the `auth` CALLBACK pattern `apps/merchant/app/lib/queue-socket.ts`'s
      `createMerchantQueueSocket` already uses (`(cb) => cb({ token: <freshest token> })`),
      pulling the current token from `AuthContext`/session storage on each (re)connection attempt
      instead of the value captured at `createSocket(token)` call time. (S)

### Lane D — journey & soundness sweep (Opus 4.8, `0 7 * * *`)

**Confirmed Day-0 defects — FIX FIRST (one per firing, before the territories below; regression test each; D06 is sensitive-money → 4-question treatment). See `docs/LC-DAY0-AUDIT-2026-08-01.md`.**
- [x] D-D0a **CONFIRMED CRITICAL — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/components/queue/NewOrderTakeover.tsx`: `submitAccept`/`submitReject` now reset `submitting` on the success path (previously only on error), and `QueueBoard` renders both `NewOrderTakeover` and `NoRiderHoldTakeover` with `key={order.id}` so the takeover fully remounts at the order boundary instead of reusing the same instance across orders — closing the leak for `unavailable`/`showReject` too. Regression test in the new `QueueBoard.test.tsx` (jsdom + Testing Library, newly wired for the merchant app — verified it fails on the pre-fix code and passes after). See docs/LC-D-REPORT-2026-08-02.md.
- [x] D-D0b **CONFIRMED HIGH — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/components/queue/QueueBoard.tsx:128`: mark-ready / pickup-code reveal now propagate rejections instead of firing as bare `void`; `OrderCard` owns per-order busy+error state (mirrors `PaymentBucketActions.run()`) for both, and `ReturnsSection`'s previously-bare "Confirm the food is back" goods-return button gets the same per-order busy+error treatment. Regression tests in `QueueBoard.test.tsx`. See docs/LC-D-REPORT-2026-08-02.md.
- [x] D-D0c **CONFIRMED HIGH — FIXED (LC loop D, 2026-08-02)** — `apps/admin/app/components/ConfirmModal.tsx:118`: dismissal paths not guarded + `formKey` re-minted per open → wallet-credit double-apply. All three dismiss paths (Escape/backdrop/Cancel) now guard on a new explicit `submitting` state — not `useTransition`'s `pending`, which turned out not to track an async callback's real duration in React 18 (empirically confirmed: it flips back to `false` right after the callback's first `await`, before guarding would ever matter). Regression tests in the new `ConfirmModal.test.tsx`. Ledger: LC-D06. See docs/LC-D-REPORT-2026-08-02.md.
- [x] D-D0d **CONFIRMED MEDIUM — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/lib/reachability.ts:98`: offline discipline dead on Menu/Shop/Hours/Statement. The independent healthz producer half of this was already shipped incidentally by LC-C04 (`ACTIVE_PROBE_INTERVAL_MS`); the remaining gap was that only `use-queue-poll.ts` fed the shared `ReachabilityStore`, so a drop while the merchant was on Menu/Shop/Hours/Statement went unnoticed until the next queue poll or 20s active probe. `authedFetch` (`apps/merchant/app/lib/api-client.ts`) — the one choke point every authenticated call on those screens routes through — now reports into the store itself (`reportUnreachable()` on a network-level throw, `reportReachable()` on any completed response), closing the gap for the whole surface by construction. Also caught the two swallowing mutations this finding named: `HoursPage.onToggleBusy` and `MenuPage.onClearOos` ("back in stock"), both previously a bare `try/finally` with no `catch`, now surface a retryable inline error. Regression tests in `api-client.test.ts` + new `hours/page.test.tsx` / `menu/page.test.tsx`. Ledger: LC-D04. See docs/LC-D-REPORT-2026-08-02.md.
- [x] D-D0e **CONFIRMED MEDIUM — FIXED (LC loop D, 2026-08-02)** — `apps/merchant/app/(app)/menu/page.tsx` `onCreateStarterCategory`: the starter-category quick-create tap's deliberately-silent `catch` ("a failure here just leaves the starter chip tappable again") now writes the `ApiError` into the existing `listError` state (the same one `onClearOos` uses), and the `listError` banner is hoisted to render regardless of category count so it's visible on the empty-menu starter-category card. The busy-mode and back-in-stock taps this finding originally also named were fixed by D-D0d. Regression test in `menu/page.test.tsx`. Ledger: LC-D05. See docs/LC-D-REPORT-2026-08-02b.md.
- [x] D-D0f **CONFIRMED MEDIUM — FIXED (LC loop D, 2026-08-03)** — `apps/admin/app/riders/[id]/page.tsx:269`: money ledgers silently truncate at the server cap; disclose the cap + add paging. `AdminRidersService.walletView` now cursor-paginates (mirrors `WalletService.getLedger`'s mobile pattern) and the rider-detail page renders "Load older →" / "↺ Back to latest" links. Regression tests in `admin-riders.service.spec.ts`. Ledger: LC-D07. See docs/LC-D-REPORT-2026-08-03.md.

**Audit territory:**
- [x] D-T1 **SWEPT (LC loop D, 2026-08-03)** — admin console journey sweep (actions, cash,
      customers, issues, merchants, orders, riders, sos): silent failures, missing states,
      unpaginated tables, stale-after-mutation. `lane-bug-hunt` over 4 lenses → 3 candidates → 3
      confirmed (3/3 REAL-high each). All 3 fixed same-run with regression tests: LC-D08 (missing
      `loading.tsx` on the `/merchants` subtree + `riders/[id]/kyc`, plus a new structural test so
      the class can't recur), LC-D09 (merchant debt ledger + disputes queue hard-cap, mirroring
      LC-D07's cursor fix for the ledger and a disclosure banner for the disputes queue), LC-D10
      (admin Overview funnel metric's unbounded `offer.findMany` replaced with a bounded
      `COUNT(DISTINCT)`). Zero silent-failures/stale-after-mutation findings this pass. See
      docs/LC-D-REPORT-2026-08-03b.md.
- [x] D-T2 **SWEPT (LC loop D, 2026-08-03)** — merchant app journey sweep (login → shift → intake
      loop) through the tablet lens: 4 lenses (login-auth, shift-reachability, order-intake,
      recovery-resilience) via direct Explore agents, since the `lane-bug-hunt` workflow's
      custom-lane arg again silently fell back to the hardcoded wallet lane (same tooling
      misconfiguration as `LC-B-SIB-1..4` — see the new `LC-D-SIB-1..4` ledger rows it produced
      off-lane, ledgered but not fixed here since they're sensitive money-path findings outside
      this territory's mandate). **7 CONFIRMED defects, all fixed this run:** LC-D11 (Hours/Shop/
      Menu mutation catches never signed out on a dead-session 401, unlike their own initial loads
      — shared `isSessionExpiredError()` helper closes the drift class), LC-D12 (no retry
      affordance anywhere on Queue/Menu/Shop/Hours/Statement's initial load, worst on Queue where
      it permanently killed the order-poll + alarm loop after one dropped `/merchant/me` call —
      manual Retry everywhere, auto-retry-on-reconnect on Queue specifically), LC-D13 (a
      `ReachabilityStore` active-probe/`reportUnreachable()` race could permanently strand the
      store unreachable with zero scheduled recovery — the exact "stuck state with no recovery"
      this territory was scoped to find), LC-D14 (a network-throw during `/auth/refresh` was never
      reported into reachability, so the header could lie "Connected" for up to 20s), LC-D15
      (the photo-upload PUT's own network failures were a reachability blind spot), LC-D16
      (`RiderSecuredTakeover` missing a `key` could leak one order's real pickup code onto a
      second, different order — security-relevant), LC-D17 (Accept/Reject buttons re-enabled
      before the post-mutation refetch landed, reopening a same-order double-submit window on a
      flaky link). Zero optimizations appended — every gap found was a genuine wrong-behavior
      defect, not a friction/polish item (D-O1's reusable low-connectivity state components remain
      the standardization follow-up, as already scoped). See docs/LC-D-REPORT-2026-08-03c.md.
- [x] D-T3 **SWEPT (LC loop D, 2026-08-03)** — notification/deep-link coherence under low
      connectivity: two Explore agents mapped push-notification handling and deep-link routing in
      parallel (no `Linking` config exists — the only deep-link entry point is a push-notification
      tap, `apps/mobile/src/push/`). Both independently converged on the same finding: a cold-start
      tap (app fully killed, launched by the tap) was routed by `usePushRegistration`'s own
      `getLastNotificationResponseAsync()` read, racing `app/index.tsx`'s own cold-boot `<Redirect>`
      with no coordination — whichever resolved second silently won, so a boot redirect resolving
      after the tap's navigation could clobber it and strand the user back on the default board/home
      screen. Confirmed real by tracing `AuthProvider`'s async `loadSession()` against the effect
      dependency graph — no queueing/ordering mechanism reconciled the two. 1 CONFIRMED HIGH defect
      (LC-D18), fixed same-run with a regression test: the cold-start read moved into `index.tsx`'s
      own boot sequence and folded into ONE decision (`bootRedirectTarget`) so the deep link can only
      ever be considered together with, never raced against, the default destination — closing the
      race by construction. Duplicate-tap idempotency (`pushOnce`'s same-route guard), notification
      de-duplication (no collapse-key — noted as an optimization candidate, not a defect: no current
      server call site produces duplicate sends), and stale-target handling (a tapped order that's
      since completed/cancelled/reassigned — already handled generically via the 404/403/transient
      error-kind branching on the order screen) were all found already sound. See
      docs/LC-D-REPORT-2026-08-03d.md.
- [x] D-T4 **SWEPT (LC loop D, 2026-08-03)** — Infra soundness I (READ-ONLY → report + ledger):
      three parallel read-only research passes covered the Redis-down/degraded behavior seam, DB
      connection math, health checks, and alert coverage. Confirmed the prior `LC-C01` Redis-hang
      CRITICAL and all four `LC-INF1..4` founder-gated Day-0 items are still fixed (not
      re-reported). **9 new findings ledgered `LC-D19`–`LC-D27`, all OPEN (owner: founder), zero
      code or `infra/terraform/**` changes** per this territory's explicit read-only doctrine:
      `LC-D19`/`LC-D20` (Redis: the shared OTP/rate-limiter client fails closed across every
      `@Throttle` route including `sos-raise` instead of failing open like every other Redis
      consumer in the codebase; the Socket.IO adapter's `fetchSockets()` timeout behavior is
      unverified under a real outage), `LC-D21`/`LC-D22` (DB: the `LC-INF3`-fixed 10×10=100
      connection math has likely-zero headroom against Cloud SQL's own ~100-connection ceiling,
      unconfirmed live; pool exhaustion surfaces as an opaque 500 with no 503/Retry-After),
      `LC-D23` (no Terraform-managed Cloud Run liveness/startup probe — deploy is imperative
      `gcloud`, recovery depends solely on the 60s external uptime check), `LC-D24`–`LC-D27`
      (alerting: no Cloud SQL system-metric alert, no Redis/Memorystore alert, every
      SLO/queue alert is default-gated off AND `alert_notification_channels` defaults to `[]` so
      even the always-on uptime alert pages nobody, and 2 of 3 scheduled jobs have no
      failure alert). See `docs/LC-D-REPORT-2026-08-03e.md`.
- [x] D-T5 **SWEPT (LC loop D, 2026-08-03f)** — Infra soundness II (READ-ONLY → report + ledger):
      three parallel read-only research passes covered backup/PITR/restore-drill parity, CI/deploy
      gaps beyond KNOWN items, and mobile release/OTA pipeline fitness. **11 new findings ledgered
      `LC-D28`–`LC-D38`, all OPEN (owner: founder), zero code or `infra/terraform/**` changes** per
      this territory's read-only doctrine: `LC-D28`–`LC-D32` (backup/DR: the repo already has a
      fully-written `docs/RESTORE-DRILL.md` runbook but the drill has never actually been run — LR7
      is still unticked, so PITR/backup restorability is configured but unproven; prod
      `deletion_protection` defaults false; backup storage location isn't pinned to `africa-south1`
      — data-residency; backup/PITR retention relies on undocumented Cloud SQL platform defaults;
      the KYC/photo GCS bucket is single-region with no cross-region replication), `LC-D33`/`LC-D34`
      (CI/deploy: the migration-safety spec release.yml cites as enforcing "expand-only/online-safe
      migrations" actually only scans for lock hazards, not backward-incompatible schema changes
      like a dropped/renamed column the still-serving old revision reads; the canary's 5xx-rate gate
      needs `CANARY_MIN_SAMPLE` candidate requests to judge at all, which the pilot's low traffic
      volume can plausibly never reach, silently degrading the strongest promotion gate to
      inconclusive-pass), `LC-D35`–`LC-D38` (mobile OTA: updates publish all-or-nothing with no
      staged rollout, unlike the native track's `rollout:0.1`; there is no CI/workflow rollback path
      for a bad OTA push, only an ad-hoc CLI/console recipe; no automated crash/error-rate gate ties
      to OTA rollout — detection depends on someone noticing; OTA downloads aren't gated to
      WiFi/unmetered connections despite the app's own docs framing OTA bytes as "money out of a
      real person's pocket" on prepaid 2G/3G). Confirmed no overlap with `LC-D19`–`LC-D27` (D-T4) or
      the Day-0 `LC-INF1`–`4`/`LC-C01` items. Also confirmed FINE and not re-flagged: Cloud SQL
      backups+PITR are correctly enabled with a sensible off-peak window; Redis/Memorystore
      correctly has no persistence (nothing durable lives only in Redis); the GCS bucket has
      versioning + `force_destroy=false` + CMEK-capable; deploy rollback (automatic on canary
      failure, manual via `rollback.yml`), migration-before-traffic-shift ordering, canary gate
      logic (no masked/`continue-on-error` failures), secrets handling, and concurrency protection
      all re-verified sound; mobile's `runtimeVersion: fingerprint` policy and fail-open
      server-version gate are correctly built; the native app has never actually been released
      (`EAS_RELEASE_ENABLED` unset, zero real installs today), which lowers current stakes on the
      OTA findings without changing that they're pre-existing-by-design. See
      `docs/LC-D-REPORT-2026-08-03f.md`.

**Optimization checklist (seeded; audit rounds append):**
- [x] D-O1 **DONE (2026-08-03g)** Low-connectivity state pattern for both web apps: standard
      error/retry/stale components where D-T1/T2 find gaps. Merchant: extracted the 5×-duplicated
      "failed load + Retry" block (queue/statement/shop/menu/hours) into
      `apps/merchant/app/components/RetryableError.tsx`, fixing queue's drifted local button style
      for free. Admin: added `RetryableError`/`SubsectionUnavailable` to `components/states.tsx`
      — `app/error.tsx` now composes the former instead of hand-rolling it, and the rider-detail
      wallet-ledger sub-widget (previously unstyled inline text) now uses the latter for its
      best-effort-fetch-failed case, the one partial-widget-failure state that had no shared
      component before. No new cross-app package — neither app shared any UI components going in,
      so each got its own minimal addition rather than new shared-package plumbing. New tests:
      `RetryableError.test.tsx` (both apps), `apps/admin/app/error.test.tsx` (previously
      uncovered); all five merchant pages' existing Retry-button tests pass unchanged, confirming
      the extraction preserved behavior exactly. See docs/LC-D-REPORT-2026-08-03g.md.
- [ ] D-O2 OTP delivery + verify success telemetry by carrier (Econet/NetOne/Telecel) so
      deliverability regressions are visible (DoorDash lesson 11). (M)
- [ ] D-O3 **(new, D-T3 finding)** Server-side push sends carry no collapse-key/tag
      (`notifications.service.ts`'s `send()`, FCM `sendEach`), so a retried/duplicated
      `notifyOrderStatus` call (there's no idempotency key on the caller side) stacks a second tray
      entry instead of replacing the first. Not exploitable today (every current call site sends
      each status transition at most once), but worth closing before a future retry-on-failure path
      is added to any `notify*` caller. (S)

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
