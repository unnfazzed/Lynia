# LyniaGo — Rider Commission Wallet · Handoff

Everything to build the rider commission wallet: the designs, the Claude Code prompt, and
how to run it. This whole folder **is** the LyniaGo design system — the wallet designs render
against it, so keep it together.

---

## 1. What's inside

**The prompt (paste this into Claude Code)**
- `handoff/WALLET-CLAUDE-CODE-PROMPT.md` — the full feature-build spec: product rules,
  screen-by-screen states, API contracts, accent/voice rules, definition of done.

**The designs (interactive HTML — open in a browser)**
- `explorations/Wallet Journey.html` — **start here.** The entire journey on one board:
  entry → reveal → first debit → low → gated → top up → back online, every edge state, and
  the admin side.
- `templates/wallet/Wallet.dc.html` — Wallet screen, all states (drive via the `screenState` prop).
- `templates/top-up/TopUp.dc.html` — Top-up flow, all steps + rails (`step`, `rail` props).
- `templates/gate-state/GateState.dc.html` — Go-online gate + "back online" (`state` prop).
- Entry point is the **existing** Earnings screen (`explorations/journey/rider-screens.jsx`
  → `Earnings`, rendered via `explorations/journey/single-screen.html?id=earnings`). It
  already carries the "Commission balance ›" row — it is **not** to be redesigned, only wired.

**Supporting design system (the designs depend on these)**
- `styles.css` + `tokens/` — colours, type, spacing (the source of truth for every value).
- `components/`, `assets/`, `ui_kits/admin/` — primitives, brand, and the admin ops pages.
- `HANDOFF.md`, `readme.md` — the full engineering + design guide.

## 2. Preview the designs

Plain static HTML, no build step:

```bash
npx serve .          # from this folder
```

Then open `explorations/Wallet Journey.html`. Click through the board; each phone tile is a
live component driven into the state shown.

## 3. Hand it to Claude Code

1. Connect the **unnfazzed/Lynia** repo to Claude Code, on a fresh branch.
2. Make sure this design system sits at `packages/design/` in that repo (drop this folder in,
   replacing the vendored copy if there is one).
3. Copy the whole of `handoff/WALLET-CLAUDE-CODE-PROMPT.md` and paste it as your first message.
   It points Claude Code at every design file above.
4. Tell it to preview `packages/design/explorations/Wallet Journey.html` before building.

## 4. Decide this before Claude Code wires the numbers

**Commission model:** 0% at launch, raised to 10% once activity is growing. It's one server
value, `ratePct` — launch at `0` (no debits, wallet row hidden), flip to `10` when ready. The
old admin `cash.html` still shows a *weekly 15% settlement* — that's stale; the live model is
prepaid, per-delivery, 0→10%. Confirm and align the admin console to it.

Other locked values: $2.00 floor to go online · $5.00 grace credit at the flip · $5–$50 per
top-up · EcoCash / InnBucks / O'mari rails · 90s prompt window · payment otherwise
off-platform (cash).
