# PR Health & Delivery Report — 2026-07-14 00:15 UTC

**Summary:** 2 open PRs checked, 5 closed-unmerged reviewed, 5 deploy pipelines checked;
0 failures found, 0 fixed, 1 merged, 0 resurrected, 0 deploys re-run, 0 escalated.

---

## A. Open PRs

| PR | Was | Root cause | Action | Status |
|---|---|---|---|---|
| [#230](https://github.com/unnfazzed/Lynia/pull/230) — docs: reconcile fraud/deep-sweep/GCP/journey-bugs docs with shipped fixes | Draft, all 6 checks green, `mergeable_state: clean`, docs-only | Just never marked ready | Marked ready for review, squash-merged (`74a5260`). | **Merged** |
| [#231](https://github.com/unnfazzed/Lynia/pull/231) — fix: bug-hunt sweep (SOS location/visibility, rider-standing gap, cancel mislabeling, live-tracking Back button) | Draft, all 6 checks green, `mergeable_state: clean` | Just never marked ready — but the PR body itself flags that its rider-standing/active-order commit (`fix(admin): notify the customer + flag ops when a suspended/banned rider is mid-delivery`) was deliberately **left for manual review, not auto-merged**, per the bug-hunt routine's own narrower policy (touches order-lifecycle / rider-standing checks — outside "safe to squash-merge" per CLAUDE.md) | Marked ready for review so it's visible in the review queue. **Did not merge** — honoring the routine's own explicit hold. | **Ready, awaiting human review** (not merged) |

No merge conflicts, no stuck auto-merge, nothing else open.

## B. Closed-unmerged PRs (last 7 days)

Same picture as the 2026-07-13 14:31 report — no new closures since then. The dependabot
"production-dependencies group" self-superseding chain (`#116 → #135 → #155 → #161 → #171`)
remains the only closed-unmerged history in the window; each was closed by dependabot itself
when superseded, and #171 (the last) was closed by dependabot with "these dependencies are no
longer being updated." **Verdict: all superseded, nothing dropped, nothing to resurrect.**

No revert commits found on `main` in the last 7 days. (A commit on this run's own working
branch mentioning "Reverted" — `10185fb`, a temp branch-only diagnostic swap — is not on `main`
and is unrelated.)

## C. Deployments

| Pipeline | Latest relevant run vs latest `main` | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Current (`9d9d116`, the latest non-docs commit) | ✅ Green |
| **Release Please** | Current (`808df80`, latest commit) | ✅ Green |
| **Release (Cloud Run)** (production) | Current (`9d9d116`, the latest non-docs commit) | ✅ Green — **recovered since last report** |
| **Mobile Release (Play)** | n/a | Dormant by design — gated on `EAS_RELEASE_ENABLED` (unset). `total_count: 0`, expected. |
| **Mobile OTA Update (expo-updates)** | n/a | Same as above — dormant by design. |

### Production recovery (informational — already fixed before this run started)

The prior report (14:31 UTC) escalated production releases as blocked on a deliberate
launch-hygiene guard (WhatsApp OTP unarmed). By the time this run started, that had already
been resolved: commit `9d9d116` ("release: add time-boxed pre-launch ack for unarmed WhatsApp
OTP", PR #228) landed on `main`, and a `workflow_dispatch` run of **Release (Cloud Run)** at
2026-07-13 15:51–15:59 UTC passed the launch-hygiene check and completed a full canary
build → migrate → deploy → promote for that commit — all steps green. No action was needed
from this run; verified the deploy actually shipped (not just a config no-op) by inspecting the
job's step list.

Since `9d9d116`, the only commits on `main` (`0f8e49d`, `b56de03`, `8c74ff9`, `808df80`, and
now `74a5260`) are docs-only and correctly skipped by `release.yml`'s `paths-ignore: docs/**,
**.md` — so production is current with all shipped code.

**Merged-but-not-shipped:** none. Every code-bearing commit on `main` has a green production
release; the only unreleased commits since are docs-only and don't need one.

## Needs human

1. **[#231](https://github.com/unnfazzed/Lynia/pull/231)** — green and ready for review, but
   intentionally not merged. Its rider-standing/active-order commit needs a human look per the
   bug-hunt routine's own policy before landing (order-lifecycle-adjacent change). Also carries
   two known follow-ups noted in its own description, not blocking: WhatsApp delivery-status
   webhook gap (OTP send failures are invisible), and unpersisted pickup item-verification ticks.
2. Mobile pipeline (Play + OTA) remains dormant pending EAS provisioning
   (`docs/LAUNCH-EXECUTION-RUNBOOK.md` §8) — founder-only, no CI action needed until then.
   Carried forward as background context only, not a new failure.

No other unresolved items carry forward.
