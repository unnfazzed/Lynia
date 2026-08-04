# LC loop C — offline & 2G resilience — 2026-08-04

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 were already checked; every Day-0 defect
C-D0a…C-D0e was already fixed; C-O5 and C-O6 were already done). First unchecked checklist item:
**C-O7** (`LC-C09`).

## What shipped

`PickupChecklist`'s optional proof-of-pickup photo (§5c, between "arrived at pickup" and
"collected") owned its own capture/upload state (`photoUri`/`photoBusy`/`failedPhoto`) purely in
local component state. An app kill strictly between the camera capture succeeding and the
attach POST completing — or between a failed upload and the rider tapping "Try the photo again" —
silently dropped every trace that a capture was ever attempted. Unlike the item ticks on the same
screen (`pickup-checklist-draft.ts`, autosaved) or the KYC form's photo (`kyc-draft.ts`, which
already survives an app kill), a relaunch here forced a full re-shoot with zero memory of the
attempt. Never gated "Confirm collected" and no order data or money was at risk — a lost "nice to
have" evidence photo, which is why C-T2's audit correctly triaged it as an optimization item
(C-O7) rather than a same-run defect.

### Fix

Mirrors C-O5's "persist the marker BEFORE firing the request" pattern (`saveRiderJobTerminal` in
`deliverM`'s `onMutate`), adapted for a photo asset instead of a boolean terminal marker:

- New `apps/mobile/src/logic/pickup-photo-draft.ts` — a SecureStore-backed draft
  (`{orderId, uri, width?, height?, contentType}`), same shape and best-effort-fails-soft
  contract as the sibling `pickup-checklist-draft.ts`/`kyc-draft.ts` modules.
- `PickupChecklist.tsx`'s `uploadPhoto` now calls `savePickupPhotoDraft(...)` with the captured
  asset **before** `downscaleForUpload`/`requestPickupPhotoUpload`/`uploadImage`/`attachPickupPhoto`
  run — so an app kill anywhere in that chain leaves the draft in place. `clearPickupPhotoDraft()`
  fires only once `attachPickupPhoto` actually succeeds; a network-only failure also leaves the
  draft in place (correct — that's exactly the case "Try again" already resumes).
- A new mount-time effect calls `loadPickupPhotoDraft()`; if the persisted draft's `orderId`
  matches the current order, it's restored into `failedPhoto` with an explicit resume cue ("We
  didn't confirm your last photo uploaded — tap to finish adding it."), reusing the existing "Try
  the photo again" button — no new UI surface, no change to the calm inline-error styling. A
  draft from a *different* order (a prior job) is ignored, same guard `pickup-checklist-draft.ts`
  uses.
- `job.tsx`'s `confirmAndCollect` now also clears the photo draft alongside the existing
  `clearPickupChecklistDraft()` call, once the rider has moved past the pickup-verification step.
- `device-state.ts`'s `clearDeviceState()` (the shared-device sign-out wipe) wires in the new key
  from the start — the exact BH-17/BH-23-class gap ("a new per-order draft key added after this
  wipe was last touched, and missed") this lane has hit twice before on sibling keys.

### Why this is safe

- The draft is a resume **convenience**, never load-bearing: if SecureStore itself fails (read or
  write), every function in `pickup-photo-draft.ts` fails soft and the flow behaves exactly as
  before this change — the rider can always re-shoot manually.
- No new retriable *mutation* was introduced — the existing presigned-PUT + `attachPickupPhoto`
  sequence is unchanged; this only adds a client-side local-storage marker around it. No new
  server-side idempotency surface to reason about.
- The draft never gates "Confirm collected" — collection can proceed with or without a resolved
  photo, exactly as before.

## Regression tests

- `apps/mobile/src/logic/__tests__/pickup-photo-draft.test.ts` — parse/round-trip/malformed-JSON
  coverage for the new draft module (mirrors `pickup-checklist-draft.test.ts`).
- `apps/mobile/src/ui/rider/__tests__/pickup-checklist-photo-resume.test.tsx` — three cases:
  1. **The regression case**: capture → upload stalls (never resolves, simulating a 2G drop at
     the moment of an app kill) → unmount the component (only the SecureStore mock's backing map
     survives, standing in for what an OS process kill actually preserves) → mount a fresh
     instance for the same order → asserts the resume cue renders and tapping "Try the photo
     again" re-fires the chain with the **original** captured asset (confirmed this fails against
     the pre-fix code — no persisted draft meant zero resume affordance).
  2. Draft is cleared once the stalled upload is allowed to resolve successfully.
  3. A draft persisted under a different `orderId` is not restored for the current order.
- `apps/mobile/src/auth/__tests__/session.test.ts` — extended the existing BH-17 sign-out
  characterization test with the new key.

`pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` —
all green (110 suites, 761 tests, 0 failures).

## Ledger

- `LC-C09` in `docs/KNOWN_BUGS.md`: OPEN → FIXED.
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: `C-O7` ticked done.

## Next Lane C checklist item

`C-O8` (LC-C11, become-a-rider KYC photo resume — same pattern, different screen) is next in the
optimization queue, followed by `C-O1` (ALR-09 offline mutation UX), `C-O2` (central network
policy), `C-O4` (MicroCache serve-stale mode), `C-O9` (merchant accept/reject error-path refetch),
`C-O10` (mobile socket auth-callback pattern).
