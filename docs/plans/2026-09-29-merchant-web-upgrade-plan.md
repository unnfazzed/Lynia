# Merchant web upgrade: restaurants **and** shops, team logins, simpler UI

**Status:** DRAFT for `/plan-ceo-review` (2026-09-29) · branch `claude/merchant-web-platform-upgrade-oylm53`
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
- **Approach:** B, "Everything, layered". §5 is re-layered to L1 front door → L2 team → L3 Book a rider →
  L4 shop words + kit fixes.

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

## 4. Decisions proposed (for the CEO review to pressure-test)

**D1 · One business type per account, chosen once.** Sign-up asks one question: *What do you sell?*
**Restaurant** (cooked food) or **Shop** (things). A shop then picks its kind from the website's own
"We deliver for" list plus the owner's examples:
`Pharmacy · Grocery · Butchery · Fashion & shoes · Auto parts · Hardware · Electronics & phones · Other`.
The type is **fixed after sign-up** in the merchant app (no endpoint changes it). A wrong pick is a
support fix, not a self-serve toggle. That keeps the type honest for customers.

**D2 · Access comes from a team table, not from the JWT role.** New `merchant_members`: one row per
person per shop, `role: owner | staff`, keyed by **phone** so an owner can add someone who has never
used LyniaGo. The guard and the kitchen socket resolve "which shop is this person on" from that table.
Consequences, all intended:
- the RCA's **two sources of truth (C-1)** collapse to one;
- an upgrade takes effect **on the next request**, with no 15-minute stale-token window (C-2);
- `become` **stops flipping `Profile.role`**, so a customer who opens a shop keeps a working customer
  app (C-4);
- removing a staff member cuts them off **on their next tap** and drops their socket.

Existing owners are backfilled as `owner` rows in the migration. No existing login changes.

**D3 · Two roles, not a permissions matrix.** *(Office hours P3: approved.)*

| | Owner | Staff |
|---|---|---|
| Take orders: accept, reject, payment confirm, ready, pickup | ✅ | ✅ |
| Mark an item out of / back in stock | ✅ | ✅ |
| Busy mode | ✅ | ✅ |
| Book a rider (D9) | ✅ | ✅ |
| Add / edit / delete items, prices, categories | ✅ | ❌ |
| Hours, shop profile, location, cash rule | ✅ | ❌ |
| Statement / money | ✅ | ❌ |
| Team | ✅ | ❌ |

"The cashier can run a shift but cannot change a price or see the week's takings" is the whole model.
One owner per shop. Ownership transfer is a support action.

**D4 · Login is phone + WhatsApp code, and it works for a number LyniaGo has never seen.** The backend
already sends over WhatsApp (Bird Verify). Two changes:
- **Unblock new numbers.** The merchant web mints a stable per-browser device id and sends it as
  `x-device-id` on verify, the same contract the phone app honours, and the API adds `x-device-id` to
  its CORS allow-list. The L1 per-device signup cap (3 new accounts per device per day) then applies to
  the web exactly as it does to the app. It is not bypassed.
- **Say WhatsApp.** The sign-in gets the channel-aware copy D-40 gave the phone app: "We'll send a code
  to your WhatsApp", then "Enter the code we sent to your WhatsApp …". It is driven by the API's
  `deliveryChannel`, so a deployment on an SMS sender never lies.

**D5 · Self-serve sign-up in the merchant web, two screens.** After the WhatsApp code, a number with
no shop sees **"Set up your business"** instead of today's dead-end "contact support" card:
1. *What do you sell?* Two large cards, Restaurant / Shop. If Shop, a grid of kinds (icon + word).
2. *Business name* + *Where are you?* ("Use my location" plus a landmark riders look for).

It lands on the existing `/setup` checklist (M1·2 "First login · setup"). The same screen tells a
**staff** member what to do: "Working at a shop? Ask the owner to add 077… in Team." A removed staff
member therefore cannot mistake it for their old shop.

Go-live stays a LyniaGo decision (`pilotEnabled`). Self-serve sign-up makes a *dormant* shop. Ops
verifies it and switches it on. The setup checklist already says so. *(Office hours P1.)* **The switch
ships in the same layer as sign-up:** `PATCH /admin/merchants/:id/pilot`, admin-guarded and
audit-logged, plus a console button. That is the RCA's fix #1. Without it, a self-serve shop could only
go live through a database write.

**D6 · One vocabulary switch.** A single `vocabulary(businessType)` module owns every noun that
differs: Menu ↔ Products, dish ↔ item, kitchen ↔ shop, "What you cook" ↔ "What you sell", prep ↔
packing, starter categories per kind. No page hardcodes "dish" again.

**D7 · "Simplify the restaurant side" = finish the mocks first.** The RM mocks are *simpler* than the
app in four places the app never built. Those are parity work, not deviations:
- **Top bar**: the shop's own name, not the generic "Merchant", plus an *Open for orders / Closed* pill
  and "N live" (`r-parts.jsx:593`).
- **Help** in the nav, opening WhatsApp support (`r-parts.jsx:616`, the sixth item).
- **Out-of-stock sheet**: *Until I turn it back on · For the rest of today · For 1 hour*
  (`RM.oos_sheet`, `r-merchant.jsx:1153`). "Until I turn it back on" is exactly what a parts shop
  needs; a spare part does not come back at midnight.
- **Hours "Right now" card**: *Pause orders for 30 min* / *Close for today* (`RM.hours`). This needs a
  server-side pause that `placeOrder` and the customer list respect, so it is **Phase 2** (§5).

**D8 · Shops never appear as restaurants.** The customer restaurant API gets a `businessType =
restaurant` filter now, and `placeOrder` refuses a shop. Shop discovery in the customer app is a
separate, later surface (§5 Phase 3). Until it ships, a shop's **catalogue** waits dormant, but the
shop itself isn't idle: see D9.

**D9 · Book a rider: the shop's day-one product.** *(Office hours P2 "Both now", from the second
opinion.)* Every pain in the owner's status quo ("WhatsApp + informal couriers … price haggled, no
tracking or proof") is a courier pain, and the **Send rails already fix it**.
- `POST /orders` needs only a signed-in profile that isn't held; no customer-role gate (verified in
  `orders.service.ts`).
- Riders are broadcast, `quoteFare()` gives one price, status is live, and the 6-digit delivery code is
  the proof.

The merchant web gets a **Book a rider** screen for shops and restaurants alike:
1. **Pickup** is the business's saved location.
2. **Drop-off** comes from the buyer's WhatsApp location link, plus a landmark and the buyer's phone.
3. **Fare** is prefilled from `quoteFare()`.
4. The merchant picks a rider from the offers (name, rating, ETA).
5. **"Send the code to the buyer on WhatsApp"** passes on the delivery code.

It works the day a shop signs up, needs no customer app, and the Play listing isn't live. The booking is a
parcel order owned by the person who booked it.

---

## 5. Scope and phasing

**Phase 1 (approach B, "Everything, layered").** Each layer is usable without the next. All of it is
behind the existing `RESTAURANTS_ENABLED` kill switch.

*L1 — Front door*
- `x-device-id` goes on the CORS allow-list, and the merchant web sends a stable per-browser device id
  on verify. The sign-in copy names WhatsApp, driven by `deliveryChannel`.
- Migration `0053`:
  - `merchants.business_type` (NOT NULL DEFAULT `restaurant`, metadata-only on PG16);
  - `merchants.shop_kind` (nullable);
  - `merchant_members` (new table plus an owner backfill).
- `become` takes `{ name, businessType, shopKind?, location }`, creates the owner row, and **flips no
  role**.
- Sign-up flow in the web: What do you sell? → kind → name + location → `/setup`.
- **Admin go-live switch:** `PATCH /admin/merchants/:id/pilot`, audit-logged, plus a console button.
  The admin list shows the business type.
- Customer restaurant reads and `placeOrder` are scoped to `businessType = restaurant`.

*L2 — Team*
- `MerchantAccessService`, a DB-backed `MerchantGuard` and `@OwnerOnly()`. The lookup util, the
  tracking socket and `become` move to membership.
- Team API: `GET/POST /merchant/team` and `DELETE /merchant/team/:id`. Owner-only, at most 15 people,
  throttled, one business per phone.
- Team page (add by phone, remove, share the sign-in link on WhatsApp) and role-aware nav.

*L3 — Book a rider* (D9)
- A booking screen on the existing parcel API (`POST /orders`, offers, select), with drop-off from a
  WhatsApp location link.
- The delivery code is shared to the buyer on WhatsApp.
- A Today list of bookings.

*L4 — Shop words + kit fixes*
- A `vocabulary(businessType)` module, with starter categories per shop kind.
- OOS durations `today | hour | indefinite` and the three-option sheet.
- The top bar shows the shop's name. **Help** in the nav opens WhatsApp support.

**Phase 2: next.**
- Pause 30 min / Close for today (server `pausedUntil`, the customer list, `placeOrder`, a mobile OTA).
- A staff activity trail (who accepted which order).

**Phase 3: the shop customer surface.** Customer app Shops tab / tiles fed by `GET /shops?kind=`,
shop menus, shop search. Pharmacy prescription items stay out until MCAZ/PCZ sign-off (plan
2026-07-26 §6 P6). Pharmacies sell OTC and general health lines only.

**Explicitly not in scope:** variants/sizes (fashion lists "Sneakers · size 42" as its own item), stock
counts, barcodes, bulk CSV import, multi-branch owners, Shona/Ndebele copy, printing.

---

## 6. Architecture

```
        merchant web (phone or tablet)
                │  phone + WhatsApp code  (/auth/otp/*, unchanged)
                ▼
        JWT(sub = profileId, role = whatever the person already was)
                │
     every /merchant/* request
                ▼
  RestaurantsEnabledGuard ─▶ JwtAuthGuard ─▶ MerchantGuard ──────────────┐
                                               │ MerchantAccessService    │ 403 "Not on a
                                               │  1. member by profileId  │  business team"
                                               │  2. pending invite by    │
                                               │     phone → claim it     │
                                               │  3. legacy owner row →   │
                                               │     backfill             │
                                               ▼                          │
                                  req.merchantAccess {merchantId, role}   │
                                               │                          │
                              @OwnerOnly()? ───┴── role ≠ owner ─▶ 403 ───┘
                                               ▼
                                   services (resolveOwnMerchantId → member)
```

```
  SIGN-UP (new number)                         TEAM (owner adds a cashier)
  ────────────────────                         ───────────────────────────
  code ok → GET /merchant/me → 403             Team → "Add someone" → name + 077…
        → "Set up your business"               POST /merchant/team
        → Restaurant | Shop(+kind)               ├─ phone already on a team → 409
        → name + location                        ├─ team full (15) → 409
        → POST /merchant/become                  └─ row {phone, role: staff, profileId: null}
             tx: merchant + owner member       "Send them the link on WhatsApp" (wa.me, no cost)
        → /setup checklist                     cashier signs in with the WhatsApp code
                                               → guard claims the pending row → Orders
```

**Why keyed by phone, not by profile.** The cashier may never have opened LyniaGo, so there is no
profile to point at yet. Creating one on their behalf writes identity data for a person who hasn't
consented. A pending row that the guard claims on their first sign-in keeps `auth` untouched and makes
"add by phone number" true.

---

## 7. Data model: migration `0053_merchant_business_type_and_team`

```sql
CREATE TYPE "MerchantBusinessType" AS ENUM ('restaurant', 'shop');
CREATE TYPE "MerchantShopKind" AS ENUM ('pharmacy','grocery','butchery','fashion','auto_parts',
                                        'hardware','electronics','other');
CREATE TYPE "MerchantMemberRole" AS ENUM ('owner', 'staff');

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "business_type" "MerchantBusinessType"
  NOT NULL DEFAULT 'restaurant';                      -- PG11+: constant default = no rewrite
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "shop_kind" "MerchantShopKind";

CREATE TABLE "merchant_members" (
  id uuid PK, merchant_id uuid FK→merchants ON DELETE CASCADE,
  phone text NOT NULL UNIQUE,                 -- E.164; one business per phone
  profile_id uuid NULL UNIQUE FK→profiles,    -- null until the person first signs in
  display_name text NOT NULL, role "MerchantMemberRole" NOT NULL,
  added_by_profile_id uuid NULL, created_at, claimed_at NULL);
INSERT … SELECT owner rows FROM merchants JOIN profiles;   -- backfill, idempotent
```

Prisma enums mirror `packages/shared/src/enums.ts` (CONTRIBUTING lockstep rule). Out-of-stock
"until I turn it back on" is stored as `outOfStockUntil = 9999-12-31` (one named constant). One column
keeps meaning "unavailable until", and every existing reader (`isDishOutOfStock`, the customer menu,
`placeOrder`) is correct unchanged.

---

## 8. Failure modes and rescue

| Codepath | Failure | Handling | Merchant sees |
|---|---|---|---|
| Sign-up submit | double tap | ref latch client-side; unique `merchant_members.phone` server-side → 409 `already_member` | lands in their shop |
| Sign-up | number is a pending staff invite | guard claims the invite first, so `/merchant/me` succeeds and sign-up never shows | their employer's shop |
| Team add | phone already on another shop | 409 `member_elsewhere` | "That number already works at another business on LyniaGo." |
| Team add | owner adds own number / duplicate | 409 `already_member` | "Already on your team." |
| Team remove | owner removes self | 400 `owner_cannot_leave` | button not drawn for the owner row |
| Staff removed mid-shift | next request 403 | web routes 403 on a *signed-in member* to "You're no longer on {shop}'s team" + sign out; socket evicted | plain message |
| Staff calls an owner route | `@OwnerOnly` 403 | nav hides owner sections; direct URL shows "Only the owner can change this" | no dead button |
| Legacy owner, no member row | race with an old pod's `become` | access service backfills the owner row on first request | nothing |
| Location | geolocation denied / desktop | landmark is still required; "Use my location" is optional, and a shop without a point stays un-orderable (existing 409) with a setup-checklist item | a to-do, not an error |

---

## 9. Tests (all run in `pnpm test`, no DB needed except where noted)

- `merchant-access.service.spec.ts`: member hit; pending-invite claim; legacy owner backfill; no row
  → null; claim race (P2002) re-reads.
- `merchant.guard.spec.ts` (rewritten): DB-backed allow/deny; `@OwnerOnly` staff → 403.
- `merchant-team.service.spec.ts`: add (normalises phone, 409s ×3, cap), list (owner first), remove
  (staff ok, owner refused, other shop's row 404), socket eviction called.
- `merchant.service.spec.ts`: `become` creates merchant + owner member in one tx, **does not touch
  `profile.role`**, validates shopKind ⇔ shop; OOS durations.
- Customer read scope: `listRestaurants` / `getRestaurantMenu` / `placeOrder` exclude shops.
- `migration-safety.spec.ts` passes on `0053` (new table only indexed in-file; no non-concurrent index
  on an existing table).
- Merchant web (vitest + RTL): sign-up flow (type → kind → name → submit), staff hint, Team page
  (add/remove/share), vocabulary per type, nav hides owner items for staff, OOS three options, login
  copy follows `deliveryChannel`.

---

## 10. Design authority and ledger

No RM mock draws sign-up, business type, shops, Team or roles. Per `CLAUDE.md`, these are built in the
RM visual language from existing primitives (cards, pill buttons, sheets, the kit's option-row pattern
from `RM.oos_sheet`) at 1024×680 **and** the D-32 phone tier, and each is ledgered in
`docs/DESIGN-DEVIATIONS.md` as an owner-approved, undrawn capability (D-43 onward) with an upstream ask
for real mocks. `packages/design/**` is not edited. The four D7 items are **alignment to existing
mocks**, not deviations.

---

## GSTACK REVIEW REPORT

*(filled by `/plan-ceo-review`)*
