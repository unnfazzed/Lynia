# Refactoring routine — 2026-08-04e (LC loop R, twenty-first run)

Twenty-first run of the recurring refactoring routine (`docs/ROUTINES.md` → "Refactoring
routine"), run by the temporary LC loop R sprint. Branch `claude/lc-r-20260804d`, based on
`origin/main` @ `a09c03e` (the prior run's "Recipient-phone" extraction PR plus same-day merges
from other lanes; the container's local `main` ref had diverged with an unrelated history, so this
run reset it to `origin/main` before starting — no data loss, the session's own branch was already
based on the current `origin/main`).

## Phase 0 — orient

- `docs/REFACTOR-LEDGER.md`: the twentieth run's "Recipient-phone" extraction left RF-21 OPEN,
  re-scoped to its one remaining bounded sub-block extraction (Price/quote). RF-22 stayed OPEN,
  still needing its own design pass. Read `docs/ROUTINES.md` § "Refactoring routine" and
  `docs/KNOWN_BUGS.md` for doctrine/dedup.
- `list_pull_requests` (open, `unnfazzed/Lynia`) returned three open PRs (B-loop's #583, C-loop's
  #582, and a release-please PR) — none on a `claude/lc-r*`/`claude/refactor-*` branch, so no
  in-flight PR from this lane to babysit.
- Gate: fresh checkout needed `pnpm install` + `apps/api`'s `prisma generate` (generated client
  isn't checked in, the same one-time gap every prior run has noted) before
  `pnpm typecheck && pnpm build && pnpm test` went green: 6/6 typecheck tasks, 5/5 build tasks, 97
  API test files / 1540 API tests + 117 mobile suites / 828 mobile tests + admin/merchant/shared
  suites all green. Clean base confirmed.

## Phase 1 — priority order (a): first actionable OPEN row

RF-21's prior run named the next increment explicitly: extract the "Price/quote" block (the
suggested-fare preview, the acceptance-band hint, the "Use suggested $X" fill button, and the
name-your-price field with its below-/far-above-band nudges) from `apps/mobile/app/send.tsx` —
per `docs/RF-21-SEND-SCREEN.md`, the last of the four bounded sub-blocks the design note
identified, "self-contained given the already-computed derived values."

**Executed exactly that.** Moved the block verbatim to a new
`apps/mobile/src/ui/send/SendPriceQuote.tsx` (6 props: `quote`, `priceBand`, `belowBand`,
`farAboveBand`, `proposedFare`, `onChangeProposedFare`). No local state of its own — the quote/band
values are derived in `send.tsx` from `pickupPoint`/`dropPoint`/`proposedFare` and the price value
itself stays owned by the screen, both threaded down as props/callbacks, the same convention
`SendLandmarksDetails.tsx`/`SendItemsList.tsx`/`SendPhoneFields.tsx` already established.

**RF-21 is now DONE.** This was its last remaining sub-block; all four the design note identified
(Landmarks & details, Items list, Recipient-phone, Price/quote) plus the earlier `accountOnHold`
extraction are complete. What remains in `send.tsx` (958→796 lines) is the map hero wrapper
(already thin, the design note found it not worth extracting) and the cross-cutting
draft-persistence/idempotency/submit logic the design note found genuinely unsplittable without
relocating rather than reducing complexity — the same disposition RF-05b reached for
`tracking.gateway.ts`.

**Characterization tests added first**, per the routine's "uncovered code gets tests first, same
PR" rule: `app/__tests__/send.test.tsx` had zero coverage of the suggested-fare line, the
acceptance-band hint, the "Use suggested" button, or either price-nudge before now — the file's one
existing price-field interaction (the LC-C06 draft-flush test) only ever sets the raw value
directly via `setFieldByAccessibilityLabel`, never exercising the quote/band UI. Added 3 cases
pinning the pre-extraction behavior, all anchored to the test file's fixed `PICKUP`/`DROPOFF`
fixture coordinates (which `quoteFare` derives deterministically to a $2.29 suggested fare over
1.31 km, and `fareBand` derives to a $1.90–$2.70 band):

1. No suggested-fare preview renders until both pins are set; once set, the "Suggested fare $2.29 ·
   1.31 km" line and the "Riders usually accept around $1.90–$2.70" band hint both appear, and
   tapping "Use suggested $2.29" fills the price field with that exact value.
2. A below-band price ($1.00, under the $1.90 low edge) shows the "may pass" nudge, which clears
   once the price is back at the suggested $2.29.
3. A far-above-band price ($10, over the $2.70 high edge × 3 = $8.10 threshold) shows the "did you
   add a digit?" nudge, which clears at the suggested $2.29.

All 3 passed against the pre-extraction code first (confirming they characterize existing
behavior, not new behavior), then again after the move.

## What was deliberately skipped

- RF-22 (`rider/(tabs)/index.tsx`) — still OPEN, still needs its own design pass; not started this
  run since RF-21's Price/quote sub-block was the first actionable row.
- No fresh hotspot recompute this run — priority order (a) had an actionable OPEN row, so step (b)
  wasn't reached; the prior recompute (2026-08-02, merchant/food-scoped) is still current.

## Self-disable check

Not exhausted: RF-22 (`rider/(tabs)/index.tsx`, needs a design pass — the only remaining OPEN row)
is actionable/pending going into the next firing, per the same pattern RF-05b/RF-18/RF-21 followed
(write the design note as its own increment before any extraction). No trigger-disable action
taken this run.

## Verification

`pnpm typecheck && pnpm build && pnpm test` green pre+post (97 API test files / 1540 API tests, 117
mobile suites / 831 mobile tests — +3 net new characterization tests, none removed/weakened; 9
admin + 24 merchant + 9 shared test files, all unchanged counts), `pnpm lint` 0 new warnings (1
pre-existing unrelated `admin-orders.service.spec.ts` shadow warning; mobile itself 0/0 on 319
files, `check-font-charset` OK), `pnpm run depcruise` 0 new violations (5 pre-existing unrelated
mobile orphan infos, matching the prior run's baseline — `SendPriceQuote.tsx` isn't orphaned, it's
imported by `send.tsx`). Public surface untouched: no controller/route/DTO/socket-event touched,
`packages/shared` untouched, `send.tsx`'s default export/route path unchanged, mobile stays
JS/TSX-only and OTA-able. 2 files / 111 raw changed lines in tracked files + 1 new 62-line file
(well under the ~400-line guideline).

## Ledger

`docs/REFACTOR-LEDGER.md` updated in this PR: RF-21's debt-register row and hotspot-map row both
updated to DONE, recording the "Price/quote" extraction and RF-21's overall completion; new
completed-log entry at the top; "Last updated" note revised. This report replaces the twentieth
run's report (`REFACTOR-2026-08-04d.md`, deleted in this PR) per the docs retention policy — that
run's findings (the "Recipient-phone" extraction) are preserved in the ledger's debt register and
completed log, which are the durable record.
