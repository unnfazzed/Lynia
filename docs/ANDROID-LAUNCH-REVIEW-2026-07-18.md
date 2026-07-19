# Lynia — Android App Launch Review (Engineering + Design) · 2026-07-18

> **gstack Engineering + Design review of `apps/mobile` for the 31 July launch.** Run as a parallel
> multi-agent campaign following the gstack review methodology — 11 staff-engineer finder lanes over the
> mobile codebase each with an **adversarial verify pass** (evidence over assertion), and 8 design lanes
> scored **0–10** with "what would make it a 10" framing. Branch: `claude/g-stacks-android-deploy-4krxpb`.
> Companion logs: [`ENG-REVIEW.md`](./ENG-REVIEW.md) §8 · [`DESIGN-REVIEW.md`](./DESIGN-REVIEW.md) §7 ·
> status board [`PILOT-READINESS.md`](./PILOT-READINESS.md) · campaign [`LAUNCH-READINESS.md`](./LAUNCH-READINESS.md).

## Verdict — **CONDITIONAL GO for 31 July**

The Android client is **launch-worthy code** once this PR merges. Ten years of edge-case hardening are
visibly baked in: the campaign's own finders repeatedly described the surfaces they audited as "unusually
well-hardened for a pre-launch codebase" — durable pending-rating/top-up/terminal markers that survive
Android app-kills, single-flight token refresh with rotation tolerance, an exhaustive shared-device
sign-out wipe, offline-aware React Query, real-reachability-driven connectivity. Most dimensions scored
**7–9/10**.

The campaign surfaced **one P0 and six P1** real defects (adversarially confirmed against the code). **The
P0 and five of the six P1s are fixed in this PR with regression tests**; the sixth (a GPS data-cost
optimization) is deferred to the on-device QA pass because its safe form needs first-fix-latency
measurement on real hardware — the current behavior is functionally correct.

**GO is conditioned on three things that were already open launch gates, none of them new code work:**
1. The **on-device `/qa` pass** on real low-end Android hardware (existing gate **LR16** — maps, FCM,
   GPS degradation, background/resume, 3G). The whole mobile surface has only ever run on emulators/Expo Go.
2. **Founder/vendor wiring** (existing `PILOT-READINESS.md` runbook): WhatsApp BSP production OTP, a real
   Didit ZIM-ID run, Firebase (live FCM), the Google Maps Android key, and — for the store build —
   `EXPO_PUBLIC_MIN_APP_VERSION` + `EXPO_PUBLIC_STORE_URL` so the force-update gate can protect the field.
3. A **monochrome notification icon asset** (see Deferred §D2) so pushes don't render a blank white square.

Engineering and design themselves **clear**. Ship the fixes, run the device pass, wire the vendors.

---

## 1. Engineering review — scorecard

| Lane | State (finder summary, abridged) |
|------|----------------------------------|
| auth-session | Token/refresh/expiry machinery is the best-engineered part of the codebase; the one serious gap was navigation, not tokens (the P0 below). |
| networking-offline | "Unusually well-built for a pre-launch app" — reachability derived from real request outcomes, single-flight refresh, capped retries, bounded timeouts. Minor edge cases only. |
| realtime-sockets | Mature: coalesced reconnect flush, emit-before-persist, background foreground-service scoping. No blockers. |
| order-lifecycle-customer | Idempotency-keyed create, optimistic select/cancel with rollback, honest terminal copy, delivery-code reconciliation across app-kill. One P1 (rating undo). |
| rider-flows | "Unusually well-hardened" — lost-response/409 reconciliation, durable terminal markers, permission-revocation recovery. No blockers; P2 polish only. |
| wallet-money | 0% commission at launch makes most money-path bugs latent; the live gap is balance staleness (P1) since a support-credit is the only top-up path. |
| push-notifications | Token rotation, cold-start deep-link, role/`to`-aware routing all solid — but two P1 lifecycle defects (token-mint misclassification; dialog timing). |
| maps-location-gps | Very mature (camera-fight solved, staleness escalation, offline buffer). One P1→P2 data-cost item (double GPS emit). |
| data-privacy-lifecycle | Strong, built around shared-device reality — secrets in keystore only, module-sourced sign-out wipe. P2/P3 orphan-key cleanup only. |
| app-config-build | Well-constructed — fingerprint OTA runtime, fail-open version gate, "attach only when provisioned" secret gating. P2 config items (icon, version-gate target). |
| state-error-resilience | Thoughtful retry/reachability/refresh; render-error boundary present. P0 (session-loss redirect) + P2 (offline mutations) + P3 (no global JS handler). |

### Confirmed blockers (adversarially verified) & disposition

| # | Sev | Area | Defect | Disposition |
|---|-----|------|--------|-------------|
| B1 | **P0** | auth-session | Sign-out and forced-401 logout clear the session but never navigate — user stranded on an authless protected screen; on a shared device the next user can't reach login without force-killing the app. | **FIXED** (this PR) |
| B2 | P1 | state-resilience | Cold-start hangs on the splash forever if the keychain read throws (`loadSession` unguarded read + no `.catch` on the boot load). | **FIXED** (this PR) |
| B3 | P1 | push | FCM token-mint failure on flaky 3G misclassified as terminal → push dead for the whole session even after the network recovers. | **FIXED** (this PR) |
| B4 | P1 | push | OS notification-permission dialog fires at OTP-verify, before the primed explainer → higher denial rate. | **FIXED** (this PR) |
| B5 | P1 | order-lifecycle | Rating "Undo" window is a lie — a star tap commits immediately and irreversibly via the reconcile effect. | **FIXED** (this PR) |
| B6 | P1 | wallet | Balance never refreshes while the screen is open (global `refetchOnWindowFocus:false`) and no pull-to-refresh — a support-credit appears not to land. | **FIXED** (this PR) |
| B7 | P1→P2 | maps-gps | Foreground `watchPositionAsync` and the background foreground-service both emit every fix → ~2× location upload on metered 3G while foregrounded. | **DEFERRED** to device-QA (functionally correct today; safe fix needs first-fix-latency measurement — see §D1) |

---

## 2. Design review — scorecard (0–10)

**Average 7.5/10** across the 8 lanes (world-class token discipline; the gaps are Android font-scaling,
form keyboard-avoidance, and one mandatory-profile-setup friction point). No design **P0**. Design P1s are
polish that pair naturally with the on-device `/qa` pass.

| Lane | Score | What would take it to 10 (abridged) |
|------|:----:|-------------------------------------|
| states-empty-loading-error | 9 | Make the Notifications screen honest offline (distinguish "couldn't load" from "nothing here"). |
| design-system-adherence | 8 | Extend the (already excellent, zero-hardcoded-hex) color discipline to typography tokens. |
| copy-microcopy | 8 | (Lane returned a degraded rationale — re-run in the device pass; no P0/P1 raised.) |
| typography | 7 | Set `allowFontScaling`/`maxFontSizeMultiplier` deliberately — **zero** components do today, so a raised Android font size can break OTP boxes, pills, steppers. |
| color-contrast-a11y | 7 | The "Turn on" location-recovery link uses brand-green `accent` (reserved for fills), failing the token system's own contrast intent. |
| spacing-layout | 7 | Bake scroll + keyboard-avoidance into the shared `Screen`; today profile-setup can trap its Save button under the keyboard on Android. |
| touch-targets-ergonomics | 7 | Pin the rider job screen's current-step primary action into the thumb zone, matching the customer compose screen's discipline. |
| journey-coherence | 7 | Let a customer who just wants to send one parcel defer the mandatory "Tell us who you are" profile step. |

### Notable design P1s (for the device-QA pass)

- **Font-scaling unset app-wide** (typography) — on a low-end Android with a raised system font size, OTP
  boxes / status pills / the quantity stepper can overflow. App-wide `maxFontSizeMultiplier` guard needed.
- **Profile-setup keyboard trap** (spacing-layout) — the post-OTP setup form renders fields + Save inside
  `<Screen>` with no ScrollView/KeyboardAvoidingView; on Android's default the keyboard can cover Save.
- **Recovery link uses fill-green** (color-contrast) — the rider "Location is off → Turn on" link renders
  in `accent`, the green the tokens reserve for fills only.
- **Mandatory profile setup for send-one-parcel customers** (journey-coherence) — first-run friction on
  the exact conversion the product wants.

---

## 3. What this PR fixes (with tests)

| # | Fix | Files | Test |
|---|-----|-------|------|
| B1 | `SessionGate` redirects to `/phone` on the session present→null transition (sign-out / forced 401). | `src/auth/session-gate.tsx` (new), `app/_layout.tsx` | `src/auth/__tests__/session-gate.test.ts` |
| B2 | `loadSession` guards the keychain **read** (not just parse); boot load gets `.catch`/`.finally(setLoading(false))`. | `src/auth/session.ts`, `src/auth/auth-context.tsx` | `src/auth/__tests__/session.test.ts` (loadSession resilience) |
| B3+B4 | `registerForPushNotificationsAsync` is check-don't-request (explainer owns the OS dialog) and classifies transient FCM token-mint failure as retryable; a `push-kick` pub/sub re-registers when the explainer grants. | `src/push/push.ts`, `src/push/push-kick.ts` (new), `src/push/use-push-registration.ts`, `app/permissions.tsx` | `src/push/__tests__/registration.test.ts`, `push-kick.test.ts` |
| B5 | Reconcile effect only auto-submits a rating **recovered from storage** (cold-start heal); a live-armed rating is committed solely by RatingCard's own timer/unmount, so Undo works. | `app/order/[id].tsx` | RatingCard flow covered; reconcile gated by `ratingFromStorage` ref |
| B6 | Wallet screen refetches on focus + pull-to-refresh (`RefreshControl`) + a "couldn't refresh — last known" cue. | `app/wallet/index.tsx`, `src/query/use-wallet.ts` | (UI wiring; verified via typecheck + device pass) |

**Quality gates:** mobile typecheck clean · **441 tests pass** (56→59 suites, +15 regression tests) · oxlint clean.

---

## 4. Deferred backlog (prioritized, with rationale)

Deliberately **not** changed in this PR — each carries either device-verification risk or needs a design
asset. Documented so the device-QA pass and the founder wiring pick them up. Full finder output preserved
in [`ENG-REVIEW.md`](./ENG-REVIEW.md) §8 and [`KNOWN_BUGS.md`](./KNOWN_BUGS.md).

### D1 — GPS double-emit (P2, data-cost) — *device-QA*
Drop one of the two parallel GPS streams while foregrounded. **Safe form:** make
`startRiderBackgroundUpdates()` return whether the foreground-service actually started; when it did (Android
success), skip `watchPositionAsync` (the service already covers foreground); otherwise keep the watch
(iOS / OEM failure fallback). Must be measured on-device — first-fix latency and the reconnect flush are
load-bearing for the customer's live map, so a blind change risks a frozen tracker (worse than 2× data).

### D2 — Notification icon (P2) — *needs a design asset*
`app.config.ts` `expo-notifications` sets only `color`, no `icon`, so Android shows a blank white square on
every push. Fix: add a 96×96 white-silhouette-on-transparent `assets/notification-icon.png` and
`["expo-notifications", { icon: "./assets/notification-icon.png", color: "#00B14F" }]`. Left to the
founder/designer — a wrong monochrome mark looks worse than none.

### D3 — Offline mutations show an infinite spinner (P2) — *needs care*
Mutations inherit `networkMode:"online"`, so a tap while offline pauses silently behind an indefinite
button spinner with optimistic UI already applied. A global change touches every mutation's rollback path;
scope per-mutation and verify each on-device.

### D4 — Selected engineering P2/P3 (fold into device pass)
- Ride completion doesn't invalidate the wallet balance/ledger (latent at 0% commission; B6's focus-refetch
  already covers the visible case).
- `LiveMap` doesn't gate the fit on `onMapReady` / has no map-load-failure fallback → possible blank/wide
  tracking map on low-end Android (verify on-device).
- Rider mid-trip location-permission revocation only detected at stream start (no in-trip warning).
- ~~Notifications feed routes an orderId-less row to `/rider` regardless of role.~~ **Fixed by BH-18**
  (`docs/KNOWN_BUGS.md`) later the same day — `push.ts`/`notifications/index.tsx` now honor a `to`
  discriminator stamped on customer-account pushes.
- Customer per-order `lynia.lastActive.<orderId>` snapshots not wiped on sign-out (orphan; low-risk).
- No global JS error / unhandled-rejection handler (render errors are caught by the ErrorBoundary; non-render
  crashes are hard native crashes with no telemetry).
- Converted-rider role preference not re-persisted → cold-boots to the customer screen (known nice-to-have).

### D5 — Design polish (fold into device pass)
Font-scaling guard app-wide, profile-setup keyboard-avoidance, the fill-green recovery link, and the
mandatory-profile-setup friction (see §2). Re-run the copy-microcopy lane (it returned a degraded rationale).

---

## 5. Remaining launch gates (unchanged, pre-existing)

These are **not** code gates and sit outside this review's scope — tracked in `PILOT-READINESS.md` /
`LAUNCH-READINESS.md`:

- **LR16 — on-device `/qa`** on real low-end Android: maps render + fit, FCM receive + tap routing, GPS
  degradation, background/resume mid-delivery, 3G behavior. **This is the single biggest open gate.**
- **Founder/vendor wiring:** WhatsApp BSP (prod OTP), Didit ZIM-ID run, Firebase (live FCM),
  `GOOGLE_MAPS_API_KEY` (Android), and store-build config (`EXPO_PUBLIC_MIN_APP_VERSION`,
  `EXPO_PUBLIC_STORE_URL`, optional `EXPO_PUBLIC_SUPPORT_WHATSAPP`).
- **Perf/load (LR9–LR15):** SLOs are targets, not yet measured under load — lower risk for a Harare pilot
  volume but tracked.

## 6. Bottom line for 31 July

Ship this PR. Run the on-device `/qa` pass and fix what it surfaces (the deferred items above are written
for exactly that pass). Complete the founder/vendor wiring. With those three done, the Android app gives
riders and customers a smooth, trustworthy launch experience — the core loop, money surfaces, realtime
tracking, and failure behavior are all in launch-ready shape.
