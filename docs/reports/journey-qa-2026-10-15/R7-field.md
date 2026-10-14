# R7 — Field signals (report only)

- **Lane:** R7 Field signals (plan `docs/routines/journey-qa-24h.md` §7 R7)
- **Model:** per §1 schedule (Haiku tier), read-only
- **Harness:** static-only. No app or API boot. Expo and Play reads only.
- **main SHA:** `28e4437`
- **Fired:** 2026-10-14 12:25 UTC (scheduled 12:05)

## Source status

| Source | Result |
|---|---|
| Expo `build_list` (`@lyniago/lynia`, ANDROID, limit 5) | ✅ read |
| Expo Observe (`observe_*`) | skipped per §7 (no EAS Observe SDK in the app) |
| Play `playstore_crashes` (`zw.co.lynia`), one attempt | ❌ `invalid_grant: account not found` (the known credential fault). **NEEDS OWNER.** Reviews not pulled, since the crash call failed. |
| Sentry (`lynia-mobile`, `lynia-api`, org `lyniago`) | ❌ no Sentry tools in this session (`ToolSearch` found none on two tries). **NEEDS OWNER.** No Sentry data below; the Sentry issues cited are the plan's own claims, not verified. |
| PostHog (EU project 219333) | ❌ no PostHog tools in this session. **NEEDS OWNER.** No funnel, drop-off, dwell or `$screen` data. |
| Client RUM `/client-metrics` | no connector. **NEEDS OWNER** (per §7 step 6). |

Because Sentry and PostHog were unreachable, the funnel, device-tier (≤3 GB RAM or Android ≤10) and
per-screen speed questions are **not answered** by this report. The table below is code evidence only.

## Build closed testers run

| Field | Value | Evidence |
|---|---|---|
| Build | `e0e8c7f8-a023-4195-a44d-83231a0b36fc`, `0.52.0` (`appBuildVersion` 47), profile `closed`, channel `preview`, FINISHED | Expo `build_list` |
| Commit | `dbcb21f` (`chore(main): release 0.52.0 (#978)`), created 2026-10-12 18:14 UTC | Expo; `git log` |
| Ancestry | `dbcb21f` **is an ancestor of main**, and it is older than #1160 (`d756d95`), #1185 (`f25bdf0`) and #1187 (`7f24fe6`) | `git merge-base --is-ancestor` |

Testers run a build that **does not include** #1160, #1185 or #1187. Every finding that those PRs fix is
`fixed-on-main-not-shipped`. The newest build in the list is 0.52.0; no build after 2026-10-12 is on record.

## Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R7-01 | P1 (shipping) | all journeys | Testers on 0.52.0 (#47) do not get #1160 biker onboarding fixes, #1185 auth/upload/wallet hardening or #1187 socket renewal | Compare the build commit with main | Expo `build_list` (`dbcb21f`); `git log origin/main` | ancestry check above | no (shipping issue, not a code defect) | **yes** (#1160, #1185, #1187) |
| JQ-R7-02 | P2 (unverified) | Send, compose map | Customer sees "the map didn't load" card. Plan cites Sentry `LYNIA-MOBILE-3` (2 users, 10 events, 14d). **Unverified.** | Sentry needed | Code: `ComposeMap.tsx:51-52` (9 s slow, 22 s fail), `:238` (the only `compose-map-not-loaded` emitter); `logic/map-load-signal.ts:14-16` (`onMapLoaded` on Android) | Code is correct for `onMapLoaded`. Real Android key failure is MOB-MAP-04, whose GCP allowlist fix landed 2026-10-06 with the key string unchanged, so the fix reaches **already-installed** Play builds. Any event after 2026-10-06 with `map_load_signal=onMapLoaded` is a new signal. | MOB-MAP-04, MOB-MAP-02 | the Android key part: **yes** (2026-10-06 GCP fix is live for installed builds) |
| JQ-R7-03 | P2 | Track an order, order map | Customer order map shows no fallback and no event if tiles or key fail. Plan cites Sentry `LYNIA-MOBILE-6` in `app/order/[id]`, but **that event cannot originate from the order screen on main.** | Open an order on a phone where tiles don't draw | `ui/order/OrderMap.tsx:5` imports only `PinView` from `ComposeMap`; `OrderMap.tsx:164` renders a bare `MapView` with **no** `onMapLoaded` / `onMapReady` handler, **no** `captureException`, **no** fallback. Only emitter: `ComposeMap.tsx:238`, rendered from `app/send.tsx:625`. | `rg` on `captureException|compose-map|onMapLoaded|onMapReady` in `OrderMap.tsx` and `map-perf.tsx`: no matches | KNOWN_BUGS P12/P13/P34 cover mount timing only, not load failure | no |
| JQ-R7-04 | P2 (signal hygiene) | Triage | Sentry groups from the order screen may be stale or mis-attributed (see JQ-R7-03). | Check the Sentry release tag on `LYNIA-MOBILE-6` | `OrderMap.tsx:5`, `ComposeMap.tsx:238` | depends on Sentry release tag | no | n/a |
| JQ-R7-05 | P3 (gap) | triage | Device-tier cut (≤3 GB RAM, Android ≤10) cannot be made from code. No RAM or OS gating exists in `ComposeMap`. | — | `ComposeMap.tsx` has no `totalMemory` / `Platform.Version` branch | rg: no matches | no | n/a |

## Speed

Measured timings: **none**. Sentry and PostHog did not return data, and no device was run.

Code-level budgets only (weak-link tolerance):

| Screen | Budget | Evidence |
|---|---|---|
| Send compose map: "taking a while" hint | 9 s | `ComposeMap.tsx:51` |
| Send compose map: failure card | 22 s | `ComposeMap.tsx:52` |
| Order map: no budget, no failure path | — | `OrderMap.tsx` (JQ-R7-03) |

## NEEDS OWNER

1. **Play credential:** `playstore_crashes` fails with `invalid_grant: account not found`. Re-link the Google Play service account in Expo.
2. **Sentry connector:** not present in this session. Needed for `LYNIA-MOBILE-3` and `-6`, device model, RAM and OS.
3. **PostHog connector:** not present in this session. The Expo↔PostHog refresh token is revoked; re-link in Expo → Connections (EU project 219333).
4. **Client RUM:** `/client-metrics` (`apps/api/src/observability/client-metrics.controller.ts`) has no connector.
5. **Ship decision (owner):** testers are on 0.52.0 (#47), which predates #1160, #1185 and #1187. A `closed`-profile build is needed to get them to testers (see JQ-R7-01). R7 does not dispatch builds.

## Notes

- Report only. No app code changed. No build, submission or workflow triggered. No PR merged.
- The shared branch already held R0's commit `e0c6309`; this file was added on top of it.
