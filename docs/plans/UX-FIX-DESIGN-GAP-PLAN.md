# Lynia — UX Fix Plan × Design-Coverage Gap Analysis

_Cross-references the bug-fix solutions (`docs/JOURNEY-BUGS.md`, `docs/BUG-HUNT.md`) against the design
package (`packages/design` — the 34-screen customer journey map, 41-screen rider map, the `app.js`
prototype, and the admin/support kits) to answer one question: **for each solution, do we already have a
mockup, or does a new UI need designing?**_

_Verified line-level against the mockup sources. Two gstack reviews are appended at the end._

## How to read this

Every fix falls into one of three buckets:

- ✅ **DESIGNED — build it.** A mockup already exists; the bug is that the screen was never wired up. No
  new design work — this is engineering.
- 🟡 **PARTIAL — extend a mockup.** The base screen exists but the specific state (a resend timer, an
  escalation, an error) isn't drawn. Small design add-on.
- ❌ **ABSENT — design it in Claude.** No mockup anywhere. These are the screens to create.

The headline: **the design package is more complete than the app.** Most of the worst journey bugs are
_designed-but-not-built_, not design gaps. The genuine design gaps cluster into (a) rider go-online gate
states, (b) the trust/safety surfaces PR #98 shipped in code with **no mockup**, and (c) a couple of
customer auth/tracking states.

---

## 1. Coverage verdict — every solution

### ✅ DESIGNED — build the existing mockup (no new design needed)

| Fix | Mockup that already exists | Source |
| --- | --- | --- |
| **R1** rider "can't deliver" + reason picker (unreachable/refused/wrong-address/breakdown) | **"Couldn't deliver"** reason-picker screen | `rider-screens.jsx` (Undelivered) |
| **R9** delivery-OTP attempts-remaining + lockout | **"That code doesn't match. 4 attempts left."** | `rider-screens.jsx` (HandoffWrong) |
| **R2** rider cancel only pre-pickup | **"Cancel this job?"** is designed as a pre-pickup-only bail; post-pickup the map has no cancel — the design already matches the intended rule | `rider-screens.jsx` (JobBail) |
| **R6** "you've been hired" on selection | **"A customer picked you!"** | `rider-screens.jsx` (Picked) |
| **R8** customer-cancelled / hand-back | **"The customer cancelled"** hand-back screen | `rider-screens.jsx` (JobCancelled) |
| **C5** expired auction → re-broadcast carrying the order | **"No riders took this price yet" → Nudge price & re-broadcast** | `screens.jsx` (auction expired) |
| **C7** re-issue / reveal delivery code | **"Re-issue delivery code"** | `screens.jsx` (track_code) |
| **C12** new-customer profile setup (`needsProfile`) | **"Tell us who you are"** (Full name + National ID) | `screens.jsx` (profile registration) |
| **C8/C9** location denied / no GPS | **"Can't find your location"** | `screens.jsx` (system edge) |

> These nine are the highest-impact bugs (R1 + R2 are the post-pickup dead end; C12 is the missing
> name-entry). **None needs a designer** — they need the already-drawn screen wired into the app. Point
> engineering at the cited mockups.

### 🟡 PARTIAL — extend an existing mockup

| Fix | Base exists | What's undrawn |
| --- | --- | --- |
| **C4** customer "rider went dark → call your rider" | **"Live position paused…"** (track_paused) | the ~2-min **escalation** to an explicit call-your-rider state is described in body copy + a map annotation, never drawn |
| **KYC photo** capture/preview/retake/upload-error | KycForm shows "Photo added — retake" | no camera / preview / upload-failure / retake-preserve states |
| **C1** map fails to render | address search + "Can't find your location" both exist as fallbacks | no explicit **"map couldn't load — search or type the address"** message when the tile itself fails |

### ❌ ABSENT — design these in Claude (the actual missing-mockup list)

See §2 for full briefs. In short: **4 rider go-online gate states**, **3 trust/safety surfaces**, and
the **customer OTP-resend** state.

---

## 2. Missing UI designs to create in Claude

Each brief is scoped so you can hand it straight to Claude's design tooling. All reuse the LyniaGo design
system (`Button`, `Card`, `StatusPill`, `Field`, `EmptyState`, `Skeleton`, `OfflineBanner`, `Stepper`,
brand tokens). Copy is calm, second person, sentence case, no emoji — match the existing screens.

### Cluster A — Rider go-online gate states (4 screens, one shared template)

The rider online-gate refuses for reasons `kyc | suspended | on_hold | cooldown | banned` (+ out-of-area),
but only the generic **"Your account is on hold"** screen is drawn. Design the four missing variants —
all the same `EmptyState` template (icon + title + message + actions), differing in copy, icon, and which
actions show.

- **A1 · Out-of-area** (fix R10) — icon `circle-alert`; "You're outside the service area"; message: you can
  only go online inside the Harare service area; primary action **Refresh status**. _Nearest reference:_ the
  customer out-of-service-area notice + "Can't find your location".
- **A2 · Cooldown** — icon `clock`; "You're on a cooldown"; message: taken offline after a recent
  cancellation, back online in about 2 hours (render the actual `cooldownUntil` as a concrete time, per
  the fix already shipped in `gates.ts`/`job.tsx` toast copy — never "a few minutes"); primary **Try again**
  (retry the toggle). _Reference:_ "Your account is on hold".
- **A3 · Banned (permanent)** — icon `triangle-alert` (danger); "Your account is closed"; message + a
  **Contact support** action. PR #98 already added the `banned` gate reason **in code with no mockup** —
  this screen aligns the shipped behaviour.
- **A4 · KYC attempt-lock** (fix R4) — icon `triangle-alert`; "Verification locked"; message: reached the
  retry limit, contact support to finish; **Contact support** action. Code enforces the 2-attempt lock
  today with only a "Refresh status" button.

**Shared requirement across A3, A4 _and_ the existing on-hold/suspended screens (fixes R4/R5): a real,
tappable "Contact support" action** (WhatsApp/`tel:` deep-link). Today every "contact support" line is
dead text. Add the action to the template so all gate states inherit it.

### Cluster B — Trust/safety live-trip surfaces (3 screens — shipped in #98 with NO mockup)

PR #98 added **SOS**, **report/block**, and **get-help / raise-issue** to the live customer-order and
rider-job screens **in code**, but the journey maps flag all three as **ABSENT** (rider-map GAP "Rider SOS
/ report", P1). These need mockups both to align the already-shipped UI and to design the states properly.

- **B1 · SOS** (both roles, live trip) — a deliberate, guarded emergency control → confirm sheet → the
  contacts returned (local emergency number + staffed Lynia safety line as `tel:` rows). States: idle
  control, confirm, contacts shown, error. _Highest priority — safety-critical and currently undrawn._
- **B2 · Report + block a counterparty** (both roles, post-trip) — report reason + optional block; the
  confirmation. _Note:_ the maps have a "block" mention only, no report flow.
- **B3 · Get help / raise issue** (order-level support) — "Get help with this trip" from the customer
  order and rider job screens → issue-type picker → submitted state. Distinct from the account-level
  **Help** (WhatsApp) screen, which already exists.

### Cluster C — Customer OTP resend

- **C-OTP · Resend code + cooldown** (fix C3) — extend the **"Check your WhatsApp"** screen with a
  **Resend code** affordance, a visible countdown while it's on cooldown, and the expired/locked-code
  copy + recovery. Today the screen has only Verify + Back, so an un-arrived or expired code is a dead end.

### Cluster D — Customer "rider went dark" escalation (fix C4)

- **D-dark** — the escalated variant of **track_paused**: muted rider marker + a warning banner + a
  **Call your rider** CTA, shown once the rider's position is stale past ~2 min. The transient paused
  state is drawn; this escalation is only described.

### Cluster E — KYC photo capture states (fix P3 upload/retake)

- **E-photo** — camera/preview/retake/upload-failure states for the ID photo, so a failed or slow upload
  is recoverable and a retake never wipes a good photo. KycForm only shows the success ("Photo added").

---

## 3. Priority for design work

1. **B1 SOS** — safety-critical, live in code, no design. Draw first.
2. **A1–A4 gate states + the shared Contact-support action** — riders currently hit dead ends with no way
   out (R4/R5/R10). One template, four variants.
3. **B2/B3 report + get-help** — align the shipped #98 UI.
4. **C-OTP resend** — common, everyday friction.
5. **D-dark escalation**, **E-photo** — polish, but real.

Everything in §1's ✅ table is **engineering, not design** — schedule those independently; they don't block
the designer.

---

## 4. Open questions for the reviews

- Does the "Contact support" action deep-link to WhatsApp (matches the existing Help screen) or `tel:`?
- Should the four gate states be four screens or one parameterised screen with a reason prop (the code
  already models it as one `EmptyState` keyed on a reason)?
- SOS: is "Call 999" the correct local emergency number for the Zimbabwe pilot, and what is the staffed
  Lynia safety line?

---

## GSTACK REVIEW REPORT

_Run 2026-07-05 on this branch. gstack designer binary was `DESIGN_NOT_AVAILABLE`, so the design review
ran text-only — visual mockup generation is deliberately left to the Claude-design handoff (the §2 briefs)._

---

### gstack `/plan-design-review` — designer's eye, rated 0–10

Reviewing the plan's UX decisions and the design specs in §2 (not re-reviewing the app itself).

| # | Dimension | Score | What would make it a 10 |
| --- | --- | --- | --- |
| 1 | Flow & information architecture | **9** | The build-vs-design split is the strongest thing here — it stops us redrawing screens that already exist. Add a one-line flow-position note per missing screen (where it sits in the journey) so the designer isn't reverse-engineering entry/exit. |
| 2 | State coverage (empty/error/terminal/edge) | **7** | B1 SOS lists idle/confirm/contacts/error — good. But the gate states (A1–A4) and OTP-resend are named without their _full_ state set: A3 banned and A4 lock are **dead-end empty states** and, per gstack principle #1, a dead end still needs warmth + a real exit (the Contact-support action is the exit — make it mandatory, not optional). Specify the OTP screen's four states: idle, counting-down, resend-sent, expired/locked. |
| 3 | Visual hierarchy | **6** | No screen brief says what the rider/customer sees _first_. For SOS under stress (one hand, panic) the "Call 999" row must be the single dominant element — say so. For the gate states, the title + the exit action are the hierarchy; the "why" copy is secondary. Name first/second/third per screen. |
| 4 | Design-system consistency | **9** | Correctly routes everything through existing DS primitives (EmptyState, Button, Field, StatusPill) and cites the nearest reference screen each time. Lock it further: state the exact icon token per gate (the plan already does for A1–A4 — extend to B1–B3). |
| 5 | Copy & voice | **8** | "Calm, second person, sentence case, no emoji" matches the shipped screens. Gap: the banned/lock copy needs to avoid a punitive tone while still being final; draft the actual sentences in the brief so the designer isn't inventing compliance-sensitive wording. |
| 6 | Accessibility & touch targets | **5** | Not specified anywhere. SOS is the sharp case: large touch target, screen-reader label ("Emergency — call for help"), and it must work with one hand and high-contrast. Every gate EmptyState needs a screen-reader-legible title and a ≥44px action. Add an a11y line to each brief. |
| 7 | Design completeness (Boil the Ocean) | **8** | The plan resists shortcuts (all four undelivered reasons, all four gate reasons). One lake still half-filled: the **KYC photo-capture states (E)** are noted as "partial" but not spec'd — list them (capture/preview/uploading/failed/retake-preserve) so they're designed in one pass, not trickled. |

**Overall design completeness: 7.4/10.** Strong bones — the plan's real contribution is proving most bugs
are build-not-design, then scoping the true gaps tightly. It loses points only on the cross-cutting
specifics gstack always checks: hierarchy-per-screen, accessibility, and the full state set for the
dead-end and emergency screens.

**Top 3 design fixes before you draw:**
1. **Make "Contact support" a required element** on A3/A4 (and retrofit it to the existing on-hold/suspended
   screens) — a dead end without an exit is the #1 design failure here, and it's also bug R4.
2. **Spec SOS for the stressed one-handed user** — dominant Call-999 row, a11y label, works offline
   (the `tel:` rows must render even if the `/sos` POST fails).
3. **Design the four gate states as ONE reason-keyed `EmptyState`** (icon/title/copy/actions as props) —
   matches the code (`gates.ts` already keys on a reason) and is the answer to your own §4 question.

---

### gstack `/plan-eng-review` — eng-manager's eye

**Scope check.** Appropriately scoped — fixes and one small new flow, no rewrites. The build-vs-design
separation is the correct call and saves the most time. No shortcut smell; proceed.

**Architecture & data flow.**
- **R1 undelivered** is the cleanest win: the server endpoint already exists (`order-lifecycle.service.ts`
  `markUndelivered`, a guarded CAS) and the mockup exists ("Couldn't deliver"). The only work is a mobile
  `markUndelivered` in `src/api/orders.ts` + wiring the reason-picker screen. Reuse, don't rebuild.
- **Gate states** should be one component keyed on `OnlineRefusalReason` — the API already returns
  `{ reason, message }` and `gates.ts` already maps it. Add `out_of_area` + `banned` to the union and the
  screen falls out for free. Don't build four screens.
- **B1–B3 trust/safety**: the API contracts already shipped in #98 (`safety.ts` `raiseSos`/`reportUser`/
  `raiseIssue`). The design MUST match those payloads/returns or you'll rework the client — call this out
  in each brief so the designer designs to the real contract.

**Edge cases & failure modes.**
- **OTP resend (C3):** resend must re-issue server-side (new code, reset attempt counter). Confirm the
  request path resets the 5-attempt lock; otherwise a resend into a locked record is a silent dead end.
- **SOS (B1):** the emergency numbers must render even if `POST /orders/:id/sos` fails or the device is
  offline — treat the log call as best-effort and hard-code/return-cache the `tel:` targets. A safety
  control that needs a successful network round-trip to show a phone number is a defect.
- **R1 undelivered:** the mobile submit can race the server CAS (order already `delivered`/`cancelled`) —
  surface the resulting conflict as a clean "this order already closed" state, not a raw error.

**Test coverage.** `gates.ts` is already unit-tested — extend it for `out_of_area`/`banned`. Add a mobile
test for the undelivered flow (reason → API → terminal) and for the OTP-resend cooldown. The undelivered
server CAS is already integration-tested; the gap is client-side.

**Sequencing (risk-first).** 1) **B1 SOS** — safety-critical and live-in-code-without-design. 2) **R1 + R2**
— the post-pickup dead end, the worst everyday failure. 3) **A-cluster gate states + shared support
action** (R4/R5/R10). 4) **C3 OTP resend**. 5) **D/E** polish. The ✅ "build the existing mockup" items
(R9, C5, C7, C12) can run in parallel — they don't block the designer.

**Completeness.** Don't half-ship: undelivered needs all four reasons; the gate component needs all
reasons incl. the shared support action; SOS needs the offline path. All cheap with CC+gstack — do the
complete version.

**Verdict: mergeable plan, proceed.** No P0 in the plan itself. The one architectural risk is retrofitting
designs onto the already-shipped #98 safety/report contracts — design to those payloads. Build the ✅ list
now (engineering, no designer needed); design the ❌ list in Claude against these briefs.

_Status: DONE_WITH_CONCERNS — proceed, with the three design fixes (support-action exit, SOS offline/a11y,
one reason-keyed gate screen) folded into the briefs before drawing._
