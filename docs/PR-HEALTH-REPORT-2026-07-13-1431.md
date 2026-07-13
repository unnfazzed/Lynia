# PR Health & Delivery Report — 2026-07-13 14:31 UTC

**Summary:** 2 open PRs checked, 5 closed-unmerged reviewed, 5 deploy pipelines checked;
2 failures found, 2 fixed, 2 merged, 0 resurrected, 0 deploys re-run, 1 escalated.

---

## A. Open PRs

| PR | Was | Root cause | Action | Status |
|---|---|---|---|---|
| [#132](https://github.com/unnfazzed/Lynia/pull/132) — bump `android-actions/setup-android` 3→4 | Green CI, `mergeable_state: blocked` | No approving review; branch protection requires one and dependabot PRs get none automatically | Submitted an approving review (trivial 1-line GH Actions version bump, all 5 checks green: CodeQL, dependency audit, prisma migrate, typecheck/build/test, analyze). Auto-merge picked it up immediately on approval. | **Merged** (`faf89cd`) |
| [#226](https://github.com/unnfazzed/Lynia/pull/226) — docs: WhatsApp Cloud API setup status & runbook | Draft, all 6 checks green, `mergeable_state: clean` | Just never marked ready | Marked ready for review, squash-merged (docs-only, no code/test surface). | **Merged** (`e5650e2`) |

No merge conflicts, no stuck auto-merge, nothing else open.

## B. Closed-unmerged PRs (last 7 days)

Five dependabot "production-dependencies group" PRs form one self-superseding chain:
`#116 → #135 → #155 → #161 → #171`. Each was closed by dependabot itself when the next
one in the group was opened; #171 (the last) was closed by dependabot with the comment
*"Looks like these dependencies are no longer being updated by Dependabot, so this is no
longer needed."* — i.e. dependabot decided the group had no more pending updates.

**Verdict: all superseded, nothing dropped, nothing to resurrect.**

No revert commits found on `main` in the last 7 days.

## C. Deployments

| Pipeline | Latest run vs latest `main` | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Current | ✅ Green on every recent push, including the two merges from this run |
| **Release Please** | Current | ✅ Green (release-please PR chain is not stuck; last "chore(main): release 0.2.0" merged cleanly) |
| **Release (Cloud Run)** (production) | Current | 🔴 **Failing since commit `ce512da` (~11:30 UTC today) — see below** |
| **Mobile Release (Play)** | n/a | Dormant by design — gated on repo var `EAS_RELEASE_ENABLED` (unset); EAS project not yet provisioned. `total_count: 0` runs, expected. |
| **Mobile OTA Update (expo-updates)** | n/a | Same as above — dormant by design, same gate. |

### 🔴 Release (Cloud Run) — production deploys blocked (escalated, not fixed)

Every production release since `ce512da` (11 consecutive attempts, 14 pushes affected)
fails in the "Validate production launch-hygiene config" step of `release.yml`, before
any deploy happens:

```
::error::OTP_CHANNEL=whatsapp (the default) but WHATSAPP_ENABLED != true — no WhatsApp
credentials are injected, so every production sign-in OTP would 503. Arm WhatsApp
(WHATSAPP_ENABLED=true + WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEMPLATE_NAME repo Variables
+ WHATSAPP_ACCESS_TOKEN secret) or set OTP_CHANNEL=sms.
```

**This is not a bug.** It's a guard added deliberately earlier today
(`docs/GCP-PENDING-REVIEW-2026-07-13.md` §8a) specifically to stop production from
shipping with OTP silently broken — exactly what happened twice before (2026-07-08 and
2026-07-13, per that doc). The doc says explicitly: *"once this merges, production
releases are BLOCKED until the founder sets those two repo Variables — that is
intentional."*

The blocker for actually arming it is external: PR #226 (merged this run) documents that
WhatsApp AUTHENTICATION-template creation is gated on Meta business verification,
submitted 2026-07-13, currently under review — the `WHATSAPP_PHONE_NUMBER_ID` /
`WHATSAPP_TEMPLATE_NAME` values can't be finalized until that clears (or `OTP_CHANNEL`
is deliberately switched to `sms` as an interim channel).

**I did not weaken or bypass the guard, and did not re-run the workflow** — re-running
without the underlying repo Variables set would just reproduce the same failure, and
loosening the check would reintroduce the exact outage it exists to prevent.

**Merged-but-not-shipped:** 11 merged PRs (#213, #214, #215, #216, #217, #218, #219,
#221, #223, #224, #225 — including RH-01 fraud-hold fix, DS13-05 SOS ops panel, GCP
drift detection, and this run's #132/#226) are sitting on `main` unreleased to
production. All merged within the last ~3 hours, so none has crossed the 48h
"merged-but-not-shipped" threshold yet — but the pipeline is fully stuck, so this list
will grow every hour until a founder acts.

## Needs human

1. **Arm production WhatsApp OTP** (blocks all production releases): once Meta business
   verification clears, set the `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TEMPLATE_NAME`
   repo Variables (Settings → Variables), then re-run **Release (Cloud Run)** — or approve
   whichever release PR/commit is current at that point. Interim alternative: switch
   `OTP_CHANNEL` to `sms` if a founder wants production unblocked sooner (requires its own
   provider setup — out of scope for this run). This is a GitHub repo Settings action +
   external Meta approval; not something this run can do or work around safely.
2. **Mobile pipeline (Play + OTA)** remains dormant pending EAS provisioning
   (`docs/LAUNCH-EXECUTION-RUNBOOK.md` §8) — founder-only, no CI action needed until then.
   Carried forward as background context only, not a new failure.

No other unresolved items carry forward.
