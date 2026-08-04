# LC-A report — 2026-08-04 (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O14** — `MerchantOrderResponse`'s cash-handshake/debt-ledger/refund fields
(`LC-A06`), ranked #6 by the 2026-08-03 A-T4 wire-bytes evidence.

## What shipped

`food-order.service.ts`'s `toResponse()` serialized all 39 `MerchantOrderResponse` fields on every
food-order poll regardless of order phase, unlike the parcel `OrderSnapshot`'s `getSnapshot()`
(`orders.service.ts:887-905`), which deliberately nulls out phase-irrelevant fields. 13 of those
39 — the doorstep-handshake (`cashHandshakeAmount`/`customerCashConfirmedAt`/`riderCashConfirmedAt`/
`cashHandshakeDeadlineAt`/`cashHandshakeFrozenAt`), debt-ledger (`merchantCashRule`/`debtStatus`/
`debtAmount`/`debtOpenedAt`/`debtSettledAt`), and refund (`refundReference`/`refundAmount`/
`refundedAt`) fields — are `null` on the overwhelming majority of polls: a wallet order never
touches the handshake/debt fields at all, and refund fields only ever populate on a merchant-issued
refund.

Note on the fix shape vs. the item's own framing: the checklist item suggested "mirroring
`getSnapshot`'s pattern" of phase-conditional nulling. On inspection that pattern doesn't actually
save bytes — `getSnapshot` still emits `"field":null` for every phase-irrelevant field, the same
byte cost as a DB-sourced `null`, just via a different code path (a ternary on `status` instead of a
straight passthrough). The real lever is **omitting the key entirely** when its value is `null`,
which `JSON.stringify` does automatically for `undefined`-valued properties. So instead:

- `packages/shared/src/contracts.ts`: the 13 fields now marked `.optional()` alongside their existing
  `.nullable()`, so the TS type allows the key to be absent.
- `food-order.service.ts`: `toResponse()` builds the response exactly as before, then a loop deletes
  each of the 13 keys whenever its value is `null` (`RESPONSE_NULL_OMIT_FIELDS`), rather than
  hand-writing 13 phase-condition ternaries that would need to track every status transition
  correctly and would still cost the same bytes when the condition evaluates false. Driven by actual
  data availability rather than a hardcoded status list, this can't drift out of sync with a future
  new status the way a status-enumerated ternary could.

**Safety check before landing:** grepped every non-test consumer of all 13 field names across
`apps/merchant`, `apps/mobile`, `apps/admin`, and `apps/api`. Every single one reads via
`?? fallback`, a truthy check (`if (order.field)`), or `=== "value"` — none does `"field" in order`
or a strict-required-property destructure. A missing key and an explicit `null` are behaviorally
identical to all of them, so this is a pure wire-format change with no behavior change on either
side. Also confirmed neither the mobile API client (`apiFetch<T>`) nor the NestJS controllers
runtime-validate responses against the zod schema — schema fields are compile-time typing only here
— so there's no risk of a validator rejecting the now-missing keys.

**Ripple fixed:** `handshakeState`/`codeEligible` (`apps/mobile/src/logic/food-doorstep.ts`) and
`returnLegNeeded` (`apps/mobile/src/logic/food-rider-job.ts`) declare their own inline parameter
types for these fields (not derived from `MerchantOrderResponse`), so they needed widening to accept
the now-optional/undefined-capable types — `returnLegNeeded`'s two affected fields became optional
properties (`?:`), `handshakeState`/`codeEligible`'s three became `| undefined` unions (their call
sites always build a fresh object literal, never pass the raw response object, so `| undefined` was
sufficient there while `returnLegNeeded`'s two call sites pass the whole query-cache object
directly). Two UI call sites (`app/rider/food-job.tsx`, `FoodOrderLiveTrackerView.tsx`) pass
`customerCashConfirmedAt` straight into a `confirmedAt: string | null` component prop — added an
explicit `?? null` at each. No other consumer needed a change.

## What was deliberately left alone

- **`debtStatus`/`merchantCashRule` still serialize normally whenever non-null** — this isn't a
  blanket strip, only a null-value omission. A collect-and-return order with `debtStatus: "open"`
  still carries that field on every poll, same as before.
- **No change to which data the DB stores or when** — this is response-shape-only. No write path,
  no status-transition logic, no money computation touched.

## Evidence (payload-bytes, mirroring A-T4's methodology)

No live capture — a synthetic-driver script (`Buffer.byteLength(JSON.stringify(...))` against the
real 39-field response shape, values matching what `toResponse()` actually emits) over three
realistic order states. Script: `/tmp` scratch (not committed, one-off measurement like prior A-T4/
A-O6/A-O9 traces).

| Scenario | Before (explicit nulls) | After (omitted) | Bytes | % |
|---|---:|---:|---:|---:|
| Wallet order, in-flight (no cash/debt/refund state) | 1,197 B | 889 B | **−308 B** | **−25.7%** |
| Cash order, mid doorstep-handshake (no debt/refund) | 1,239 B | 1,020 B | **−219 B** | **−17.7%** |
| Cash collect-and-return, open debt (no refund) | 1,233 B | 1,005 B | **−228 B** | **−18.5%** |
| **Aggregate (3 scenarios)** | **3,669 B** | **2,914 B** | **−755 B** | **−20.6%** |

Roughly in line with the ledger's ≈500 B/poll estimate — a little higher in practice since the
estimate used average field-name length while the measured payload includes real key names. This
compounds with A-O9 (2026-08-03f): every poll A-O9 kept alive as the WS-gated fallback now also pays
~18-26% fewer bytes, and every pre-A-O9 poll on the two food polls A-O9 deliberately left alone
(`useFoodOrder`, `foodQ`/`returnLegQ` — see `A-O18`) gets the same cut immediately, no server change
needed beyond this one.

## Verification

- **New regression tests** — `apps/api/src/merchant/food-order.service.spec.ts`, new
  `describe("FoodOrderService.toResponse — A-O14 (LC-A06) null-padding omission")` block, 2 cases:
  - A wallet order with no cash/debt/refund activity: asserts all 13 fields are absent
    (`not.toHaveProperty`) from `getMyOrder`'s response, while unrelated fields (`status`,
    `paymentMethod`) still serialize normally.
  - A cash collect-and-return order with an open debt: asserts the 5 populated debt-ledger fields
    serialize with their real values, while the still-null cash-handshake/refund fields stay
    omitted — pins that this is a per-field, not per-order, omission.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/api` typecheck clean (after `prisma generate`, unrelated to this change — a fresh
    checkout's generated client just wasn't present yet); `@lynia/api` test: **97 files / 1,536
    tests** pass (full suite, including the 2 new cases above).
  - `@lynia/mobile` typecheck clean (after widening `food-doorstep.ts`/`food-rider-job.ts` and the
    two `?? null` prop fixes above); `@lynia/mobile` test: **108 suites / 751 tests** pass.
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/test: unaffected, all green.
  - `oxlint` (root config): clean (one pre-existing unrelated `no-shadow` warning in
    `admin-orders.service.spec.ts`, not touched by this PR).

## Budgets and doctrine

No JS/bundle-size change — `size-budget.json` untouched, this is a server response-shape/payload-
bytes optimization, not a client bundle-size one. Fully OTA-able on the client side (the two mobile
type-widening files + two prop fixes are JS-only); the server-side change ships independently via
the normal API deploy path (not an OTA update at all).

**Sensitive-lane doctrine:** the diff touches `apps/api/src/merchant/food-order.service.ts`, which
is **not** one of the sensitive-lane directories listed in `docs/ROUTINES.md`
(`apps/api/src/{wallet,settlements,offers,orders,matching,kyc,riders}/` or
`packages/shared/src/{policy,pricing,money}.ts`), so the four doctrine questions don't formally
apply. Noting anyway since the fields involved are money-adjacent (cash handshake amounts, debt
ledger, refunds): this change touches **only response serialization** — no DB write, no status
transition, no amount computation, no gating logic. The exact same values that were sent as explicit
`null` are now simply absent from the JSON; every value that WAS non-null (the actual money/state
data) serializes completely unchanged. Verified via the regression tests above that populated fields
survive intact and only genuinely-null fields are affected.

`A-O14` is marked resolved in this same PR (program doc §5, this report, `docs/KNOWN_BUGS.md`
LC-A06).
