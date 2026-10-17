# Plan: large-font layouts + field crashes (2026-10-17)

Status: **draft — under gstack plan review** (`/plan-eng-review`, `/plan-design-review`). Nothing implemented yet.

## Why

Two bikers signed up on 0.54.0 (vc 50) this morning (2026-10-17, ~10:49 and ~11:10 UTC).

- One runs a phone with an enlarged system font; the owner reports the UI broke.
- One reported the app "crashed". Sentry **LYNIA-MOBILE-8** confirms it: native `SIGABRT` at 11:15:57 UTC,
  Samsung Galaxy A15 (SM-A155F, Android 16, `device.class: low`, 3.8 GB RAM), frames
  `eglCreateSyncImpl → pthread_mutex_lock` (GPU driver), on a Sentry executor thread, no app frames.
  PostHog places it 15 s after `kyc_launch` → `kyc_sheet_shown` on `/rider/(tabs)` (ID check / camera).
- PostHog also shows **unexplained cold restarts** (new `$session_id` + `/` screen, 20–40 s after the
  previous event) for BOTH bikers: 3 for the A15 (each after `/rider/offer/[jobId]` or `/rider/job`), 4 for
  the Android 15 biker (after permissions / board / job). Sentry has no event for them → OS kill (LMK /
  OOM), user swipe, or an uncaught native death Sentry didn't flush. Not yet distinguishable.
- Play vitals: no crashes/ANRs reported (Play lags 1–2 days).

## Evidence about large font in the code

- No global `maxFontSizeMultiplier` / `Text.defaultProps`. Font scale is handled only in: First Run
  (`src/ui/firstrun/metrics.ts`, `LARGE_FONT_SCALE = 1.2`), the order screen (`app/order/[id].tsx`,
  `stagePeekFloor`, stacked buttons), Orders kit, order cards, and the delivery-code digits (cap 1.15).
- The rider board, offer (`app/rider/offer/*`, `food-offer.tsx`), job (`job.tsx`, `food-job.tsx`,
  `src/ui/rider/job-kit.tsx`), `become.tsx` + KYC sheet, Money tab, permissions screens: **no font-scale handling**.
- The handoffs define the supported range: every handoff draws **font scale 1.3** frames and says text
  wraps / buttons grow (`rider-v2` §Font scale, `customer-briefs-06-09` "Support OS font scales 1.0–1.3",
  `order-flow-v2`, `merchant-v2`, `first-run-v2`, `orders-v2`, `browse-v2`). Nothing is drawn above 1.3.
  Android "Largest" font + display size can reach 2.0×.

## Plan

### 1. Large font — cap the scale at the drawn ceiling, then fix what still breaks at 1.3

1a. **Global cap = 1.3** (the largest scale any handoff draws). Set once at boot for `Text` and `TextInput`
   (`maxFontSizeMultiplier: 1.3`), via a small module imported from `app/_layout.tsx` through `bootStep`.
   Existing tighter per-element caps (1.15 code digits, 1.0 big hand-off code) keep winning because a
   prop on the element overrides the default.
   - Text still grows with the user's setting up to 1.3× — this is not "turning off" accessibility; it
     clamps to the range the designs were made for. Ledger entry in `docs/DESIGN-DEVIATIONS.md` (the
     handoffs say "grows like sp" without an upper bound) — owner approves the 1.3 number.
1b. **Fix the rider surfaces at 1.3 @ 320×640 and 360×720**, per rider-v2 rules (buttons `minHeight`,
   labels wrap, never truncate except where the handoff says ellipsis): board, offer (parcel + food), job
   (parcel + food), become + KYC sheet + F-screens, permissions (P*), Money tab, top-up.
1c. **Verification**: render those screens through `tools/parity/` (react-native-web) with font scale 1.3
   at 320×640 and 360×720 and attach the sheet to the PR. Add a jest test that asserts the boot sets the
   default cap, and a regression test per screen fixed for any measurable layout logic (e.g. stacking
   decisions keyed on `fontScale`).

### 2. Crash LYNIA-MOBILE-8 (GPU driver abort during ID check)

Not fixable from JS with the evidence we have (no app frames, one event). Do:
2a. Breadcrumbs around the ID-check camera hand-off (`kyc_launch`, sheet open/close, camera permission
   result, return from the Didit flow) so the next event shows the exact step.
2b. Tag Sentry + PostHog events with `font_scale` and `device_class` (see §3).
2c. Watch: if it recurs on the same chipset (MediaTek MT6789) / Android 16, open an upstream issue with
   the camera/WebView vendor and consider a low-end fallback. No speculative code change now.

### 3. Telemetry gaps exposed today

3a. Register PostHog super-properties `font_scale` (rounded to 0.05) and `screen_width_dp` at boot and on
   change (`useWindowDimensions`), and set the same as Sentry tags. Lets us answer "who uses large font"
   and correlate crashes with it.
3b. Detect the unexplained restarts: on cold start, if the previous session ended without a clean
   background (`AppState` → background) record `app_unclean_restart` with the last screen. Distinguishes
   OS kills from user exits. (Android `ApplicationExitInfo` via a native module is out of scope.)

### 4. Other unresolved Sentry issues (triage, no code unless noted)

| Issue | What | Last seen | Action |
|---|---|---|---|
| LYNIA-MOBILE-7 | `SplashScreen.setOptions` rejected (NPE casting options), `_layout.tsx:89` | 2026-10-15, 0.53.0 | **Handled** by `bootStep`, no user impact. All 4 events are Google Play pre-launch robots (US, emulator-like devices, 106 dpi). Fix: skip `setOptions` when the native module rejects — already swallowed; just mark resolved-in-next / add an ignore rule. |
| LYNIA-MOBILE-3/4/6 | `compose-map-not-loaded` (diagnostic, not a crash) | 2026-10-06, ≤0.51.0 | Old builds, low-end Android 8.1 (1 GB RAM). Resolve; reopens on regression. |
| LYNIA-MOBILE-5 | Places `REQUEST_DENIED`, 1 event | 2026-09-28, 0.50.1 | One-off key/quota hiccup on an old build. Resolve. |

## Out of scope

Redesigning screens above 1.3; native exit-reason module; changing the Didit SDK.

## Ship

One PR for §1 + §3 (+ §2a breadcrumbs), merge on green per repo policy. Reaches phones by OTA on the
next `production` publish (JS-only change, same runtime) — dispatch is the owner's call.

---

# Eng review record (/plan-eng-review, 2026-10-17)

Target: this file (`docs/plans/2026-10-17-large-font-and-field-crashes.md`), original plan above unchanged.

## Scope Challenge findings

1. **[P1] (confidence 9/10) plan §1a — `Text.defaultProps` is a dead mechanism on React 19.**
   `node_modules/react/cjs/react-jsx-runtime.production.js` contains **0** references to `defaultProps`
   (React 19.1.0, `apps/mobile/package.json:52`); RN 0.81.5 `Text` is a function component
   (`Libraries/Text/Text.js:38 const TextImpl: component(`). The app compiles JSX with the automatic
   runtime, so a boot-time `Text.defaultProps = { maxFontSizeMultiplier }` would be silently ignored.
   The cap needs another mechanism.
2. **[P2] (8/10) plan §2a — the launch breadcrumbs already exist.** `src/kyc/verify.ts:153-155`
   `noteLaunch()` already sends `kyc_launch` + a Sentry `kyc.launch` breadcrumb with lane/outcome/timings.
   PostHog shows the crash sequence precisely: sheet opened 11:13:00 → check completed 11:15:37
   (`total_ms` 160226) → sheet opened AGAIN 11:15:42 → crash 11:15:57 → relaunch → third sheet 11:16:12 →
   completed 11:19:38. The crash happened 15 s into a second WebView camera session (`src/kyc/KycCheckHost.tsx`,
   which also keeps a hidden prewarm WebView). What's missing is the sheet open/close + WebView
   mount/unmount breadcrumbs, not the launch one.
3. **[P3] (7/10) plan §1b — the 1.3 ceiling matches existing code.** First Run already treats ≥1.2 as the
   "font 1.3" frame set (`src/ui/firstrun/metrics.ts:69 LARGE_FONT_SCALE = 1.2`) and every handoff draws
   1.3 as its largest scale. No conflict.
4. **[P2] (8/10) plan §3b — restart detection is new instrumentation** with a persisted marker
   (SecureStore is the app's store, `src/boot/prewarm.ts:1`); it is independently selectable from the
   font work and needs its own approval.

Complexity: ~12–14 files (layout/boot, telemetry ×2, rider screens ×8, ledger, tests) → complexity gate trips.

Scope record: feature answers: none proposed (no cuts); structure: A "Smaller arrangement" (D1, answered
2026-10-17); accepted scope: PR 1 = text-size cap + font-scale tracking + crash breadcrumbs (+ restart
detection if R3 approves); PR 2 = biker screen fixes at 1.3× with screenshot sheets; pending remedies: R1, R2, R3, R4.
Scope Challenge result: scope accepted as-is (smaller arrangement, same features).

## Decision ledger

### R1: How the app-wide text-size cap is applied
Finding: 1, P1, 9/10, plan §1a / react-jsx-runtime.production.js, eng reviewer
Plan baseline: original proposal — `Text.defaultProps` at boot (dead on React 19).
Runtime evidence: no cap anywhere today; 132 files import `Text` from `react-native`.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 mechanism | none | app `Text`/`TextInput` wrappers + import codemod + lint ban | Android native clamp in MainActivity (config plugin) | per-screen props only |
| Reaches phones | — | OTA (JS only) | new build vc 51 + Play | OTA |
| Cap value | pending (design review) | 1.3, pending | 1.3, pending | n/a |
| R2–R4 | pending | pending | pending | pending |
Question D2: see AskUserQuestion D2 (copied verbatim below once answered).
Header: Text cap
Options:
A) App Text wrapper (Recommended)
Add src/ui/Text.tsx (Text + TextInput defaulting maxFontSizeMultiplier to 1.3, element props still win), swap the imports in the 132 files mechanically, and ban importing Text/TextInput from react-native with ESLint so it can't regress. JS only, reaches phones by OTA. Big but mechanical diff. Human ~1 day / CC ~30 min.
B) Android native clamp
Expo config plugin that clamps the system font scale to 1.3 in MainActivity. Catches every text including native components, tiny diff, but needs a new native build and a Play release; testers wait days. Human ~4h / CC ~20 min + build.
C) No global cap
Fix only the biker screens one by one with per-element props. Smallest diff, but every other screen stays broken at large font and new screens repeat the bug. Human ~1 day / CC ~45 min.
State: approved
Actual answer: A) App Text wrapper (D2, answered 2026-10-17)
Accepted scope: `src/ui/Text.tsx` exporting `Text` + `TextInput` that default `maxFontSizeMultiplier` to the
cap (element props win, `allowFontScaling={false}` untouched); mechanical import swap in every file that
imports `Text`/`TextInput` from `react-native`; ESLint `no-restricted-imports` banning those two names from
`react-native` outside the wrapper; jest tests for the default and the override. Cap value pending design review.
History: none

### R2: Crash breadcrumbs around the ID-check sheet
Finding: 2, P2, 8/10, src/kyc/KycCheckHost.tsx, eng reviewer
Plan baseline: original §2a (launch breadcrumbs — already exist at verify.ts:153).
Options: A) Add sheet open/close + WebView mount/unmount + prewarm teardown breadcrumbs (Recommended) · B) Keep current breadcrumbs only.
State: approved
Actual answer: A) Add sheet breadcrumbs (D3, 2026-10-17)
Accepted scope: Sentry breadcrumbs (no URLs, no PII) on sheet open/close, check WebView mount/unmount and
prewarm WebView teardown in `KycCheckHost.tsx`; extend `check-host.test.tsx`.

### R3: Detect unexplained restarts
Finding: 4, P2, 8/10, plan §3b, eng reviewer
Options: A) Persist last screen + clean-background flag; on cold start without it, send `app_unclean_restart` (Recommended) · B) Skip.
State: approved
Actual answer: A) Track restarts (D4, 2026-10-17)
Accepted scope: persist `{lastScreen, cleanBackground}` (SecureStore, device-local); set clean on `AppState`
→ background, clear on → active; on cold start report `app_unclean_restart {last_screen}` only when a
marker exists and is not clean (first launch after install sends nothing). Pure decision function + tests.
Known limit: an OS kill AFTER a clean background is not reported (indistinguishable from a swipe-away).

### R4: Record the phone's font scale
Finding: plan §3a, eng reviewer
Options: A) PostHog super-property `font_scale` + `screen_width_dp`, same as Sentry tags (Recommended) · B) Skip.
State: approved
Actual answer: A) Record font scale (D5, 2026-10-17)
Accepted scope: register `font_scale` (rounded to 0.05) and `screen_width_dp` as PostHog super-properties
and Sentry tags at startup and on change.

Note: D3–D5 were sent as one AskUserQuestion call with three separate question objects (one choice each)
to save the owner round-trips on a phone; each was answered independently.

Approval readiness: PASS — R1 (D2), R2 (D3), R3 (D4), R4 (D5); structure D1. Cap value (1.3) stays
pending for /plan-design-review.

## Section 1 — Architecture
- [P2] (8/10) plan §1a / R1 — the wrapper covers only JSX `Text`/`TextInput`. `Animated.Text`, third-party
  components that render their own `Text` (map callouts, toasts from libraries) and WebView content
  (the Didit ID check) are not capped. Accept: the biker screens use app components; WebView text zoom is
  the vendor's. Note it in the ledger entry. Dispositions: accepted as a documented limit (no new choice).
- [P3] (7/10) R3 — the marker must be written off the JS thread's hot path; SecureStore writes on every
  screen change would cost I/O on 1 GB phones. Write `lastScreen` only on background, not per navigation.
  Dispositions: folded into R3's implementation (same approved behaviour).

```
cold start ──► read marker ──┬─ none ───────────────► (first run) nothing
                             ├─ clean=true ─────────► nothing (user left normally)
                             └─ clean=false ────────► track app_unclean_restart{last_screen}
AppState active ──► marker.clean=false
AppState background ──► marker={lastScreen, clean:true}
```

## Section 2 — Code quality
- [P2] (8/10) apps/mobile/package.json:11 — lint is **oxlint**, not ESLint. Use oxlint's
  `no-restricted-imports` in `.oxlintrc.json` (scoped to apps/mobile, allowing `src/ui/Text.tsx`), or a
  `scripts/check-*.mjs` like `check-font-charset.mjs` if oxlint's rule can't express the allowlist.
  Dispositions: accepted (mechanics of approved R1).
- [P3] (7/10) R1 — React 19 passes `ref` as a prop, so the wrapper should be a plain function spreading props
  onto RN `Text` (no `forwardRef` layer). Dispositions: accepted (mechanics of R1).

## Section 3 — Tests
```
CODE PATHS                                         USER FLOWS
[+] src/ui/Text.tsx (new)                          [+] Biker at font scale 2.0
  ├── [GAP] no prop → cap 1.3                        ├── [GAP] text stops growing at 1.3 (render test)
  ├── [GAP] maxFontSizeMultiplier=1.15 wins          └── [GAP][→E2E] board/offer/job fit at 1.3 @320 (parity sheet, PR 2)
  └── [GAP] allowFontScaling={false} passes through
[+] lint ban                                       [+] ID check
  └── [GAP] importing Text from react-native fails   └── [GAP] breadcrumbs on open/close/unmount (check-host.test.tsx)
[+] restart marker (pure fn)                       [+] Cold start after kill
  ├── [GAP] none → no event                          └── [GAP] unclean → one app_unclean_restart
  ├── [GAP] clean → no event
  └── [GAP] unclean → event with last_screen
[+] font_scale registration
  └── [GAP] registers rounded value; updates on change
COVERAGE: 0/12 paths today (all new) | all 12 get tests in the plan
```
Every gap above becomes a jest test in PR 1 except the 1.3 screen fits (PR 2, parity sheets).

## Section 4 — Performance
- [P3] (6/10) R1 — one extra function call per `Text` render; no extra fiber if written as a plain function.
  Scale: hundreds of Text per screen on the board. Negligible. No issues requiring a choice.

## Outside voice
Codex not installed in this container; the native fallback needs `TaskOutput`, which this session does
not expose. Outside voice **unavailable** (logged). No clean-review credit from it.

## NOT in scope
- Native exit-reason module (Android `ApplicationExitInfo`): needs a native build; R3 covers the JS side.
- Fixing the GPU driver abort itself: no app frames; revisit if it recurs on MT6789 / Android 16.
- Screens above 1.3×: not drawn by any handoff.

## What already exists
- `src/kyc/verify.ts:153` launch analytics + breadcrumb (reused, not rebuilt).
- `src/ui/firstrun/metrics.ts` large-font breakpoints; `orderflow/kit.tsx` and `rider/job-kit.tsx` per-element
  caps (kept; they override the wrapper default).
- `src/telemetry/sentry.ts` `addBreadcrumb` (reused for R2).

## Failure modes
| Path | Failure | Covered by | User sees |
|---|---|---|---|
| Text wrapper | a file still imports RN Text | lint ban | nothing (CI fails) |
| Restart marker | SecureStore read throws | try/catch, skip event | nothing |
| Font scale tag | PostHog not initialised | sink no-op | nothing |
No critical gaps.

## Implementation Tasks
- [ ] **T1 (P1, human: ~1 day / CC: ~30min)** — mobile UI — Add capped `Text`/`TextInput` wrapper, swap imports, lint ban
  - Surfaced by: Scope Challenge finding 1 / R1
  - Files: apps/mobile/src/ui/Text.tsx, all `Text`/`TextInput` importers, .oxlintrc.json
  - Verify: `pnpm --filter mobile test`, `pnpm --filter mobile lint`
- [ ] **T2 (P2, human: ~1h / CC: ~10min)** — KYC — Sheet/WebView breadcrumbs
  - Surfaced by: finding 2 / R2 · Files: src/kyc/KycCheckHost.tsx, check-host.test.tsx
- [ ] **T3 (P2, human: ~3h / CC: ~20min)** — telemetry — Unclean-restart marker + event
  - Surfaced by: finding 4 / R3 · Files: src/telemetry/*, app/_layout.tsx, events.ts
- [ ] **T4 (P2, human: ~1h / CC: ~10min)** — telemetry — font_scale / screen_width_dp super-props + Sentry tags
  - Surfaced by: R4 · Files: src/telemetry/analytics.tsx, sentry.ts
- [ ] **T5 (P2, human: ~1 day / CC: ~45min)** — biker UI (PR 2) — fix board/offer/job/become/permissions/money at 1.3 @320+360, parity sheets
  - Surfaced by: plan §1b
- [ ] **T6 (P2)** — docs — DESIGN-DEVIATIONS entry for the 1.3 cap (after design review)

Worktree parallelization: Sequential implementation, no parallelization opportunity (PR 2 depends on PR 1's wrapper).

## Completion summary
- Step 0: Scope Challenge — scope accepted as-is (smaller arrangement)
- Reality rows: 7/7 tier-1 rows considered; already-done hit (verify.ts:153); 0 unverified premises
- Architecture Review: 2 issues found
- Code Quality Review: 2 issues found
- Test Review: diagram produced, 12 gaps identified
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review (cap value handed to design review)
- Outside voice: codex, unavailable (not installed; native fallback lacks TaskOutput)
- Parallelization: 1 lane, 0 parallel / 2 sequential
- Lake Score: 4/4


# Design review record (/plan-design-review, 2026-10-17)

System audit: UI scope = font-scale behaviour of existing screens (no new UI). DESIGN.md exists
(`docs/DESIGN.md` § Responsive & accessibility). Authority = the per-area handoffs (CLAUDE.md). Focus answer:
all 7 passes, **no AI mockups** (the handoffs already draw font-1.3 frames; AI mockups can't overrule them).
Outside design voices: declined by the owner (Codex not installed anyway).

Step 0: 5/10 — cap silently contradicts rider-v2, journey incomplete, states unspecified.

## Approved design decisions (amend §1 above)

- **D-5A (cap rule):** text grows with the system setting up to **1.3×**, then stops — the largest scale any
  handoff draws. Element caps already in code (1.15 code digits, 1.0 hand-off code) still win. Log
  **D-111** in `docs/DESIGN-DEVIATIONS.md` amending rider-v2's "text grows like Android sp" line. Owner, 2026-10-17.
- **D-3A (screens in PR 2):** the whole sign-up journey a biker walks, each per its own handoff:
  `app/onboarding`, `app/phone`, `app/verify`, `app/profile/setup`, `app/setup-permissions`,
  `app/permissions`, `app/rider/become` + KYC sheet + F screens, rider board, offer (parcel + food), job
  (parcel + food), Money tab, top-up. Owner, 2026-10-17.
- **D-2A (states):** for every in-scope screen, every state its handoff draws (empty, offline, loading, error,
  60 s food-offer timer, gates) is rendered at font 1.3 on **320×640 and 360×720** through `tools/parity/`
  and the sheets attached to PR 2. Owner, 2026-10-17.

Journey storyboard (accepted):
```
STEP | USER DOES                | USER FEELS             | PLAN SPECIFIES?
1    | Opens app, welcome       | curious, judging       | D-3A onboarding @1.3
2    | Phone + SMS code         | wary (trust)           | D-3A phone/verify @1.3
3    | Profile + permissions    | impatient              | D-3A profile/setup-permissions/permissions
4    | Become a biker, ID check | nervous, camera on     | D-3A become/KYC + R2 breadcrumbs
5    | Board, first offer       | eager                  | D-3A board/offer + D-2A states
6    | Job, delivery code       | focused, outdoors      | D-3A job; code cap 1.15 kept
```

## Passes
| Pass | Before | After | Notes |
|---|---|---|---|
| 1 Info architecture | 8 | 8 | Hierarchy owned by handoffs; rider-v2 "wrap, don't truncate" applies. No issues. |
| 2 States | 5 | 9 | D-2A. |
| 3 Journey | 5 | 9 | D-3A + storyboard. |
| 4 AI slop | 9 | 9 | No new UI. No issues. |
| 5 Design system | 4 | 9 | D-5A + D-111. |
| 6 Responsive & a11y | 6 | 8 | 320×640 + 360×720 per D-2A; targets keep `minHeight` from tokens so they grow with text. Residual: low-vision users above 1.3 get 1.3 (accepted in D-5A). |
| 7 Decisions | — | 3 resolved, 0 deferred | |

## Design Implementation Tasks
- [ ] **DT1 (P1, human ~30 min / CC ~5 min)** — docs — add D-111 to `docs/DESIGN-DEVIATIONS.md` (cap 1.3, owner 2026-10-17)
- [ ] **DT2 (P2, human ~2 days / CC ~1h)** — mobile UI — PR 2 screen list per D-3A, every drawn state per D-2A, parity sheets attached
- _No new tasks from Pass 1, Pass 4._

NOT in scope: layouts above 1.3×; AI mockups. What already exists: handoff font-1.3 frames
(order-flow-v2 `?fs=1.3`, first-run-v2, after-send-v2, orders-v2), `tools/parity/` screenshot lane.

```
  DESIGN PLAN REVIEW — COMPLETION SUMMARY
  Step 0 5/10 · Pass1 8→8 · Pass2 5→9 · Pass3 5→9 · Pass4 9→9 · Pass5 4→9 · Pass6 6→8
  Pass 7: 3 resolved, 0 deferred · Mockups: 0 (owner: skip) · Decisions made: 3
  Overall: 4/10 → 8/10
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex (plan-review) | Independent 2nd opinion | 1 | unavailable | not installed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 17 issues, 0 critical gaps (all mapped to approved tasks) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4/10 → 8/10, 3 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex plan-review unavailable (CLI not installed); design outside voices declined by owner.
- **VERDICT:** DESIGN CLEARED. Eng review status issues_open = findings mapped to approved work, no open decisions; eng review required.

NO UNRESOLVED DECISIONS
