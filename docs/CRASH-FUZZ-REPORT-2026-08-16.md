# Crash-fuzz report — 2026-08-16

Weekly crash-fuzz routine (`docs/routines/crash-fuzzing.md`). Mission: find runtime failures — crashes,
hangs, unhandled rejections, infinite spinners, flash-of-wrong-state — by running the REAL apps, not by
reading source. Ledger prefix **CF-**. Model: Sonnet 5, per owner instruction 2026-08-16.

## Phase 0 — baseline

- `docs/KNOWN_BUGS.md` read in full; no prior `CF-` rows (first crash-fuzz run). No open `claude/*` PR
  overlapped this lane (`#770` is an unrelated Send-perf PR).
- Clean `main` needed `prisma generate` before `pnpm typecheck`/`pnpm test` would pass — the API's
  Prisma client isn't checked in and `pnpm install` alone doesn't generate it. Once generated,
  **`pnpm typecheck` and `pnpm test` were green on clean `main`** (6/6 packages, 1192 mobile tests + all
  others) — not a red-main condition, so the run proceeded rather than stopping per the Phase-0 gate.

## Environment stood up for this run

Unlike the source-reading bug lanes, this mission's evidence source is the running app. No Docker
daemon was available in this container, so the real stack was built from what *was* available:
- **Postgres 16 + PostGIS 3** (`apt-get install postgresql-16-postgis-3`) and **Redis** (`redis-server`),
  both started locally; `apps/api/.env` pointed at them, migrations applied (`prisma migrate deploy`),
  and the seed script run (`pnpm run seed` — 1 admin, 1 customer, 5 riders, 1 pilot merchant + dishes +
  food orders).
- **`apps/api`** booted for real (`pnpm run start:dev`, port 3333) — genuine Postgres reads/writes, real
  OTP issuance (`OTP_CHANNEL=console`, code logged/echoed — no vendor needed), real JWTs.
- **`apps/admin`** (port 3000) and **`apps/merchant`** (port 3100) booted as real Next dev servers
  against that live API — not mocked.
- **`apps/mobile`** has no device/simulator available in this container, so it was exercised the way the
  routine spec itself prescribes for this face: the `tools/parity/` react-native-web harness, which
  bundles and mounts the REAL screen components (not a mock of the screen) via Playwright, with a
  fixture supplying route params/query data. This is real component code under real DOM/event
  semantics, but with mocked network data — a materially different (mocked-API) evidence source than
  admin/merchant's live-backend testing. Flagged honestly as a coverage-shape difference, not silently
  treated as equivalent.
- OTP rate limits (`OTP_RL_*`) and access-token TTL (`ACCESS_TTL_SECONDS`) were widened for this LOCAL
  fuzz session only (repeated automated OTP requests would otherwise self-throttle); not a product
  change, not part of the shipped diff.

## Phase 1 — journeys fuzzed

**Admin** (1440×900, Playwright against the live server): full route sweep (dashboard, orders, riders,
customers, merchants, disputes, issues, SOS, cash + one detail page each) · malformed deep links
(non-UUID ids, path-traversal-shaped paths, null bytes, SQL-injection-shaped strings, a 5000-char id) ·
back/forward-button spam across 6 routes · rapid double-tap on order-detail buttons · offline→online
toggle mid-navigation · viewport resize mid-interaction · query-param fuzzing (negative/huge page
numbers, script-tag injection, 3000-char search strings) · rapid double/triple-tap on a real sensitive
action (rider suspend) with DB-level verification of the write.

**Merchant** (1024×680, Playwright, real phone-OTP login flow against the live API): full login happy
path · rapid double-tap "Send code" and "Sign in & start the alarm" · interrupted OTP (request a code,
hard-navigate away mid-flow, come back) · back-button spam while authenticated across 5 routes ·
malformed/garbage session cookie hitting a protected route · no-session deep links to every protected
route · offline toggle mid-login · viewport resize + double-tap on queue-board action buttons.

**Mobile** (react-native-web harness, 360×720 + the mandatory 320×640 entry-phone pass): OTP verify
screen — rapid double-tap Verify, rapid double-tap Resend, at both viewports; the cooldown/locked/
resent OTP states (spam-tap on their inert affordances); food checkout (cash + wallet) — double-tap
place-order + resize mid-flow; rider board — offline/online toggle; parcel tracking — offline/online
toggle + resize.

**Coverage gap, disclosed rather than silently skipped:** the mobile face was sampled (9 journeys) out
of the ~275-screen gallery, not swept exhaustively — this run prioritized the journeys most exposed to
the fuzz-move classes named in the mission (interrupted OTP/stream flows, double-tap, offline toggle).
A future crash-fuzz run should widen mobile coverage; the harness and pattern established here
(`tools/parity/lib/browser.mjs`'s `launch()` + `mobile/bundle.mjs`'s `bundleScreen()`, kept open for
interaction instead of only screenshotted) generalizes directly to more screens.

## Phase 2 — findings, root causes, fixes

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| CF-01 | **Merchant kitchen sign-in silently drops a keystroke typed before hydration finishes, permanently disabling "Send code."** Repro (isolated in a clean Playwright session, `apps/merchant/app/login/page.tsx`): navigate to `/login` with `waitUntil:"commit"` (i.e. before JS has hydrated — the plausible case on the 2G/3G links this app explicitly targets, `docs/plans/2026-08-01-low-connectivity-program.md`), fill the phone `<input>` immediately. The DOM shows the typed value (React preserves it on hydrate), but the app's `phone` state never captured it — no onChange listener was attached yet when the native `input` event fired — so `disabled={busy \|\| phone.trim().length < 6}` stays permanently true even though the box visually looks filled in. A kitchen operator who starts typing the instant the page paints gets a UI that looks correct and does nothing, with no way to recover except reloading. Verified before/after: `button.disabled` was `true` 2s after hydration settled on `main`; `false` with the fix. | `apps/merchant/app/login/page.tsx` | MEDIUM (real device class this app targets; no recovery path but a reload) | **FIXED** — the existing focus effect (`useEffect(..., [step.kind])`) now also re-reads the input's actual DOM value on mount and reconciles it into `phone` state if it differs, so any pre-hydration keystroke is picked up once hydration completes. Not unit-testable via this repo's jsdom/vitest harness (RTL's `render()` uses `createRoot`, never `hydrateRoot` — there is no hydration-timing gap to reproduce in that environment); verified via the live-browser repro above instead (script preserved for re-verification). |
| CF-02 | **A same-tick double-tap double-submits sensitive/money actions across admin and merchant — confirmed with a live duplicate audit-log write, not just a suspected race.** Root cause, present in 7 call sites: the disable-while-submitting guard everywhere in this codebase reads a React `useState` boolean (`submitting`/`busy`), which only reflects the FIRST of two clicks dispatched in the same event-loop tick — a real fast double-tap, not merely a synthetic test artifact, since React only commits/re-renders after the current tick's work finishes. Live repro: double/triple-clicking admin's "Suspend rider" confirm button (`ConfirmModal`, seeded rider, real Postgres) wrote **two separate `audit_logs` rows ~190ms apart** for one confirm action (`rider.suspend`, `crash-fuzz repro: automated double-tap test` note, `created_at` `20:38:34.998` / `20:38:35.19`); a follow-up triple-click after the fix produced exactly one row. Sibling-sweep (`grep` for local busy/submitting state across `apps/admin/app` and `apps/merchant/app`, excluding tests) found the SAME shape in 6 more places, all fixed the same way. | `apps/admin/app/components/ConfirmModal.tsx` (shared by every admin mutation: rider suspend/ban/lift/clear-hold, order cancel/fare/adjudicate, KYC, wallet credit, cash settlements — fixing the one shared component covers all of them); `apps/merchant/app/components/queue/OrderCard.tsx` (`useAsyncAction`, shared by log-call/request-payment/confirm-payment/release-unpaid); `apps/merchant/app/components/queue/NewOrderTakeover.tsx` (**order assignment — a CLAUDE.md sensitive lane**: accepting/rejecting an incoming food order); `apps/merchant/app/components/queue/NoRiderHoldTakeover.tsx`; `apps/merchant/app/components/queue/ReturnsSection.tsx` (records a cash-return amount against a merchant debt); `apps/merchant/app/(app)/menu/page.tsx` and `apps/merchant/app/(app)/menu/categories/page.tsx` (`createCategory`/`createDish` are NOT idempotent — a double-tap genuinely creates two rows, unlike the audit-log case which converges to the same final state) | MEDIUM (order-accept and cash-return instances: **sensitive lane**, conservative fix + test per CLAUDE.md's mandatory sensitive-lane doctrine; the rest: data-quality/audit-integrity) | **FIXED**, all 7 sites — a synchronous `useRef(false)` guard checked-and-set at the very top of each submit handler, before any `await`, so the second same-tick call is a no-op regardless of when React gets around to re-rendering `disabled`. Each fix has a dedicated regression test using the same technique the fix itself requires to validate: two native `click` events dispatched inside one `act()` call (two separate `fireEvent.click()` calls do NOT reproduce the race — each wraps its own `act()` and flushes state in between, silently passing even with the bug present; confirmed by temporarily reverting each fix and re-running its test, which failed 2-calls-recorded/expected-1 every time). New/updated tests: `ConfirmModal.test.tsx` (admin), `login/page.test.tsx`, `OrderCard.test.tsx`, `NewOrderTakeover.test.tsx` (merchant). |
| CF-03 | **`pnpm dev` boot-crashes `apps/admin` with a 500 on every route.** `next dev` defaults to Turbopack in Next 16; Turbopack cannot compile `packages/shared`'s ESM source the way the project's own build pipeline expects ("Specified module format (CommonJs) is not matching the module format of the source code (EcmaScript Modules)" for `phone.ts`/`policy.ts`/`pricing.ts`/`restaurant-hours.ts`/`restaurants-order.ts`), so `apps/admin`'s server-rendered `app/page.tsx` — which imports `packages/shared` directly — 500s on every request. This was **already known and worked around** in one place: `tools/parity/serve-web.mjs` boots both web apps with `next dev --webpack`, with a comment explaining exactly why ("both apps compile `@lynia/shared` (ESM source) via transpilePackages, and Next 16's [Turbopack breaks this]... match [the build script] in dev"). It just was never applied to the apps' own `package.json` `dev` scripts, which is what a real developer (or a routine's own `pnpm dev`) actually runs — `apps/merchant` was one dev-server restart away from the same fate (its `/login` route happens not to touch `packages/shared` server-side, but deeper routes do). | `apps/admin/package.json`, `apps/merchant/package.json` | MEDIUM (blocks any local dev session that doesn't already know the parity tool's workaround) | **FIXED** — both `dev` scripts now pin `next dev --webpack`, matching their own already-existing `build` scripts (`next build --webpack`) and the parity tool's dev-server. Verified: killed both dev servers, relaunched via the exact `pnpm run dev` a developer would type, confirmed `GET /` → 200 on both. |
| CF-03-SIB | `apps/merchant/app/(app)/hours/page.tsx` (`onSave`, `onToggleBusy`) and `apps/merchant/app/(app)/shop/page.tsx` (`onSave`, `onChooseCashRule`) share the same async-state-only submit guard as CF-02, but were NOT fixed — recorded, not silently skipped. Reason: both send an **absolute target value** computed once, synchronously, before either call's `await` (a full hours object; `!state.profile.busy`; the full profile fields; a specific `MerchantCashRule`). Two same-tick clicks compute and send the identical value twice — a wasted duplicate PUT, not a duplicated or flip-flopped write. Distinct from CF-02's confirmed instances, which either duplicate an audit trail (CF-02/ConfirmModal, OrderCard) or create a genuinely new row per call (CF-02/menu, categories). `apps/merchant/app/(app)/menu/page.tsx`'s `onClearOos` was left unguarded for the same reason (absolute "in stock" state). | `apps/merchant/app/(app)/hours/page.tsx`, `apps/merchant/app/(app)/shop/page.tsx` | LOW | OPEN (deliberate non-fix, reason above) |

**Sibling-sweep evidence:** `grep -rln "useState(false)\|setSubmitting\|setBusy\|setLoading" apps/admin/app --include="*.tsx" | grep -v .test.` — zero hits outside `ConfirmModal.tsx` itself (every admin mutation already funnels through the one shared component, so fixing it there was complete). The same grep against `apps/merchant/app` found 10 files; 7 fixed (CF-02), 2 recorded as CF-03-SIB (naturally idempotent), 1 (`PhotoCropSheet.tsx`'s `failed` state, `setup/page.tsx`'s `alarmTested`) confirmed unrelated to any submit guard on inspection.

## Phase 2 — no other findings

Every other journey listed in Phase 1 — the full admin route/malformed-deep-link/back-button/offline-
toggle/resize/query-param sweep, the merchant session/cookie/offline-login sweep, and the mobile OTP-
state/checkout/board/tracking sweep — came back clean: no crashes, no unhandled promise rejections, no
hangs, no infinite spinners, no flash-of-wrong-state frames. The one recurring console noise item
(`favicon.ico` 404 on both web apps) was traced to its source and confirmed benign — neither app ships
a `public/favicon.ico`, so the browser's automatic request 404s regardless of any app action; not a
finding.

## Verification

`pnpm typecheck && pnpm test` green locally across all 6 packages after the fixes (admin: 58 tests
incl. 1 new; merchant: 186 tests incl. 4 new). Every fix's regression test was verified to actually
fail without its corresponding fix (confirmed by temporarily reverting each guard line and re-running),
not just to pass trivially.
