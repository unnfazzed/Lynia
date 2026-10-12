# Merchant Verticals — Design Brief (Claude Design Lab prompt)

**Purpose:** the verbatim brief handed to Claude Design Lab on 2026-07-27 for the complete
merchant + customer + rider journeys (P0 design track, plan §6). Preserved so the
reconciliation pass can diff Design Lab's output against what was actually asked, and so
the brief can be re-run or amended without reconstructing it from chat history.

**Pipeline (plan §3.2):** DIVERGE (Design Lab, this brief) → RECONCILE (every mockup must
resolve to real `packages/design` tokens/components — Design Lab output is an input to the
design system, never a bypass) → FORMALIZE (`/design-consultation` → `/design-html`) →
BUILD (P3/P4, each gated on approved designs).

---

```
You are designing the MERCHANT VERTICALS experience for LyniaGo — an on-demand
delivery platform live in Harare, Zimbabwe. The Express courier product is already
shipped; you are designing the Restaurants vertical that extends it. Your job:
COMPLETE end-to-end user journeys for all three actors (customer, merchant, rider),
every screen, every state, every edge case — top-tier UI/UX, but strictly inside the
existing design system and the engineering constraints below. Where delight conflicts
with a constraint, the constraint wins; find the delight inside it.

════════════════════════════════════════════════
1. DESIGN SYSTEM — LOCKED, DO NOT REINVENT
════════════════════════════════════════════════
Grab-style clean utility. Neutral base, green accent, generous whitespace, zero
decoration that doesn't earn its pixels. Sunlight-legible: these screens are used
outdoors on cheap Android phones and in bright kitchens on cheap tablets.

Typography: Inter 400/600/700 everywhere; Fredoka 600 is wordmark-only.
THE GREEN SPLIT (non-negotiable, this is the system's signature rule):
  - accent      #00B14F  → fills, graphics, map pins ONLY — never text
  - cta         #00812F  → button fills (white label, sunlight-tuned ~4.7:1)
  - ctaPressed  #006B27
  - accentText  #006630  → ANY green text or icon a user reads (~7:1 on white)
  - accentWash  #E9F8EF  → selected/mint wash backgrounds
Neutrals (ink/muted/bg/surface/line), gold (ratings), danger: keep as-is.
Shape: cards radius 16, borderless + soft shadow; inputs radius 12; buttons full
pill (52dp primary / 44dp secondary touch targets). 8pt spacing grid.
Icons: Lucide 2px rounded line set, ALWAYS paired with a text label. Green icons
use accentText; icons on green fills are white.
Every screen designs its loading, empty, error, success, and offline states —
empty states are treated as the highest-leverage screens, with an icon + one
sentence + one action, never a blank list.

════════════════════════════════════════════════
2. SHIPPED EXPRESS UX — ALIGN, DON'T FORK
════════════════════════════════════════════════
The customer app is one Expo app (Android-first) with a customer role and a rider
role. Express ships: a customer-named-price offer loop, a 7-step delivery tracker,
live rider map tracking, a hashed 6-digit DELIVERY CODE the customer reads to the
rider at handoff (this is proof of delivery — it stays in every vertical), and
two-sided ratings. Restaurants must feel like the same product: same tracker
grammar, same code-handoff moment, same rating pattern, same empty-state voice.
The app gains tabs: Express | Restaurants (Pharmacies exists later — do NOT design
it now, but the tab bar must scale to 3 without redesign).

════════════════════════════════════════════════
3. ARCHITECTURE FACTS YOUR DESIGN MUST OBEY
════════════════════════════════════════════════
- Restaurants ships DARK behind a remote-config flag: the tab appears only when the
  server flag flips. Design the moment a user's app gains the tab (first-run
  spotlight? badge? nothing?) — deliberately.
- Payments, two methods, LyniaGo never touches the money:
  CASH: rider fronts float equal to goods value, pays the restaurant at pickup,
  collects goods value + delivery fee from the customer at the door.
  WALLET: customer pays the MERCHANT directly (EcoCash / InnBucks / Omari) AFTER
  the merchant accepts — never before. Rider carries no float. Delivery fee is
  folded into the wallet payment.
- Delivery fee: LyniaGo-set, per-km, rounded to $0.50/$1. USD only.
- Commission is 0% at launch but accrues to a weekly statement the merchant can see.
- Auto-dispatch (no bidding for merchant orders): nearest eligible rider. The
  kitchen must NOT start cooking until the app shows "rider secured". If no rider
  is found within the time cap, the order fails cleanly as NO_RIDER — design that
  moment for both customer (apology + retry/steer) and merchant (never cooked).
- New-customer cash caps: above a threshold, first-time customers are steered to
  WALLET. Design the steering, not a dead-end.
- Order lifecycle (customer-visible grammar): placed → merchant accepted (+ prep
  time) → rider secured → rider at restaurant → picked up → on the way → delivered
  (code handoff) → rate. Exception paths that MUST be designed, not hand-waved:
  merchant rejects (wallet refund pending → refunded, with a stored reference the
  customer can see); customer cancels pre-pickup; NO_RIDER; customer no-show at
  the door (rider waits a timed window, logged call attempts → delivery failed →
  goods returned to restaurant); wallet payment never completed (order expires
  before dispatch — merchant hasn't cooked).
- Merchant surfaces show the customer's phone MASKED (proxied call button, never
  the raw number).

════════════════════════════════════════════════
4. THE THREE JOURNEYS — DESIGN END TO END
════════════════════════════════════════════════
A. CUSTOMER (Expo app, low-end Android, 3G, sunlight):
   Discover tab → restaurant list (open/closed/hours, distance, corridor) →
   menu/catalog (out-of-stock items visible-but-disabled) → cart (price math:
   goods + per-km delivery fee shown honestly) → checkout (CASH vs WALLET choice
   with the cap steering) → wallet payment moment (pay-after-accept: design the
   "merchant accepted, now pay" push + screen + timeout) → live tracking (reuse
   Express tracker grammar + prep-time countdown + "rider secured") → handoff
   (delivery code + cash payment at door on CASH) → rate.
   Edge cases: restaurant closes while browsing; item goes out of stock in cart;
   price changes; order rejected after wallet payment (refund journey); app
   killed/resumed mid-order; offline mid-checkout; NO_RIDER after acceptance.

B. MERCHANT (web dashboard on a cheap Android tablet, Chrome, noisy kitchen —
   this is a NEW Next.js app, phone + OTP login):
   Onboarding/first-login → live order QUEUE (the money screen: a new order must
   be IMPOSSIBLE to miss — looping audio alarm unlocked at login tap, huge visual
   state change, screen wake lock) → accept/reject + set prep time → "rider
   secured" indicator (when to fire the kitchen) → mark ready → PICKUP CONFIRM,
   the second money screen, evidence-bearing by design:
     CASH: "confirm cash received" shows the EXACT amount huge; confirmation is
     an act of acknowledging that number, not tapping OK.
     WALLET: merchant enters txn reference + amount; the expected amount is
     displayed to block short-payment; UI copy enforces "trust only YOUR OWN
     statement, never a customer-shown SMS screen".
   → catalog editor (add/edit/price/out-of-stock toggle) → operating hours →
   weekly commission statement (0% now, accruing).
   Edge cases: CONNECTION LOST banner (tablet wifi drops — unmissable, with
   auto-reconnect state); order arrives while offline; reject-after-wallet-paid
   (refund execution with reference entry); rider no-show at pickup; two orders
   land simultaneously; tablet rebooted mid-shift; end-of-day summary.

C. RIDER (same Expo app, rider role):
   AUTO offer card — 60-90s to act, one-glance decision: tagged CASH or WALLET
   HUGE (CASH means "you will front $X from your pocket"), pickup restaurant,
   dropoff, fee, distance → float check (CASH offers blocked/greyed when the
   goods value exceeds the rider's cash headroom — design the blocked state and
   the "why" explanation) → navigate to restaurant → CASH: pay-merchant moment
   (mirror of the merchant's confirm — both parties acknowledge the same number)
   → pickup confirm → navigate to customer → doorstep: delivery code capture
   (reuse Express) + CASH collection amount shown → delivered → earnings update.
   Edge cases: offer expires mid-read; customer unreachable (structured wait
   timer + logged call attempts + "return to restaurant" flow with its own
   navigation and merchant handback confirm); customer disputes amount at door;
   phone dies/app resume mid-delivery; tap-to-call merchant and MASKED customer.

════════════════════════════════════════════════
5. DELIVERABLES
════════════════════════════════════════════════
1. Journey maps for A, B, C — every step, every decision branch, every exception
   path above, as flows (happy path + edge cases on one map per actor).
2. Screen inventory: every unique screen/modal/banner per actor, named.
3. High-fidelity mockups for the top screens, in system tokens EXACTLY (hex values
   above) — prioritize: merchant order queue (new-order state + connection-lost
   state), merchant pickup-confirm CASH + WALLET, customer checkout + wallet
   pay-after-accept, customer tracking with prep countdown, rider AUTO offer card
   CASH vs WALLET, rider return-to-restaurant flow.
4. For EVERY mockup: default + loading + empty + error + offline states.
5. Interaction notes: what the alarm sounds like/when it stops, what buzzes,
   what persists on lock screen, what survives an app restart.
6. A one-page "design decisions" list: every judgment call you made and why, so
   engineering can challenge them one by one.

Constraints recap: mobile = Expo/React Native components; merchant = responsive
web (tablet-first, must degrade to phone); no Pharmacies; no order batching UI;
no photo/signature proof of delivery (code only); low-end devices, 3G, sunlight.
Design the boring states as carefully as the happy path — in this product the
error states ARE the brand.
```
