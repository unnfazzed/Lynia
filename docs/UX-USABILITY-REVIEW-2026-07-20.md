# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-20 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-19.md`. `mcp__github__list_pull_requests` (state=open) returned two
> open Claude PRs — #339 (bug-hunt routine, `claude/vigilant-franklin-5ttorr`, BH-21/BH-22) and #338
> (performance routine, `claude/mobile-app-performance-2tx5qs`) — neither in the UX lane; both branches'
> `docs/KNOWN_BUGS.md` diffs were read against `main` and contain only their own lane's ledger entries, so
> nothing on either sibling branch overlaps this run's UX-lane findings. Phase 0.5 re-verified a rotating
> sample of three "→ FIXED" cluster headers against current code (see below — rotated away from every
> cluster the four 2026-07-19 routines already re-checked that day). Phase 1 ran the mandated agentic-loop
> hunt engine (`Workflow({name: 'lane-bug-hunt'}, args: 'ux')`) — 4 finder lenses → 3-skeptic adversarial
> verify → per-finding sibling-sweep, 20 sub-agents total. Phase 3 independently re-read every cited
> file:line against current code before writing each fix (no fix was written from the hunt's description
> alone).
>
> **Environment note.** Fresh session with no installed dependencies — `pnpm install`, `pnpm exec prisma
> generate` (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
> typecheck`/`pnpm test`/`pnpm build` would resolve `@lynia/shared`/`@prisma/client` imports. Once
> installed, typecheck, lint, build, and the full test suite were clean.
>
> **Model note.** The `Workflow` tool's agent model parameter was not overridden — the hunt (Find/Verify/
> Sibling-sweep, 20 sub-agents) ran on the session's resolved model (Sonnet 5), and the fix stage ran
> directly on the orchestrating session (also Sonnet 5) rather than via separate implementation subagents,
> given the fixes' modest per-file scope (small copy/logic changes, ≤3 files each) once independently
> verified. Per this routine's own model-fallback instruction, both phases are noted here since the
> `Agent`/`Task` tool's `model` parameter was available but not exercised for this run — the `Workflow`
> tool's own default agent path was used instead of separate `fable`/`opus` agent spawns.
>
> **✅ Execution status (2026-07-20).** All 4 distinct findings below are **implemented** on this branch.
> `pnpm typecheck && pnpm lint && pnpm build` clean across all 5 packages; `@lynia/api` 1087/1087 tests
> (+2 new — 1 new `it` in `notifications-feed.service.spec.ts` for UX20-04, plus an existing
> `admin.service.spec.ts` assertion extended for UX20-02), `@lynia/mobile` 473/473 tests unchanged (the
> three mobile fix sites — `home.tsx`, `rider/index.tsx`, `earnings/index.tsx` — are App Router screen
> components with no existing `__tests__` coverage in this repo, matching the established precedent that
> screen-level fixes are typecheck+lint-verified only), `@lynia/admin` has no test harness so its
> empty-state/copy-honesty fixes are `pnpm --filter @lynia/admin typecheck && pnpm --filter @lynia/admin
> lint`-verified only (both clean), matching this repo's established precedent.

---

## 1. Summary — the highest-impact fixes

1. **A failed active-order/active-job check was silently indistinguishable from "you have none" —
   on both the customer home screen and the rider dashboard.** `apps/mobile/app/home.tsx`'s
   `activeOrderQ` and `apps/mobile/app/rider/index.tsx`'s `activeQ` were consumed only via `.data ?? null`
   / `.data && ... : null`, with no `.isError` read anywhere in either file for these two queries — a
   real `ApiError` (non-2xx, or 2 exhausted retries on a timeout/offline fetch) settled the query to
   `isError:true, data:undefined`, which collapsed to the exact same `null` as a genuine "no active
   order/job". A rider with an assigned job, or a customer with a live order, who reopened the app on a
   flaky connection saw the ordinary browse/compose UI with **zero indication the check failed and zero
   way back** to the order/job screen. *(MEDIUM — FIXED, both screens now render a compact
   error-with-retry banner instead of silently falling through to "no active order/job")*
2. **The admin overview's "Commission is 0%" needs-attention row was a hardcoded string that could
   never reflect the real, operator-flippable commission rate.** `buildAttention()` in
   `apps/admin/app/page.tsx` pushed `{title: "Commission is 0%", detail: "launch period — nothing is
   collected yet."}` unconditionally — the `Overview` API response had no rate field at all, so the
   string was structurally incapable of ever changing, even after ops performs the documented "rate
   flip." *(MEDIUM — FIXED: `AdminService.overview()` now resolves and returns the live
   `commissionRatePct` via the same `resolveCommissionRatePct` helper every other rate-aware surface
   uses; the needs-attention row reads it)*
3. **The same hardcoded "0%/launch period" commission narrative was scattered across 4 more sites**
   that never gated on the live rate, even though sibling copy on the SAME screens correctly does: the
   rider Earnings screen's explainer card (`apps/mobile/app/earnings/index.tsx`) kept insisting "0%
   commission... when that goes live... will appear here" directly below `CommissionRow`, which had
   already switched to live-rate "top up" copy; and three more strings on the admin Commission page
   (`apps/admin/app/cash/page.tsx`) sat beside the page's own correctly-live headline/KPI. *(MEDIUM —
   FIXED: all 4 sites now branch on the live rate, mirroring the pattern their own already-correct
   siblings on the same screens already used)*
4. **An admin fare correction had a push but zero durable in-app record.** `AdjustFare()`
   (`apps/api/src/admin/admin-orders.service.ts`) writes an `order.fare_adjust` AuditLog row and
   best-effort pushes both parties, but — unlike every sibling admin action in this exact class
   (`adjudicate_delivered`, `rider_standing_notice`/`resolved`, the `customer.hold`/`lift`/
   `wallet.credit` account rows) — it had no synthesis path in `notifications-feed.service.ts` at all. A
   missed push (backgrounded app, dead FCM token, transient batch failure — all routine here) left
   **zero** trace anywhere that a customer's or rider's fare was corrected by ops. *(MEDIUM — FIXED: a
   new synthesis block recovers a "Fare updated" feed row for both parties from the durable
   `order.fare_adjust` audit, mirroring the existing `order.rider_standing_notice` pattern)*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX20-01 | Customer home + rider dashboard — active order/job restore | Error/empty states | `apps/mobile/app/home.tsx:142` (`activeOrderQ`); `apps/mobile/app/rider/index.tsx:198-199` (`activeQ`) | `const activeOrder = activeOrderQ.data ?? null;` and `activeQ.data && ... ? activeQ.data : null` never read `.isError`. `apiFetch` throws a real `ApiError` on any non-2xx/offline response; `shouldRetry` exhausts after 2 retries, settling `isError:true, data:undefined` — collapsed to the same `null` as "no active order/job." The restore banner (home.tsx's `ActiveOrderBanner`, rider/index.tsx's "You have an active job" card) silently doesn't render. Same file's `meQ.isError` (rider/index.tsx:556) and `openQ.isError` (rider/index.tsx:834) already guard the identical shape — this pair was the gap. | Both screens: a compact error-with-retry banner (`ActiveOrderCheckFailedBanner` / `ActiveJobCheckFailedBanner`) now renders in place of the silent `null` fallthrough whenever the query errors, with a retry button wired to `.refetch()`. | Medium | ✅ Fixed (mobile screen components have no existing unit-test harness in this repo — typecheck+lint verified, matching precedent) |
| UX20-02 | Admin overview — needs-attention queue | Copy-honesty | `apps/admin/app/page.tsx:211-217` (`buildAttention`); `apps/api/src/admin/admin.service.ts` (`overview()`) | `buildAttention()` unconditionally pushed `{title: "Commission is 0%", detail: "launch period — nothing is collected yet."}` — the `Overview` interface/API response had no rate field, so the string could never vary even after the documented rate flip (`COMMISSION_RATE_PCT`), directly contradicting the sibling `/cash` page one click away. | `AdminService.overview()` now returns `commissionRatePct` (resolved via `resolveCommissionRatePct(env.COMMISSION_RATE_PCT)`, the same helper every other rate-aware surface already uses); `buildAttention()` branches on it — live-rate copy once flipped, the honest launch-period copy at 0%. | Medium | ✅ Fixed (`@lynia/api` — `admin.service.spec.ts` extended with a live-rate assertion) |
| UX20-03 | Rider Earnings screen + admin Commission page — commission-launch narrative | Copy-honesty | `apps/mobile/app/earnings/index.tsx:148-155` (explainer card); `apps/admin/app/cash/page.tsx:78-80,87,117-119` (banner/KPI-hint/footer) | The Earnings screen's highlight-wash explainer card unconditionally read "...0% commission for the first few months... When that goes live... will appear here" — rendered directly below `CommissionRow`, which already correctly swaps to live "top up to keep riding" copy once `config.ratePct > 0`. The admin Commission page's headline/KPI already correctly read the live rate, but 3 other strings on the SAME page ("...informational ride volume at 0%, not money owed", "riders keep this at 0%", "...only the rate itself is still 0%") never gated on it. | Earnings screen: the explainer card now branches on `useWalletConfig().config.ratePct > 0`. Cash page: all 3 strings now branch on a `rateIsZero` flag derived from `view.ratePct`. | Medium | ✅ Fixed (mobile: typecheck+lint verified per precedent; admin: no test harness, typecheck+lint verified) |
| UX20-04 | Admin fare-correction notification | Notification-coherence | `apps/api/src/admin/admin-orders.service.ts:374-401` (`adjustFare`); `apps/api/src/notifications/notifications-feed.service.ts` | `adjustFare` writes an `order.fare_adjust` AuditLog row (targeted at `orderId`, not a profileId — so it can't match `ACCOUNT_FEED_ACTIONS`) and best-effort pushes both parties, but writes no `OrderEvent` and had no bespoke synthesis block — unlike every sibling in this exact class (`order.adjudicate_delivered`, `order.rider_standing_notice`/`_resolved`, the four `ACCOUNT_FEED_COPY` entries). A missed push left zero durable record for either party that their fare was corrected. | A new synthesis block in `feedForUser` recovers a "Fare updated" row for BOTH parties from the durable `order.fare_adjust` audit (one batched query over `orderIds`, scoped to all in-view orders since `adjustFare` notifies both sides), mirroring the existing `order.rider_standing_notice` pattern; copy quotes the corrected fare, matching the push. | Medium | ✅ Fixed (`@lynia/api` — 1 new test in `notifications-feed.service.spec.ts`) |

---

## 3. Phase 0.5 — cluster-claim re-verification

All 9 "→ FIXED/MOOT" cluster headers were re-checked by SOME routine on 2026-07-19 (four routines ran
that day). Rotated to the three headers the most recent same-lane (UX) run did NOT pick — 2026-07-19 UX
picked KYC / Object-authz-IDOR / Mobile-journey-dead-ends — landing on **Auth/identity**,
**Notifications/FCM**, and **Edge/abuse**. Two members each, re-opened against current code:

- **Auth/identity cluster:** JWT HS256 algorithm pin — `apps/api/src/auth/token.service.ts:50,53`,
  `jwt.verify(token, this.secret, { algorithms: ["HS256"] })` (present on both the primary and
  previous-secret rotation paths) — and the JWT-secret boot guard —
  `apps/api/src/adapters/secrets/env.secrets.ts:13`, `if (!value) throw new Error(\`Missing required
  secret: ${name}\`)` — both confirmed present.
- **Notifications/FCM cluster:** dead-token pruning —
  `apps/api/src/notifications/notifications.service.ts:78,368-370`, two `deviceToken.deleteMany` call
  sites (single-token unregister + batched `invalidToken` prune) — confirmed present.
- **Edge/abuse cluster:** the global `ThrottlerGuard`/`@Throttle` wiring (19 files under `apps/api/src`,
  incl. `common/throttle.guard.ts` + `app.module.ts`) and the dependency-free Helmet-equivalent security
  headers middleware — `apps/api/src/common/security-headers.middleware.ts:12-28` (HSTS,
  X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin-Resource-Policy,
  Permissions-Policy) — both confirmed present.

6/6 sampled members intact. No fresh findings from this pass.

---

## 4. Sibling-sweep

**UX20-01 (query-error-as-negative-state).**

```
grep -rn "\.data ?? null" apps/mobile apps/admin --include=*.tsx --include=*.ts
grep -rn "Q\.data &&" apps/mobile apps/admin --include=*.tsx --include=*.ts
grep -rn "\.data ??" apps/mobile apps/admin --include=*.tsx --include=*.ts
```

8 hits total. Two ARE the confirmed bug (`home.tsx:142`, `rider/index.tsx:198-199`, now fixed). The other
six were individually re-opened and confirmed already-guarded elsewhere in the same file:
- `apps/mobile/app/rider/job.tsx:169` (`jobQ.data ?? null`) — `jobQ.isError` is explicitly branched via
  `shouldShowJobError(jobQ.isError, order != null)` at line 731, with a retry button. Not a gap.
- `apps/mobile/app/order/[id].tsx:399` (`offersQ.data ?? []`) — `offersQ.isError` explicitly branched via
  `shouldShowOffersError(...)` at line 869, with a retry button. Not a gap.
- `apps/mobile/app/notifications/index.tsx:78,82` (`feedQ.data ?? []`) — `feedQ.isError` explicitly
  branched at line 74, with a retry button. Not a gap.
- `apps/mobile/app/rider/index.tsx:435` (`openQ.data ?? []`) — `openQ.isError` explicitly branched at
  line 834, with a retry button. Not a gap (this is the board query the original finding's description
  itself cited as evidence the team otherwise treats this class carefully).
- `apps/mobile/src/query/use-history-feed.ts:81` (`q.data ?? cached`) — the hook separately returns
  `isError`, which its two screen consumers (Earnings, Trip History) already branch on.

**A secondary, lower-severity instance was evaluated and left unfixed as a non-dead-end, not silently
dropped:** `apps/mobile/app/home.tsx:124`, `const accountOnHold = heldFromBroadcast ||
meQ.data?.onHold === true;` never reads `meQ.isError` either — same general shape (a query error read as
the negative/safe case), but the CONSEQUENCE differs: a customer on hold whose `meQ` errors merely fails
to see the proactive block screen early, not a dead end — `onBroadcast`'s existing reactive catch
(`home.tsx:502-506`, `isAccountOnHold(e)` on the server's 403) still catches and blocks them the moment
they actually attempt to broadcast. Left unfixed; not logged as a KNOWN_BUGS.md OPEN row since it isn't a
defect (evaluated exactly like UX19-03 left `completed`-status feed routing unfixed as a non-bug after
evaluation).

**UX20-02/UX20-03 (hardcoded 0%/launch-period commission copy).**

```
grep -rn "0% commission\|When that goes live\|first few months\|still 0%\|no commission yet\|not money owed\|nothing is collected" --include="*.tsx" --include="*.ts" apps packages/shared
grep -rn "Commission is 0%" --include="*.ts" --include="*.tsx" .
```

Pre-fix: 8 live-code hits across `apps/admin/app/page.tsx` (1), `apps/admin/app/cash/page.tsx` (3),
`apps/mobile/app/earnings/index.tsx` (2, one already correctly gated in `CommissionRow`, one not).
Post-fix: 0 remaining ungated hits — every hit that was live user-facing copy now branches on the live
rate; the only surviving occurrences are internal JSDoc/comments (`cash/page.tsx:12,19`,
`adminTypes.ts:137`, `settlements.service.ts:56`, `env.ts:224-225`) — verified by reading each, none is
rendered to a user.

**UX20-04 (admin action audit-targeted-at-orderId with no feed synthesis).**

```
grep -n "auditData(actor" apps/api/src/admin/*.ts
```

9 hits across `order.cancel`, `order.adjudicate_delivered`, `order.fare_adjust`,
`customer.hold`/`customer.lift`, `rider.suspend`/`rider.lift`/`rider.ban`/`rider.clear_hold`. Disposition
of each:
- `order.fare_adjust` — THE CONFIRMED BUG, fixed this run.
- `order.adjudicate_delivered` — already has a bespoke synthesis block
  (`notifications-feed.service.ts:180-195,258-271`, confirmed present by reading it).
- `order.cancel` — NOT a sibling gap: `cancelOrder` writes a plain `OrderEvent{status:"cancelled"}` in
  the same transaction (`admin-orders.service.ts:157`), so it's already covered by the standard
  `FEED_NOTICES.cancelled` per-event synthesis every cancel gets (admin or otherwise) — verified by
  reading the transaction.
- `customer.hold`/`customer.lift`, `rider.suspend`/`rider.lift`/`rider.ban`/`rider.clear_hold` — all
  present in `ACCOUNT_FEED_COPY` (`notifications-feed.service.ts:79-93`), confirmed present.

**Result: every sibling identified was fixed this run (or explicitly evaluated and left as a non-bug with
reasoning recorded above). No new ledger OPEN rows.**

---

## 5. Notes on scope and process

- The hunt (`Workflow` lane `"ux"`) ran 4 finder lenses (error-empty-states, copy-honesty,
  recoverability, notification-coherence) → 3-skeptic adversarial verify per candidate → a repo-wide
  sibling-sweep per survivor. 4 candidates found, all 4 survived verification (12/12 "real" votes across
  the three-skeptic panels, all "high" confidence); 1 of 4 lenses (recoverability) returned zero
  findings.
- Every file:line cited by the hunt was independently re-opened and re-read by the orchestrating session
  before writing each fix — the evidence quoted in the findings table above was taken from that
  independent read, not from the hunt's own description. UX20-02 and UX20-03 share the same defect class
  (hardcoded launch-era commission copy) discovered independently by two different finder lenses
  (copy-honesty found both the admin-overview row and, separately via its own sibling-sweep, flagged the
  earnings-screen card and cash-page strings as vulnerable siblings of each other) — kept as two ledger
  rows since they're on different screens/services with independently-verified evidence, but fixed
  together in one coherent commission-copy pass.
- `AdminService.overview()` gained a constructor dependency on `ENV` (`@Inject(ENV)`) to resolve the live
  commission rate — `ConfigModule` is `@Global()`, so no module-wiring change was needed beyond the
  constructor injection itself; `admin.service.spec.ts`'s three `new AdminService(prisma, ...)` call
  sites were updated to pass an env stub.
- This was a fresh session with no installed dependencies. `pnpm install`, `pnpm exec prisma generate`
  (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
  typecheck`/`pnpm lint`/`pnpm build`/`pnpm test` could resolve `@lynia/shared` and `@prisma/client`
  imports across the monorepo — done once, up front, before any fix work.

## 6. Needs-human-confirmation

None this pass — every finding was verified directly against current code with quoted evidence before
being fixed.

## 7. Deferred / not fixed

None. All 4 findings from this pass were fixed in this run, along with every sibling the sweep found. One
adjacent same-shape-different-consequence instance (`home.tsx:124` `meQ.data?.onHold`) was evaluated and
left as a non-bug — see the sibling-sweep section above for the reasoning (a reactive server-side 403
backstop already closes the gap this instance would otherwise open).
