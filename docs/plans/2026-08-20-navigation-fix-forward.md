# Navigation fix-forward — escape hatches, KYC-without-a-wall

Source: the navigation review of 2026-08-20 (findings N-01 … N-08), plus an owner constraint added
the same day:

> **"Not finishing KYC should not stop a rider from logging in even though they will need to finish
> KYC to get rides."**

This plan is the fix for those findings. It is scoped to *getting out of a screen* — back, skip,
close, and the Android back gesture — and to the KYC gate's blast radius.

---

## 0. What the constraint already gets for free

Verified in code before planning anything, so we do not "fix" what is not broken:

- **KYC is not a login wall.** `bootDestination` (`src/logic/boot-route.ts`) routes to `/onboarding`,
  `/phone`, `/profile/setup`, `/rider` or `/home`. It **never** routes to `/rider/become`. That screen
  is only ever reached by an explicit tap.
- **An unverified rider is a full customer.** The rider Account tab carries **"Switch to customer"**
  (D-16) → `router.replace("/home")`, with a confirmation sheet.
- **The rider tab is reachable while unverified.** The board renders a gate `EmptyState` in place of
  the job list; the tab bar, Money and Account tabs stay mounted.

So the constraint holds at the routing level today. What does **not** hold is the *texture* of it —
three specific places where an unverified rider is told something false or handed nothing to do.
Those are P0-3, P1-1 and P1-2 below.

---

## P0 — blocking, or actively wrong today

### P0-1 · `kyc_pending` needs to split in three (N-03)

**Problem.** `kyc_pending` now has no action (correctly — the SDK returns control by itself). But the
Didit SDK can return `cancelled`. A rider who opens verification and backs out at step one lands on a
screen that says *"Your ID check is with Didit"* — which is false, nothing was submitted — with no way
to resume.

**Fix.** One screen id, three drawn states, chosen on whether the rider still owes an action — and,
when they do, on whose fault it is:

| State | When | Copy | Action |
|---|---|---|---|
| `kyc_pending` · **in flight** | SDK returned `completed`; awaiting webhook | "Your ID check is with Didit — riders go online once it's verified." | none (the board polls) |
| `kyc_pending` · **unfinished** | SDK returned `cancelled`, or was never opened | "You haven't finished verifying your ID. It takes about a minute." | **Finish verifying** (primary) |
| `kyc_pending` · **couldn't start** | SDK returned `failed` | "We couldn't open the ID check. This is usually the camera or the connection." | **Try again** (primary) · Contact support (ghost) |

> **Design-review finding (Pass 2).** The first draft of this plan covered only
> `completed` and `cancelled`. The SDK returns **three** outcomes — the third,
> `failed` (`{error: {type, message}}`: camera unavailable, permission denied, network,
> SDK crash), is not the rider's doing and must not be worded as if they abandoned
> something. Collapsing it into "unfinished" would blame the rider for a device fault
> and send them round a loop that fails again for the same reason. It is a distinct
> drawn state.

**Hierarchy for the two new states** (Pass 1 — the plan specified copy and action but
never what the eye lands on first):

1. Icon tile — `id-card` for **unfinished**, `triangle-alert` for **couldn't start**. The
   glyph is the fastest signal of "your move" vs "something broke".
2. Title — the state in the rider's words.
3. One-line message — what it costs them (a minute) or what to check (camera/connection).
4. Primary action.
5. Support ghost — **only** on `couldn't start`. Adding it to `unfinished` invites a
   support call for something one tap solves.

**How the client knows which — the server decides (D6).** The first draft made the *phone* the
authority, via a `kycAttemptState` marker in the encrypted draft. The eng review killed that: a
client-only marker dies on reinstall, diverges across devices, and can contradict what actually
happened. **Didit exposes `GET /v3/session/{session_id}/decision/`**, which returns the session's real
`status`. The server can therefore derive the state instead of trusting a note the phone left itself.

```
  Didit session status          →  drawn state
  ────────────────────────────     ─────────────────────
  In Review / Resubmitted       →  in flight
  Approved / Declined           →  (terminal — not a pending state at all)
  Not Started / Awaiting User   →  unfinished
  In Progress                   →  in flight
  Abandoned / Expired           →  unfinished  (session dead → resume mints a fresh one)
  — call failed / no session —  →  unfinished  (safe default, see below)
```

Exposed on `getMe` as `rider.kycPendingState`. The phone keeps a **hint** copy of the SDK's own result
in `kyc-draft.ts` for instant render on cold start, overwritten by the server's answer as soon as the
first poll lands. Hint, never authority.

`failed` is the one state the server cannot see — a launch failure means the SDK never reached Didit,
so the session still reads `Not Started`. That state is client-only and short-lived: it is the SDK's
`failed` result, held in memory for the current screen, and it degrades to **unfinished** on relaunch.
That is correct: after a restart we genuinely do not know the camera is still broken.

Absent signal ⇒ **unfinished**. Offering a resume to someone actually mid-check costs one wasted tap;
withholding it from someone who cancelled strands them. It deliberately does NOT default to `failed` —
that accuses the device of a fault we have no evidence for, and its copy sends the rider to support.

Per **D4**, none of these three ever increments `kycAttempts`. Only a vendor decline does.

**Render from a pure resolver, not the existing ternary (D8).** The gate branch in
`app/rider/(tabs)/index.tsx:1047-1122` is already a six-deep nested ternary over verified / expired /
failed / locked / manual-mode / pending. Adding three more states inline makes the most-hit rider
screen a nine-deep chain whose only test path is rendering the whole board. Extract
`resolveKycGate(rider, sdkResult)` returning a tagged state first, in its own behaviour-preserving
commit, then render from it. Precedent: `resolveKycRetryFeedback` and `onlineRefusalReason` are
already pure and unit-tested this way.

**Server counterpart.** `retryKyc` must resume, not mint. See P0-2.

### P0-2 · "Finish verifying" must not cost a paid session (N-03, and gap G5 of the KYC plan)

The resume CTA above is worthless — worse, expensive — if every tap mints a new Didit session.
`retryKyc` currently calls `vendor.submit()` unconditionally. Persist the live session reference and
its token, expose them on `getMe`, and only mint a new session when the current one is genuinely
dead (expired or terminal). A resume tap on a live session must cost zero credits.

**The token is a secret, and it has to be stored (D7).** `GET /v3/session/{id}/decision/` returns
`status` and `session_url` but **not** a token — Didit hands `session_token` back only at create time.
The native SDK needs one to reopen a check, so resuming for free requires persisting it. Treat it with
the same care as `DIDIT_API_KEY`:

- New nullable column beside `kycRef` on `Rider`. Never logged, at any level.
- Returned by `getMe` **only** to the owning rider — never in `admin.getKycReview`, never in an audit
  row, never in a webhook echo.
- **Expiry fallback is mandatory:** an expired or rejected token is treated as a dead session and
  mints a fresh one. Without it the resume button becomes a dead button, which is worse than today's
  behaviour — at least a mint always worked.
- Cleared when the session reaches a terminal state, so a verified rider carries no live credential.
- Add it to the erasure path alongside the other rider secrets.

```
  become / retry ──► POST /v3/session/ ──► { session_id, session_token, url }
                                              │         │
                        kycRef ◄──────────────┘         └──────► kycSessionToken (secret)
                                                                   │
  "Finish verifying" ──► getMe → kycPendingState + token ──────────┘
                              │                        └─► startVerification(token)   [0 credits]
                              └─ token expired/absent ──► retryKyc → mint fresh       [1 credit]
```

### P0-3 · Registration needs an exit (N-01)

`Register` (C1·8) / `profile/setup.tsx` has no back, no skip, no sign-out — and it sits immediately
after OTP, so a mistyped number that passed its own code is a trap.

**Fix.** A ghost **"Use a different number"** below Continue: signs the part-session out and returns
to `/phone`. The idiom is already established one screen earlier by the OTP screen's own ghost *Back*,
so this is consistent rather than new. Needs the mock drawn first (§Design work).

### P0-4 · The camera close control (N-02)

`photo_capture` (E·1) draws the ✕ as a 20px glyph with no role, no label, no hit area, absent from
both the hierarchy and accessibility notes — while the shutter beside it is a fully specified 68px
button. It is the only exit from a full-bleed dark camera.

**Fix (design-side, before the screen is ever built).** Promote the ✕ to a specified control: a
button role, `aria-label="Close"`, a drawn hit area, and an entry in the hierarchy note. Since strict
mock sizes now govern, the *mock* must draw a target that clears the touch floor — the app must not
silently inflate it.

> **Design-review finding (Pass 5) — the design system contradicts itself here, and this is the
> screen where it bites.** `docs/DESIGN.md` § Responsive & accessibility states touch targets
> **≥ 44px (52px for primary)**. `CLAUDE.md` § Pixel parity states *"Where a mock draws a control
> smaller than the old 44px floor, the mock wins; `docs/DESIGN-KIT-A11Y-OVERRIDES.md` no longer
> overrides drawn geometry (user decision 2026-08-10)."* Read together, a 20px drawn ✕ is
> simultaneously a violation and the authority. A builder can honestly ship either.
>
> **Resolution proposed:** the 2026-08-10 decision governs *parity* — it stops the app silently
> resizing a mock. It was never a licence for the **design** to draw an under-floor control. So the
> precedence is: the app never inflates a drawn target; the *mock* must draw one that meets
> DESIGN.md's floor. Where a mock currently violates it, that is a **kit defect to report upstream**
> (an UPSTREAM ledger entry), not a size for the app to reproduce. This needs recording in
> `CLAUDE.md` or the contradiction resurfaces on the next small control.

> **Resolved by D3:** the step is re-scoped to a **rider portrait**, so E·1 IS built — and its
> guidance copy changes with it. "Fit the photo page of your ID inside the frame" and "Names and
> numbers readable · no glare · all four corners in" describe a document, not a face. The frame
> becomes a portrait oval and the rules become face-framing rules. The ✕ fix below applies
> unchanged — a portrait capture screen needs an exit exactly as much as an ID capture screen does.

---

## P1 — the constraint's texture

### P1-1 · The switch-to-customer confirmation lies to an unverified rider

The sheet says *"Switching to the customer view takes you offline, so you'll stop receiving nearby
deliveries."* For a rider who has never been verified — and therefore has never been online and has
never received a delivery — both clauses are false. The one bridge the constraint depends on is
guarded by a warning about losing something the rider does not have.

**Fix.** Branch the copy on verified state. Unverified: no warning at all, just switch — there is
nothing to lose. The existing active-job variant stays.

### P1-2 · The unverified board is a dead end, not a waiting room

The gate replaces the whole board with a single `EmptyState`. That is right as far as it goes, but it
gives a rider whose check is genuinely pending nothing to do and nowhere to go except the tab bar —
which is exactly the population the constraint says we want to keep in the app.

**Fix.** Add one ghost row under the gate: **"Order food and send parcels"** → the same
switch-to-customer bridge as the Account tab. Cheap, and it makes the constraint visible where the
rider actually hits it, instead of hiding it two taps deep in Account.

**Explicitly NOT in scope:** letting an unverified rider see or bid on jobs. KYC gates *rides*; that
is the whole point and the server enforces it (`onlineRefusalReason`). This is about not stranding
them, not about loosening the gate.

---

## P2 — system-level, no one is stuck

### P2-1 · Hardware back has no notation (N-04)

`back={false}` removes a drawn chevron and says nothing about Android's back button. Exactly one
screen guards it (`food/checkout.tsx` via `usePlacingGuard`).

**Fix.** Add a second axis to the screen spec, and mark every current `back={false}` screen:

| Class | Drawn back | Hardware back | Today's members |
|---|---|---|---|
| **dismissible** | yes | allowed | every ordinary pushed screen |
| **directed** | no | allowed | `gate_topup` (M2), the KYC gates, **active job (J6/J7) — D1** |
| **held** | no | blocked | checkout-while-placing only |

`usePlacingGuard` already implements *held*. Per **D1** the active-job screens are *directed*, so this
pass is annotation plus one test asserting that classification — **no behaviour change**, which makes
P2-1 far cheaper than the first draft assumed (it had provisionally listed J6/J7 as *held*).

### P2-2 · Four back idioms (N-05)

AppBar chevron · bottom ghost Button · muted chevron+label row · `MapHomeTopBar`. Two are already
logged individually (D-14, D-17) but never reconciled. **Fix:** document when each applies in the
design system rather than collapsing them — the OTP ghost button and the map bar are both deliberate.

### P2-3 · Skip idioms (N-06, N-07)

"Skip" (top-right text, onboarding) vs "Not now" (secondary button, permissions) for the same
meaning; and the customer location step substitutes *"Enter address manually"*, a detour rather than a
decline. **Fix:** one word, one slot, for "past this without doing it" — or a stated reason why a
carousel skip and a permission decline differ.

### P2-4 · The KYC mocks draw no chrome (N-08)

`rider-screens.jsx` contains zero AppBars; `become.tsx` and `documents.tsx` mount a back-only bar the
mock never drew. The app is right and the design is behind. **Fix:** draw the back chevron in the KYC
mocks. Process, not a user-facing bug.

---

## Interaction-state coverage (Pass 2)

`docs/DESIGN.md` § Interaction-state coverage carries rows for Broadcast, Tracking, Offer select and
Signup/OTP — and **no row for rider verification at all**, which is why its states have been improvised
screen by screen. Add this row there as part of this work:

```
FEATURE        | LOADING           | EMPTY                | ERROR                    | SUCCESS        | PARTIAL
---------------|-------------------|----------------------|--------------------------|----------------|------------------
Rider KYC      | "Opening ID       | not-a-rider →        | SDK failed → "couldn't   | verified →     | unfinished →
(SDK, Route A) |  check…" on the   | kyc_intro CTA        | start", camera/network   | gate clears,   | "Finish verifying"
               |  launch tap       |                      | named, Try again         | auto-online    | + resume (no new
               |                   |                      | + support ghost          |                | paid session)
```

Two states in that row do not exist today and are the substance of P0-1: **ERROR** (SDK `failed`) and
**PARTIAL** (cancelled/never-opened). "LOADING" is also currently unspecified — the SDK takes a moment
to open, and a dead-looking button is how a rider taps four times and mints four sessions.

## The unverified rider's arc (Pass 3)

The owner constraint is an emotional requirement, not a routing one. Routing already lets an unverified
rider in (§0). What the plan has to protect is how being un-verified *feels* while they are in.

```
STEP | RIDER DOES               | RIDER FEELS              | WHAT SUPPORTS IT
-----|--------------------------|--------------------------|----------------------------------
1    | Signs in, picks Rider    | ready to earn            | no wall — boot goes to /rider
2    | Sees the KYC gate        | "one thing between me    | honest gate copy + a single
     |                          |  and working"            | primary action
3    | Opens the ID check       | mild exposure — this is  | LOADING state so the tap
     |                          | their real ID            | visibly registers
4a   | Finishes it              | relief                   | verified state, auto-online
4b   | Backs out / phone dies   | "did I lose it?"         | PARTIAL: resume, not restart,
     |                          |                          | and no new charge
4c   | Camera won't open        | "this app is broken"     | ERROR names the cause; support
     |                          |                          | is one tap
5    | Waits for review         | idle, possibly for days  | P1-2: a way to use the app as a
     |                          |                          | customer meanwhile
```

Step 5 is where the constraint actually lands. A rider held in manual review for two days with a
single dead EmptyState learns the app is not for them yet — and the fix is one ghost row (P1-2),
not a re-architecture.

## Accessibility (Pass 6)

The plan named `aria-label="Close"` for the ✕ and nothing else. Required additions:

- **Focus on return.** When the SDK hands control back, focus must land on the new state's primary
  action (or its title when there is none). Unspecified, focus returns to the top of the tree and a
  screen-reader user hears the tab bar, not the answer to what just happened.
- **Every back affordance carries a label.** `AppBar` already sets `accessibilityLabel="Back"`;
  `wallet/top-up.tsx` sets `"Back to Money"`. The new registration exit (P0-3) needs one, and the
  drawn ✕ needs `"Close"` in the mock, not just in the app.
- **State changes announce.** The pending → verified transition happens while the rider is looking at
  the screen; it needs `accessibilityLiveRegion` / `role="status"` so it is not a silent repaint.
- **320px entry-phone check.** CLAUDE.md mandates it alongside 360×720. The `couldn't start` state
  carries the longest copy of the three and two actions — it is the one most likely to overflow.
- **Touch targets** per the precedence resolved in P0-4.

## Design work required (must land before the app work)

1. `kyc_pending` **unfinished** variant — new drawn state (P0-1).
2. `Register` exit affordance (P0-3).
3. `photo_capture` ✕ promoted to a specified control (P0-4).
4. Back chevron drawn on the KYC cluster (P2-4).
5. Screen-class annotation on `back={false}` screens (P2-1).

Each touches `packages/design/**`, so each PR needs a matching `docs/DESIGN-DEVIATIONS.md` entry or
`design-freeze` fails. **Upstream sync remains owed** — the Claude Design project still holds the
pre-2026-08-20 KYC cluster (see D-33's warning); these edits compound that debt and must be replayed
there together.

## Sequencing

**Three PRs, in dependency order (D5).** The Step 0 complexity check tripped — 13 tasks, ~20 files,
three subsystems. Nothing is cut; it ships in reviewable slices, each independently revertable.

| PR | Phase | Work | Gate |
|---|---|---|---|
| **1 · design kit** | 1 | T1-T3: the three pending states, the registration exit, the capture ✕ + portrait re-caption | `design-freeze` green, rendered mocks attached |
| **2 · api** | 2 | T4-T5: session-token persistence + `kycPendingState` derivation + the D4 attempt-lock test | webhook + resume regression tests |
| **3 · mobile** | 3 | T6-T8: `resolveKycGate` extraction (own commit), the three states, switch-copy, customer bridge | parity sheets, `gates.test.tsx` |
| — | 4-5 | T9-T13: docs, screen-class notation, idiom consistency | — |

**PR 2 has no design dependency and can start immediately** — it is pure server work with its own
tests. PR 3 depends on both. Within PR 3, the `resolveKycGate` extraction lands as a separate
behaviour-preserving commit before any new state is added (D8).

### Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Design kit | `packages/design/`, `docs/` | — |
| API | `apps/api/src/riders/`, `apps/api/src/kyc/`, `apps/api/prisma/` | — |
| Mobile | `apps/mobile/app/`, `apps/mobile/src/` | design kit, API |
| Docs | `docs/`, `CLAUDE.md` | — |

`Lane A: design kit → mobile` · `Lane B: api` · `Lane C: docs (independent)`

Launch A and B in parallel worktrees; B has no shared module with A. Merge both, then mobile.
**Conflict flag:** Lane A and Lane C both touch `docs/` — A writes `DESIGN-DEVIATIONS.md`, C writes
`DESIGN.md` and `CLAUDE.md`. Different files, but land A first so the ledger entry exists before the
docs pass references it.

## What already exists (reuse, do not rebuild)

- **`EmptyState`** (`packages/design/components/feedback/EmptyState.jsx`) — icon tile, title, message,
  optional children. Renders correctly with **no** children, which is exactly the `in flight` state.
  All three P0-1 states are this component with different props. No new component needed.
- **`AppBar`** — back chevron with `accessibilityLabel="Back"` and hitSlop already recovering the
  kit's 32px footprint to 48px. The registration exit (P0-3) should not invent a fourth idiom.
- **`usePlacingGuard`** (`src/logic/use-placing-guard.ts`) — hardware-back blocking already exists and
  is tested. P2-1 is applying it per the spec, not writing it.
- **`kyc-draft.ts`** — encrypted on-device draft with a resume marker. P0-1's `kycAttemptState` is one
  more field on a store that already survives app kills.
- **`SupportCallRow`** — the `tel:` support affordance from `gate_kyc_locked`. Reuse for the
  `couldn't start` ghost.
- **`ONLINE_GATE_COPY` / `onlineRefusalReason`** — the server-side gate vocabulary. P1-2 must not
  invent parallel copy.

## NOT in scope (considered, deferred)

- **Collapsing the four back idioms into one** (N-05) — the OTP ghost button and the map top bar are
  both deliberate and drawn that way; forcing one idiom would break two mocks to fix a consistency
  smell nobody is stuck on. Document when each applies instead.
- **Blocking hardware back on active jobs** — P2-1 adds the *notation*; whether J6/J7 are `directed`
  or `held` is a product call, listed under Unresolved.
- **Redesigning the KYC gate into a progress checklist** — tempting, but the gate is one step, and a
  checklist of one is theatre.
- **Anything inside the Didit SDK** (D-34) — its internal navigation is Didit's, configurable only via
  `showCloseButton` / `showExitConfirmation`. The seam is in scope; the screens are not.
- **Onboarding carousel redesign** — N-06 is a label/slot consistency fix, not a re-think of the
  carousel.

## Decisions taken (owner, 2026-08-20, during the design review)

| # | Decision | Consequence for the build |
|---|---|---|
| **D1** | Active jobs (J6/J7) are **directed**, not held | No drawn back arrow; Android back stays allowed. Matches today, so no code change — just the annotation. A rider in trouble always has an exit, and the tab bar leaves anyway, so blocking one gesture would be theatre. |
| **D2** | **The 44px floor governs the design; an under-floor mock is a kit defect** | The 2026-08-10 "mock wins" decision is scoped to *parity* — it stops the app silently resizing a mock. It is not licence for the kit to draw an unusable control. App never inflates; a below-floor mock gets an **UPSTREAM** ledger entry and an upstream fix. **Write this into CLAUDE.md** or it resurfaces. |
| **D3** | The in-app photo step is **re-scoped to a rider portrait**, not retired | The capture/upload/draft-resume chain stays; only the guidance copy changes (ID-readability → framing a face). Keeps the admin reviewer sighted for `KYC_MODE=manual`, and resolves the pre-existing inconsistency where `documents.tsx` already calls this row "Rider photo". E·1/E·2/E·3 stay in the gallery, re-captioned. |
| **D4** | An SDK **launch failure never increments `kycAttempts`** | Only a real vendor decline counts toward the A-02 two-attempt lock. A device fault is not evidence about the rider's identity. Retries stay bounded by the existing 5/hour throttle. Needs an explicit test — the invariant is currently unwritten, so a future refactor could quietly break it. |

D4 was surfaced by this review and is the sharpest of the four: `kycAttempts` increments on decline
today, and nothing says a `failed` launch is different. Left unwritten, a broken camera becomes a
permanent lockout.

## Unresolved decisions

None. All four decisions surfaced by this review were taken above.

## Implementation Tasks

Synthesized from this review's findings. Each derives from a specific finding above.

- [x] **T1 (P1, human: ~1d / CC: ~40min)** — design kit — draw the three `kyc_pending` states
  - Surfaced by: P0-1 + Pass 2 — the SDK's `failed` outcome had no drawn state at all
  - Files: `packages/design/explorations/journey/rider-screens.jsx`, `rider-map.jsx`, `_ds_bundle.js`, `docs/DESIGN-DEVIATIONS.md`
  - Verify: all THREE render — `node tools/parity/render-mock.mjs --src RJ --id kyc_pending`, then
    `--id kyc_unfinished` and `--id kyc_cant_start`; plus `check-design-freeze` and the
    screen-inventory guardrail (both new ids adopted, neither silently uncovered)
- [x] **T2 (P1, human: ~2h / CC: ~20min)** — design kit — registration exit affordance
  - Surfaced by: P0-3 / N-01 — violates DESIGN.md's own "easy error recovery (retry, edit, go back)"
  - Files: `packages/design/explorations/journey/screens.jsx` (Register C1·8), bundle, ledger
  - Verify: render `LJ.register` at 360×720 and 320×640
- [x] **T3 (P1, human: ~2h / CC: ~20min)** — design kit — promote the capture ✕ to a control, re-caption E·1 for a portrait
  - Surfaced by: P0-4 / N-02, and D3 (portrait re-scope changes the frame and the three rules)
  - Files: `rider-screens-safety.jsx` (PhotoCapture/PhotoPreview), `rider-map.jsx` E·1–E·3, bundle, ledger
  - Verify: rendered mock shows a ≥44px labelled close control
- [x] **T4 (P1, human: ~1d / CC: ~1h)** — api — resume a live KYC session instead of minting one
  - Surfaced by: P0-2 — the resume CTA is worthless if every tap costs a paid session
  - Files: `apps/api/src/riders/rider.service.ts` (`retryKyc`), `auth.service.ts` (`getProfile`), `kyc/didit-kyc-vendor.ts` (read `session_token`), prisma schema
  - Verify: `rider.service.spec.ts` — a resume on a live session calls `vendor.submit` zero times
- [x] **T5 (P1, human: ~30min / CC: ~10min)** — api — assert a launch failure never increments `kycAttempts`
  - Surfaced by: **D4** — currently an unwritten invariant, so a refactor could silently create a lockout
  - Files: `apps/api/src/riders/rider.service.spec.ts`
  - Verify: the new regression test fails if the increment is ever added
- [x] **T6 (P1, human: ~1d / CC: ~45min)** — mobile — the three pending states + SDK result mapping
  - Surfaced by: P0-1, Pass 2 (LOADING unspecified), Pass 6 (focus on return)
  - Files: `app/rider/(tabs)/index.tsx`, `src/logic/gates.ts`, `src/logic/kyc-draft.ts` (`kycAttemptState`)
  - Verify: `gates.test.tsx` — every resolved state (`in_flight` / `unfinished` / `cant_start`),
    each SDK outcome (completed / cancelled / failed), the precedence between them (terminal
    server states outrank the SDK; `failed` outranks the server because the server cannot see
    it), and the absent-signal fallback to `unfinished`. Plus board-level copy assertions: the
    three walls must say three different things, not just carry three different buttons.
- [x] **T7 — CHECKED, DOES NOT REPRODUCE** (2026-08-20, PR #843). No copy change was needed.
  - Surfaced by: P1-1 — the sheet warns an unverified rider about losing something they never had
  - **Finding:** the warning is real but that rider never sees it. The sheet is gated on
    `isOnline || activeJob`, and the server refuses to put an unverified rider on shift at all
    (`onlineRefusalReason`), so `isOnline` cannot be true for them — they switch straight through.
  - Files: `app/rider/(tabs)/__tests__/account.test.tsx` — the invariant is now pinned by a test, so
    the risk (a future change making the sheet reachable pre-verification) is caught rather than
    re-argued.
- [x] **T8 — REFUSED, needs an owner ruling to proceed** (2026-08-20, PR #843).
  - Surfaced by: P1-2 / Pass 3 step 5 — the owner constraint's actual landing point
  - **Conflict:** the owner removed the customer bridge from this exact screen on **2026-08-16**,
    from a photo of it — *"move 'Back to customer' off this screen onto the Account tab"*. The newer
    constraint that motivated P1-2 (*"not finishing KYC should not stop a rider from logging in"*) is
    about **login**, which KYC already does not block. It does not override the older decision.
  - It was built first — design-kit ghost on `kyc_pending`, a D-36 ledger entry, and the render — and
    then backed out on finding the standing decision. To land it, the owner has to reverse 2026-08-16;
    it then needs the mock and the ledger entry again.
  - **The near-miss is the lasting output.** The absence tests named the string `"Back to customer"`,
    so re-adding the bridge as `"Order food and send parcels"` passed every one of them. They now pin
    the whole action set per wall, so any new action on a KYC wall fails on purpose.
- [x] **T9 (P2, human: ~2h / CC: ~20min)** — docs — record the touch-target precedence
  - Surfaced by: **D2** / Pass 5 — DESIGN.md and CLAUDE.md currently contradict each other
  - Files: `CLAUDE.md`, `docs/DESIGN.md`
  - Verify: n/a (documentation)
- [x] **T10 (P2, human: ~2h / CC: ~20min)** — docs + tests — screen-class notation
  - Surfaced by: P2-1 / N-04, narrowed by **D1** to annotation only
  - Files: `docs/DESIGN.md`, one test per `held` screen
  - Verify: the held-screen test asserts `usePlacingGuard` is mounted
- [x] **T11 (P3, human: ~1h / CC: ~15min)** — docs — when each back idiom applies
  - Surfaced by: N-05 — four idioms ship, two logged separately, never reconciled
  - Files: `docs/DESIGN.md`
- [x] **T12 — resolved as the "stated reason" branch, not the "one word" branch** (2026-08-20).
  - Surfaced by: N-06 / N-07
  - The three variants are drawn that way in the mocks, and the difference tracks what the tap costs:
    **"Skip"** (top-right text) skips *marketing* — no consequence, so the lowest possible weight;
    **"Not now"** (secondary button) declines a permission — a real decision, worded as re-askable;
    **"Enter address manually"** is not a decline at all but the alternative route to the same
    outcome, and replacing it with "Not now" would leave the customer with no pickup pin and no way
    forward. One word per *meaning*, not one word everywhere — recorded in `docs/DESIGN.md`.
  - No app or kit change: unifying the wording would have *introduced* drift from the mocks.
- [x] **T13 (P2, human: ~30min / CC: ~10min)** — design kit — add the KYC row to DESIGN.md's state table
  - Surfaced by: Pass 2 — the table has Signup/OTP but no verification row, which is why its states were improvised
  - Files: `docs/DESIGN.md`

---

## Test coverage (eng review, section 3)

Framework: jest + jest-expo (mobile, 182 suites / 1437 tests), vitest (api). Detected from
`apps/mobile/jest.config.js` and `apps/api` specs.

```
CODE PATHS                                          USER FLOWS
[+] apps/api rider.service.retryKyc()               [+] Finish an interrupted check
  ├── live token  → reuse, 0 credits    [GAP]         ├── [GAP] cancel → resume → verified
  ├── expired tok → mint fresh          [GAP]         ├── [GAP] cancel → app kill → relaunch → resume
  ├── terminal    → 409 (existing)      [★★ :463]     └── [GAP] resume after token expiry
  └── CAS 0 rows  → 409 (existing)      [★★ :524]
[+] apps/api deriveKycPendingState()                [+] SDK launch fails
  ├── In Review/In Progress → in flight [GAP]          ├── [GAP] camera denied → "couldn't start"
  ├── Not Started/Awaiting  → unfinished[GAP]          └── [GAP] retry after fixing permission
  ├── Abandoned/Expired     → unfinished[GAP]
  └── decision call throws  → unfinished[GAP] ←CRITICAL: fail-open, must not wedge
[+] apps/mobile resolveKycGate()                    [+] Unverified rider uses the app
  ├── verified / expired / failed / locked [GAP: refactor, was inline]
  ├── manual-mode pending                  [GAP]      ├── [GAP] gate → customer bridge → /home
  └── in flight / unfinished / couldn't start [GAP]   └── [GAP] switch-copy differs when unverified
[+] apps/api kycAttempts invariant
  └── launch failure must NOT increment  [GAP] ←CRITICAL (D4)

COVERAGE: 2/18 paths tested (11%)  |  Code paths: 2/12  |  User flows: 0/6
QUALITY: ★★:2  |  GAPS: 16 (2 critical, 3 →E2E)
```

`[→E2E]` candidates: the three multi-step resume journeys — they span SDK, draft store, API and the
board, and mocking the seam is exactly where a real failure would hide.

## Failure modes

| # | Codepath | Realistic production failure | Test? | Handled? | Rider sees |
|---|---|---|---|---|---|
| F1 | `deriveKycPendingState` | Didit's decision endpoint times out or 5xx | **no** | **must add** | **CRITICAL if unhandled — a blank or wedged gate.** Fail open to `unfinished`: the rider gets a working resume button, which is never wrong to offer |
| F2 | token reuse | Stored token expired; SDK rejects it | **no** | **must add** | Without the D7 fallback: a dead button. With it: a fresh session, one credit |
| F3 | `kycAttempts` | A refactor makes a launch failure increment it | **no** | **must add (T5)** | Silent permanent lockout after two broken-camera taps |
| F4 | getMe | Decision call fires on every 5s poll | n/a | **must add** | Nothing visible — but it burns vendor requests and slows the poll. Guard: only call while `kycStatus=pending` **and** at most once per 30s |
| F5 | `resolveKycGate` | A state combination falls through to no branch | **no** | **must add** | A blank gate: no explanation, no action, on the screen every new rider hits |

**F1, F3 and F5 are critical gaps** — no test, no handling, and each fails *silently*. F1 and F5
render nothing; F3 locks an account with no signal. All three get tests in their own PR.

## Performance

One finding, F4 above. The Didit decision endpoint is a paid, rate-limited call (Didit's own docs
call polling "slower, costs more requests" versus webhooks). The board polls `["me"]` every 5s while
pending, so a naive derivation would fire ~720 vendor calls per rider per hour. Guard it: derive only
while `kycStatus = "pending"`, memoise against `kycResolvedAt`, and cap at one call per 30s per rider.
The webhook stays the primary signal; the decision endpoint is a reconciliation fallback, not a poll.

No other performance findings — the change adds one nullable column, no new queries on hot paths, and
no N+1 (the derivation is per-rider, on a screen only unverified riders see).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 5 issues, 3 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score 5/10 → 9/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE VOICE:** not run. Codex CLI is not installed in this environment, and the documented
Claude-subagent fallback was not used because this session carries a standing instruction not to
spawn subagents unrequested. Neither review has an independent second opinion. To add one:
`npm install -g @openai/codex` then re-run, or ask for the subagent explicitly.

**VERDICT:** DESIGN CLEARED. ENG **NOT CLEAR** — 3 critical failure modes (F1 decision-endpoint
failure, F3 the `kycAttempts` invariant, F5 gate fall-through) have no test and no handling today.
They are specified above and assigned to PR 2 and PR 3; eng review re-runs clean once those tests
exist. All 8 decisions (D1-D8) are resolved and recorded.

NO UNRESOLVED DECISIONS
