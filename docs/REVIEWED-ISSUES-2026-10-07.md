# Reviewed issue list: customer + merchant audits, 2026-10-07

This is the working list for the fix waves. Each fix PR names the IDs it closes.

**Sources**
- Customer review: `docs/CUSTOMER-UX-PERF-REVIEW-2026-10-07.md`, on draft PR #1118. It has 109 findings: U01–U67 and P01–P42.
- Merchant audit: `docs/e2e-runs/2026-10-07-merchant/REPORT.md`, merged in #1116 and #1117. It has 91 findings, all MJ-*.

**How this was checked.** Five independent read-only checkers re-traced the findings against `origin/main` @ `26536c5`:
- every blocker and high on both sides;
- every pair where the two reports describe the same root cause from opposite sides;
- every customer finding that the review's two skeptics split on;
- every merchant medium that the audit had not re-checked itself;
- every design-gap claim, against the handoffs and `DESIGN-DEVIATIONS.md`.

Customer mediums and lows marked CONFIRMED (both of that review's skeptics agreed) and the merchant addendum lows were **not** re-traced a third time. They are accepted on the original evidence.

**Open PR #1103** ("live robustness sweep") fixes **none** of these findings.
- It edits the same functions as cluster C6: `food-debt.service.ts` `confirmGoodsReturned`/`reportNonReturn`, and `order-lifecycle`.
- It edits code next to U22, U36 and U37, which means rebase conflicts only.
- It changes nothing in `apps/merchant`.

## Verdict legend
✅ real · ◐ partly real (the part that holds is noted) · ✖ not real · ≈ real but negligible (drop) · ⇢ duplicate (folded into the item named) · 🟡 needs an owner or design decision before code

---

## 1. Cross-side clusters (one root cause seen from both apps)

| # | IDs | Verdict | Root cause / the one fix | Effort | Decision |
|---|---|---|---|---|---|
| C1 | MJ-H2 + U31 | ✅ | **Cause:** the offline "clock pause" pushes the accept deadline out 20 s per sweep. The merchant gets at most 20 s after reconnecting, and the customer's timer loops forever. The two reports' fixes pull in opposite directions. **Fix:** store the remaining time when the merchant goes dark, restore it on reconnect, and add a hard cap after which the order cancels `shop_closed`. | M (adds a column) | 🟡 D1: cap length |
| C2 | MJ-RM1 + U32 | ✅ | **Cause:** the auto-accept sweep sets `ready_for_pickup` and `readyAt=now` 8 min early. **Fix:** let `sweepSearch` dispatch auto-accepted `preparing` orders that are inside the 8-min lead, without touching `merchantPhase`/`readyAt`. | M | — |
| C3a | MJ-H5 + U43 | ✅ / ◐ | **Cause:** Rx is gated on the shop being a pharmacy, not on it having a ticked pharmacist. U43's "can never be packed" is overstated: the owner can tick a pharmacist at any time. **Fix:** refuse Rx placement (`rx_unavailable`) and hide Rx items when the pharmacy has no ticked pharmacist. | S | — |
| C3b | MJ-H4 | ✅ | **Cause:** "Swap for…" can add an `rxRequired` item with no prescription. **Fix:** refuse the swap unless the prescription is approved, and stamp `rxRequired` on the new line. | S | — |
| C4 | MJ-P3 + P03 (+P16) | ✅ | **Cause:** proof and swap photos are re-signed on every read, so every poll downloads them again. **Fix:** put a MicroCache keyed by the object key in front of `proofViews` and the swap mint, the same pattern as `pickupPhotoUrlCache`. P16 is a separate client fix: `cacheKey` = the URL without its query string. | S | — |
| C5 | MJ-RM12 + U25 | ✅ | **Cause:** the server never checks that a category is sellable (hidden, or outside its time window). **Fix:** move `categoryServedNow` into `packages/shared`, use it in both search queries and in `placeOrder` (409). | S–M | minor: whether out-of-window dishes show greyed in search |
| C6 | MJ-RB1 + MJ-RH1 (U21 is the parcel equivalent; U56 is separate) | ✅ | **Cause:** a collected merchant order that is never delivered has no goods-return state. A cancel-after-collect leaves the rider locked out, and "It wasn't returned" writes off and suspends the rider at once. **Fix:** route a collected cancel to K5c, and let `confirmGoodsReturned` accept `cancelled && collectedAt`. Make "not returned" a flag, with no instant suspension. **Must land after #1103,** which edits the same functions. | M–L (money and suspension lane) | 🟡 D3: suspension policy |
| C7 | MJ-H1 + U19 + U20 + U04 + U22 | ✅ | **Cause:** codes are stored as a hash only, so "show the code" can only mean "mint a new one". That breaks a second phone, Back-then-reopen, re-match and lockout. **Fix:** store each code encrypted next to its hash (`PiiCryptoService`), make reveal idempotent, and keep rotate for an explicit lockout re-issue (which is U04's missing button). U20 also needs `onError` and retry on its own. | L (schema + both apps) | 🟡 D2: security trade-off |
| C8 | MJ-M2 + U33 + U66 | ✅ | **Cause:** the reason `other` is overloaded, four different classifiers decide who cancelled, and the auto-accept "Can't take it" drops `{reason, note}`. U33's suggested fix ("other = venue") would also mislabel the N-18 no-answer timeouts. **Fix:** pass the reason and note through, give N-18 its own reason, and use one shared outcome classifier in `packages/shared`. | S–M | 🟡 only U66 (showing the note is undrawn in D3b) |
| C9 | U13 + U35 + U36 + U37 + U49 | ✅ | **Cause:** there is no single server-computed "amount due". The handshake includes the carried balance, while pushes, history and the receipt each use raw `agreedFare`. **Fix:** one `amountDueUsd` on the order read, the history row and the push, and refuse `adjustFare` on merchant orders. Gate Place until the balance has loaded (U49). | M | — |
| C10 | MJ-RL2 + U62 | ✅ / ◐ | **Cause:** offers that `selectOffer` refuses (rider gone, standing or obligation checks) stay pending and listed. The wrong "taken by another customer" message covers every 409. **Fix:** filter or flag unselectable offers, disable Choose when the grace runs out, and map each 409 reason to its own copy. | S–M | — |
| C11 | U11 | ✅ | **Cause:** the no-rider hold has no timeout. The merchant is told "decide what to do" while the customer is told "still searching". **Fix:** let `cancelUnpaid` accept a held order, and show `noRiderHoldAt` as the drawn D3d/T11a state. | M | — |
| C12 | U14 + U58 | ✅ | **Cause:** delete-account checks parcel statuses only. Merchant `requested`/`open_for_offers` orders slip through, and a delivered-but-unrated parcel blocks the delete. **Fix:** widen the privacy check, and have the client use `getActiveCustomerOrders` minus `delivered`. | S | — |
| C13 | MJ-RH3 + MJ-RM9 | ✅ | **Cause:** the merchant hours form renders both null hours (open 24/7 on the server) and `{}` (closed forever) as 08:00–22:00. Customer browse matches the server; the merchant form is the odd one out. **Fix:** show "Not set" for null and refuse saving an all-closed week. | S | — |
| C14 | MJ-RM2 | ✅ | **Cause:** a rider drop leaves `riderArrivedAt`, ETA and pickup photo/seal set, so the next rider inherits "at counter" and the old photo. **Fix:** null those 5 fields in `dropDispatch`. | S | — |
| C15 | MJ-RM13 | ✅ | **Cause:** "Remind me when they open" runs on UTC (about 2 h late) and ignores `closedUntil`. **Fix:** use `harareWallClock` + `effectiveMerchantHours`. | S | — |
| C16 | MJ-RM18 | ✅ security | **Cause:** a staff member who is also a rider can be dispatched their own business's orders. **Fix:** exclude `merchantMember` in `startRound`, and refuse with `own_member` in `acceptDispatch`. | S | — |
| C17 | U12 | ✅ | **Cause:** the "at your door, have $X ready" push fires on `en_route_dropoff`, right after pickup. **Now:** drop or reword that push for merchant orders. **Proper fix:** a server drop-off arrival stamp (80 m). | S / M | copy only if reworded |
| C18 | U65 | ✅ (tie broken) | **Cause:** shops and pharmacy stay orderable when the Restaurants flag is off, yet every order route sits behind `RestaurantsEnabledGuard`. It is also a **live config risk:** the release workflows set no default for `RESTAURANTS_ENABLED`. **Fix:** gate the storefront on both flags, and set the default. | S | — |
| C19 | U10 | ✅ | **Cause:** the pay bar appears only within 150 m of the drop pin, and the rider's "I'm here" tap is device-local, so neither side can finish while the rider's GPS drifts. **Fix:** make "I'm here" stamp the server and drive the door stage. Note: the suggested "show the pay bar for the whole trip" fix would let the handshake clock start kilometres away. | M | 🟡 D5 |
| C20 | MJ-B1 (+ MJ-M14, MJ-RH4, MJ-M6, MJ-M10, the alarm part of MJ-M13) | ✅ | **Cause:** only the Orders board and LiveBar poll and ring, so on 11 pushed screens new orders time out silently. **Fix, one refactor:** move the queue poll and the alarm into `KitchenConnectionProvider` (run in parallel with `/merchant/me`, silence on sign-out, unmount and before the first load, retry on 5xx). That also fixes M14, RH4, M6 and M10. *Showing* the ring over a pushed screen needs a decision. | M–L | 🟡 D4: how the ring appears |
| C21 | MJ-P1 + MJ-RL23 + MJ-RL25 + RL26 (client side) + MJ-RL27 | ✅ | **Cause:** the web ignores `food:queue-changed`, and five separate polls run all day. **Fix:** refetch on the socket event and back the polls off. | M | — |
| C22 | P04 + MJ-RL11 + MJ-RL20 | ✅ | **Cause:** photos are served at full upload size. **Stopgap (S):** a per-kind `maxDimension`, the RL11 step-down, and lazy thumbnails. **Real fix (L):** a server-side thumbnail variant. The API has no image library, so that is new infrastructure. | S / L | 🟡 D7: thumbnails worth the infra? |

## 2. Customer: other blockers, highs and verified items

| ID | Verdict | Note on the fix | Effort |
|---|---|---|---|
| U01 + U03 | ✅ BLOCKER/HIGH | One effect in `BootRouteWatch`: redirect a signed-out deep load, and report the boot destination. The signed-out allowlist also needs `/force-update`, `/permissions` and `/profile/setup`. | S |
| U02 | ✅ BLOCKER | A client cart nonce, as Send does. **Do NOT add the "server backstop":** a partial unique index on (customer, key) would make the insert fail. | S |
| U05 | ✅ | Treat `isPaused` like an error so the saved copy and code show. | S |
| U06 | ✅ | Filter `delivered` out of NOW in `orders.tsx` only. Home shares the query key. | S |
| U07 | ✅ | Subscribe when the socket is already connected, and filter positions by `riderId`. | S |
| U08 | ✅ | Prefill from `Me.phone`. `ReviewField` must forward a ref so focus works. | S |
| U09 + P17 | ✅ | Shared, cached flags. Also treat Rx as on when the catalogue contains an Rx item (P17 alone doesn't fix U09). | S |
| U42 | ✅ (tie broken) | Re-arm auto-submit when back online or foregrounded. | S |
| U64, U67 | ✅ low | U67: gate on `feedQ.isSuccess`. U64 needs copy (a ledger entry). | S |
| U22, U23, U47 | ✅ | Plain app defects; the handoffs don't require them. | S each |
| U28 | ✅ undrawn state | Reuse D5a's drawn reason card, plus a ledger line. | S |
| U21 | 🟡 | Who to contact after a cancel-after-pickup isn't drawn: 18a needs an after-pickup variant. | — |
| U15–U18, U24, U26, U27, U29, U30, U34, U38–U41, U44–U46, U48, U50–U57, U59 | ✅ (accepted on both skeptics' agreement) | Grouped by journey in wave 4. U18 absorbs P29. | S each |
| U61 | ≈ but trivial | One line: `price <= 100_000` in `priceOk`. It rides along with the Send PR. | S |
| U60, U63 | ≈ drop | U60 needs an abandoned sign-up finished on another device. U63's "fix" adds an undrawn row. | — |

**Speed (customer)**

| ID | Verdict | Note |
|---|---|---|
| P01 | ✅ (only when the PostHog key is set) | The provider wrapper changes the tree, so the whole app remounts. |
| P02, P14, P15, P30, P42 | ✅ | One memo/render PR: memoised rows, `useNow` only while focused, per-second ticks in leaf components, memoised `riderFix`/`riderPoint`. P30 is worse than reported: the map also re-renders every tick. |
| P05 | ◐ | Real, but it fails only below ~20 KB/s. Scale the deadline to the upload size. It is shared with rider proof and KYC uploads. |
| P06 | ✅ | Module-level location cache. It must respect `detectOnly` on the rider side. |
| P07, P27, P18, P33, P38 | ✅ web quick wins | `isHashed()` skip, preconnect, debounce, idle Maps load, font preload. |
| P08 + P09 | ✅ | 7-day persisted cache and a proactive token refresh. Probably the biggest cold-start win; P09 needs an auth regression test. |
| P10–P13, P16, P19–P25, P34–P37, P39 | ✅ | Wave 3. P39 is a 3-line fix. |
| P26, P32 | ✅ but defer | P26 puts the Worker in the API path (needs an owner call). P32 is an L-sized, risky bundle split. |
| P29 | ⇢ U18 | — |
| P31, P40, P41 | ≈ | Fold P41's "use `getForegroundPermissionsAsync`" into the location PR (it avoids an OS dialog without the D-82 explainer). Drop the rest. |
| P28 | ✖ | Home's prewarm already pays the first Maps init. |

## 3. Merchant: other verified items

| ID | Verdict | Note | Effort | Decision |
|---|---|---|---|---|
| MJ-M5 | ✅ **security** | Open redirect through `next=%2F%09%2Fevil.example`. Validate with `new URL(next, origin).origin`. | S | — |
| MJ-M7 | ✅ | Presence socket: the server disconnects on a bad token and nothing refreshes it. | S | — |
| MJ-H3 | ✅ | Photo first in the phone layout; the editor is undrawn, so reordering is free. The button label is a copy change. | S | minor copy |
| MJ-RH2 (+ MJ-RM4, MJ-RL4) | ✅ | Ended bookings vanish, and the board goes blank instead of "All quiet". The empty-state part is a plain fix; the ended-booking *cards* are undrawn. | M | 🟡 D6 (cards) |
| MJ-M3, MJ-M4, MJ-M8, MJ-M9, MJ-M11, MJ-M15 | ✅ | — | S each | M4: copy |
| MJ-M13 | ◐ | The expiring photo link and the never-silenced alarm are bugs. The countdown is undrawn. | S–M | 🟡 countdown |
| MJ-M16 | ✅ | Needs a new explaining state. | S | 🟡 copy/UI |
| MJ-M1 | ✅ | Auto-accept says "accepted for you" and then shows Accept. The K2 behaviour is approved in D-77; the `ordering/page.tsx` copy is app-only and can be fixed freely. | S | 🟡 the ringing screen itself |
| MJ-RM3, RM5, RM6, RM7, RM8 (+ "Sales counts unconfirmed"), RM9, RM10, RM14, RM15, RM16 | ✅ | RM7 = the Money tab counting days in UTC instead of Harare time. | S–M | — |
| MJ-RM11 (+ RM17, the timeout half of RL21) | ✅ | Save is live while the photo is still uploading, so the photo is dropped. PhotoPicker reports busy, and the PUT gets a timeout. | S | — |
| MJ-RM19 | ◐ | "Never refreshes" is false. A double +5 and a stale error are real. | S | — |
| MJ-RL1–RL28 (minus the duplicates above), the first report's 14 lows | ✅ (accepted on the original evidence) | Wave 4, grouped by area. | S each | RL10 and RL13 may need UI |

---

## Owner decisions (taken 2026-10-07)

| # | Question | Decision |
|---|---|---|
| D1 | How long may a merchant leave an order waiting before it auto-cancels? (C1) | **24 h for every merchant-side wait.** This covers the 3-min ring, the 60-min unconfirmed auto-accept and the offline pause: we are launching, so merchants need grace. Nothing auto-cancels for a merchant wait inside 24 h. To compensate, the customer keeps a free cancel until the venue accepts, and is pushed "still waiting for {venue}" at 3 min and 15 min. The no-rider hold (C11) is not a merchant wait and keeps its own fix. |
| D2 | Store pickup and delivery codes so showing one doesn't rotate it? (C7) | **Yes: store them encrypted** next to the hash (`PiiCryptoService`). Reveal is idempotent. Rotate happens only on an explicit tap or a lockout re-issue. |
| D3 | When may "It wasn't returned" suspend a rider? (C6) | **Never automatically.** It flags support, the debt stays open, and only an admin decides. The sheet copy says exactly that. |
| D4 | How does a new order ring while the merchant is on a pushed screen? (C20) | **The drawn K2/S2 ringing screen, full screen over any screen**, plus a `DESIGN-DEVIATIONS` entry. The poll and the alarm move app-wide. |
| D5 | The customer's pay-at-door gate (C19) | **No distance gate:** the rider may be offline or their GPS stale. The pay step opens once the rider has collected and is on the way (`en_route_dropoff`). The handshake deadline must not run out on the trip, so it starts or extends from the customer's tap, not from the rider's position. |
| D6 | UI and copy the mocks never drew | **Copy fixes only. Skip new UI.** Ended-booking cards (RH2), the join-without-invite state (M16), the Rx countdown (M13), contacting the rider after a cancel-after-pickup (U21) and the venue note (U66) wait for a design export. The copy changes for M4, U64, H3, U12 and M1 go ahead, each with a ledger line. |
| D7 | Photo sizes (C22) | **Full thumbnails now:** server-side thumbnail generation for new and existing photos, plus the client stopgaps. |
| D8 | PR #1103 | **Merged** on green, before any fix work (#1103 → `1098121`). |
