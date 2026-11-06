# Ledger entry: paste into `docs/DESIGN-DEVIATIONS.md`

> Fill in the D-number and the approval line. CI's reverse-drift freeze needs this entry in the same PR as `packages/design/handoff/delivery-ceiling-v1/`.

### D-___ · Delivery price ceiling v1 (2026-11-05)
- **Handoff:** `packages/design/handoff/delivery-ceiling-v1/` (README, copy.ts, canvas, screenshots).
- **Plan:** `docs/plans/2026-11-05-delivery-price-ceiling.md`.
- **Extends, does not replace:** Order flow v2.1 R1/R2a/R2b, T4/T5/T6/T11a; Merchant v2 hold card, board card, M6a, Money; Orders v2 Now card; Notifications v1 row; admin order detail.
- **New frames:** R1c (+full/320/fs), R1c-low (+320), R1c-high, R1c-max, R1c-free, T4u (+320/fs), T6p, T6p-same, T11c (+320/fs), T11c-toast, T11c-push, O-card-u, N-row-u, M4h (+320/fs), M4h-sent, M6a-t, T2-t, K-card-h, E1.
- **Copy changed (was → now):**
  - `O.r.place` "Place order · {p} cash" → "Place order · {p} cash at most" (when a ceiling is set)
  - `O.r.cashSub` → `DC.r.cashSubUpTo` "Have {p} ready. It may be less. You’ll see the exact amount when a rider accepts."
  - `O.t.slowRiderSub` → "No rider has taken it at {d} yet. Your order is kept ready at {v}."
  - Merchant hold sub → "Riders are offered {o}. Nobody has taken it so far."
  - Push c[3] body → "Have {p} ready at the door."
- **Rider offer card:** unchanged by decision (no "Raised" marker).
- **Tokens:** none added.
- **Flag:** `DELIVERY_CEILING_ENABLED`, default off.
- **Approved by:** ________ (owner) on ________
