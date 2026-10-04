# Merchant app: current UI (2026-10-04), the input for a kitchen + shop redesign

This folder has 68 screens of the merchant app as it ships on `main` today (`apps/merchant`, the D-48 mobile
redesign plus the Order flow v2 merchant screens). They are app renders only, with no mocks beside them.
Each one is 360×720 at 2× (some scroll taller). The data is fake and the API is stubbed in the browser,
so no backend was needed.

Each folder also has a labelled contact sheet, `<folder>.sheet.png`. To feed a whole flow in one image, use the sheets.

| Folder | What's in it |
|---|---|
| `1-shared-sign-in/` | Sign in (phone, code), *What do you sell?* (restaurant / shop), business details, join a team by invite |
| `2-shared-account-settings/` | Account (restaurant + shop), sign out, branches (switcher, add), opening hours, team, preferred riders, shop front profile, *Taking orders* settings |
| `3-kitchen/` | Orders home (board / empty / closed / branches / not live), new order ringing (manual, auto-accepted, scheduled), cooking ticket, hand-over, tracking, delivered + cash back, goods back, scheduled list + ticket, Menu (+ out-of-stock sheet, empty), Money |
| `4-shop/` | Orders home = rider bookings, Book a rider (where → what + fare), rider offers, tracking, delivered + cash back; customer order ringing with item changes (remove / swap), swap picker, waiting for customer, hand-over with sealed-bag photo; Items; Money |
| `5-pharmacy/` | Packing ticket (seal note), prescription check, decline a prescription |

In `3-kitchen/`, the screens `NN-…-v2` and their earlier neighbours are the same screen with different
fixture data. The earlier ones come from the D-48 sheet, the `-v2` ones from Order flow v2.

## How it is built today (for the redesign brief)

- **One app, one shell.** It has four tabs: Orders · Menu|Items · Money · Account. The header holds the
  business name, its open/closed state and an open switch. KPI tiles show Orders, Sales and Cash overdue.
- **Kitchen and shop are already mostly shared.** Sign-in, Account, hours, team, riders, profile, Money,
  the Menu/Items editor and the order ticket / hand-over / tracking / cash-back chain all use the same code.
  Only the labels change: Menu ↔ Items, Cooking ↔ Packing, Mains ↔ Popular.
- **Where they really differ:**
  - *Kitchen:* a new order **rings full-screen** and you choose a ready-in time. After that comes
    cooking → *food is ready* → rider hand-over (the rider types the code) → tracking → cash back.
  - *Shop:* the Orders home is built around **Book a rider**, for the shop's own off-platform sales
    (where → what + fare → riders' offers → tracking → cash back). Customer orders add **item changes**
    (remove / swap, then wait for the customer's OK). The hand-over needs a **sealed-bag photo**.
  - *Pharmacy (a shop kind):* there is a **prescription check** before packing.

## Suggested prompt when you feed these in

> Redesign the LyniaGo merchant app for kitchens (restaurants) and shops. These screenshots are the
> current UI. Keep it simple and in line with the latest customer-side redesign: the calm-mint Home,
> Browse v2, Order flow v2, Orders v2 and the floating tab bar
> (`packages/design/handoff/{calm-mint-v2-2026-10,browse-v2,order-flow-v2,orders-v2,tab-bar-v1}`).
> Kitchen and shop must share one shell, one component set and one order lifecycle. Diverge only where
> the business is fundamentally different: kitchen prep time and the ringing order; the shop's
> Book-a-rider, item swaps and sealed-bag photo; the pharmacy's prescription check. Values come from
> `packages/design/tokens/*.css`, and targets are at least `--target-min`.

To regenerate: start `API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant`.
Then run `tools/parity/shoot-merchant-mobile.mjs --set {pr1,orders,menu,account,shop,branches}` and
`tools/parity/shoot-order-flow-merchant.mjs --set {merchant,merchant2}`. Those write the `app-*.png`
files. The gap screens (empty states, shop profile, ordering settings, shop hours/team/money) were taken
the same way, with a stubbed `/merchant/me`.
