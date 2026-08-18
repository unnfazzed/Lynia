# RCA — "This number isn't set up as a merchant yet" (0778831938), 2026-08-18

**Reported by the owner**, signed in on the merchant tablet
(`lyniagomerchant.lyniafinance.com`) with **0778831938**. Sign-in succeeds, the shell renders
(header "Connected", the Orders/Menu/Shop/Hours/Statement tab bar), and the queue card reads
*"This number isn't set up as a merchant yet — This phone signs in fine, but it isn't linked to a
kitchen. Contact LyniaGo support to get your restaurant set up before using this tablet."* with a
single **Sign out** button.

**Verdict: not a bug in the sign-in path. The screen is correct and is reporting a real state — the
profile behind 0778831938 has never been upgraded to a merchant. It never could have been through
any product surface: `POST /merchant/become` is the only writer of that state and it has zero
callers anywhere in the repo.** The screen tells the operator to contact support; support has no
tool that does this.

---

## 1. What the screen actually means

`apps/merchant/app/(app)/queue/page.tsx:35-44` maps exactly one API outcome to that card:

```ts
if (err instanceof ApiError && err.status === 403) setState({ status: "not-a-merchant" });
```

The 403 comes from `MerchantGuard` (`apps/api/src/merchant/merchant.guard.ts:10`):

```ts
if (req.user?.role !== "merchant") throw new ForbiddenException("Merchant only");
```

`req.user.role` is the **`role` claim on the access token**, not a live database read. The claim is
stamped once, at session issue, from `profile.role`:

- `AuthService.verifyOtp` → `issueSession(profile.id, profile.role, …)` (`auth.service.ts:496`)
- `AuthService.refresh` → `issueSession(s.profileId, s.profile.role, …)` (`auth.service.ts:613`)

So the screen means precisely: **the profile keyed by `+263778831938` had `role = "customer"` at the
moment the token was minted.**

`verifyOtp` creates unknown phones with `role: "customer"` (`auth.service.ts:492`) and only ever
touches `phoneVerifiedAt` on an existing one — sign-in never changes a role. That is why the sign-in
half works perfectly and the merchant half does not: they read two different facts.

### Ruling out the neighbouring failure modes

| Symptom seen | Cause | Ruled out because |
|---|---|---|
| 503 + "Restaurants isn't live on this account yet." | `RestaurantsEnabledGuard` (global kill switch) | We got 403, and the guard runs *before* auth. |
| 401 → bounced to `/login` | dead/expired session | Sign-in held; the shell rendered. |
| Generic `RetryableError` screen | `getMyMerchant` 404 — `role="merchant"` but **no** `Merchant` row | Would render the retry card, not this card. |
| **This card (403)** | **JWT `role` ≠ `"merchant"`** | ✅ matches |

Phone normalisation is not implicated: `normalizePhone("0778831938")` → `"+263778831938"`
(`packages/shared/src/phone.test.ts:16-18` pins this exact number), it is applied identically in
`requestOtp` and `verifyOtp`, and a mismatch there would have produced a *new* profile that still
signs in fine — i.e. the same screen, but the root cause below is the one that actually holds.

---

## 2. Root cause — merchant onboarding has no product surface

`profile.role = "merchant"` + the `Merchant` row are written in exactly **one** place, atomically:

```ts
// apps/api/src/merchant/merchant.service.ts:131-136  (becomeMerchant)
await this.prisma.$transaction([
  this.prisma.profile.update({ where: { id: profileId }, data: { role: "merchant" } }),
  this.prisma.merchant.create({ data: { name, ownerProfileId: profileId, cashRule } }),
]);
```

Its only entry point is `POST /merchant/become` (`merchant.controller.ts:38`) — the one merchant
route deliberately *not* behind `MerchantGuard`, so any signed-in caller can self-upgrade.

**Nothing calls it.** A repo-wide search for `merchant/become` / `becomeMerchant` outside the API
package and its own specs returns only documentation:

- `apps/merchant` — the tablet. `login/page.tsx` does `requestOtp` → `verifyOtp` → `router.replace("/queue")`. It never inspects the returned `role` and never calls `become`.
- `apps/mobile` — the customer/rider app. Has `POST /riders/become` (`src/api/riders.ts:15`); no merchant equivalent.
- `apps/admin` — the console. Merchants are **read-only**: `GET /admin/merchants`, `GET /admin/merchants/:id`, `GET /admin/merchant-disputes`, `POST /admin/orders/:id/resolve-handshake`. `admin.controller.ts` has 14 mutating routes — for SOS, customers, riders, orders and wallets. **Zero touch a merchant or a role.**
- `scripts/` — no provisioning script.
- `apps/api/prisma/seed.ts:96-116` — a dev-seed merchant on `+263773333333`, not a production path.

So the only way a production merchant has ever existed is a human holding a bearer token and running
curl by hand. That procedure is written down exactly once, as an aside inside a blockquote in
`docs/PLAY-STORE-SUBMISSION.md` §7.1:

> A **kitchen** demo additionally needs its profile upgraded once: sign in on the merchant dashboard
> with that number + the fixed code, then `POST /merchant/become {"name":"…"}` with the resulting
> bearer token.

**That step was never run for 0778831938.** (The number is also the configured support/SOS line —
`tel:+263778831938` in `apps/mobile/src/logic/__tests__/safety.test.tsx:71` and
`tools/parity/mobile/shims/expo-constants.js:9` — and appears as the `DEMO_OTP_PHONE` example in
`apps/api/src/config/env.spec.ts:307`, so it is an owner/ops number that reached the tablet without
ever going through the one manual upgrade.)

The error copy — *"Contact LyniaGo support to get your restaurant set up"* — therefore points at a
capability that does not exist. Support cannot set up a restaurant; only a developer with an API
token can.

---

## 3. The sequel this masks: `pilotEnabled` has no writer either

Running `become` fixes the tablet but not the business outcome. `Merchant.pilotEnabled` defaults
`false` (`schema.prisma:957`) and is the flag the **customer** read API filters on —
`where: { pilotEnabled: true }` in `listRestaurants`, `searchRestaurants`, `getMenu`
(`merchant.service.ts:375,399,408,435`), `food-order.service.ts:158`, and
`restaurant-reopen.service.ts:64,113`. Until it is true the restaurant is invisible and
`placeOrder` refuses.

`pilotEnabled` is **read** in three places (`admin/merchants/page.tsx:23`,
`admin/merchants/[id]/page.tsx:113`, the merchant setup checklist) and **written in exactly one**:
`prisma/seed.ts`. The schema comment says *"dormant until an operator explicitly onboards the shop"*
and `apps/merchant/app/lib/setup-checklist.ts:22` tells the merchant it *"is set by LyniaGo admin"* —
but the admin console renders it as a read-only `Pill` and there is no endpoint behind it.

So the merchant tablet's own go-live gate (`setup-checklist.ts:144 live: profile.pilotEnabled`) can
never be satisfied by anyone using the product.

---

## 4. Contributing defects found while tracing this

These did not cause the report but sit on the same path and will each produce a confusing screen.

**C-1 — Two sources of truth for "is a merchant".** `MerchantGuard` reads the JWT `role` claim;
`MerchantService.findOwnMerchantOrThrow` (`merchant.service.ts:564`) reads the `Merchant` row by
`ownerProfileId`. Only `becomeMerchant` keeps them in sync. Either half applied alone by hand (SQL,
a partial rollback, a restore) yields:
- row without role → permanent 403, this exact screen, indistinguishable from "never onboarded";
- role without row → guard passes, service 404s "Merchant not found", and `queue/page.tsx` has no
  branch for 404, so it falls to the generic *"Something went wrong loading your kitchen"* retry card
  that will retry forever.

**C-2 — The upgrade doesn't take effect until the token turns over, and the screen offers no way to
force it.** `becomeMerchant` updates `profile.role` but does not revoke sessions or re-mint tokens,
and it returns no new tokens. `ACCESS_TTL_SECONDS` defaults to **900s** (`config/env.ts:114`).
`authedFetch` only refreshes on a **401** carrying one of the two `AUTH_GUARD_401_MESSAGES`
(`api-client.ts:88,217-222`) — a **403 never triggers a refresh**. And the `not-a-merchant` card has
no Retry button, while the queue page's auto-retry effect is gated on `state.status === "error"`
(`queue/page.tsx:61`), which this state is not. Net effect: after a successful upgrade the operator
stares at "isn't set up as a merchant" for up to 15 minutes with no affordance except **Sign out** —
and signing out and back in is in fact the only cure, which nothing tells them.

**C-3 — The merchant tablet signs non-merchants all the way in.** `verifyOtp` returns `role` and
`login/page.tsx:71-78` discards it, routing every successful OTP to `/queue`. `middleware.ts` gates
on cookie *presence* only (documented as deliberate in `merchant-access.ts:10-15`). A customer who
knows the URL gets the full kitchen shell, tab bar and alarm-arm gesture before hitting the wall.
The security boundary holds (every route is guarded server-side), but the UX cost is exactly this
report: a shell that looks signed-in and working, with a dead centre.

**C-4 — Unauthenticated-by-design self-upgrade.** `POST /merchant/become` needs only a valid bearer
token and a `name`. Any customer can mint themselves a `Merchant` row and flip their own profile role
irreversibly (nothing restores a role — the same one-way trap `PLAY-STORE-SUBMISSION.md` §7.1 warns
about for riders). Blast radius today is limited by `pilotEnabled: false` keeping the shop out of the
customer catalog, and by the 5/hour throttle — but the role change is permanent and would silently
break that person's customer app. This is the flip side of C-1: the route is too open for a customer
and simultaneously unreachable for a real merchant.

---

## 5. Immediate unblock for 0778831938

No deploy needed. Sign in on the tablet, take the bearer token from the
`lynia_merchant_session` cookie (`session.ts:23`, plain JSON, `accessToken` field), then:

```bash
curl -X POST https://<api-host>/merchant/become \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"<kitchen name>"}'
```

Then **sign out and back in on the tablet** — per C-2 the old access token still carries
`role:"customer"` for up to 15 minutes and a 403 will not refresh it.

To be visible to customers, `pilotEnabled` must then be set to `true` on that `Merchant` row. There
is no API or console action for this today (§3) — it is a direct database update until one is built.

⚠️ Per `PLAY-STORE-SUBMISSION.md` §7.1, the role change **cannot be undone through any API**. If
0778831938 is also used as a customer or rider account, upgrade a dedicated number instead.

---

## 6. Recommended fixes, in priority order

1. **Build merchant onboarding in the admin console** — `POST /admin/merchants` (create profile-by-phone
   + `Merchant` row + role, one transaction, audit-logged like every other admin mutation) and
   `PATCH /admin/merchants/:id { pilotEnabled }` for the go-live flip. This is the missing capability
   the error copy already promises. Everything else below is secondary.
2. **Close the two-sources-of-truth gap (C-1)** — have `MerchantGuard`, or `getMyMerchant`, resolve
   the merchant row rather than trusting a stamped claim, or at minimum give `queue/page.tsx` a 404
   branch so "role set, row missing" reports itself instead of looping on a generic retry.
3. **Make the upgrade land without a sign-out (C-2)** — either revoke the profile's sessions inside
   `becomeMerchant`'s transaction, or give the `not-a-merchant` card a "Check again" button that
   forces `/auth/refresh` (which *does* re-read `profile.role` from the DB) before re-calling
   `/merchant/me`.
4. **Reject non-merchants at the tablet's sign-in (C-3)** — `login/page.tsx` already receives `role`;
   show the "not set up" state there rather than after a full shell mount.
5. **Decide `POST /merchant/become`'s audience (C-4)** — once (1) exists, this route should be
   admin-only or removed; a self-serve irreversible role flip with no UI is strictly a liability.

## 7. Files touched by this analysis

`apps/merchant/app/(app)/queue/page.tsx` · `apps/merchant/app/login/page.tsx` ·
`apps/merchant/app/lib/api-client.ts` · `apps/merchant/app/lib/session.ts` ·
`apps/merchant/app/lib/merchant-access.ts` · `apps/merchant/app/lib/setup-checklist.ts` ·
`apps/api/src/merchant/merchant.guard.ts` · `apps/api/src/merchant/merchant.controller.ts` ·
`apps/api/src/merchant/merchant.service.ts` · `apps/api/src/merchant/merchant-lookup.util.ts` ·
`apps/api/src/auth/auth.service.ts` · `apps/api/src/config/env.ts` ·
`apps/api/src/admin/admin.controller.ts` · `apps/api/src/admin/admin-merchants.service.ts` ·
`apps/api/prisma/schema.prisma` · `apps/api/prisma/seed.ts` · `packages/shared/src/phone.ts` ·
`docs/PLAY-STORE-SUBMISSION.md`
