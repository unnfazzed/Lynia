# Deep bug sweep — 2026-07-16

Orthogonal sweep run against latest `main`, inheriting the full history consolidated in
`docs/KNOWN_BUGS.md`. **Phase-0 spot-check re-verified 6/6 sampled prior fixes still intact in code** —
F-06 (spoofable admin-actor header stripped, `apps/admin/middleware.ts`), DS15-01 (baseline `error`
listener on every `createRedisClient()` client, `apps/api/src/common/redis.ts`), DS15-02 (self-erase
standing gate, `privacy.service.ts` `eraseAccount`), DS15-06 (KYC vendor-webhook mutation + audit share
one `$transaction`, `rider.service.ts` `applyKycResult`), DS-03/DS13-04 (admin standing/order-mutation
CAS `updateMany` guards, `admin-orders.service.ts` / `admin-riders.service.ts`), and the R8
collected-cancel hand-back surfacing (`orders.service.ts` `activeForRider`). **0/6 regressed.**

**Model note:** per this routine's Fable-plans/Opus-executes split, all discovery subagents were
dispatched with `model: fable`, but every one hit the session's Fable-5 rate limit and terminated
before doing any work. Per the routine's own fallback instructions ("if the Agent/Task tool or a model
override is unavailable, proceed on the session model and note it in the report — never abort"), all
were re-dispatched immediately on the session's default model and completed normally (same as the
2026-07-15 sweep).

This sweep ran four orthogonal passes, all cross-checked against `docs/KNOWN_BUGS.md` first:
1. **Phase 0 — spot-check of prior fixes.** Sampled 6 representative fixes across the auth, Redis,
   privacy/erasure, KYC-audit, admin-CAS, and order-lifecycle areas — all still intact, no regressions.
2. **Phase 1 — never-audited-areas sweep.** Walked surfaces the coverage map still flags as lightly
   touched, plus the admin write surfaces. Surfaced DS16-01 (HIGH): the generic free-text
   `/admin/audit-actions` fallback collides with the reserved action strings that real domain endpoints
   own, and six of those are trusted verbatim by the account-status feed synthesis.
3. **Phase 1 — pattern-propagation / mechanism-audit sweep.** Traced the "audit action string is a
   contract, not free text" mechanism across every writer and reader (`AuditLog.action`), and re-walked
   the cold-start/restore snapshot queries. Surfaced DS16-02 (LOW): the R8 hand-back query's newest-first
   ordering can starve an older stuck parcel indefinitely when a rider has two missed-push cancellations
   inside the lookback window.
4. **Phase 3 — adversarial API pass.** Re-attacked price manipulation, IDOR/party-gate, replay,
   standing-control bypass, and erasure vectors. **Zero new gaps** — every vector traced to an existing,
   correctly-applied control (the party-gated `getSnapshot`, the CAS/standing guards, the DS15-02 erasure
   standing gate). The stopping rule would apply to Phase 3 in isolation, but Phase 1 found one HIGH, so
   both findings were carried to fix.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: high / medium / low.

**One HIGH finding this sweep** (plus one LOW). Both findings below were fixed in this same run, each
with a regression test; no deferrals.

---

## New findings

### DS16-01 — `/admin/audit-actions` lets an admin forge account-status feed notifications and pollute the compliance trail  ·  HIGH  ·  confidence high

**Where:** `apps/api/src/admin/admin.controller.ts` (the `AuditAction` zod schema + `auditAction()`
route), `apps/api/src/admin/admin-audit.service.ts` (`recordAuditAction`).

**What:** `POST /admin/audit-actions` is the generic fallback audit-annotation path — per its own
docstring, it exists only for console actions that have no dedicated domain endpoint. Its zod schema
accepts ANY `action` string of 1–80 chars (deliberately capped-not-enum-bound so the reason-code
taxonomy can evolve), no denylist, and `recordAuditAction` wrote it verbatim into `AuditLog`. But 13 real
domain-mutation endpoints — which each write their mutation and audit row atomically in their OWN
`$transaction` — use specific reserved action-string literals that collide with this free-text path:
`rider.suspend`, `rider.lift`, `rider.ban`, `rider.clear_hold` (`admin-riders.service.ts`),
`rider.kyc_approve`, `rider.kyc_decline` (`rider.service.ts`), `customer.hold`, `customer.lift`
(`admin-customers.service.ts`), `order.cancel`, `order.fare_adjust` (`admin-orders.service.ts`),
`issue.resolve` (`issues.service.ts`), `sos.acknowledge` (`sos.service.ts`), `wallet.credit`
(`wallet.service.ts`).

Worse, six of these (`rider.kyc_approve/decline`, `rider.suspend/ban/lift/clear_hold` — the
`ACCOUNT_FEED_COPY` map in `notifications.service.ts`) are read back by `feedForUser`'s account-status
feed synthesis, which trusts `AuditLog.action` membership alone with NO correlation to whether a real
mutation actually happened.

**Repro:** an authenticated admin-token holder calls `POST /admin/audit-actions` with
`{"action":"rider.ban","target":"<any profileId>"}`. The victim's next feed load shows "Account
blocked — contact support" even though `Rider.accountStatus` was never touched. Conversely, the same
path fakes "Account restored" / "You're verified" (`rider.lift` / `rider.kyc_approve`) for a rider who
is actually still banned or unverified. Every forged row is also written permanently into the compliance
audit trail, indistinguishable from a real transactional entry.

**Why past sweeps missed it:** the generic `/admin/audit-actions` endpoint (A-01) predates several of
the later domain endpoints that reused overlapping action strings (the A-04 rider state machine, the
KYC-decision audit path, the KB-FEED-SYNTH feed synthesis that made those strings feed-load-bearing). No
prior sweep cross-checked the reserved-string collision between the generic write path and the domain
endpoints — each surface was audited in isolation, and the feed-synthesis sweeps (KB-FEED-SYNTH) only
hardened the READ side.

**Fix (conservative, minimal, write-side only):** a new exported constant
`RESERVED_AUDIT_ACTIONS: ReadonlySet<string>` (`admin-audit.service.ts`) enumerates all 13 reserved
strings (the full set, not just the 6 feed ones — all are real transactional audit actions this generic
endpoint must not impersonate). `recordAuditAction` now throws a `BadRequestException` ("This action is
managed by its own endpoint and cannot be recorded here.") for any reserved action BEFORE the
`create`, so it surfaces as a clean 400. The real domain endpoints keep their exact strings unmodified,
and `feedForUser` / `ACCOUNT_FEED_COPY` are untouched — the fix closes the forgery path entirely on the
write side. Regression test: `apps/api/src/admin/admin-audit.service.spec.ts` (asserts `rider.ban` and
several other reserved strings reject without writing a row, while a genuinely free-text action still
persists unaffected; the pre-existing "persists a row" test was migrated off its now-reserved
`rider.suspend` example onto a free-text `order.nudge_rider`).

---

### DS16-02 — `activeForRider`'s hand-back query can hide an older stuck parcel behind a newer one  ·  LOW  ·  confidence high

**Where:** `apps/api/src/orders/orders.service.ts` (the R8 hand-back `findFirst` inside
`activeForRider`).

**What:** the hand-back query surfaces a recently-cancelled order the rider had already COLLECTED but
whose `job:cancelled` push was missed while the app was backgrounded — so on reopen the app renders the
hand-back state instead of a "No active job" dead end while the rider still physically holds the parcel.
It did `findFirst({ where: { riderId, status: "cancelled", collectedAt: { not: null }, cancelledAt: { gt:
cutoff } }, orderBy: { cancelledAt: "desc" } })` — picking the MOST recently cancelled candidate.

**Repro:** rider collects order A → A is cancelled while the app is backgrounded (missed push) → A
becomes a stuck hand-back candidate. Before the rider ever sees A's hand-back screen, the same rider is
later assigned and collects order B, which is also cancelled while backgrounded inside the same 24h
`HANDBACK_LOOKBACK_MS` window. `orderBy: cancelledAt desc` now makes `activeForRider` show B's hand-back
forever, and A's hand-back screen never surfaces in the app again (only reachable via admin / trip
history) — a real physical parcel the rider is holding silently drops off their radar.

**Confidence / severity:** high confidence in the mechanism, LOW severity — no data loss (order A is
intact in the DB, just not surfaced), and it requires a compound scenario (two independent missed-push
cancellations for the same rider within 24h).

**Why past sweeps missed it:** the R8 hand-back was introduced by the TAIL-HARDENING plan and its
original fix was validated against the SINGLE-cancellation case (a lone collected-then-cancelled parcel
resurfacing on reopen). The starvation only appears with two overlapping stuck parcels, a compound
scenario the earlier single-cancellation-focused sweep didn't test for.

**Fix (conservative, contract-preserving):** `orderBy` changed from `{ cancelledAt: "desc" }` to
`{ cancelledAt: "asc" }`, so the OLDEST still-outstanding hand-back gets first claim on the rider's
attention rather than being starved behind a newer one forever. `activeForRider` still returns a single
order snapshot (contract unchanged — the mobile client expects one order or null). This doesn't fully
solve "two stuck parcels at once" (that needs a UI/contract change, out of scope), but it guarantees the
app always surfaces SOME outstanding hand-back rather than letting the oldest rot unseen: the existing
hand-back screen's own resolution flow removes an order from `status: "cancelled"` candidacy once
handled, so each resolved hand-back surfaces the next-oldest. The resolution mechanism itself is
unchanged — only the ordering of which candidate `activeForRider` surfaces. Regression test:
`apps/api/src/orders/orders.service.spec.ts` (seeds two cancelled+collected orders for the same rider in
the window and asserts the OLDER one is returned via `cancelledAt: "asc"`).

---

## Verification

`pnpm typecheck` + the full `apps/api` test suite green (including both new regression tests), and the
`@lynia/api` build green — see the shipping PR for the final combined run across the whole monorepo.
