# Claude Code — KYC in-app verification update (Aug 2026)

Paste this into Claude Code with **unnfazzed/Lynia** connected, on the branch carrying the
refreshed `packages/design/`. Read `packages/design/handoff/kyc-2026-08/README.md` first —
it has exact copy, sizes and rationale for every screen. This prompt is the work order.

## Context

The rider ID check moved from a browser hand-off to an **in-app embedded verification SDK
(Didit)**. Previous rider KYC screens are otherwise correct — do not rebuild the flow.
This is a small, surgical update: 2 new screens, 3 edits, 1 copy audit.

Design source of truth: `packages/design/explorations/journey/All Screens Gallery.html`
(KYC band of the Rider category). Renderers named per screen in the README.

## Tasks

1. **New screen `kyc_unfinished`** — rider board gated state when the rider abandoned the
   SDK flow (nothing submitted). Rider header + centred EmptyState: `id-card` icon,
   title "Finish verifying your ID", message "You haven't finished verifying your ID. It
   takes about a minute.", one PRIMARY button "Finish verifying" → relaunch the SDK.
   Nothing else — no support link, no secondary.

2. **New screen `kyc_cant_start`** — the SDK failed to launch (camera/connection). Same
   structure: `triangle-alert` icon, title "We couldn't open the ID check", message "This
   is usually the camera or the connection. Check both and try again.", PRIMARY "Try
   again" + GHOST "Contact support" (in that order). The only KYC waiting screen with a
   support action.

3. **Edit `kyc_pending`** — remove ghost "Continue in browser" (dead step); add ghost
   "Order food and send parcels" → customer home. Exactly one action after the edit, no
   primary. Icon/title/message unchanged.

4. **Edit the rider photo capture screen** (was "ID photo") — it captures the rider's
   FACE for admin review, not the document:
   - close ✕ becomes a real 44×44 button (`--target-min`), accessibilityLabel "Close",
     20px glyph centred;
   - title "Rider photo";
   - frame = portrait oval, ~72% screen width, aspect 0.78:1, fully rounded, 2.5px dashed
     white @ 75% opacity;
   - copy: "Put your face inside the oval" (in the oval) · "Face the light · no hat or
     sunglasses · look straight ahead" (below);
   - keep the 68px shutter as-is.

5. **Audit `kyc_form` consent copy** — must match the README's quoted paragraph exactly
   ("Didit" ink-colour weight 600, Privacy policy link after). Delete any sentence about
   finishing in a browser / returning to the app if the shipped copy still has one.

6. **Edit `register` (customer profile registration)** — append ghost "Use a different
   number" below "Continue", last element on screen → back to phone login, editable
   number. Exact label.

## State routing (KYC gate)

Map the rider board gate to three distinct SDK states:
- session created, awaiting vendor result → `kyc_pending`
- session abandoned before submission → `kyc_unfinished`
- SDK launch threw / camera unavailable → `kyc_cant_start`

"Finish verifying" and "Try again" both call the same SDK-launch entry point.

## Rules that still bind

- Tokens unchanged. Accent rules from previous handoffs hold (cta #00812F fills,
  accentText #006630 text/icons, accent #00B14F non-text fills only).
- Icons only from `packages/design/assets/lynia-icons.js` — `id-card`, `triangle-alert`,
  `x` all exist; add nothing.
- Every interactive element ≥ 44px (`--target-min`); one primary CTA per screen max.
- Copy is final — ship the strings verbatim, including "·" separators and the ellipsis
  in "Finishing verification…".

## Suggested PR split

1. PR 1 — screens 1–3 + state routing (one reviewable KYC-gate change).
2. PR 2 — photo capture rework (4).
3. PR 3 — copy audit + register exit (5, 6).
