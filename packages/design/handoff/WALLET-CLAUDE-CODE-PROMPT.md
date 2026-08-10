# Claude Code — Build the LyniaGo rider commission wallet

Paste this into Claude Code with the repo **unnfazzed/Lynia** connected, on a fresh branch.
This is a **feature build**, not a design refresh — implement the rider commission-wallet
journey against the designs vendored in `packages/design/`.

---

## What you're building

A **prepaid commission wallet** for riders. When commission is switched on (the "flip"),
Lynia takes a small percentage of each completed delivery out of a **prepaid balance the
rider tops up** — never their cash in hand. A rider whose balance falls below a floor can't
go online until they top up. Everything is honest and shown: every debit sits next to the
ride it came from.

The whole journey is designed at production fidelity. **Preview it first:**
- `packages/design/explorations/Wallet Journey.html` — the entire flow on one board (entry →
  reveal → first debit → warned → gated → top up → back online, plus every edge state and the
  admin ops side).
- The live component states drive from these templates (drive them with the props shown on the board):
  - `packages/design/templates/wallet/Wallet.dc.html` — the Wallet screen, all states.
  - `packages/design/templates/top-up/TopUp.dc.html` — the top-up flow, all steps + rails.
  - `packages/design/templates/gate-state/GateState.dc.html` — the go-online gate + cleared.
- Entry point: the **existing** Earnings screen (rider journey `5·1`,
  `explorations/journey/rider-screens.jsx` → `Earnings`) already carries the tappable
  **"Commission balance ›"** row. Do **not** redesign Earnings — wire that existing row to
  open the wallet, gated behind the commission flag.
- Admin side (context for the API): `packages/design/ui_kits/admin/cash.html` (commission
  overview, seed-credit) and `riders.html` (per-rider ledger, manual credit, freeze).

Read `packages/design/HANDOFF.md` and `packages/design/readme.md` for the design system,
the accent-split colour rules, and voice. Reuse the existing primitives in
`apps/mobile/src/ui/` (`Button`, `Card`, `StatusPill`, `Field`, `EmptyState`, `Skeleton*`,
`OfflineBanner`, `Icon`) — no new visual primitives.

## Product rules (baked into the designs — treat as the spec)

| Rule | Value | Where it shows |
|---|---|---|
| Commission rate | **0% at launch**, raised to **10%** once activity is growing (server-configurable `ratePct`; the flip flips it on) | Wallet receipt "10% of $3.00", honest-copy card |
| Balance floor to go online | **$2.00** | Low-balance chip, go-online gate |
| Grace / starting credit | **$5.00**, granted at the flip | Wallet "first-open" state, ledger "Starting credit" |
| Top-up min / max | **$5.00 – $50.00** per top-up | Amount field validation + quick chips ($5/$10/$20) |
| Payment rails | **EcoCash · InnBucks · O'mari** (all push a prompt to a phone number) | Rail selector |
| Prompt window | **90 seconds**, then timeout | Top-up wait ring + timeout state |
| Money model | Prepaid float; commission comes from the balance, **never** the rider's cash | Everywhere in copy |
| Rollout | **Server-flag gated** — `ratePct` is **0%** at launch (no debits, wallet row hidden); the flip raises it to **10%** and reveals the wallet | Earnings entry row |

> **Rate is one server value, `ratePct`.** Launch with `ratePct: 0` — no commission is taken,
> the wallet row stays hidden, and Earnings reads as "Lynia doesn't take a commission yet."
> When activity is growing, set `ratePct: 10` (the flip): debits begin, the wallet row appears,
> grace credit is issued. Everything downstream (receipts, honest copy, floor maths) must read
> `ratePct` from `/wallet/config` — never hardcode a percentage.
>
> **Reconcile before building:** the older admin `cash.html` models a *weekly 15% settlement* —
> that is stale. The live model is **prepaid, per-delivery, 0%→10%**. Align the admin console +
> settlement engine to it; the rider wallet templates are the source of truth.

## Screens & states to implement

**Earnings entry (existing screen — wire only)**
- Show the "Commission balance ›" row only when `commission.enabled`. Value = live balance.
  Tapping it opens the Wallet. Pre-flip: hide the row (the honest note stays).

**Wallet** (`screenState`: `loaded · low · negative · first-open · empty · loading · offline`)
- Balance hero (positive = neutral surface; **negative/below-floor = `--danger-wash`, amount
  in ink, never red text on white**; grace first-open = "Grace credit" pill).
- Top-up CTA. Low chip (`--accent-wash` when getting low; `--danger-wash` below floor).
- **Ledger**: reverse-chronological, each entry showing the amount and the ride/ref it came
  from. Credits in `--accent-text`, debits in ink. Empty, loading (skeletons, not spinners),
  and offline (cached + "as of…" stale label) states.

**Top up** (`step`: `amount · ussd-wait · success · timeout · declined`)
- Amount field ($5–$50, inline errors), quick chips, phone-number field (pre-filled with the
  rider's registered line, editable), rail selector.
- Wait: 90s countdown ring while the rail's prompt sits on the phone; Cancel request.
- Success: amount added, new balance, ledger row appended. Timeout ("expired — no money
  moved") and declined ("payment was declined — no money left your <rail>") both offer Try again.

**Go-online gate** (`state`: `gated · cleared`)
- Below-floor refusal joins the existing `gates.ts` gate family: status → reason → exact
  amount needed → one CTA into top-up. "This isn't a fine" reassurance. Cleared = "You're
  back online" toast + live board.

## API contracts to wire (propose these; confirm shapes with backend)

Add to the mobile data layer (match existing service/query conventions in `apps/mobile`):

```ts
// Feature flag (server) — gates the entire wallet UI + debits
CommissionConfig { enabled: boolean; startsAt: string; ratePct: number; floor: number; graceCredit: number }
GET  /wallet/config            → CommissionConfig

// Balance + ledger
Wallet { balance: number; currency: 'USD'; updatedAt: string }
WalletEntry {
  id: string;
  type: 'commission' | 'topup' | 'grace' | 'adjustment';
  amount: number;            // signed: debit negative, credit positive
  title: string; meta: string;
  orderId?: string;          // commission debits link to the delivery
  rail?: 'ecocash'|'innbucks'|'omari'; ref?: string;
  createdAt: string;
}
GET  /wallet                   → Wallet
GET  /wallet/ledger?cursor=    → { entries: WalletEntry[]; nextCursor?: string }

// Top-up (rail prompt-to-phone)
Topup { id: string; status: 'pending'|'succeeded'|'declined'|'expired'; amount: number; rail: string; phone: string; expiresAt: string }
POST /wallet/topups            body { amount, phone, rail } → Topup(pending)
GET  /wallet/topups/:id        → Topup   // poll every ~3s until terminal, OR subscribe via the existing socket
```

Server-side (repo tickets — surface in the PR body, don't silently implement business logic):
- **Commission debit is server-authoritative.** On delivery completion, debit `ratePct%` of the
  agreed fare (0% = no debit at launch), write a `WalletEntry(type:'commission', orderId)`. The
  app only *reads* the ledger. Changing `ratePct` is a config change, not a deploy.
- **Go-online enforcement is server-side.** Reject the online transition when `balance < floor`
  with reason **`commission_low_balance`** — add it to the `gates.ts` `OnlineGateReason` union so
  the existing gate template renders it. The client mirrors the block; the server is the gate.
- **Grace credit** issued once, at the flip, per eligible rider.
- **Top-up integrity:** amount clamped $5–$50 server-side; idempotency key on `POST /topups`;
  never credit until the rail confirms; expire the intent at 90s; reconcile late rail callbacks.
- **Feature flag** hides the wallet row and disables debits until `enabled` — pre-flip riders
  see no commission anywhere.

## Accent-split & voice (highest-risk regression — see HANDOFF)

- White-on-green fills → `cta` (#00812F), never bright `accent`. Green text/small icons →
  `accentText` (#006630). Selected chips/rails → `accentWash` bg + `accentText` border.
- Negative/below-floor balance → `--danger-wash` with `--danger-ink`/ink text; **never red
  text on white.** Gold `highlight` = border/star only.
- Voice: second person, sentence case, calm, honest, no emoji. Every dead-end offers an action.
- Device rules: 320px-first, skeletons over spinners, touch targets ≥44px, tabular figures on
  every money value.

## Definition of done

1. Earnings row opens the wallet, gated by `commission.enabled`; hidden pre-flip.
2. Wallet renders every state from live data (loaded/low/negative/first-open/empty/loading/offline).
3. All money maths read `ratePct` from `/wallet/config` (0% at launch → 10% post-flip); no hardcoded rate.
4. Top-up completes end-to-end on all three rails, with timeout + declined recovery, 90s window.
5. Go-online is blocked below the $2 floor with `commission_low_balance`, CTA into top-up; clears on top-up.
6. Ledger shows each commission debit beside its delivery; amounts tabular; credits/debits coloured per the split.
7. `pnpm build` / `pnpm typecheck` / `pnpm lint` clean.
8. PR body lists the server-side tickets above (commission model reconciliation, debit engine,
   online-gate enforcement, grace issuance, top-up integrity) as separate follow-ups.
