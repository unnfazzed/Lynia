# Claude Design brief — Rider Wallet: new screens + regressions to existing UI

> Companion to `2026-rider-wallet-design.md` (the reviewed plan). This is the
> self-contained prompt for the Claude design session that adjusts the current UI
> mockups to fit the wallet. Paste it whole; it assumes no prior context.

**Role:** You are adjusting and extending the UI mockups of **Lynia**, a motorbike
parcel-delivery app for Harare, Zimbabwe (Android-first, cheap phones, bright
sunlight, low-trust cash market). You are adding the **rider commission wallet** and
adjusting existing screens to accommodate it. The design north star: **every pixel
either builds or erodes trust** — a rider must never wonder whether Lynia is taking
money silently.

## Design system (locked — do not deviate)

- **Direction:** Grab-style clean utility. Light theme only. Data-light. White cards
  (16px radius) on soft ambient shadows, no visible borders; hairlines for
  dividers/inputs.
- **Color tokens:** `--ink #14181B` (body), `--muted #5B6670`, `--bg #FFFFFF`,
  `--surface #F6F7F8`, `--line #E2E6EA`, `--accent #00B14F` (**fills/graphics only,
  never text**), `--accent-text #006630` (green text/icons, ~7:1), `--accent-wash
  #E9F8EF`, `--cta-fill #00812F` (primary buttons, white label), `--highlight #F2B705`
  (gold, sparing), `--danger #C0392B`, `--danger-wash #FAEDEB`.
- **Type:** Inter (400/600/700). 24px screen titles, 18px card titles, 14px body,
  12px captions, 16px inputs/buttons. **Tabular numerals for ALL money.**
- **Spacing:** 8pt scale (4/8/12/16/24/32/48); 16px screen edge padding (320px-first).
- **Components:** primary CTA = full-width pill 52px `--cta-fill`, **one per screen**;
  secondary = outline 48px; inputs have visible labels above (never
  placeholder-as-label); skeletons over spinners; Lucide line icons **always paired
  with a text label**; **no emoji anywhere**.

## NEW SCREEN 1 — Wallet (dedicated screen, route from Earnings)

Hierarchy top-to-bottom:

1. **Balance hero** — visually *distinct from* the Earnings green hero (use
   `--surface` with `--accent-text` accents, NOT a second green hero — one green
   money hero per app): label "Commission balance", amount large tabular (e.g.
   `$4.85`), caption "Commission: 5% per delivery" (**value from the server payload,
   never hardcoded**). Negative variant: hero switches to `--danger-wash`, amount in
   `--ink` (never red text on white), caption "−$0.30 owed · your next top-up covers
   this".
2. **Top up** — the screen's ONE primary CTA.
3. **Receipt history** — each row a checkable receipt: line 1 bold 14px "Delivery to
   Avondale", line 2 caption "Tue 14:02 · 5% of $3.00", right-aligned bold tabular
   "−$0.15"; credits "+$5.00" / "EcoCash top-up · ref 8821". Low-balance soft chip
   (`--accent-wash`, turning `--danger-wash` below the floor) above the list.
4. **Honest-copy card** (gold `--highlight` wash) explaining the commission model in
   the app's calm, second-person voice.

**States:** loading = `SkeletonRows`; **first-open after reveal** = balance already
shows the $5 grace credit, copy "We've added $5 to get you started — commission
starts [date]" (first feeling must be *given*, not *charged*); empty history = "Your
commission history starts with your next ride"; offline = cached balance +
`OfflineBanner` + "as of Tue 14:02" stale label.

## NEW SCREEN 2 — Top-up flow

1. **Amount entry:** visible label, min $5 enforced inline ("Minimum top-up is
   $5.00"), quick-amount chips ($5/$10/$20), rail selector: EcoCash (primary) /
   InnBucks / O'mari.
2. **EcoCash USSD wait:** full-screen calm state — "Check your phone — approve the
   request on the EcoCash prompt", 90-second countdown (the one sanctioned wait
   animation), cancel affordance.
3. **Timeout:** "The request expired — no money moved. Try again." + retry CTA.
   The *no money moved* reassurance is mandatory copy.
4. **Success:** return to Wallet, new credit row visible at top, balance updated.
5. **Manual rails (InnBucks/O'mari):** instruction card, not a form — merchant number
   with copy button, reference code, expectation line "Credited by our team within
   ~30 minutes during work hours".

## NEW STATE 3 — "Top up to keep riding" (online gate)

Joins the existing gate-state family (same layout/voice as KYC / on-hold / cooldown
refusal states). Shows: status ("You're offline"), reason ("Your commission balance
is below $2.00"), **the exact amount needed** ("Top up $1.15 to go back online"),
one CTA deep-linking into the Wallet top-up flow. After a credit clears the floor:
auto-refresh + quiet toast "You're back online". Tone: *blocked by a rule, not
punished* — calm, specific, actionable, zero shame.

## REGRESSIONS / CHANGES TO EXISTING SCREENS

1. **Earnings screen** — earned-total green hero and trip rows are **unchanged**
   (regression guard). Add ONE compact row between the trip list and the explainer
   card: "Commission balance · $4.85 ›" (ink, tabular, chevron → Wallet). This row
   and the Wallet route are **hidden behind a server flag** until the flip comms
   window — design both states (hidden = screen looks exactly as today). *(Superseded
   by a dated 2026-07-15 product decision: `WALLET_REVEAL` now defaults to visible
   from launch — see `2026-rider-wallet-design.md`'s reveal section. The flag/
   both-states design still stands as the kill-switch path.)* **Rewrite
   the gold explainer card copy**: it currently promises "a per-ride commission line
   and your account balance will appear here" — post-reveal it points to the Wallet;
   pre-reveal keeps current copy. All rate copy is server-driven — never a hardcoded
   "5%".
2. **Rider home / go-online flow** — the online-gate refusal family gains the new
   state above; existing states (verify ID / on hold / cooldown / out of area) render
   unchanged (regression guard).
3. **Admin console — rider detail** — gains: wallet balance + ledger table (same
   receipt anatomy, denser); **manual credit form** (amount capped at $50, reason
   field, submit disabled while pending; the idempotency key is minted when the form
   opens — show it subtly as the reference); frozen state — a `commission_freeze`
   hold renders in the existing admin-hold UI (admin-clear-only), with top-ups
   visibly disabled while frozen.
4. **Admin console — Commission page** — gains the **bulk seed-credit action**:
   campaign name, per-rider amount, preview count ("credits 14 active riders $5
   each"), explicit confirm step; re-running the same campaign shows "already applied
   to N riders — 0 new credits" (never a silent double-grant).

## Accessibility & regression guards (apply to everything above)

Receipt rows carry full-sentence `accessibilityLabel`s ("Commission 15 cents, 5
percent of 3 dollars, delivery to Avondale, Tuesday 2 p.m."). Touch targets ≥44px.
The gate state reads coherently in one screen-reader pass: status → reason → amount →
action. Sunlight contrast per tokens (body ≥4.5:1; never text in `--accent`). No
emoji, no dark mode, no new fonts, no new colors, one primary CTA per screen,
skeletons not spinners. Money is always `formatMoney` + tabular numerals.
