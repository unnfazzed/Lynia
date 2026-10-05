# J5 — Shops and pharmacies end to end (report only)

**Verdict: 67 of 72 steps passed, 5 failed. 2 launch blockers: (1) on every shop and pharmacy order the merchant web cannot show the pickup code once a rider has taken the job, so the rider cannot collect; (2) a business that closes on any day cannot save its hours (J3's F3, reproduced here for shops). The shop and pharmacy money paths net to $0.00, and the whole prescription flow works with `RX_ENABLED` on.**

Run 5 of 7. Tested `origin/main` @ `2f260df` on 2026-10-05 (19:20–19:45 UTC) on a local stack only: PostGIS + Redis in Docker, API on `:3000`, merchant web on `:3100` (`next dev`), and Playwright/Chromium at 360×720. The API's outbound proxy pointed at a dead port, so it could not reach any vendor. Nothing in the repo was changed except this report and its screenshots.

## Production snapshot (read-only GETs, 19:21 UTC)

| GET | Response |
|---|---|
| `https://api.lyniago.com/app/service-flags` | `{"shopsEnabled":true,"pharmacyEnabled":true}` |
| `https://api.lyniago.com/app/order-flags` | `{"rxEnabled":true}` |

Shops, Pharmacy and prescriptions are all switched **on** in production. A read-only GET can't tell whether `rxEnabled:true` comes from the D-76 release default (`env.ts:401`, `default("true")`; `release-azure.yml:431`, `vars.RX_ENABLED || 'true'`) or from an explicitly set variable. Either way, Rx is live for the production API. This run did not check whether the merchant web in production has the D-76 Pharmacy card, because `merchant.lyniago.com` is off limits.

## Results

### Shops

| Step | Expected (from code) | Actual | Result |
|---|---|---|---|
| A1 Sign in by OTP | `/login` → code → new user lands on `/onboarding` | As expected ([01](img/J5-A-01-after-signin.png)) | PASS |
| A2 "What do you sell?" options | Restaurant · Shop · Pharmacy (`onboarding/page.tsx:209-214`) | `["Restaurant","Shop","Pharmacy"]` ([02](img/J5-A-02-what-do-you-sell.png)) | PASS |
| A3 Shop, name, location (Harare GPS), Create my business | `POST /merchant/become` 201, `businessType:"shop"`, dormant; lands on Deliveries | 201, `shop_kind=other`, `pilot_enabled=f`; lands on `/deliveries` with "Book a rider" ([03](img/J5-A-03-business-step.png), [04](img/J5-A-04-after-create.png)) | PASS |
| A4 A new shop is told it is not live yet | No "you're open" claim while `pilotEnabled:false` | Header shows **"● Open"** with an **Open** switch while customers cannot see the shop ([04](img/J5-A-04-after-create.png)) | FAIL: Fix soon (F3) |
| A5 Items tab starter chips | Shop kind `other`: Popular · New in · Specials · Other (`lib/vocabulary.ts:92`) | Same four; `+ Popular` → `POST /merchant/categories` 201 ([05](img/J5-A-05-items-empty.png), [06](img/J5-A-06-items-category.png)) | PASS |
| A6 Three items with photos and prices | Crop → `POST /uploads/merchant-dish-photo` → PUT → `POST /merchant/dishes` 201, `isDraft:false` | All three 201, `isDraft:false`. The photo went through the real browser upload and the API's upload check, against a localhost storage stand-in (see Run notes) ([07](img/J5-A-07-item1.png), [11](img/J5-A-11-items-list.png)) | PASS |
| A7 One photoless draft | `isDraft:true`, "Draft · add a photo to go live" | As expected | PASS |
| A8 Stock off, then on | `POST`/`DELETE …/out-of-stock`; row reads "Off until you turn it back on" | 201 / 200, toasts "Bread loaf is off" / "is back on" ([12](img/J5-A-12-oos-sheet.png), [13](img/J5-A-13-bread-off.png)). "Cooking oil 2L" was left off for C4 | PASS |
| A9 Hours (default, every day) | `PATCH /merchant/hours` 200 → Account | 200, "08:00–22:00" ([15](img/J5-A-15-hours.png), [16](img/J5-A-16-hours-saved.png)) | PASS |
| A10 Hours with Sunday closed | Contract says "an absent day means closed" (`contracts.ts:867`) | **400** `hours: Invalid input: expected object, received undefined` | FAIL: **Launch blocker** (F2, same as J3 F3) |
| A11 Taking orders for a shop | Only "Free delivery" (`ordering/page.tsx:83-85`) | Only "Free delivery" ([17](img/J5-A-17-taking-orders.png)) | PASS |
| B1 Admin: awaiting go-live | Listed with `businessType:shop`, `shopKind:other` → label "Shop · Something else" (`apps/admin/app/merchants/page.tsx:26-29`) | 200, listed, `shop`/`other` | PASS |
| B2 Admin: go-live refused with no photo'd item | 409 "This shop has no item with a photo yet — its shop would be empty." (`admin-merchants.service.ts:317-322`) | Exact 409 | PASS |
| B3 Admin: go-live | 201 `pilotEnabled:true` | 201 with an `auditId` | PASS |
| B4 audit_logs | One `merchant.go_live` row | One row, note "e2e J5 shop go-live" | PASS |
| C1 `GET /app/service-flags` | `{shopsEnabled:true, pharmacyEnabled:true}` | Exact | PASS |
| C2 `GET /shops?service=shops` | Lists the shop | Listed | PASS |
| C3 `GET /shops?service=pharmacy` | Does not list it (`merchant-lookup.util.ts:27-34`) | Not listed | PASS |
| C4 Catalogue | Draft hidden; the out-of-stock item shown with `outOfStock:true` | 3 items listed, "Draft soap" absent, "Cooking oil 2L" `outOfStock:true` | PASS |
| C5 `GET /shops/search?service=shops&q=Mazoe` | Finds the item | `items:[{name:"Mazoe Orange 2L",…}]` | PASS |
| D1 Customer places a CASH order (2 × Mazoe + 1 bread) | 201 `awaiting_accept`: shops never auto-accept (`food-order.service.ts:380`), even though `auto_accept=t` | 201 `awaiting_accept`, goods $10.20 + delivery $3.00 = $13.20, `collect_and_return` | PASS |
| D2 Merchant accepts | `preparing` | `preparing` | PASS |
| D3 Packed / ready | `ready_for_pickup` | `ready_for_pickup` | PASS |
| D4 Auto-dispatch | Offer to the online rider (330 m away) within one 20 s sweep | Offer in 20 s, `distanceKm 3.49` | PASS |
| D5 Rider accepts | `assigned` | `assigned` → `confirmed` → `en_route_pickup` | PASS |
| D6 Merchant shows the pickup code to the rider | The web asks for it once a rider is assigned (`queue/[id]/page.tsx:960-971`) | **409** "This order isn't ready for pickup yet". The hand-over screen shows no code: "3 Say the code to … The order moves on when … types the code." ([D](img/J5-D-merchant-order-rider-assigned.png)) | FAIL: **Launch blocker** (F1) |
| D7 Pickup with no proof | 409 `pickup_photo_required` "Take a photo of the sealed bag before you collect the order." (`merchant-order-proof.service.ts:107-118`) | Exact 409 | PASS |
| D8 Sealed tick only, no photo | Still 409 | 409 `pickup_photo_required` | PASS |
| D9 Photo attached (tick cleared) | Code checks the photo only, not the tick (see Doc vs code) | 201 `photoAttached:true`; pickup then **succeeded with `pickup_bag_sealed=f`** | PASS (doc vs code) |
| D10 Pickup code | Wrong code → 400 with tries left; right code → `picked_up` | "That code doesn't match. 4 attempts left." then `picked_up`. The code came from an API-only reveal before dispatch (F1) | PASS |
| D11 Delivery code before cash | 409 | 409 "The code appears once you both confirm the cash exchange" | PASS |
| D12 Door cash: customer, then rider | 201 / 201 | 201 / 201 | PASS |
| D13 Delivery code → delivered | 6 digits; wrong code shows tries left | `deliveryCode` 6 digits; wrong → 401 "4 attempts left"; right → `delivered` | PASS |
| D14 Merchant cash-back confirm | `settled_cash` | `settled_cash` | PASS |
| D15 `merchant_debt_ledger` sums to 0.00 | `opened +10.20`, `settled_cash −10.20` | Exactly that; sum **0.00** | PASS |
| DE1 Ignored second order auto-cancels | Cancelled by the sweep after 3:00 (merchant socket kept open, D-16) | Cancelled at **196 s**, `rejection_reason=shop_closed` | PASS |
| DE2 Customer cancels while waiting | 201 cancelled; a late merchant accept gets 409 | 201; then 409 "This order can no longer be accepted" | PASS |
| DE3 `SHOPS_ENABLED=false` (API restarted) | flags `shopsEnabled:false`; `/shops?service=shops` 503; catalogue hidden; order refused (`shops.controller.ts:57-62`, `food-order.service.ts:295-310`) | flags false; list 503 "Shops is not available yet"; Pharmacy list still 200; catalogue 404; order 404 "Restaurant not found" | PASS (Polish P1) |
| DE4 Flag back on | Listed again | Listed | PASS |

### Pharmacy

| Step | Expected (from code) | Actual | Result |
|---|---|---|---|
| E1 Second merchant: "What do you sell?" | Three cards incl. Pharmacy (D-76) | Restaurant · Shop · Pharmacy ([02](img/J5-E-02-what-do-you-sell.png)) | PASS |
| E2 Pharmacy → Create my business | `business_type='shop' AND shop_kind='pharmacy'` (`lib/sign-up.ts:74`) | SQL: `shop \| pharmacy \| f`; lands on `/deliveries` ([04](img/J5-E-04-after-create.png)) | PASS |
| E3 Pharmacy starter chips | Pain relief · Cold & flu · Vitamins · Personal care (`vocabulary.ts:85`) | Exact ([05](img/J5-E-05-items-empty.png)) | PASS |
| E4 Two over-the-counter items with photos | 201, live | Paracetamol $1.50, Vitamin C $3.20: 201, `isDraft:false` | PASS |
| E5 "Prescription needed" option on the editor | Shown only for a pharmacy with Rx on (`DishEditorSheet.tsx:60-61,121`) | **Shown** ([06](img/J5-E-06-item-editor-rx-option.png)); Amoxicillin $6.00 saved `rxRequired:true` ([10](img/J5-E-10-items-list.png)) | PASS |
| F1 Owner adds two team members, ticks one pharmacist | Invite → join → `POST /merchant/team/members/:id/pharmacist` `{isPharmacist:true}` 200 | 200 `{ok:true}`; SQL `…0006 staff t`, `…0007 staff f`. Team screen shows a Pharmacists section ([team](img/J5-F-01-team.png)) | PASS |
| F1b A non-pharmacy shop can't tick a pharmacist | 400 `rx_pharmacy_only` (`merchant-team.service.ts:76-78`) | 400 "Only a pharmacy has pharmacists." | PASS |
| F2 Admin: awaiting go-live | `shop` / `pharmacy` → "Shop · Pharmacy" | Listed, `shop`/`pharmacy` | PASS |
| F3 Go-live | 201 `pilotEnabled:true` | 201 with an `auditId` | PASS |
| F4 audit_logs | `merchant.go_live` row | Present (plus two `merchant.team.invite` rows) | PASS |
| G1 `GET /app/order-flags` | `{rxEnabled:true}` | Exact | PASS |
| G2 Lists | In `?service=pharmacy`, not in `?service=shops` | pharmacy=true, shops=false | PASS |
| G3 Catalogue | Rx item listed and flagged | Amoxicillin `rxRequired:true` | PASS |
| G4 Search `?service=pharmacy&q=Amox` | Found under PHARMACY | Found; the same query under `shops` returns nothing | PASS |
| H1a OTC cash order (2 × Paracetamol + Vitamin C) | 201 `awaiting_accept` | Goods $6.20 + $3.00 = $9.20 | PASS |
| H1b Accept → packed | `preparing` → `ready_for_pickup` | As expected | PASS |
| H1c Auto-dispatch → rider accepts | Offer, `assigned` | Offer in 15 s; assigned | PASS |
| H1d Merchant shows the pickup code | As D6 | **409**, no code on the hand-over screen ([H1](img/J5-H1-merchant-order-rider-assigned.png)) | FAIL: **Launch blocker** (F1) |
| H1e Proof: refused without a photo, then sealed tick + photo | 409, then 201 `photoAttached:true, bagSealed:true` | As expected | PASS |
| H1f Pickup code → door cash → delivery code → delivered | All 201 | As expected | PASS |
| H1g Cash back + ledger | `settled_cash`; ledger 6.20 / −6.20 = **0.00** | As expected | PASS |
| H2a Rx order without a prescription | 409 `prescription_required` (`prescription.service.ts:83-85`) | 409 "Add a photo of your prescription to place this order" | PASS |
| H2b `POST /uploads/prescription-photo` | 201, key under `rx/<customerId>/` | 201 `rx/<uuid>/<uuid>.jpg`, uploaded | PASS |
| H2c Place with `{photoKeys, patientName, consent:true}` | 201, prescription `pending` (photo verified at placement) | 201, `pending`, 1 page, goods $7.50 | PASS |
| H2d Mark ready before the check | 409 `prescription_pending` (`food-order.service.ts:921-924`) | 409 "Check the prescription before marking the order packed." | PASS |
| H2e Non-pharmacist staff approves | 403 `not_pharmacist` (`prescription.service.ts:104-106`) | 403 "Only a pharmacist on your team can check prescriptions." The **owner** (not ticked) gets the same 403 | PASS |
| H2f Pharmacist approves (with checklist) | 201; approved by them | 201; SQL `approved`, `checked_by` = the pharmacist; the pharmacist can read the photo (`GET …/prescription` 200) | PASS |
| H2g Packing continues | `ready_for_pickup` | `ready_for_pickup`; the customer read shows `prescription.status:"approved"` | PASS |
| H3a Decline (Amoxicillin + Paracetamol), reason Expired | Rx line off, re-priced, order continues (`prescription.service.ts:126-185`) | Goods $7.50 → **$2.50** (Paracetamol $1.50 + small-order fee $1.00), total $5.50; Amoxicillin `available:false`; the customer sees `declined` / `expired` / "Dated 2025" | PASS |
| H3b Decline an all-Rx order | `cancelled`, `rx_declined` | SQL `cancelled \| rx_declined`; the customer read shows cancelled with the prescription declined (`unreadable`) | PASS |
| H4a `RX_ENABLED=false` (API restarted) | `rxEnabled:false`; Rx item hidden; Rx order 409 `rx_unavailable` (`prescription.service.ts:80-82`) | flags false; catalogue and search hide Amoxicillin; Rx order 409 "Prescription medicines can't be ordered in the app yet."; an OTC order still 201 | PASS |
| H4b Flag back on | Rx item listed again | Listed | PASS |
| X1 Customer copy agrees with Rx being on | The Pharmacy screens shouldn't say there is no prescription medicine while `rxEnabled` is true | Pharmacy list and storefront always show **"Over-the-counter only. No prescription medicine yet."**, regardless of `rxEnabled` (`apps/mobile/src/ui/browse/copy.ts:105`; rendered unconditionally at `ShopListScreen.tsx:129`, `ShopStoreScreen.tsx:374`, `sheets.tsx:288-293`; locked in by `shop-screens.test.tsx:157-173`) | FAIL: Fix soon (F4, owner decision pending per D-76 §2) |

## What still blocks a real shop or pharmacy launch

1. **F1: the rider can't get the pickup code (Launch blocker, all shop and pharmacy orders).**
   - **What a user hits:** the rider arrives at the counter. The merchant's hand-over screen says "Say the code to …" but shows no code, and the rider cannot collect. The merchant can't cancel either: "This order can no longer be cancelled here." The only way out this run found is the rider dropping the job. That returns the order to "ready", where the code can be shown, and then the next rider hits the same wall.
   - **Cause (from code):** the merchant web asks for the code only once `order.riderId` is set (`apps/merchant/app/(app)/queue/[id]/page.tsx:960-971`; before that it says "Finding a rider. The code appears once one takes it.", `:653`). But `revealPickupCode` refuses unless `merchantPhase === "ready_for_pickup"` (`apps/api/src/merchant/food-order.service.ts:983`). Dispatch-accept sets `merchantPhase: null` in the same write that sets `riderId` (`apps/api/src/merchant/food-dispatch.service.ts:431`). `markReady` mints a code and throws away the plaintext (`food-order.service.ts:927-934`), so nothing on screen can recover it.
   - **Scope:** shops and pharmacies never auto-accept, so **every** shop and pharmacy order takes this path. Manual-accept restaurants do too. Auto-accepted restaurant orders are codeless and unaffected. J4 passed only because its script revealed the code over the API *before* dispatch, which the web never does.
   - **Not a fallback:** the hand-over link (`handover-fallback`, `food-order.service.ts:1049-1066`) also needs the code (`confirmHandoverLink`), and it needs `MERCHANT_WEB_URL`.
2. **F2: hours with a closed day can't be saved (Launch blocker; J3 F3, now confirmed for shops).** `PATCH /merchant/hours` without `sun` returns 400 `hours: Invalid input: expected object, received undefined`. The cause is `MerchantHours = z.record(z.enum(DAY_KEYS), …)` at `packages/shared/src/contracts.ts:868`: in Zod 4, a record keyed by an enum is exhaustive. A shop or pharmacy closed on Sundays can't save its hours.
3. **F3: a new, not-yet-live business is shown as "Open" (Fix soon; J3 F1, here for shops and pharmacies).** The header of `/deliveries` reads "● Open" with an Open switch while `pilot_enabled=f` ([A-04](img/J5-A-04-after-create.png), [E-04](img/J5-E-04-after-create.png)). The owner isn't told that LyniaGo still has to switch them on.
4. **F4: the "Over-the-counter only. No prescription medicine yet." notice contradicts Rx being on (Fix soon, owner decision).** Production serves `rxEnabled:true`, and this run ordered prescription medicine end to end. But every Pharmacy list and storefront still tells customers there is none. D-76 §2 leaves the copy to the owner. A related merchant-side comment still says prescription items "stay out until regulators sign off" (`apps/merchant/app/lib/vocabulary.ts:83`); it isn't visible to users.

## Polish notes (not failures)

- **P1:** with `SHOPS_ENABLED=false`, placing a shop order answers 404 **"Restaurant not found"** (`food-order.service.ts:310`). The `noun` variable on the next line, which would say "shop", is not used for this message.
- **P2:** an ignored shop order is stored with `rejection_reason=shop_closed` (`food-order.service.ts:1221`), the same code as a closed shop, so customer copy keyed on it would say the shop was closed (also noted in J4).
- **P3:** the pharmacy Inventory list shows no marker on the "Prescription needed" item ([E-10](img/J5-E-10-items-list.png)), so the owner can't see at a glance which items need a prescription. Not checked against the merchant-v2 handoff.
- The item thumbnails show initials, not photos, in these screenshots. That comes from the local storage stand-in (it answers a signed GET with metadata, not bytes). It is not an app defect.
- The rider's name is blank on the hand-over screens ("photographs it", "Waiting for ’s photo"). The test riders were created through the API without a profile name. It is a test artifact.

## Doc vs code

- **Sealed-bag tick.** The run prompt says pickup "requires the sealed-bag tick AND photo". The code requires only the photo: `assertPickupProofIfRequired` checks `pickup_photo_key` alone (`apps/api/src/merchant/merchant-order-proof.service.ts:107-118`). A pickup with `bagSealed:false` and a photo succeeded (D9). The tick is stored as evidence (`pickup_bag_sealed`) but not enforced server-side.
- **Rx default.** `prescription.service.ts:44` says prescriptions are "behind RX_ENABLED (default off)". `env.ts:401` defaults it to `"true"` (D-76), and so do the release workflows (`release-azure.yml:431`).
- **Admin go-live and shops.** `admin.controller.ts:358` says the switch "Refuses shops (they open with LyniaGo Shops)". The code lets shops and pharmacies go live through it (`admin-merchants.service.ts:312-323`); B3 and F3 returned 201.
- **Merchant pickup code.** The prompt's order is "packed/ready; auto-dispatch … rider accepts … pickup code". Over the API the code can be revealed only between "ready" and the rider accepting (`food-order.service.ts:983`). The merchant web asks for it only after the rider accepts. → F1.
- **Contract hours comment.** "an absent day means closed that day" (`contracts.ts:867`) vs. the exhaustive enum record at `:868`. → F2.
- **"Awaiting go-live" label.** The prompt expects the admin list to read "Shop · Something else". The API returns `businessType`/`shopKind`, and the admin web builds the label (`apps/admin/app/merchants/page.tsx:26-29` + `MERCHANT_SHOP_KIND_LABELS.other = "Something else"`, `contracts.ts:890`). The admin web itself was not rendered in this run.

<details><summary>Evidence: shop order (HTTP + SQL)</summary>

```
POST /restaurants/{shop}/orders        201 phase=awaiting_accept goods=10.2 delivery=3 total=13.2 rule=collect_and_return
POST /merchant/orders/{o}/accept       201 phase=preparing
POST /merchant/orders/{o}/mark-ready   201 phase=ready_for_pickup
GET  /merchant/orders/dispatch/offer   offer in 20 s, distanceKm 3.49
POST /merchant/orders/{o}/dispatch/accept 201 {"status":"assigned"}
POST /merchant/orders/{o}/pickup-code/reveal 409 "This order isn't ready for pickup yet"     ← F1
POST /merchant/orders/{o}/confirm-pickup (no photo) 409 {"reason":"pickup_photo_required",…}
POST /merchant/orders/{o}/pickup-proof {"key":…} 201 {"photoAttached":true,"bagSealed":false}
POST /merchant/orders/{o}/confirm-pickup 201 {"status":"picked_up"}   (pickup_bag_sealed = f)
POST /merchant/orders/{o}/debt/confirm-cash {"amount":10.2} 201 {"debtStatus":"settled_cash"}
SELECT type, amount FROM merchant_debt_ledger WHERE order_id=…  → opened 10.20 | settled_cash -10.20 ; SUM 0.00
```
</details>

<details><summary>Evidence: F1 reproduced three times; recovery attempts</summary>

```
order 80058d29 (shop)     reveal after assign → 409; merchant cancel → 409 not_cancellable
order 96f4c32a (shop)     reveal after assign → 409; merchant web /queue/{id} → POST …/pickup-code/reveal 409
                          rider POST …/dispatch/drop → 201 {"status":"requested"}; SQL merchant_phase=ready_for_pickup
                          reveal now → 201 {"pickupCode":"354160"}; re-dispatched; reveal after the new assign → 409 again
order 5ff51c91 (pharmacy) reveal after assign → 409; hand-over screen shows no code
Hand-over screen text: "1 Seal the bag · 2 photographs it · 3 Say the code to — The order moves on when types the code."
```
</details>

<details><summary>Evidence: auto-cancel, cancel, flags</summary>

```
DE1 placed 19:29:50Z, acceptDeadlineAt 19:32:50.567Z → SQL: cancelled | shop_closed | 196 s
DE2 POST /restaurants/orders/{o}/cancel 201; POST /merchant/orders/{o}/accept 409 "This order can no longer be accepted"
DE3 SHOPS_ENABLED=false: /app/service-flags {"shopsEnabled":false,"pharmacyEnabled":true}
    /shops?service=shops 503 "Shops is not available yet" · /shops?service=pharmacy 200
    /shops/{shop}/catalogue 404 · POST /restaurants/{shop}/orders 404 "Restaurant not found"
H4a RX_ENABLED=false: /app/order-flags {"rxEnabled":false}; catalogue = Paracetamol, Vitamin C
    Rx order 409 {"reason":"rx_unavailable","message":"Prescription medicines can't be ordered in the app yet."}; OTC order 201
```
</details>

<details><summary>Evidence: prescriptions</summary>

```
place [Amox, Para] (no rx)  409 {"reason":"prescription_required"}
POST /uploads/prescription-photo 201 key=rx/<customer>/<uuid>.jpg
place with rx               201 prescription {"status":"pending","patientName":"Tendai Moyo","pageCount":1}
mark-ready                  409 {"reason":"prescription_pending"}
approve (staff …0007)       403 {"reason":"not_pharmacist"}
approve (owner …0002)       403 {"reason":"not_pharmacist"}
approve (pharmacist …0006)  201 · SQL order_prescriptions: approved | checked_by = pharmacist
mark-ready                  201 ready_for_pickup
decline mixed (expired)     goods 7.50 → 2.50, total 5.50; Amoxicillin available=false; status requested/preparing
decline all-Rx (unreadable) SQL orders: cancelled | rx_declined; customer GET status=cancelled
team SQL: +263771000002 owner f / +263771000006 staff t / +263771000007 staff f
```
</details>

<details><summary>Evidence: admin and audit</summary>

```
GET /admin/merchants?filter=awaiting_go_live → {"name":"E2E Corner Shop","businessType":"shop","shopKind":"other","pilotEnabled":false,…}
POST /admin/merchants/{shop}/pilot {"enabled":true} → 409 {"reason":"no_live_dishes","message":"This shop has no item with a photo yet — its shop would be empty."}
POST /admin/merchants/{shop}/pilot {"enabled":true,"note":"e2e J5 shop go-live"} → 201 {"pilotEnabled":true,"auditId":"e463b7c7-…"}
audit_logs: merchant.go_live | 6b7d88ea-… | e2e J5 shop go-live
pharmacy: awaiting row shop/pharmacy → 201 pilotEnabled:true; audit_logs merchant.go_live | 3026be04-… | e2e J5 pharmacy go-live
```
</details>

<details><summary>Run notes</summary>

- **API env:**
  - `NODE_ENV=development OTP_CHANNEL=console KYC_PROVIDER=stub PUSH_PROVIDER=noop RESTAURANTS_ENABLED=true SHOPS_ENABLED=true PHARMACY_ENABLED=true RX_ENABLED=true MERCHANT_DISPATCH_AUTO_ENABLED=true CORS_ALLOWED_ORIGINS=http://localhost:3100`.
  - `OTP_RL_*` limits were raised (E2).
  - `HTTPS_PROXY`/`GCE_METADATA_HOST` pointed at `127.0.0.1:9`, so nothing could leave the container.
- **Photos (local storage stand-in, $0):**
  - There is no local storage adapter (`storage.module.ts:13-22`).
  - The run pointed the GCS client at a ~30-line fake GCS server on `127.0.0.1:4443` (`STORAGE_EMULATOR_HOST`) and signed URLs offline with a throwaway local key (`GOOGLE_APPLICATION_CREDENTIALS`).
  - So the real upload paths ran: browser crop → mint → PUT, then the API's `UploadVerifier` size/type/magic-byte check at attach. They ran for item photos, the sealed-bag photo and the prescription photo, and no photo was seeded in the DB.
- **One local-DB edit:** to test B2's refusal, the shop's three photo'd items were briefly set `is_draft=true`, then restored. Admin promotion used `UPDATE profiles SET role='admin'` (E1).
- **Rate limit:** `POST /auth/otp/verify` has a hard 10 per 5 minutes per IP (`auth.controller.ts:34`). The local driver cached tokens and sent a distinct `x-forwarded-for` per login (`trustProxy=1`).
- **Accounts:**
  - shop owner …0001, pharmacy owner …0002, customer …0003, riders …0004/…0008, admin …0005, pharmacist …0006, staff …0007.
  - Shop and pharmacy are at −17.8292, 31.0522. The riders went online 330 m away. Drop-off was in Avondale (3.49 km).
- **Merchant presence:** a socket.io client subscribed to `merchant:queue-subscribe` during the auto-cancel test (D-16).
- **Not completed:** the approved-Rx order was not delivered, so the rider's "I saw the original prescription" door tick was not tested.
- **Guard:** `next dev` rewrote `apps/merchant/next-env.d.ts`. It was discarded with `git checkout --`. `git status --porcelain` showed only `docs/e2e-runs/` before the commit.
</details>

## Not tested by automation

- **Native app screens:** the customer Shops/Pharmacy browse, the prescription upload and the order screens, and the rider app (offer card tags, the sealed-bag camera, the "saw the original" tick).
- **The admin web:** only its API was used.
- **Push** (noop provider) and live socket UI updates.
- **Real GPS:** fixed coordinates were used.
- **The real camera and real cloud storage:** a localhost stand-in was used.
- **Real OTP delivery:** the console channel was used.
- **The real ID check:** stubbed to an instant pass.
