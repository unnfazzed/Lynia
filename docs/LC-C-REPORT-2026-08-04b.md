# LC loop C — offline & 2G resilience — 2026-08-04b

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7 already done). First unchecked checklist item:
**C-O8** (`LC-C11`).

## What shipped

The become-a-rider KYC form (`apps/mobile/app/rider/become.tsx`) already survives an app kill for
its text fields via `kyc-draft.ts`'s hydrate-then-persist-then-clear draft — but its photo capture
did not get the same treatment. `doUpload` only committed `photoUri`/`photoKey` to the durable
draft on a SUCCESSFUL upload. An app kill strictly between firing the presigned-URL PUT and it
resolving left the draft exactly as it was before the attempt: no corruption, but also no memory
that an upload was ever tried, forcing the rider to relaunch the camera and re-capture from
scratch instead of getting the same one-tap "Try again" resume a network-only failure already gets
via the existing `failedAsset` state. Never blocked submission and no data was lost (the GCS
object was never completed either way) — a resume-convenience gap, not a defect, which is why
C-T3's audit correctly triaged it onto the optimization checklist (C-O8) rather than force-fixing
it as a same-run defect.

### Fix

Mirrors C-O5/C-O7's "persist the marker BEFORE firing the request" pattern, adapted for the KYC
form's existing multi-field draft rather than a single-purpose one:

- `apps/mobile/src/logic/kyc-draft.ts`'s `KycDraft` gains a `pendingPhoto` field — the captured
  asset's uri/width/height/contentType, parsed defensively (`parsePendingKycPhoto`) exactly like
  every other draft field (a malformed/missing value degrades to `null`, never trusted verbatim).
  The content type is duplicated as a local `"image/jpeg" | "image/png"` literal union rather than
  importing `image-downscale.ts`'s `UploadImageSource` — importing that module into `kyc-draft.ts`
  would recreate the exact dependency cycle `pickup-photo-draft.ts` already documents avoiding
  (`image-downscale.ts` → `api/uploads.ts` → `api/client.ts` → `auth/session.ts` →
  `auth/device-state.ts` → back to `kyc-draft.ts`'s own `KYC_DRAFT_KEY` export).
- `become.tsx`'s `doUpload` now writes `pendingPhoto` to the draft **synchronously, before**
  `downscaleForUpload`/`requestKycPhotoUpload`/`uploadImage` run, via a `pendingPhotoRef` (a ref,
  not state) — so an app kill anywhere in that chain leaves the marker in place. On success the
  ref and the persisted draft are both cleared immediately (not left for the next render); on
  failure both stay in place, which is exactly what "Try again" already resumes.
- The form's existing multi-field persistence effect (fires on any text-field edit) now reads
  `pendingPhotoRef.current` into every write it makes, so an unrelated field edit (e.g. typing the
  bike registration) can't clobber a still-pending photo marker with a stale `null`.
- A mount-time hydrate restores `pendingPhoto` into `failedAsset` (reusing the existing "Try again"
  button — no new UI surface) with the same resume cue `PickupChecklist`/C-O7 already uses: "We
  didn't confirm your last photo uploaded — tap 'Try again' to finish adding it."
- `kycDraftHasContent` now also counts an unresolved `pendingPhoto` as content, so the "we saved
  what you'd filled in" restored-cue banner shows even if a photo capture (and nothing else) was
  the only thing in flight when the kill happened.
- No new SecureStore key and no `device-state.ts` change needed — `pendingPhoto` rides inside the
  existing `KYC_DRAFT_KEY`, which `clearDeviceState()`'s shared-device sign-out sweep already wipes
  wholesale. (Contrast with C-O7, which needed a brand-new key and an explicit wipe-list entry.)

### Why this is safe

- The draft is a resume **convenience**, never load-bearing: every `kyc-draft.ts` function already
  fails soft on a SecureStore error, so a write/read failure just degrades to today's behavior (a
  fresh re-shoot required) — no new failure mode introduced.
- No new retriable *mutation* — the existing presigned-PUT sequence is unchanged; this only adds a
  client-side local-storage marker around it. No new server-side idempotency surface.
- `pendingPhoto` never gates `canSubmit` (still gated on `photoKey != null`) or any other flow
  decision — it's purely a UI hint for what to restore into `failedAsset` on mount.

## Regression tests

- `apps/mobile/src/logic/__tests__/kyc-draft.test.ts` — extended:
  - `kycDraftHasContent` now also asserts true when only `pendingPhoto` is set.
  - New `loadKycDraft — pendingPhoto parsing` suite: round-trips a valid `pendingPhoto`, rejects a
    malformed one (empty uri, unsupported content type, non-object value) back to `null` instead of
    trusting it verbatim, and defaults to `null` for a pre-C-O8 stored draft that predates the field.
- `apps/mobile/app/rider/__tests__/become-photo-resume.test.tsx` — new, mirrors
  `pickup-checklist-photo-resume.test.tsx`'s structure:
  1. **The regression case**: tap "Take photo" → capture resolves, `doUpload` fires and persists
     `pendingPhoto`, then stalls on `uploadImage` (never resolves, simulating a 2G drop at the
     moment of an app kill) → unmount the screen (only the SecureStore mock's backing map
     survives, standing in for what an OS process kill actually preserves) → mount a fresh
     `BecomeRiderScreen` instance → asserts the resume cue renders and tapping "Try again" re-fires
     the chain with the **original** captured asset (confirmed this fails against the pre-fix code
     — no persisted marker meant zero resume affordance).
  2. `pendingPhoto` is cleared from the persisted draft once the stalled upload is allowed to
     resolve successfully, and `photoKey` lands as expected.

`pnpm typecheck && pnpm lint && pnpm test` — all green across the full monorepo (mobile: 111
suites / 775 tests; API: 97 files / 1540 tests; admin/merchant/shared unaffected and cached-green).

## Ledger

- `LC-C11` added to `docs/KNOWN_BUGS.md` (it had been named in the C-T3 audit narrative but never
  given its own ledger row — added now as OPEN → FIXED in the same edit, closing that gap).
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: `C-O8` ticked done.

## Next Lane C checklist item

`C-O9` (LC-C13, merchant accept/reject error-path refetch) is next in the optimization queue,
followed by `C-O1` (ALR-09 offline mutation UX), `C-O2` (central network policy), `C-O4`
(MicroCache serve-stale mode), `C-O10` (mobile socket auth-callback pattern).
