# R7 — Field signals (report only)

- **Lane:** R7 Field signals (plan `docs/routines/journey-qa-24h.md` §7 R7)
- **Model:** per §1 schedule (Haiku tier), read-only
- **Harness:** static code + live Sentry and PostHog reads. No app or API boot. No build, submission or workflow triggered.
- **main SHA:** `28e4437`
- **Window:** 14 days to 2026-10-14 12:30 UTC (Sentry `period=14d`; PostHog `now() - 14 DAY`)

## Sources

| Source | Result |
|---|---|
| Expo `build_list` (`@lyniago/lynia`, ANDROID, limit 5) | ✅ read (before the tool disconnected) |
| Play `playstore_crashes` (`zw.co.lynia`) | ❌ `invalid_grant: account not found` (the known credential fault). **NEEDS OWNER.** Reviews not pulled. |
| Sentry `lynia-mobile` (org `lyniago`, us.sentry.io, 14d, sort user) | ✅ 2 unresolved issues. Both fetched in full. |
| Sentry `lynia-api` (14d) | ✅ **0 unresolved issues** |
| PostHog EU project (`read-data-schema`, `execute-sql` on `events`) | ✅ screen reach and last-screen-per-session. Aggregates only; no person or session IDs in this report. |
| PostHog funnel, dwell and timing | not run. Typed funnel runners need a schema drill-down; the reach table below is not a conversion funnel. No timing events exist. |
| Client RUM `/client-metrics` | no connector. **NEEDS OWNER.** |

## Build closed testers run

| Field | Value | Evidence |
|---|---|---|
| Build | `e0e8c7f8-…`, `0.52.0` (`appBuildVersion` 47), profile `closed`, channel `preview`, FINISHED 2026-10-12 18:24 UTC | Expo `build_list` |
| Commit | `dbcb21f` (`chore(main): release 0.52.0 (#978)`) | Expo; `git log` |
| Ancestry | `dbcb21f` **is an ancestor of main** and predates #1160 (`d756d95`), #1185 (`f25bdf0`) and #1187 (`7f24fe6`) | `git merge-base --is-ancestor` |

Testers run a build without #1160, #1185 or #1187. Every finding those PRs fix is `fixed-on-main-not-shipped`.

**Note on Sentry releases:** the crash events below come from older preview builds, `0.51.0+40` (vc 40) and `0.51.0+44` (vc 44). Both are older than the current closed-testing build.

## Sentry: `lynia-mobile` (both issues are `compose-map-not-loaded`)

| Issue | Users / events | First → last seen (UTC) | Release | Device / OS / RAM | Culprit (Sentry) | Signal |
|---|---|---|---|---|---|---|
| **LYNIA-MOBILE-3** | 2 / 13 | 2026-08-17 → **2026-10-06 05:26** | `0.51.0+44` (vc 44) | Hot 60 Pro+, **Android 8.1**, **974 MB RAM**, `device.class=low` | `useEffect` in `ComposeMap` (`ComposeMap.tsx:235`) | `map_load_signal=onMapLoaded`, `map_elapsed_ms=22077`, `map_reachable=true`, `map_attempt=2` |
| **LYNIA-MOBILE-6** | 1 / 1 | 2026-09-30 → 2026-09-30 17:41 | `0.51.0+40` (vc 40) | TECNO CN5c, **Android 16**, 8 GB RAM | `OrderScreen` (`app/order/[id].tsx:898`) | `map_load_signal=onMapLoaded`, `map_elapsed_ms=22025`, `map_attempt=1` |

Reading the two issues:

- **Both are the Android map-never-drew signature.** `onMapLoaded` never fired and the 22 s fail timer ran (`ComposeMap.tsx:51-52`), with `map_reachable=true`. This matches **MOB-MAP-04** in `docs/KNOWN_BUGS.md`: the Maps key was allowlisted for only one of three Play signing certificates. Android 16 phones run under `deployment_cert`, which the key did not allow (LYNIA-MOBILE-6 is an Android 16 phone). MOB-MAP-04 was fixed on **2026-10-06** in GCP, and the app's key string did not change, so the fix reaches already-installed builds.
- **Both events stop on or before 2026-10-06.** No new `compose-map-not-loaded` event has arrived since. That is consistent with the GCP fix. It is not proof: the window is short, and the sample is 3 events from 2 users.
- **LYNIA-MOBILE-3 meets the plan's low-end device flag:** Android 8.1 (≤ Android 10) and 974 MB RAM (≤ 3 GB). No other issue in this window does.
- **LYNIA-MOBILE-6 does not match current `main`.** Sentry places the event in `app/order/[id].tsx:898`, which is an `EmptyState` render. On current main, `OrderMap.tsx:5` imports only `PinView` from `ComposeMap` and never renders the component that emits `compose-map-not-loaded` (`ComposeMap.tsx:238`). Either release 40 mounted a map there, or the frame mapping is wrong. Treat the attribution as unreliable.

`lynia-api`: no unresolved issues in 14 days. The API is quiet by this measure.

## PostHog: screens, reach, and where sessions end (14 days)

Sessions counted for "last screen" = 109 (sum of the table below).

### Customer journey reach (distinct users per screen)

| Screen (`$screen_name`) | Views | Users | Route file | Note |
|---|---|---|---|---|
| `/(tabs)/home` | 367 | 12 | `app/(tabs)/home.tsx` | 30 views per user; the most common last screen (33 of 109 sessions) |
| `/phone` | 264 | **39** | `app/phone.tsx` | **6.8 views per user** |
| `/verify` | 157 | 37 | `app/verify.tsx` | 4.2 views per user |
| `/` (index) | 84 | 39 | `app/index.tsx` | |
| `/onboarding` | 71 | 32 | `app/onboarding.tsx` | |
| `/profile/setup` | 10 | 9 | `app/profile/setup.tsx` | reach drops 32 → 9 after onboarding (see JQ-R7-06) |
| `/permissions` | 4 | 3 | `app/permissions.tsx` | very low; the permission steps may not emit `$screen` |
| `/send` | 57 | 8 | `app/send.tsx` | |
| `/order/[id]` | 49 | 8 | `app/order/[id].tsx` | |

### Biker journey reach

| Screen | Views | Users | Route file |
|---|---|---|---|
| `/rider/become` | 14 | 4 | `app/rider/become.tsx` |
| `/rider/documents` | 6 | **1** | `app/rider/documents.tsx` |
| `/rider/offer/[jobId]` | 5 | 1 | |
| `/rider/job` | 5 | 1 | |
| `/rider/(tabs)/money` | 85 | **1** | `app/rider/(tabs)/money.tsx` |
| `/rider/(tabs)/account` | 76 | **1** | `app/rider/(tabs)/account.tsx` |
| `/wallet/top-up` | 10 | 1 | `app/wallet/top-up.tsx` |

The biker sample is tiny (4 users reached `/rider/become`). The reach numbers are not a funnel.

### Sessions by last screen (where sessions end)

| Last screen | Sessions |
|---|---|
| `/(tabs)/home` | 33 |
| `/phone` | 11 |
| `/verify` | 9 |
| `/settings/delete-account` | 9 |
| `/(tabs)/account` | 8 |
| `/rider/(tabs)` | 6 |
| `/rider/(tabs)/money` | 6 |
| `/(tabs)/orders` | 5 |
| `/send` | 4 |
| `/rider/(tabs)/account` | 4 |
| others (≤ 3 each) | 22 |

### Custom events

Taxonomy (30-day snapshot): `$screen` is the only active screen event. `rider_screen_shown` and `rider_go_online` have 1 event each. **No `$exception` events in 30 days.** So PostHog gives no client error signal. Sentry is the only crash source.

## Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof (data) | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R7-01 | P1 (shipping) | all | Testers are on 0.52.0 (#47), which lacks #1160 biker onboarding, #1185 auth/upload/wallet hardening, and #1187 socket renewal | compare build commit with main | Expo `build_list` (`dbcb21f`); `git log origin/main` | ancestry check above | no (shipping issue) | **yes** (#1160, #1185, #1187) |
| JQ-R7-02 | P1 (fixed; verify) | Send compose map, low-end Android | "The map didn't load" card; the map never draws on Android 8.1 / 974 MB | open `/send` on Android ≤10 with a key the SDK rejects | Sentry `LYNIA-MOBILE-3` (`ComposeMap.tsx:235`, `:51-52`); `map-load-signal.ts` (`onMapLoaded` on Android) | 13 events, 2 users, last 2026-10-06 05:26 UTC; `map_load_signal=onMapLoaded`, `map_elapsed_ms=22077` | yes: MOB-MAP-04 (fixed 2026-10-06 in GCP, key string unchanged) | GCP fix applies to installed builds; no event since 10-06. **Verify over the next day.** |
| JQ-R7-03 | P2 (attribution) | Order screen, Android 16 | Sentry shows a blank-map event on the order screen | none on current main | Sentry `LYNIA-MOBILE-6` culprit `app/order/[id].tsx:898`; `OrderMap.tsx:5` (imports `PinView` only), `ComposeMap.tsx:238` | 1 event, 1 user, 2026-09-30 17:41 UTC, release 40 | partly: MOB-MAP-04 covers the Android 16 cause | MOB-MAP-04 fixed 2026-10-06. Frame mapping is inconsistent with current code. |
| JQ-R7-04 | P1 (unverified; R4 to confirm) | Customer sign-up, `/phone` ↔ `/verify` | Users cycle between phone and code screens | live OTP run (R4) | `app/phone.tsx:95-101` (back / replace); `app/verify.tsx:282-283` (back, else replace `/phone`) | `/phone`: 264 views, 39 users, **6.8 views per user**; `/verify`: 157 views, 37 users; 11 + 9 sessions end on these two screens | no | no |
| JQ-R7-05 | P2 (unverified) | Settings → delete account | 9 sessions end on `/settings/delete-account`. Possible dead end after the request, or a designed final screen | open the delete-account flow and back out | `app/settings/delete-account.tsx` (exists) | 93 views, 12 users; 9 of 109 sessions end here (5th-largest exit) | no | no |
| JQ-R7-06 | P2 (drop-off, low n) | Customer onboarding → profile | Reach falls from 32 users (`/onboarding`) to 9 (`/profile/setup`) | new-user onboarding run (R4) | `app/onboarding.tsx`, `app/profile/setup.tsx` | 32 → 9 distinct users. Returning users may skip profile, so this is not proof of a blocker. | no | no |
| JQ-R7-07 | P2 (budget phone, static) | Rider Money / Account tabs | Background polling every 20 s while the tab is open | open Money on a weak link and watch requests | `apps/mobile/app/rider/(tabs)/money.tsx:189` (`setInterval(reread, 20_000)`) | 85 + 76 views, one tester in 14 days. Polling cost is static; not measured on a device. | no (check R6 polling list) | no |
| JQ-R7-08 | P3 (gap) | telemetry | PostHog has no client error signal and almost no journey events | — | taxonomy snapshot; `src/telemetry/analytics.tsx` | 0 `$exception`, 1 `rider_go_online`, 1 `rider_screen_shown` in 30 days | no | no |
| JQ-R7-09 | P3 (gap) | triage | Device-tier cut ≤3 GB / Android ≤10 is possible only from Sentry device context | — | `ComposeMap.tsx` has no RAM or OS gating | Sentry device fields only | no | n/a |

## Speed

Measured timings: **none.** PostHog holds no timing events and no `$screen` durations were queried. Sentry gives one wait signal, the 22 s fail budget on the map (`ComposeMap.tsx:52`).

| Screen | Budget / signal | Source |
|---|---|---|
| Send compose map: "taking a while" hint | 9 s | `ComposeMap.tsx:51` |
| Send compose map: failure card | 22 s; observed `map_elapsed_ms` 22025 and 22077 | `ComposeMap.tsx:52`; Sentry |
| Rider Money tab poll | every 20 s | `money.tsx:189` |

## NEEDS OWNER

1. **Play credential.** `playstore_crashes` fails with `invalid_grant: account not found`. Re-link the Google Play service account in Expo. Play crash data is missing for the window.
2. **Client RUM.** `/client-metrics` (`apps/api/src/observability/client-metrics.controller.ts`) has no connector.
3. **Ship decision.** The testers' build predates #1160, #1185 and #1187 (JQ-R7-01). R7 did not dispatch builds.
4. **Owner context needed.** Is `/settings/delete-account` a designed final screen, or a dead end? (JQ-R7-05)

## Corrections to the earlier R7 report

The first version of this report said Sentry and PostHog were unreachable. That was wrong: the connectors came up during the session and the data is above. The Expo-to-PostHog link is still revoked, but the PostHog connector works directly. The PostHog "NEEDS OWNER" item is removed.

## Notes

- Report only. No app code changed. No build, submission or workflow triggered. No PR merged.
- Person and session identifiers from Sentry and PostHog are not copied into this report.
- The shared branch already held R0's commit `e0c6309`. This update is a new commit on top of the R7 commit `e445ebe`.
