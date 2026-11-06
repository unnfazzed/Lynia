# Claude Code prompt: LyniaGo Delivery ceiling v1

Paste this whole file into Claude Code from the repo root. Vendor this folder at `packages/design/handoff/delivery-ceiling-v1/`, next to `packages/design/handoff/order-flow-v2/` (the canvas loads that kit).

## Your job
Build the delivery price ceiling UI described in `README.md` on top of screens that already exist:
- **customer app** (Expo): Review & place (R1/R2a/R2b), the order screen (T4/T5/T6/T11a), the Orders tab Now card, the Notifications row and the pushes;
- **merchant web app**: the no-rider hold on the order page, the board card, cash back (M6a) and the Money tab;
- **admin**: the Delivery price block on the order detail.

The rider offer card does **not** change.

Everything sits behind `DELIVERY_CEILING_ENABLED` (default `false`). With the flag off, every screen is byte-for-byte today's. Orders with a null `deliveryCeiling` (placed before launch) also render as today.

## Sources of truth, in order
1. `docs/plans/2026-11-05-delivery-price-ceiling.md`: the rules and numbers (§3–§5). If the design and the plan disagree on a rule, the plan wins. Flag it in the PR.
2. `code/copy.ts`: every new string as `DC`. Use it verbatim with the existing `ofFmt()`. Strings marked `// was:` replace an Order flow v2.1 string. Update that key and don't keep both.
3. `README.md`: frames, decisions, component specs and behaviour.
4. `Delivery ceiling v1 - all screens.html`: every state at 360×720. `?screen=<ID>`, `?w=320`, `?fs=1.3`. `screenshots/<ID>.png` are 2× references.
5. `dc-screens.js`: exact markup and sizes per frame (it reuses the Order flow v2.1 kit `OK.*`). Read it; don't port it.

## Hard rules (fail the PR if broken)
- **Wording:** the ceiling is a maximum that can be lower: "Pay no more than", "$X at most". Never render "up to". After acceptance, show the exact amount with no qualifier.
- **Money:** USD on the $0.50 grid, tabular figures, never truncated. A free delivery shows "Free", never "$0.00".
- **The customer never sees a number above goods + ceiling,** and the rider never sees the ceiling: only the current offer.
- **Targets:** ≥ 44; the one primary is 52 (`minHeight`, not hit-slop). The stepper buttons are 44 circles with a11y labels from `DC.r.lower/raise/lowest/highest`.
- **Colour:** green text is `accentText`; `accent` is fill only. No new colour values. The Free delivery tag is the existing `free` token.
- **320×640 and font scale 1.3:** the stepper stays full-width on one line, totals never truncate, the raise bar stacks, and the top-up grid drops to two columns.
- **Push:** no codes, no wallet. Raise push actions: "Raise to $X" (calls `raise-ceiling` with +$0.50) and "Keep waiting" (dismisses).
- **Copy says "rider";** the existing role mapping shows "biker".

## Build order
1. `packages/shared`: `DELIVERY_CEILING` constants and `recommendedDeliveryUsd`, `ceilingBounds`, `startingOffer`, `offerForRound` (plan §7), with golden tests on every row of the §4 tables.
2. API: schema, placement validation, dispatch ladder, accept CAS, hold → top-up → raise, flag (plan §7).
3. Customer Review: the DELIVERY card + stepper (R1c, R1c-low, R1c-high, R1c-max), totals/CTA/Pay copy, and the free-delivery variant (R1c-free).
4. Customer order screen: the searching row (T4u), the door-amount row (T6p / T6p-same), the raise prompt + pinned bar (T11c), the toast and the push.
5. Orders tab card and Notifications row (O-card-u, N-row-u).
6. Merchant: hold card + top-up buttons (M4h), finding card + toast (M4h-sent), board card (K-card-h), cash-back rows (M6a-t), Money row (T2-t).
7. Admin: E1 block.

## Definition of done
- Every frame in `README.md` matches its screenshot at 360×720, and the 320 / fs 1.3 variants hold.
- The property tests from plan §7 pass, plus: the T6 saving shows only when accepted < ceiling; T11c never appears on a free-delivery order; a top-up above the goods total is refused.
- With the flag off, the existing merchant-order tests pass unchanged.
- `docs/DESIGN-DEVIATIONS.md` has the owner-approved entry from `DESIGN-DEVIATIONS-entry.md`, in the same PR as this folder.
