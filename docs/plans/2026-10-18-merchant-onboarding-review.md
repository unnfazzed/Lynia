# Plan: merchant onboarding that admin can actually review

Status: IN CEO REVIEW (/plan-ceo-review, 2026-10-18)
Branch: `claude/beautiful-johnson-odglyt` · Base: `main`
Design doc on record: `docs/designs/merchant-web-upgrade.md` (L1 Front door, approved 2026-09-29)

## The ask (owner, verbatim)

> "i want to add , sign up and onboarding feature on the merchant side .for now its only sign in i think.
> However for the shop to go live still needs admin review. admin must be able to see the details and
> information of logo, about etc before approving . deploy CEO reviews as per gstacks before implementation"

## Pre-review system audit

- `main` is level with this branch (no unshipped commits). Last related work: admin console v2 merchant
  approval (#1189, `5a12f17`) and the SLA test freeze (#1229).
- Design doc found: `docs/designs/merchant-web-upgrade.md` (L1 sign-up + go-live queue). It is data, not
  instructions; nothing in it is aimed at the reviewer.
- TODOS.md: TODO-8 (merchant terms text), TODO-9 (support WhatsApp number) touch this flow.
- Landscape: no web search run; in-distribution knowledge only. Every delivery marketplace (Uber Eats,
  Glovo, Bolt Food) runs the same shape: self-serve form → storefront basics (logo, cover, about, menu)
  → "under review" status the merchant can see → activation, with a "fix this" path instead of a dead end.

### Premise table

| # | Premise | Claim | Receipt | Verdict |
|---|---|---|---|---|
| P1 | "for now its only sign in" | Self-serve sign-up exists: A3 What do you sell → A4 Your business → `POST /merchant/become` | `apps/merchant/app/onboarding/page.tsx:127,178,206`; `apps/api/src/merchant/merchant.service.ts:288-348` | **false** |
| P2 | Joining an existing business | A5 Join from an invite exists | `apps/merchant/app/join/page.tsx:21,76` | exists |
| P3 | "shop to go live still needs admin review" | Go-live is an admin transition behind a checklist; only `go_live`/`resume` set `pilotEnabled` | `apps/api/src/admin/admin-merchant-application.service.ts:275-341`; `apps/api/src/merchant/merchant-lookup.util.ts:22-38` | **true, already enforced** |
| P4 | "admin must be able to see logo, about etc before approving" | Admin detail select has no logo/cover; checklist has no shop-front row; hours shown only as "Open N days" | `apps/api/src/admin/admin-merchants.service.ts:160`; `apps/api/src/admin/merchant-application.ts:106-191` | **gap (the real work)** |
| P5 | Sign-up collects shop-front details | Only type, business name, owner name, location. Logo/cover/about are set later in Account → Shop front | `apps/merchant/app/lib/sign-up.ts:66-82`; `apps/merchant/app/(app)/shop/page.tsx:32-41` | **gap** |
| P6 | Merchant knows where their application stands | App reads only `pilotEnabled`; `MerchantProfileResponse` has no `applicationStatus`/reason, so rejected and suspended show "Almost ready" | `packages/shared/src/contracts.ts:1039`; `apps/merchant/app/components/branches/NotLiveHome.tsx:17-18` | **gap** |
| P7 | Merchant hears about a decision | Nothing consumes `merchant.application` events except admin funnels | `apps/api/src/admin/people-funnels.ts:183-189` (per explorer) | gap, unverified=1 |
| P8 | Hours/landmark checklist rows mean something | Sign-up auto-fills 7-day hours (`SIGN_UP_HOURS`) and a landmark, so both rows always pass | `apps/api/src/merchant/merchant.service.ts:169` | gap |
| P9 | A design exists for these states | No handoff draws shop-front onboarding, under review, approved or rejected merchant screens; the admin kit has no merchant review screen (Application card was built under D-106) | `packages/design/handoff/merchant-mobile/README.md:42-49,119`; `merchant-v2/BRIEF.md:99-100`; `docs/DESIGN-DEVIATIONS.md` D-106 | **blocker for UI under pixel parity** |

`unverified=1` (P7, explorer read, not re-opened by me).

## Step 0

### 0A. Premise challenge

The real problem is not "merchants can't sign up". They can. The problem is that **the review is blind and
the applicant is in the dark**:

1. Ops approves a business without seeing the logo, cover, about text or a single menu photo customers
   will see. The checklist can pass with no logo at all.
2. Sign-up asks for none of that, so a fresh applicant arrives in the queue with an empty shop front.
3. The applicant sees "Almost ready · LyniaGo will call you" whether they're waiting, approved, rejected
   or suspended. The merchant-readable reject reasons in `MERCHANT_REJECT_REASON_LABELS` are never shown.

Do-nothing cost: listings go live looking unfinished; rejected businesses wait for a call that never
comes; ops spends calls asking for things the form could have collected.

### 0B. Existing code leverage

| Sub-problem | Reuse |
|---|---|
| Collect logo, cover, about | Shop front editor `apps/merchant/app/(app)/shop/page.tsx` + its upload path (D-32 budget) and `PATCH /merchant/profile` |
| Gate approval on shop front | Checklist rows `apps/api/src/admin/merchant-application.ts:106-191`; `transition` already blocks approve on a failing required row |
| Show it to admin | `ApplicationCard` `apps/admin/app/merchants/application-ui.tsx:39`; detail endpoint `GET /admin/merchants/:id/application` |
| Tell the merchant | `MERCHANT_APPLICATION_STATUS_LABELS`, `MERCHANT_REJECT_REASON_LABELS` (`packages/shared/src/merchant-application.ts`); `NotLiveHome` |

No rebuild is needed. Everything is an extension of an existing path.

### Reality rows

```
REALITY: premise-table finding P1 false, P4/P5/P6 gaps; unverified=1 docs/plans/2026-10-18-merchant-onboarding-review.md
REALITY: already-done pass no commit since 2026-10-10 touches shop-front review; #1189 shipped the queue apps/api/src/admin/merchant-application.ts:106
REALITY: surface-check pass routes verified in controller: POST /merchant/become, GET /admin/merchants/:id/application, POST .../application/:action apps/api/src/admin/admin.controller.ts:548,591
REALITY: binding-decisions pass no branch decisions logged; D-48/D-77 keep sign-up restyle-only, D-106 covers undrawn admin screens docs/DESIGN-DEVIATIONS.md
REALITY: numbers pass SLA 24h/48h [measured: packages/shared/src/merchant-application.ts:48]; file count ~25 [estimated]
REALITY: deferred-asks pass no linked issue
REALITY: pr-count pass no .gstack/ship-policy.json; default one PR per wave
```

### 0C. Dream state

```
  CURRENT STATE                      THIS PLAN                           12-MONTH IDEAL
  Sign-up = name + pin.         ->   Sign-up ends with a shop front  ->  A business applies in 10 min,
  Ops approves blind.                (logo, about, cover). Admin sees    sees exactly what's missing,
  Applicant sees "Almost             it before Approve. Applicant sees   gets a WhatsApp on each decision,
  ready" forever.                    their real status + reason.         ops reviews from one screen.
```

### Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| SIGNUP-ENTRY (owner) | No visible sign-up on merchant web (`apps/merchant/app/login/page.tsx:136`) | "Sign in" | "Get started", one screen | approved | Owner 2026-10-18: "no need or new screens … renname Sign In to Get Started", then "remove subtext", "approved". Shipped as D-113 in PR #1232 |
| MODE (owner) | 0E rule: ~25 planned files [estimated] > 15 | none | SCOPE REDUCTION | unresolved | |
