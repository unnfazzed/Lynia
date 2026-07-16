# Agentic-loop bug hunt — 2026-07-16 (wallet & data-lifecycle lane)

**Method:** a multi-agent *agentic loop* rather than a single linear read-through. Eight finder agents fanned
out over the WD lane, each with a **distinct lens** (exactly-once credit, ledger reconciliation, per-ride
debit, earnings tab, admin-dashboard KPIs, admin-action authz/audit, concurrency races, contract/nullability).
Every candidate then faced a **3-skeptic adversarial panel** — one agent trying to confirm, one to prove it a
false positive, one to prove it already in `docs/KNOWN_BUGS.md` — and survived only on ≥2 "real" votes. Each
survivor was then **sibling-swept**: its pattern signature grepped across the whole repo to catch the "fixed
one instance, sibling stayed vulnerable" class this repo's history is dominated by.

**Starting tree:** already settled by the same-day WD routine (WD-012…WD-017), so Phase-0 dedup excluded
everything that run covered. This continues the `WD-` sequence.

**Funnel:** 8 lenses → 4 candidates → **2 confirmed** by the panel (2 refuted/deduped) → sibling-sweep added
**1 real unfixed sibling** → **3 fixes shipped**, one regression test each.

**Verification:** `pnpm typecheck` clean (4 packages) · **973 API tests** (68 files) green · **401 mobile
tests** green. Each regression test exercises the exact blind spot the pre-fix suite missed.

---

## Findings

### WD-018 — HIGH — Admin order-cancel is broken in production (`cancelledBy` `@db.Uuid` cast failure)

`apps/api/src/admin/admin-orders.service.ts:121`

`cancelOrder` wrote `cancelledBy: actor`. `actor` comes from `resolveAdminActor()`, which behind the console's
identity-aware proxy (IAP) returns the **operator's email** forwarded as `X-Operator` (e.g.
`accounts.google.com:ops@lynia.com`). But `Order.cancelledBy` is `@db.Uuid` with an FK → `Profile.id`
(`schema.prisma:444`). Writing a non-uuid string into a `@db.Uuid` column makes Postgres reject the `UPDATE`
with `22P02 invalid input syntax for type uuid`, aborting the whole cancel `$transaction`.

- **Prod impact:** behind IAP (the documented prod deployment) **no order could be admin-cancelled** — every
  attempt 500s and the order stays live.
- **Fallback path** (no `X-Operator`, e.g. offline/demo): `actor` is the shared admin token's synthetic
  subject uuid, which has no `profiles` row → FK violation instead. Broken either way.
- **Why tests missed it:** unit tests mock Prisma and pass a bare `"admin-1"` string, so neither the
  `@db.Uuid` cast nor the FK is ever exercised.

**Fix:** write `cancelledBy: null`. The column is read *only* to derive a `customer`/`rider`/(neither ⇒
`"admin"`) role (`orders.service.ts:774`, `admin-orders.service.ts:90`) — and the readers already treat a
non-party value as "admin" (`orders.service.spec.ts:752` even asserts null for an admin cancel). The operator
identity is durably recorded where it belongs, `AuditLog.actor` (a plain `String` column). The rider terminal's
"admin" attribution is a hardcoded literal in `emitJobCancelled(..., "admin")`, independent of this column.

**Regression test:** `admin-orders.service.spec.ts` — passes an IAP-style email operator and asserts
`cancelledBy` is null (never the email) *and* the operator is preserved on the audit row.

### WD-019 — HIGH — Admin issue-resolution is broken in production (sibling of WD-018)

`apps/api/src/issues/issues.service.ts:216`

The sibling-sweep for WD-018 found this independently. `resolve()` wrote `resolvedByAdminId: adminId` into
`Issue.resolvedByAdminId`, another `@db.Uuid` column; behind IAP `adminId` is the operator email → the same
`22P02` cast failure → the entire resolve `$transaction` (a `refund`, `rider_strike`, or `close_no_action`)
aborts. **Admin issue-resolution was broken in production too.** The column has no FK and is read nowhere in
`apps/api`, `apps/admin`, or `apps/mobile`.

**Fix:** write `resolvedByAdminId: null`; the resolving operator is already recorded on `AuditLog.actor`.
**Regression test:** `issues.service.spec.ts` — email operator → null column + audit actor preserved.

### WD-020 — LOW — `suspendRider` lets a permanent ban be laundered back to active

`apps/api/src/admin/admin-riders.service.ts:221`

`liftRider` deliberately refuses to reinstate a banned rider (`accountStatus === BANNED` → 409, "reinstating a
ban is a separate action"), encoding ban-permanence. But `suspendRider` had **no current-status guard**: it
CAS-updated from whatever it observed, so `ban → suspend` silently downgraded `banned → suspended`. Once
suspended, `liftRider`'s BANNED guard no longer fires, so an ordinary `lift` returns the rider to `active` —
**two ordinary admin actions launder a permanent ban**, defeating the invariant `liftRider` exists to enforce.

**Fix:** mirror `liftRider`'s guard — `suspendRider` now rejects a BANNED rider (409) before the CAS.
**Regression test:** `admin-riders.service.spec.ts` — a banned rider → 409, no standing write, no audit.

---

## Sibling-sweep evidence

**WD-018/WD-019 class — an actor/adminId identity string written into a `@db.Uuid` column:**

```
grep -rn "cancelledBy" apps/api/src
grep -nE "@db.Uuid" apps/api/prisma/schema.prisma
grep -rniE "resolvedByAdminId|byProfileId|openedByProfileId|reporterProfileId|actorProfileId" apps/api/src --include=*.ts | grep -v spec
```

Enumerated disposition:
- `Order.cancelledBy` — **WD-018, fixed.**
- `Issue.resolvedByAdminId` — **WD-019, fixed** (real sibling).
- Every other admin mutating action (suspend / ban / lift / hold / `fare_adjust` / kyc / wallet-credit) writes
  `actor` only into `AuditLog.actor` / `CommissionLedger.actor` — plain `String` columns
  (`schema.prisma:315,663`) — **already safe.**
- No further vulnerable siblings of this class remain.

**WD-020 class — standing mutators missing a terminal/banned-state precondition:**

```
rg -n "accountStatus: RiderAccountStatus\." apps/api/src --glob '!**/*.spec.ts'
rg -n "accountStatus === RiderAccountStatus\.BANNED" apps/api/src --glob '!**/*.spec.ts'
```

`liftRider` and `clearHold` already carry the guard; `banRider` is the terminal action itself; `suspendRider`
was the only standing mutator missing it (**WD-020, fixed**). Customer-side standing (`onHold` boolean) has no
terminal/banned state, so the class doesn't apply there.

---

## Method note

This run demonstrates the reusable engine now saved at `.claude/workflows/lane-bug-hunt.js` and documented in
`docs/ROUTINES.md` ("Agentic-loop engine"). The headline result — a **prod-breaking HIGH the prior linear WD
runs missed, plus its unfixed sibling in a different module** — is exactly the recall gain the loop (search
diversity + adversarial verify + sibling-sweep) exists to capture over a single-pass read-through.
