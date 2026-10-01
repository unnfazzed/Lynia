# Handoff: LyniaGo Order flow v2 — Restaurants, Shops & Pharmacy

Checkout → order screen → hand-over at the venue → hand-over at the door → done, on the customer, merchant and rider phones. `BRIEF.md` holds the decisions. `PROMPT.md` is the brief.

## Files
- `CLAUDE-CODE-PROMPT.md` — **start here if you're implementing.** Build order, rules, definition of done.
- `Order flow v2.1 - all screens.html` — **final look.** Every state at 360×720 on one canvas, with hand-over moments side by side (customer / merchant / rider). `?screen=T4` opens one frame. `?w=320` renders every frame at 320×640. `?fs=1.3` renders every frame at font scale 1.3. `order-flow-v2-1.html` is the same canvas as one offline file.
- `Order flow v2 - all screens.html` — v2 before the polish layer, kept for comparison.
- `code/copy.ts` — every string (`O`). `code/tokens.ts` — tokens, type, radii, code lengths.
- `of-kit.js` (parts + `O`) · `of-polish.js` (v2.1 overrides) · `of-screens-rt.js` (R, T) · `of-screens-upd.js` (U, P, D) · `of-screens-mrg.js` (M, RD, hand-over groups, G) · `of-render.js`.
- `BRIEF.md` decisions · `PROMPT.md` original brief · `assets/` fonts, icons, service stickers.

These are design references. Rebuild them in the Expo app using the After Send v2 / Send v2 / Rider v2 components. Lift values and copy from the JS; don't port it.

## Global rules
- 360×720 design, 320×640 must work, font scale 1.3 for key states. Content scrolls. Build bottom padding = CTA bar height + 16, so nothing sits under the bar.
- Targets ≥ 44 dp. One 52 dp primary per screen. Every icon has a visible label.
- Cash only. USD with tabular numerals. Never red text on white: problems use `danger-wash` + `danger-ink`. Green text is `#006630`.
- Delivery code: 6 digits, shown 3+3, copied/shared without the space. Pickup code: also 6 digits, shown 3+3 ("731 604"). Push never carries a code.
- No pull-to-refresh, no Refresh. A failed *first* load shows "↻ Try again". Offline keeps the last state under an ink banner, "You're offline · last update 12:31".
- Errors are an ink toast for about 4 s. Hints never block, except the cash rule, the code and the Rx photo.

## Screens and states
**R · Review & place.** R1 restaurant (+ full, 320, fs) · R2a shop · R2b pharmacy · R3a address edit · R3b out of area · R4 under minimum · R5a schedule sheet · R5b scheduled review · R5c closed venue "Order for when they open" · R6a sold out / price changed · R6b venue just closed · R7a placing · R7b failed · R7c offline · R8a Rx empty (blocked) · R8b Rx added · R9a empty cart · R9b no location.
**T · Order screen.** T1 sending · T2 confirming · T3 waiting for accept · T4 cooking (+320, fs) · T5a packing shop · T5b packing pharmacy · T5c Rx check · T6 rider to venue · T7 collecting · T8 collected · T8b photo viewer · T9 on the way (+320, fs) · T11a slow rider · T11b rider dropped · T12a no fix · T12b GPS paused · T13a scheduled · T13b scheduled started · T14a loading · T14b couldn't load · T14c not found · T14d offline saved copy · T15a–d cancel (free / full / in flight / failed) · T16a help · T16b report a problem. (T10 "at your door" = P1.)
**U · Substitution.** U1a merchant proposer · U1b swap picker (both in row M) · U2a one swap (+320, fs) · U2b three lines · U3 timeout · U4a mid-prep change · U4b reduce-only · U5 all out of stock.
**P · Door.** P1 pay (+320, fs) · P1s pharmacy seal · P1b waiting for the rider · P2 code (+320) · P2b share code · P3a ring lapsed · P3b cash disagreement · P4 = RD2b/RD4c/RD4d · P5 customer door photo (hand-over row).
**D · Done.** D1 delivered (+full, 320, fs) · D1b rated + Undo · D2a/b completed later · D3a you · D3b venue · D3c kitchen 1 h · D3d no rider · D3e LyniaGo · D3f after pickup · D4 not delivered · D5a/b Rx declined.
**M · Merchant.** M1a ringing (auto-accept) · M1c scheduled ringing · M2 waiting for answer · M3a cooking · M3b packing pharmacy · M4 hand-over (+320, fs) · M4b waiting for photo · M5 tracking · M5b door photo · M6a cash back · M6b goods back · M7a Scheduled list · M7b scheduled ticket · M8a Rx check · M8b decline.
**RD · Rider.** RD1a SHOP offer · RD1b PHARMACY · RD1c scheduled · RD1d Rx · RD2a pickup code · RD2b sealed tick + photo · RD2c taken · RD2d queued offline · RD3 Rx stop card · RD4a collect cash · RD4b code · RD4c can't use code · RD4d door photo.
**G.** G1 live bar per stage · G2 Orders Now cards · G3a–c push per phone.

## Navigation
- Storefront cart bar → **R**. The R blocks: Deliver to ✎ → inline address card (R3) · Schedule → schedule sheet (R5a) · ✎ phone/note → inline field · "+ Add more items" → back to the storefront.
- Place order → R7a → **T1** (replaces R in the stack; Back from T goes Home). A failure → toast with Try again, staying on R.
- T: Help → help sheet (T16a). Report a problem → T16b. "Cancel order" → T15. View on the photo row → T8b. Share code → system share. Call venue/rider → dialler. WhatsApp → WhatsApp.
- Substitution: a push or the live bar opens T, and the card is the sheet's first block. Confirm → back to the stage.
- Delivered → D1 in place. Order again → refills the cart → R. Endings → Back = Home.
- Merchant: ring → (Edit items → proposer) → M2 or M3 → "Food is ready / Order is packed" → M4 → Hand over → M5 → M6a.
- Rider: offer → B1 → RD2a code → RD2b photo → RD2c → drop-off → RD4a → RD4b → done (Rider v2 B5).

## Components (new are marked ★, reused are marked ♻)
| Component | Spec (360 / 320) |
|---|---|
| ♻ AHeader | 24 status + 52 bar. Back 15/600 green · title 16/700 = venue name, ellipsis · Help pill 34/44 on live orders. Same at 320. |
| ★ VenuePin | 44 dp disc in the tile colour (food #FFD9CC, shops #DDD5FF, pharmacy #C5E9DF), sticker 28, 3 dp white ring, menu shadow, name pill 12/600 under it. Same at 320. |
| ♻ Sheet | 16 radius, 28 grabber row. Peek = bottom of the first block after the track + 16. Map ≥ 110 dp at 720, ≥ 96 at 640. |
| ★ Stage top | title 19/700 wraps · ETA line 15/600 with clock 16, or the highlight chip 13/700 after collection · optional sub 13 muted. |
| ♻ StepTrack | 4 columns, 20 dp circles, 3 dp connectors, labels 12/600 (wrap at fs 1.3). |
| ★ PrepBar | label 14/600 "Cooking · about 12 min left" · 4 dp bar · optional 13 muted line. |
| ★ VenueRow | 40 dp sticker tile · name 15/700 · order # 13 · Call SmBtn 44. |
| ★ OrderSummary | collapsible card, 44 dp row "Your order · 3 dishes · $16.50 cash · See order ⌄", expands to lines. |
| ♻ RiderCard, CodeCard | After Send v2, unchanged; code card copy changes (O.t.codeHelp). |
| ★ SubCard | per line: 44 photo · "Out of X · ~~$1.10~~" 13 · "Swap for Y" 15/700 · price + diff pill · two 44 SmBtns (Accept swap / Remove it). An unanswered card has a 1.5 green border. The head has a highlight countdown pill + 4 dp bar. Total rows "Was / New total". CTA "Confirm changes · New total $X", disabled until every swap is answered. |
| ★ DoorCard | 2 dp green border, r16, padding 12/14 · three rows, 26 dp numbered discs (done = green fill + check, current = green ring, upcoming = surface) · titles 15/700 · subs 13. |
| ♻ CodeBig | After Send v2: 56/800 (48 under 340 dp), 3+3, white panel, 2 dp green border. |
| ★ PhotoRow + viewer | 48 thumb · title 14/700 · sub 13 · View SmBtn. Viewer: ink full-screen, photo r16, caption 13 forest-sub, Close. |
| ★ Receipt | lines + Food/Items + Delivery fee + Total 17/700 + "Paid in cash to Tendai" + From / Rider / Delivered + Share receipt. |
| ★ TwoRowRating | card: "How was {venue}?" stars (44 cells, highlight fill, star-stroke outline) + tags; divider; "How was Tendai?" stars + tags; Send rating (52) + Skip. |
| ★ ReviewBlock | r14 card, 12/14 padding, uppercase 12/600 label + ✎ Edit (44 hit) · body. Items lines: name 15/600 · price 14/600 · note link 13 · stepper 44 high. |
| ★ ScheduleSheet | modal sheet: title 19/700 · Today/Tomorrow segmented · 2-column slot chips 44 dp (selected = mint + check; full = surface + "· Full", disabled) · one muted line · CTA "Arrive {slot}". |
| ★ RxBlock | empty: green border, line 14 + two SmBtns (Take photo / From gallery). Filled: 64×80 page thumbs + add tile, patient field, consent tick. |
| ★ RxCheck (merchant) | 250 dp zoomable photo with page pill + Zoom · Patient / Needs a prescription rows · consent line · Decline / Approve row. The decline sheet has reason chips + a note. |
| ★ ScheduledList (merchant) | 4th segment "Scheduled n" · cards: #id + total, calendar + slot 13/600, "n dishes · Rings at 12:05 like a new order". |
| ★ Merchant proposer | inside the ringing sheet: tap a line → it greys and shows Remove it / Swap for… (44). Removed lines strike through with a "Removing" pill, swaps show a green ⇄ line. CTA "Send n changes to customer". |
| ★ Merchant track | the customer's 4-step track + a merchant-only "Cash back to you" row (surface, or highlight wash once due). |
| ♻ Rider StopCard, CashSplit, CodeBoxes (6 boxes for both pickup and delivery codes) + numpad, JobShell | Rider v2. ★ JobTag adds SHOP (#DDD5FF) and PHARMACY (#C5E9DF). ★ TickRow 52 dp (box 24, r6). ★ Camera step: ink, r16 viewfinder with a dashed guide, white bottom panel, 72 dp shutter. |

## Per service
| | Restaurant | Shop | Pharmacy |
|---|---|---|---|
| Accept | auto; kitchen confirms ("Got it, we're making it"), auto-cancel at 1 h | 3 min to accept | 3 min to accept |
| Step 2 / title | Cooking / "Cooking your order" | Packing / "Packing your order" | Packing (after "Pharmacist is checking your prescription" when Rx) |
| Merchant ready button | Food is ready | Order is packed | Order is packed |
| Out-of-stock preference on Review | no (the kitchen still proposes) | Ask me · Remove it | Ask me · Remove it |
| Pickup photo | optional | required, Hand over waits for it | required + "Bag is sealed" tick |
| Door card ① | "Tendai hands it over first" | "Check the seal…" when sealed | "Check the seal is unbroken before you pay" |
| Notice on Review | — | — | OTC notice (green, shield) |
| Rx | — | — | flag only: block, check stage, merchant check, rider tick |
| Venue pin tile | #FFD9CC | #DDD5FF | #C5E9DF |

## Peek per stage (must be fully visible)
| Stage | In the peek |
|---|---|
| T1 sending | title + track |
| T2–T5 | title + ETA + track + prep bar / countdown |
| U2 substitution | head + first line card (the sheet opens tall: map 80–100 dp) |
| T6–T7 | title + ETA + track + rider card |
| T8–T9 | title + ETA chip + track + photo row or rider card |
| P1–P3 at the door | title + door card (the map shrinks to about 100 dp) |
| P2 code | door card + code panel |
| T13 scheduled | title + sub + track + order summary |

## Push copy
All push copy lives in `O.g.push` (customer `c`, merchant `m`, rider `r`) as [title, body]. It's rendered in G3a–c. Rules: name the venue or rider, give the next ETA or the next action, never a code, never a wallet.

## Tokens
Calm Mint v2 + After Send v2 only: ink #14181B · muted #5B6670 · line #E2E6EA · surface #F6F7F8 · accent #00B14F (fills) · accent-text #006630 · cta #00812F · mint #E9F8EF · forest #063B22 / #BFE6CD · highlight #FFD23F / ink #3D3100 / star stroke #C99500 · danger #C0392B / wash #FAEDEB / ink #8F2418 · tiles #FFD9CC / #DDD5FF / #C5E9DF · skeleton #EEF1F3. Inter 400/600/700/800. Radii: fields 12, cards 12–16, sheet 16/20, pill 999. Only sheets, map pins and toasts have shadows.

## NEEDS BACKEND
Per-line substitution proposals + per-line approval, and approval for mid-prep edits · "If something's out of stock" preference · pickup photo on merchant orders; door photo surfaced to customer + merchant · scheduled orders (slots API, ring at start, "order for when they open") · Rx: Script entity, pharmacist role, Rx item flag, check/decline + reason · venue rating + merchant-order receipt · shop/pharmacy catalogue + order APIs · merchant-order step track on the customer socket · owed balance after a cancel-after-pickup (D3f).

## Keep / redesign / merge / retire
- **RC gallery:** `RC.cart` + `RC.checkout_cash` → **merge** into R1 · `RC.cart_empty` → redesign as R9a · `RC.checkout_wallet` **retire** · `RC.await_accept` → redesign as T2/T3 · `RC.item_removed` → redesign as U2 · `RC.pay_now`, `RC.pay_confirmed` **retire** · `RC.track_prep` → T4 · `RC.no_rider` → T11a / D3d · `RC.track_way` → T9 · `RC.delivered_rate` → D1 · `RC.rejected` → D3b (cash copy) · `RC.refunded` **retire** (no prepaid orders) · `RC.closed_interrupt` → R6b.
- **App-only food views:** Confirming → T2 · AwaitingAccept → T3 · ItemApproval → U2 · AwaitingPayment **retire** · Preparing → T4 · ReadyForPickup → T11a/T6 · LiveTracker → T8/T9 (map moves out of the card; Expand/Recenter and the "gold pin" explainer go) · CashHandshakeCard + DeliveryCodeCard → **merge** into DoorCard (P1–P2) · Delivered → D1 · Cancelled → D3a–f · Undelivered → D4 · RiderDropped → T11b · RefundPending **retire**.
- **After Send v2:** keep, now with merchant stages. **Rider v2:** keep, plus RD deltas (no-show wait copy 10 → **8 min**). **Merchant mobile:** keep B1–B7 and D1–D7, plus U1, M2, M4 photo, M7, M8. B6's 8-step stepper becomes the 4-step track + Cash back row.

## Retires
The prep ring and 7-row stepper on the customer side · the map inside a card with Expand/Recenter · the 4-digit food code · "nothing has left your wallet", "Paid to · mobile money", "Your reference EC-…", "…mobile money only" · "no answer cancels it" · the separate cart and checkout screens · the disabled pale Place order with no reason.
