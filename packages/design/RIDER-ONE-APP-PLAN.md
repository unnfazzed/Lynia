# One rider app — Send + Food on one interface (proposal, Jul 2026)

Today the rider side is two designs: **Send-rider** (auction: rider offers or counters, cash is the
fare, "Earnings" is a record) and **Food-rider** (auto-dispatch: accept a pushed offer, may pay the
merchant, commission wallet, return leg). They must become one app that receives both.

## The model

**One job object, two acquisition modes.** A job is a job; only *how it reaches the rider* differs.

| | Parcel (Send) | Food |
|---|---|---|
| How it arrives | broadcast → rider **bids** (offer / counter) | **offered** to one rider, timer, accept/decline |
| Card action | "Make an offer" | "Accept · 0:18" |
| Money at the door | collects the fare | may collect the food money (then returns it) |

**1 · One board.** A single list of jobs. Offered (food) jobs pin to the top while their timer runs —
they expire, bids don't. Card anatomy is identical: type icon (parcel / food), pickup → drop-off,
distance, money line, one action. Nothing about the app's shape changes when a vertical ships.

**2 · One active job.** One job screen for both, driven by a per-type step list on the shared
`Stepper`: parcel = sender → verify items → drop-off → delivery code; food = restaurant → (pay the
merchant, only for upfront kitchens) → collect → customer → delivery code → return the cash.
Exception screens (wrong code, unreachable, dropped job) are written once and reused.

**3 · One money surface.** A single **Money** tab: balance + commission, "cash you're holding", then
earnings history filterable by Parcel / Food. Not two screens with two mental models.

**4 · One notification language.** Type icon + one line ("Parcel · Eastgate → Avenues · $3.00",
"Food · Sadza Republic → Belgravia · $2.40"). Offered food jobs use the looping alarm because they
expire; parcel broadcasts use a normal ping.

**5 · One gate set.** Reason-keyed refusals when going online: out of area, cooldown, account closed,
verification locked, top up. One rule set, one screen template.

**6 · One vocabulary.** *Job* = anything a rider carries. *Order* = what the customer placed. *Fare*
= what the rider earns. *Collect* = money taken at a door. *Delivery code* = the hand-off proof, both
verticals, always 6 digits.

## Decisions taken (Jul 2026)

1. **One commission model** — prepaid wallet for both services, same % deducted when a job closes.
   One balance, one go-online gate. "Earnings owed weekly" is retired.
2. **One board, tagged cards** — parcels and food in a single list; each card carries a PARCEL / FOOD
   tag. **No countdowns**: a job that's taken simply disappears from the list.
3. **One job at a time** — no batching.
4. **No opt-out** — online means online for everything.
5. **One Money tab** — commission balance + cash held + one earnings ledger, filterable by service.
6. **Cash is split** — "yours" vs "owed to a kitchen", always on screen while carrying.
7. **Jobs · Money · Account tab bar**, mirroring the customer app's shell.

Built as mocks in `explorations/journey/rider-one-app.jsx` (gallery section "Rider · one app"):
one board (+ empty, offline, inbox), food-accept vs parcel-name-your-fare, active parcel / active
food on the same tracker, the shared delivery code, Money tab, top-up gate, Account.

## Inconsistencies that need a decision (see questions)

1. **Two commission models.** Send: 15% owed, settled weekly. Food: prepaid wallet, deducted per job.
   One app cannot hold both — one model, one balance, one go-online gate.
2. **Bidding while an offer counts down** — allowed, or does the countdown block the board?
3. **Batching** — can a rider hold a parcel and a food order at once?
4. **Opt-out** — can a rider refuse a whole vertical (food-only / parcels-only)?
5. **Earnings vs Wallet** — merge into one Money tab, or keep Earnings as history inside Wallet?
6. **Cash held** — food cash must go back to the kitchen; parcel cash is the rider's. Does the app
   show a running "cash you owe / cash you've earned" split?
7. **Rider tab bar** — the customer app has Home · Orders · Account. Does the rider get
   Jobs · Money · Account, or stay single-screen with a drawer?
