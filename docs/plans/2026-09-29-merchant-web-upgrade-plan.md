# Merchant web upgrade: restaurants **and** shops, team logins, simpler UI

**Status:** reviewed by `/plan-ceo-review` (2026-09-29, HOLD SCOPE; record in §11, report at the end) ·
branch `claude/merchant-web-platform-upgrade-oylm53` · product spec: `docs/designs/merchant-web-upgrade.md`
(APPROVED)
**Owner ask (verbatim, 2026-09-29):**

> i want to upgrade the merchant web side. It needs to enable both restaurants snd shops though a user
> can only choose 1 option. They can add multiple users to log into same shop. It needs to be simple for
> informal businesses in Zimbabwe. Learn from how Chowdeck , glovo, gojek, bran, bolt, uber eats,
> doordash does it by crawling their app screenshots on googleplay or app store. i want simple
> straightforward UI. improving restaurant side also to simplify . Shops will be diverse to pharmacies ,
> parts shops , fashion shops, etc .. log in is by mibile number and whatsapp otp. Deploy gstacks CEO
> reviews .

"bran" is read as **Grab** (GrabMerchant), the only major merchant app it plausibly names.

> Where this doc and the code disagree, **the code wins**. Reconcile and flag it.

**Office-hours outcome (2026-09-29, owner-approved)**, design doc `docs/designs/merchant-web-upgrade.md`:

- **Premise 1:** self-serve sign-up **plus an ops go-live switch**, so the switch moves into the first layer.
- **Premise 2:** shops get **Book a rider AND the item catalogue** ("Both now"), with photos required for
  every item, shops included.
- **Premise 3:** two roles, Owner + Staff.
- **Premise 4:** merchant side now; the customer Shops section is the next project.
- **Approach:** B, "Everything, layered". At the design review the owner added **preferred riders**; the
  layers are now L1 front door → L2 Book a rider + shop shell → L3 Your riders → L4 Team → L5 finishing the
  drawn restaurant screens (§5).

---

## 1. Ground truth: what exists today

| Area | Today | Evidence |
|---|---|---|
| Merchant web | `apps/merchant`, a restaurant-only "kitchen tablet": Orders · Menu · Shop · Hours · Statement, plus `/setup`. Every word is kitchen/food. | `app/components/KitchenNav.tsx` |
| Person ↔ shop | **1 : 1.** `merchants.owner_profile_id` is `UNIQUE`. One phone runs one shop, and a shop has exactly one login. | `schema.prisma` `Merchant`, migration `0041` |
| Access check | JWT **role claim** (`role === "merchant"`) on `MerchantGuard` and the kitchen socket. The shop is then looked up by `ownerProfileId` in one shared util. | `merchant.guard.ts`, `merchant-lookup.util.ts`, `tracking.service.ts:260` |
| Onboarding | **None.** `POST /merchant/become` has zero callers. A merchant has only ever been created by curl. It also flips the caller's `Profile.role` to `merchant` **irreversibly**, which silently breaks that person's customer app. | `docs/RCA-MERCHANT-NOT-SET-UP-2026-08-18.md` §2, C-4 |
| Go-live | `Merchant.pilotEnabled` is the gate the customer API filters on. It has **no writer** except the seed. | RCA §3 |
| Pickup location | `PATCH /merchant/location` exists. The web app **never calls it**, and `placeOrder` 409s without a location. | catalog map, `merchant.controller.ts:80` |
| Login | Phone + OTP. `/auth/otp/request` sends over **Bird Verify, WhatsApp-only since 2026-09-01** (D-40 addendum; prod `OTP_CHANNEL=bird-verify`, and the Azure release refuses any non-WhatsApp channel). The merchant copy is channel-neutral ("Enter the code we sent to …"). | `auth/bird-verify.ts`, `release-azure.yml:468`, D-40 |
| **New numbers can't sign in on the web** | `verifyOtp` refuses to **create** a profile without an `x-device-id` header (L1 signup cap). The merchant web sends none, and API CORS allows only `authorization, content-type`, so a browser *couldn't* send one. A cashier or a new owner who has never used the LyniaGo app gets a 400 at the code step. Only numbers that already have a profile get in. | `auth.service.ts:549-564`, `main.ts:112-117`, `api-client.ts:95` |
| Out of stock | "For the rest of today" only (auto-resets at midnight). | `components/menu/OosSheet.tsx` |
| Customer side | `GET /restaurants` lists every `pilotEnabled` merchant. There is no vertical filter. Pharmacy is a "Soon" tile with no backend. | `apps/mobile/src/ui/shell/ServiceTiles.tsx` |
| Design | 48 RM mocks at 1024×680, of which **none** draw shops, business type, team/roles or a sign-up. The mocks are **richer than the app** in four places the app never built (§4, D7). | `r-merchant.jsx`, `r-parts.jsx`; parity tracker |

The shop **catalog and order pipeline are already generic.** Categories + items + photo + price + stock,
accept → prep → rider → pickup code: none of it is food-specific except the words. A shop is the same
machine with different nouns. That is what makes this upgrade cheap.

---

## 2. What the market does (store-screenshot research, 2026-09-29)

Two research passes pulled the Google Play and App Store listings and **viewed every screenshot**:
about 80 across Chowdeck Vendor, GoBiz (Gojek), GrabMerchant, Glovo Partners and Bolt Merchant, and 26
across Uber Eats Order Manager/Manager and DoorDash Order Manager/Business Manager. They also read about
30 current help-centre screen images, Bolt's two official PDF guides and Chowdeck's web-app code. Tags:
**[S]** seen in a screenshot, **[D]** vendor doc or app code.

### 2a. What each app does

| | Sign-in | Business type | Staff | Out of stock | Store status |
|---|---|---|---|---|---|
| **Chowdeck** | email + password [D] | **first question**, picture cards: Restaurant / Shop / Event [D] | Admin, Store Manager + custom roles, invite, audit log [D] | In/Out chip per row, bulk mark [S] | "Online" toggle [S] |
| **GoBiz (Gojek)** | **phone → WhatsApp code** (SMS/email fallback) [D] | food only | **Owner / Manager / Cashier**, owner-only reports [D] | "Manage stock" tile [S] | — |
| **GrabMerchant** | email + password (or phone) [S] | GrabFood / GrabMart pick [D] | **Owner / Store Manager / Cashier**, "Disable access" [S] | — | Normal / Closed dropdown [S] |
| **Glovo** | email + temp password [D] | Restaurant / Pharmacy / Retail / Grocery / Flowers [D] | per-section/store limits [D] | one toggle per item [S] | Busy 30 min / Close for the day [D] |
| **Bolt** | email + password; **one shared store login** [D] | **Restaurant \| Store** picture cards, then "What do you sell?" chips [D] | none: "ask your manager for the password" [D] | Available / **Sold out today (back 4am)** / **Sold out indefinitely** / Hidden [D] | Busy 15/30/45 min, Go offline [D] |
| **Uber Eats** | shared store login + personal phone/email accounts [S] | restaurant or convenience at sign-up [D] | Admin / Manager / Staff; staff can't see payments or users [S] | Available / **Sold out today** / **Sold out indefinitely** [S] | "Pause new orders" (duration + reason) [S] |
| **DoorDash** | shared store login + personal accounts by email [S] | restaurant, grocery, convenience, flowers, pets, retail [D] | Business Admin / Store Manager / Store Operator [D] | 4 hours / End of day / **Indefinitely** [S] | Pause, Busy mode [S] |

**Shops vs restaurants.** DoorDash and Uber move shops onto a separate, barcode-driven catalogue tool
with master product lists and 7-day to 3-week approvals [S/D]. Glovo runs shops on a separate Android app
with barcode picking [D]. Chowdeck keeps **one item model** and unlocks optional extras for shops:
variants with their own stock, optional SKU and a "Need sourcing?" flag [D]. **No one handles
prescriptions in-app**; pharmacies list OTC products only, and Chowdeck asks for the pharmacy licence
within 30 days with an "I'll do it later" option [D].

### 2b. Patterns we copy

1. **Business type is the first question**, as two big picture cards (Restaurant | Shop), then shop-kind
   chips (Bolt, Chowdeck, Glovo). The choice sets the vocabulary.
2. **Phone + WhatsApp code, no passwords** (GoBiz). Nobody else here does this. It is our edge with
   informal merchants who don't live in email.
3. **Everyone signs in as themselves; the owner adds staff by phone number.** Owner-only money and team
   (GoBiz, Grab, Uber). Bolt's shared "ask your manager for the password" login is the anti-pattern:
   nobody is accountable for what changed.
4. **Out of stock with an end: "Sold out today" vs "Until I turn it back on"** (Bolt, Uber, DoorDash).
   Our own RM mock already draws this sheet.
5. **One status control always on screen: Open / Busy (reverts) / Closed today** (Bolt, Glovo, Uber,
   DoorDash). Our RM mock draws it too (top-bar pill + the hours "Right now" card).
6. **Help tied to the job, routed to WhatsApp** (Bolt preset issues, Uber WhatsApp support).
7. **A setup checklist that ticks to "Done"** (Chowdeck), requiring at least one item and a map pin.

### 2c. What we deliberately don't copy (too heavy for informal Zimbabwe)

Barcode/SKU catalogues and master-product approvals · separate apps per role or per business type ·
email + password and expiring temp passwords · paperwork before a shop can exist · ads, offers,
optimisation scores · per-channel pricing, tax %, time-of-day menus.

---

## 3. The problem, stated once

An informal Harare business, a tuck-shop pharmacy, a Mbare parts dealer, a Avondale boutique, a
sadza kitchen, cannot today:

1. **sign itself up.** There is no screen. Support cannot do it either.
2. **be anything but a restaurant.** Every label says kitchen, dish, cook.
3. **let the counter person work.** One phone per shop, so the owner's phone is the shop's only key.
   The cashier, the cook and the owner's sister cannot each sign in.
4. **tell riders where it is.** No location screen, so no order can be placed even once it is live.

The do-nothing cost: the founder is recruiting merchants by hand (website "Onboard on WhatsApp"), and
every yes has to become a developer running curl. Shops, the larger half of the website's own "We
deliver for" list, cannot be onboarded at all.

---

## 4. Decisions (settled at the CEO review, 2026-09-29)

The product spec is `docs/designs/merchant-web-upgrade.md` (APPROVED). This section records the
engineering shape of each decision. "auto" = taken by this review on its recommended option under the
session's no-questions instruction (§11 ledger), and overturnable by the owner.

**D1 · One business type per account, chosen once.** *What do you sell?* Restaurant | Shop, and a shop
picks a kind: `pharmacy · grocery · butchery · fashion · auto_parts · hardware · electronics · other`.
There is no endpoint that changes the type; a wrong pick is a support fix. (owner: premise 1 + design)

**D2 · Access comes from a team table, not the JWT role.** `merchant_members` holds one row per person
per business, keyed by **profile** (`profile_id` UNIQUE, so one business per person), with `role: owner |
staff`. Pending invites are a separate table (`merchant_invites`, L4), which is how "Join / Not me"
consent works; the draft's phone-keyed rows that claimed themselves at sign-in are dropped (R2-9).
`MerchantAccessService` is the single resolver; `MerchantGuard`, the kitchen socket and every service
that today calls `resolveOwnMerchantId` or looks up `ownerProfileId` go through it. Consequences, all
intended:
- the RCA's two sources of truth (C-1) collapse to one, and an owner or staff change takes effect on
  the next request with no 15-minute stale-token window (C-2);
- `become` flips no `Profile.role`, so a customer who opens a business keeps a working customer app
  (C-4). The roles already flipped are left alone (Decision 6);
- a removed member is refused on their next request and their socket is dropped.
The migration backfills an owner row for every existing merchant. `merchants.owner_profile_id` stays as
a read fallback during rollout, and the resolver backfills a missing owner row on first use. (auto)

**D3 · Two roles and one permission table** (design doc L4). The nav, `@OwnerOnly()` and the 403 test
all use the same table. Staff can: orders (incl. totals and payment confirmation), busy mode, stock
toggles, Book a rider and act on any booking, see the Riders list. Owner only: items, hours schedule,
profile / contact phone / **location** / cash rule, statement and end-of-day totals, team, adding or
removing riders. (owner: premise 3; table auto)

**D4 · Phone + WhatsApp code works for a number LyniaGo has never seen.** The web keeps a random
per-browser device id (localStorage, cookie fallback) and sends it as `x-device-id` on verify; the API
adds `x-device-id` to CORS `allowedHeaders`. The per-device sign-up cap (3 new accounts per device per
day, `OTP_RL_DEVICE_SIGNUP_MAX`) applies to the web as it does to the app, with the web's own 429 copy.
Copy: channel-neutral before the send ("We'll send you a 6-digit code"), then the channel the API
reports in `deliveryChannel` ("Enter the code we sent to your WhatsApp · +263 77 •• •• 302"). (owner ask)

**D5 · Self-serve sign-up, two steps, then a type-aware `/setup`.** Step 1 type (+ kind), step 2 your
name, business name, a required draggable map pin, a landmark, contact phone (defaults to yours) and the
one-tap terms line. `POST /merchant/become` creates the merchant, its owner row and the terms time in one
transaction. **Go-live** (`pilotEnabled`) stays an ops switch and ships in the same layer: restaurants
only, audit-logged, with an "Awaiting go-live" list (R2-7, R2-14). (owner: premise 1; details auto)

**D6 · One vocabulary switch.** `vocabulary(businessType)` owns every noun that differs (Menu ↔ Items,
dish ↔ item, kitchen ↔ shop, "What you cook" ↔ "What you sell", starter categories per kind). A plain
typed map, not an i18n framework. (auto)

**D7 · "Simplify the restaurant side" = WhatsApp sign-in for new numbers + team logins + finishing what
the RM mocks already draw** (top bar name, Help as the sixth nav item, the three-option out-of-stock
sheet). Pause / close for today is Phase 2. (auto)

**D8 · Shops never appear as restaurants.** `listRestaurants`, the menu read and `placeOrder` filter on
`businessType = restaurant`. (auto)

**D9 · Book a rider runs on the Send rails as the business's booking account.** Each business gets one
customer profile that stands for it on Send (`firstName` = business name, `phone` =
`business:<merchantId>`, the same convention as `erased:<profileId>`; no one can sign in to it because
`normalizePhone` never produces that value). Merchant-scoped endpoints check the team row, then call the
existing Send services **as that account**. What this buys, structurally rather than by guards:
- the business owns every booking; the customer app never lists, pushes or acts on one (R2-4);
- Send's re-broadcast copies `customerId`, so a rider's cancel keeps the booking the business's (R2-2);
- holding the booking account (the existing customer hold) stops the whole business (R2-5);
- riders see the business's name as the sender.
Because the booking account is the customer of record, Send's per-person checks would look at it, not
at the person booking (OV-5). So the booking endpoint applies them to the team member too: their own
hold, and a banned or suspended rider account (as `OrdersService.create` does, `orders.service.ts:173-193`).
At pick it refuses an offer from one of the business's own members (who could otherwise deliver to
themselves, since the business holds the code).

Small Send-side touches, none importing merchant code (the `express-no-merchant-coupling` depcruise
rule):
- the snapshot's sender phone for a `business:` customer is the pickup contact phone;
- `OrderLifecycleService.cancel` takes an optional narrower allowed-status set, checked inside its own
  transaction. Merchant cancels pass the pre-pickup set, so a pickup landing mid-request can't be
  cancelled (OV-8);
- `OffersModule` exports `OffersService` (OV-7);
- the shared `isBusinessBookingAccountPhone()` helper names the convention, and the admin order, issue
  and customer views use it to show "Business: {name}" and to leave booking accounts out of customer
  lists and KPIs (OV-9).

`merchant_bookings` records who booked, who picked and who cancelled. The UI polls (3 s while finding a
rider, 15 s after); a merchant socket feed is later. (auto)

**D10 · Your riders.** `merchant_preferred_riders` (business, E.164 phone, label, added by, when),
matched to riders by phone when used. Preferred never bends eligibility. All of it lives on the merchant
side:
- **Book a rider:** Send's broadcast is unchanged. Offers from the business's preferred riders carry
  `preferred: true` in the merchant offer list, and `rankOffers` gains an optional preferred bonus that
  the merchant web applies (`rankOffers` already runs client-side only). The draft's extra push to
  preferred riders up to 10 km away is dropped (OV-2). A rider 5–10 km out lands on a 5 km board that
  doesn't list the job for 30–60 s (`apps/mobile/app/rider/(tabs)/index.tsx:694`,
  `orders.service.ts:563`), and being in the sent set would stop Send's own later push (TODO-6).
- A business's own team members can't be its preferred riders.
- **Restaurant auto-dispatch:** `DispatchStrategy.pickCandidate` receives the merchant's preferred rider
  ids and offers an eligible preferred rider first unless they are more than 2 km farther than the
  nearest eligible rider; ties by distance then rating.
(owner: premise 5; parameters auto)

---

## 5. Scope and phasing

**Phase 1 (approach B, "Everything, layered"), re-layered by the design doc and this CEO review.** Each
layer ships as **two PRs** (OV-1): an **API PR** (migration, API, shared contracts) that merges on green,
then a **web PR** (merchant web and admin console) merged only once the API release is at 100% in
production. `deploy-merchant-azure.yml` deploys the web on every push to main that touches
`apps/merchant/**` or `packages/shared/**`, independent of the API's staging gate and canary. A web PR
that adds a D-43+ deviation also waits for the owner's approval of its screenshot sheet (OV-11). Each
layer is usable without the next, behind the existing `RESTAURANTS_ENABLED` kill switch (which therefore
also gates shop bookings; §11 F1.4). *(Superseded
order, for history: L1 front door → L2 team → L3 Book a rider → L4 words. The office-hours design moved
Book a rider ahead of Team because it is what the pilot's week 1 measures.)*

*L1 — Front door* (migration `0053`)
- `x-device-id` on the CORS allow-list (API PR); the merchant web sends a per-browser device id on
  verify, the sign-in copy follows `deliveryChannel`, and "Kitchen sign-in" → "Sign in" (web PR).
- `0053`: `merchants.business_type`, `merchants.shop_kind`, `merchant_members` + owner backfill.
- `MerchantAccessService`, DB-backed `MerchantGuard`, `@OwnerOnly()`; every `resolveOwnMerchantId` /
  `ownerProfileId` caller and the kitchen socket go through the resolver.
- `become` takes `{ ownerName, name, businessType, shopKind?, location, termsAccepted: true }`, creates
  merchant + owner row in one transaction (still setting `owner_profile_id`, which `ownerPhoneMasked`
  reads), saves `ownerName` to the profile only if its name is empty, and flips no role. It refuses a
  held profile or a banned/suspended rider (OV-5).
- **L1 is forward-only** once one business signs up through `become` v2. Reverting to the role-claim
  guard would lock that business out, because v2 never writes `role = merchant` (OV-4).
- Web sign-up (type → kind → name, pin, landmark, terms) replacing the "not a merchant" dead end, with a
  type-aware `/setup`.
- Admin: `POST /admin/merchants/:id/pilot` (restaurants only, audit-logged), "Awaiting go-live" and
  "Shops (signed up)" filters on the merchants list, the switch on the detail page.
- Customer reads and `placeOrder` scoped to restaurants.
- Runbook `docs/MERCHANT-GO-LIVE-RUNBOOK.md`.

*L2 — Book a rider + the shop shell* (migration `0054`)
- `0054`: `merchant_bookings` (order, business, booked by).
- Booking account (lazy, race-safe upsert on its synthetic phone) and `MerchantBookingService` /
  controller: quote, resolve a map link, create, list, detail (snapshot), offers (with `preferred` from
  L3), pick (refusing members' offers), cancel (pre-pickup, narrowed inside Send's transaction), rotate
  code, try again.
- Send-side: sender phone on business bookings = pickup contact phone; the cancel narrowing; `OffersService`
  exported; booking accounts labelled and excluded in admin views.
- Short-link resolver: `maps.app.goo.gl` / `goo.gl/maps` only, https, ≤2 hops, `Location` header only,
  3 s timeout.
- Web: Deliveries page, booking form (L1's `LocationPin` over OSM, link parsing, value cap, prohibited-goods text),
  live pick screen, code send/copy, states list; restaurant "Book a rider" button + bookings strip on
  Orders; shop nav + vocabulary + Help.

*L3 — Your riders* (migration `0055`)
- `0055`: `merchant_preferred_riders`. Riders page (owner edits, staff view), statuses, invite link.
- `preferred` offer flag, `rankOffers` bonus, preferred-first `DispatchStrategy` with the 2 km
  guardrail, and no team members as riders. No extra push (OV-2).

*L4 — Team* (migration `0056`)
- `0056`: `merchant_invites`. Team page inside Shop, invite / remove / share link, Join / Not me with name
  confirm + terms, Leave, "Switch person", role-aware navs, `POST /admin/merchants/:id/owner`.

*L5 — Finishing the drawn restaurant screens*
- Three-option out-of-stock sheet (`today | hour | indefinite`), top bar name + who is signed in, Help as
  the sixth restaurant nav item, remaining vocabulary on shared screens.

**Phase 2: next.** Pause 30 min / Close for today (server `pausedUntil`; `RM.hours`); staff activity
trail (builds on `merchant_bookings`); Web Push; the rider-app "Refuse: prohibited goods" button and the
"{Business} calls you their rider" opt-out (one mobile release); admin tooling for owner recovery beyond
the transfer action; a merchant socket feed for bookings.

**Phase 3: the shop customer surface.** Shops section fed by `GET /shops?kind=`, shop menus and search,
with an item review of every shop before its first switch-on. Prescription items stay out until MCAZ/PCZ
sign-off (plan 2026-07-26 §6 P6).

**Explicitly not in scope:** variants/sizes, stock counts, barcodes, bulk CSV import, multi-branch
owners (since brought in by owner decision 2026-09-30: `docs/plans/2026-09-30-multi-branch-owners.md`), Shona/Ndebele copy, printing, cash-on-delivery, a paid return leg. (Server-side short-link
resolution was out of scope in the draft; the outside voice brought it into L2, OV-6.)

---

## 6. Architecture

```
  merchant web (apps/merchant, Next.js)                     admin console (apps/admin)
  login → sign-up → /setup → Orders·Menu·Shop·Hours·        merchants list (Awaiting go-live,
  Statement·Help │ Deliveries·Riders·Items·Shop·Help        Shops) → detail → go-live, owner
  (L4: Team, Join, Switch person)                           transfer, booking-account hold link
        │ Bearer JWT (+ x-device-id on /auth/otp/verify)            │ admin JWT + X-Operator
        ▼                                                           ▼
  apps/api ─────────────────────────────────────────────────────────────────────────────────
   AuthModule /auth/otp/*  (CORS allowedHeaders += x-device-id)
   MerchantModule                                   AdminModule
    MerchantAccessService ──► merchant_members       AdminMerchantsService (+pilot, +owner)
     ▲   ▲    ▲     ▲        merchant_invites (L4)      │ auditData() in the same tx
     │   │    │     └ TrackingGateway merchant:queue-subscribe (membership, not role)
     │   │    └ MerchantGuard + @OwnerOnly  ◄── every /merchant/* route
     │   └ Merchant/FoodOrder/FoodDebt/FoodDispatch services (resolver replaces 4 wrappers)
     └ MerchantBookingService (L2) ──as the booking account──► OrdersService.create/getSnapshot
         │   merchant_bookings                                  OffersService (list)
         │   merchant_preferred_riders (L3) ─► preferred flag   MatchingService.selectOffer
         │                                                      OrderLifecycleService.cancel/rotate
     FoodDispatchService ─► DispatchStrategy (L3: preferred-first, 2 km guardrail)
   Express (orders/offers/matching): unchanged except the business-sender phone (no merchant import)
  PostgreSQL: merchants(+business_type, shop_kind) · merchant_members · merchant_bookings ·
              merchant_preferred_riders · merchant_invites · profiles (+ one booking account per business)
```

```
  ACCESS (every /merchant/* request, L1)
  RestaurantsEnabledGuard ─► JwtAuthGuard ─► MerchantGuard
                                               │ MerchantAccessService.resolve(profileId)
                                               │   1. merchant_members by profile_id (unique)
                                               │   2. else merchants.owner_profile_id = profileId
                                               │        → insert owner row (backfill), use it
                                               │   3. else → 403 {reason:"not_a_member"}
                                               ▼
                                   req.merchantAccess = {merchantId, role, businessType}
                                               │
                              @OwnerOnly()? ── role ≠ owner ─► 403 {reason:"owner_only"}
                                               ▼
                                     controller → service(merchantAccess)
```

```
  SIGN-UP (new number, L1)                         BOOK A RIDER (L2)
  send code → verify (x-device-id)                 form (all fields first) → POST /merchant/bookings
   → GET /merchant/me → 403 not_a_member             → booking account (upsert) → OrdersService.create
   → "Set up your business"                           → merchant_bookings row
   → type (+kind) → name, pin, landmark, terms      → poll GET /merchant/bookings/:id every 3 s
   → POST /merchant/become                            → offers (fare, ETA, rating, Your rider)
      tx: merchant + owner member + profile name      → POST …/offers/:offerId/pick → code (once)
   → /setup (type-aware)                              → "Send the code on WhatsApp" / Copy
                                                      → poll every 15 s: coming → picked up → delivered
```

---

## 7. Data model: one migration per layer

Online-safety rules (CONTRIBUTING §"Changing the data model", `src/prisma/migration-safety.spec.ts`):
no `ADD COLUMN … NOT NULL DEFAULT` on an existing table, indexes on existing tables `CONCURRENTLY` in
their own migration, `DROP INDEX IF EXISTS`. New tables are exempt. Enums stay in lockstep with
`packages/shared/src/enums.ts` by hand (there is no parity spec; the PR checklist carries it).

**`0053_merchant_business_type_and_members` (L1)**
```sql
CREATE TYPE "MerchantBusinessType" AS ENUM ('restaurant', 'shop');
CREATE TYPE "MerchantShopKind" AS ENUM ('pharmacy','grocery','butchery','fashion','auto_parts',
                                        'hardware','electronics','other');
CREATE TYPE "MerchantMemberRole" AS ENUM ('owner', 'staff');
-- merchants holds a handful of pilot rows. Nullable add, then default, backfill and NOT NULL: never
-- ADD COLUMN … NOT NULL DEFAULT (CONTRIBUTING). SET NOT NULL scans the table, which is instant here.
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "business_type" "MerchantBusinessType";
ALTER TABLE "merchants" ALTER COLUMN "business_type" SET DEFAULT 'restaurant';
UPDATE "merchants" SET "business_type" = 'restaurant' WHERE "business_type" IS NULL;
ALTER TABLE "merchants" ALTER COLUMN "business_type" SET NOT NULL;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "shop_kind" "MerchantShopKind";
CREATE TABLE "merchant_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "merchant_id" UUID NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role" "MerchantMemberRole" NOT NULL,
  "display_name" TEXT NOT NULL,
  "terms_accepted_at" TIMESTAMPTZ,
  "added_by_profile_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX "merchant_members_profile_id_key" ON "merchant_members" ("profile_id");
CREATE UNIQUE INDEX "merchant_members_one_owner" ON "merchant_members" ("merchant_id") WHERE "role" = 'owner';
CREATE INDEX "merchant_members_merchant_id_idx" ON "merchant_members" ("merchant_id");
INSERT INTO "merchant_members" ("merchant_id","profile_id","role","display_name","created_at")
  SELECT m."id", m."owner_profile_id", 'owner',
         COALESCE(NULLIF(btrim(p."first_name" || ' ' || p."last_name"), ''), m."name"), m."created_at"
  FROM "merchants" m JOIN "profiles" p ON p."id" = m."owner_profile_id"
  ON CONFLICT DO NOTHING;
```
The shop-kind rule (`shop_kind` set iff `business_type = 'shop'`) is enforced in `become`'s zod contract
and service, not a CHECK on the existing table.

**`0054_merchant_bookings` (L2)**: `merchant_bookings(order_id UUID PK → orders ON DELETE CASCADE,
merchant_id UUID NOT NULL → merchants ON DELETE CASCADE, booked_by_profile_id UUID NOT NULL,
picked_by_profile_id UUID NULL, cancelled_by_profile_id UUID NULL, created_at)` + index
`(merchant_id, created_at DESC)`. The insert is `ON CONFLICT DO NOTHING`, so an idempotent create replay
never 500s (OV-8). The business's list reads orders by the booking account
(`orders(customer_id, created_at)` is already indexed); re-broadcast clones have no row and show the
original's booker through `rebroadcastOfId`.

**`0055_merchant_preferred_riders` (L3)**: `(id, merchant_id → merchants CASCADE, phone TEXT NOT NULL
(E.164), label TEXT NOT NULL, added_by_profile_id UUID NOT NULL, created_at)`, UNIQUE `(merchant_id,
phone)`, index `(phone)`.

**`0056_merchant_invites` (L4)**: `(id, merchant_id → merchants CASCADE, phone TEXT NOT NULL (E.164),
display_name TEXT NOT NULL, invited_by_profile_id UUID NOT NULL, created_at, expires_at TIMESTAMPTZ NOT
NULL)`, UNIQUE `(merchant_id, phone)`, index `(phone)`.

Out-of-stock "until I turn it back on" (L5) stays `outOfStockUntil = 9999-12-31` (one named constant), so
every existing reader (`isDishOutOfStock`, the customer menu, `placeOrder`) is correct unchanged.

---

## 8. Failure modes and rescue

The full registry is §11 "Failure Modes Registry". The ones a merchant sees:

| Codepath | Failure | Handling | Merchant sees |
|---|---|---|---|
| verify (web) | new number, no device id (today) | web always sends one | signs in |
| verify (web) | device cap hit | 429 | "This device has added 3 new people today. Sign in on your own phone, or try tomorrow." |
| sign-up submit | double tap / two tabs | ref latch; unique owner + unique `profile_id` → 409 `already_member` → treated as success | lands on `/setup` |
| sign-up | a pending invite exists (L4) | Join screen first; "Set up my own business" still offered | a choice |
| any merchant route | removed member | 403 `not_a_member` | "You're no longer on {business}'s team" + sign out |
| owner route as Staff | `@OwnerOnly` | 403 `owner_only`; nav hides it | "Only the owner can change this" |
| go-live (admin) | a shop | 409 `shops_not_open` | (ops) "Shops open with LyniaGo Shops" |
| booking create | business or person on hold, or the person's rider account banned/suspended | 403 `on_hold` | "Bookings are paused for this business. Message LyniaGo on WhatsApp." |
| drop-off link | not a Google Maps link, or no coordinates | 422 | "We couldn't read a location from that link. Drop a pin instead." |
| offer pick | offer from one of the business's own team | 409 `own_member` | "Someone on your team can't take your own delivery." |
| booking create | outside the 25 km area / value > $150 / no pin | 400 / 409 | field-level message; value copy per design L2 |
| offer pick | another teammate picked first / rider went stale / window closed | 409 | refetch; "That rider is taken — pick another" / "No rider picked in time" |
| cancel | already picked up | 409 | "The rider has it now — call the rider" |
| add rider | 20 already / duplicate / bad phone | 409 / 409 / 400 | plain message |
| Join (L4) | number already on a team | 409 `member_elsewhere` | "Your number already works at another business on LyniaGo. Leave it first to join {Business}." |

---

## 9. Tests (all run in `pnpm test`; DB-backed ones under `test:int`)

- **L1:** `merchant-access.service.spec.ts` (member hit, legacy-owner backfill, no row → null, concurrent
  backfill P2002 → re-read); `merchant.guard.spec.ts` rewritten (DB-backed allow/deny, `@OwnerOnly` staff →
  403, role claim ignored); `merchant.service.spec.ts` (`become` creates merchant + owner row in one tx,
  **never writes `profile.role`**, shopKind ⇔ shop, name only when empty, 409 when already a member);
  customer scope (`listRestaurants`, menu, `placeOrder` exclude shops); admin pilot switch (restaurant ok +
  audit row, shop 409, 404); tracking gateway subscribe by membership; `migration-safety.spec.ts` passes on
  `0053`; web: device id minted once and sent only on verify, copy follows `deliveryChannel`, sign-up flow,
  type-aware `/setup`, 429 copy.
- **L2:** booking service (member on hold 403; member's rider account banned 403; business held 403;
  creates as the booking account; records `merchant_bookings`, replay-safe; list is business-wide; IDOR:
  another business's order 404; pick returns the code; pick refuses a member's offer; cancel refused
  after pickup, including a pickup that lands mid-request (the narrowed status set inside Send's tx);
  rotate); snapshot sender phone for a `business:` customer; the booking account can't sign in
  (`normalizePhone('business:…')` returns `null`, OV-10); short-link resolver (allow-list, https only,
  hop cap, timeout, coordinate parse table); admin views label booking accounts; web: form validation
  (value cap copy, link parsing table), pick screen polling + expiry, states.
- **L3:** preferred rider CRUD (owner only, cap 20, rate limit, E.164, team members refused); statuses
  (on LyniaGo / not yet / can't take jobs) never leak names before a job; the `preferred` flag on offers;
  `rankOffers` bonus (preferred first unless clearly better on fare and ETA together; unchanged when no
  flag); `DispatchStrategy` preferred-first within 2 km of nearest, eligibility unchanged.
- **L4:** invites (create never reveals membership; Join resolves conflict; Not me deletes; expiry 14 d;
  first accepted wins); remove / leave; owner can't leave; `@OwnerOnly` covers every ❌ row of the
  permission table (one table-driven test); admin owner transfer (audit, member-or-free, old owner →
  staff).
- **L5:** OOS three options map to `today | hour | indefinite`; top bar shows the business and person;
  Help link.

---

## 10. Design authority and ledger

No RM mock draws sign-up, business type, shops, Team, roles, bookings or riders. Per `CLAUDE.md` these
are built in the RM visual language from existing primitives (Card, pill buttons, sheets, the option-row
pattern from `RM.oos_sheet`) at 1024×680 **and** the D-32 phone tier (320px entry-phone check), and each
is ledgered in `docs/DESIGN-DEVIATIONS.md` from D-43, with an upstream ask for real mocks.
`packages/design/**` is not edited. Each entry lands in its layer's **web PR marked PROPOSED**, with a
screenshot sheet (`tools/parity`), and becomes APPROVED when the owner approves that PR (OV-11). Planned
entries:

- **D-43 (L1)** sign-up screens and the type-aware `/setup` (undrawn); "Kitchen sign-in" → "Sign in" and
  the channel-aware code line on the drawn `RM.login` (D-40 extension).
- **D-44 (L2)** Deliveries, booking form, pick screen (undrawn); on drawn `RM.queue`: the Book a rider
  button and the bookings strip; the shop nav set; shop vocabulary on shared screens.
- **D-45 (L3)** Riders page (undrawn); Riders inside Shop for restaurants.
- **D-46 (L4)** Team, Join (undrawn); on drawn screens: Team inside `RM.shop`, the signed-in person and
  "Switch person" in the top bar, Staff navs that drop drawn items.
- The L5 items are **alignment to existing mocks**, not deviations.

---

## 11. CEO review record (`/plan-ceo-review`, 2026-09-29)

### Review setup

- **Plan under review:** this file, with the approved design doc `docs/designs/merchant-web-upgrade.md`
  as the product spec. **Depth:** implementation-ready (the owner asked for the build).
- **Storage:** this file is the working plan; approved deferrals go to `TODOS.md`.
- **How decisions were taken.** The session resumed under an instruction not to ask the user further
  questions. So every choice the skill would put to the owner as a question is taken as an
  **auto-decision on the review's recommended option**, recorded in the ledger with that authority, and
  overturnable by the owner. No choice was defaulted silently. The owner's own answers (office hours and
  the design review) are cited as such.
- **Mode:** HOLD SCOPE (0E).

### Pre-review system audit

- **History.** The last 30 days touched docs, release workflows and the mobile app; nothing under
  `apps/api/src/merchant` or `apps/merchant`. Low collision risk.
- **No stashes.** `TODOS.md` has three merchant items: `DispatchDecision` retention, the flag clean-up
  (the Piranha pass on `RESTAURANTS_ENABLED`) and commission settlement. Putting shop bookings behind
  `RESTAURANTS_ENABLED` widens the Piranha pass (F1.4).
- **Retrospective.** `docs/RCA-MERCHANT-NOT-SET-UP-2026-08-18.md`: no merchant ever self-onboarded,
  `become` had no caller and go-live had no writer. The recurring pattern is a self-serve capability
  shipped without its ops counterpart. This plan ships each pair in the same layer: sign-up with the
  go-live switch, bookings with the hold, invites with owner transfer.
- **Existing gaps noticed outside this scope** (flagged, not fixed here):
  - `placeOrder` checks neither `Profile.onHold` nor `cashBanned`
    (`food-order.service.ts:151-232`);
  - the `undelivered` contract's `note` is dropped by the controller (`lifecycle.controller.ts:89`);
  - **`declaredValue` is never returned by any API read**, so riders are not shown it. The design doc
    called it "the liability cap shown to the rider"; corrected (CEO-7).
- **UI scope:** yes, Section 11 runs. **Landscape:** the office-hours store research (§2, about 106
  screenshots plus docs) stands; no new search. **Prior learnings:** none recorded for this project.

### Step 0

**0A · Premise challenge.**
- **The real problem.** An informal business can't join LyniaGo, can't be a shop, and can't give the
  cashier a login. Its daily pain is the courier (Q2: "WhatsApp + informal couriers").
- **Direct or proxy.** The plan hits the courier pain directly (Book a rider, Your riders) and removes the
  joining blockers. The shop catalogue is proxy work until the Shops section ships; the owner kept it
  ("Both now").
- **Target outcome:** the design doc's success criteria (5 named businesses, ≥10 delivered bookings in
  week 1, ≥1 unprompted rebook, half of them adding their own courier).
- **Do-nothing cost.** Every merchant stays a developer running curl. The July gate of ≥5 pilot merchants
  stays unmet, now two weeks past its tripwire. Shops can't be onboarded at all.
- **Premise risks.**
  - Demand is a hypothesis; the Assignment is the check.
  - Rider supply near Siyaso/Mbare is a hard dependency.
  - A business's own courier must be enrolled as a Play Closed-testing tester before they can install
    the rider app. Your riders only pays off once that per-courier ops step is done.

**0B · Existing code leverage.**

| Sub-problem | Existing code | Plan |
|---|---|---|
| WhatsApp sign-in | `/auth/otp/*`, Bird Verify, `deliveryChannel` | reuse; add device id + CORS |
| Merchant profile, menu, orders, photos | `MerchantService`, catalogue, `FoodOrderService`, uploads | reuse; add type/kind |
| Access | `MerchantGuard` (role), `resolveOwnMerchantId` + 4 wrappers + 3 direct lookups | replace with one resolver |
| Go-live | `pilotEnabled` (no writer), admin merchants list/detail | add the switch + filters |
| Booking a courier | Send: `OrdersService.create`, offers, `selectOffer`, cancel, rotate, snapshot, expiry, re-broadcast | reuse as the booking account |
| Offer ranking | `rankOffers` (shared, client-side) | add an optional preferred bonus |
| Auto-dispatch | `DispatchStrategy` seam | preferred-first variant |
| Holds | customer hold (`Profile.onHold`) + admin action | reuse on the booking account |
| Audit | `auditData()` in the same transaction | reuse |
| Rate limits | `@Throttle` + global `ThrottleGuard` | reuse |

Nothing is rebuilt. The one replacement, the access resolver, collapses 4 wrappers and 3 direct lookups
into one, which is the RCA's own fix.

**0C · Dream state.**
```
  CURRENT STATE                      THIS PLAN                           12-MONTH IDEAL
  restaurants only, made by curl;    self-serve restaurants + shops;     the delivery and storefront rail for
  one phone = one shop; web can't    WhatsApp sign-in for any number;    Harare's informal economy: 5-minute
  sign in new numbers; no go-live    team logins; Book a rider on Send   sign-up, own couriers + LyniaGo riders,
  writer; every word "kitchen"       as the business; its own riders     customers find shops, staff roles,
                                     ranked first; ops go-live switch    weekly commission settled, Web Push,
                                                                         paid returns, COD for trusted shops
```
The plan moves straight toward the ideal. Nothing in it has to be undone to get there. The booking
account is the business's identity on Send, which commission and COD will need anyway.

**0D.** No new approach decision was needed: approach B, "Both now" and the riders layer are the owner's
answers, and the implementation-ready depth needs no expansion menu.

**0E · Mode: HOLD SCOPE** (auto).
- About 30 files change for L1, and roughly 90 across the whole plan. By the >15-file rule the skill's
  recommendation would be SCOPE REDUCTION.
- The owner has already turned reduction down three times: "B) Everything, layered" over A, "Both now",
  then adding riders.
- One PR per layer gives the reduction's benefit (each ship is small and reversible) without cutting
  approved scope. HOLD SCOPE then spends the review on failures, edge cases, tests and operability.
- No new approach decision was needed.

**0G · HOLD SCOPE checks.**
1. **Complexity.** The plan adds three services (access resolver, booking service, riders/team service)
   and one admin extension. Fewer moving parts were considered and rejected:
   - **Invites as pending rows in `merchant_members`.** Every access query would have to filter on
     status, and it breaks Join / Not me consent (R2-9).
   - **Bookings owned by the person, with a guard on every customer path.** That means about 8 touches in
     Send code. The booking account needs 1.
   - **Preferred reach inside Send's broadcast.** The depcruise boundary forbids it, and a merchant-side
     push is smaller.
2. **Minimum change.**
   - Polling, not a socket feed, for bookings.
   - The owner-transfer action, not a recovery UI.
   - Kept: the "jobs for you / rating" line on Riders. It is how the owner's "depending on various
     factors" becomes visible.
3. **Invariants kept.**
   - Eligibility never bends.
   - One business per person; exactly one owner.
   - Migrations are expand-only.
   - Pixel parity is kept, with every change ledgered.
   - Send's economics are unchanged: rider-direct cash, LyniaGo takes nothing.

**0I · Temporal interrogation (L1; later layers follow the same shape).**
```
  HOUR 1 (foundations)   0053 SQL + Prisma models + shared enums/contracts; the NOT NULL pattern (CEO-3)
  HOUR 2-3 (core logic)  MerchantAccessService + guard + @OwnerOnly; swap 4 wrappers + 3 lookups; become;
                         socket subscribe; customer scope; admin pilot switch + audit + list filters
  HOUR 4-5 (integration) web device id + CORS; login copy; sign-up screens (map pin); /setup by type;
                         admin console button + filters — surprise to expect: the old role claim is still
                         in tokens (ignored by the guard, still read elsewhere? grep `role === "merchant"`)
  HOUR 6+ (polish/tests) table-driven guard tests, become tx tests, migration-safety run, web RTL tests,
                         deviations D-43, runbook, 320px check
```
Effort: L1 ≈ human 4–5 days / CC ≈ 3–4 h; L2 ≈ 4 days / 3 h; L3 ≈ 2 days / 1.5 h; L4 ≈ 3 days / 2 h;
L5 ≈ 1 day / 45 min.

### Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| MODE · 0E | >15-file rule; owner rejected reduction 3× | — | HOLD SCOPE | approved (auto) | auto-decision, review mode only |
| P1–P5 · office hours | design doc Premises | as answered | — | approved | owner answers 2026-09-29 |
| APPROACH · office hours | design doc | B, layered | — | approved | owner: "B) Everything, layered" |
| CEO-1 · §1 (R2-2, R2-4, R2-5) | clone copies `customerId` (`order-lifecycle.service.ts:973-1031`); customer endpoints key on customer of record; `erased:` precedent (`privacy.service.ts:222`) | booker = customer + `booked_by_merchant_id` | business booking account + `merchant_bookings` | approved (auto) | L2 booking model only |
| CEO-2 · §1/§7 | 90 s window; app polls 15 s (`order/[id].tsx:190-199`) | socket + polling | polling 3 s / 15 s | approved (auto) | L2 web only; socket = TODO |
| CEO-3 · §9 | CONTRIBUTING forbids `ADD COLUMN … NOT NULL DEFAULT` | NOT NULL DEFAULT | nullable → default → backfill → SET NOT NULL | approved (auto) | `0053` `business_type` |
| CEO-4 · §1 | `RestaurantsEnabledGuard` on all `/merchant/*` | one switch | keep one switch; document it also gates shop bookings | approved (auto) | ops note + Piranha TODO |
| CEO-5 · §1 | depcruise `express-no-merchant-coupling` | preferred inside broadcast | merchant-side push + `preferred` flag | approved (auto) | L3 |
| CEO-6 · §9 | preflight fails if the web sends `x-device-id` before the API allows it | — | ~~web retries verify without the header~~ | **superseded** by OV-1 + OV-3 | the retry would burn a new number's code (`auth.service.ts:537` grace before the `:560` device check) |
| CEO-7 · audit | `declaredValue` never returned by any read | doc: "shown to the rider" | correct the doc; showing it to riders is a Phase 2 mobile item | approved (auto) | design doc wording |
| CEO-8 · §3 | rider-status oracle via Riders list | — | accept, bounded: cap 20, 10 adds/day, audit, masked phone, no name before a job | approved (auto) | L3 |
| CEO-9 · §5 | 4 private wrappers + 3 direct `ownerProfileId` lookups | scattered | one `MerchantAccessService` | approved (auto) | L1 |
| CEO-10 · §8 | success criteria need numbers | none | pilot SQL in the go-live runbook | approved (auto) | L1 runbook |
| R2-1 … R2-25 · design doc | spec reviewer concerns | open | per the design doc's disposition table | approved (auto) | each concern's own remedy only |
| TODO-1…7 · Closing | evidenced gaps deferred | — | `TODOS.md` | deferred (auto) | delivery scope only |
| OV-1 · outside voice | `deploy-merchant-azure.yml:27-32` deploys web on push to main; API release is gated + canaried | "API ships first" | each layer = API PR, then web PR after the API is at 100% | approved (auto) | all layers' PR structure |
| OV-2 · outside voice | board asks 5 km (`rider/(tabs)/index.tsx:694`); list filter `orders.service.ts:563`; sent-set skip `matching.service.ts:335-340` | preferred push ≤10 km | drop the push and the reach; keep tag, bonus, dispatch preference | approved (auto) | L3; TODO-6 |
| OV-3 · outside voice | verify stores grace before device check | CEO-6 retry | delete the retry | approved (auto) | L1 web |
| OV-4 · outside voice | `ownerPhoneMasked` reads `ownerProfile`; resolver fallback trusts the column | fallback on any legacy owner | `become` + transfer maintain the column; fallback only when the merchant has no owner member; L1 forward-only | approved (auto) | L1 resolver, L4 transfer, runbook |
| OV-5 · outside voice | Send's standing + self-bid checks key on the customer of record (`orders.service.ts:181-193`, `offers.service.ts:45-48`) | member hold only | member hold + rider standing at booking; refuse members' offers at pick; no members as riders; `become` refuses held/banned | approved (auto) | L1 `become`, L2 booking, L3 riders |
| OV-6 · outside voice | phones share `maps.app.goo.gl`; WhatsApp pins aren't text | short links deferred | resolve allow-listed short links server-side in v1 | approved (auto) | L2; reopens Decision 3 |
| OV-7 · outside voice | `offers.module.ts:9` no export; guard used by Uploads; tracking ↔ merchant cycle risk | new module edges | pure resolver on the global Prisma; export `OffersService`; tracking keeps its plain lookup | approved (auto) | L1, L2 wiring |
| OV-8 · outside voice | customer cancel allows post-pickup (`order-lifecycle.service.ts:810-816`); `cancelledBy` = account | pre-check then cancel | narrowed status set inside Send's tx; picked_by / cancelled_by on `merchant_bookings`; insert ON CONFLICT | approved (auto) | L2 |
| OV-9 · outside voice | `admin-orders.service.ts:685`, `issues.service.ts:208`, `admin-customers.service.ts:28` | raw `business:<id>` | label as "Business: {name}"; exclude from customer lists/KPIs | approved (auto) | L2 |
| OV-10 · outside voice | `normalizePhone` returns null (`phone.ts:22-61`) | test expects a throw | assert null | approved (auto) | L2 test |
| OV-11 · outside voice | CLAUDE.md: deviations "each approved by the user" | auto-decided D-43+ | web PR carries the entry as PROPOSED + screenshot sheet; merges after owner approval | approved (auto) | every web PR with a new deviation |
| OV-12 · outside voice | pilot gated on L3 | pilot after L3 | pilot can start after L2; L3 lands in the first week; L4 stays (owner asked for team logins) | approved (auto, partial) | pilot timing only |

**Approval readiness: PASS.** Checked MODE, P1–P5, APPROACH, CEO-1…CEO-10 (CEO-6 superseded),
R2-1…R2-25, TODO-1…TODO-7 and OV-1…OV-12. Each is backed by an owner answer or a recorded auto-decision.
None is pending.

### Section 1 · Architecture

**Current scope:** HOLD SCOPE (auto). Accepted: L1–L5 as in §5, with CEO-1…CEO-10 and the R2
dispositions. Deferred: TODO-1…TODO-5. Rejected: COD, a paid return leg,
variants/stock/barcodes.

The system diagram and access, sign-up and booking flows are in §6.

**Data flows, four paths each:**
```
  become(ownerName,name,type,kind,location,terms)
   happy : zod ok → tx{merchant, member(owner), profile.firstName if ""} → 201 → /setup
   nil   : missing field → zod 400 (web blocks submit first)
   empty : "" name / no pin / terms false → zod 400 (min length, required point, literal true)
   error : P2002 (double tap) → 409 already_member → web treats as success; PG down → 500, retry copy

  resolve(profileId)                       (every merchant request)
   happy : member row → access
   nil   : no member, no legacy owner → null → 403 not_a_member → sign-up / "no longer on the team"
   empty : legacy owner without a row → insert owner row → access (P2002 race → re-read)
   error : PG down → 500 (global filter logs), web shows the connection message

  createBooking(member, form)
   happy : account upsert → OrdersService.create (as account) → merchant_bookings → 201 {orderId}
   nil   : merchant has no pin → 409 "Set your pin first" (before Send is called)
   empty : value 0 / items "" → zod 400
   error : account held → Send's 403 on_hold → "Bookings are paused…"; corridor → 400; PG → 500
```

**State machines:**
```
  MERCHANT        become ──► signed_up ──(ops go-live, restaurants only)──► live ──(ops off)──► signed_up
                  shop: signed_up only until LyniaGo Shops (switch refuses: 409 shops_not_open)
  MEMBER (L4)     invited ──Join──► member ──remove / leave──► (row deleted)
                  invited ──Not me / 14 d / accepted elsewhere──► (row deleted)
                  owner ──(admin transfer)──► staff        owner ──remove/leave──► ✗ (400 owner_cannot_leave)
  BOOKING (merchant view over Send's states)
     finding(open_for_offers) ──pick──► coming(assigned…en_route_pickup) ──► picked_up(picked_up,
     en_route_dropoff) ──code──► delivered(delivered, completed)
     finding ──90 s──► expired ──Try again──► new booking(finding)
     coming ──business cancel──► cancelled          coming ──rider cancel──► cancelled + clone(finding,
     "your rider cancelled")                        picked_up ──rider: undelivered──► not_delivered
     ✗ picked_up ──business cancel  (blocked by the merchant guard before Send is called: 409)
     ✗ pick when not finding        (Send's selectOffer re-checks status in its transaction: 409)
```

**Findings:**
- **F1.1 (fixed by CEO-1).** Bookings need a principal that isn't a person. Without the booking account,
  Send's re-broadcast would drop the business (the clone's field list) and the customer app would keep
  full powers over business bookings.
- **F1.2.** The membership table is the single source of truth. The token's `role` claim stays in
  tokens but no merchant check reads it. At build time, grep `role === "merchant"` across `apps/api` and
  `apps/merchant` and move every hit to the resolver.
- **F1.3 · new coupling.** `MerchantModule` now also depends on `MatchingModule` and `OffersModule`.
  It's the sanctioned merchant → Send direction and adds no cycle, since those modules never import
  merchant code. `OffersModule` has to start exporting `OffersService` (OV-7).
  - The access resolver is a pure function over the global `PrismaService`. That's why the guard (also
    used by `UploadsModule`) and the lookup util can share it with no new module edges. Tracking keeps
    its own plain lookup, now over `merchant_members`, as its comment prescribes.
- **F1.4 · kill switch (CEO-4).** `RESTAURANTS_ENABLED` now also gates shops' bookings. Production has it
  on (MOB-BOOT-02: the owner's installed app shows the live Restaurants UI). Pulling it in an incident
  stops shop bookings too, so the runbook says so and the Piranha TODO covers the switch's retirement.
- **F1.5 · scaling.** Polling runs every 3 s for 90 s per booking. At 10× pilot volume that's trivial;
  at 100× (about 300 live windows) it's about 100 req/s on the hottest read path, which is the trigger
  for TODO-2 (a socket feed).
  - The guard's per-request member read is one unique-index lookup.
- **F1.6 · single points of failure.** Bird Verify (all sign-ins, existing), Redis (throttle, broadcast
  dedup, existing), Postgres, and the OSM tile servers (new, pin map only; the link-paste path works
  without them).
- **F1.7 · rollback.** Each layer is one PR with expand-only migrations. Reverting a layer's code leaves
  its tables unused and harmless (§11 rollback flowchart).

### Section 2 · Error & Rescue Map

```
  METHOD / CODEPATH                         | WHAT CAN GO WRONG                       | EXCEPTION CLASS
  ------------------------------------------|-----------------------------------------|---------------------------
  web verifyOtp (L1)                        | device sign-up cap                      | HttpException 429
  MerchantAccessService.resolve (L1)        | legacy owner, concurrent backfill        | Prisma P2002
                                            | DB unavailable                          | PrismaClientKnownRequestError
  MerchantGuard / @OwnerOnly (L1)           | not a member / not owner                 | ForbiddenException{reason}
  MerchantService.becomeMerchant (L1)       | already a member / double submit         | ConflictException / P2002
                                            | invalid type-kind / name / pin / terms   | ZodValidation → 400
  AdminMerchantsService.setPilot (L1)       | unknown id / a shop                      | NotFound / Conflict(shops_not_open)
  TrackingGateway merchant:queue-subscribe  | not a member                             | ack {error:"forbidden"}
  MerchantBookingService.ensureAccount (L2) | concurrent first booking                 | Prisma P2002 on phone
  MerchantBookingService.create (L2)        | member or business on hold               | Forbidden(on_hold)
                                            | no pin / outside corridor / value > 150  | Conflict / BadRequest / 400
  MerchantBookingService.pick (L2)          | offer taken, rider stale, window closed  | Conflict (from selectOffer)
  MerchantBookingService.cancel (L2)        | already picked up                        | Conflict(picked_up)
  MerchantBookingService.rotateCode (L2)    | wrong status                             | Conflict
  booking lookups (L2)                      | another business's order id              | NotFound (never 403: no oracle)
  MapLinkResolver.resolve (L2)              | host not allow-listed / http / >2 hops   | BadRequest(unsupported_link)
                                            | no coordinates / timeout / DNS error     | UnprocessableEntity / AbortError
  MerchantBookingService.pick (L2)          | offer from the business's own member     | Conflict(own_member)
  PreferredRidersService.add (L3)           | cap 20 / duplicate / bad phone / rate    | Conflict / P2002 / 400 / 429
                                            | a team member's phone                    | Conflict(team_member)
  DispatchStrategy preferred lookup (L3)    | query error                              | Prisma error (non-fatal)
  InviteService.create / join (L4)          | expired / accepted elsewhere / race      | Gone / Conflict / P2002
  AdminMerchantsService.transferOwner (L4)  | target in another business / unknown     | Conflict / NotFound

  EXCEPTION                         | RESCUED? | RESCUE ACTION                                   | USER SEES
  ----------------------------------|----------|-------------------------------------------------|------------------------------
  429 device cap                    | Y        | web maps to its own copy                        | "This device has added 3…"
  P2002 legacy backfill             | Y        | re-read the member row                          | nothing
  Forbidden not_a_member            | Y        | web: sign-up if never a member, else sign out   | "Set up your business" / "no longer on…"
  Forbidden owner_only              | Y        | nav hides; direct URL shows the message         | "Only the owner can change this"
  Conflict already_member           | Y        | web treats as success                           | lands on /setup
  Conflict shops_not_open           | Y        | admin toast                                     | (ops) "Shops open with LyniaGo Shops"
  P2002 booking account             | Y        | re-read by phone                                | nothing
  Forbidden on_hold                 | Y        | message + WhatsApp support button               | "Bookings are paused…"
  Conflict from selectOffer         | Y        | refetch the booking                             | "That rider is taken — pick another"
  Conflict picked_up                | Y        | refetch; show Call rider                        | "The rider has it now…"
  unsupported / unreadable link     | Y        | log {merchantId, host}; the pin stays available  | "We couldn't read a location from that link. Drop a pin instead."
  Conflict own_member               | Y        | refetch offers                                  | "Someone on your team can't take your own delivery."
  preferred lookup error (dispatch) | Y        | log; fall back to nearest-first                 | nothing
  Gone invite expired               | Y        | Join shows expiry                               | "This invite has expired. Ask {Owner} to send a new one."
  DB unavailable                    | N (by design) | global filter logs + 500; the web keeps the session | "Couldn't reach the server…"
```
No catch-alls are introduced. Every rescue logs `{route, profileId, merchantId, reason}`.

### Section 3 · Security & Threat Model

| # | Threat | Likelihood | Impact | Mitigation in the plan |
|---|---|---|---|---|
| T1 | Membership oracle through invites | Med | Med | invite never reveals; conflict shown only to the number's owner at Join (R2-21) |
| T2 | Rider-status oracle through the Riders list (CEO-8) | Med | Low–Med | cap 20 per business, 10 adds/day, audit log, masked phone, no LyniaGo name or photo before a job; device sign-up cap limits fake businesses |
| T3 | IDOR on bookings | Med | High | every booking read/write checks `order.customerId == business account`; mismatch → 404; table test |
| T4 | Staff escalation to owner routes | Med | High | `@OwnerOnly` per ❌ row; one table-driven test over the permission table |
| T5 | Device-id rotation to mass-create accounts | Low | Med | same as the app today: per-phone and per-IP OTP limits + OTP cost; device cap is a speed bump |
| T6 | CORS header addition | Low | Low | `x-device-id` only; origins unchanged |
| T7 | Signing in to a booking account | Low | High | `business:` never passes `normalizePhone`; test |
| T8 | SSRF through location links | — | — | links are parsed in the browser only; no server fetch in v1 |
| T9 | OSM tiles see the merchant's IP and map area | High | Low | accepted; CSP allow-list for the tile host; attribution shown |
| T10 | Delivery code in a `wa.me` URL | High | Low | intended: the code is meant for the buyer; not logged server-side |
| T11 | Shared counter tablet stays signed in (365-day cookie) | Med | Med | Staff accounts on tablets; "Switch person"; removal is enforced per request |
| T12 | Owner-transfer social engineering | Low | High | admin-only, required note, audit row, identity check in the runbook |
| T13 | Removed staff keeps access until token expiry | — | — | guard reads the DB per request, so access ends on the next request; socket evicted |
| T14 | Input abuse | Med | Low | zod: names 1–60/120, landmark 1–160, E.164 normalisation, enum kinds, value ≤ 150 |
| T15 | SSRF through the short-link resolver (OV-6) | Med | High | exact host allow-list (`maps.app.goo.gl`, `goo.gl` + `/maps` path), https only, ≤2 hops each re-checked, `Location` header only (no body), 3 s timeout, throttled per member |
| T16 | Self-dealing: a member who is also a rider takes their own business's jobs (OV-5) | Med | Med | refuse members' offers at pick; members can't be preferred riders; booking checks the member's rider standing |

Audit trail: go-live, owner transfer, preferred-rider add/remove, invite/remove member (all via
`auditData()` or the merchant audit equivalent). No new secrets and no new client dependency: the map
pin is the web's own `LocationPin` over OpenStreetMap tiles (built in L1 instead of Leaflet, so no
lockfile change; L2's booking form reuses it).

### Section 4 · Data Flow & Interaction Edge Cases

```
  BOOKING FORM ─► VALIDATE ─► TRANSFORM ─► PERSIST ─► OUTPUT
   buyer phone   zod+E.164    dropoff      Send order    booking id → pick screen
   link / pin    link parser  Waypoint     merchant_     (poll)
   value, items  value ≤ 150  as account   bookings
   shadow: nil → field error · too long → zod 400 · timeout → ApiError(0), form kept (no double create:
   idempotencyKey per submit) · duplicate submit → Send's idempotency returns the same order · stale
   business pin → re-read at submit
```
**Async ordering (the invariant is "one pick per booking").**
```
  teammate A              teammate B              Send order (shared state)
  pick(offer1) ─────────► selectOffer tx locks ── status open → assigned, offer1 accepted
                          pick(offer2) ─────────► selectOffer: status ≠ open → 409 → B refetches
  (reverse order: B wins, A gets the 409; the mechanism is selectOffer's status check in one transaction)
```
**Cancel vs pickup (OV-8).** The merchant's "before pickup" rule is enforced inside Send's cancel
transaction: the narrowed allowed-status set is checked on the row read in that transaction, and the
compare-and-swap `updateMany({ where: { id, status } })` loses to a pickup that commits first. There is
no merchant-side pre-check to race.

Also proven by the mechanism, not the schedule:
- **Join races** use the unique `profile_id`.
- **Double sign-up** uses the unique owner + `profile_id`.
- **Concurrent first bookings** use the booking account's unique phone.
- **A rider cancel while a teammate is picking** hits the status check.

Regression proof: service tests with a controlled `$transaction` interleave for pick and join.

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Sign-up submit | double tap, back button, refresh mid-flow | Y | ref latch; 409 = success; steps kept in session storage |
| Pin map | location denied / 2G tiles slow | Y | pin starts at Harare CBD; link paste works without tiles |
| Book a rider | leave during the 90 s | Y | refetch on return; expired → Try again |
| Pick | two teammates | Y | 409 + refetch |
| Code | picking device closed before sending | Y | Send a new code (rotation) |
| Deliveries list | zero / many bookings | Y | empty state with the first-booking prompt; paged 20 |
| Riders list | 0 / 20 riders; number not on LyniaGo | Y | empty prompt; add disabled at 20; invite link |
| Team (L4) | invite someone already elsewhere | Y | never revealed; resolved at Join |
| Staff removed mid-shift | next tap | Y | 403 → message + sign out |

### Section 5 · Code Quality

- **DRY (CEO-9).** `resolveOwnMerchantId` has four private wrappers (`merchant.service.ts:599`,
  `food-order.service.ts:814`, `food-debt.service.ts:435`, `food-dispatch.service.ts:574`), and there are
  three direct `ownerProfileId` lookups (`merchant.service.ts:143`, `:590`, `tracking.service.ts:260`).
  All seven go through `MerchantAccessService`, and the guard puts `req.merchantAccess` on the request
  so services stop re-resolving.
- **Naming.** Keep the internal `Kitchen*` component names (renaming 20 files buys nothing). User-facing
  words come from `vocabulary()`.
- **Over-engineering to avoid.** `vocabulary()` is a typed map, not an i18n library. The permission
  table is one constant used by the nav and the tests, not a policy engine.
- **Under-engineering fixed.** `become` flipping the role; the guard trusting a 15-minute claim.
- **Complexity.** `MerchantBookingService.toMerchantState()` maps 12 Send statuses to 8 merchant states
  as a table lookup, not a branch chain.

### Section 6 · Test Review

```
  NEW THING                         TYPE          HAPPY                      FAILURE                       EDGE
  device id + CORS (L1)             unit+web      header on verify only      cap hit → own-phone copy      id persists across reloads
  resolver + guard (L1)             unit          member → access            none → 403                    legacy backfill race
  become (L1)                       unit          tx creates 2 rows          409 already_member            name only if empty; no role write
  customer scope (L1)               unit          restaurants listed         shop hidden / placeOrder 404  —
  admin pilot (L1)                  unit          restaurant on + audit      shop 409 / 404                idempotent
  web sign-up + /setup (L1)         RTL           type→kind→details          409 → success                 320px layout
  booking service (L2)              unit          create as account          held 403 / IDOR 404           duplicate submit
  pick / cancel / rotate (L2)       unit          code returned once         taken 409 / picked-up 409     two teammates
  sender phone (L2)                 unit          business → pickup phone    —                             non-business unchanged
  booking web (L2)                  RTL           form → pick → code         expiry → Try again            link parser table
  preferred (L3)                    unit          flag + bonus               team member refused           no names before a job
  dispatch preferred (L3)           unit          preferred within 2 km      lookup error → nearest        tie by distance, rating
  invites / team (L4)               unit+RTL      join / remove / leave      expired 410 / elsewhere 409   Not me
  permission table (L4)             unit          owner allowed              staff 403 on every ❌ row      —
  OOS / top bar / Help (L5)         RTL           three options              —                             —
```
- **The 2am-Friday test:** a new number signs up on the web, gets a working `/setup`, books a rider, and
  a teammate on another device sees the booking. It's an integration test over the service layer.
- **The hostile-QA test:** a Staff token calling every owner route, and another business's order ids on
  every booking route.
- **The chaos test:** the map-link resolver timing out or redirecting off the allow-list, plus a pickup
  committing while a teammate cancels.
- **The pyramid** is unit-heavy with RTL for flows, and no new E2E.
- **Flakiness:** polling and countdowns use fake timers; no wall-clock tests.

No LLM or prompt changes.

### Section 7 · Performance

- **Guard:** one unique-index read per merchant request (members by `profile_id`).
- **Deliveries list:** `orders(customer_id, created_at)`, already indexed, paged 20. `merchant_bookings
  (merchant_id, created_at)` serves "booked by".
- **Preferred push:** one query per business booking (≤20 phones joined to the riders' eligibility SQL).
- **Dispatch:** one preferred-id read per tick per order, cached for the tick.
- **Top slow paths:** the booking snapshot (existing, parallelised); `become` (one transaction, 3 writes);
  the admin awaiting list (tiny).
- **No N+1:** the Riders list resolves statuses in one query over the business's phones.
- **No new pools.**

### Section 8 · Observability & Debuggability

- **Structured logs.** `merchant.become` (merchantId, type, kind), `merchant.access_denied` (profileId,
  reason), `merchant.booking.created` / `picked` / `cancelled` (orderId, merchantId, memberId),
  `merchant.preferred_push` (orderId, audience size) and `merchant.dispatch.preferred` (orderId, chosen,
  reason).
- **Metrics (CEO-10: SQL in the go-live runbook, dashboards later):**
  - sign-ups by type and day;
  - median sign-up time (verify → merchant created);
  - bookings created / expired / delivered per business;
  - share of bookings taken by a preferred rider;
  - 403 `not_a_member` rate.
- **Admin:** the awaiting list; the merchant detail shows members, the booking account link and its
  bookings count.
- **Runbooks** (`docs/MERCHANT-GO-LIVE-RUNBOOK.md`): go-live checks; prohibited goods (cancel with
  "Safety concern" + hold the booking account); owner transfer identity check; a removed staff member
  still on a tablet; pulling `RESTAURANTS_ENABLED` also stops shop bookings.
- **Three-weeks-later debuggability:** `merchant_bookings` plus the order events plus audit rows
  reconstruct who booked, who picked and who cancelled.

### Section 9 · Deployment & Rollout

- **Migrations** run before the API rolls out (release workflow). `0053`–`0056` are expand-only; `0053`
  uses the nullable → backfill → NOT NULL pattern (CEO-3) and is instant on the pilot's handful of
  merchant rows.
- **The risk window (OV-1, replacing CEO-6).** The merchant web deploys to production on every push to
  main that touches `apps/merchant/**` or `packages/shared/**` (`deploy-merchant-azure.yml:27-32`),
  while the API waits for the staging gate and then runs a 10 → 50 → 100 canary. So "new web, old API"
  would be the normal state for tens of minutes after every merge.
  - The fix is sequencing, not code: every layer is an **API PR** first.
  - The **web PR** merges only after that API release shows 100% in production (checked on the
    release run).
  - New API with old web is always safe: the old web sends no device id and never calls the new routes,
    and membership is backfilled.
  - The web never sends `x-device-id` to an API that refuses it, so the verify retry is dropped (OV-3).
- **L1 is forward-only** once a business signs up through `become` v2 (OV-4). The runbook says so.
- **Flags:** none new (the existing kill switch; F1.4).
- **Post-deploy check, first 5 minutes:**
  - an existing merchant signs in and sees Orders;
  - a never-seen number signs in on the web and reaches "Set up your business";
  - `become` lands on `/setup`;
  - the admin list shows the new merchant;
  - `/restaurants` excludes a test shop.
- **First hour:** the 403 `not_a_member` rate is about 0 for existing merchants.
- **Smoke:** the existing `/api/healthz` plus the checks above.

### Section 10 · Long-Term Trajectory

- **Debt added (all tracked):**
  - the `owner_profile_id` fallback (TODO-1);
  - flipped `Profile.role` values (TODO-1);
  - polling instead of a feed (TODO-2);
  - OSM public tiles (self-host if volume grows);
  - the `business:` phone convention, documented in the schema comment and `docs/ARCHITECTURE`.
- **Path dependency.** The booking account is the business's identity on Send, and commission, COD and
  invoices will all want it. It points the right way.
- **Reversibility: 4/5.** Layers revert cleanly. The booking-account convention is the stickiest piece
  (3/5), since rows would need migrating.
- **Fit.** It uses the repo's conventions: NestJS guards, `auditData`, `@Throttle`, zod contracts,
  expand-only migrations, the depcruise boundary.
- **The 1-year question.** Is it obvious to a new engineer? Yes, given the schema comments and this plan.

### Section 11 · Design & UX

- **Information architecture.** A shop lands on Deliveries (book first, then the list); a restaurant on
  Orders. Riders, Items, Shop and Help come next. Team is inside Shop.
- **State coverage:**

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Sign-up | button spinner | — | field + banner | → /setup | steps kept |
| /setup | skeleton | — | retry card | ticks | per-type steps |
| Deliveries | skeleton rows | "Book your first rider" | retry card | list | polling badge |
| Booking form | — | — | field errors | → pick screen | draft kept on error |
| Pick screen | countdown + "waiting for riders" | "No rider picked in time" | "Couldn't load offers" + retry | code card | offers arriving |
| Riders | skeleton | "Add the riders you already use" | retry | list | statuses |
| Team / Join | skeleton | "Just you so far" | retry | list | invited rows |

- **Journey.**
  1. Sign in: "it knows WhatsApp".
  2. Pick shop, then car parts: "this is for me".
  3. Drop the pin: "they'll find me".
  4. The first booking's offers arrive: relief.
  5. Send the code on WhatsApp: familiar.
  6. Delivered: proof.
  7. Add my own courier: "this is how I already work".
- **AI-slop risk.** Generic cards are the risk. Use the RM primitives and tokens (`packages/design/tokens`)
  and the option-row pattern; no new visual language.
- **DESIGN.md alignment:** targets ≥ `--target-min`, 52px primaries, tokens only.
- **Responsive:** the D-32 phone tier with the 320px check. The booking form is single-column on a
  phone.
- **Accessibility:** labelled fields, the code in large tabular digits, focus order through the form,
  and colour-independent status tags.
- **Recommendation:** run `/plan-design-review` before the L2 web build, since it has the most new UI.
  After implementation, `/design-review` on the live pages.

### Outside voice (independent plan challenge)

Codex isn't installed here, so the outside voice ran as the **native fallback**: a fresh-context Claude
`Plan` subagent, read-only, given this plan and the design doc. It ran in the foreground, because this
session has no `TaskOutput` for the skill's bounded background wait. Its findings count as native, **not
as external coverage**, and there is no cross-model comparison.

It checked the riskiest claims against the code. It confirmed two:
- the re-broadcast clone copies `customerId` (`order-lifecycle.service.ts:1006`);
- pushes only go to device tokens (`notifications.service.ts:409-414`), so a booking account gets none.

It then reported 12 findings. Each was checked against the code before it changed the plan, and each is
a ledger row OV-1…OV-12:

| # | Severity | Finding | Verified | Disposition |
|---|---|---|---|---|
| 1 | high | "The API ships first" is false: the merchant web deploys on every push to main, and the API is gated and canaried | yes (`deploy-merchant-azure.yml:27-32`) | applied: API PR, then web PR per layer |
| 2 | high | the preferred push can't reach 5–10 km riders (5 km board) and suppresses Send's own push | yes (`index.tsx:694`, `orders.service.ts:563`) | applied: push and reach dropped; TODO-6 |
| 3 | medium | the CEO-6 retry burns a new number's code | yes (`auth.service.ts:537` before `:560`) | applied: retry deleted |
| 4 | medium | `owner_profile_id` upkeep and a fallback that could re-admit a transferred-out owner; L1 revert strands v2 sign-ups | yes (`merchant.service.ts:590-596`, `merchant.guard.ts:10`) | applied: column maintained, narrowed fallback, forward-only |
| 5 | medium | the booking account bypasses Send's per-person standing and self-bid checks | yes (`orders.service.ts:181-193`) | applied: member checks, own-member pick refusal, no members as riders, `become` standing check |
| 6 | medium | link parsing misses `maps.app.goo.gl` and WhatsApp pins | reasoned (share formats) | applied: allow-listed short-link resolver in v1; TODO-7 |
| 7 | low-med | `OffersService` not exported; guard DB dependency vs `UploadsModule`; tracking cycle risk | yes (`offers.module.ts:9`) | applied: pure resolver on global Prisma; export |
| 8 | low | cancel check-then-act race; no per-person actor trail | yes (`order-lifecycle.service.ts:810-822`) | applied: narrowed status set in Send's tx; picked_by/cancelled_by |
| 9 | low | admin shows `business:<uuid>`; booking accounts in customer KPIs | yes (`admin-orders.service.ts:685`) | applied: labels + exclusion |
| 10 | low | `normalizePhone` returns null, not a throw | yes (`phone.ts`) | applied: test corrected |
| 11 | process | D-43+ can't be auto-approved under CLAUDE.md | yes (CLAUDE.md "each approved by the user") | applied: web PRs carry PROPOSED entries + screenshots and wait for the owner |
| 12 | strategic | the pilot waits on L3, whose push didn't work; hold L3 dispatch and L4 | partly | partly applied: the pilot may start after L2, and L3 lands in its first week. **L4 stays in scope** because the owner asked for team logins verbatim. |

**Where it disagreed with the review and the review changed:** #1, #2, #3 and #5. **Where the review
kept its position:** the booking account itself (the reviewer confirmed its two load-bearing claims) and
L4's place in scope (#12).

### NOT in scope

- **Deferred** (to `TODOS.md`, auto):
  - TODO-1: remove the `owner_profile_id` fallback and repair flipped roles, after rollout.
  - TODO-2: a merchant socket feed for bookings, at 100× polling load.
  - TODO-3: the rider-app refusal button, the preferred-rider opt-out, and showing the declared value to
    riders. One mobile release.
  - TODO-4: Web Push for bookings.
  - TODO-5: the Piranha pass now includes shop bookings.
  - TODO-6: reach for a business's own riders beyond Send's radius (a Send-side board change), if pilot
    data shows them out of range (OV-2).
  - TODO-7: a "share my location" link the business sends the buyer, if wrong drop-offs drive
    undelivered bookings (OV-6).
- **Brought into scope by the outside voice:** server short-link resolution against a strict allow-list
  (OV-6).
- **Rejected** (auto, reason):
  - COD (money movement; Send is rider-direct cash);
  - a paid return leg (Phase 2 product question);
  - variants, stock and barcodes (too heavy for informal shops, research §2c);
  - a rider-app change in v1 (Play release cost).

### What already exists

Send's whole booking lifecycle (create, broadcast, offers, pick, code, cancel, re-broadcast, expiry,
undelivered), `rankOffers`, the `DispatchStrategy` seam, customer holds, `auditData`, `@Throttle`, the
merchant catalogue, orders and uploads, the admin merchants pages, and Bird Verify WhatsApp OTP. The plan
reuses all of them; nothing is rebuilt.

### Dream state delta

After this plan the ideal is missing:
- customer-facing Shops (Phase 3);
- commission settlement (existing TODO);
- Web Push;
- COD and paid returns;
- the rider-app half of preferred riders.

The foundations for each (business identity on Send, membership, per-business booking records) are in
place.

### Error & Rescue Registry and Failure Modes Registry

The rescue map is in Section 2 (20 codepaths, 0 unrescued except DB-down by design).
```
  CODEPATH              | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?           | LOGGED?
  ----------------------|--------------------------------------|----------|-------|----------------------|--------
  web ahead of API      | new web calls routes the API lacks   | Y (OV-1) | —     | nothing (PR order)   | —
  web verify            | device cap                           | Y        | Y     | own-phone message    | Y
  resolver              | legacy owner backfill race           | Y        | Y     | nothing              | Y
  guard                 | not a member / owner-only            | Y        | Y     | message              | Y
  become                | double submit                        | Y        | Y     | lands on /setup      | Y
  admin pilot           | shop / unknown                       | Y        | Y     | ops toast            | Y
  booking create        | held / no pin / corridor / value     | Y        | Y     | message              | Y
  booking pick          | taken / stale / closed               | Y        | Y     | refetch + message    | Y
  booking cancel        | after pickup                         | Y        | Y     | call-rider message   | Y
  booking IDOR          | other business's id                  | Y        | Y     | 404                  | Y
  re-broadcast          | business lost on clone (pre-CEO-1)   | Y (CEO-1)| Y     | "your rider cancelled"| Y
  map link resolver     | unsupported host / no coords / slow  | Y        | Y     | "drop a pin instead" | Y
  pick                  | member bidding on own business       | Y        | Y     | message              | Y
  dispatch preferred    | lookup error                         | Y        | Y     | nothing (nearest)    | Y
  invite join           | expired / elsewhere / race           | Y        | Y     | message              | Y
  owner transfer        | target elsewhere / unknown           | Y        | Y     | ops message          | Y
  DB unavailable        | any                                  | N (500)  | —     | connection message   | Y
```
0 critical gaps (no row is unrescued, untested and silent). Before this review there were three:
- the re-broadcast clone dropping the business (fixed by CEO-1);
- a web-first deploy breaking sign-up and the new pages (fixed by OV-1's PR order; CEO-6's retry was
  itself unsafe, OV-3);
- a member farming their own business's jobs (fixed by OV-5).

### Diagrams

1. **System architecture:** §6.
2. **Data flow with shadow paths:** Sections 1 and 4.
3. **State machines:** Section 1.
4. **Error flow:** Section 2.
5. **Deployment sequence:**
```
  merge L1-API PR → release-azure: staging gate → prisma migrate deploy (0053) → canary 10→50→100
                 (deploy-merchant-azure also redeploys the unchanged web, since packages/shared changed: safe)
  API at 100% ──► merge L1-web PR → deploy-merchant-azure (device id, sign-up, copy) + admin console
  window A (new API, old web): safe by construction     window B (old API, new web): never opened (PR order)
```
6. **Rollback flowchart:**
```
  L<n> broken? ─► revert L<n>'s web PR first, then its API PR if needed ─► tables stay, unused ─► fix forward
       │ L1 after any v2 sign-up: forward-only (the old guard needs role=merchant, which v2 never writes)
       │ sign-in broken for everyone? ─► revert the L1 web PR (old web never sends the header)
       │ merchant pages 403 for existing merchants? ─► resolver falls back to owner_profile_id;
       │                                               if still failing, revert the API
       └ incident in bookings? ─► hold the business's booking account (ops) or pull RESTAURANTS_ENABLED
```

**Stale diagram audit.** The plan's previous §6 diagrams (phone-keyed claim at sign-in, Team before
bookings) are replaced. The design doc's ASCII is current. `docs/RCA-MERCHANT-NOT-SET-UP-2026-08-18.md`
is history and stays as written.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Checkbox as
they ship. Ratios assumed: features ~30×, tests ~50×, migrations ~20×. **PR shape (OV-1):** within each
layer the `api` tasks form the API PR, and the `web`/`admin` tasks form the web PR, merged after the
API is at 100%.

- [ ] **T1 (P1, human: ~1d / CC: ~40min)** — api/L1 — migration `0053`, Prisma models, shared enums + contracts
  - Surfaced by: §7 data model; CEO-3
  - Files: `apps/api/prisma/migrations/0053_*/migration.sql`, `apps/api/prisma/schema.prisma`, `packages/shared/src/{enums,contracts}.ts`
  - Verify: `pnpm --filter @lynia/api test -- migration-safety`; `prisma migrate` CI job
- [ ] **T2 (P1, human: ~1.5d / CC: ~50min)** — api/L1 — `MerchantAccessService`, DB-backed `MerchantGuard`, `@OwnerOnly`, swap all 7 lookups, socket subscribe
  - Surfaced by: Section 5 (CEO-9); F1.2
  - Files: `apps/api/src/merchant/{merchant-access.service,merchant.guard,merchant-lookup.util,merchant.service,food-order.service,food-debt.service,food-dispatch.service}.ts`, `apps/api/src/tracking/{tracking.service,tracking.gateway}.ts`
  - Verify: guard/resolver specs; existing merchant specs green
- [ ] **T3 (P1, human: ~0.5d / CC: ~20min)** — api/L1 — `become` v2 (no role flip, owner row, name, terms, type/kind, location)
  - Surfaced by: D2/D5; RCA C-4
  - Files: `merchant.service.ts`, `merchant.controller.ts`, `packages/shared/src/contracts.ts`
  - Verify: `merchant.service.spec.ts` (never writes `profile.role`)
- [ ] **T4 (P1, human: ~0.5d / CC: ~15min)** — api/L1 — customer scope to restaurants
  - Surfaced by: D8
  - Files: `merchant.service.ts` (`listRestaurants`, menu), `food-order.service.ts` (`placeOrder`)
  - Verify: scope specs
- [ ] **T5 (P1, human: ~1d / CC: ~30min)** — api+admin/L1 — go-live switch, awaiting/shops filters, audit
  - Surfaced by: R2-7, R2-14; RCA fix #1
  - Files: `apps/api/src/admin/admin-merchants.*`, `apps/admin/app/merchants/**`
  - Verify: admin specs; console action test
- [ ] **T6 (P1, human: ~0.5d / CC: ~15min)** — api+web/L1 — CORS `x-device-id`, web device id, channel copy, "Sign in"
  - Surfaced by: D4; OV-1, OV-3 (no retry; the CORS line ships in the API PR)
  - Files: `apps/api/src/main.ts` (API PR); `apps/merchant/app/lib/{api-client,device-id}.ts`, `apps/merchant/app/login/page.tsx` (web PR)
  - Verify: api-client + login tests
- [ ] **T7 (P1, human: ~2d / CC: ~60min)** — web/L1 — sign-up flow (type, kind, name, pin map, landmark, terms) + type-aware `/setup`
  - Surfaced by: D5; R2-16, R2-19
  - Files: `apps/merchant/app/(app)/setup/**`, `apps/merchant/app/(onboarding)/**` (new), `lib/setup-checklist.ts`
  - Verify: RTL flow tests; 320px check
- [ ] **T8 (P1, human: ~0.5d / CC: ~15min)** — docs/L1 — D-43 ledger entry, go-live runbook with pilot SQL
  - Surfaced by: §10; CEO-10
  - Files: `docs/DESIGN-DEVIATIONS.md`, `docs/MERCHANT-GO-LIVE-RUNBOOK.md`, `docs/PIXEL-PARITY-TRACKER.md`
  - Verify: `design-freeze` CI job; doc review
- [ ] **T9 (P1, human: ~2.5d / CC: ~90min)** — api/L2 — booking account, `MerchantBookingService` + controller, `merchant_bookings` (`0054`), member standing checks, own-member pick refusal, narrowed cancel, map-link resolver, sender phone, `OffersService` export, admin labels
  - Surfaced by: CEO-1; R2-1…R2-6; OV-5, OV-6, OV-7, OV-8, OV-9
  - Files: `apps/api/src/merchant/merchant-booking.*`, `apps/api/src/orders/orders.service.ts` (one line), `packages/shared/src/*`
  - Verify: booking specs incl. IDOR and pick race
- [ ] **T10 (P1, human: ~2.5d / CC: ~80min)** — web/L2 — Deliveries, booking form (`LocationPin`/OSM, link parser), pick screen (polling), code send/copy/rotate, restaurant button + strip, shop nav, `vocabulary()`, Help
  - Surfaced by: R2-3, R2-8, R2-12; CEO-2
  - Files: `apps/merchant/app/(app)/deliveries/**`, `components/KitchenNav.tsx`, `lib/vocabulary.ts`
  - Verify: RTL + parser table tests; D-44 ledger
- [ ] **T11 (P1, human: ~1.5d / CC: ~45min)** — api+web/L3 — `merchant_preferred_riders` (`0055`), Riders page, `preferred` flag, `rankOffers` bonus, preferred-first dispatch, no members as riders
  - Surfaced by: D10; CEO-5, CEO-8
  - Files: `apps/api/src/merchant/merchant-riders.*`, `dispatch-strategy.ts`, `packages/shared/src/offer-ranking.ts`, `apps/merchant/app/(app)/riders/**`
  - Verify: specs listed in §9; D-45 ledger
- [ ] **T12 (P1, human: ~2.5d / CC: ~70min)** — api+web+admin/L4 — invites (`0056`), Team, Join, Leave, Switch person, Staff navs, owner transfer
  - Surfaced by: R2-11, R2-16, R2-17, R2-21, R2-22
  - Files: `apps/api/src/merchant/merchant-team.*`, `apps/merchant/app/(app)/shop/team/**`, `apps/merchant/app/join/**`, admin transfer action
  - Verify: permission-table test; invite specs; D-46 ledger
- [ ] **T13 (P2, human: ~1d / CC: ~30min)** — web/L5 — OOS three options, top bar, Help nav, remaining vocabulary
  - Surfaced by: D7
  - Files: `components/menu/OosSheet.tsx`, `KitchenBar.tsx`, `KitchenNav.tsx`
  - Verify: RTL; parity tracker rows

### Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE (auto; owner rejected reduction)  |
  | System Audit         | no merchant code touched in 30 d; RCA        |
  |                      | pattern (capability w/o ops half); 3 gaps    |
  |                      | outside scope (2 queued as tasks)            |
  | Step 0               | HOLD SCOPE; approach B settled; CEO-1..10    |
  |                      | + R2-1..25 + OV-1..12 dispositioned          |
  | Section 1  (Arch)    | 7 issues found                               |
  | Section 2  (Errors)  | 23 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 16 issues found, 6 High severity (mitigated) |
  | Section 4  (Data/UX) | 13 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 5 issues found                               |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                     |
  | Section 7  (Perf)    | 0 issues found                               |
  | Section 8  (Observ)  | 1 gap found (pilot metrics; fixed CEO-10)    |
  | Section 9  (Deploy)  | 2 risks flagged (PR order OV-1; L1 fwd-only) |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 5            |
  | Section 11 (Design)  | 7 states mapped; /plan-design-review advised |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (7 deferred, 4 rejected)             |
  | What already exists  | written                                      |
  | Dream state delta    | written                                      |
  | Error/rescue registry| 23 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 18 total, 0 CRITICAL GAPS (3 fixed)          |
  | TODOS.md updates     | 7 items proposed (7 deferred)                |
  | Scope proposals      | 0 proposed, 0 accepted (HOLD SCOPE)          |
  | CEO plan             | skipped by mode (HOLD SCOPE)                 |
  | Outside voice        | native Claude subagent, completed, 12        |
  |                      | findings; no external coverage (no codex)    |
  | Lake Score           | N/A (no user-answered scored questions)      |
  | Diagrams produced    | 8 (system, access, sign-up + booking flows,  |
  |                      | data flows, state machines, error flow,      |
  |                      | deployment sequence, rollback)               |
  | Stale diagrams found | 1 (old §6, replaced)                         |
  | Unresolved decisions | 6 (auto-decided; owner to confirm, below)    |
  +====================================================================+
```

### Unresolved Decisions

No question went unanswered, because none was asked (see Review setup). These six auto-decisions change
product behaviour the owner hasn't seen, so they are listed for confirmation. The build proceeds on
them, and each is cheap to reverse before its layer ships.

1. **Bookings belong to the business's booking account** (CEO-1, design Decision 2). A team member's
   bookings never show in their personal LyniaGo app.
2. **Shops don't enter the go-live queue** until the Shops section ships (R2-7, Decision 15).
3. **Preferred riders: no rider consent in v1** (Decision 9). The business sees coarse statuses; an
   opt-out comes with the Phase 2 rider-app release.
4. **Prohibited goods go through report + ops cancel**, with no rider-app button in v1 (Decision 16).
5. **The API resolves `maps.app.goo.gl` links** against a strict allow-list (OV-6, Decision 3).
6. **Web PRs that add a new deviation wait for the owner's approval** of their screenshot sheet
   instead of merging on green (OV-11, Decision 19).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN | mode: HOLD_SCOPE, 0 critical gaps (3 found and fixed); 6 auto-decisions for owner confirmation |
| Outside Review | native Claude `Plan` subagent (codex not installed) | Independent 2nd opinion | 1 | unavailable (external) · native completed | 12 findings (native); 12 resolved (11 applied, 1 partly); 0 unresolved; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | not run |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (recommended before the L2 web build) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **OUTSIDE COVERAGE:** codex · plan-review · unavailable (CLI not installed); native fallback completed
  with 12 findings, recorded as `source: in-host`, `outside_status: unavailable`.
- **VERDICT:** no review is CLEAR yet. The CEO review's findings are all applied and it has 0 critical
  gaps, but 6 of its decisions await the owner, so its status is ISSUES OPEN. Eng review required.

**UNRESOLVED DECISIONS:**
- Owner to confirm CEO-1: bookings belong to each business's booking account, not the person who booked.
- Owner to confirm R2-7: shops stay out of the go-live queue until LyniaGo Shops ships.
- Owner to confirm Decision 9: no rider consent for preferred riders in v1 (opt-out in Phase 2).
- Owner to confirm Decision 16: prohibited goods via report + ops cancel, no rider-app button in v1.
- Owner to confirm OV-6: server-side resolution of `maps.app.goo.gl` links against a strict allow-list.
- Owner to confirm OV-11: web PRs adding a new deviation wait for owner approval instead of merge-on-green.
