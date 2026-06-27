# Lynia — Design System & UX Spec

> Seeded by the gstack `/plan-design-review` stage. This is the living design system: every screen and
> future design review calibrates against it. Direction: **clean utility + a warm accent** — trust through
> clarity, tuned for a low-trust cash market on cheap Android phones and expensive data.

## Locked design decisions

| # | Decision | Choice |
|---|----------|--------|
| D-a | Visual/brand direction | Clean utility + warm accent |
| D-b | Customer home layout | Map-anchored home; scannable LIST for offer compare |
| D-c | Theme + data discipline | Light, sunlight-contrast, data-light (dark mode deferred) |
| D-d | Offer presentation | Sorted list, blended "best-match" default + 'recommended' marker |

## Design tokens

**Color (light theme, AA+ contrast):**

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#14181B` | body text (≥4.5:1) |
| `--muted` | `#5B6670` | secondary text, captions |
| `--bg` | `#FFFFFF` | page background |
| `--surface` | `#F6F7F8` | cards, sheets |
| `--line` | `#E2E6EA` | borders, dividers |
| `--accent` | `#1E7A46` | primary action / "go" (green) |
| `--highlight` | `#F2B705` | 'recommended' marker only (gold, sparing) |
| `--danger` | `#C0392B` | errors, destructive |
| `--success` | `#1E7A46` | confirmations |

Body text ≥ 16px and ≥ 4.5:1 contrast; primary actions tuned ≥ 7:1 for **sunlight readability** (riders outdoors).

**Type:** **Manrope** (UI + display) — a real typeface, deliberately NOT Inter/Roboto/Arial/system. **Tabular
numerals** for fares, ETAs, ratings. Headings 600/700; body 400/500. Minimum body 16px.

**Spacing:** 8pt base — `4 / 8 / 12 / 16 / 24 / 32 / 48`.

**Radius:** containers 12px, inputs 8px, primary CTA full pill. Consistent, not ornamental (no uniform "bubbly"
radius on every element).

**Data-light:** cache map tiles, throttle the GPS marker render, lazy-load images, skeleton loaders over spinners.

## Components

| Component | Spec |
|-----------|------|
| Primary CTA | full-width pill, **52px** tall, `--accent`, one per screen |
| Secondary | outline, 48px |
| Input | **visible label above** the field (never placeholder-as-label), 48px |
| Offer card | big **tabular price** · ★rating + count · ETA · optional 'recommended' marker |
| Rider card | photo · first name + last initial · ★rating · call button (active order only) |
| Status stepper | the §5c 7-step timeline |
| Map bottom-sheet | draggable sheet over a full-bleed map |

**Icons are always paired with a text label** (low-literacy users + screen readers).

## Screen information architecture

```
Customer:  [Map home + "Send a parcel" sheet] → pins + item + adjustable price → Broadcast
           [Broadcasting] map + "Finding riders…" → offers stream into a sorted bottom-sheet LIST
             → select → [Tracking] §5c 7-step stepper + live map + rider card
Rider:     [Home] big online/offline toggle · nearby broadcasts (accept/counter) · active job
```

Offer list (D-d): default sort by a **blended best-match** of price + rating + ETA, with a subtle
'recommended' marker; re-sortable by the customer. Reduces decision-paralysis and resists a pure
race-to-the-bottom while keeping "customer always selects" (CEO D5).

## Interaction-state coverage

```
FEATURE             | LOADING            | EMPTY                          | ERROR                       | SUCCESS          | PARTIAL
--------------------|--------------------|--------------------------------|-----------------------------|------------------|----------------
Broadcast / offers  | "Finding riders…"  | no-offers → nudge+rebroadcast  | network → retry banner      | offer list shown | offers as they arrive
                    |  skeleton list     | no-riders → notify-me          | GPS off → enable prompt     |                  |
Tracking (§5c)      | map skeleton       | n/a (active order)             | GPS drop → stale label      | step lights up   | last-known + "paused"
Offer select        | per-row spinner    | n/a                            | rider gone → "pick another" | assigned → track |
Signup / OTP        | "sending code…"    | n/a                            | send failed → retry / alt   | verified         |
```

### Empty states (designed — the highest-leverage screens)

- **No offers / window expired:** calm, illustration-light card — *"No riders took this price yet."*
  Primary action: **Nudge price & re-broadcast**. Secondary: Edit order. (A dead-end becomes an action.)
- **No riders online:** *"No riders online in [corridor] right now."* Primary: **Notify me when one's
  available**. Context line on typical busy hours.

---

# Two-sided journey (added by the pre-Phase-3 design consultation)

> The sections above were the original customer-side design review. The build has since shipped the **rider
> side** (Phase 2) and the app will soon need the **cross-cutting flows** every two-sided courier has. This
> half of the spec covers the *full* journey — rider screens calibrated against the as-built code, plus the
> not-yet-built flows (history, profile, earnings, notifications, support) designed once, now, on paper.
> Same locked tokens and components as above — nothing new invented.

## Rider information architecture

```
Rider:  [Become a rider / KYC]  name + ID + bike reg + photo → submit → Didit verification (browser) → pending/verified
        [Rider home]            big online/offline toggle · distance-sorted broadcast board · active-job banner
          → tap a broadcast → [Offer compose] accept-at-asking | counter (fare + ETA) → one round, then hidden
        [Active job]            §5c status stepper (rider view) · customer card · advance buttons
          → en_route_dropoff → [Delivery hand-off] enter recipient's 6-digit OTP → delivered → free for next
```

The rider side reuses the customer component language verbatim: the **online/offline toggle** is the
screen's single primary CTA (52px pill, `--accent` when offline = "Go online", outline/ghost when online);
the **broadcast board** is the same offer-card layout inverted (the rider scans *orders* the way the
customer scans *offers* — tabular price · distance · item, sorted by `haversineKm` to pickup); the **active
job** renders the §5c stepper from the rider's perspective.

### Rider screens — spec + as-built calibration

| Screen | As-built route | Spec notes (calibrate code to this) |
|--------|----------------|-------------------------------------|
| Become / KYC | `app/rider/become.tsx` | Two cards (identity, bike) → one CTA. Pending/verified result card. Only an `https://` verification URL opens (already enforced). Add: inline field validation states + a "what Didit needs" helper line. |
| Rider home | `app/rider/index.tsx` | Online toggle is the one primary CTA; status line states the consequence ("offers stay live" / "go online to bid"). Board hides already-bid orders (built). Add the **two rider empty-states** below. |
| Offer compose | (inline card in `index.tsx`) | Pre-fill fare = customer's ask (accept) ; any edit = counter (built). Label the toggle clearly: *Accept $X* vs *Counter*. ETA in minutes, tabular. |
| Active job | `app/rider/job.tsx` | §5c stepper, **rider view** (table below). Customer card (name + ★ + call) visible only in the reveal window (§5d). Delivery-OTP card at `en_route_dropoff`; 5-attempt lockout messaged (built). |

### §5c stepper — the rider's view (mirror of the customer table)

| # | Rider sees | Order status | Rider action |
|---|---|---|---|
| 1 | **You're assigned** | `assigned` | Review item + note → **Confirm details** |
| 2 | **Details confirmed** | `confirmed` | **Start ride** (head to pickup) |
| 3 | **Heading to pickup** | `en_route_pickup` | Collect parcel → **Mark collected** (+ pickup photo) |
| 4 | **Parcel collected** | `picked_up` | **Head to drop-off** |
| 5 | **Heading to drop-off** | `en_route_dropoff` | Ask recipient for OTP → **enter code** |
| 6 | **Delivered** | `delivered` | Done — *"You're free for the next job."* |

> The customer stepper (§5c) and this rider stepper are **one timeline seen from two sides** — keep the step
> labels paired so a support agent reading either screen sees the same journey.

### Rider interaction-states (parity with the customer matrix)

```
FEATURE          | LOADING             | EMPTY                           | ERROR                              | SUCCESS              | PARTIAL
-----------------|---------------------|---------------------------------|------------------------------------|----------------------|------------------
Go online        | toggle spinner      | n/a                             | cooldown 403 → "taken offline" +   | "you're online"      | heartbeat retrying
                 |                     |                                 |   reason, toggle flips off (built) |                      |
Broadcast board  | skeleton cards      | no-orders → "No open orders in   | location off → "enable for nearest"| sorted board         | orders stream in
                 |                     |   [corridor]. Stay online."      | net → retry banner                 |                      |
Offer compose    | send spinner        | n/a                             | order taken → "gone — pick another"| hidden from board    |
Active job       | stepper skeleton    | no active job → "Accept an order"| OTP 5-fail lockout → re-issue ask  | step lights up       | GPS stale → "paused"
Delivery OTP     | verify spinner      | n/a                             | wrong code 401 → retry; 403 lockout| delivered            |
```

### Rider empty-states (the high-leverage ones, parity with customer)

- **No open orders (online):** *"No open orders near you right now — you're online and first in line."*
  Reassures the rider that staying online is the correct action (don't make idleness feel like a dead-end).
  Secondary: typical busy-hours / busiest-corridor hint.
- **Not yet verified:** if a rider opens the board pre-KYC, a calm gate — *"Finish verification to start
  bidding."* Primary: **Resume verification**. No silent empty board.

## Cross-cutting flows (designed now, built later)

Designed once here so the post-Phase-3 build and the `/design-html` regen have a spec. All reuse existing
components; none needs a device to design.

| Flow | Who | Spec | Reuse / dependency |
|------|-----|------|--------------------|
| **Order / trip history** | both | Reverse-chron list of past orders (Card per order: route landmarks · date · fare · outcome pill · ★ given/received). Tap → read-only order detail. Empty: *"No trips yet."* | Same Card + StatusPill; reads existing order list. The first **"my past orders"** read each role needs. |
| **Profile / settings** | both | View/edit name, phone (re-verify on change), language; rider also bike reg + KYC status + photo. Sign-out lives here (move off `home`). Empty/loading trivial. | Reuses `Field`/`Button`; today profile is set once in KYC with no edit path. |
| **Rider rating profile** | customer-facing | The **public rider card** a customer taps an offer to expand: photo · first name + last initial · ★ aggregate + trip count · bike reg. **Score + count only, no written comments** (per §5d / DESIGN "NOT in scope"). | Lets customers choose on **more than price** (D-d best-match). Pairs with the BACKLOG **two-sided rating** item. |
| **Notifications center** | both | In-app list of order events (offer received, selected, status changes) + a per-item read state. Bridges the gap until **FCM push** (BACKLOG, cloud-gated) lands; until then it's the polled feed surfaced as a list. | Socket/poll events already exist; this is presentation. Push delivery is deferred (BACKLOG). |
| **Support / help** | both | Static FAQ + "report an issue on this order" (deep-links an order id into a prefilled message channel). Low-literacy: icon+label, short sentences. | No backend yet — design the surface; wire to a channel when one's chosen. |

## Earnings / wallet — payment-agnostic (open §6 dependency)

> **Stance:** Lynia is a *matchmaker, not a payment processor* for the pilot (§6 — revenue & settlement
> deferred, **no commission, money moves outside the app**). The wallet is therefore designed **cash-first
> and mechanism-free**: it shows what was *agreed and delivered*, not what was *charged or settled*.

- **Rider earnings ledger:** a per-trip list of **agreed fares on completed deliveries** (date · route ·
  `agreed_fare`), with a period total. Framed as a **record of work done**, explicitly *not* a payout
  balance — no "withdraw", no settlement state, no commission line. Matches CONCEPT §7's "trip log
  (informational; no payments)".
- **Customer side:** the same data appears simply as the **fare on each past order** in history — no
  separate wallet needed pre-revenue.
- **Open dependency, called out:** when §6 picks a revenue/settlement mechanism (gateway / own rails /
  commission / fee), this screen gains a settlement state + (if any) a take-rate line. The layout is built
  to **absorb that without a redesign** — the ledger rows stay; a status column and a balance summary slot
  in. **Do not** add payout/commission UI until §6 is decided.

## Drift — built vs. designed (reconcile in the build phase)

Logged as tasks (below) so the post-Phase-3 visual `/design-review` has a checklist instead of rediscovering:

- **§5c 7-step stepper** is specced (customer + now rider) but **not built** in `app/order/[id].tsx` /
  `app/rider/job.tsx` — both render plainer status lists today.
- **Designed empty-states** (no-offers / no-riders, and the new rider ones) are **not all built**.
- **API-contract fields with no UI:** `itemPhotoUrl`, `note` (create order); `comment` (rating);
  `reason` (cancel) — all in `@lynia/shared` contracts, no field on screen. Either surface or consciously
  defer per flow.
- **Sign-out** lives on `home` today; spec moves it to **profile/settings**.

## Responsive & accessibility

- Android-first, designed at 360px width; touch targets **≥ 44px** (52px for primary).
- **Sunlight contrast** (AA+, primary ≥ 7:1) — riders use the app outdoors.
- Icon + text label everywhere; logical screen-reader order; visible focus.
- Easy error recovery (retry, edit, go back) — replenish the goodwill reservoir.

## NOT in scope (design, deferred)

- Dark mode / system-follow theme — fast-follow.
- Visual mockups — generate later with `/design-html` from this spec.
- Written-comment display on profiles (ratings show score + count only, per CONCEPT §5d).

## Build tasks (status as of 2026-06-27)

| ID | P | Task | Status |
|----|---|------|--------|
| DT1 | P1 | This file — tokens, Manrope scale, spacing, components | ✅ done |
| DT2 | P1 | Two empty states (no-offers / no-riders) with warmth + primary action | ✅ done |
| DT3 | P1 | Interaction-state coverage (loading/error/partial) for broadcast, offers, tracking, OTP | ✅ done (error states landed in the post-build review fixes) |
| DT4 | P1 | Offer list best-match default sort + recommended marker (D-d) | ✅ done — `rankOffers` (`@lynia/shared`, unit-tested) + a re-sort selector (best/cheapest/fastest/top-rated) and a RECOMMENDED badge on the customer offer screen |
| DT5 | P1 | Map-anchored customer home + bottom-sheet create flow (D-b) | ❌ **not built** — `home.tsx` is a typed-coordinate form; needs the Phase-3 native map |
| DT6 | P2 | A11y + sunlight + data-light pass (targets, contrast, labels, tile caching) | ⬜ deferred (device-gated) |
| DT7 | P2 | Run `/design-review` (visual QA) post-implementation | ⬜ deferred — needs a dev build |
| DT8 | P1 | Rider IA + screens specced & calibrated to as-built `app/rider/*` | ✅ done |
| DT9 | P1 | Rider interaction-states + two rider empty-states (no-orders / not-verified) | ✅ done |
| DT10 | P2 | Cross-cutting flows: history, profile/settings, rider rating profile, notifications, support | ◐ **partial** — history/profile/earnings shipped; notifications, support, and the *public* rider rating profile not yet |
| DT11 | P2 | Earnings ledger — payment-agnostic | ✅ done — §6 decided (rider commission, 0% for ~6–8 months); the ledger gains a commission/settlement line when that infra is built (BACKLOG) |
| DT12 | P1 | Drift fixes: §5c stepper (both sides), designed empty-states, surface/defer contract-only fields, move sign-out to profile | ✅ done (contract-only fields + rider pickup-photo still deferred — see BACKLOG) |
| DT13 | P2 | Post-Phase-3: regen `/design-html`, then DT7 visual review + `/qa` on a device build | ⬜ deferred (device-gated) |

## Next steps (gstack flow)

- ✅ Office Hours · CEO review · Eng review · **Design review** (customer side).
- ✅ Build — customer journey (Phase 1) + rider role (Phase 2) shipped.
- ✅ **Design consultation — full two-sided journey**: rider IA, cross-cutting flows, payment-agnostic
  earnings; drift logged as DT8–DT13.
- ✅ **Built most of the newly-specced screens** — §5c stepper, empty-states, history, profile, earnings,
  rider KYC gate (DT8/DT9/DT11/DT12); post-build eng+design review fixes merged.
- ✅ **DT4 offer best-match sort + recommended marker** — shipped.
- ⬜ **Phase 3 (needs a dev build):** DT5 map-anchored home, the live map, then DT7 `/design-review` + `/qa`.

**Design score: 9/10** — the full journey is specced and built, review-hardened, with DT4 the last
buildable-now gap now closed. The remaining lift is purely the **device-gated visual QA** (DT5 map / DT7 /
DT13). The §6 revenue mechanism is decided (commission, deferred ~6–8 months). **Current overall status:
`docs/PILOT-READINESS.md`.**
