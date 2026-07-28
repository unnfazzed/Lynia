# LyniaGo — July 2026 design update · handoff to Claude Code

Third handoff for **unnfazzed/Lynia**. The repo already implements the **Send (parcel) product
from the earlier mockups** — that code is correct and stays. Since then the design moved in three
ways, and this package carries all of them:

1. **A new app home.** The customer root is no longer the map composer. It is a launcher home:
   green brand header + search, service tiles (Send · Food · Pharmacy "Soon" · More), a live-order
   card per running job, an order-again rail, and a photo-led "Restaurants near you" preview.
   The map composer you already built survives intact — it just becomes the **Send destination**
   pushed from the Send tile. Root tab bar: **Home | Orders | Account**; Orders is one list across
   every service.
2. **The rider side was restructured into one app.** Not a reskin — a new IA. One board receives
   parcel *and* food jobs (tagged cards), one active-job screen with per-service steps on the shared
   Stepper, one **Money** tab (prepaid commission wallet for both services — the weekly-15%-settlement
   "Earnings" model is retired), tab bar **Jobs | Money | Account**. Several rider screens you built
   from the old mockups are superseded — the prompt lists them by name.
3. **A Restaurants (food) vertical was added.** Net-new: the customer food flow (browse → cart →
   kitchen confirms → track → doorstep cash handshake → delivery code), ~18 rider food-job screens,
   and a **merchant kitchen tablet — an entirely new surface** (web, tablet-first). The money model
   is deliberate and non-obvious (cash is **collect-and-return**, mobile money is confirmed by the
   kitchen **before** cooking, there are **no payment clocks**) — read `RESTAURANTS-DECISIONS.md`
   before assuming anything Uber-Eats-shaped.

**Tokens and core components are unchanged.** If the diff shows no token deltas, that's expected —
the work is IA + new screens, not a visual refresh.

## The one index to trust

`packages/design/explorations/journey/All Screens Gallery.html` — every current screen for
customer, rider and merchant, in journey order, exceptions included, each tile rendered live from
the design system. **If a screen is in the gallery it is current; if a screen you coded is not in
the gallery, it was retired.** The gallery header in `gallery-map.js` names the retired rider
screens explicitly.

## How to run this handoff

Same flow as before — Claude Code works from the connected repo, not a zip:

```bash
git clone git@github.com:unnfazzed/Lynia.git && cd Lynia
git checkout -b design/2026-07-update
# unzip the design-system download, then:
rsync -a --delete /path/to/unzipped/ packages/design/
git add packages/design && git commit -m "design: 2026-07 update (home, one rider app, restaurants)"
git push -u origin design/2026-07-update
```

Then open Claude Code on that branch and paste **`CLAUDE-CODE-PROMPT.md`** (in this folder).
Exclude `uploads/` and `scraps/` from the rsync; keep the generated `_ds_*` files.

## Suggested PR sequence (don't do it as one PR)

1. **PR 1 — design refresh + new home/IA.** Copy `packages/design/` in; re-root the customer app on
   the launcher home; port `components/home/` primitives to RN; Orders spans services. Small, safe,
   ships alone.
2. **PR 2 — rider one-app restructure.** New tab bar, one board, Money tab, retire the superseded
   screens. Reconcile with the wallet build if you already ran `WALLET-CLAUDE-CODE-PROMPT.md`.
3. **PR 3 — restaurants: customer + rider.** The food flow inside the existing Expo app.
4. **PR 4 — merchant tablet.** New app in the monorepo (`apps/merchant`, web).

Admin-console alignment (the stale 15%-weekly `cash.html` model) rides with PR 2 or 3.

## Docs superseded by this update — don't follow them blindly

- `handoff/CLAUDE-CODE-PROMPT.md` (the 2026-07-04 token/parity refresh) — done; superseded by this.
- `handoff/WALLET-CLAUDE-CODE-PROMPT.md` — the wallet product rules still hold, but the wallet UI
  now lives **inside the rider Money tab** (one balance, both services), not as a standalone screen
  reached from Earnings. Earnings-as-weekly-record is retired.
- `ui_kits/admin/cash.html` — shows the old weekly 15% settlement; live model is prepaid,
  per-delivery, 0%→10%.
- Anything showing the map as the customer root, a rider "Earnings" screen, or a rider float/headroom
  check (`RESTAURANTS-DECISIONS.md` §7 R-10 deleted the float concept).

## Where the design decisions live (all inside `packages/design/`)

- `RESTAURANTS-DECISIONS.md` — the restaurants contract: every number (N-01…N-23), every decision
  (D-01…D-35), and the July revisions (R-01…R-17). **The single most important doc in this update.**
- `RIDER-ONE-APP-PLAN.md` — the one-rider-app model + the seven decisions taken.
- `HOME-2A-MERGE-PLAN.md` — how the new home propagated through the system.
- `RESTAURANTS-UX-REVIEW.md`, `HARMONISATION-REVIEW.md`, `PAYMENTS-TRUST-REVIEW.md` — review trail.
- `HANDOFF.md` — the standing engineering guide (tokens, accent split, safety flows, admin, seams
  C1–C9). Still current except where this update says otherwise.
