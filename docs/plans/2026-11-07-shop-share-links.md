# Shop share links

**Status:** plan, shaped with the owner on 2026-11-07. Not built. **Next step:** gstack plan reviews (design + eng),
then a design handoff (§6). Nothing in §7 is built until that handoff lands and its ledger entry is approved.

**Applies to:** restaurants, shops and pharmacies (every `Merchant` row, one link per branch), the merchant app, the
customer app (Android, the customer web app, and the iPhone app once it is in the App Store) and lyniago.com.

---

## 1. In one line

A restaurant, shop or pharmacy shares a link to its shop. Customers can share the same link with each other. Whoever
taps it downloads LyniaGo, signs up, lands on **that shop**, and buys through the checkout that already exists.

## 2. Why

- **Merchants already market on WhatsApp.** A link turns their status posts and groups into LyniaGo installs and
  orders, instead of "order on WhatsApp and I'll send someone".
- **Customers recommend places to each other.** Today there is no way to send a friend a shop.
- **New shops start with no ratings and no history.** A link lets them bring their own customers.
- **It can be measured:** shared, opened, installed, signed up, ordered, per shop.

## 3. Owner decisions (2026-11-07)

| # | Decision |
|---|---|
| O1 | **Sign-in comes first.** Nobody sees a shop through a link before they sign in or sign up. No public shop page, no public menu API. |
| O2 | **Customers can share too**, not only merchants. Same link. |
| O3 | **The goal is a purchase through the existing checkout** ("booking" = a normal order, including a scheduled one). No table reservations, no new checkout. |
| O4 | **The link leads to the app: download, then sign up**, on Android and on iPhone. |
| O6 | **Links carry the shop's name in front of the code** (owner, 2026-11-08): `lyniago.com/s/chicken-inn-avondale-7KQ2MX`. Only the 6-character code picks the shop; the name part is for people. A bare code, an old name after a rename, or a made-up name (`/s/kfc-7KQ2MX`) all open the shop that owns the code and redirect to its current link. Built in `packages/shared/src/shop-link.ts` (`shopSlug`, `shopLink`, `parseShopLink`, `isCanonicalShopLink`, the `shop_share` install referrer), with tests. |
| O5 | **iPhone before the App Store release: the customer web app** at `app.lyniago.com` (decided 2026-11-08 in the design review, DR12). |

## 4. The flow

```
lyniago.com/s/<name>-<CODE>   e.g. /s/chicken-inn-avondale-7KQ2MX (O6; one code per Merchant row)
        │
        ├── Android, no app ──► Play (code in the install referrer) ──► install ──► splash ──► sign up
        │                                                                                      │
        ├── Android, app installed ──► Play "Open" today; App Links later (§7 L6) ─────────────┤
        │                                                                                      │
        ├── iPhone, App Store app exists ──► landing page (shop card) ──► App Store ──► install ──► sign up
        │        then back to the landing page ──► "Open in app" (Universal Link) ─────────────┤
        │                                                                                      │
        ├── iPhone today (O5 a) ──► app.lyniago.com/s/<CODE> ──► sign in / sign up ────────────┤
        │                                                                                      │
        └── Desktop ──► landing page with a QR code to the same link                           │
                                                                                               ▼
                                    the shared shop (Browse v2 store page for its service)
                                                                                               │
                                                                                               ▼
                                    existing cart ──► Review & place ──► order (or "Schedule for …")
```

**Why iPhone needs a landing page:** Play passes data to a fresh install (the install referrer, already used by
biker referrals, `src/auth/install-referral.ts`). The App Store passes nothing. So on iPhone the person comes back to
the page they left and taps *Open in app*, which a Universal Link opens straight on the shop. Clipboard hand-off and
device fingerprinting are rejected: one shows an iOS paste banner, the other breaks Apple's privacy rules.

## 5. Special cases

| Case | What the customer sees |
|---|---|
| Unknown or mistyped code | Home, with a toast that the shop wasn't found (copy from the handoff) |
| Shop not live (`pilotEnabled` false, `applicationStatus` ≠ live, suspended) | Same as unknown: never reveal a shop that isn't live |
| Shop closed now / closed by hand | The normal store page: closed strip, prices, "Schedule for …" where slots exist |
| Service switched off (`SHOPS_ENABLED`, `PHARMACY_ENABLED`, `RESTAURANTS_ENABLED`, order switches) | The normal browse-only page. Shops and pharmacies are live in production (owner, 2026-11-08) |
| Customer outside the delivery area | The store page's existing out-of-range handling. The design pass decides whether that's enough |
| A cart from another shop | The existing "Start a new cart?" sheet (I3) |
| A rider account taps the link | The rider app has no customer browse: open the store only on the customer side, otherwise the rider board with a toast |
| The merchant's own staff tap it | It opens like for any customer |
| Several branches | Each branch has its own code and link |

## 6. Screens that need a design (handoff first)

No share affordance is drawn in browse-v2, shop-front-v1 or merchant-v2. Under "not drawn ⇒ not rendered" this needs
a handoff and a ledger entry (D-1xx) before any UI is built.

| # | Screen / state | Side |
|---|---|---|
| D1 | "Share your shop" row on the Shop front tab, shown only while the shop is live (DR1, DR6) | Merchant |
| D2 | Share sheet: preview, Share on WhatsApp, Copy link, QR for the counter, link text; copied confirmation; branch name in the preview (DR2) | Merchant |
| D3 | Share button beside Search on the cover, tint band and compact bar, all three services → the system share sheet (DR3) | Customer |
| D4 | "Taking you to (logo) <Shop>" chip on phone, code, profile and permission screens; onboarding skipped (DR11); web variant (DR12) | Customer |
| D5 | Arrival: skeleton (DR7), no-address and out-of-area states (DR8), busy-user rules (DR9), biker sheet (DR13). Back from a cold start goes to Home | Customer |
| D6 | Not found / not live / paused: full-screen `EmptyState` with "Browse <service>" (DR5); offline retry (DR7) | Customer |
| D7 | lyniago.com/s/<CODE>, shop-first (DR14), four states: Android with Play (auto-continue), Android without Play, iPhone, desktop QR (DR4) | Website |
| D8 | WhatsApp preview card with the tint+initial fallback and a generic card for dead codes (DR10) | Website |
| D9 | Copy for all of the above, in the handoff's `copy.ts` | All |

### 6.1 Design review decisions (plan-design-review, owner, 2026-11-07/08)

**Pass 1 — information architecture**

| # | Decision |
|---|---|
| DR1 | **D1 lives on the Shop front tab only** — a "Share your shop" row at the top of Shop front, beside the cover and logo the merchant already edits. Not on the mint top card (it's full and shows on every tab). |
| DR2 | **D2 share sheet, top to bottom:** (1) a preview of what customers will see (cover, logo, name), (2) **Share on WhatsApp** — the primary button, using WhatsApp's chat/Status picker (`wa.me/?text=`), not one number like the bikers invite, (3) Copy link, (4) QR for the counter, (5) the link as text. |
| DR3 | **D3 customer share button:** a third 44px round button beside Search, on the cover (and the no-cover tint band) and in the scrolled compact bar, on restaurants, shops **and** pharmacies. Order: Back left; Search, Share right. |
| DR4 | **Every visitor passes through the D7 landing page** (Android too). Phones with Play move on to Play by themselves; phones without Play (Huawei and similar) get "Order on the web" → the web app. D7 has four states: Android with Play (auto-continue), Android without Play, iPhone, desktop (QR). |

```
D2 merchant share sheet           D3 customer store header          D7 lyniago.com/s/<CODE>
┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│ ▔▔ Share your shop       │      │ (‹)          (🔍) (⇪)    │      │  LyniaGo                 │
│ ┌──────────────────────┐ │      │      cover photo         │      │ ┌──────────────────────┐ │
│ │ cover · (logo) Name  │ │      │ (logo) Name · open line  │      │ │ cover · (logo) Name  │ │
│ └──────────────────────┘ │      │ info strip               │      │ └──────────────────────┘ │
│ [  Share on WhatsApp   ] │      │ tabs …                   │      │ [ primary: per state ]   │
│ [ Copy link ] [ QR ]     │      └──────────────────────────┘      │ secondary: per state     │
│ …/s/chicken-inn-…-7KQ2MX │                                        └──────────────────────────┘
└──────────────────────────┘
```

**Pass 2 — states**

| # | Decision |
|---|---|
| DR5 | **D6 is a full-screen empty state, not a toast.** The shared `EmptyState` (D-78): mark, "This shop isn't on LyniaGo right now"-style title, one line, one pill "Browse <service>". Used for unknown, not-live and paused codes alike (never reveal which). Copy from the handoff. |
| DR6 | **The merchant's "Share your shop" row is hidden until the shop is live** (approved and not paused/suspended). No disabled sheet. When a live shop is paused later, the row disappears; links already shared show DR5. |
| DR7 | **Loading:** arrival shows the store page's existing skeleton at once while the code resolves. No network or no answer after ~10 s → the standard "Can't reach LyniaGo" `EmptyState` with Try again; the pending code is kept, so a retry still lands on the shop. |
| DR8 | **D5 arrival draws two address states** (likely the first view for many link visitors): (a) **no delivery address** → a "Set where to deliver" line in place of the time and fee cells, opening the address picker; (b) **outside the delivery area** → a strip "<Shop> doesn't deliver to <area> yet", prices and photos visible, + buttons off. |
| DR9 | **A busy customer:** a link never interrupts. With a cart at another shop, the existing "Start a new cart?" sheet (I3) handles it when they add, naming both shops. A link opened over a live-order screen opens the shop on top; Back returns to the order. |
| DR10 | **D8 preview card never looks broken:** a shop with no cover or logo gets a card built from its service tint and its initial (browse-v2's no-photo fallback). An unknown or not-live code gets a generic LyniaGo card that names no shop. |

**Pass 3 — journey**

| # | Decision |
|---|---|
| DR11 | **Shortest path to the shop.** A visitor who arrived by a shop link **skips the C1–C5 onboarding** and goes straight to phone sign-in. A small chip, "Taking you to (logo) <Shop>", sits on the phone, code, profile and permission screens (D4 grows from one screen to this chip on each). Showing the name before sign-in uses the same narrow public lookup as the preview card (§8 R1: name and logo of a live shop only); if that lookup fails, the chip reads "Taking you to the shop" with no name. |
| DR12 | **O5 decided: iPhone uses the web app until the App Store release.** `app.lyniago.com/s/<CODE>` behaves like Android: skips onboarding, shows the DR11 chip, lands on the shop. The Add to Home Screen tip (D-108) is **held until after the first order from a link**, because a Home Screen launch starts with fresh storage and would forget the shop mid-sign-up. |

```
Storyboard — a stranger on Android, link in a WhatsApp group
STEP | USER DOES                         | USER FEELS                 | PLAN SPECIFIES
-----|-----------------------------------|----------------------------|-------------------------------
1    | Sees the preview card in WhatsApp | Curious: "that place!"     | D8 + DR10 (never a broken card)
2    | Taps → lyniago.com/s/… → Play     | Mild friction: an install  | D7 + DR4 (no-Play fallback)
3    | Opens app → phone sign-in         | "Why am I signing up?"     | DR11 chip names the shop; no intro
4    | Code, profile, permissions        | Patience running out       | DR11 chip on each screen
5    | Lands on the shop                 | Relief: it's the right one | D5 + DR7 skeleton, DR8 address states
6    | Adds, Review & place              | Confident                  | existing checkout (O3), DR9
7    | Order placed                      | Done; may share it on      | D3 share button (DR3)
```

5-second test: the preview card and the chip carry the shop's face, so the person always knows where they're headed. 5 minutes: the order goes through the checkout they'd use anyway. Long run: the shop becomes the reason they kept the app, and the share button turns them into the next sharer.

| # | Decision |
|---|---|
| DR13 | **A biker who taps a shop link** gets a small sheet: "This is a shop link. Open as a customer?" with [Open as customer] [Stay on jobs]. Open switches to the customer side through the app's existing role switch (eng review: confirm the switch path, `rolePref`) and opens the shop. Nothing switches without the tap. |

**Pass 4 — look**

| # | Decision |
|---|---|
| DR14 | **D7 is shop-first, in lyniago.com's visual language.** One composition: the shop's own cover and logo as the hero, its name, one line, one primary button for the visitor's device (DR4 states), a quiet secondary. No feature boxes, no store-badge rows, no marketing copy. The website's handed-off `site/` stays untouched (D-42); D7 is a new Worker-rendered path like `/r/` and `/j/`. |

**Pass 5 — design system:** no new decision needed. The mobile `Icon` set has `share`; the merchant sheet reuses the Own bikers "Share on WhatsApp" styling; every value comes from `packages/design/tokens`. The DR11 chip, the QR card and D7 are drawn in the handoff from existing primitives. Eng note: no QR library exists in the repo yet.

**Pass 6 — small phones and accessibility**

| # | Decision |
|---|---|
| DR15 | Every new screen and state is drawn and checked at **360×720 and 320×640** (D7 also at desktop). The share button's label is "Share <shop name>"; the DR11 chip is announced once; the QR always has the link as text beside it; targets ≥ `var(--target-min)`, primary 52, sizes from tokens only; shop names wrap to two lines, then ellipsis (test with a 40+ character name). |

**Pass 7 — open decisions**

| # | Decision |
|---|---|
| DR16 | **A narrow public exception to O1:** the name, logo and cover of a **live** shop can be read without sign-in, for the preview card (D8) and the DR11 chip. Menu, prices, hours and everything else stay behind sign-in. |

Still open, not design: whether to record who shared (§9 Q4). (§9 Q3 answered: shops and pharmacies are live.)

The website landing (D7, D8) is a new path in `apps/website`, not a change to the handed-off `site/`, so the
"ship the handoff as-is" rule is not touched (same as `/r/` and `/j/`).

## 7. Build plan (after the handoff)

| Lane | Work | Ships by |
|---|---|---|
| L1 | **Share code.** `Merchant.shareCode`: 6 characters from the referral alphabet, unique, random. The link is `shopLink(name, shareCode)` from `@lynia/shared` (O6): the name part is built from the shop's current name, never stored, so a rename needs no migration and nobody can claim "KFC" (the code, not the name, picks the shop). Migration + backfill. Shown to the merchant and in admin. | API deploy |
| L2 | **Resolve API.** `GET /share/:code` behind `JwtAuthGuard` → `{ merchantId, service: restaurants | shops | pharmacy }`, or 404 for unknown / not live (same answer, so not-live shops can't be enumerated). Rate-limited. | API deploy |
| L3 | **Website `/s/<name>-<CODE>`.** The Worker reads the code with the same rule as `parseShopLink` (code = after the last dash; the Worker can't import `@lynia/shared`, so it keeps a copy pinned by shared test cases) and **301s to the canonical link** when the name part doesn't match the shop's current name (`isCanonicalShopLink`). Android → Play with `utm_medium=shop_share&utm_content=<CODE>`. iPhone → the landing page (D7), whose *Get the app* goes to the App Store or, before that (O5), to `app.lyniago.com/s/<CODE>`. Desktop → landing with QR. OG tags and image (D8) need the shop's name, logo and cover: a small **public** endpoint that returns only those three for a live shop (see §8 R1). | Website deploy |
| L4 | **Pending destination in the app.** A `/s/[code]` route plus a stored "pending share code" that survives install, onboarding, sign-up, profile setup and the permission asks, then opens the store once the session exists. Sources: the deep link (when signed in it resolves at once), the Play install referrer (`utm_medium=shop_share`, read beside the referral code, never mixed up with it), and the web URL. Cleared once used or on 404. `/s/[code]` is added to the signed-out routes so the boot route watch doesn't throw it away. | OTA |
| L5 | **Customer share icon** (D3) on the three store pages: `Share.share` with the link and a line of copy. | OTA |
| L6 | **Android App Links**: intent filter for `lyniago.com/s/*` (and `/j/*`, closing the TODOS item) + `/.well-known/assetlinks.json`. | Next production store build |
| L7 | **Merchant share sheet** (D1, D2), modelled on `FleetInviteSheet`. | Merchant web deploy |
| L8 | **Attribution.** `Order.shareCode` (nullable) set at Review & place when the cart came from a link. PostHog events `shop_link_shared` / `shop_link_opened` / `shop_link_ordered`, capped and free-tier safe. The merchant's Money or Shop front can later show "orders from your link". | API + OTA |
| L9 | **iOS Universal Links**: `apple-app-site-association` + `associatedDomains`, shipped with the first iOS build (which already has to add the iOS config). | First iOS build |
| L10 | Tests, parity sheets, screen inventory, `docs/DESIGN-DEVIATIONS.md` ledger entry, `docs/KNOWN_BUGS.md` if anything is found. | — |

Order: L1–L5, L7, L8 ship with no store build. L6 rides the next Android production build; L9 the first iOS build.

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The WhatsApp preview needs a shop's name and pictures without sign-in, which O1 otherwise forbids | Only name, logo, cover of a **live** shop, nothing else (no menu, no prices, no hours). **Owner approved 2026-11-08** (design review #16). Also feeds the DR11 chip |
| R2 | Sign-up first loses some visitors at the OTP screen | Preview card + "Sign in to see <shop>" (D4). Measure the drop in PostHog |
| R3 | The pending shop gets lost somewhere in onboarding → the person lands on Home | One stored value, cleared only when used; a test per path in §4 |
| R4 | Shop codes mixed up with biker referral or fleet invite codes → wrong wallet bonus | Separate `utm_medium` and separate parser; a test that each parser rejects the other two |
| R5 | Links travel outside the delivery area or outlive the shop | §5 states; not-live answers like unknown |
| R6 | Code enumeration / scraping | Random codes, signed-in resolve, rate limits, identical 404 for unknown and not-live |
| R7 | PostHog volume | Three events, sampled if needed, well inside the free plan |
| R8 | iPhone depends on the App Store release, which waits on the Apple enrollment (founder) | O5 fallback until then |

## 9. Open questions

1. ~~O5~~ decided: web app (DR12).
2. ~~R1~~ decided: name, logo and cover of a live shop are public; nothing else (DR16).
3. ~~Production values of the shop and pharmacy switches~~ answered: shops and pharmacies are live (owner, 2026-11-08).
4. Should "who shared it" (a customer id on the link) be tracked now, for a future customer referral reward? The plan
   leaves it out: a plain shop link can gain it later without breaking old links.

## 10. Design review outputs (2026-11-08)

### NOT in scope
- **Table reservations:** O3, a purchase is a normal order.
- **A public read-only shop page:** O1; only DR16's name, logo and cover are public.
- **Rewards for the sharer:** §9 Q4; a plain link can gain a `by=` later without breaking old links.
- **gstack mockups:** the designer had no OpenAI key. The handoff draws the real screens anyway.

### What already exists (reuse, don't redraw)
- `FleetInviteSheet.tsx`: sheet structure, Share on WhatsApp styling, copy toast, net/fail states.
- Browse v2 store header: `StoreCover` discs, `CompactBar`, store skeleton, `BrowseToast`, I3 "Start a new cart?".
- `EmptyState` / `emptyCopy` (D-78) for DR5 and DR7.
- Install referrer read (`src/auth/install-referral.ts`) and the `/r/`, `/j/` Worker paths.
- `Icon` `share` in the mobile app; `og-image/` render script on the website.
- `TODOS.md` "Open Own bikers invite links straight in the app": absorbed by L6.

### TODOS.md updates
None proposed. Every approved fix is in-scope work below.

### Implementation tasks (from this review; after the handoff lands)
- [ ] **T1 (P1, human ~1d / CC ~1h)** Handoff brief: D1–D9 with DR1–DR16, the four D7 states, the storyboard. Files: new `packages/design/handoff/shop-share-v1/` (from the design tool) + ledger entry in `docs/DESIGN-DEVIATIONS.md`.
- [ ] **T2 (P1, human ~2d / CC ~1h)** Pending-shop flow: onboarding skip and the chip on phone, verify, profile, permissions (DR11), web variant + hold the install tip (DR12). Files: `app/phone.tsx`, `app/verify.tsx`, `app/onboarding.tsx`, `app/setup-permissions.tsx`, `src/logic/boot-route.ts`, `src/ui/install/*`. Verify: a test per §4 path.
- [ ] **T3 (P1, human ~1d / CC ~45m)** Arrival states: skeleton + retry (DR7), no-address / out-of-area (DR8), D6 EmptyState (DR5), biker sheet (DR13). Files: `src/ui/browse/store.tsx`, `ShopStoreScreen.tsx`, `app/food/[id].tsx`, new `app/s/[code].tsx`.
- [ ] **T4 (P1, human ~1d / CC ~45m)** D7 landing (DR4, DR14) + D8 cards (DR10) + public name/logo/cover lookup (DR16). Files: `apps/website/worker.js`, new `apps/website/shop.js`, `og-image/`, API public endpoint.
- [ ] **T5 (P2, human ~4h / CC ~20m)** Customer share button (DR3) and merchant row + sheet (DR1, DR2, DR6). Files: `src/ui/browse/store.tsx`, `kit.tsx`, `apps/merchant/app/(app)/shop/page.tsx`, new `ShopShareSheet.tsx`.
- [ ] **T6 (P2, human ~2h / CC ~15m)** 320/360 parity sheets and a11y labels (DR15). Files: `tools/parity/*`, screen inventory.

## 11. Engineering review (plan-eng-review, 2026-11-08)

**Scope record:** feature answers: none proposed (no cuts); structure: Smaller arrangement (D2, owner 2026-11-08); accepted scope: all of §7 with (a) one API `share.controller.ts` + `share.service.ts` in `apps/api/src/merchant` serving both the signed-in resolve and the public card, (b) one `src/logic/pending-shop.ts` used by boot, the sign-in screens and `app/s/[code].tsx` on native and web, (c) `src/auth/install-referral.ts` extended to return `{ referralCode, shopCode }` (one Play referrer read, two strictly separate parsers), (d) one `apps/website/shop.js` beside `invite.js`; pending remedies: E1, E2, E3.

**Scope Challenge result:** scope accepted as-is.

**Evidence checked (static read, 2026-11-08):** `app.config.ts:133` scheme `lynia`; `src/logic/native-intent.ts` passes every path but the KYC return; `src/logic/boot-route.ts:70` `SIGNED_OUT_ROUTES` (an unlisted signed-out path is bounced to boot, so `/s/[code]` must be listed); `src/auth/install-referral.ts` reads Play's referrer once per launch, Android only; `apps/customer-web/wrangler.jsonc` SPA fallback (so `app.lyniago.com/s/<CODE>` needs no hosting change); `apps/api/src/merchant/merchant.service.ts:115-124` photos are private GCS keys served by 24 h signed URLs; `apps/api/src/app.module.ts:103` global `ThrottleGuard` + `@Throttle`; `src/logic/switch-to-customer.ts` exists (DR13); `origin/main` since 2026-11-06 has no share-link work.

## Decision ledger

### E1: Android users who already have the app
Finding: [P1] (confidence 8/10) §4 "Android, app installed ──► Play "Open" today" — reviewer: plan-eng-review. Play's install referrer exists only for a fresh install; "Open" on the Play page launches the app with nothing, so an existing customer lands on Home and the shop is lost until the L6 store build.
Plan baseline: installed-app Android users go via Play "Open" until App Links ship with the next production build (L6).
Runtime evidence: `app.config.ts:133` registers `lynia://`; `native-intent.ts` passes `lynia://s/<CODE>` through to expo-router unchanged. Chrome's `intent://` URL with `S.browser_fallback_url` is documented Android behaviour [Layer 1]; other Android browsers: unknown.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| E1 installed-app hand-off | Play "Open", shop lost | D7 opens `intent://s/<CODE>#Intent;scheme=lynia;package=zw.co.lynia;S.browser_fallback_url=<Play URL with shop referrer>;end`: app installed → opens on the shop; not installed → Play with the code (OTA + website only) | keep Play "Open" until L6 |
| L6 App Links | next production build | unchanged, still planned | unchanged |
Question D3: Installed-app Android users lose the shop until a store build; open the app directly from the landing page via its lynia:// address (Recommendation A).
Header: Installed app
Options:
A) Open app from landing (recommended)
The landing page asks Chrome to open lynia://s/CODE; if the app isn't installed Chrome falls back to Play with the code. Works today with no store build. (human ~2h / CC ~15m)
B) Wait for App Links
Keep Play "Open"; existing customers land on Home without the shop until the next production build.

State: approved
Actual answer: A) Open app from landing (owner, D3, 2026-11-08)
Accepted scope: D7's Android path opens `intent://s/<CODE>#Intent;scheme=lynia;package=zw.co.lynia;S.browser_fallback_url=<Play URL with the shop referrer>;end`; the app handles `lynia://s/<CODE>` through `app/s/[code].tsx`. "Order on the web" stays visible on D7 as the no-Play way out (DR4). L6 App Links still ship with the next production build. Tests: `shop.js` builds the intent URL with an encoded fallback; a `lynia://s/<CODE>` launch opens the store (signed in) or stores the pending code (signed out).
History: none

### E2: The preview card's pictures
Finding: [P1] (confidence 9/10) DR10/DR16 + §7 L3 (OG image from the shop's cover/logo) — reviewer: plan-eng-review. Shop photos are private GCS keys served only by 24 h signed URLs (`merchant.service.ts:115-124`, bucket `public_access_prevention = "enforced"`). An `og:image` pointing at a signed URL breaks once it expires, and crawlers that re-fetch later get an error.
Plan baseline: "OG tags and image (D8) need the shop's name, logo and cover: a small public endpoint that returns only those three".
Runtime evidence: signed-URL TTL 24 h, cached 14 h (`PHOTO_READ_URL_TTL_SECONDS`); thumbnails exist (`coverThumbKey`, `logoThumbKey`).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| E2 og:image URL | signed URL, expires | stable `lyniago.com/s/<CODE>/card.jpg`: the Worker asks the public card endpoint for a fresh signed **thumbnail** URL and streams the bytes, edge-cached 1 day; DR10 fallback when no photo | make the bucket's shop photos public |
Question D4: The preview card's picture link would expire after a day; serve it through a stable lyniago.com address (Recommendation A).
Header: Preview image
Options:
A) Stable proxy URL (recommended)
lyniago.com/s/CODE/card.jpg fetches a fresh signed thumbnail and streams it, cached a day at the edge; the bucket stays private. (human ~3h / CC ~20m)
B) Make shop photos public
Change storage so shop photos have permanent public links; simpler URLs, but reverses the enforced private-bucket rule (infra/terraform/storage.tf) for every shop photo.

State: approved
Actual answer: A) Stable proxy URL (owner, D4, 2026-11-08)
Accepted scope: `og:image` is `https://lyniago.com/s/<CODE>/card.jpg`. The Worker calls the public card endpoint, which returns name + fresh signed thumbnail URLs (cover/logo) for a live shop only; the Worker streams the image with `cache-control: public, max-age=86400`, and serves the DR10 tint+initial or generic card when there's no photo or the code is dead. The bucket stays private. Tests: Worker returns an image for live / no-photo / dead codes and never names a dead code's shop; card endpoint returns exactly `{ name, logo, cover }` for live shops and 404 otherwise.
History: none

### E3: How long a pending shop is remembered
Finding: [P2] (confidence 7/10) §7 L4 "Cleared once used or on 404" — reviewer: plan-eng-review. A code stored at install that's never used (person abandons sign-up, comes back weeks later, or signs out and someone else signs in on the same phone) would open a shop out of nowhere.
Plan baseline: cleared when used or on 404; no expiry; sign-out not mentioned.
Runtime evidence: device state is cleared on sign-out by `clearDeviceState` (`src/auth/session.ts` header comment); a new key must be added to it to be included. Unknown: whether the Play referrer is re-read after sign-out (it's read once per launch and never changes for an install, so a later sign-in on the same install would re-read the same code).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| E3 pending-shop lifetime | until used or 404 | expires 7 days after it was saved; cleared on sign-out; a Play-referrer code is used **once per install** (marked consumed, never re-applied) | until used or 404 (as planned) |
Question D5: A remembered shop could pop up weeks later or for another person on the same phone; expire it after 7 days, clear it on sign-out, and use the install's code only once (Recommendation A).
Header: Pending shop
Options:
A) 7 days, once, sign-out clears (recommended)
The shop is remembered for 7 days, forgotten on sign-out, and a Play install's code is only ever used once. (human ~1h / CC ~10m)
B) Keep as planned
Remembered until used; may surprise someone who comes back much later or signs in after another person.

State: approved
Actual answer: A) 7 days, once, sign-out clears (owner, D5, 2026-11-08)
Accepted scope: `pending-shop.ts` stores `{ code, savedAt, source }`; ignored and deleted when older than 7 days; its key is added to `clearDeviceState` (sign-out clears it); a Play-referrer code is marked consumed per install and never re-applied. Tests: expiry boundary (6d23h kept, 7d dropped), sign-out clears, a consumed referrer code is not re-applied on the next sign-in.
History: none

### E4: Regression contract for sign-in and boot (IRON RULE)
Finding: [P1] (confidence 9/10) DR11 (skip C1–C5 when a link is waiting) + §7 L4 (pending shop through onboarding, sign-in, profile, permissions) — reviewer: plan-eng-review. The change edits `boot-route.ts` (`bootDestination`, `SIGNED_OUT_ROUTES`), `verify.tsx` (`afterSignIn(riderEntry(signedInDestination(...)))`), onboarding and the permission screens: the path every user takes. A mistake here breaks sign-in for everyone, not just link visitors.
Plan baseline: L10 "Tests"; no regression contract named.
Runtime evidence: existing tests cover the boot/sign-in logic (`src/logic/__tests__/`, `app/__tests__/`); exact coverage of `bootDestination` × `signedInDestination` combinations: unknown until implementation.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| E4 how to protect existing sign-in | none named | table tests over `bootDestination`/`signedInDestination`/`afterSignIn` asserting **today's destinations unchanged when no shop is pending** (customer, rider, needsProfile, onboardingSeen on/off, push cold-start), plus rows for each pending-shop path; one Playwright web run: link → sign-in → shop | the table tests only, no web run |
Question D6: The change touches the sign-in path everyone uses; lock today's behavior in table tests plus one end-to-end web run (Recommendation A).
Header: Sign-in safety
Options:
A) Table tests + one web E2E (recommended)
Every existing sign-in/boot destination asserted unchanged with no shop pending, every new path asserted, and one browser run link → sign-in → shop on the web app. (human ~1d / CC ~30m)
B) Table tests only
Same unit tables, no end-to-end run; cheaper, but nothing proves the screens hand the shop along in a real app.

State: approved
Actual answer: A) Table tests + one web E2E (owner, D6, 2026-11-08)
Accepted scope: table tests over `bootDestination` / `signedInDestination` / `afterSignIn` asserting today's destinations unchanged with no shop pending (customer, rider, needsProfile, onboardingSeen on/off, push cold-start), plus a row per pending-shop path in §4; one Playwright run on the customer web build: `/s/<CODE>` → sign-in → the shop.
History: none

Approval readiness: PASS — E1 (D3), E2 (D4), E3 (D5), E4 (D6), structure (D2); every accepted remedy cites its own answer.

### 11.1 Architecture

```
            WhatsApp / QR
                 │  lyniago.com/s/<CODE>
                 ▼
   ┌────────── website Worker: shop.js ───────────┐      GET /share/<CODE>/card (public, throttled,
   │ HTML D7 (shop-first) + og tags               │◄────  live shops only → name + signed thumbs)
   │ /s/<CODE>/card.jpg (E2, edge-cached 1 day)   │                 api: share.controller/service
   └──────┬───────────────┬──────────────┬────────┘
   Android│        iPhone │       desktop│ QR
          ▼               ▼              ▼
 intent://s/CODE      app.lyniago.com/s/CODE   (same link)
 scheme=lynia (E1)        │
   │ installed  │ not     │
   ▼            ▼         ▼
 app/s/[code]  Play ──► first launch: install-referral.ts → { referralCode, shopCode }
   │                      │
   └──────► pending-shop.ts { code, savedAt, source }  (7 d, once, cleared on sign-out: E3)
                 │
   signed out ───┼──► phone → verify → profile → permissions   (chip DR11; C1–C5 skipped)
                 ▼
   GET /share/<CODE> (JwtAuthGuard, throttled) → { merchantId, service } | 404
                 ▼
   store page (food | shops | pharmacy) → cart (carries shareCode) → Review & place → Order.shareCode
```

Findings (all resolved above): E1 installed-app hand-off [P1], E2 preview image [P1]. Notes that need no decision (mechanics of approved behaviour):
- **Security:** the signed-in resolve and the public card return the same 404 for unknown, not-live and paused codes (R6). The public card returns exactly name + two signed thumbnail URLs; both routes carry `@Throttle` under the global `ThrottleGuard` (`app.module.ts:103`).
- **Failure per new path:** Worker can't reach the API → D7 renders the generic card and still routes the visitor (never a 5xx page). Resolve times out → DR7 retry screen, code kept. Play referrer slow → `INSTALL_REFERRER_TIMEOUT_MS` 1.5 s, then no code (fresh install lands on Home, the only silent loss; covered by a test and measured by `shop_link_opened` vs `shop_link_arrived`).

### 11.2 Code quality
- **Share code backfill (L1):** nullable `share_code` + unique index, backfilled in the migration with a PL/pgSQL loop that retries on `unique_violation`, then `NOT NULL`. New merchants get a code in the create path with the same retry. Alphabet and length reuse `REFERRAL_CODE_ALPHABET` / 6 from `packages/shared/src/referral.ts`.
- **Two parsers, one referrer read (R4):** `shopCodeFromInstallReferrer` requires `utm_medium=shop_share`; `referralCodeFromInstallReferrer` keeps requiring `biker_referral`; each rejects the other's and the fleet `/j/` shape.
- **Attribution carry (L8):** the arriving code is held on the cart context with the merchant id; dropped if the cart changes merchant; sent at place-order; the API stores it only when it resolves to that order's merchant.
- **Live flag (DR6):** the merchant app shows the row from the same live test the resolver uses (`pilotEnabled && applicationStatus = live`), one shared helper on the API side.

### 11.3 Tests

```
CODE PATHS                                         USER FLOWS
[+] api share.service                              [+] Stranger, Android, no app
  ├── resolve live → {merchantId, service} [GAP]     └── [GAP][→E2E web] link → sign-up → shop (D6)
  ├── unknown / not live / paused → same 404 [GAP] [+] Existing customer, app installed
  └── card: live → 3 fields; else 404 [GAP]          └── [GAP] lynia://s/CODE → store (E1)
[+] migration: backfill unique, retry [GAP]        [+] Signed-out web visitor (iPhone)
[+] referral.ts parsers: each rejects others [GAP]   └── [GAP] /s/CODE → sign-in → shop; tip held (DR12)
[+] install-referral.ts {referralCode, shopCode}   [+] Biker taps link → sheet → switch (DR13) [GAP]
  ├── existing referral behaviour ★★★ (install-referral.test.ts) — extend
  └── shopCode + timeout [GAP]                     [+] Busy user: cart elsewhere / live order (DR9) [GAP]
[+] pending-shop.ts: 7 d, once, sign-out [GAP]     [+] Dead / not-live code → DR5 screen [GAP]
[+] boot-route / signedInDestination:              [+] Slow network → skeleton → retry (DR7) [GAP]
  ├── no shop pending: TODAY'S DESTINATIONS (CRITICAL regression, D6) [GAP]
  └── shop pending: each §4 path [GAP]
[+] website shop.js: UA routing, intent URL, og tags, card.jpg (live / no photo / dead) [GAP]
[+] merchant ShopShareSheet: hidden when not live, WhatsApp text, copy toast [GAP]

COVERAGE: 1/22 paths tested today (the referral parser) | all GAPs are accepted work under DR1–DR16, E1–E4
```

Tests made obsolete: none.

### 11.4 Performance
No issues. Resolve and card are single lookups on a unique index. Crawler traffic to `card.jpg` is absorbed by the 1-day edge cache. One extra referrer read on first launch reuses the existing 1.5 s cap. PostHog: three events per share journey, well inside the free plan (R7).

### 11.5 Outside voice
Codex is not installed. The native fallback needs TaskOutput, which this session doesn't declare, so per gstack's unavailable path no outside reviewer ran. The design review's independent subagent (13 findings) is the only second opinion on this plan.

### 11.6 NOT in scope
- **iOS Universal Links (L9):** rides the first iOS build; the iPhone web path covers iPhone until then.
- **Sharer attribution (`by=`):** §9 Q4, deferred; old links stay valid when it's added.
- **Server-side Play detection:** no reliable signal; DR4 keeps "Order on the web" visible instead.

### 11.7 What already exists
`install-referral.ts` + `referral.ts` parsers (extended, not duplicated); `/r/` `/j/` Worker pattern (`referral.js`, `invite.js`); `FleetInviteSheet` (sheet pattern); `switch-to-customer.ts` (DR13); `ThrottleGuard`; signed-URL photo service; customer web SPA fallback; `clearDeviceState`.

### 11.8 Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| A. Share code + resolve + card | `apps/api` (prisma, merchant/) | — |
| B. Website `/s/` + card.jpg | `apps/website` | A (card endpoint contract) |
| C. Pending shop + boot/sign-in + arrival states | `apps/mobile` (logic/, auth/, app/) | A (resolve contract) |
| D. Share buttons (customer + merchant) | `apps/mobile/src/ui/browse`, `apps/merchant` | A (share code on merchant) |

Lane A first (it fixes the contracts). Then B, C and D in parallel; C and D both touch `apps/mobile` (different folders), so merge D after C. All after the design handoff lands.

### 11.9 Implementation tasks (engineering)
- [ ] **E-T1 (P1, human ~1d / CC ~45m)** API: `share_code` migration + backfill, `share.controller/service` (resolve + public card, same 404, throttled), `Order.shareCode`. Verify: `pnpm --filter api test`.
- [ ] **E-T2 (P1, human ~1d / CC ~45m)** Website `shop.js`: D7, intent URL (E1), og tags, `card.jpg` proxy (E2). Verify: `apps/website/worker.test.mjs`.
- [ ] **E-T3 (P1, human ~2d / CC ~1h)** Mobile: `pending-shop.ts` (E3), referrer `{referralCode, shopCode}`, `app/s/[code].tsx`, signed-out route, onboarding skip, chip, arrival states. Verify: table tests + web E2E (E4).
- [ ] **E-T4 (P2, human ~4h / CC ~20m)** Share buttons + merchant sheet + PostHog events. Verify: component tests.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | Codex (not installed); native fallback unavailable (no TaskOutput) | Independent 2nd opinion | 1 | unavailable | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open (all resolved: mapped work) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 2/10 → 8/10, 16 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** plan-review phase: Codex not installed; native fallback unavailable in this session. Design phase: native Claude subagent completed (13 findings, resolved). No external provider completed.
- **VERDICT:** DESIGN + ENG reviewed; every finding has an owner decision (D2–D6). Eng logs `issues_open` because its 4 findings became mapped work, not because anything is undecided. Ready for the design handoff, then implementation.

NO UNRESOLVED DECISIONS
