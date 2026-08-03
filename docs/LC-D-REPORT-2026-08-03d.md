# LC loop D report — 2026-08-03 (D-T3: notification/deep-link coherence)

**Territory:** D-T3 — Notification/deep-link coherence under low connectivity (push arrives
late/duplicated/out of order — where does it strand the user?), the first unchecked Lane D audit
territory per `docs/plans/2026-08-01-low-connectivity-program.md` §5.

**Phase 0:** No open `claude/lc-d*` PR at Phase 0 (only #509, Lane B, unrelated). Read
`docs/KNOWN_BUGS.md`'s LC-D history and the `LC-D-SIB-1..4` sibling-lane findings before starting.

## Method

Two `Explore` agents ran in parallel: one mapped push-notification handling end-to-end (listener
registration, tap routing, de-duplication, ordering assumptions, stale-target handling, token
registration), the other mapped deep-link routing (there is no `Linking`/universal-link config in
this app — the only deep-link entry point is a push-notification tap, `apps/mobile/src/push/`).
Both agents, working independently off different questions, converged on the same underlying
finding: a race between the cold-start push-tap handler and the boot screen's own default redirect.

## Finding: LC-D18 (HIGH, CONFIRMED, FIXED)

**A cold-start push tap could be silently overridden by the app's own default boot redirect.**

`usePushRegistration` (`apps/mobile/src/push/use-push-registration.ts`) used to read
`Notifications.getLastNotificationResponseAsync()` in an effect on mount, to catch the case where
the app was fully killed and the OS relaunched it because the user tapped a notification (a warm
tap, when the app is already running, fires `addNotificationResponseReceivedListener` instead — that
path was unaffected and is unchanged). On a match, it called `pushDestination(...)` then
`router.push(target)` — entirely independent of `app/index.tsx`, the app's actual initial route,
which separately holds a splash screen until its own async reads (`useAuth()`'s session load,
`loadOnboardingSeen()`, `loadRolePreference()` — all local SecureStore/AsyncStorage reads) resolve,
then renders `<Redirect href={bootDestination(...)} />` to send the user to `/onboarding`, `/phone`,
`/profile/setup`, `/rider`, or `/home`.

These are two independently-resolving async operations with **no ordering guarantee between them**.
If the push-tap read resolved and navigated first (e.g. to `/order/abc123` for a "Delivered — tap to
rate your rider" push), and `index.tsx`'s own boot reads resolved microseconds to milliseconds later,
its `<Redirect>` would still fire — expo-router's `<Redirect>` runs its navigation effect on
mount/update regardless of whether the screen instance is currently focused, and `router.replace()`
(what `<Redirect>` calls under the hood) acts on the current top of the navigation stack, not the
specific screen instance that requested it. The result: the user's screen would flash to the order
they tapped for, then silently snap back to `/home` or `/rider` a beat later, with no error and no
visible reason — the exact "arrives late, strands the user" shape this territory was scoped to find.
Because both sides of the race are local reads (no network round trip), this is latent on **every**
cold start regardless of connectivity — but it's the low-connectivity angle that makes it matter: the
OS notification tray can hold a tap for hours on this program's dead-zone-prone target devices, so
the tap and the app's eventual boot resolution are never causally related, and whichever wins is
pure scheduling luck.

Traced and confirmed via `apps/mobile/src/auth/auth-context.tsx` (`loadSession()` is async,
`session` starts `null`), `apps/mobile/app/index.tsx` (splash held on `loading`/`onboardingSeen`/
`rolePref`, independent of any push state), and `apps/mobile/src/logic/boot-route.ts`
(`bootDestination` can resolve to `/home`/`/rider` for a signed-in user) — no existing
coordination mechanism (no shared ref, no "deep link pending" flag) reconciled the two paths.

### Fix

Moved the cold-start notification consumption entirely into `app/index.tsx`'s own boot sequence,
so the deep-link decision and the default-destination decision are made together, in the same
render, by the same function — never by two independently-resolving effects:

- **`apps/mobile/src/push/push.ts`**: added `consumeColdStartResponse()`, a memoized wrapper around
  `getLastNotificationResponseAsync()` + `clearLastNotificationResponseAsync()` so every caller
  (now just one — `index.tsx`) awaits the same resolution instead of racing the native read/clear
  against a second caller.
- **`apps/mobile/src/logic/boot-route.ts`**: added `bootRedirectTarget()`, which combines the
  existing `bootDestination()` with the cold-start deep link — the deep link wins only when a
  session exists (nothing to deep-link into otherwise) and `pushDestination` returns a route for the
  payload; both fall through to the ordinary destination. Fully unit-testable without rendering,
  matching this file's existing pattern.
- **`apps/mobile/app/index.tsx`**: added a third async gate (`coldStartData`, alongside
  `onboardingSeen`/`rolePref`) that holds the splash until the cold-start check resolves too, then
  renders a single `<Redirect href={bootRedirectTarget(...)} />`.
- **`apps/mobile/src/push/use-push-registration.ts`**: removed the cold-start read entirely (moved
  above); kept only the warm-tap listener (`addNotificationResponseReceivedListener`, for when the
  app is already running), which was never part of this race.

This closes the race by construction: there is now exactly one place that decides the cold-boot
destination, and it can't render until it has both pieces of information.

### Regression tests

- `apps/mobile/src/logic/__tests__/boot-route.test.ts` — `bootRedirectTarget`: falls back to the
  ordinary destination with no tap; a tap's destination wins over the default for both a customer
  and a rider payload; a tap is ignored with no signed-in session; an unroutable payload falls back.
- `apps/mobile/app/__tests__/index.test.tsx` (new) — drives the real `index.tsx`: splash holds until
  the cold-start check resolves even after onboarding/role are ready (the exact gap that let the race
  happen); a cold-start tap wins over the ordinary destination in one render pass; falls back
  correctly with no tap.
- `apps/mobile/src/push/__tests__/use-push-registration.test.tsx` — re-scoped from the removed
  cold-start describe block to a "warm-tap listener" block: routes a warm tap, doesn't re-push when
  already on the target route (pre-existing duplicate-tap guard, still covered), and re-subscribes
  cleanly on an `isRider` change without duplicate navigation.

## Other angles swept, found already sound (no defect, no optimization needed)

- **Duplicate/redelivered tap idempotency**: `pushOnce()`'s same-route no-op guard already prevents
  a duplicate tap (OS redelivery, or a second tap on the same tray notification) from stacking a
  redundant back-stack entry, for both the warm listener and (now) the cold-start path.
- **Stale target order** (tapped notification's order has since completed/cancelled/reassigned,
  plausible given hours-long tray dwell time on this program's target devices): already handled
  generically, not per-notification — `order/[id].tsx` distinguishes 404 ("not found")/403
  ("not available to you")/transient (offline + Retry) via `orderLoadErrorKind`, and
  `food-offer.tsx` explicitly handles an expired/reassigned offer with clear copy. No stranding path
  found (no blank screen, no stuck spinner, no crash).
- **Ordering assumptions**: the push payload carries no sequence number, but nothing in the tap
  handler trusts the payload for state — it only navigates; every destination screen re-fetches live
  server state on mount. An out-of-order push (e.g. "assigned" arriving after "picked_up" due to
  redelivery) can't desync the UI as a result.
- **Notification de-duplication (no collapse-key)**: real gap (`notifications.service.ts`'s `send()`
  sets no FCM `collapseKey`/`tag`), but not exploitable today — every current `notify*` call site
  sends each status transition at most once, with no retry-on-failure path that would produce a
  duplicate send. Appended as optimization item **D-O3** rather than fixed as a defect, per the
  audit-mode/optimize-mode split (this is preventive hardening against a future caller, not a
  present-day user-facing failure).

## Ledger + program state

- `docs/KNOWN_BUGS.md`: added `LC-D18` (HIGH, FIXED).
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D: ticked D-T3, appended `D-O3`.

## Verification

`pnpm typecheck && pnpm lint && pnpm test` all green (mobile: 95 suites / 691 tests; api: 96 files /
1516 tests; admin/merchant/shared unaffected, cache-hit clean).
