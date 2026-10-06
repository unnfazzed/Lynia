**289 of 325 steps passed; 3 launch blockers.**

# LyniaGo E2E test results: 2026-10-05 (run 7 of 7, summary, report only)

All 3 launch blockers are live in production today. Production runs `9455c98`, which has the same app code these runs tested (REVIEW.md). Restaurant orders that the restaurant accepts automatically work end to end. So do parcels and rider sign-up.

- **Shops launch-ready? No.** Riders can't collect any shop order (LB-1), and a shop closed on any day can't save its hours (LB-2). Everything else passed: sign-up, items, stock, go-live, browse, cash order, sealed-bag photo, cash back to $0.00 and the kill switch.
- **Pharmacies launch-ready? No.** They have the same two blockers. The customer screen also says "No prescription medicine yet" while prescriptions are on (FS-5). **Production already runs the pharmacy release (D-76).** The deploy log shows `PHARMACY_ENABLED: true` and `RX_ENABLED: true`, and the D-76 commits are in the deployed `9455c98`. This means the blockers already affect real pharmacies.

## Per journey

| Journey | Passed | Failed | Blocked | Not run |
|---|---|---|---|---|
| Rider | 147 | 18 | 4 | 1 |
| Send | 22 | 2 | 0 | 0 |
| Business | 21 | 3 | 2 | 1 |
| Restaurant order | 32 | 0 | 0 | 0 |
| Shops | 36 | 3 | 0 | 0 |
| Pharmacies | 31 | 2 | 0 | 0 |

<details><summary>How these were counted</summary>

- **Rider** is J1 run 1 (33/2/0/0) plus the four follow-up lanes A–D (27/4/0/0, 46/4/1/0, 26/7/1/1, 15/1/2/0), as REVIEW.md counted them.
- **Shops and Pharmacies** are the two parts of J5, counted from its result tables. Shops has 39 rows and Pharmacies has 33.
- **Restaurant order** shows 32 passes. REVIEW.md (H-1) found that the test script got the pickup code in a way the merchant web never does. That hid LB-1 for restaurants that accept orders by hand. The PASS holds only for restaurants that accept automatically.
- **Business** has 2 BLOCKED and 1 NOT RUN steps. These were test-environment limits, not app faults (H-3, H-4).
- Every report is present. No journey is NOT RUN.
</details>

## Launch blockers

The code evidence below was re-checked against `origin/main` @ `2f260df` in this run.

### LB-1 · A rider can't get the pickup code for shop, pharmacy or hand-accepted restaurant orders
**What happens:** the rider arrives and the hand-over screen says "Say the code to…", but no code appears. The order is stuck.

**Repro:**
1. A shop accepts and packs an order.
2. A rider accepts the job.
3. Open the order in the merchant web. No code is shown and no error appears.

<details><summary>Code evidence</summary>

- `apps/api/src/merchant/food-dispatch.service.ts:431` sets `merchantPhase: null,` when a rider accepts.
- `apps/api/src/merchant/food-order.service.ts:983` then refuses: `if (order.merchantPhase !== "ready_for_pickup") throw new ConflictException("This order isn't ready for pickup yet");`
- `apps/merchant/app/(app)/queue/[id]/page.tsx:965-969` asks for the code only after a rider is assigned, and hides the failure: `.catch(() => setCode(null))`.
- `food-order.service.ts:380` `const autoAccept = merchant.businessType !== "shop" && …`, so every shop and pharmacy order takes this path.
- Found in J5 steps D6 and H1d.
</details>

### LB-2 · A business closed on any day can't save its opening hours
**What happens:** the owner unticks Sunday and taps **Save hours**. They see "hours: Invalid input: expected object, received undefined" and nothing is saved ([J3-26](img/J3-26-hours-saved.png)). This affects restaurants, shops and pharmacies.

**Repro:** Hours → untick any day → Save hours.

<details><summary>Code evidence</summary>

- `packages/shared/src/contracts.ts:867-868` has the comment `/** … an absent day means closed that day. */`, but the code is `z.record(z.enum(DAY_KEYS), MerchantHoursWindow)`.
- `zod` is `^4.6.2` (`packages/shared/package.json:41`). In Zod 4, every day key in that record is required.
- The web relies on the comment's claim, not on the code: `apps/merchant/app/(app)/hours/page.tsx:95`.
- J3 step 21 and J5 step A10 each reproduced the failure on their own.
</details>

### LB-3 · Production push notifications are off
**What happens:** riders get no new-job alerts. Customers and merchants get no order updates while their phone is locked.

**Repro:** the production deploy log (Release (Azure) run #131, 2026-10-05) shows `PUSH_PROVIDER: noop`. Every send "succeeds" without sending anything.

**Owner action:** once the Firebase key is in place, set the `PUSH_PROVIDER` repo Variable to `fcm`.

<details><summary>Code evidence</summary>

- `infra/azure/containerapps.tf:51` `PUSH_PROVIDER = "noop" # E5: until the new Firebase credential exists`
- `.github/workflows/release-azure.yml:412` `PUSH_PROVIDER: ${{ vars.PUSH_PROVIDER || 'noop' }}`
- `apps/api/src/config/env.ts:105` `.default("noop")`
- The production value comes from REVIEW.md's recorded read of the deploy log. It was not re-read in this run.
</details>

## Fix soon

Each item has code evidence in REVIEW.md.

- **FS-1:** riders who share one mobile-network IP share one sign-in limit: 10 code checks per 5 minutes (`auth.controller.ts:34`). A rider sign-up event could lock people out.
- **FS-2:** production checks IDs by hand (`KYC_MODE: manual`). A declined rider who taps retry is told "pending", but they never re-enter the review queue (`rider.service.ts:478`).
- **FS-3:** "too many requests" shows as "Couldn't reach LyniaGo. Check your connection" (`throttle.guard.ts:78`, mobile `client.ts:310-317`).
- **FS-4:** a new business is told "You're open" before it is live (`queue/page.tsx:227-228`). This needs a design decision.
- **FS-5:** pharmacy customers are told "No prescription medicine yet" while prescriptions are on (`browse/copy.ts:105`). The owner has this decision pending under D-76 §2.
- **FS-6:** a failed code resend can kill the code the user already has, and a vendor outage counts against users' limits (`auth.service.ts:363-377`).
- **FS-7:** a rider can go online without GPS, skip the service-area check, and then never get a job (`riders.controller.ts:88`, `rider.service.ts:608`).
- **FS-8:** after sign-out, the phone still gets the previous rider's pushes (`auth.service.ts:835-860`).
- **FS-9:** new riders can be asked for their name twice (`profile/setup.tsx:96-98`, `rider/become.tsx:133`).
- **FS-10:** after a price raise, the admin order screen gives the wrong fare source (`admin-orders.service.ts:597`).
- **FS-11:** a duplicate-ID hold says "Finish verifying" and pays for a new ID check. This only happens in auto mode, which production is not running (`rider.service.ts:929-930`).

## Polish

There are 12 items, P-1 to P-12, in REVIEW.md. The main ones:
- Prices over $1,000 show raw developer text (P-1, P-2).
- An unsaved dish says "Saved, but…" (P-3).
- An ignored order is labelled "closed" (P-4).
- A shop order says "Restaurant not found" when shops are switched off (P-5).
- A completed admin timeline still says "now" (P-6).
- A correct code is used up when a device refuses sign-in (P-7).
- "Sent by SMS" can appear next to "Resend on WhatsApp" (P-8).
- The force-update gate is off in production (P-10).
- Pharmacy items have no Rx marker (P-11).

## Harness errors / env limits

- **H-1, harness error:** J4 got the pickup code before dispatch, which hid LB-1.
- **H-2, harness gap:** J1 tested automatic ID checks, but production checks by hand. This is how FS-2 was found late.
- **H-3, env limit:** there was no local photo storage, so J3 steps 16 and 18 are BLOCKED.
- **H-4, env limit:** there was no Google Places key, so J3 step 6 is NOT RUN.
- **H-5, env limit:** a shared local IP hit the sign-in limit. This reproduces FS-1 rather than being a test fault.
- **H-6, env limit:** the merchant web ran in dev mode with mocked geolocation.
- REVIEW.md moved J1's "2 launch blockers" down. It kept push (LB-3) as a blocker and made shared-IP limits Fix soon (FS-1).

## Unverified

These rest on a document's word, or on nothing that was checked:
- How large the carriers' shared-IP pools are, which sets the real impact of FS-1.
- The value of the production Google Places key.
- Whether `merchant.lyniago.com` actually shows the Pharmacy card. The card is in the deployed commit, but the live site was not opened.
- Whether the rider's "saw the original prescription" tick works. No approved prescription order was ever delivered.

## Not tested by automation

- Native app screens on a real phone
- Push delivery
- Real GPS
- Real SMS/WhatsApp OTP codes
- The real ID check (Didit)
- The real camera and cloud storage
- `merchant.lyniago.com` and the admin web in production
- Carrier network behaviour

**Next step:** fix LB-1 to LB-3. Then run the human phone script, the "LyniaGo Launch Tests" artifact, on real phones.

---
Report only: nothing outside `docs/e2e-runs/2026-10-05/` was changed, and nothing was fixed. No production or vendor calls were made in this run.
