# Documentation Sync Report

**Run: 2026-08-04, interactive — post-go-live release-state reconciliation.** Not a marker-scoped
routine pass. Triggered by the founder the morning the Android app reached Google Play, with a
two-part brief: bring the documentation in line with "the app is live and the update process works
end to end", and review the state for regressions.

Scope was deliberately narrowed to **the release/launch lane** — the docs that make claims about
distribution, the update channels, and launch gates — plus a full CI-gate regression run. It did
**not** re-reconcile the whole tree against code, which is why `docs/.last-doc-sync` is
**deliberately left at `2416ad0`**: advancing it would tell the next scheduled routine that
everything up to HEAD had been checked, and it has not been. The next routine run should still
cover the 2026-07-26 → HEAD range.

Every fact below was verified against an authoritative source — the EAS GraphQL API (builds,
submissions, update channels/branches), the GitHub Actions run history, a locally computed
`@expo/fingerprint` hash, and the artifact itself — not inferred from the prior docs.

## Summary

| Class | Count |
|---|---|
| STALE_DOC (fixed) | 10 files |
| CODE_BUG (ledgered, not doc-edited) | 2 (`REL-01`, `REL-02` — one fixed forward same run) |
| ORPHAN | 0 |
| AMBIGUOUS | 1 (see below) |
| Regressions found by the CI-gate run | 0 |

---

## Ground truth established this run

The prior docs stopped at "attempt 9 goes out once this merges". What actually happened:

| Time (UTC, 2026-08-04) | Event |
|---|---|
| 08:53 | `mobile-release.yml` run #10 dispatched on `86773ae` (the API-35 fix). Workflow succeeded in 50s — it queues with `--no-wait`. |
| 08:54 | EAS build `c248fbf5` created — v0.17.9, **versionCode 2**, profile/channel `preview`, runtimeVersion `6c72c486…`. |
| 09:18:32 | Build **FINISHED** — first green build to also clear Play's artifact requirements. |
| 09:20:48 | Auto-submit `d6535feb` **ERRORED** — `SUBMISSION_SERVICE_ANDROID_SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS`. |
| 09:34:45 | Retry `b8284d83` **ERRORED** — same cause (grant still propagating). |
| 09:48:01 | Retry `574bf5fd` **FINISHED** → track `internal`, `releaseStatus: COMPLETED`. **The app is live.** |

Artifact: **32,546,001 bytes (31.04 MiB raw, pre-split)**. Build quota: 7 of ~15 August builds
(submission retries cost none). The public store URL for `zw.co.lynia` returns **404**, consistent
with internal-track-only distribution.

**The precise claim the docs now make:** Channel B (dispatch → EAS build → auto-submit → Play) works
end to end, unattended, and shipped an *update* (vc 2 replacing vc 1) — not merely a first upload.
Channel A (OTA) does not work; see below. Several docs previously implied "the update pipeline"
covered both.

## STALE_DOC — fixed this run

| File | What was wrong |
|---|---|
| `PLAY-STORE-SUBMISSION.md` | No attempt-9 outcome; §8 step 1 still open. Added the go-live block, marked step 1 DONE, fenced off step 4 (OTA), added §8a for the three post-go-live gaps. |
| `LAUNCH-READINESS.md` | LR20 read as founder-blocked on credentials/graphics. Split into store-readiness (**done**) vs crash telemetry (**still not met**) — the gate cannot close on the store half. |
| `LAUNCH-DEPLOYMENT-STRATEGY.md` | §0.5 called the Play pipeline "dormant" and the OTA lane "✅". Corrected both; added the §1a fingerprint caveat where the runtime-versioning claim is made. |
| `LAUNCH-EXECUTION-RUNBOOK.md` | §8c listed arming as founder-pending. Recorded it as armed + proven, added the actual "shipping an update today" procedure, including the trap that a green workflow run means *queued*, not shipped. |
| `docs/README.md`, root `README.md` | Status headers said API-live only. |
| `PILOT-READINESS.md` | "The dev build" was the only route onto a phone. Added the go-live block with the three corrections that change how the rest of the doc reads. |
| `APP-SIZE.md` | Both delivery channels marked "dormant until EAS is armed"; release-AAB row "not yet measured". Now armed/measured, with a first-shipped-artifact section. |
| `GCP-PENDING-REVIEW-2026-07-13.md` | Mobile/EAS row said `EAS_RELEASE_ENABLED` unset. Recorded the two GCP-side resolutions (androidpublisher API enablement; the SA key and its policy-lift) and flagged the key as a long-lived credential already on the rotation schedule. |
| `QA-DEVICE-CHECKLIST.md` | Assumed the QA APK is the only install path, and had no edge-to-edge pass. Added both — see the regression note below. |

## CODE_BUG — ledgered, per the rule that only STALE_DOC gets auto-edited

Both are in `docs/KNOWN_BUGS.md` (OPEN table) and are the reason the OTA lane is now fenced off in
four docs rather than described as working.

- **`REL-01` — a version bump rotates the OTA runtime version.** `@expo/fingerprint` hashes the
  resolved `expoConfig`, and `version` is one of the hashed keys; release-please rewrites it on
  essentially every merge. Verified by controlled A/B with all other inputs held constant:
  `0.17.9` → `c56c13bb…`, `0.17.10` → `1bd7d519…`. An OTA from `main` therefore computes a runtime
  version no installed binary has, and expo-updates ignores it **silently** — CLI exits 0, console
  shows a published update, zero devices receive it. **Not doc-edited and not "fixed":** the repair
  is a runtime-version *policy* choice with three real options, it changes OTA semantics for every
  future binary, and it only takes effect on binaries built after the change. That is a decision to
  make deliberately — ideally before the closed test starts, since during the test every fix
  otherwise costs a full store round-trip.
- **`REL-02` — the OTA workflow published to a channel that does not exist.** Its `branch` input
  defaulted to `production`; the project has exactly one channel and one branch, both `preview`, and
  the live binary was built on `preview`. **Fixed forward this run**, since the fix needs no product
  decision: `mobile-ota.yml` gained a preflight that resolves the target channel and compares the
  computed runtime version against finished builds on it, aborting with an explicit operator message
  instead of publishing into the void. The default input value is left at `production` on purpose —
  it is correct once the production train opens, and the preflight now makes a wrong-phase dispatch
  loud. Verified: run against today's `main`, the preflight correctly refuses.

## Regression review

All CI gates run locally against `main` (`1d0fd13`) — **no regressions**:

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ green (6/6). First run failed with ~40 `Property … does not exist on type 'PrismaService'` errors — an **ungenerated Prisma client**, not a code defect; green after `pnpm --filter @lynia/api prisma:generate`. Worth knowing: a fresh clone typechecks red until that runs. |
| `pnpm test` | ✅ 6/6 tasks — api 97 files / 1540 tests, mobile 112 suites / 784 tests, merchant 26 files, admin 11 files, shared 9 files |
| `pnpm lint` | ✅ green (1 pre-existing warning) |
| `pnpm depcruise` | ✅ 0 errors (5 known-baseline violations) |
| `pnpm contract:check` | ✅ green |
| Open PRs | none |

**Three state findings the green gates cannot see** — recorded where they belong rather than here:

1. **The live build has no crash reporting.** Sentry is unprovisioned and `eas.json` sets
   `SENTRY_DISABLE_AUTO_UPLOAD=true`, so there is neither runtime capture nor a source map for the
   shipped bundle. LR20 is half-met; §8 step 3 explicitly requires Sentry before the staged
   production rollout, and the closed test would otherwise run blind. Highest-value open item.
2. **targetSdk 35 shipped without a device pass.** The API-35 bump was made under build pressure to
   clear a Play rejection. On Android 15 it enables **enforced edge-to-edge** — content is no longer
   inset from the system bars. A CTA hidden behind a navigation bar on the rider job screen is a
   stuck delivery, not a cosmetic bug. Added as a red first-pass section to `QA-DEVICE-CHECKLIST.md`.
3. **Version drift is normal and benign here:** live is v0.17.9, `main` is v0.17.10. Noted only
   because it is the same mechanism as `REL-01`.

## AMBIGUOUS — left alone

`docs/plans/2026-07-26-merchant-verticals-plan.md` records an office-hours decision whose premise is
"Express is pre-launch, awaiting Google Play approval, with zero users". Reaching the internal track
moves that wording without falsifying it — there are still zero real users, and Express is still not
launched. It is a dated, attributed decision record, so it was **not** rewritten; rewriting the
premise of a past decision to match today's state is how a decision log stops being one.
