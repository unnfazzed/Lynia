# LC loop D report — 2026-08-04 — D-O3 (optimize mode)

Territory: `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D, first unchecked
**Optimization checklist** item after D-O1/D-O2 — D-O3: "Server-side push sends carry no
collapse-key/tag (`notifications.service.ts`'s `send()`, FCM `sendEach`), so a retried/duplicated
`notifyOrderStatus` call (there's no idempotency key on the caller side) stacks a second tray
entry instead of replacing the first."

## Phase 0

- `docs/plans/2026-08-01-low-connectivity-program.md` exists on `main`.
- No unmerged `claude/lc-d*` PR at Phase 0 — no in-flight lane-D work to babysit.
- All five Lane D audit territories (D-T1–D-T5) and every confirmed Day-0 defect are already
  closed; D-O1 and D-O2 are done. D-O3 is the first unchecked checklist item, so this firing
  stayed in **OPTIMIZE MODE**.

## What shipped

`PushMessage` (`apps/api/src/adapters/push/push.interface.ts`) gains an optional `collapseKey`
field, threaded through the same opt-in-per-kind shape as the existing `ttlSeconds`. The FCM
adapter (`apps/api/src/adapters/push/fcm.push.ts`, `buildFcmMessage`) maps it to
`android.collapseKey` and the `apns-collapse-id` header — both provider-native mechanisms that
replace an already-queued, not-yet-delivered notification sharing the same key instead of
stacking a second tray entry. `NotificationsService.send()` (private helper used by every
`notify*` method) now passes `collapseKey` through to `sendEach` alongside `ttlSeconds`.

`notifyOrderStatus` — the specific call site named in the finding — stamps each recipient's send
with `` `order:${orderId}:${status}` ``: a retried/duplicated call for the *same* order+status
transition collapses onto the same tray entry, while distinct statuses for the same order (e.g.
`assigned` then later `completed`) remain separate notifications, since a rider being told "you
got the job" and later "delivery complete" are both worth keeping, not replacing one with the
other. No other `notify*` caller was wired to a collapse key this run — the finding names
`notifyOrderStatus` specifically, and the general plumbing (`PushMessage.collapseKey` → FCM →
`send()`) is now in place for a future retry-on-failure path on any caller to opt into without
further interface changes.

Not exploitable today (no caller currently retries `notifyOrderStatus`), which is exactly the
optimization framing in the checklist — closing the gap before a retry path lands, not fixing an
active defect.

## Verification

New tests:
- `apps/api/src/adapters/push/push.spec.ts` — `buildFcmMessage` maps `collapseKey` to
  `android.collapseKey` / `apns-collapse-id`, defaults to unset, and composes correctly alongside
  `ttlSeconds` (neither field clobbers the other's `android`/`apns` block).
- `apps/api/src/notifications/notifications.service.spec.ts` — `notifyOrderStatus` stamps the
  `order:${orderId}:${status}` collapse key on the batched `sendEach` call.

Full monorepo `pnpm typecheck && pnpm lint && pnpm test` green (97 API test files / 1538 tests,
108 mobile test files / 751 tests, admin/merchant/design/shared all green). This fresh checkout
needed a one-time local `pnpm install` + `prisma generate` + `packages/shared` build before
`@lynia/api` typecheck/test would run — environment setup, not a repo defect (consistent with the
prior D-O2 report). `pnpm depcruise` shows the same 4 pre-existing info-level orphan violations as
baseline, 0 new.

## Lane D closes out

D-O3 was the last unchecked box in Lane D's checklist — every Day-0 defect (D-D0a–f), every audit
territory (D-T1–D-T5), and every optimization item (D-O1–O3) is now checked. Per the mission's
SELF-DISABLE instruction this run should also disable the "LC loop D — journey & soundness sweep"
trigger, but **this session's tool surface has no `list_triggers`/`update_trigger` (or
`create_trigger`) tool** — only session-local `CronCreate`/`CronList`/`CronDelete`, which manage a
different, in-memory job store and cannot reach the actual account-level Routine that fired this
session. The trigger could not be disabled from here. `docs/routines/harare-loops.md` is updated
to flag Lane D COMPLETE and record this gap; disabling the `LC loop D` Routine itself needs either
a session where `update_trigger` is available or the founder doing it directly in the claude.ai
Routines UI. If Lane D fires again before that happens, the correct behavior per the program doc
is a no-op (every box already checked, nothing left to audit or optimize) — not a problem, just
wasted tokens until disabled.

## Not done / scoped out

- No other `notify*` call site was given a collapse key — the checklist item scopes to
  `notifyOrderStatus`, and the other methods (`notifyNewOffer`, `notifyIssueResolved`, broadcast/
  riders-available fan-outs) don't share its "one recipient, one logical event, plausible future
  retry" shape as cleanly. The plumbing is now generic (`collapseKey` on `PushMessage`/`send()`),
  so wiring a future caller is a one-line addition, not a redesign.
- Android's `collapseKey` and the APNs `apns-collapse-id` header both cap around 64 bytes; today's
  only key shape (`order:<uuid>:<status>`, ≤60 chars for every status name in `STATUS_NOTICES`/
  `MERCHANT_STATUS_NOTICES`) fits with margin, so no truncation/hashing was added — that would be
  speculative for a key shape that doesn't currently overflow.
