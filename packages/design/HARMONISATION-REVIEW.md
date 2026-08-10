# Harmonisation review — Send & Food (Jul 2026)

Reviewed: `explorations/journey/*` (Send customer + rider), `explorations/restaurants/*`
(Food customer / merchant / rider), `ui_kits/mobile` (running prototype), `components/*`.

## Decisions taken this pass

**H-01 · One home.** The Food-customer home is the app home. Send 0·9 renders that exact screen
(`RC.home`), so there is one root for both products: brand header → service tiles → one live-order
card per running job (ride *and* food) → restaurants near you. No reveal sheet, no NEW badge, no
"Send again" / "Order again" rails. Promoted to the DS as **AppHome** + **ServiceTiles**.

**H-02 · One shell.** Chrome was the biggest inconsistency: Food screens had a status bar and the
root tab bar; Send screens had neither (they were bare `Pad` pages). Promoted the scaffold to the DS
as **AppScreen** (+ **StatusBar**, **TabBar**); the restaurants kit's `Screen` now delegates to it,
and every Send screen is wrapped in it. Root screens name their tab (Account, Orders); pushed
screens omit it.

**H-03 · One Orders list.** Send's "Trip history" (A·2) is gone — it now shows the cross-service
Orders screen, which already lists parcels and food together (D-02b). A vertical never gets its own
history.

**H-04 · Product names in copy.** "Express" is retired in user-visible copy; the parcel product is
**Send**, the food product is **Food** (Restaurants is the category, not the product). Journey-map
notes updated.

## Collapsed in this pass (items 1–4)

**H-05 · One tracker.** The DS `Stepper` now takes either the event API (`events` + `currentStatus` +
`view` — Send) or the plain API (`steps`/`step`/`times`/`failAt` — Food, via `RESTAURANT_STEPS`),
including the failed-step treatment. The restaurants kit's `RTracker` delegates to it, so both
journeys render the same timeline geometry, tokens and type.

**H-06 · One header.** `AppBar` promoted to the DS; the restaurants kit's `AppBar` and the support
kit's `Top` both delegate — one header anatomy on pushed screens across both journeys.

**H-07 · One money.** `Money` promoted to the DS (tabular numerals, leading `$`, one weight
vocabulary). The restaurants kit delegates; the Send offer card, counter-offer prices and order
history render through it instead of inline `$` strings. Prices inside sentences stay sentences.

**H-08 · One full-screen state language.** `SystemState` promoted to the DS with a `mark` slot for the
dove; the support kit delegates. Rule: **SystemState** for blocking full-screen states (permissions,
offline, suspended, force-update, hard error), **EmptyState** for an empty list inside an otherwise
working screen.

## Known inconsistencies still open

1. ~~Two trackers~~ — collapsed (H-05).
2. ~~Two empty/error languages~~ — collapsed (H-08). Remaining: audit which Food screens should
   switch from `EmptyState` to `SystemState` under the new rule.
3. ~~Money rendering~~ — collapsed (H-07).
4. ~~Headers~~ — collapsed (H-06).
5. **Address row.** The Send composer's two-row Pickup/Drop-off block and the Food list's
   "DELIVER TO" header are unrelated components doing the same job.
6. **Rider apps.** Send-rider and Food-rider screens were built separately; job cards, code capture
   and earnings/wallet rows should be audited for the same treatment (not reviewed in depth here).
