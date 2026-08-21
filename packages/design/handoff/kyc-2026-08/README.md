# Handoff: KYC in-app verification update (Aug 2026)

Design update covering the rider KYC waiting states and two small exits. Six screens
touched in `packages/design`: two net-new, three edited, one audited-no-change.

## About the design files

Everything here is a **design reference built in HTML** — not production code. The task is
to recreate these screens in the app codebase (React Native), using the existing ported
LyniaGo primitives (`Button`, `EmptyState`, `Icon`, `Field`, the rider header). Fidelity is
**high**: copy strings, weights, icons and sizes exactly as specified below.

## Why this update exists

The rider ID check no longer hands off to a browser — it now runs **inside the app via an
embedded verification SDK (Didit)**. That kills every "continue in browser" affordance and
creates two states the app never drew:

- the rider **abandoned** the SDK flow (nothing was submitted) → `kyc_unfinished`
- the SDK **failed to launch** (camera/connection) → `kyc_cant_start`

Separately, the rider-photo capture step was re-specced as a **face** capture (it feeds the
human admin review; the SDK photographs the document itself), and the customer registration
screen gained its missing exit.

## Source of truth

Preview: `packages/design/explorations/journey/All Screens Gallery.html`
(plain static HTML — `npx serve packages/design`). Registry: `explorations/journey/gallery-map.js`.
Renderers: `rider-screens.jsx` (`window.RJ`), `rider-screens-safety.jsx` (RJ photo states),
`screens.jsx` (`window.LJ`). Phone viewport 360×720.

---

## 1 · NEW — `kyc_unfinished` · "Verification not finished" (RJ)

Rider job board in its gated state: rider abandoned the ID check, so nothing was submitted
and nothing is under review. Sits directly after `kyc_pending` in the KYC band.

Structure = same as `kyc_pending`: standard rider header, then centred `EmptyState` filling
the rest of the screen.

- icon: `id-card` — deliberately NOT an alert glyph; nothing went wrong, the rider stopped
- title: `Finish verifying your ID`
- message: `You haven't finished verifying your ID. It takes about a minute.`
- actions: ONE primary button `Finish verifying` (relaunches the SDK). No secondary, no
  support link, no illustration beyond the icon.

## 2 · NEW — `kyc_cant_start` · "Couldn't open the ID check" (RJ)

The SDK failed to LAUNCH — device fault, nothing was assessed. Directly after
`kyc_unfinished`. Same structure (rider header + centred `EmptyState`).

- icon: `triangle-alert` — this one IS a fault, and must be distinguishable at a glance
  from `kyc_unfinished`
- title: `We couldn't open the ID check`
- message: `This is usually the camera or the connection. Check both and try again.`
- actions, in this order and these weights:
  1. PRIMARY `Try again`
  2. GHOST `Contact support`

Copy is careful: "We couldn't" (not "you didn't") — must not read as a rejection.
This is the ONLY one of the three KYC waiting screens with a support row: the other two are
solved by a single tap; here retrying may genuinely not work.

## 3 · EDIT — `kyc_pending` · "Verification pending" (RJ)

- REMOVED ghost `Continue in browser` (the browser hand-off step no longer exists).
- ADDED ghost `Order food and send parcels` — exact label; it names what the rider gets,
  not which role they leave. Routes to the customer home.
- After the change the screen has exactly ONE action, the ghost above. **No primary** —
  nothing the rider does speeds up a check already with the vendor.
- Icon/title/message unchanged: `id-card` / `Finishing verification…` /
  `Your ID check is with Didit — riders go online once it's verified. This usually takes
  under a minute.`
- Do NOT add this customer-bridge to `kyc_unfinished` or `kyc_cant_start` — both have a tap
  that clears the wall, and a bridge would compete with it.

## 4 · EDIT — `photo_capture` · gallery label now "Rider photo · capture" (RJ)

Full-bleed dark camera screen. This step photographs the RIDER'S FACE for admin review, not
the ID document (the SDK handles the document). Four changes:

1. Close (✕) top-left is now a real button: `44×44px` (`--target-min` token), accessible
   label `Close`, with the drawn ✕ glyph kept at `20px` and centred in the box. It is the
   only exit from a full-bleed camera — never below the 44px floor.
2. Header title: `ID photo` → `Rider photo`.
3. Capture frame: ID-card rectangle → **portrait oval** — width ~72% of screen, aspect
   ratio `0.78 : 1`, fully rounded (`border-radius: 50%`), `2.5px dashed` white at ~75%
   opacity (`rgba(255,255,255,.75)`).
4. Guidance copy:
   - inside the oval: `Put your face inside the oval`
   - below the oval: `Face the light · no hat or sunglasses · look straight ahead`

Unchanged: 68px white shutter button at the bottom (`border: 5px solid rgba(255,255,255,.35)`).

## 5 · AUDIT, no change — `kyc_form` · "KYC form + consent" (RJ)

Consent card body must read exactly (with **Didit** in ink `var(--ink)` at weight 600, then
the `Privacy policy` link):

> Your national ID is checked by our verification partner Didit — an ID photo plus a quick
> selfie liveness check. We store your ID number, bike reg and photo to keep deliveries
> safe; we don't share them with customers.

There must be NO sentence about finishing in a browser or returning to the app. Audited
Aug 2026 — the design already complies; verify the shipped app copy matches.

## 6 · EDIT — `register` · "Profile registration" (LJ)

Added ghost `Use a different number` below the primary `Continue`, as the last element.
Exact label — not "Back", not "Change number". It gives the screen a drawn exit for the
mistyped-number case; ghost weight so it never competes with completing the form; same
idiom as the ghost `Back` on the OTP screen one step earlier. Routes back to phone login
with the phone field editable.

---

## Flow wiring (states, not screens)

- SDK launched, rider waiting on result → `kyc_pending`
- SDK abandoned before submission (backgrounded, killed, dismissed) → `kyc_unfinished`
- SDK failed to launch (camera permission, no camera, connection) → `kyc_cant_start`
- `Finish verifying` and `Try again` both relaunch the SDK
- `Contact support` → existing support channel (tel: per project decision)
- `Order food and send parcels` → customer home (launcher)

## Design tokens & primitives used

All from `packages/design/tokens/` + `components/core/` — unchanged by this update.

- `--target-min: 44px` (every interactive element) · `--target-primary: 52px` (primary CTA)
- `Button`: primary = filled `cta` #00812F white text; `variant="ghost"` = text-weight action
- `EmptyState`: icon + title + message + action children, centred in remaining space
- Icons from the self-hosted subset only: `id-card`, `triangle-alert`, `x` (all present)
- Camera screen background: `var(--ink)`; overlays use white at .7/.75/.8 opacity as specced

## Files

- `explorations/journey/rider-screens.jsx` — `KycUnfinished`, `KycCantStart`, `KycPending`, `KycForm`
- `explorations/journey/rider-screens-safety.jsx` — `PhotoCapture`
- `explorations/journey/screens.jsx` — `Register`
- `explorations/journey/gallery-map.js` — registry entries + labels
- `explorations/journey/All Screens Gallery.html` — live preview of everything above
