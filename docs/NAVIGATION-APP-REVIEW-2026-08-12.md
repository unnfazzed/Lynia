# Navigation review — shipped app, customer & rider, screen by screen (2026-08-12)

**Verdict: navigation is NOT fixed.** A four-lane audit of every route in `apps/mobile` (customer
funnel, food journey, parcel journey, rider side — including the subtle states: loading/error
branches, holds, overlays, terminals, deep-link entries) found **3 P0, 8 P1, ~20 P2** navigation
defects. The test baseline is green (`pnpm typecheck` ✅, mobile suite **138 suites / 981 tests**
✅) but navigation itself is essentially untested: not one test asserts a back-stack shape,
`push` vs `replace`, or the existence of an exit affordance on the flagged screens.

Companion docs: design-side plan `docs/plans/2026-08-12-navigation-design-review.md` (mock-side
gaps; merged PR #728). This report is the **app-side** counterpart with a fix plan.

---

## 1. Root causes (five patterns explain nearly every finding)

| # | Root cause | Evidence |
|---|---|---|
| RC-1 | **No hardware-back handling anywhere.** Zero hits for `BackHandler` / `usePreventRemove` / `beforeRemove` / `gestureEnabled` in `apps/mobile`. Every Android back is a raw stack pop — including on screens whose copy says "Don't close the app". | repo-wide grep |
| RC-2 | **`router.replace` misuse at root level.** `replace("/send")` from a tab root consumes the entire `(tabs)` entry (expo-router resolves the divergence at the root stack), killing the tab bar and making hardware back exit the app. Related: `replace` used for drawn "back" controls, leaving stale/wrong entries beneath. | `(tabs)/orders.tsx:212`, `profile/index.tsx:79`, `history/index.tsx:126`, `rider/become.tsx:253`, `order/[id].tsx:1227` |
| RC-3 | **Journey screens live outside the tab groups.** `/send`, `/order/[id]`, `/food/*`, `/rider/job`, `/rider/food-job` are root-stack siblings of `(tabs)` — so no screen in either live journey has a tab bar, including the two rider active-job screens where the mock **draws** it (`rider-one-app.jsx:195,212`). |
| RC-4 | **Push routing has no food branch.** `pushDestination` falls through to `/order/${orderId}` for every customer order kind — a food order's notifications open the **parcel** tracker. | `src/push/push.ts:194` (contrast `(tabs)/orders.tsx:167` which branches correctly) |
| RC-5 | **Non-scrolling `Screen` bodies with CTAs last.** `Screen`'s body is a fixed `View` (`src/ui/index.tsx:115`); several order states stack banner+header+ring+copy+stepper above their only buttons — on 320-class devices the exit/decision CTAs can be clipped with no way to scroll, once under a 60-second server deadline. | `FoodOrderItemApprovalView.tsx:37-61`, `FoodOrderAwaitingAcceptView.tsx:33-50` |

---

## 2. P0 findings

| ID | Screen | Defect | Fix |
|---|---|---|---|
| **P0-1** | `food/order/[orderId]` (all states) | `checkout.tsx:171-172` runs `cart.clear()` then `router.replace(order)` — the stack entry under a **live order** is the just-emptied `/food/cart`. Hardware back from any order state lands on "Your cart is empty" with no route back to the order. | After placing, rewrite the stack so the order screen sits above `/food` (e.g. `router.dismissAll()`/pop to `/food` then push order, or replace with `withAnchor`); regression test asserting the back target. |
| **P0-2** | push → order routing | Food-order notifications ("payment requested", "rider secured", "cancelled") open `/order/:id` — the parcel tracker — because `push.ts:194` has no merchant branch; `app/order/[id].tsx` has no `orderType` guard either. | Branch `pushDestination`/`notificationRowDestination` on `orderType === "merchant"` → `/food/order/:id`; add a defensive redirect in `order/[id].tsx`; unit tests for both. |
| **P0-3** | `food/checkout` placing state | The "Don't close the app. If this fails, nothing is ordered" screen (`checkout-placing.view.tsx`) has zero interactive nodes **and** zero back suppression; the in-flight `placeFoodOrder` (`checkout.tsx:154-178`) has no abort/unmount guard — backing out drops the user on the emptying cart, then the resolved promise yanks the global router forward (or swallows the error into an unmounted tree). | Guard hardware back while `busy` (BackHandler/`usePreventRemove`), and route the post-resolve navigation/error through a mounted-ref; test the unmount race. |

---

## 3. Customer — entry funnel & account (screen by screen)

| Screen | State of navigation | Finding / Fix |
|---|---|---|
| `index` (boot) | Redirect-only splash | **OK** |
| `onboarding` | Skip + Next; back exits app (first-run root) | **OK** |
| `phone` (login) | No back — correct root; back exits app | **OK** |
| `verify` (OTP) | Drawn ghost **Back** → pops to `/phone` to fix the number (pushed entry) | **OK** — the wrong-number escape exists |
| `role` | No drawn back (matches mock). Hardware back pops to **`/phone` (login) while signed in** — `/phone` is never cleared from the stack bottom (`verify.tsx:104`, `role.tsx:39`, `permissions.tsx:52` are all `replace`; only phone→verify pushes). | **P2** — clear the funnel stack (e.g. `router.replace` from `/phone` into `/verify`, or dismiss-to-root before `/role`); test the stack shape. Affects `role`, `permissions`, and first-session `/home` alike. |
| `permissions` | "Not now" skips both steps; same `/phone` residue | **P2** (same fix) |
| `profile/setup` | **No exit of any kind**: no back, no skip; Continue hard-gated on a ≥4-char National ID (`setup.tsx:82,152`); `boot-route.ts:21` re-pins the user here every launch; hardware back quits the app or drops to login. | **P1** — needs an escape (sign-out at minimum, or "do this later" if product allows); the ID hard-gate is a product decision to surface to the owner. Test: an exit affordance exists. |
| `(tabs)` home/orders/account | Tab bar on all three; account rows all `push` | **OK** (see §5 for orders' empty-state CTA) |
| `profile/index` | Live AppBar chevron | **OK** — but "Send a parcel" uses `replace` (P2, §5) |
| `settings` (+ delete account) | Live chevron (app is *more* generous than the mock's `onBack={false}`); both delete steps have escapes; tested | **OK** — divergence in user's favour; itemise in the deviation write-ups like Notifications already is |
| `help`, `notifications`, `history` | Live chevrons on all states incl. loading/error | **OK** |
| `wallet/top-up` | Rider-only (no customer entry point). Release build fine; test-build simulator `amount`/`wait` steps draw no exit (HW back works) | **P3** (test builds only) |
| `force-update` | Intentional hard trap — the exemplar. But with `STORE_URL` unset it renders **zero** affordances | **P3** — always render the store link or explanatory fallback |
| Send **on-hold wall** (`SendAccountOnHoldView`) | No top bar, no tab bar, no exit; with no active order and a `replace("/send")` entry, hardware back **exits the app** | **P1** — covered by the RC-2 fix + give the wall a drawn exit ("Back home"); test: exit exists when `activeOrder` is null |

---

## 4. Customer — food journey (screen by screen)

| Screen / state | State of navigation | Finding / Fix |
|---|---|---|
| `food` list | Back chevron, search, rows | **OK** |
| `food` list loading | Whole screen replaced by skeleton — chevron disappears | **P3** — keep the header row during load (menu's error branch already does) |
| `food` list error | AppBar back + Retry — but the banner's "Retry" label is **unwired** and the "09:12" timestamps are hardcoded mock copy | **P2** — wire `onAction`, compute the timestamp |
| `food/search` | No drawn dismissal at all (autoFocus keyboard, pushed route) — inherited from the mock | **P2** — app-side: none (parity); **design-side**: upstream request (already in the design plan) |
| `food/[id]` menu | Cover back button; cart bar | **OK** — inert search glyph on the cover (P3) |
| `food/[id]` **loading** | Zero affordances (error branch two lines below has AppBar+back) | **P2** — mount the AppBar in the loading branch too |
| `closed_interrupt` overlay | Three dismissals drawn, but it's an absolutely-positioned View, **not a Modal** — hardware back pops the whole menu instead of the overlay; "See places still open" pushes a duplicate `/food` | **P2** — convert to `Modal` with `onRequestClose`; use `pushOnce`/back for the list |
| `food/cart` | AppBar back; note/qty sheets are proper Modals | **OK** — "Add more items" pushes a duplicate menu (P3, use `back()`) |
| cart **price-changed** | Mock draws Accept-new-total / Remove-item footer; app auto-applies the new price with only "Got it" | **P2** — implement the accept/reject decision (mock-aligned) |
| `food/checkout` | AppBar back; empty-cart guard; AddressConfirmSheet cancellable | **OK** |
| checkout **placing** | See **P0-3** | |
| `food/order` not-found | Retry-only dead end (bad/stale deep-link id loops forever) | **P2** — add "Back to restaurants" |
| `await_accept` / `confirm_call` | Free-cancel ghost **is** drawn (app more generous than mock) — but it's the last child of a **non-scrolling** screen (RC-5) | **P2** — pin cancel in the footer slot or make body scroll |
| `pay_now` / `pay_manual` | The lane's **only** drawn back — and it ejects the user from a live unpaid order onto the emptied cart (`router.back()` at `[orderId].tsx:526`) | **P1** — back should return to the order overview state (`forcePayScreen=false`), not pop the route |
| `pay_confirmed` | Money moved, no help/SOS (mock draws SafetyRow) | **P2** — add `GetHelpControl` |
| `pay_open`, `pay_wait`, `pay_failed` | Cancel/retry paths exist | **OK** (P3 chrome divergences) |
| `item_removed` (60s deadline) | Both CTAs render **below** a per-item price list in a non-scrolling body — clipped on small screens, then auto-cancel | **P1** — pinned footer CTAs (that is exactly the mock's layout) |
| `track_prep` (preparing) | **Zero interactive nodes** for the whole prep window — no help, no SOS (mock parity, but neighbours carry SafetyRow) | **P2** — add help/SOS row |
| `ready_for_pickup` / no-rider hold | **Indefinite** hold state with zero interactive nodes ("nothing further happens until a rider is found") | **P1** — add help + (product call) customer cancel |
| `rider_dropped` | Unbounded re-search, zero controls | **P2** — same treatment |
| live tracker (`track_secured/way/handoff`) | Help + SOS + cancel drawn; offline degrade correct | **OK** |
| `cancel_sheet` | Implemented as an inline card at the **bottom of a five-card scroll**; mock is a modal sheet with a required reason picker | **P2** — mock-aligned modal + reason capture |
| `handoff_wait` / `handoff_code` | Help/SOS remain; cancel correctly suppressed after cash confirm | **OK** |
| `handoff_dispute` (frozen) | No pinned "Call support now" (mock draws one) | **P2** |
| `delivered_rate` | **No skip/home until the user rates** — the exit CTA only renders on `completed`, which the rating itself triggers; hardware back → emptied cart (P0-1) | **P1** — always render an exit on `delivered`; test it |
| terminals (`failed_noshow`, `rejected`, `refunded`, `cancelled`, `no_rider`) | Every one has help and/or a forward route | **OK** (P3s: retry path duplicates stack) |
| safety-net branch | Zero affordances if ever reached | **P3** |

---

## 5. Customer — parcel journey (screen by screen)

| Screen / state | State of navigation | Finding / Fix |
|---|---|---|
| `(tabs)/home` | Full affordances; live-order cards route correctly per service | **P2** — the search bar says "Search food, or send a parcel" and the `DELIVER TO ⌄` row reads as an address picker, but **both** open the parcel composer; food search is unreachable from them |
| `(tabs)/orders` empty state | "Send a parcel" = `router.replace("/send")` → **replaces the whole tab shell**: tab bar gone, hardware back exits the app | **P1** — change to `push` (with the sibling call sites `profile/index.tsx:79`, `history/index.tsx:126`, same class lower blast radius: **P2**). One-line fixes + a stack-shape test each |
| `send` composer (all states) | **No drawn back/home** — only the Account avatar (which *pushes a second tab shell*) and the conditional rider/active-order pills. Correct to the mock (where this screen is home-root); wrong for the shipped tree (pushed sibling). Hardware-back target varies by entry (§5.1 table in audit). | **P1** — app fix: normalize all entries to `push` (above) so hardware back is always sane; **design decision needed** for a drawn back/close (not drawn in mock ⇒ needs an upstream request or D-entry — flagged to owner, do not silently add) |
| composer sheets (address search, pin confirm, disclaimer) | Pin-confirm and disclaimer are real Modals with `onRequestClose` + drawn escapes; inline address search can't trap | **OK** (P3 divergences vs mock's full-screen search) |
| post-broadcast | `submit()` **pushes** the order over a still-armed composer with a rotated nonce; no client/server one-live-order guard → backing out can broadcast a **second concurrent auction** (the re-broadcast path at `order/[id].tsx:677-686` guards exactly this; the plain path doesn't) | **P2** — disable Broadcast while an active order exists (client) and/or reset the composer after successful submit; server-side one-live-order check worth an issue |
| `order/[id]` chrome (all states) | No top back/AppBar; single "Back home" ghost at the **bottom** of the scroll, using `replace` — which leaves the armed composer beneath (back after it resurrects the composer → feeds the double-broadcast risk) | **P2** — "Back home" should clear the journey stack (dismiss-to-root), and a top-of-screen home affordance is worth a design request |
| loading state | Bare skeleton; on cold push deep link the only exit is app-exit | **P3** — add "Back home" to the skeleton frame |
| `requested` | Contentless: no cancel, no help (not in the help gate or cancellable set) | **P3** — include `requested` in both |
| `auction_finding` | Cancel + help drawn, honest empty copy | **OK** |
| `auction_live` | Cancel **is** drawn (mock omits it — mock is the outlier); sort chips, counter Accept/Decline, select-race reconcile all correct + tested | **OK** — record the mock divergence upstream (design plan §2.2-B) |
| `no_riders`, `auction_expired` | Honest variants, one-tap re-broadcast; no mock "Back"/"Edit order" ghosts | **P3** |
| `track_code` | Re-issue code in-card; C7 restore recovery tested; confirm-style cancel | **OK** |
| `track_active` / `track_paused` / `track_dark` | Cancel **is** drawn with post-pickup warning (honours "cancel any time" — mock omits; record upstream); call row, SOS, help, Google-Maps row | **OK** |
| `rider_cancelled` → re-broadcast | Correct `replace` chain (dead order not back-reachable), reassurance card, tested | **OK** |
| `cancel` / `cancelled` / `undelivered` | Confirm card with reason; terminals have re-send **and** Back home; phone still revealed on undelivered | **OK** |
| `delivered_rate` / `completed` | Undo window, durable pending-rating, unmount-flush — solid. But `completed`/`delivered` draw **no "Send another parcel"** (mock draws it) and phone masking happens silently on the parcel branch (food branch has the privacy line) | **P3** ×2 |
| SOS / get-help / report | In-place modal sheets with triple escapes; SOS only while active | **OK** |

---

## 6. Rider (screen by screen)

| Screen / state | State of navigation | Finding / Fix |
|---|---|---|
| board (happy path) | Header + bell, online pill, tab bar, active-job banner, offer compose w/ Skip | **OK** |
| board (every non-happy state) | Renders a **different header** (green BrandHeader + profile action the mock says doesn't belong here) | **P3** — unify on the white header |
| board gates (KYC states, no-GPS, cooldown, out-of-area, suspended) | All have exits (retry/support/tab bar/Back-to-customer) | **OK** |
| top-up gate | "Go to Money", gate-clearing refresh, tab bar | **OK** — placement diverges from mock (`RJM.gate_topup` is a Money-tab screen); P3, record upstream |
| "Back to customer" | Exists **only on the board**; not on Money/Account. Confirm copy promises "until you come back" but `/home` draws **no rider affordance** — the only return is Account → "Rider dashboard"; a board comment still references a removed `/home` chip | **P2** — add the switch row to rider Account (needs design sign-off: not drawn in RJM mock — same APP-AHEAD ledger item as the design plan §2.2-A) and restore a return affordance on `/home` (send.tsx already has its rider pill) |
| food-offer auto-push | Socket event does a raw `router.push("/rider/food-offer")`: no `pushOnce` dedupe, no focus gate — repeated events stack duplicates, and an offer can be pushed **over a live job screen** | **P2** — `pushOnce` + suppress while an active job route is focused |
| `food-offer` | Accept/Not-this-one + AppBar back. But back (drawn or hardware) leaves the offer **un-declined** while "Not this one" declines it — visually identical exits, different server effects | **P2** — decline-on-back or make the difference explicit |
| `offer_sent` | Honest "stays live until the window closes"; no withdraw control **and no server endpoint** to withdraw | **P3** app / product+design question — record upstream |
| `rider/job` (active parcel) | Rich in-job affordances: cancel pre-pickup, undeliverable post-pickup, checklist escape, SOS, help, leave-with-confirm. But: **no tab bar** (mock draws Jobs tab bar on `active_parcel`) and no top AppBar — only a bottom-of-scroll ghost Back; hardware back **bypasses** the LeaveJobButton confirm (RC-1) and on cold push entry exits the app | **P2** ×2 — adopt the mock's tab bar (APP-DIVERGENCE, mock-aligned) + intercept hardware back with the same confirm |
| `rider/food-job` staged states | Pay/pickup/handshake/OTP/drop/blocked-cancel/unreachable/handback all have drawn paths | **OK** |
| `rider/food-job` **nav legs** (to restaurant / to customer) | Full-bleed map with **no exit, no help, no cancel** — only SOS overlay + the arrival CTA; to reach "Drop this job"/"Get help" the rider must falsely claim arrival. The two longest legs of the journey | **P2** — persistent minimal chrome (help + leave) on nav legs |
| `rider/food-job` terminal | No durable terminal marker (self-documented) — a kill can lose the return-cash leg on relaunch | **P3** |
| Money tab | Top up, filters, pull-refresh | **OK** — no link to the live job it already queries (P3); no role switch (P2 above) |
| Account tab | Five rows + identity card | **OK** — identity card opens the **customer** `/profile` which offers "Send a parcel" (replace!) and "Rider dashboard" (pushes a **second** rider tabs instance) — **P3** role-confusion vector |
| `rider/become` (KYC) | Persistent AppBar across all sub-states; drafts + photo resume tested; upload abandonable | **P2** ×2 — the drawn back is `replace("/rider")` (a customer who came from Account is dumped on the rider board; hardware back and chevron land in different places — make it `router.back()`); post-submit terminal has no forward CTA |
| `rider/documents` | AppBar pops correctly | **P3** ×2 — `!rider` state has no CTA; "View verification status" replaces instead of pushing |
| `.view.tsx` files under `rider/(tabs)/` | Registered as (unreachable) routes — no default export, nothing links | **P3** latent — move them out of `app/` or add route-ignore config |

---

## 7. Fix plan — sequenced PRs

Ordering: user-harm first; each PR carries its own regression tests (the current suite has zero
navigation assertions — that's finding **P1-tests**).

1. **PR-1 · Food lane P0s** — P0-1 stack rewrite after placing, P0-2 push routing food branch +
   `order/[id]` orderType guard, P0-3 placing back-guard + unmount-safe mutation. Tests: back-target
   assertion from a live order, `pushDestination` merchant cases, placing unmount race.
2. **PR-2 · replace→push hygiene (parcel + shared)** — `orders.tsx:212`, `profile/index.tsx:79`,
   `history/index.tsx:126`; `order/[id]` "Back home" clears the journey stack; funnel `/phone`
   residue; `become.tsx` back → `router.back()`. Tests: stack-shape per call site.
3. **PR-3 · Dead-end exits** — `profile/setup` escape (+ owner question on the ID gate), on-hold
   wall exit, food `delivered_rate` exit, `ready_for_pickup`/`rider_dropped`/`track_prep`
   help+exit, order not-found escape, `pay_now` back retarget, `item_removed`/`await_accept`
   pinned-footer CTAs (RC-5). Tests: "an exit exists" per state.
4. **PR-4 · Rider navigation** — tab bar on `rider/job` + `rider/food-job` (mock-aligned),
   hardware-back = LeaveJobButton confirm, nav-leg minimal chrome, food-offer `pushOnce` + focus
   gate + decline-on-back, board header unification, become post-submit CTA. Tests: back-confirm
   interception, offer dedupe.
5. **PR-5 · Small fixes & polish (P2/P3 batch)** — closed_interrupt → Modal, menu-loading AppBar,
   list-error banner wiring, cart price-change decision UI, cancel-sheet modal + reason, dispute
   pinned support, home search-bar/deliver-to targets, `requested` gates, phone-masking copy,
   duplicate-stack pushes, `.view.tsx` route hygiene.
6. **Owner decisions needed (do NOT ship silently)** — drawn back/home on the send composer
   (mock draws none: upstream request or D-entry); role-switch rows on rider Account & customer
   home (same APP-AHEAD ledger item as design plan §2.2-A); one-live-order server guard;
   `profile/setup` ID hard-gate; offer-withdraw endpoint.

Per the standing policy each PR merges on green; items in (6) wait for explicit owner approval.

---

## 8. Execution log & the PR-3 parity split (added 2026-08-12, Opus 4.8 execution)

Fixes are shipping PR-by-PR, each with regression tests, merge-on-green:

- **PR-1 (#733, merged)** — the three food-lane P0s (NAV-P0-1/2/3).
- **PR-2 (#737, merged)** — `replace→push` hygiene (NAV-P1-1, NAV-P2-1, NAV-P2-2).
- **PR-3 (this PR)** — the **mock-aligned** subset of the dead-end fixes only: `pay_now` back
  un-forces the sub-screen instead of ejecting the order (NAV-P1-2); `item_removed` decision
  buttons pinned in the footer as the mock draws them (NAV-P1-3).

**Why PR-3 is a subset — a parity boundary the review surfaced.** The remaining "dead-end exit"
items divide by whether the *design mock* already draws the affordance:

- **Mock-aligned (safe to ship, APP-DIVERGENCE)** — the mock draws it, the app mis-implements it.
  Shipped in PR-3 above. `await_accept`'s cancel is borderline (the mock draws *no* cancel there;
  the app added one and it can fall below the fold) — deferred with the (B) items so we don't
  entrench an app-only control without a decision.
- **(B) Requires adding an affordance the mock does NOT draw** — these are **owner decisions**, per
  §4's `APP-AHEAD`/`DESIGN-GAP` rule (the standing "not drawn ⇒ not rendered" instruction), and are
  **not shipped silently**:
  - **`profile/setup` escape** — a brand-new account is trapped: the only action is a National-ID-
    gated "Continue", and boot re-pins them here every launch. Recommended: add a ghost **"Sign
    out"** (matches `on_hold`/`settings`), and — separately — decide whether the **National ID must
    stay mandatory** at signup (the harder product call).
  - **`send` on-hold wall** — a held customer with no active order has no drawn exit and (via some
    entries) hardware-back quits. Recommended: a **"Back home"** on the wall.
  - **food order not-found** — a stale/bad order id is a Retry-only loop. Recommended: **"Back to
    restaurants"**.
  - **`delivered_rate`** — no skip/home until the customer rates (the exit only renders on
    `completed`, which rating itself triggers). Recommended: always render an exit on `delivered`
    (the mock's Submit is a pinned, deferrable footer).
  - **`track_prep` / `ready_for_pickup` (no-rider hold) / `rider_dropped`** — indefinite/again
    states with zero interactive nodes. Recommended: add **Get help** (+, for the unbounded holds, a
    product call on whether the customer may cancel).

Each (B) item is a one-to-few-line addition; they are batched here for a single yes/no because they
share the same rule (adding un-drawn nav chrome). On approval they ship as PR-3b with tests. The
other standing owner decisions from §7(6) — drawn back on the send composer, role-switch rows, the
one-live-order server guard, the offer-withdraw endpoint — are unchanged and still pending.
