# gstack review of the 2026-10-05 E2E results (run 6 of 7, report only)

**Verdict: NOT launch-ready for shops or pharmacies. 3 launch blockers are confirmed in the code, and all 3 are live in production now:**
1. A rider can't get the pickup code for any shop, pharmacy or manual-accept restaurant order.
2. A business that closes on any day can't save its opening hours.
3. Production push is off (`PUSH_PROVIDER: noop` in today's production deploy log).

Restaurants (auto-accept), parcels and rider sign-up work end to end.

Reviewed 2026-10-05 against `origin/main` @ `2f260df`. The reports branch's non-docs code matches main except `apps/website/deploy`. Production runs `9455c98`: Release (Azure) run #131 and Deploy Merchant Dashboard (Azure) run #57 both succeeded on 2026-10-05. `git diff 9455c98 124395c -- apps packages` is empty, so **production runs exactly the code these journeys tested**.

Method: eng and design lenses from `~/.claude/skills/gstack/plan-eng-review` and `plan-design-review`, applied to results rather than a plan. The session was unattended, so every decision point took the recommended option, and those choices are recorded inline.
- Every finding below was checked against the code with file:line quotes, either by this run or by one read-only subagent that covered J1.
- A claim I couldn't back with code is marked UNVERIFIED and is not counted.
- Journeys were not re-run and the local stack was not booted.
- Production was not called. Read-only GitHub Actions run metadata and one job log were read to answer "what is production running".

## Launch blockers

### LB-1 · Rider can't get the pickup code (J5 D6, H1d) · P0 · confidence 9/10 · product defect
**What a user would hit:** a rider arrives at a shop or pharmacy. The hand-over screen says "Say the code to …" but shows no code, and the merchant can't cancel the order. The order is stuck until the rider drops it, and then the next rider hits the same wall. This affects **every shop and pharmacy order** (they never auto-accept), and manual-accept restaurants too.

**Evidence (origin/main):**
- `apps/api/src/merchant/food-dispatch.service.ts:428-431`: dispatch-accept writes `status: "assigned", riderId, merchantPhase: null,`.
- `apps/api/src/merchant/food-order.service.ts:983`: `if (order.merchantPhase !== "ready_for_pickup") throw new ConflictException("This order isn't ready for pickup yet");`
- `apps/merchant/app/(app)/queue/[id]/page.tsx:965-969`: the web asks for the code only after assignment (`if (codeless || !order.riderId || …) return; … revealPickupCode(order.id)`). It swallows the failure with `.catch(() => setCode(null))`, so the screen shows no error either.
- `food-order.service.ts:380`: `const autoAccept = merchant.businessType !== "shop" && …`. Shops and pharmacies are always on the code path.
- `markReady` hashes the code and discards the plaintext (`:927-934`).

**Doc vs code:** the doc comment on `revealPickupCode` (`food-order.service.ts:979`) says *"`merchantPhase` stays `"ready_for_pickup"` for the whole C3 dispatch lifecycle (search → hold → rider secured → en route)"*. The dispatch-accept write at `food-dispatch.service.ts:431` makes that false.

**Why the tests are green:** `launch-flip.int.spec.ts:241` reveals the code before dispatch, and `queue/[id]/page.test.tsx:50` mocks `revealPickupCode`. J4 passed for the same reason (harness note H-1). The line has been in production since PR #1027 (`081e30b`, an ancestor of `9455c98`).

### LB-2 · A business closed on any day can't save its hours (J3 step 21, J5 A10) · P0 · confidence 9/10 · product defect
**What a user would hit:** an owner unticks Sunday and taps **Save hours**. They get a red line, *"hours: Invalid input: expected object, received undefined"* ([J3-26](img/J3-26-hours-saved.png)), and nothing saves. Only "open every day" works. This affects restaurants, shops and pharmacies.

**Evidence:**
- `packages/shared/src/contracts.ts:867-868`: `/** Weekly hours keyed by day; an absent day means closed that day. */` sits above `export const MerchantHours = z.record(z.enum(DAY_KEYS), MerchantHoursWindow);`.
- `zod` is `^4.6.2` (`packages/shared/package.json:41`). In Zod 4, an enum-keyed `z.record` is exhaustive, so every key is required.
- The request schema is `UpdateMerchantHoursRequest = z.object({ hours: MerchantHours })` (`:957`).
- The web relies on the comment: `apps/merchant/app/(app)/hours/page.tsx:95` says `// An absent day is closed; MerchantHours' zod record validates that shape at runtime.`
- J3 reproduced it in isolation, and J5 reproduced it through the API.
- I could not re-run zod here (no `node_modules`). I rate it 9/10 on two independent reproductions plus Zod 4's documented behaviour.

### LB-3 · Production push is off (J1 follow-up LB1) · P0 · confidence 9/10 · product config defect, now verified
**What a user would hit:** riders get no new-job alerts. Customers and merchants get no order updates on a locked phone.

**Evidence:**
- The production deploy log for Release (Azure) run #131, job "build · migrate · canary", 2026-10-05 06:54 UTC, shows `PUSH_PROVIDER: noop` (with `FCM_PROJECT_ID: lyniago-app`).
- In code: `infra/azure/containerapps.tf:51` sets `PUSH_PROVIDER = "noop" # E5: until the new Firebase credential exists`, and `.github/workflows/release-azure.yml:412` sets `vars.PUSH_PROVIDER || 'noop'`.
- `apps/api/src/config/env.ts:105` defaults it to `.default("noop")`, and the production refinements (`env.ts:439-497`) never check push.
- `NoopPush` returns `{ ok: true, invalidToken: false }` (`noop.push.ts:14`), so every send "succeeds".

J1's report left this to the owner to confirm. The deploy log settles it. **Owner action: set the `PUSH_PROVIDER` repo Variable to `fcm` once the Firebase key is in place.**

## Fix soon

### FS-1 · Carrier NAT shares one sign-in budget (J1 LB2) · P1 · 8/10 · product defect
**What a user would hit:** at a rider sign-up event behind one mobile IP, only 10 riders can verify in 5 minutes and about 20 can request a code in an hour. At around 90 active users per NAT IP, token refreshes fail, and FS-3 shows the result as "check your connection".

**Evidence:**
- `auth/auth.controller.ts:34`: `@Throttle({ limit: 10, windowSec: 300, keyPrefix: "otp-verify" })`
- `:48`: refresh `limit: 30, windowSec: 300`
- `env.ts:165`: `OTP_RL_IP_MAX … default(20)`
- `common/throttle.guard.ts:72`: `this.subject(req) ?? req.ip`

The real impact depends on the size of each carrier's NAT pool, which is UNVERIFIED. I kept this out of the launch blockers because no traffic has been observed. Recommendation: P1 before any onboarding event.

### FS-2 · Production KYC is manual, and a declined rider who retries never re-enters the review queue (J1 B2) · P1 · 8/10 · product defect
The same deploy log shows `KYC_MODE: manual` (with `KYC_PROVIDER: didit`). In manual mode, no Didit session is started (`rider.service.ts:333`, `if (this.env.KYC_MODE === "auto") {`), so every new rider waits for an admin. A declined rider who taps retry is told `pending`, but nothing is written:
- `rider.service.ts:478`: `if (this.env.KYC_MODE !== "auto") return { kycStatus: "pending", mode: this.env.KYC_MODE };`

The row stays `failed`, so it is left out of the pending queue and counts. It can still be found with `?kyc=failed` (`admin-riders.service.ts:30`).

**What a user would hit:** the rider thinks they are waiting for review, and nobody is reviewing them.

The subagent rated this P3 because it assumed auto mode in production. The deploy log shows manual, so I raised it.

**Harness note:** J1 run 1 tested stub + auto (the instant pass), not the manual path production uses. Admin approve and decline were covered (steps 25–32).

### FS-3 · Every 429 reads "Couldn't reach LyniaGo. Check your connection" (J1 D2) · P2 · 9/10
The 429 body is a bare string:
- `throttle.guard.ts:78`: `throw new HttpException("Too many requests — try again later", …)`
- `all-exceptions.filter.ts:26`: `.json(exception.getResponse())`

The mobile parser looks for `.message` (`src/api/client.ts:310-317`), finds none and falls back to the network-error copy. This makes FS-1 look like a network fault.

### FS-4 · A new business is told it is open before it is live (J3 F1, J5 F3) · P2 · 8/10
After **Create my business**, the screen reads "All quiet for now · You're open. New orders ring here with sound…" (`queue/page.tsx:227-228`), with an **Open** switch ([J3-11](img/J3-11-orders-after-create.png), [J5-A-04](img/J5-A-04-after-create.png)). Meanwhile `pilotEnabled:false`, so customers can't see the business.

The "Almost ready" state is gated on 2+ branches:
- `lib/branches.ts:25`: `return !!business && showBranchChevron(business, branchCount) && !isLive(business);`, with `branchCount >= 2` at `:20`.

The merchant-mobile README says "The empty open state is not designed" (`handoff/merchant-mobile/README.md:53`). A one-branch not-live state therefore needs an owner or design decision before the app shows anything new ("not drawn ⇒ not rendered").

### FS-5 · Pharmacy customers are told "No prescription medicine yet" while prescriptions are on (J5 F4) · P2 · 9/10 · owner copy decision pending
`apps/mobile/src/ui/browse/copy.ts:105` has `"otc": "Over-the-counter only. No prescription medicine yet."`, and it is rendered unconditionally. Production serves `RX_ENABLED: true`, shown in the deploy log and in `env.ts:401` `.default("true")`.

This is ledgered as *PENDING OWNER REVIEW* in `docs/DESIGN-DEVIATIONS.md` D-76 §2, so it is not a rogue divergence. It still tells customers the opposite of what the product does.

### FS-6 · OTP send-path ordering (J1 A1, A2) · P2 · 9/10
On resend, the new code is stored before the send (`auth.service.ts:376` `store.put`, then `:377` `sender.send`), so a failed resend kills the code the user already has. The per-phone, per-IP and global limiters are charged before the send (`:363-365`), so a vendor outage locks users out for an hour.

Production uses `OTP_CHANNEL: bird-verify` (deploy log), and the subagent notes that A1's overwrite is **not** on the bird-verify path. A1 is latent today. A2 applies.

### FS-7 · Going online without coordinates skips the service-area check (J1 C3, C4) · P2 · 9/10
- `riders.controller.ts:88`: `const location = body.lat != null && body.lng != null ? {…} : undefined;`
- `rider.service.ts:608`: `if (location) { if (!isInServiceArea(location)) …`

The app sends `loc ?? undefined` when GPS times out (`rider/(tabs)/index.tsx:252`). The heartbeat (`:696-745`) never re-checks the area.

**What a user would hit:** the rider shows "Online" and never gets a job.

### FS-8 · Sign-out leaves the push token on the old account (J1 C1) · P2 · 9/10
- `auth-context.tsx:153`: `await logout(…)`, then `:158` `apply(null)`
- The token DELETE is best-effort and swallowed: `use-push-registration.ts:158`, `push.ts:303-305`
- `auth.service.ts:835-860`: `logout` touches only sessions

**What a user would hit:** a signed-out shared phone keeps getting the previous rider's pushes until someone else signs in. This is latent while LB-3 holds.

### FS-9 · New riders are asked for their name twice (J1 D1) · P2 · 7/10 (timing-dependent)
- `profile/setup.tsx:96-98` updates the profile without refreshing `["me"]`.
- `rider/become.tsx:133` reads the stale empty name and shows the name step again.

### FS-10 · Admin fare provenance is wrong after a raise (J2 F1) · P2 · 9/10
`admin/admin-orders.service.ts:597`: `} else if (selectedOffer?.type === "accept" || Number(order.agreedFare) === Number(order.proposedFare)) { fareProvenance = { kind: "customer_ask" };`

`raisePrice` keeps earlier bids at the rider's own price (`orders.service.ts:499-500`), so a $3 accept selected after a raise to $4 is labelled as the customer's ask. This misleads ops in a fare dispute.

### FS-11 · A duplicate-ID hold says "Finish verifying" and buys a new Didit session (J1 B1) · P3 in production today · 8/10
This is real in the code:
- `rider.service.ts:929-930`: `kycSessionToken: null, kycSessionUrl: null`
- mobile `gates.ts:314`: `return { kind: "unfinished" }`

Two corrections to the report. It is "each finished check that is held again", not "each tap", because later taps reuse the stored session (`rider.service.ts:513-519`). And it applies only in auto mode, which production is not running (FS-2).

## Polish

| # | Finding | Evidence | Conf |
|---|---|---|---|
| P-1 | A price over $1,000 shows a raw validation error, "priceUsd: Too big: expected number to be <=1000" ([J3-17](img/J3-17-price-1500.png)). The client allows up to 100,000. | `contracts.ts:1085` `.max(1000)` vs `lib/money-input.ts:9` `value > 100_000`. The comment at `:2` claims it "Mirrors the server's own constraint (positive, ≤100000…)" | 9 |
| P-2 | The raw message from every 400 is shown in the dish and hours sheets (`field: Invalid input…`) | `(app)/menu/page.tsx:116`; hours ([J3-26](img/J3-26-hours-saved.png)) | 8 |
| P-3 | An unsaved new dish says "Saved, but customers can't see it yet…" next to a failed save | `components/menu/DishEditorSheet.tsx:127-131` (shown whenever `isDraft`) | 7 |
| P-4 | An ignored order is stored as `shop_closed`, the same code as a closed shop, so customer copy would say "closed" (J4, J5 P2) | `food-order.service.ts:1221` | 8 |
| P-5 | With `SHOPS_ENABLED=false`, a shop order answers "Restaurant not found" (J5 P1) | `food-order.service.ts:310` | 8 |
| P-6 | The completed admin timeline still says "now" (J2 F2) | `admin-orders.service.ts:627-631`: `state === "now" ? "now"` with no terminal branch | 9 |
| P-7 | A correct OTP is used up when a new-account sign-in is refused for a device reason (J1 F1) | `auth.service.ts:632` `store.del(phone)` runs before `:577-584`; the grace path returns null at `:895-899` | 9 |
| P-8 | Bird Verify can show "Sent by SMS" beside "Resend on WhatsApp" when the reply has no `last_channel` (J1 D3, narrowed) | `auth/bird-verify.ts:49-50`; `verify.tsx:257,263` | 7 |
| P-9 | The rider board poll errors when there is no active job (J1 D4) | mobile `src/api/orders.ts:171-172` + `client.ts:225` | 8 |
| P-10 | The force-update gate is inert in production (`MIN_SUPPORTED_APP_VERSION:` is empty in the deploy log; `env.ts:301` `"0.0.0" = gate off`) | config state, not a defect | 9 |
| P-11 | The pharmacy Inventory list doesn't mark Rx items ([J5-E-10](img/J5-E-10-items-list.png)) | not drawn in merchant-v2, so it needs design | 6 |
| P-12 | The hand-over checklist degrades to fragments ("photographs it", "Say the code to") when a rider has no name | `queue/[id]/page.tsx:670,683` (`${first} photographs it`). The test riders had no name, so this shows only if a name is missing | 5 |

## Harness errors / env limits

| # | Type | What | Effect on results |
|---|---|---|---|
| H-1 | **HARNESS ERROR** | J4's script revealed the pickup code over the API *before* dispatch (J5 noted this). The merchant web never does that. | J4 steps 5 and 10 are PASS over the API but **masked LB-1** for manual-accept restaurants. J4's "no launch blockers" verdict is wrong for that path. |
| H-2 | HARNESS GAP | J1 run 1 tested `KYC_PROVIDER=stub` + `KYC_MODE=auto`. Production is `didit` + `manual`. | The production rider path (pending → admin approve) was covered only through the admin API, and FS-2 went unseen until this review. |
| H-3 | ENV LIMIT | No local storage adapter (`storage.module.ts:13-21`). | J3 steps 16 and 18 are BLOCKED. Photos were seeded by SQL. J5 used a localhost GCS stand-in, so its photo PASSes are real for the API checks. |
| H-4 | ENV LIMIT | Google Places key not set locally. | J3 step 6 NOT RUN. Production builds with `vars.MERCHANT_GOOGLE_PLACES_KEY` (`deploy-merchant-azure.yml:114,121`); its value is UNVERIFIED. |
| H-5 | ENV LIMIT | The verify throttle is hard-coded at 10 per 5 minutes per IP. | Runs used per-client `X-Forwarded-For`. Lanes sharing an IP hit it, which reproduces FS-1 rather than a test fault. |
| H-6 | ENV LIMIT | `next dev` rather than a production build; a mocked browser geolocation. | P5 (hydration warning) is dev-only and not counted. |
| H-7 | Not a harness error | J1 lane D "Sent by SMS" came from the local channel mapping. | Narrowed to P-8. |

## Design lens (0–10; handoffs in `packages/design/handoff/*`)

Recommended option taken at every gap: each one is recorded as a finding above. Nothing was changed.

| Screen | Copy | Hierarchy | Error states | Mobile layout | What would make it a 10 |
|---|---|---|---|---|---|
| A3 "What do you sell?" incl. the **Pharmacy** card (D-76) ([J5-E-02](img/J5-E-02-what-do-you-sell.png)) | 10 | 9 | n/a | 9 | The Pharmacy card copies the A3 cards exactly: the same 84px `m-opt` card, the 56px tile, "Step 1 of 2", "Joining a team instead?" and "Next" (`merchant-mobile/README.md:76`). The tile reads as a drawn sibling. A 10 needs the upstream redraw D-76 asks for. |
| A4 "Your business" ([J3-10](img/J3-10-location-harare.png)) | 7 | 8 | 8 | 9 | The mock shows an address ("5th Street, Mbare") and an "Or search street or area" field. The app shows "Your current location" and, without a key, no search box. Its hint still says "search for your street" (`sign-up.ts:60`). |
| Orders home, new business ([J3-11](img/J3-11-orders-after-create.png)) | 6 | 8 | 3 | 9 | "You're open" while the business is not live (FS-4). |
| Dish editor ([J3-17](img/J3-17-price-1500.png)) | 6 | 8 | 3 | 8 | Raw Zod text (P-1, P-2). "Saved, but…" shows before saving (P-3). An invalid price disables Save without saying why (J3 P3). |
| Opening hours (C5) ([J3-25](img/J3-25-hours.png)) | 10 | 9 | 2 | 9 | The structure and copy match C5 word for word ("Same every day \| Per day", "Busy mode (+10 min)", "Save hours"; `merchant-mobile/README.md:105`). It can't save a closed day, and the failure is raw developer text (LB-2). |
| Shop Inventory and stock ([J5-A-11](img/J5-A-11-items-list.png)) | 9 | 9 | 8 | 9 | Shop words ("Inventory", "+ Add an item") match `merchant-v2/README.md:24,182`. |
| Pharmacy Inventory and team ([J5-E-10](img/J5-E-10-items-list.png), [J5-F-01](img/J5-F-01-team.png)) | 8 | 8 | 8 | 9 | No Rx marker on items (P-11). The Pharmacists section is clear. |
| Shop hand-over ([J5-D](img/J5-D-merchant-order-rider-assigned.png)) | 7 | 7 | 1 | 9 | BRIEF.md:54 draws "Seal the bag → Rider photographed it → Say the code". The app's checklist has those three steps, but no code ever appears and the failure is silent (LB-1). Fragments appear when the rider has no name (P-12). |

**Copy mismatches (both strings quoted):**
- **A4 search hint.** The handoff field says "Or search street or area" (`merchant-mobile/README.md:77`). The app hint says "Use your current location, or search for your street." (`sign-up.ts:60`) and may render with no search field (Polish).
- **Pharmacy notice.** browse-v2 `B.list.otc` reads "Over-the-counter only. No prescription medicine yet." Order flow v2 draws the Rx states (R8a/R8b). The two handoffs disagree, and the owner holds the call (D-76 §2). See FS-5.
- **Code-screen channel.** The phone screen says "We'll send a 6-digit code on WhatsApp" (`calm-mint-v2-2026-10/README.md:87`, matched by `onboarding/copy.ts:17`), but the code screen can say "Sent by SMS" (P-8).

**User-facing messages in the reports that are good as written:** "That code doesn't match. 4 attempts left." · "This shop has no item with a photo yet — its shop would be empty." · "Take a photo of the sealed bag before you collect the order." · "Only a pharmacist on your team can check prescriptions." · "Check the prescription before marking the order packed." · "That drop-off is outside our service area. We deliver across Harare, …". They are clear, specific and follow the house voice: copy 9, error states 9.

## Shops and pharmacies: plain answers

- **Shops are not launch-ready end to end.** Sign-up, items, photos, stock, go-live, the Shops list, search, the cash order, sealed-bag proof, the door cash, cash back (ledger nets to $0.00), auto-cancel and the `SHOPS_ENABLED` kill switch all PASS. **But no shop order can be collected through the merchant web (LB-1)**, and a shop closed on Sundays can't save its hours (LB-2).
- **Pharmacies are not launch-ready end to end.** This passed:
  - sign-up through the Pharmacy card
  - go-live
  - the Pharmacy list and search (separate from Shops)
  - the pharmacist tick
  - an OTC order to $0.00
  - the prescription upload, the pending gate, pharmacist-only approve, decline with re-pricing, decline that cancels an all-Rx order
  - the `RX_ENABLED` kill switch

  The same LB-1 and LB-2 apply. The customer notice also contradicts Rx being on (FS-5). An approved Rx order was never delivered, so the rider's "saw the original" tick is untested.
- **Is production running the D-76 release? Yes.**
  - D-76 (`8395afd`, #1059) and its ungate (`eac770d`, #1060) are ancestors of `9455c98`, which production API and merchant web both deployed successfully on 2026-10-05.
  - The deploy log shows `SHOPS_ENABLED: true`, `PHARMACY_ENABLED: true` and `RX_ENABLED: true`.
  - That means LB-1 and LB-2 are live in production for every shop and pharmacy today.
  - Whether `merchant.lyniago.com` renders the Pharmacy card was not checked (off limits). The card ships in the deployed commit.

## Coverage per journey

Counts are from each report's own verdict where it states one, otherwise from its result-table rows.

| Journey | PASS / FAIL / BLOCKED / NOT RUN | Review notes |
|---|---|---|
| J1 Rider (run 1) | 33 / 2 / 0 / 0 | The 2 FAILs are one Polish issue (P-7). |
| J1 follow-up lanes A–D | A 27/4/0/0 · B 46/4/1/0 (stated) · C 26/7/1/1 · D 15/1/2/0 (rows) | 1 launch blocker (LB-3) and several Fix soon items. "2 launch blockers" was re-ranked: LB2 → FS-1. |
| J2 Send a parcel | 22 / 2 / 0 / 0 | Both FAILs confirmed (FS-10, P-6). |
| J3 Restaurant sign-up | 21 / 3 / 2 / 1 | Its launch blocker is confirmed (LB-2). The BLOCKED and NOT RUN rows are env limits (H-3, H-4). |
| J4 Restaurant order | 32 / 0 / 0 / 0 | The PASS verdict holds for auto-accept restaurants only. H-1 masked LB-1. |
| J5 Shops and pharmacies | 67 / 5 / 0 / 0 | Both launch blockers confirmed (LB-1, LB-2). |

None of the five journeys is NOT RUN, and all five reports are present.

## Doc vs code (where a report, doc or comment and the code disagree; the code wins)

- `food-order.service.ts:979`: the comment says `merchantPhase` "stays `ready_for_pickup` for the whole C3 dispatch lifecycle". `food-dispatch.service.ts:431` nulls it on assignment (LB-1).
- `contracts.ts:867`: the comment says "an absent day means closed". `:868` requires all seven days (LB-2). The same false claim is in `hours/page.tsx:95`.
- `money-input.ts:2`: the comment says it "mirrors the server's … ≤100000". The dish contract caps at 1000 (P-1).
- `prescription.service.ts:44`: the comment says Rx is "default off". `env.ts:401` defaults it to `"true"` (J5).
- `admin.controller.ts:358`: the comment says go-live "Refuses shops". `admin-merchants.service.ts:312-323` lets shops through (J5).
- J1's subagent check: A3's "production boots green with no channel creds" is true of `env.ts`, but the `release-azure.yml:232-282` preflight refuses unarmed channels. C1's line is `use-push-registration.ts:158`, not `:172`. J1 row 3a's "grace path at `:554`" is where the grace record is written; the real cause is `:895-899`.
- J1 report LB1 "needs the owner's check": **settled by the deploy log** (`PUSH_PROVIDER: noop`).
- CLAUDE.md says "rev 2 export changed the mocks to SMS". The current Calm Mint v2 handoff says WhatsApp, and the app follows it (J1 run 1). That is not a defect.
- `auth.service.ts:570-571` says `MIN_SUPPORTED_APP_VERSION` retires old clients. The gate is off in production (P-10).

## Not tested by automation

These were not tested: native app screens on a real device, push delivery, real GPS, the real camera and cloud storage, real OTP delivery, the real Didit check, `merchant.lyniago.com` in production, the admin web UI and carrier NAT behaviour.

---
Report only: nothing outside `docs/e2e-runs/2026-10-05/` was changed, and no code was fixed. No PRs, issues, workflow runs or deployments were made.
