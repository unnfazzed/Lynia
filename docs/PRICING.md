# Lynia — Pricing & offer ranking

Lynia is a **matchmaker, not a price-setter**: on a parcel the customer names the price, riders accept or
counter, and the customer always chooses. Two pure, shared modules shape that negotiation without ever
taking control of it:

- **`suggestFare` / `quoteFare`** ([`packages/shared/src/pricing.ts`](../packages/shared/src/pricing.ts)) —
  the *anchor*: a fair starting price we show the customer.
- **`rankOffers`** ([`packages/shared/src/offer-ranking.ts`](../packages/shared/src/offer-ranking.ts)) —
  the *best-match sort*: how the returned offers are ordered so the customer isn't staring at an
  unsorted list.

Both live in `@lynia/shared` and are **pure and framework-free**, so the API and the mobile client run
the exact same math — the customer's live preview and the number stored on the order can never drift.
This doc is the reference for both; see [ARCHITECTURE §6](./ARCHITECTURE.md#6-the-offer-loop-core-sequence)
for how they sit inside the offer loop. Restaurant, shop and pharmacy orders do not negotiate: their
delivery fee is fixed by distance ([§5](#5-merchant-orders-delivery-fee-and-preferred-riders)).

---

## 1. The fare vocabulary

Four distinct fares travel with an order. Keeping them separate is what lets the negotiation stay
honest — the anchor is advisory, the customer's number is the actual ask, and the agreed number is
what gets paid.

```mermaid
graph LR
    subgraph anchor["Advisory (computed)"]
        s["<b>suggestedFare</b><br/>distance-based anchor<br/>quoteFare(pickup, dropoff)"]
    end
    subgraph ask["Customer's ask"]
        p["<b>proposedFare</b><br/>the price the customer names<br/>(may start from suggested)"]
    end
    subgraph bid["Rider's response"]
        o["<b>offeredFare</b><br/>accept = proposed,<br/>counter = rider's number"]
    end
    subgraph deal["The deal"]
        a["<b>agreedFare</b><br/>the selected offer's fare<br/>set at assignment"]
    end

    s -.->|"autofilled into the field (D-31)"| p
    p -->|broadcast| o
    o -->|customer selects| a

    classDef c fill:#bfdbfe,stroke:#1d4ed8,color:#111;
    class s,p,o,a c;
```

| Field | Where set | Meaning |
|---|---|---|
| `suggestedFare` | `OrdersService.create` via `quoteFare` | Distance-based anchor stored on the order; shown to the customer as guidance. Never binding. |
| `proposedFare` | Customer input at create (`CreateOrderRequest.proposedFare`) | The price the customer actually names and broadcasts. Can be the suggested value, or anything positive. |
| `offeredFare` | Rider at `POST /orders/:id/offers` | `accept` → equals the proposed fare; `counter` → the rider's own number. |
| `agreedFare` | Set by the guarded CAS at selection | Copied from the selected offer's `offeredFare` — the final price. |

The customer is never forced onto the anchor, but since **D-31** (2026-08-17) they do START on it: the
compose screen **autofills** "Your price" with the suggested fare as soon as both pins are set, and
re-writes it whenever a pin move changes the suggestion. The field stays free-form — type any positive
number over it and it stands until the trip itself changes. The `Suggested fare $X · N km` line and the
one-tap **"Use suggested"** button that used to carry the anchor into the field are gone with the same
change (they restated a number the field now shows); what remains above the field is the acceptance-band
hint, `Riders usually accept around $X–$Y` (`apps/mobile/app/send.tsx`,
`src/ui/send/SendPriceQuote.tsx`).

---

## 2. The suggested-fare model

A deliberately simple, transparent **flag-fall + per-km** model. Simplicity is a feature here: the
customer can predict it, and it's trivial to retune from real ride data.

### Formula

```
suggestedFare(distanceKm) = max( minUsd, baseUsd + perKmUsd × distanceKm )   // rounded to 2dp
```

### Pilot constants (`FARE`)

| Constant | Value | Role |
|---|---|---|
| `baseUsd` | `1.50` | Flag-fall — pickup + handling, independent of distance. |
| `perKmUsd` | `0.60` | Distance component. |
| `minUsd` | `1.50` | Hard floor — short hops still cost the rider time. |
| `earthRadiusKm` | `6371` | For the Haversine distance. |

> These are **USD launch values** and are placeholders: tune them on real ride data. Lynia serves all of
> Zimbabwe (`packages/shared/src/service-area.ts`, ledger D-99), and one curve applies everywhere.
> Because they're one `const` in one shared file, retuning is a single-line change that every client
> picks up.

### Distance: great-circle (Haversine)

`quoteFare(pickup, dropoff)` computes straight-line **Haversine** distance between the two lat/lng
points — not routed road distance. That's intentional for the pilot (no routing dependency, no map
API cost on every keystroke); it under-estimates real road distance, which the rider's counter-offer
naturally corrects for. `haversineKm` returns `0` for any non-finite coordinate, so a half-entered
form previews the floor price rather than `NaN`.

### Worked examples

| Distance | `base + perKm × d` | After floor | Suggested |
|---|---|---|---|
| 0 km | 1.50 | max(1.50, 1.50) | **$1.50** |
| 1 km | 2.10 | max(1.50, 2.10) | **$2.10** |
| 3 km | 3.30 | — | **$3.30** |
| 5 km | 4.50 | — | **$4.50** |
| 10 km | 7.50 | — | **$7.50** |

### Where it runs

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer (mobile)
    participant Shared as quoteFare (@lynia/shared)
    participant API as OrdersService
    participant DB as Postgres

    Note over C,Shared: live preview as pins move
    C->>Shared: quoteFare(pickup, dropoff)
    Shared-->>C: { distanceKm, suggestedFare }
    C->>C: autofills "Your price" with the anchor (D-31)

    Note over C,API: on submit
    C->>API: POST /orders { proposedFare, pickup, dropoff }
    API->>Shared: quoteFare(pickup, dropoff)  ← recomputed server-side
    Shared-->>API: { distanceKm, suggestedFare }
    API->>DB: store suggestedFare + distanceKm + proposedFare
```

The server **recomputes** the anchor at create time rather than trusting a client-supplied number, so
the stored `suggestedFare`/`distanceKm` are always authoritative.

---

## 3. Offer ranking (best-match)

Once riders respond, the customer sees a list. Presenting it unsorted invites decision-paralysis and a
pure race-to-the-bottom on price. `rankOffers` orders offers by a **blended score of price + rating +
ETA** and flags the single best one `recommended` — so a cheap-but-slow-and-poorly-rated offer doesn't
automatically win, while the customer still picks whoever they want (design decision **D-d**).

### The blend

```
score = w.price × priceScore + w.rating × ratingScore + w.eta × etaScore     ∈ [0, 1]
```

Each dimension is **min–max normalized across the current batch** to `[0,1]`, with the "better"
direction flipped so higher is always better:

- `priceScore` — lower fare is better
- `etaScore` — lower ETA is better
- `ratingScore` — higher rating is better

### Default weights (`DEFAULT_OFFER_WEIGHTS`)

| Dimension | Weight | Rationale |
|---|---|---|
| `price` | **0.45** | The largest single factor — the customer named the price. |
| `rating` | **0.35** | Trust / quality. |
| `eta` | **0.20** | Speed to pickup. |

The tuning invariant: **`price` (0.45) must stay below `rating + eta` combined (0.55)**, so quality +
speed *together* can outweigh a rock-bottom price. If price ever exceeded the other two combined,
best-match would collapse into "cheapest" and defeat its own purpose.

### The ranking pipeline

```mermaid
graph TD
    in["offers[]<br/>{ offeredFare, ratingAvg, ratingCount, etaMinutes }"]
    ranges["compute batch ranges<br/>fare min/max · eta min/max<br/>rating min/max (rated riders only)"]
    norm["normalize each dim → [0,1]<br/>(neutral 0.5 when a dim is flat)"]
    newrider["new rider (ratingCount=0)<br/>→ ratingScore = 0.5 baseline"]
    blend["blend: 0.45·price + 0.35·rating + 0.2·eta"]
    sort["sort by score desc,<br/>tie-break: fare → rating → eta → index"]
    flag["flag top offer 'recommended'<br/>(only when ≥2 offers)"]

    in --> ranges --> norm --> blend --> sort --> flag
    newrider -.-> blend
```

### Edge cases the code handles deliberately

| Case | Behaviour | Why |
|---|---|---|
| **New rider** (`ratingCount = 0`) | Rating axis = neutral `0.5` (`NEW_RIDER_RATING_SCORE`), not `0` | A brand-new rider shouldn't be punished as if rated badly — but the baseline must **not exceed 0.5**, or an unproven rider would out-score a proven high-rated one. Fare/ETA differentiate them. |
| **Flat dimension** (all offers equal on a dim, e.g. everyone offered the same fare) | That dim scores `0.5` for all → doesn't sway the ranking | `norm` returns `0.5` when `max <= min`. A dimension nobody differs on shouldn't move the result. |
| **Only rated riders define the rating range** | Unrated riders are excluded from `ratingMin/Max` | So one rated rider doesn't collapse the range and distort the rated peers. |
| **Ties on score** | Deterministic tie-break: cheaper → better-rated → sooner → original order | Stable, explainable ordering; the raw-rating tie-break still favours the genuinely higher-rated rider. |
| **Single offer** | Not flagged `recommended` | A lone offer needs no marker. |

### Worked example

Three offers on one order (default weights):

| Offer | fare | rating (count) | eta |
|---|---|---|---|
| A | $3.00 | 4.8 (40) | 15 min |
| B | $2.50 | 4.0 (10) | 25 min |
| C | $2.80 | — (new) | 10 min |

Batch ranges: fare `[2.50, 3.00]`, eta `[10, 25]`, rating (rated only) `[4.0, 4.8]`.

| Offer | priceScore | ratingScore | etaScore | **blended** |
|---|---|---|---|---|
| A | 0.00 | 1.00 | 0.67 | **0.483** |
| B | 1.00 | 0.00 | 0.00 | **0.450** |
| C | 0.40 | 0.50 (new) | 1.00 | **0.555** ⭐ |

**Ranked: C → A → B.** The cheapest offer (B) lands *last*, and a new rider (C) with the fastest ETA
and a mid-range price is recommended — exactly the "don't collapse into cheapest" behaviour the blend
is designed for.

### The ETA the ranking reads

Since D-99 a rider anywhere in the country can bid, and the rider app's ETA is a tapped chip. So the API
keeps the larger of the rider's claimed ETA and a straight-line estimate from the rider's position
(`estimatePickupEtaMinutes`, `PICKUP_ETA` in `packages/shared/src/policy.ts`: 2 min to start plus
25 km/h; called from `apps/api/src/offers/offers.service.ts`). A far-away rider can't rank as "sooner"
than the distance allows.

### Client sort modes

The mobile order screen (`apps/mobile/app/order/[id].tsx`) exposes `rankOffers` as the **"best"** sort
mode; **cheapest / fastest / rating** are plain single-key sorts. Selection itself is unaffected by any
sort — the customer still chooses. Ranking is presentation only; the server never auto-assigns.

---

## 4. Tuning checklist

Everything tunable is a named constant in one of two shared files — no logic changes needed to retune:

- **Fare curve** — `FARE.baseUsd`, `FARE.perKmUsd`, `FARE.minUsd` in `pricing.ts`.
- **Ranking weights** — `DEFAULT_OFFER_WEIGHTS` in `offer-ranking.ts` (keep `price < rating + eta`).
- **New-rider baseline** — `NEW_RIDER_RATING_SCORE` (keep `≤ 0.5`).
- **Distance model** — swap Haversine for routed distance in `quoteFare` if/when a routing provider is
  added; the four fares and the ranking are unaffected.
- **Merchant delivery fee** — `RESTAURANTS_PRICING` in `restaurants-order.ts` (§5).
- **Preferred-rider bonus** — `PREFERRED_OFFER_BONUS` in `offer-ranking.ts` (§5).

Both modules are unit-tested from the API package (`*.spec.ts`), so a retune is a value change plus a
green test run.
</content>

---

## 5. Merchant orders: delivery fee and preferred riders

**Delivery fee.** A restaurant, shop or pharmacy order has no customer-named price. The API sets the
delivery fee at placement with `deliveryFeeForDistance(distanceKm)`
([`packages/shared/src/restaurants-order.ts`](../packages/shared/src/restaurants-order.ts)), using the
Haversine distance from the venue to the drop-off (`apps/api/src/merchant/food-order.service.ts`):

```
deliveryFee(distanceKm) = max( 1.50, round_to_0.50( 0.80 × distanceKm ) )
```

| Constant (`RESTAURANTS_PRICING`) | Value | Role |
|---|---|---|
| `deliveryFeePerKm` | `0.80` | Per-km rate |
| `deliveryFeeRoundingUnit` | `0.50` | Fee is rounded to the nearest $0.50 |
| `deliveryFeeMin` | `1.50` | Floor |
| `minOrderSubtotal` / `smallOrderFee` | `4.00` / `1.00` | Below a $4 subtotal a $1 fee is added; checkout is never blocked |

A venue with free delivery pays the rider's fee out of its own share (`merchantDeliveryShareAtPlacement`,
ledger D-71). The customer then pays $0 delivery and the rider still gets the full fee. Payment is cash.

**Preferred riders (merchant "Book a rider").** When a business books a parcel rider from the merchant
app, it sees offers like a customer does. It ranks them with `MERCHANT_OFFER_WEIGHTS`: the default blend
plus `PREFERRED_OFFER_BONUS = 0.5` for one of the business's own riders
([`offer-ranking.ts`](../packages/shared/src/offer-ranking.ts), used by `apps/merchant/app/lib/booking.ts`).
The bonus is worth more than any one dimension alone and less than fare and ETA together (0.65). So the
business's rider is listed first unless another offer is cheaper **and** sooner. The bonus only reorders
offers. It never changes who may bid, and the business still picks. The customer app never sets it.
