# LC-C report — 2026-08-03b (offline & 2G resilience)

Sixth LC-C increment. Phase 0: no in-flight `claude/lc-c*` PR to babysit, and all five Day-0
defects (C-D0a…e) plus the first two audit territories (C-T1, C-T2) were already closed by prior
firings — so this run stays in **AUDIT MODE** and takes the next unchecked audit territory,
**C-T3: onboarding + OTP + KYC capture (incl. photo upload resumability on slow uplink)**.

## Method

Dispatched a read-only Explore pass over every file on this journey — phone entry, OTP
send/verify, post-OTP profile setup, becomeRider, KYC document/selfie capture+upload, and the
KYC status polling screen, plus the server-side idempotency of each mutation — then assessed the
findings against the lane's three adversarial conditions: (a) every request takes 2–5s, (b) the
connection dies at each step boundary, (c) the app is killed and relaunched at each step boundary.
Cross-checked against `docs/KNOWN_BUGS.md`'s existing KYC-cluster entries first (that cluster's
prior work is all fraud/identity-hardening — duplicate accounts, ID-swap, webhook forgery — a
different concern from this lane's connectivity-resilience bar, so nothing there was re-reported).

## Result: reference-quality except one screen that missed an established pattern

Every mutation on this journey already carries the same idempotency discipline C-T1/C-T2 found
elsewhere in the app:

- **OTP verify** (`apps/api/src/auth/auth.service.ts:356-478`) increments the attempt counter
  atomically before comparing (closing a TOCTOU) and writes a 60s hash-only grace record BEFORE
  deleting the live OTP, so a client-timeout retry with the same correct code re-mints a session
  instead of "expired." Refresh-token rotation has the identical grace-window shape.
- **completeProfile**/**becomeRider** (`apps/api/src/riders/rider.service.ts`) are transactional
  CAS writes with an advisory lock; a repeat submit of the same data is a safe no-op, and
  `becomeRider`'s pre-check throws a structured 409 `already_rider` specifically so a
  lost-response retry that actually landed is reconciled client-side (`become.tsx:187-196`) into
  a redirect to `/rider` rather than a dead-end error.
- **The KYC webhook** (`kyc.controller.ts` → `applyKycResult`) is idempotent via row-lock +
  `kycResolvedAt` monotonic CAS — a duplicate or out-of-order delivery updates 0 rows.
- **The become-a-rider form** already has a durable draft (`kyc-draft.ts`, SecureStore-backed
  since it holds a national ID) covering firstName/lastName/idNumber/bikeReg/photoKey/photoUri,
  restored on relaunch with a "we saved what you'd filled in" cue, and a failed photo upload
  keeps the same captured asset (`failedAsset`) for a one-tap retry instead of forcing a re-shoot.
- **The rider KYC-status gate** (`apps/mobile/app/rider/(tabs)/index.tsx`) distinguishes a
  network failure (`meQ.isError`) from "not yet verified," refetches on screen focus (so
  returning from the Didit browser hand-off re-checks immediately), and gives every pending/
  failed/expired state an explicit "Refresh status" affordance rather than trusting a possibly
  stale cache indefinitely.
- Every call on this journey routes through the shared 15s-`AbortController` client
  (`apps/mobile/src/api/client.ts`) or the KYC upload's own equivalently-bounded raw PUT — no
  unbounded request exists anywhere in this journey to spinner-trap on a 2-5s link.

Two inputs on this journey are held in plain, un-persisted React state — the entered OTP code and
the typed phone number on the send-OTP screen — but neither rises to the DEFECT bar: both are
cheap to retype (a 10-13 digit phone number, a 6-digit code), the server's own OTP grace/rate-limit
mechanics are the real backstop for a lost verify response, and this matches what the rest of the
app already treats as fine not to persist (no screen in this codebase durably drafts a bare OTP
code).

## One genuine defect found and FIXED this run

**LC-C10**: `apps/mobile/app/profile/setup.tsx` — the post-OTP "Tell us who you are" screen — is
the FIRST screen a brand-new account of EITHER role ever lands on (`verify.tsx` routes here
whenever `needsProfile` is true, before the role fork). It collects the exact same class of data
as the become-a-rider KYC form (first name, last name, national ID) but, unlike that form, held it
in plain `useState` with zero durable persistence. An OS-level app kill while typing here — the
same low-RAM-Android OOM-kill scenario `kyc-draft.ts`'s own comment names as its reason for
existing — silently lost the typed name/ID with no recovery cue, forcing a full retype on
relaunch. This is a straightforward inconsistency, not a deliberate design choice: the sibling
rider-onboarding screen collecting the identical fields already gets full draft protection.

**Fix**: added `apps/mobile/src/logic/profile-draft.ts`, mirroring `kyc-draft.ts`'s
hydrate-then-persist-then-clear pattern exactly (SecureStore-backed, since it holds a national
ID — the same "user's own identity data, keystore only" reasoning `kyc-draft.ts` documents).
Wired into `profile/setup.tsx`: the draft is loaded once on mount (gated by a `hydrated` ref so
the initial empty state can't clobber a stored draft), persisted on every field change once
hydration completes, and cleared the moment the profile PATCH actually lands — with the same
"We saved what you'd filled in — pick up where you left off" restored-cue copy `become.tsx` uses.
Also registered `PROFILE_DRAFT_KEY` in `device-state.ts`'s `clearDeviceState()` shared-device wipe
(same reasoning as `KYC_DRAFT_KEY`: a national ID must not survive to the next user on a shared
device), and extended the existing full-key-wipe characterization test in `session.test.ts`.

**Regression test**: `apps/mobile/app/profile/__tests__/setup.test.tsx` drives the real screen
(mocking only SecureStore/api/router/auth-context edges, the pattern `app/__tests__/send.test.tsx`
already established), types into all three fields, unmounts, then mounts a fresh instance of the
same screen (simulating an app kill + relaunch) and asserts the fields come back populated.
Confirmed this test FAILS against the pre-fix code (a fresh mount always started every field
empty) before restoring the fix. A second test confirms the draft is cleared once the PATCH
actually lands. Also added a small pure-logic test for `profileDraftHasContent` mirroring the
existing `kyc-draft.test.ts` coverage.

## One narrow new gap — appended to the optimization checklist, not force-fixed

**LC-C11 / C-O8**: the KYC form's own photo capture (`become.tsx`'s `doUpload`) only commits
`photoUri`/`photoKey` to the durable draft on a SUCCESSFUL upload. An app kill strictly between
firing the presigned-URL PUT and it resolving leaves the draft exactly as it was before the
attempt — no corruption, nothing silently wrong, but also no memory that an upload was ever
attempted, so the rider must relaunch the camera and re-capture from scratch instead of getting
the same one-tap "Try again" resume a network-only failure already gets via `failedAsset`. Per the
same bar the lane applied to LC-C05/LC-C07/LC-C09 (no lost work in the business sense, no dead
end, no double-apply, mandatory-photo submission is never blocked any harder than it already is),
this is a resume-convenience optimization, appended to the Lane C checklist as **C-O8** rather
than fixed under this run's single-increment scope.

## Verification

`pnpm typecheck && pnpm lint && pnpm test` run to confirm the fix (one new module, one screen
edit, one shared-wipe registration, three test files) leaves the monorepo green.
