# Delivery price ceiling for restaurant, shop and pharmacy orders

**Status:** plan, agreed with the owner on 2026-11-05. Not built. **Next step:** a design handoff (§6). Nothing in
§7 is built until that handoff lands and its ledger entry is approved.

**Applies to:** customer app orders to a merchant (`orderType: "merchant"`): restaurants, shops, pharmacies. It does
**not** change Send parcels or the merchant's own "Book a biker".

---

## 1. In one line

The customer sets a delivery **ceiling** ("pay up to $X"). Bikers are offered the job cheap first, and the price
rises each minute until a biker accepts. The customer pays the accepted price and **never more than their ceiling**
unless they agree to raise it.

## 2. Why

Today the delivery fee is fixed at checkout (`deliveryFeeForDistance`, `$0.80/km`, minimum `$1.50`) and offered
unchanged in every round. Three problems:

- The customer never benefits when a biker would do it for less.
- When nobody accepts, nothing can change. "Keep searching" repeats the same offer to the same bikers.
- Food orders and parcels price the same trip with two different formulas.

## 3. The flow

Example: a 2.5 km order. Recommended price **$3.00**.

```
1. CUSTOMER CHECKS OUT
   Sees: Recommended $3.00 · Pay up to [−] $3.00 [+]
   (can lower to $2.50, can raise to $6.00)
        │
        ▼
2. SHOP ACCEPTS AND COOKS   (unchanged)
        │
        ▼
3. BIKERS ARE OFFERED $2.50   (the starting offer)
        │
   Accepts? ── YES ──► Customer pays $2.50  (saved $0.50)
        │ NO, after 60 s
        ▼
4. OFFER RISES $0.50 PER ROUND, up to the ceiling ($3.00)
        │
   Accepts? ── YES ──► Customer pays the accepted price (≤ $3.00)
        │ NO, after 6 rounds in all
        ▼
5. HOLD: THE SHOP IS ASKED FOR A TOP-UP  (+$0.50 / +$1 / +$2)
        │
   Adds one? ── YES ──► Bikers offered ceiling + top-up
        │               Customer still pays $3.00; the shop pays the top-up
        │ NO, or no answer in 2 minutes
        ▼
6. THE CUSTOMER IS ASKED: "Raise to $3.50?"
        │
   Yes? ── YES ──► Bikers offered the new ceiling; customer pays up to it
        │ NO
        ▼
7. UNCHANGED FROM TODAY: the shop keeps searching or cancels
```

**The rules:**

1. The customer never pays more than their ceiling unless they agree to raise it.
2. Bikers never see the ceiling, only the current offer.
3. There is no bidding and nobody compares offers. The first biker to accept takes the job (unchanged).

## 4. The numbers (owner-approved defaults)

All prices sit on the existing $0.50 grid (`roundFare`, `packages/shared/src/money.ts`).

| Name | Rule | Example (2.5 km) |
|---|---|---|
| **Recommended** | Send's suggested fare: `max(1.50, round50(1.50 + 0.60 × km))` (`suggestFare`, `packages/shared/src/pricing.ts`) | $3.00 |
| **Default ceiling** | = Recommended | $3.00 |
| **Lowest ceiling** (floor) | `max(1.50, round50(0.80 × Recommended))` | $2.50 |
| **Highest ceiling** | `2 × Recommended` (stops a mistyped amount) | $6.00 |
| **Starting offer** | `min(ceiling, max(floor, down50(0.85 × Recommended)))` | $2.50 |
| **Step** | +$0.50 per 60 s round until the ceiling, then the remaining rounds at the ceiling | $2.50 → $3.00 |
| **Rounds before hold** | 6 (unchanged, `RESTAURANTS_DISPATCH.maxAttempts`) | |
| **Shop top-up choices** | +$0.50, +$1, +$2; never more than the goods total (the existing `merchantDeliveryShare` cap) | |
| **Wait before asking the customer** | 2 minutes after the hold, or at once if the shop taps "No" | |
| **Customer raise** | the same stepper, default +$0.50, up to the highest ceiling | $3.50 |

`round50` is nearest $0.50 (`roundFare`). `down50` rounds down to $0.50.

### Effect on prices: read this before approving the build

Switching to Send's formula **raises short trips and lowers long ones** compared with today. The starting offer
narrows the gap.

| Distance | Today (fixed) | Recommended (new ceiling) | Starting offer (new) |
|---|---|---|---|
| 1 km | $1.50 | $2.00 | $1.50 |
| 2 km | $1.50 | $2.50 | $2.00 |
| 2.5 km | $2.00 | $3.00 | $2.50 |
| 5 km | $4.00 | $4.50 | $3.50 |
| 7.5 km | $6.00 | $6.00 | $5.00 |
| 10 km | $8.00 | $7.50 | $6.00 |

Short trips are the most common. A 2 km customer who leaves the default sees $2.50 instead of $1.50. They pay $2.00
if a biker takes the first offer. Bikers on short trips earn more than today, which was the reason for the change
(today's $1.50 short jobs are the ones nobody takes). **Long trips go the other way:** from about 7.5 km up, the
ceiling is below today's fixed fee (10 km: $7.50 against $8.00), so long jobs may wait longer and reach the hold
more often. Watch the hold rate by distance (§7, Measuring it).

## 5. Special cases

| Case | Behaviour |
|---|---|
| **Free-delivery shop** (D-71) | No "pay up to" control. The customer pays $0. The ceiling is the Recommended price and the ladder still runs, so the **shop** keeps the saving. At hold the shop gets the top-up prompt. The customer is never asked to raise. |
| **Biker drops the job before pickup** | The re-dispatch starts at the **last accepted price** (never lower, since the customer was told that amount) and rises to the ceiling plus any top-up. |
| **Biker declines** | The existing 10-minute cooldown stays. Declining to wait for a higher price is a risk to the biker, since someone else may take it. A biker who ignores a round is offered the next, higher round (unchanged). |
| **Shop's own bikers** (Own bikers, D-117) | They are still first in round 1, at the starting offer. The fleet fee is the commission on the accepted price. |
| **Auto-accept early dispatch** (MJ-RM1) | Unchanged. The ladder starts when the search starts. |
| **Items edited, swapped or an Rx declined before a biker accepts** | The goods total re-prices as today. Delivery stays "up to" the ceiling. |
| **Orders placed before launch** | No ceiling is stored, so they keep today's fixed fee to the end. |
| **Scheduled orders** | The ceiling is set at checkout and the ladder runs when dispatch starts. |
| **Cancelling** | Unchanged: "Free to cancel until the biker collects your order". |

## 6. Screens that need a design (handoff first)

Under CLAUDE.md "Pixel parity", nothing below is built from this text. The designer delivers a handoff
(`packages/design/handoff/delivery-ceiling-v1/` with `copy.ts`), and a ledger entry in
`docs/DESIGN-DEVIATIONS.md` records the owner's approval. All copy here is a placeholder.

**Customer app (Order flow v2 Review & place, order screen):**

1. **Review & place, delivery block:** Recommended price, "Pay up to" stepper, the hint "Bikers may take longer"
   below Recommended, and the free-delivery variant with no stepper.
2. **The pay button and totals:** "Place order · up to $68.50 cash" and an "up to" Total row.
3. **Order screen while searching:** "Delivery up to $3.00 · finding the best price".
4. **Order screen once a biker accepts:** the real amount ("Have $68.00 ready") and, if lower, "You saved $0.50".
5. **Raise prompt:** an order-screen card plus a push: "No biker yet. Raise to $3.50?" with Raise / Keep waiting.
6. **Orders tab card and Notifications rows:** "up to" before acceptance, the real amount after.

**Merchant app (merchant-v2):**

7. **No-biker hold:** top-up choices (+$0.50 / +$1 / +$2 / No) beside today's Keep searching / Cancel.
8. **Order card and Money:** the top-up shown as a deduction from the shop's cash ("Biker top-up −$1.00").

**Biker app (rider-v2 / order-flow-v2 RD):**

9. **Offer card:** unchanged layout. It shows the current offer. Confirm with the designer whether a raised offer
   needs a marker.

**Admin:**

10. **Order detail:** recommended, ceiling, accepted price, top-up, and the round each was accepted in.

## 7. Build plan (after the handoff)

### Shared (`packages/shared`)

- New `DELIVERY_CEILING` constants (§4) and pure functions: `recommendedDeliveryUsd(km)`, `ceilingBounds(rec)`,
  `startingOffer(rec, ceiling)`, `offerForRound(round, start, ceiling, topUp)`. Golden tests on every row of the §4
  tables.
- `foodOrderMoney` is unchanged. A top-up rides in the existing `merchantDeliveryShare`: `deliveryFee` = the biker's
  fare (accepted price + top-up), `merchantDeliveryShare` = top-up. The customer then pays `fee − share`, the
  accepted price.
- The mobile estimate (`apps/mobile/src/logic/food-checkout.ts`, `estimateDeliveryFee`) switches to
  `recommendedDeliveryUsd`, so checkout and server agree.

### API (`apps/api`)

- **Schema (Prisma migration):** nullable `Order` columns `deliveryRecommended`, `deliveryCeiling`,
  `deliveryOffer`, `merchantTopUp`, `deliveryAcceptedRound`. Null ceiling = legacy fixed-fee order.
- **Placement** (`merchant/food-order.placing.ts`): validate the requested ceiling against `ceilingBounds`
  server-side (never trust the client), store recommended and ceiling. `agreedFare` = goods + ceiling (the "up to"
  amount) until acceptance.
- **Dispatch** (`merchant/food-dispatch.service.ts`): each round sets `deliveryOffer = offerForRound(...)`. The
  offer push (`f`), the board card, and the commission-cover check (`jobCommission`, today on `order.deliveryFee`)
  all read the current offer.
- **Accept** (`acceptDispatch`): in the same write as assignment, set `deliveryFee` = offer, `merchantDeliveryShare`
  = top-up (or the whole fee on a free-delivery order), `deliveryAcceptedRound`, and recompute `agreedFare` with
  `foodOrderMoney`. The CAS must also pin `deliveryOffer`, so a biker accepting a stale round's price can't win it.
- **Hold:** new merchant endpoint `POST …/orders/:id/top-up` (0.50 / 1 / 2, capped by goods) which resumes the
  search, plus the 2-minute customer prompt and `POST /orders/:id/raise-ceiling` (customer, within bounds,
  resumes search).
- **Drop / re-dispatch** (`dropDispatch`): restart the ladder at the last accepted price (§5).
- **Feature flag:** `DELIVERY_CEILING_ENABLED` in `config/env.ts` (default `false`, the same pattern as
  `RX_ENABLED`). Off = today's behaviour, byte for byte.
- **Docs:** update `docs/PRICING.md` §5 in the build PR.

### Tests that must exist

- The biker is **never** offered more than ceiling + top-up, and the customer **never** owes more than goods +
  ceiling (property test across distances, ceilings and top-ups).
- The customer's door amount after acceptance = goods + accepted price − (free-delivery share).
- A stale-round accept is refused.
- The commission is 10% of the biker's actual fare, including a top-up.
- A ceiling outside the bounds is refused by the API.
- With the flag off, every existing merchant-order test passes unchanged.

### Measuring it (PostHog, inside the free plan)

Three low-volume events, one per order at most: `delivery_ceiling_set` (ceiling ÷ recommended),
`dispatch_accepted` (round index, accepted ÷ ceiling), `delivery_hold_resolved` (top-up / raise / cancel). **Watch
for:** acceptance drifting to the last round (bikers waiting for the rise). If it does, raise the starting offer
from 85% toward 90–95%.

## 8. Decisions taken (owner, 2026-11-05)

- Rising offer capped by the customer's ceiling, not bidding by bikers or picking by the merchant.
- The customer sees the Recommended price at checkout, and the ceiling defaults to it.
- The recommendation uses Send's parcel formula.
- Floor 80% of Recommended. Starting offer 85%, rounded down.
- The control is hidden for free-delivery shops.
- When nobody accepts at the ceiling, the shop is asked for a top-up first, then the customer is asked to raise.

The 2× upper cap, the top-up choices and the 2-minute wait are this plan's defaults. Change them here before the
build if you want different ones.
