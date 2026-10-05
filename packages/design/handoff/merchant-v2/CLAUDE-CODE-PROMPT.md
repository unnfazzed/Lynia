# Claude Code prompt: Merchant v2 follow-ups (D-77, 2026-10-05)

Paste this file into Claude Code from the root of `unnfazzed/Lynia`.

---

## Setup
1. Read `CLAUDE.md` first. It sets the pixel-parity rules and the merge-on-green policy.
2. Copy this folder into the repo, merging it over `packages/design/handoff/merchant-v2/`. Keep the existing `BRIEF.md`; this pass adds to it and doesn't replace it.
3. Add a D-77 ledger entry in `docs/DESIGN-DEVIATIONS.md` recording this import. The reverse-drift freeze requires one.

## Sources of truth, in order
1. `BRIEF.md` (existing), then this folder's `README.md`. If they disagree, the README wins for this pass, because it supersedes the "show '—'" rule for rejected orders.
2. `Merchant v2 - all screens.html`: open it in a browser. The new frames are under "FOLLOW-UPS · 2026-10-05". All copy is final; use it word for word.
3. `source/*.dc.html`: exact spacing, sizes and colour variables.
4. `tokens/`: no new colour values. Map every `var(--x)` to an existing theme token.

Rebuild with the app's own components, sheets and router (`apps/merchant/app/**`). **Don't port the HTML.**

## Work, one PR per group
Each PR must be green on `pnpm typecheck && pnpm test`. In the same PR, delete or update the matching D-77 row and attach a screenshot sheet: run `tools/parity/shoot-merchant-v2.mjs`, and add a set for each new frame.

### 1. Tap targets
- Redraw the K3 Problem pill, the S4 item and "+ Add" chips, the T1 category chips, the T2 Call pill, the K1 Hand over pill and P1 Zoom at 44px.
- **Delete every padded-hit-area workaround.**
- Add a test or lint check that fails if any pressable is under 44px.

### 2. Shared sheet parts
- Build `ReasonSheet` (title, sub, single-choice `ReasonRow`s, optional note field, a danger CTA and a secondary button).
- Build `PathCard` and `InfoStrip` (neutral / gold / mint / red).
- Follow the specs in the README under "Shared patterns" and the 320×640 sheet rule.

### 3. Reject and cancel
- **K2a/S2a:** wire up the reason codes. Show the busy-mode hint only for kitchens with "Too busy" selected. A note of at most 80 characters goes with "Something else".
- **K3a:** the Problem sheet. "Something ran out" opens the existing S2 swap/remove flow on the ticket.
- **K3b/K3c:**
  - cancel with a reason; for a wallet order the refund happens first and the order is cancelled after;
  - spinner and error states as specified.
- **API, additive only:**
  - `reasonCode` and `note` on reject and cancel;
  - a refund status on the cancel response.
- Contract changes must be additive. Run `node scripts/contract-snapshot.mjs --write` after any change.

### 4. Board states
- **K1b:**
  - CASH TO COME BACK (late rows first, gold LATE chip, 44px Call);
  - SCHEDULED (dashed cards, "rings at").
- **K1c:** the empty open state ("Check your menu" for kitchens, "Book a rider" for shops).
- **"Cash due" KPI:** includes all cash still out.
- **Migrations:** expand-only; nullable columns with no default (`cashDueAt`, `cashReceivedAt`, `ringsAt` if missing).

### 5. K5 states
- **K5b:** a delivered order with no cash shows no cash card and no CTA.
- **K5c:** goods coming back.
  - "I got the food back" / "I got the goods back".
  - "It wasn't returned" raises a support ticket and shows the confirmation copy from the README's open items.
- Make the disabled state of the existing "I got $X · after delivery" CTA explicit.

### 6. Tabs
- **T1:**
  - "+ Add a dish" / "+ Add an item" header pill in the top card;
  - the live bar's 4 states, in the README's priority order.
- **T2:**
  - "cash on its way" row;
  - "No sale" for rejected and missed rows (replacing "—");
  - the T2b "This week" view with day rows and week bars;
  - a per-day summary endpoint if one doesn't exist.
- **T3:**
  - a HELP group with "Help & support · WhatsApp";
  - it opens `wa.me` with prefilled text;
  - the number comes from config.

### 7. Arrival copy (depends on B1)
- Implement the A2 known/unknown copy table **now**, so nothing reads "arrives —" today.
- Once `riderArrivedAt` exists, switch on the A1 "at your counter" card (with Hand over), the K4 sub-line and live-bar state 2.

## Out of scope
- **Booking terms on S4:** the terms live in the T&C accepted at sign-up. Remove any D-77 row that asks for a terms link or a version record.
- **Sign-in, onboarding and settings sub-screens:** the restyle stands. Close those D-77 rows as "confirmed".

## Done means
- Every frame in `CHANGELOG.md` matches the HTML at 360×720, and also at 320×640 and font scale 1.3.
- No padded-hit-area hacks remain.
- The matching D-77 rows are removed or updated.
- There is a screenshot sheet for each PR.
