# Refactoring routine — 2026-08-04d (LC loop R, twentieth run)

Twentieth run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring routine"),
run by the temporary LC loop R sprint. Branch `claude/bold-ramanujan-oqzjzn`, based on `main` @
`1ba2ad0` (the prior run's "Items list" extraction PR plus same-day merges from other lanes).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the nineteenth run's "Items list" extraction left RF-21 OPEN,
  re-scoped to its two remaining bounded sub-block extractions (Recipient-phone, Price/quote),
  with Recipient-phone named as the smaller/next actionable increment. RF-22 stayed OPEN, still
  needing its own design pass. Read `docs/ROUTINES.md` § "Refactoring routine" and
  `docs/KNOWN_BUGS.md` for doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/lynia`) returned zero open PRs — no in-flight
  `claude/lc-r*`/`claude/refactor-*` PR to babysit, and no merged PR yet for this session's
  designated branch (`claude/bold-ramanujan-oqzjzn`), so no branch reset was needed.
- Gate: fresh checkout needed `pnpm install` + `apps/api`'s `prisma generate` (generated client
  isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build && pnpm test` went green: 6/6 typecheck tasks, 5/5 build tasks, 97
  API test files / 1540 API tests + 113 mobile suites / 804 mobile tests + admin/merchant/shared
  suites all green. Clean base confirmed.

## Phase 1 — priority order (a): first actionable OPEN row

RF-21's prior run named the next increment explicitly: extract the "Recipient-phone" block (the
pickup + drop-off contact-phone fields, plus the recent-recipient quick-fill chips) from
`apps/mobile/app/send.tsx` — per `docs/RF-21-SEND-SCREEN.md`, a self-contained block with no
coupling to anything outside itself.

**Executed exactly that.** Moved the block verbatim to a new
`apps/mobile/src/ui/send/SendPhoneFields.tsx` (7 props: `pickupPhone`/`onChangePickupPhone`/
`pickupPhoneError`, `recipients`, `dropPhone`/`onChangeDropPhone`/`dropPhoneError`). No local
state of its own — the phone values, validation flags, and the recipient list all stay owned by
`send.tsx` and thread down as props/callbacks, the same convention `SendLandmarksDetails.tsx` and
`SendItemsList.tsx` already established.

**Characterization tests added first**, per the routine's "uncovered code gets tests first, same
PR" rule: `app/__tests__/send.test.tsx` had zero coverage of the recent-recipient quick-fill chips
or the phone-format inline-error messages before now (the file's `saved-recipients` mock always
resolved `loadRecipients()` to `[]`, so the chips branch never rendered in any existing test —
converted that mock to a controllable `mockLoadRecipients` jest.fn, matching the file's existing
`mockGetMe`/`mockGetActiveCustomerOrder` pattern). Added 3 cases pinning the pre-extraction
behavior:

1. With saved recipients loaded and the recipient-phone field empty, a quick-fill chip renders per
   recipient (labelled `Use recipient <name>` or the bare phone when unnamed) and tapping one fills
   the recipient-phone field with that number.
2. The chips disappear once the recipient-phone field has any text, even with recipients still
   loaded — the "only shown before the customer starts typing" guard.
3. An unparseable pickup or recipient phone number shows the "That doesn't look like a phone
   number" inline error, which clears once both numbers are valid (asserted via presence/absence,
   not a raw count — the tree-walk double-counting `SendItemsList.tsx`'s prior run already
   documented applies here too, since the error is itself a `Text` node).

All 3 passed against the pre-extraction code first (confirming they characterize existing
behavior, not new behavior), then again after the move.

## What was deliberately skipped

- The one remaining bounded presentational sub-block the design note identified (Price/quote) —
  its own future one-concern PR per the design note's explicit sequencing; bundling it into this
  run's PR would exceed one refactoring concern.
- RF-22 (`rider/(tabs)/index.tsx`) — still OPEN, still needs its own design pass; not started this
  run since RF-21's next sub-block was the first actionable row.
- No fresh hotspot recompute this run — priority order (a) had an actionable OPEN row, so step (b)
  wasn't reached; the prior recompute (2026-08-02, merchant/food-scoped) is still current.

## Self-disable check

Not exhausted: RF-21 (one remaining sub-block extraction: Price/quote) and RF-22 (design pass) are
both actionable/pending going into the next firing. No trigger-disable action taken this run.

## Verification

`pnpm typecheck && pnpm build && pnpm test` green pre+post (97 API test files / 1540 API tests,
113 mobile suites / 807 mobile tests — +3 net new characterization tests, none removed/weakened; 9
admin + 24 merchant + 9 shared test files, all unchanged counts), `pnpm lint` 0 new warnings (1
pre-existing unrelated `admin-orders.service.spec.ts` shadow warning; mobile itself 0/0 on 315
files, `check-font-charset` OK), `pnpm run depcruise` 0 new violations (5 pre-existing unrelated
mobile orphan infos, matching the prior run's baseline — `SendPhoneFields.tsx` isn't orphaned,
it's imported by `send.tsx`). Public surface untouched: no controller/route/DTO/socket-event
touched, `packages/shared` untouched, `send.tsx`'s default export/route path unchanged, mobile
stays JS/TSX-only and OTA-able. 2 files / 67 raw changed lines in tracked files + 1 new 63-line
file (well under the ~400-line guideline).

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-21's debt-register row updated to record the
"Recipient-phone" extraction as done and re-scope the row to its one remaining sub-block
extraction (Price/quote), new completed-log entry at the top, "Last updated" note revised. This
report replaces the nineteenth run's report (`REFACTOR-2026-08-04c.md`, deleted in this PR) per
the docs retention policy — that run's findings (the "Items list" extraction) are preserved in the
ledger's debt register and completed log, which are the durable record.
