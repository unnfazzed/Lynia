# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-16 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience/data-frugality, copy/notifications/trust) against **current source**, each told to read
> `docs/KNOWN_BUGS.md`, `docs/UX-USABILITY-REVIEW-2026-07-15.md`, `docs/UX-USABILITY-REVIEW-2026-07-14.md`,
> and `docs/BUG-HUNT-2026-07-15.md` first and not re-flag anything already found or fixed. **Model note:**
> the routine's model policy asks for Fable-5 research subagents; the initial Fable-5 launch of all four
> research agents hit the session's Fable-5 rate limit (`"You've reached your Fable 5 limit"`) before doing
> any work, on the first attempt. Per this routine's own model-fallback instruction ("never abort the run
> over model availability"), all four were relaunched on the session model — the rest of this run,
> including all fixes, was executed on the session model throughout (Sonnet 5), not Fable/Opus. This
> mirrors the same fallback the 2026-07-15 UX pass hit.
>
> Two findings (the rider-journey and copy/notification-coherence audits) independently converged on the
> same root cause — stale "Lynia" (not "LyniaGo") brand copy on the rider wallet screen — deduplicated to
> one finding below, since independent convergence is a stronger signal than either alone.
>
> **✅ Execution status (2026-07-16).** All 8 distinct findings below are **implemented** on this branch
> (`pnpm typecheck && pnpm lint && pnpm test` clean across all packages — API 916/916 tests [+11], mobile
> 401/401 tests [+18], admin lint+typecheck clean). Zero findings deferred.

---

## 1. Summary — the highest-impact fixes

1. **A rider top-up (self-serve mobile-money) could lose all UI state to an app kill, with no way to tell
   whether the money moved.** The top-up "wait" step sends the rider OUT to another app (SMS/USSD/
   mobile-money) to approve the rail prompt — the exact moment a low-end Android device is most likely to
   reclaim/kill a backgrounded process — but `topup`/`step` in `top-up.tsx` were plain, unpersisted
   component state, and `session.ts` had no durable marker for it (unlike every other completion-journey
   in-flight action: delivery-code rotation, confirm-items, ratings, rider job terminals). A rider who
   backgrounded to approve and came back to a killed app had to manually watch the balance to infer the
   outcome, with no push either way. *(MEDIUM — FIXED, durable marker + wallet-screen reconciliation)*
2. **The "raise price & send again" / "send it again" / "Send again" reorder paths across the app silently
   dropped the customer's note for the rider** ("call 077… if the gate's locked", "handle with care") —
   even though the server's OWN automatic rider-bail rebroadcast preserves the note byte-for-byte. The
   compose form's note field simply rendered blank on every reorder, contradicting the screen's own promise
   ("same price… no need to start over"). *(MEDIUM — FIXED end to end, incl. Trip History)*
3. **The commission-low-balance online-gate's own copy and doc comment promised a one-tap top-up deep-link
   that didn't exist.** A rider blocked from going online for a low prepaid balance saw "top up your
   prepaid balance and you're straight back on" — but the only button on that screen was "Refresh status",
   re-showing the identical wall. Currently dormant (commission is 0% at launch) but the code path is live
   and, per this codebase's own precedent (BH-09), worth fixing now rather than waiting for the flip.
   *(MEDIUM, dormant — FIXED)*
4. **The SOS admin console — the most safety-critical operator surface — misclassified every acknowledge
   failure as a dev/infra config problem** ("check API_BASE_URL / admin token"), regardless of whether the
   real cause was an expired session, a stale row, or a genuine server error. An operator mid-SOS-triage
   deserves an accurate diagnosis, not misdirection toward an environment variable they can't fix from the
   console. *(MEDIUM — FIXED, classified by actual failure reason)*
5. **Admin's "Flag account" modal was the one false-consequence-copy bug the 2026-07-15 pass's "Ban
   customer" fix didn't reach**, claiming "new reports escalate to a ban decision" — a review queue and
   escalation trigger that don't exist (confirmed: no backing model, no handling code anywhere). Same bug
   class as UX15-07, same page, missed because the fix only covered the sibling modal.
   *(MEDIUM — FIXED, same pattern as UX15-07)*
6. **A resolved "get help with this trip" issue had only a best-effort push and no durable fallback** —
   unlike every other push type in the app (KB-FEED-SYNTH already closed this exact gap for offers and
   account-status changes). Since the order is typically long-completed and off-screen by resolution time,
   the opener has likely backgrounded/force-quit by then, and a missed push left zero trace anywhere that
   their report was ever resolved. *(MEDIUM — FIXED, feed row mirrors the push copy)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX16-01 | Rider wallet top-up (self-serve mobile-money) | Resilience, unwarned ambiguous state | `apps/mobile/app/wallet/top-up.tsx:29-41` (`topup`/`step` plain `useState`), `apps/mobile/src/auth/session.ts` (no marker existed), `apps/mobile/app/wallet/index.tsx` (no reconciliation surface) | App killed while backgrounded to approve the rail prompt loses all UI state — no way to tell if the top-up landed short of manually watching the balance; an immediate retry after relaunch could open a second, independent top-up. | Durable `PendingTopup` marker (`session.ts`, mirrors `pendingRating`/`RiderJobTerminal`) saved the instant `createTopup` resolves; a new pure `reconcilePendingTopup` (`src/logic/topup.ts`) plus a wallet-screen mount-time effect resolves it against the server's own `getTopup` — success invalidates the balance/ledger and shows a confirmation banner, decline/expiry clears the marker with honest copy, still-pending keeps it and tells the rider to check their phone. Cleared on sign-out (`clearDeviceState`). | Medium | ✅ Fixed (3 new unit tests) |
| UX16-02 | Customer reorder / "raise price & send again" / Trip History "Send again" | Trust, silent data loss | `apps/mobile/app/order/[id].tsx:679-687`, `apps/mobile/app/history/index.tsx:83`, `apps/mobile/src/logic/order-draft.ts:93-116,141-145` (`buildRebroadcastParams`/`draftFromParams` had no `note` field at all) | Every re-send/reorder path silently dropped the sender's note for the rider, contradicting the UI's own "same price… no need to start over" promise; the server's own automatic rider-bail rebroadcast preserves the note verbatim, so this was an inconsistency, not a deliberate scope cut. | Added `note`/`rbNote` end to end: `RebroadcastParams`, `buildRebroadcastParams`, `draftFromParams` (mobile), plus both call sites (order screen + Trip History). Trip History's fix required also surfacing `note` on the history API response (`orders.service.ts` `historyForUser` + mobile `OrderHistoryRow`) since it never carried it before — additive, no schema/contract-shape change. | Medium | ✅ Fixed (4 new unit tests) |
| UX16-03 | Rider online-gate — commission-low-balance | Dead-end CTA, promise vs. behavior | `apps/mobile/app/rider/index.tsx:686-701`, `apps/mobile/src/logic/gates.ts:119-125` (doc comment claims a top-up deep-link the render block never had) | `ONLINE_GATE_COPY.commission_low_balance` promises "top up your prepaid balance and you're straight back on," but the only button rendered was "Refresh status" — re-showing the identical wall. Dormant today (commission is 0% at launch) but the live/reachable code path. | Added a `gate === "commission_low_balance"` branch rendering a `Button` that routes straight to `/wallet/top-up`, matching the copy's own promise. | Medium (dormant) | ✅ Fixed |
| UX16-04 | Admin SOS console — Acknowledge | Ops trust, misclassified error | `apps/admin/app/sos/actions.ts:16-23` | Any acknowledge failure — an expired admin session (401/403), a stale row (404-adjacent), or a genuine server error — was shown as "check API_BASE_URL / admin token," dev/infra diagnosis text, regardless of the real cause, on the highest-stakes operator screen in the console. | Classified by `res.reason`/`res.status`: `unreachable` → "Couldn't reach the server"; 401/403 → "Your session may have expired — reload the page"; other HTTP → "The server rejected this (HTTP {status})…". Dropped the config-diagnosis hint from operator-facing text. | Medium | ✅ Fixed |
| UX16-05 | Admin customer actions — "Flag account…" | Ops trust, false-consequence copy | `apps/admin/app/customers/[id]/page.tsx:189-201` | Claimed "A flag marks the account for review... new reports escalate to a ban decision" — no backing model exists for either (confirmed: `AdminCustomersService.toCustomer` only ever returns `status: "on_hold" \| "active"`, zero `customer.flag` handling anywhere). Same bug class UX15-07 fixed for the adjacent "Ban customer" modal on the SAME page, missed because that fix only covered its sibling. | Applied the identical UX15-07 fix pattern: states this only logs a decision for the record, does not put the account under review or trigger any ban-escalation, and points to the real Hold action for enforcement. | Medium | ✅ Fixed |
| UX16-06 | "Get help with this trip" issue resolution — feed fallback | Notification-story gap | `apps/api/src/notifications/notifications.service.ts` `notifyIssueResolved` (push-only) vs. `feedForUser` (no issue-resolution synthesis) | The push-only `notifyIssueResolved` (UX15-05) has no durable fallback if missed — by resolution time the order is typically long-completed and off-screen, so the opener has likely backgrounded/force-quit, the exact scenario KB-FEED-SYNTH already closed for offers and account-status pushes. | New resolved-issue feed-row synthesis in `feedForUser`, querying `Issue` (`openedByProfileId`, `status: "resolved"`) and mirroring `notifyIssueResolved`'s push copy per resolution (`refund`/`rider_strike`/`close_no_action`), not scoped to the order-lookback window since a resolution can land long after the order ages out of it. | Medium | ✅ Fixed (2 new unit tests) |
| UX16-07 | Rider wallet screen — stale brand | Copy, brand consistency | `apps/mobile/app/wallet/index.tsx:141-142` (the "Honest-copy card") | The one honest-copy card riders read to understand how their money is handled still said "Lynia" instead of the shipped app name "LyniaGo" — the 2026-07-14 brand sweep and 2026-07-15's UX15-06 both missed this file. Since commission is 0% today, the ELSE branch ("Lynia doesn't take a commission yet…") is the one actually shown to every rider on a frequently-opened screen. | Both strings corrected to "LyniaGo". | Low | ✅ Fixed |
| UX16-08 | Rider wallet top-up — "Cancel request" | Trust, dormant double-credit vector | `apps/mobile/app/wallet/top-up.tsx:115-120,238` (`reset()` unconditionally rotated `idempotencyKey`); `apps/api/src/wallet/wallet.service.ts:287-312` (`createTopup` — no cancel/void path; `creditFromTopup` has zero callers today) | "Cancel request" reads as voiding the attempt, but only resets local UI state — the server-side `TopUp` row stays `pending` for the rest of its 90s window and the already-pushed rail prompt isn't recalled. An immediate resend minted a NEW `idempotencyKey`, opening a second, independent pending top-up rather than deduping against the abandoned one (BH-09's dedup only covers a same-key retry). Dormant today — no live payment rail confirmation is wired yet (`creditFromTopup` has no callers) — but once it ships, both outstanding phone prompts could be approved within the 90s window. | Minimal fix: `reset()` now only rotates the idempotency key when NOT cancelling a still-live (`step === "wait"`) top-up — "Try again" from a genuinely terminal state (timeout/declined) still gets a fresh key, exactly as BH-09 intended. An immediate resend after Cancel now dedupes against the abandoned intent via the existing server-side replay instead of minting a second one. | Low-Medium (dormant) | ✅ Fixed |

---

## 3. Notes on scope and process

- All four research agents independently re-verified a spot-check of prior-sweep fixes as intact before
  hunting for new findings (durable-marker precedents, rider-viewer gating, zod-validation honesty, push
  routing, GPS throttling, socket resubscribe-on-reconnect, data-frugality caps). Nothing there was
  re-flagged.
- Two convergent findings (rider-journey and copy/notification-coherence audits, both landing on the
  rider wallet screen's stale "Lynia" brand copy) are deduplicated to UX16-07 above, since independent
  convergence across audit angles is a stronger signal than a single-source finding.
- Every fix was implemented directly against the four audits' verified evidence (file:line + verbatim
  snippet, re-confirmed against current code before editing — not re-derived from the audit summaries
  alone), not re-derived from memory of the reports.
- Per this repo's standing instruction for this routine (`CLAUDE.md` / `docs/ROUTINES.md`), this pass's PR
  is marked ready for review and auto-merge is requested once CI confirms the same green result
  independently — it is not left in draft awaiting manual review.

## 4. Deferred / not fixed

None. All 8 distinct findings from this pass were fixed in this run, each with a regression test where
testable (pure copy/routing changes are covered by `pnpm typecheck` + the existing suites, per the
routine's own evidence rules).

## 5. Needs-human-confirmation

None this pass — every finding above was verified directly against current code with quoted evidence
before being fixed.
