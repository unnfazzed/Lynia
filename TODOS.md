# TODOS

Deferred work with context. Each entry records what/why/trigger so a pickup months later
starts from reasoning, not archaeology.

## Wallet / commission (from /plan-eng-review 2026-07-13, rider-wallet design)

### 1. EcoCash provider-statement reconciliation

- **What:** Periodic job (or ops procedure) matching Econet's merchant statement exports
  against confirmed `TopUp` rows.
- **Why:** The nightly integrity job proves our own ledger is internally consistent; only
  statement matching catches money that reached the merchant account but never credited a
  wallet (or a credit with no matching receipt).
- **Pros:** Closes the last money-visibility gap; turns "where did the rider's $5 go"
  disputes into a lookup.
- **Cons:** Needs statement-export access from Econet; meaningless at pilot volume.
- **Context:** Deliberately cut from the wallet build (Approach A, design doc
  `docs/plans/2026-rider-wallet-design.md`). The wallet ships with an internal
  ledger-vs-balance integrity job only.
- **Trigger / blocked by:** EcoCash rail live (wallet PR2) AND commission rate flipped
  AND sustained top-up volume (guide: >20 confirmed top-ups/week).

### 2. InnBucks / O'mari automation decision checkpoint

- **What:** A decision checkpoint: when manual credits exceed ~25/week OR median credit
  turnaround exceeds ~30 minutes during ops hours, decide per rail — automate it or drop
  it from the accepted deposit methods.
- **Why:** The launch design puts a human in the money path for these two rails (rider
  pays the merchant account, ops credits the wallet). Fine at pilot scale; silently
  unworkable at hundreds of riders. Without a written tripwire, the trigger fires as an
  ops incident instead of a scheduled decision.
- **Pros:** Converts creeping ops pain into a measurable, scheduled decision.
- **Cons (stated plainly):** The wallet's Approach A hardwires the top-up flow around the
  EcoCash client — automating additional rails later is a refactor of live money code,
  not a drop-in. That cost was accepted knowingly at design review (D6).
- **Context:** Manual-first for these rails was a deliberate office-hours decision
  (D2, 2026-07-13); this is its expiry alarm. Shadow-accrual metrics (would-be commission
  at the calibration rate) approximate future top-up volume before the flip.
- **Depends on:** Post-flip top-up volume data; thresholds above are launch guesses to
  calibrate against reality.

### 3. Generate wallet visual mockups with the gstack designer

- **What:** Run `$D variants` against the wallet screens now fully specified in
  `docs/plans/2026-rider-wallet-design.md` (UI Specification block): Wallet balance
  hero, show-the-math receipt rows, USSD wait state, gate state — pick a direction on
  the comparison board.
- **Why:** The 2026-07-13 design review ran text-only — the designer binary was
  present but needs an `OPENAI_API_KEY` the remote container doesn't have. The spec is
  complete; nobody has *seen* the wallet yet.
- **Context:** The brief is assemblable directly from the UI Specification block +
  `docs/DESIGN.md` tokens. Run before (or as part of) the build's
  `/design-consultation` → `/design-html` pass so layouts are coded from an approved
  visual, not from prose.
- **Depends on:** `OPENAI_API_KEY` (or `$D setup`) on the machine running it; best on
  a local session where the comparison board can open in a browser.
