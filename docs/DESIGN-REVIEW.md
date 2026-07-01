# Lynia — Design Review Log

> **Living log of the design reviews** across the gstack sprint, oldest stage first: **Plan/Design** (the
> design system + customer-side review) → **Build** (the two-sided design consultation + post-build static
> pass) → **Ship** (the ship-prep visual QA + post-launch design lens). Each pass is a gstack
> `/plan-design-review` / `/design-review`-style run.
>
> This is the **review** record — verdicts, scores, findings, and their resolutions. The **spec it
> calibrates against is `docs/DESIGN.md`** (tokens, components, IA, the §5c stepper, the two-sided journey,
> the `DT1`–`DT13` build-task table). Companions: `docs/CEO-REVIEW.md`
> (product), `docs/ENG-REVIEW.md` (engineering), `docs/CONCEPT.md` (§5c/§5d/§6 the design realises). For
> live build status see `docs/PILOT-READINESS.md`.

| # | Stage | Date | Score / verdict |
|---|-------|------|-----------------|
| 1 | **Plan/Design** — system + customer side | 2026-06 (pre/early build) | System locked; empty-states flagged as the highest-leverage screens. |
| 2 | **Build** — two-sided consultation + post-build pass | 2026-06-27 | Full journey specced (DT8–DT13); error-state-honesty P1 fixed. |
| 3 | **Ship** — ship-prep QA + post-launch lens | 2026-06-29 | onAccent **8/10**, skeletons **5→improved**; cutover UX catch shipped. **Design score 9/10.** |
| 4 | **KYC onboarding** — rider verification UX | 2026-06-30 | Gate is honest &amp; good; **two stop-ships** for self-serve (un-enterable Photo URL, failed-KYC dead-end) → Phase-3. |
| 5 | **Phase-3 build** — KYC hand-off polish | 2026-06-30 | The §4 P0s already shipped; the in-app browser hand-off + auto-poll-while-pending P1s now land. |

> **Direction (constant across every pass):** *clean utility + a warm accent* — trust through clarity, tuned
> for a low-trust cash market on cheap Android phones and expensive data. No pass has reinvented the tokens or
> components; each calibrates against the same locked system in `docs/DESIGN.md`.

---

## 1. Plan/Design stage — design system + customer-side review

> Seeded by the gstack `/plan-design-review` stage, after the plan-stage CEO review flagged UI scope as a
> WARNING (S11: "empty states are the most important screens and aren't designed"). Output: the living design
> system (`docs/DESIGN.md`) + the customer-journey review.

### What this pass locked

- **The design system** — tokens (color/type/spacing/radius), the **Manrope** typeface (deliberately not a
  system font), tabular numerals for fares/ETAs/ratings, the 8pt grid, and the component set (Primary CTA,
  Input-with-visible-label, Offer/Rider cards, Status stepper, Map bottom-sheet, Skeleton). All in
  `docs/DESIGN.md` — **the calibration baseline for every later pass.**
- **Four locked design decisions** — D-a clean-utility + warm accent; D-b map-anchored home + scannable LIST
  for offer compare; D-c light/sunlight-contrast/data-light (dark mode deferred); D-d blended best-match
  default sort + a sparing 'recommended' marker (resists a race-to-the-bottom while keeping "customer always
  selects", CEO D5).

### The high-leverage finding — empty states

The review's central call, echoing CEO S11: **the empty states are the most important screens**, and a
dead-end must become an action.

- **No offers / window expired** — calm card, *"No riders took this price yet."* Primary: **Nudge price &
  re-broadcast**. (Turns the offer-loop dead-end into the re-broadcast prompt the concept needs.)
- **No riders online** — *"No riders online in [corridor] right now."* Primary: **Notify me**.

Plus full **interaction-state coverage** (loading / empty / error / success / partial) specced for broadcast,
offers, tracking, offer-select, and signup/OTP — so no screen ships with an undesigned failure state.

**Verdict:** design system CLEARED and locked; empty-states and interaction-states specced as P1 build tasks
(DT1–DT7). → Build.

---

## 2. Build stage — two-sided consultation + post-build static pass (2026-06-27)

> Two passes during Build: a **design consultation** that extended the spec to the full two-sided journey
> once the rider side shipped (Phase 2), and the **static-design lens of the comprehensive post-build
> review**.

### 2a. Two-sided design consultation

The customer-side review (§1) covered one half of a two-sided product. This pass specced the **rider side**
(calibrated against the as-built `app/rider/*`) and the **cross-cutting flows** every two-sided courier needs
— once, on paper, reusing the locked tokens/components (nothing new invented):

- **Rider IA + screens** — become/KYC, online board, offer compose (accept-at-asking vs counter), active-job
  stepper (rider view), delivery-OTP hand-off — the rider scanning *orders* as the customer scans *offers*.
- **§5c stepper, rider view** — the customer and rider steppers are **one timeline seen from two sides**;
  step labels kept paired so a support agent reading either screen sees the same journey.
- **Two rider empty-states** — *"No open orders near you — you're online and first in line"* (don't make
  idleness feel like a dead-end) and a *"Finish verification to start bidding"* gate (no silent empty board).
- **Cross-cutting flows** — order/trip history, profile/settings, the public rider rating profile,
  notifications center, support/help.
- **Earnings — payment-agnostic** — a record of **agreed fares on completed deliveries** (work done, *not* a
  payout balance): no withdraw, no settlement state, no commission line, matching CONCEPT §6's matchmaker
  stance. Built to **absorb a future settlement mechanism without a redesign** when §6's revenue model lands.

Drift between built and designed logged as a checklist (DT8–DT13 in `docs/DESIGN.md`) so the post-Phase-3
visual review has a list instead of rediscovering it — chiefly the §5c stepper (both sides), the designed
empty-states, and contract-only fields with no UI (`itemPhotoUrl`, `note`, `comment`, `reason`).

### 2b. Static-design lens of the post-build review

Part of the comprehensive post-build review (eng + adversarial + static-design). The design-relevant finding:

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Error-state honesty** — failures were rendering as success-looking or ambiguous states across screens. | ✅ **Fixed in the same pass** — honest error states landed (this is what made DT3's interaction-state coverage real). |
| **P1** | **Rider-gate staleness** — a pre-KYC rider could see a stale board state instead of the verification gate. | ✅ **Fixed** — the not-verified gate is enforced, no silent empty board. |

Most newly-specced screens were then built (§5c stepper, empty-states, history, profile, earnings, the
not-verified rider gate — DT8/DT9/DT11/DT12), and **DT4** (offer best-match sort + RECOMMENDED marker,
design D-d) shipped — the last buildable-now design gap.

**Verdict:** Build design CLEARED — full journey specced and largely built, error-states made honest. The
remaining lift is device-gated visual QA. → Ship.

---

## 3. Ship stage — ship-prep visual QA + post-launch design lens (2026-06-29)

> The design lens of two ship-stage passes: the **ship-prep increment** visual QA, and the design column of
> the post-launch follow-up triage (product lens in `docs/CEO-REVIEW.md` §3, eng lens in `docs/ENG-REVIEW.md`
> §3). Calibrated against `docs/DESIGN.md` (clean utility + warm accent, data-light, 8pt).

### 3a. Ship-prep increment — onAccent token + skeletons

Designer's-eye QA of the ship-prep commits. Confirmed well-done: complete `onAccent` adoption; the cream
tip-card (`#FFFCF2`) correctly left alone (not on-accent); skeletons use tokens (no magic numbers),
native-driver pulse, `busy` a11y state.

| Sev | Finding | Resolution |
|-----|---------|------------|
| NIT | `onAccent` undocumented in `DESIGN.md` | ✅ **Fixed** — added to the colour table + a Skeleton row in Components. |
| **P1** | Generic card skeleton doesn't mirror row/stepper/summary shapes → reflow when data lands (history, earnings summary, §5c stepper). | ◐ **Partly fixed** — `SkeletonRow`/`SkeletonRows` added (mirrors the right-aligned-value row) and history wired to it. Bespoke **stepper** + **earnings-summary** skeletons **deferred to on-device `/qa`** — reflow can only be judged on a real device. |
| P2 | White-on-accent contrast ~5.2:1 vs the spec's "≥7:1 for primary actions (sunlight)". | **Deferred / out of scope** — the diff is a *pure token refactor*; contrast is **unchanged** from the prior hardcoded `#fff`, and the 7:1 line is about the green primary CTA, not the admin tabs/logo touched here. Re-tuning the brand accent luminance is a founder-level design call. |

**Scores this pass:** onAccent adoption **8/10**, skeletons **5/10 → improved** with the fixes. Carried to
`/qa`: per-screen skeleton fidelity (`SkeletonStepper` for the §5c screens, a tall accent summary skeleton for
earnings) — tune against real reflow on a device.

### 3b. Post-launch follow-ups (design lens)

The design column of the three-lens ship triage. Design's biggest contribution was catching the **#1 cutover
risk** on Task A (point the app at the live HTTPS API):

- **The unbounded-request hang (shipped).** `apiFetch` used raw `fetch` with no timeout, so on a weak Zimbabwe
  link the first-touch screens (`phone`, `verify`, `home`) would hang on an in-button spinner with no upper
  bound. The fix — a 15s `AbortController` request timeout (`apps/mobile/src/api/client.ts`) so a stalled
  request fails into the existing friendly-error path within seconds — is the design lens made concrete (the
  eng lens wired the matching LB/Cloud Run WS timeouts; see ENG-REVIEW §3c).

Reviewed design follow-ups **not executed** (captured so nothing is lost; each with a trigger):

- **Pre-auth loading discipline** — `phone`/`verify`/`home` have no skeleton/interim affordance and there's no
  global offline banner (no NetInfo). Lower-risk than the shipped timeout. _Trigger:_ on-device `/qa`.
- **Declined-KYC state** (Task E) — `rider/become.tsx` branches verified-vs-not only; a `failed`/declined
  `kycStatus` is mislabeled "pending". A real Didit run *will* produce declines — add an honest declined
  screen + redo route. _Trigger:_ pairs with the Didit run.
- **OTP channel copy** (Task B) — `verify.tsx` should read `channel` from `requestOtp` and tell the user to
  check WhatsApp. _Trigger:_ when the BSP channel goes live.

**Verdict:** Ship design CLEARED. The cutover UX risk is shipped; the rest are honest, trigger-tagged UX
follow-ons (mostly device-gated `/qa` work). **Design score: 9/10** — the full two-sided journey is specced
and built and review-hardened; the remaining lift is the device-gated visual QA (DT5 map / DT7 `/design-review`
/ DT13). **Current build status → `docs/PILOT-READINESS.md`.**

---

## 4. KYC onboarding review — rider verification UX (2026-06-30)

> UX/UI review of the rider identity-verification (KYC) flow after Didit went live: the onboarding
> screen (`app/rider/become.tsx`), the KYC gate (`app/rider/index.tsx`), and the contract
> (`src/api/riders.ts`). Calibrated against `docs/DESIGN.md` (error-state honesty, "a dead-end becomes
> an action", data-light, touch targets) and CONCEPT §5d. Engineering companion: `docs/ENG-REVIEW.md` §4.

**What's genuinely good:** the **gate** is honest and well-built — an `EmptyState` (not a blank board)
for unverified riders with a primary "Resume verification" action; re-check of `["me"]` on screen focus
so a returning rider isn't trapped by a stale cache; server-enforced "go online" the UI doesn't lie
about; `https://`-only guard on the vendor URL; and a new consent line naming the partner + data.

**Two stop-ships for rider *self*-onboarding (device-build / Phase 3):**

- **P0 — "Photo URL" is an un-enterable raw `https://` text field** (`become.tsx`). `canSubmit` requires
  it, but a rider on a phone has a photo, not a URL — the form **cannot be submitted** by the intended
  user. → `expo-image-picker` → upload to the existing GCS bucket → store the returned URL. Until then,
  onboarding is operator-assisted, not self-serve.
- **P0 — a failed/declined KYC is shown as "still pending" and loops** (`index.tsx` gate is binary
  `kycStatus !== "verified"`; the backend collapses `Declined`/`Expired` → `failed`). Real ZIM-ID runs
  *will* produce false-rejects, so the pilot hits this. → an explicit honest `failed` state with a real
  retry (mint a fresh session) + the manual-review escape hatch. (This is the pre-existing DESIGN-REVIEW
  §3 declined-KYC TODO, now confirmed live and promoted to P0.)

**P1 (Phase 3):** "Resume" doesn't actually resume — the `verificationUrl` isn't returned by `getMe`, so
the rider re-keys their ID to get a new session; no polling while `pending` (only manual Refresh); the
hand-off uses `Linking.openURL` (system browser, no auto-return) where `expo-web-browser
openAuthSessionAsync` would keep it in-app with a deterministic "they're back → re-check" hook; the
`become`/gate pending states diverge.

**P2 / polish:** strengthen the consent block (partner identity, retention, privacy link, ≥14px) for an
ID+selfie ask in a low-trust market; inline field validation + an error slot on `Field`; numeric
keyboard for the National ID; `Label`↔`TextInput` screen-reader association.

**Verdict:** the **gate** is design-cleared and lives up to `docs/DESIGN.md`. The **hand-off and the
form** are not ready for rider self-onboarding — the two P0s must land with the **Phase-3 dev build**
(where camera-based KYC can actually be tested on-device). The server-side correctness/security fixes
shipped separately (`docs/ENG-REVIEW.md` §4). **Current build status → `docs/PILOT-READINESS.md`.**

---

## 5. Phase-3 build — KYC hand-off polish (2026-06-30)

> Build pass that closes the §4 P1 hand-off items. The two §4 **P0s** (un-enterable Photo URL → camera
> capture; failed-KYC dead-end → honest `failed` state with a real retry) already shipped with the
> Phase-3 dev build; this pass takes the **hand-off** the rest of the way for self-onboarding.

**What landed:**

- **In-app browser hand-off** (`become.tsx`, `rider/index.tsx`). The Didit hand-off used
  `Linking.openURL`, which throws the rider into the **system browser** with no path back — they finish
  verifying and are stranded in Chrome. Both the first-run submit and the pending/failed **retry** now use
  `expo-web-browser` `openAuthSessionAsync`, which opens an **in-app tab** and **resolves when the rider
  returns**. That return is the deterministic *"they're back → re-check"* hook the §4 review asked for: on
  resolve we invalidate `["me"]` (and the gate already re-checks on focus), so a freshly-verified rider
  drops straight through the gate. The `https://`-only guard is preserved.
- **Auto-poll while `pending`** (`rider/index.tsx`). The pending gate previously only had a manual
  *"Refresh status"* button, so a rider whose Didit webhook resolved while they sat on the screen saw
  nothing until they tapped it. The `["me"]` query now carries a `refetchInterval` that polls every 5 s
  **only while `kycStatus === "pending"`** and stops the moment it resolves (verified/failed) — the gate
  clears itself. Manual Refresh stays as a belt-and-braces affordance.

**Still open (P1 — needs the on-device `/qa` pass):** the `become` confirmation card and the gate's pending
state still diverge in copy; unifying them is best judged on a real device alongside the stepper/earnings
skeletons (DESIGN-REVIEW §3/§4). P2 polish (consent block strength, inline field validation, numeric ID
keyboard, label↔input a11y association) is unchanged. **Current build status → `docs/PILOT-READINESS.md`.**

---

## 6. Phase-3 build — KYC onboarding UX polish (2026-07-01)

> Build pass that closes the §4 **P2** onboarding-UX items deferred as "device-gated polish". Developed by
> a build agent, then reviewed against `docs/DESIGN.md` by an independent design/UX pass whose findings are
> folded in below. Status: **SHIPPED.**

**What landed (all four §4 P2 goals):**

- **Stronger consent block** (`become.tsx`). Replaced the 12px muted paragraph with a `--surface` card that
  names the partner (**Didit**), states what's collected (ID photo + selfie liveness), why it's kept (run
  rides + legal, *not* marketing), retention (**photos deleted after the check**), and links the policy —
  all ≥14px `--ink` on `--surface` (high contrast). Right calibre of trust for an ID+selfie ask in a
  low-trust cash market.
- **Inline field validation + error slot** (`Field` in `src/ui/index.tsx`). A per-field error turns the
  input border `--danger` and renders a message below it; validates on blur and again on submit.
- **Numeric ID keyboard.** `keyboardType="numeric"` (not `number-pad`) so the ZW national-ID check letter
  (e.g. `63-1234567 A 42`) stays enterable — `number-pad` on iOS is digits-only and would trap the rider.
- **Label↔input a11y association.** `Label` carries a stable `nativeID`; the input points at it via
  `accessibilityLabelledBy`/`aria-labelledby`, with `accessibilityLabel`/`aria-label` as the direct-naming
  fallback (covers iOS, where `LabelledBy` is a no-op) and `aria-invalid` on error.

**Review findings folded in (this pass):**

- **[P2 — touch target] Privacy link was a bare `Text` (~19px tall), under the 44px minimum.** The one
  requirement the batch actively missed. **Fixed:** wrapped in a `Pressable` with vertical padding +
  `hitSlop`, so the "Read our privacy policy" affordance clears the ≥44px target on a cheap phone.
- **[Nit — legibility] Inline error at 12px.** Consistent with the caption tier, but an error a
  low-literacy rider must *act on* is higher-stakes than a static caption. **Fixed:** bumped to 13px
  (matching the "Photo added ✓" affordance) — one tier up, still on the grid.

**Confirmed sound (no change):** consent copy meets the trust bar; numeric-keyboard choice is correct; the
a11y association is implemented right on both platforms; `--danger` on `--bg`/`--surface` clears 4.5:1.
The `--accent`-on-`--surface` privacy-link contrast sits right at 4.5:1 — acceptable for a non-primary
link; a future `accent700` swap is logged as optional polish.

**Verdict:** all four §4 P2 onboarding-UX goals delivered; no redesign, no token violations. What remains
is purely the device-gated visual `/qa` (DT7/DT13). **Current build status → `docs/PILOT-READINESS.md`.**
