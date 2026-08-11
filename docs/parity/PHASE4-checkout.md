# Phase 4 — Customer food CART & CHECKOUT cluster alignment

Pixel-parity (structure-first) alignment of the customer **food cart + checkout** cluster against the
`window.RC` mocks in `packages/design/explorations/restaurants/r-customer-a.jsx` (helper primitives —
`AppBar`, `EtaLine`, `PriceMath` — in `r-parts.jsx`). The gallery/mock wins over any code comment.

- **Side-by-side:** `tools/parity/out/phase4_checkout.png`
  (`cd tools/parity && node pair.mjs --keys "RC.cart,RC.checkout_cash,RC.checkout_wallet" --out out/phase4_checkout`
  → all three print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test`
  **907/907** pass.

Layout/structure only — no cart mutation, wallet/cash selection, delivery-fee estimation, idempotency
or order-placement logic was changed. No test asserted the old screen structure (the cart/checkout
tests are pure-logic), so none needed rewriting; the full suite was re-run to confirm.

---

## RC.cart → `apps/mobile/app/food/cart.tsx`

The mock draws the cart under the shared **`AppBar`** (title + kitchen name + back chevron) and closes
with the shared **`PriceMath`** card. The app was using an in-body 19px heading and a bespoke
`Row`-based summary — same information, different (non-mock) primitives. Both now use the mock's own
primitives.

| # | Mock rule (`RC.cart`, r-customer-a.jsx:294-347) | File:line change that satisfies it |
|---|---|---|
| 1 | Header is **`AppBar title="Your cart" sub="Sadza Republic"`** — 16/700 title, 11.5 muted sub, rotated-chevron back (r-parts.jsx:74) | Replaced the inline `<Text 19/700>` + muted-subtitle pair with `<AppBar title="Your cart" sub={restaurantName} onBack={router.back} />`. The empty-cart branch uses `<AppBar title="Your cart" onBack={…} />` (mock `RC.cart_empty` draws AppBar with no sub). This also gives the screen the back affordance it previously lacked (headers are `headerShown:false`). |
| 2 | Summary is the shared **`PriceMath`** card — itemised rows (13.5 muted / 14 value), a 1px hairline, then a **19px Total** (r-parts.jsx:298) | Replaced the local `Row`-based summary Card (and deleted the now-unused `Row` helper) with `<PriceMath rows={[Food, Small-order fee?]} total={cart.total} footnote=… />`. |
| 3 | Line-item row: qty on the left, dish name 14/600, per-dish note as **pencil + accent-text**, line price on the right | Already matched (name 14/600, `pencil`+accent-text note pressable, `Money` line total on the right) — unchanged. The app's left control is the interactive **`QtyStepper`** where the static mock draws a read-only qty badge (see deviations). |
| 4 | "NOTE FOR THE WHOLE ORDER" + "Add more items" | Already present (editable `NoteField`; "Add more items" row) — unchanged. |

Preserved: the menu-reconciliation banner (R3·b1 sold-out / R3·b2 price-change — the live equivalent
of the mock's separate `cart_oos`/`cart_price` states), the below-minimum warning (R3·b4), per-line
note editing + the whole-order `CartNoteSheet`, `MAX_ITEM_QTY` clamping, and the
`Go to checkout · $total` CTA.

**Honest deviations (not faked):**
- **Qty stepper vs badge.** The mock is a frozen still, so quantity is a read-only badge; the app must
  let the customer change it, so the left control is the interactive `QtyStepper`. Live capability the
  static mock can't draw — not a structural miss.
- **EtaLine omitted.** The mock leads the cart with "Arrives in 30–40 min · 10:11–10:21". No arrival
  window is knowable at the cart stage — the drop-off address isn't entered until checkout — so a
  concrete ETA would be invented. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **"ADD A DRINK?" upsell omitted.** The mock draws a two-card drinks rail. The customer read API
  exposes no cross-sell / drinks-category feed, so the rail would be faked hard-coded content.
  Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **No delivery line in the summary.** The mock's `PriceMath` shows a `Delivery` row (fee $2.50,
  3.1 km) because its address is known; the app can't estimate a fee until the drop pin is set at
  checkout, so the footnote names it ("Delivery fee is added at checkout…") instead of showing an
  invented figure.
- The whole-order note stays an **editable `NoteField`** below the items card rather than the mock's
  read-only in-card row, and the "a note can't change the price" helper (D-35 price integrity) is kept
  though the mock cart doesn't redraw it — both are load-bearing around the app's editable-note
  capability.

---

## RC.checkout_cash → `apps/mobile/app/food/checkout.tsx` (cash variant)

| # | Mock rule (`RC.checkout_cash`, r-customer-a.jsx:423-464) | File:line change that satisfies it |
|---|---|---|
| 1 | Header is **`AppBar title="Checkout" sub="Sadza Republic"`** with back chevron | Replaced the inline `<Text 19/700>` + muted subtitle with `<AppBar title="Checkout" sub={restaurant.name} onBack={router.back} />`; the loading + empty branches use `<AppBar title="Checkout" onBack={…} />`. |
| 2 | Cash selected = **1.5px accent border + accent-wash, banknote accent, filled check**; mobile-money unselected = 1px line + empty ring | Already matched via `PaymentMethodRow` (accent border/wash + filled `check` when selected; line border + ring when not) — unchanged. |
| 3 | Cash subtitle "Pay the rider **$15.50** when the food arrives" (the total) | Already matched (`Pay the rider {formatMoney(total)} when the food arrives`) — unchanged. |
| 4 | `PriceMath` note "Have the exact amount if you can — riders carry little change." | Already matched (kept, with the honest estimate clause — see deviations). |
| 5 | Cancellation box names the **full figure**: "…cancelling costs the full **$15.50**." | Copy now interpolates the total: `…cancelling costs the full ${formatMoney(total)}.` (was "the full amount"). |
| 6 | CTA "Place order · pay $15.50 cash" | Already matched — unchanged. |

**Honest deviations (not faked):**
- **Live address-entry block vs static summary row.** The mock draws one tappable summary row
  (`map-pin` + "12 Lanark Rd, Belgravia" + "· 3.1 km away" + chevron) — an *already-chosen* address.
  The app must **collect** the drop-off: `MapPicker` (drag-to-pin), `AddressSearch`, a Landmark field
  and a Contact-phone field, all of which feed `submit()` (dropPoint / dropLandmark / dropPhone). These
  are load-bearing inputs the static mock represents as a done deal. Strong candidate for
  `docs/DESIGN-DEVIATIONS.md`.
- **EtaLine omitted** (same reason as the cart — no confirmed ETA pre-placement).
- **PriceMath estimate clause.** The app's delivery row reads "Delivery fee (estimate)" and the note
  carries a trailing "The exact delivery fee is confirmed the moment you place this order." — the mock
  shows a *confirmed* fee (its address is fixed), the app can only estimate one from the drop pin. The
  clause is honest necessity, not mock copy.
- In the harness the `MapPicker` renders a gray stub and `AddressSearch` an "unavailable — tap the map"
  fallback (both live on device) — honest-stub, not faked.

---

## RC.checkout_wallet → `apps/mobile/app/food/checkout.tsx` (wallet variant)

The wallet variant is the same screen with mobile-money selected; the mock changes the wallet row's
**subtitle** and reveals an expanded note.

| # | Mock rule (`RC.checkout_wallet`, r-customer-a.jsx:468-500) | File:line change that satisfies it |
|---|---|---|
| 1 | When mobile money is selected its subtitle becomes the **provider list** "EcoCash · InnBucks · O'mari"; unselected it reads "Pay the restaurant after they accept" | Wallet `subtitle` is now conditional: `paymentMethod === "wallet" ? "EcoCash · InnBucks · O'mari" : "Pay the restaurant after they accept"`. |
| 2 | Expanded note: **clock 15 accent**, ink copy 12.5, lead sentence **bold** — "**You pay only after the restaurant accepts.** They'll call you to confirm, then send the payment request — no deadline, the kitchen starts once it lands." | Note copy corrected to mock verbatim (was "call to confirm, then request payment"); clock `size 14 → 15`; text `color accentText → ink`, `12 → 12.5`, `lineHeight 16 → 18`; lead sentence wrapped in a `700` `<Text>`. |
| 3 | `PriceMath` note "Paid straight to **Sadza Republic**. LyniaGo never holds your money." (names the kitchen) | Wallet footnote now interpolates the real kitchen: `Paid straight to ${restaurant.name}. …` (was the generic "the restaurant"). Keeps the honest estimate clause. |
| 4 | CTA "Place order · pay after they accept" | Already matched — unchanged. |

Preserved (both variants): `HOURS_RECHECK_MS` closed-kitchen recheck, the closed-warning card,
`OfflineBanner` + reachability gating + offline card, phone-validation gating, the seeded
`idempotencyKey`, `placeFoodOrder` + `seedFoodOrder` + `cart.clear()` on success, and `ErrorText`.

**Honest deviations (not faked):**
- The mock's wallet variant does not redraw the cancellation box / doesn't repeat every lower card —
  it's a partial redraw focused on the payment selection. The app keeps the (payment-method-specific)
  cancellation box and `PriceMath` for both variants, since they're the same live screen and both are
  load-bearing consumer-protection copy.
- Delivery estimate clause, EtaLine, and the live address-entry block are shared with the cash variant
  (above).
