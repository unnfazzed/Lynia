# Crash-fuzz report — 2026-08-23

Weekly crash-fuzz routine (`docs/routines/crash-fuzzing.md`), second run. Mission: find runtime
failures — crashes, hangs, unhandled rejections, infinite spinners, flash-of-wrong-state — by running
the REAL apps, not by reading source. Ledger prefix **CF-**, continuing from 2026-08-16's CF-01..CF-03.
Model: Sonnet 5, per owner instruction 2026-08-16.

## Phase 0 — baseline

`docs/KNOWN_BUGS.md` read in full. No open `claude/*` PR overlapped this lane (the only open PR,
#879, is an unrelated release-please version bump). Re-verified MOB-BOOT-04's "FIXED" claim
(commit `1e6ee80`, PR #863 — reverted `newArchEnabled` + the Didit native SDK back to build #30's
proven surface) against current `apps/mobile/app.config.ts` and `src/kyc/verify.ts`: holds.

Clean `main` needed `prisma generate` before `pnpm typecheck`/`pnpm test` would pass (API client isn't
checked in). Once generated, **both were green on clean `main`** (6/6 packages: admin 58, merchant
187, mobile 1559, api 1836 tests) — not a red-main condition, so the run proceeded.

## Environment stood up for this run

Same shape as 2026-08-16: no Docker daemon in this container, so the real stack was built from what
was available — **Postgres 16 + PostGIS 3** and **Redis**, both installed and started locally;
`apps/api/.env` pointed at them, migrations applied, seed run (1 admin, 1 customer, 5 verified online
riders, 1 open parcel order, 1 pilot merchant "Sadza Republic" + dishes + food orders). **`apps/api`**
booted for real (`pnpm run start:dev`, port 3333, `OTP_CHANNEL=console`). **`apps/admin`** (port 4311)
and **`apps/merchant`** (port 4312) booted as real Next dev servers against that live API.
**`apps/mobile`** was exercised via the `tools/parity/` react-native-web harness (real component code,
mocked network data per fixture — same disclosed coverage-shape difference as 2026-08-16).

OTP rate limits and access-token TTL were widened for this LOCAL fuzz session only; not a product
change, not part of the shipped diff.

**New this run: `apps/admin` needed `ADMIN_API_TOKEN` set to a freshly-minted admin JWT** for its
server-side proxy to reach the live API — without it every page renders the disconnected "Live data
and actions are unavailable" state with zero mutation buttons reachable. This isn't a documented
prerequisite anywhere in the repo; the first admin fuzz pass lost real testing time to it before the
gap was found and fixed for a follow-up pass. **`apps/merchant` needed `NEXT_PUBLIC_API_BASE_URL`**
(not `API_BASE_URL` — merchant is a client-driven app, `app/lib/config.ts` reads only the
build-time-inlined `NEXT_PUBLIC_` var) for the same reason; this one WAS silently broken in the
`tools/parity/serve-web.mjs` helper itself and is fixed as `CF-06` below, not just noted.

## Phase 1 — journeys fuzzed

**Admin** (1440×900, two passes — an initial pass that hit the `ADMIN_API_TOKEN` gap above, and a
follow-up once fixed): full route sweep including areas not covered 2026-08-16 (SOS ack, disputes,
KYC-decision UI, cash settlements, wallet-credit) · malformed deep links · back/forward-button spam ·
same-tick double-click on every confirm/submit button reachable, including three components using
`useTransition` instead of the `useState(false)` shape the original CF-02 sweep's grep matched ·
offline/online toggle mid-mutation · viewport resize mid-interaction · a real SOS event raised and
acknowledged live (both via direct concurrent API calls and a live browser double-click) · a real
merchant cash dispute driven end-to-end through the actual API (place → accept → dispatch → deliver →
cash-confirm → dispute → resolve) since none existed in seed data · order-detail actions (fare adjust,
call rider) on that now-real assigned order · customer hold/lift and wallet-credit re-verified via real
browser clicks (previously only DB-verified via raw concurrent curl). KYC-decision UI was found
genuinely unreachable in this environment (all 5 seeded riders `verified`; `KYC_PROVIDER=stub` +
`KYC_MODE=auto` instant-verifies every new one; a raw `UPDATE riders SET kyc_status='pending'` was
correctly blocked by the read-only sandbox classifier) — disclosed, not silently skipped.

**Merchant** (1024×680, Playwright, real phone-OTP login against the live API): full login flow ·
double-tap on every guarded action · interrupted OTP · malformed/no-session deep links · offline
toggle · viewport resize · a StrictMode-driven session race investigated and fixed (`CF-05`) ·
menu/categories reorder/toggle/delete fuzzed once the environment fix (`CF-06`) made the app reachable
at all · re-verified the accepted `CF-03-SIB` (hours/shop) non-fix premise still holds against current
`main` — it does, unchanged.

**Mobile** (react-native-web harness, 360×720 + the mandatory 320×640 pass): widened past
2026-08-16's 9 sampled journeys into previously-unsampled areas — the in-app KYC Didit sheet
(`KycCheckHost`), the wallet top-up flow, the rider "become a rider" submit, the customer/rider
Account tabs, and a live-reproduced hypothesis (confirmed via source read + runtime repro, not
guessed) that `apiFetch`'s lack of response-shape validation could crash any screen feeding a query's
`.data` straight into an array method.

**Coverage gaps, disclosed rather than silently skipped:**
- Mobile: still sampled, not exhaustive, against the ~275-screen gallery (same disclosed gap as
  2026-08-16). The in-app KYC sheet's "does the ✕ actually escape a stuck load" could not be proven
  live — the RNW harness resolves `react-native-webview` to its cross-platform no-op stub (no RN
  platform-extension resolution in esbuild) and `Alert.alert()` is a no-op under `react-native-web`,
  so the sheet's `"loading"` phase never progresses far enough to test the escape hatch meaningfully.
  Source review confirms the ✕ handler is unconditionally rendered and correctly wired — treated as
  clean pending a real-device check this harness structurally cannot perform.
- Admin: KYC-decision UI untestable this environment (seed/stub-mode limitation, not a guess — see
  above).
- Merchant: doorstep/debt flow (confirm-cash, confirm-goods, report-non-return, refund) could not be
  driven to a live state — the only path needs an actual dispatch-assigned rider, and seed data writes
  rider location/online status straight to Postgres without going through the real online-toggle API,
  so seeded riders are invisible to the Redis-geo dispatch prefilter. (Documented in this report for
  the next run: `PATCH /riders/online {online:true, lat, lng}` for real fixes this.) Source review of
  the guards (all still funnel through `useAsyncAction`/`submittingRef` from CF-02) found no
  regression.

## Phase 2 — findings, root causes, fixes

| ID | Description | Area | Sev | Status |
|---|---|---|---|---|
| CF-04 | **`apiFetch` has no runtime response-shape validation (`JSON.parse(text) as T`), and five screens fed a query's `.data ?? []` straight into `.map()`/`.filter()`/`.find()` — a malformed (non-array) 200 body crashes the screen with no recovery.** Root-caused from the exact fixture-level bug UIP-02 (2026-08-23's UI-parity audit, same day) had already found and worked around by fixing the FIXTURE — this run traced the same shape to the underlying APP-code gap and fixed it at the source. Live-reproduced via the `tools/parity` mobile harness (not just read from source): a fixture returning `{ orders: [] }` instead of `[]` for `/orders/mine/active-orders` throws `TypeError: activeOrders.map is not a function` inside `OrdersTabScreen`/home's tracker, with no error boundary in the bare-mounted render tree (in the real app, the root `_layout.tsx` boundary would catch it — still a full-screen crash card, not the graceful "no live cards" the code's own comment states is the intended failure mode). Sibling-swept via `grep -rn "\.data ?? \[\]"` across `apps/mobile` (zero hits in admin/merchant): five sites, all sharing the identical unguarded shape. | `apps/mobile/app/(tabs)/home.tsx`, `.../orders.tsx`, `apps/mobile/app/notifications/index.tsx`, `apps/mobile/app/order/[id].tsx` (**bid acceptance — sensitive lane**, all four `offersQ.data` reads routed through one guarded array), `apps/mobile/app/rider/(tabs)/index.tsx` (board ranking) | MEDIUM (order/[id].tsx: sensitive-lane conservative fix + test, mandatory) | **FIXED**, all 5 sites — `Array.isArray(x) ? x : []` in place of `x ?? []`. One regression test per site; each confirmed to fail against the pre-fix code (live-mounted via the mobile harness for home/orders, reverted-and-reran for all five). |
| CF-05 | **`apps/merchant`'s `SessionGuard` (`app/(app)/layout.tsx`) signs a rider back out ~immediately after they sign in, 100% reproducible under `next dev`.** Root cause: the guard used a `checkedOnce` ref to skip its sign-out check on the effect's first invocation ("give the provider's mount-time cookie read a chance to resolve first"), which assumed the effect runs once per real mount. React 18 StrictMode (dev only) double-invokes mount effects synchronously, before any state update from the first invocation has flowed through a render — so the ref was already `true` on the second invocation, which read the still-stale `session === null` from the ORIGINAL render's closure and called `signOut()`. Live-verified with a captured stack trace (`SessionGuard.useEffect → KitchenConnectionProvider.signOut → clearMerchantSession`), reproduced 3× independently. Single-invoke (a production `next build`) is not affected by the SAME mechanism, but the underlying flaw — `session === null` being ambiguous between "not yet checked" and "genuinely signed out" — is real regardless of what triggers the double read. | `apps/merchant/app/(app)/layout.tsx`, `apps/merchant/app/components/KitchenConnectionProvider.tsx` | HIGH (100% login lockout in dev; the ambiguity it exploits is not StrictMode-specific) | **FIXED** — replaced the invocation-count heuristic with an explicit `sessionChecked` boolean on the provider, set in the SAME synchronous effect that sets `session`, so both always resolve into the same render (no interleaving left for a double-invoke to exploit). Regression test reproduces the race with React's own `<StrictMode>` wrapper; confirmed to fail against the pre-fix code (spurious `signOut()`/`clearMerchantSession()` call) and pass with the fix. |
| CF-06 | **`tools/parity/serve-web.mjs`'s documented `API_BASE_URL` → "populated states" contract silently did nothing for merchant.** The script forwards `API_BASE_URL` (server-side var, correct for admin's proxy) but never derives merchant's `NEXT_PUBLIC_API_BASE_URL` (client-side, build-time-inlined — `app/lib/config.ts`), so merchant's browser bundle kept its `http://localhost:3000` fallback regardless of what `API_BASE_URL` was set to. Confirmed live: `curl` on the served bundle showed the literal fallback string, and every browser-side API call failed connection-refused. This blocked real merchant fuzzing for a significant part of this run until traced and fixed (a live network-reroute workaround kept the run going in the meantime, but that workaround itself produced at least one phantom finding — see "Investigated, not reproduced" below). | `tools/parity/serve-web.mjs` | MEDIUM (tooling — blocks this routine's own merchant coverage every week until fixed) | **FIXED** — the script now also sets `NEXT_PUBLIC_API_BASE_URL` when serving merchant with a seeded `API_BASE_URL`. Admin is unaffected (it never reads the `NEXT_PUBLIC_` variant). Verified live: merchant's served bundle now carries the real API host, and a full login flow succeeds against it. |
| CF-02-SIB-3 | Two more instances of CF-02's async-state-only submit-guard race (2026-08-16), at sites CF-02's own sibling-sweep grep (`useState(false)\|setSubmitting\|setBusy\|setLoading`) didn't match because they use a plain `useState` under a different name or React Query's `isPending`: `apps/mobile/app/rider/become.tsx`'s KYC-submit button (`busy`), and `apps/mobile/src/ui/rider/TopUpFlow.tsx`'s top-up request (`useTopUp`'s `create.isPending`). Live-reproduced via the mobile harness: a same-tick double-tap fired `becomeRider()`/`createTopup()` twice each. `becomeRider` carries no idempotency key (a duplicate call opens a second paid Didit session server-side); `createTopup`'s deterministic idempotency key means the server SHOULD dedupe the wallet case, so that one is a wasted-request finding, not a confirmed money-duplication risk. | `apps/mobile/app/rider/become.tsx`, `apps/mobile/src/ui/rider/TopUpFlow.tsx` (**wallet — sensitive lane**) | MEDIUM (become.tsx: real per-call vendor cost) / LOW (TopUpFlow: likely money-safe by design, but the same defect shape) | **FIXED**, both — a synchronous `useRef` guard (become.tsx) / `mutate()`'s own `onSettled` callback (TopUpFlow, since `start` is fire-and-forget, not awaitable). Regression tests confirmed failing against the pre-fix code. |
| CF-02-SIB-4 | A THIRD instance of the same grep gap: `apps/admin`'s `FollowUpNoteButton.tsx`, `AcknowledgeButton.tsx` and `KycSubmitButton.tsx` all guard with `useTransition`'s `pending`, not a `useState(false)` the original grep matched. The three differ in what protects them server-side — kept distinct below rather than conflated, since a client-side guard cannot change what a raw, client-bypassing API call does. | `apps/admin/app/orders/[id]/FollowUpNoteButton.tsx`, `apps/admin/app/sos/AcknowledgeButton.tsx`, `apps/admin/app/riders/KycSubmitButton.tsx` (**KYC gating — sensitive lane**) | LOW-MEDIUM (audit-integrity; FollowUpNoteButton's own doc comment frames the log note as no-money-effect) | **FIXED**, all three — the same synchronous `useRef` guard `ConfirmModal.tsx` uses. Regression tests (same-tick double-click inside one `act()` call, matching `ConfirmModal.test.tsx`'s CF-02 technique) confirmed failing against the pre-fix code. Per-site verification: **`FollowUpNoteButton`** — `POST /admin/audit-actions` has NO server-side dedup, DB-confirmed via two concurrent direct API POSTs bypassing the client: two `audit_logs` rows ~2ms apart. The new client-side guard is this site's ONLY protection; it was not (and could not meaningfully be) re-verified against a raw API bypass, since there is nothing server-side to re-verify — the finding stands as fully client-guard-dependent, disclosed rather than implied otherwise. **`AcknowledgeButton`** — `SosService.acknowledge`'s CAS already made a duplicate call harmless server-side; re-verified live in the follow-up authenticated admin pass via BOTH a direct concurrent API bypass (1 row) and a same-tick browser double-click (1 row) — two independent confirmations of two different layers. **`KycSubmitButton`** — not live-tested (no pending-KYC rider exists in this environment); fixed and unit-tested for consistency only. |
| CF-02-SIB-5 | A FOURTH instance: `apps/merchant/app/(app)/menu/categories/page.tsx`'s `run()` — the shared helper behind reorder/toggle/delete — guards only with `busyId` (React state); its sibling `onSaveSheet` in the same file already carries the correct `submittingRef` guard (from the original CF-02 fix), but `run()` itself was missed. Move and toggle recompute an identical target value on both same-tick calls (harmless duplicate write — the same shape as the accepted `CF-03-SIB` hours/shop non-fix), but Delete does not: a same-tick double-tap sends two `DELETE` calls for one category id. | `apps/merchant/app/(app)/menu/categories/page.tsx` | LOW-MEDIUM (delete only; move/toggle share the accepted idempotent-duplicate shape) | **FIXED** — a per-id `Set`-backed ref (unrelated category rows must stay independent — same shape as `ReturnsSection.tsx`'s existing `goodsBackInFlightRef`). Regression test confirmed failing against the pre-fix code (2 `deleteCategory` calls instead of 1). |
| MOB-BOOT-02-SIB-3 | **`apps/mobile/app/(tabs)/account.tsx`'s rider-bridge row is a flash-of-wrong-state — "a screen rendering a decision it has not yet made", the exact class MOB-BOOT-02 (2026-08-12) named.** While `['me']` is loading, `isRider` falls back to `session?.role`, which can read stale/absent for an account that already IS a verified rider — live-reproduced via the mobile harness as a ~1.5–2s flash of "Become a rider" before flipping to "Switch to rider". The sibling rider-side screen (`app/rider/(tabs)/account.tsx`) avoids this class entirely by early-returning a full-screen skeleton while loading; this screen's OTHER rows (Notifications/Help/Settings) carry no role guess, so gating the whole screen the same way would be a bigger UX regression than the bug — only the one role-dependent row withholds itself until the real role is known. | `apps/mobile/app/(tabs)/account.tsx` | MEDIUM (cosmetic, but the exact named bug class) | **FIXED** — the bike-bridge row is omitted from `rows` while `meQ.isLoading`, rather than guessing from `session?.role`. No new regression test file; covered by the existing role-separation/harmony suites' loading-state assertions plus a direct render check. |

## Investigated, not reproduced

**"CF-06" (merchant agent's own numbering, not this report's — pages self-correcting back to `/queue`
after ~1-3s even after their own data loaded).** The parallel merchant-fuzzing pass that found this
was working around the (also-fixed-this-run) `NEXT_PUBLIC_API_BASE_URL` gap above with a live
network-request-reroute at the Playwright layer, not a real server. Once the actual tooling fix
(ledger `CF-06`) was in place, a clean re-run — real login, then `/shop`, `/hours`, `/menu/categories`
each held for 3.5s of direct observation — showed **no redirect back to `/queue` on any of the three
routes.** Documented honestly as investigated-and-not-reproduced rather than either "fixed" (nothing
to fix) or silently dropped: the most likely explanation is that the network-reroute workaround itself
interfered with a Next.js RSC/router fetch in a way that looked like an app bug but wasn't one. If a
future run sees this again against a CLEANLY configured server (no workarounds), it needs a fresh
investigation — this report is not asserting it can never happen, only that it didn't happen here.

## Verification

`pnpm typecheck && pnpm test` green locally across all 6 packages after every fix (admin 61 tests
incl. 3 new; merchant 190 incl. 3 new; mobile 1565 incl. 6 new; api/shared unchanged). Every new
regression test was confirmed to actually fail without its corresponding fix — reverted via `git
stash` and rerun, not just written and trusted.
