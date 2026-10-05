# J3 · Business sign-up and inventory (Restaurant): report-only E2E run

**Verdict: 21 of 27 steps passed, 3 failed, 2 blocked, 1 not run. 1 launch blocker: a restaurant that closes on any day of the week cannot save its opening hours.**

Run 3 of 7 · 2026-10-05 · code under test: `origin/main` @ `2f260df` · local stack only (API :3000, merchant web :3100 in `next dev`, PostGIS + Redis in Docker) · the merchant web was driven by Playwright/Chromium at 360×720 · nothing in the repo was changed except this report and its screenshots.

## Results

| Step | Expected (from code) | Actual | Result |
|---|---|---|---|
| 1 Sign in by OTP | `/login` with phone, then a 6-digit code (`apps/merchant/app/login/page.tsx:124,188`). A new user lands on `/onboarding` (`:239-248`) | `POST /auth/otp/request` 201 returned `devCode`; verify 201 → `/onboarding` ([01](img/J3-01-login.png), [02](img/J3-02-otp.png), [03](img/J3-03-after-otp.png)) | PASS |
| 2 "What do you sell?" cards | Restaurant · Shop · Pharmacy (`onboarding/page.tsx:209-228`, D-76) | Restaurant · Shop · Pharmacy, plus "Joining a team instead?" ([04](img/J3-04-what-do-you-sell.png)) | PASS |
| 3 Restaurant → Next | Step 2 "Your business" | Business name, Your name, Location shown ([05](img/J3-05-business-step.png)) | PASS |
| 4 Create with no location | Error `Use your current location, or search for your street.` (`lib/sign-up.ts:60`) | Error shown; no API call ([06](img/J3-06-create-no-location.png)) | PASS |
| 5 Edge: location outside the area (GPS set to Johannesburg) | Client-side `That place is outside the area LyniaGo covers for now.` (`sign-up.ts:38`) | Error shown; no `/merchant/become` call ([07](img/J3-07-location-outside-area.png), [08](img/J3-08-create-outside-area.png)) | PASS |
| 6 Edge: outside the area via a search box | A search box only renders when `NEXT_PUBLIC_GOOGLE_PLACES_KEY` is set (`components/m/LocationField.tsx:131`, `lib/places.ts:14`) | No search box locally, and no vendor calls are allowed in this run. The hint text still says "or search for your street" ([09](img/J3-09-location-change.png)) | NOT RUN (see Polish P2) |
| 7 Use my current location (Harare −17.8292, 31.0522) | Card shows "Your current location · From your phone's location" | As expected ([10](img/J3-10-location-harare.png)) | PASS |
| 8 Create my business | `POST /merchant/become` 201, `pilotEnabled:false`, then `/queue` | 201, `businessType:"restaurant"`, `pilotEnabled:false`, `cashRule:"collect_and_return"`, `autoAccept:true` → `/queue` ([11](img/J3-11-orders-after-create.png)) | PASS |
| 9 Orders screen tells a one-branch owner about the go-live call | No such copy for one branch: the "Almost ready · LyniaGo will call you…" card is gated to owners with 2+ branches (`lib/branches.ts:20-26`, `queue/page.tsx:189`) | It says **"You're open. New orders ring here with sound"** with an **Open** switch, while the restaurant is not live and customers can't see it ([11](img/J3-11-orders-after-create.png), [29](img/J3-29-orders-not-live.png)) | FAIL: Fix soon (F1) |
| 10 Menu: starter category chip | Chips `+ Mains/+ Sides/+ Drinks/+ Breakfast` (`lib/menu-groups.ts:62`) | Same four chips; `+ Mains` → `POST /merchant/categories` 201 ([12](img/J3-12-menu-empty.png), [13](img/J3-13-menu-mains-category.png)) | PASS |
| 11 Add-dish form | Name, Description, Price (USD), Category, photo slot (`components/menu/DishEditorSheet.tsx`) | As expected; file input `accept=image/jpeg,image/png` ([14](img/J3-14-add-dish-form.png)) | PASS |
| 12 Edge: price `abc` | Client `parseAmountInput` → null, Save disabled (`lib/money-input.ts:9`) | Save disabled, **no message** ([15](img/J3-15-price-abc.png)) | PASS (see Polish P3) |
| 13 Edge: price `0` | Save disabled | Save disabled, no message ([16](img/J3-16-price-0.png)) | PASS (see Polish P3) |
| 14 Edge: price `1500` (user-friendly?) | Client allows up to 100,000 (`money-input.ts:9`); server max is 1000 (`packages/shared/src/contracts.ts:1085`) | 400 shown verbatim in the sheet: **"priceUsd: Too big: expected number to be <=1000"** ([17](img/J3-17-price-1500.png)) | FAIL: Polish (F2) |
| 15 Edge: non-JPEG/PNG file (GIF) | `That file isn't a JPEG or PNG — pick one of those and we'll frame it.` (`PhotoPicker.tsx:140`) | Exact message shown; nothing uploaded ([18](img/J3-18-photo-gif-rejected.png)) | PASS |
| 16 Add a dish with a photo (JPEG) | Crop sheet → `POST /uploads/merchant-dish-photo` → PUT to the signed URL | Crop sheet works ([19](img/J3-19-photo-crop.png)). The upload needs GCS or Azure (`adapters/storage/storage.module.ts:13-21`); there is no local adapter and vendors are off limits, so the mint was aborted in the browser. The UI showed "Couldn't reach the server — check the connection and try again. Retry" ([20](img/J3-20-photo-upload-blocked.png)) | BLOCKED |
| 17 Save changes (dish 1, no photo) | `POST /merchant/dishes` 201, `isDraft:true` when there is no photo (`merchant.service.ts:523`) | 201 `isDraft:true`; row reads "Draft · add a photo to go live" ([21](img/J3-21-dish1-saved.png)) | PASS |
| 18 Two more dishes with photos | As step 16 | Saved as drafts (201) because photos can't upload locally ([22](img/J3-22-menu-4-dishes.png)) | BLOCKED (photo part) |
| 19 One draft without a photo | `isDraft:true` | "Mazoe orange (draft)" 201, `isDraft:true` | PASS |
| 20 Edge: delete-dish confirm sheet | Title `Delete <name>?`, body `It comes off your menu. You can't undo this.`, buttons Delete dish / Keep | Exact copy; Delete → `DELETE /merchant/dishes/:id` 200, toast "Delete me deleted" ([23](img/J3-23-delete-confirm.png), [24](img/J3-24-after-delete.png)) | PASS |
| 21 Opening hours save (Sunday closed) | `PATCH /merchant/hours`. Contract comment: "an absent day means closed" (`contracts.ts:867`) | **400** `hours: Invalid input: expected object, received undefined`, shown raw on screen; hours not saved ([25](img/J3-25-hours.png), [26](img/J3-26-hours-saved.png)) | FAIL: **Launch blocker** (F3) |
| 22 Opening hours save (all 7 days) | 200, toast "Hours saved" → `/account` | 200, "Hours saved", Account shows 07:00–21:00 ([30](img/J3-30-hours-7-days-saved.png)) | PASS |
| 23 Taking orders settings, and whether a cash-rule setting exists | Three switches: Accept orders automatically, Show our number to customers, Free delivery (`ordering/page.tsx:18-36`) | Same three. **No cash-rule setting in the web UI.** The API has `PATCH /merchant/cash-rule` (`merchant.controller.ts:107`), which returned 200 for `pay_upfront` and back ([27](img/J3-27-taking-orders.png), [28](img/J3-28-account.png)) | PASS (noted) |
| 24 Admin: awaiting go-live list | `GET /admin/merchants?filter=awaiting_go_live` lists it | 200, one row "E2E Sadza Corner", `pilotEnabled:false` | PASS |
| 25 Admin: go-live refused with no photo'd dish | 409 `no_live_dishes` (`admin-merchants.service.ts:317-322`) | 409 `{"reason":"no_live_dishes","message":"This restaurant has no dish with a photo yet — its menu would be empty."}` | PASS |
| 26 Admin: go-live success, then audit_logs | 201 `pilotEnabled:true`, one `merchant.go_live` audit row (`:325-330`) | Photo keys were seeded by SQL (step 16 is blocked). 201 `pilotEnabled:true` with an auditId. Exactly 1 audit row; the refusal wrote none; a repeat call is idempotent (`auditId:null`). Awaiting list is now empty | PASS (with seeded photos) |
| 27 Customer `GET /restaurants` and menu: listed, draft hidden | Listed; the menu query filters `isDraft:false` (`merchant.service.ts:654`) | Listed. The menu has the 3 photo'd dishes; "Mazoe orange (draft)" is absent. `photoUrl` reads `null` locally because there is no storage signer | PASS |

## Failures

**F3 · Launch blocker: any restaurant closed one or more days cannot save opening hours.**
- **What a user hits:** an owner who unticks Sunday and taps Save hours gets the red line "hours: Invalid input: expected object, received undefined". The hours are not saved, and only "open every day" works.
- **Suspected cause:** `MerchantHours = z.record(z.enum(DAY_KEYS), …)` at `packages/shared/src/contracts.ts:868`. In Zod 4 (`^4.6.2`), a record keyed by an enum is *exhaustive*: every key is required. That contradicts the "absent day means closed" contract on line 867, which the web client follows (`apps/merchant/app/(app)/hours/page.tsx`).
- **Reproduced in isolation:**
  - Calling `z.record(z.enum(["mon","tue","sun"]), W).safeParse({mon:…})` returns issues at path `["tue"]` and `["sun"]`.
  - Through the API, 6 days → 400 and 7 days → 200.
- **Wider impact:** this same schema likely affects every other `MerchantHours` writer, such as shops and pharmacies in run 5. That was not tested here.

**F1 · Fix soon: a new one-branch restaurant is told "You're open" while it is not live.**
- **What a user hits:** after "Create my business", `/queue` shows "All quiet for now · You're open. New orders ring here with sound…" and an **Open** switch. But `pilotEnabled:false`, so customers can't see the restaurant, and nothing tells the owner that LyniaGo will call to switch it on.
- **Suspected cause:** the "Almost ready · LyniaGo will call you to switch this branch on" card (`components/branches/NotLiveHome.tsx:17-25`) is gated on `branchCount >= 2` (`apps/merchant/app/lib/branches.ts:20`). Every brand-new owner has exactly one branch, so they fall through to `queue/page.tsx:227-228`.

**F2 · Polish: a price over $1,000 shows a raw developer error.**
- **What a user hits:** entering 1500 shows "priceUsd: Too big: expected number to be <=1000".
- **Suspected cause:** the client allows prices up to 100,000 (`apps/merchant/app/lib/money-input.ts:9`, whose comment says it "mirrors the server's … ≤100000"), but the dish contract caps at 1000 (`contracts.ts:1085,1098`). The 400 message is shown verbatim (`(app)/menu/page.tsx:116`).

## Polish notes (not failures)

- **P2:** the location hint and GPS-failure notes say "search for your street" (`sign-up.ts:60`, `LocationField.tsx:57,71`), but the search box only exists when `NEXT_PUBLIC_GOOGLE_PLACES_KEY` is set. The production config was not checked here (no production calls). After **Change**, only "Use my current location" remains ([09](img/J3-09-location-change.png)).
- **P3:** an invalid price (`abc`, `0`) just greys out Save changes with no message saying why.
- **P4:** the raw Zod message is shown on screen for every 400 in the dish and hours sheets (F2 and F3 both show `field: Invalid input…` text).
- **P5:** dev-mode only. On `/login`, Next logs a hydration-mismatch warning ("A tree hydrated but some attributes … didn't match"). It is likely harmless in production builds and was not investigated.

## Doc vs code

- The contract comment says "Weekly hours keyed by day; an absent day means closed that day" (`packages/shared/src/contracts.ts:867`). The code (`:868`, Zod 4 enum-keyed record) rejects any absent day with a 400. → F3
- The client price parser comment says "Mirrors the server's own constraint (positive, ≤100000, 2dp)" (`apps/merchant/app/lib/money-input.ts:2`). But the dish contract allows at most 1000 (`contracts.ts:1085`). → F2
- `BecomeMerchantRequest.businessType` comment: "There is no endpoint that changes it". It is restaurant | shop only, and Pharmacy is `shop` + `shopKind:"pharmacy"` (`apps/merchant/app/lib/sign-up.ts:47-49`). This is consistent with D-76's three cards, and no disagreement was found.
- The run prompt implies a public customer list (`GET /restaurants`), but the code requires a bearer token (401 "Missing bearer token" without one). A signed-in customer account was used.
- The run prompt asks for an "awaiting go-live list"; the code implements it as `GET /admin/merchants?filter=awaiting_go_live` (`admin.controller.ts:342`).

## Run notes

- **Test setup by SQL (local DB only):**
  - Admin promotion: `UPDATE profiles SET role='admin' WHERE phone='+263771000002'` (E1).
  - Because photo upload is blocked, three dishes got a photo key in the owner's own namespace with `is_draft=false`: `UPDATE merchant_dishes SET photo_url='dish/<ownerId>/e2e-seed.jpg', is_draft=false …`. This is what lets step 26 test the go-live success path.
- **No storage, no vendor calls:**
  - The browser aborted the dish-photo mint request.
  - The API was restarted with `METADATA_SERVER_DETECTION=none GCE_METADATA_HOST=127.0.0.1:9`, so GCS read-URL signing failed locally instead of reaching out.
  - Local rate limits were raised: `OTP_RL_IP_MAX=500`, `OTP_RL_PHONE_MAX=100`.
- **Guard:** `next dev` rewrote `apps/merchant/next-env.d.ts`. That change was discarded with `git checkout --` before committing. The generated `apps/merchant/AGENTS.md` and `CLAUDE.md` are gitignored and were not committed.

<details><summary>Evidence: sign-up and dish API</summary>

```
POST /auth/otp/request 201 {"sent":true,"channel":"console","deliveryChannel":"sms","devCode":"963081"}
POST /merchant/become  {"ownerName":"Tendai Test","name":"E2E Sadza Corner","businessType":"restaurant",
  "location":{"point":{"lat":-17.8292,"lng":31.0522},"contactPhone":"+263771000001"},"termsAccepted":true}
→ 201 {"id":"12a37d67-…","pilotEnabled":false,"businessType":"restaurant","cashRule":"collect_and_return","autoAccept":true,…}
POST /merchant/categories {"name":"Mains"} → 201
POST /merchant/dishes {"name":"Sadza & beef stew","priceUsd":1500,…} → 400
  {"message":"priceUsd: Too big: expected number to be <=1000",…}
POST /merchant/dishes {"name":"Sadza & beef stew","priceUsd":6.5,…} → 201 {"photoUrl":null,"isDraft":true,…}
DELETE /merchant/dishes/9cb25027-… → 200 {"ok":true}
```
</details>

<details><summary>Evidence: hours (F3)</summary>

```
PATCH /merchant/hours {"hours":{"mon":{…},"tue":…,"sat":{"open":"07:00","close":"21:00"}}}   (no "sun")
→ 400 {"message":"hours: Invalid input: expected object, received undefined",
        "fieldErrors":{"hours":["Invalid input: expected object, received undefined"]}}
PATCH /merchant/hours  (all 7 days) → 200
zod 4: z.record(z.enum(["mon","tue","sun"]),W).safeParse({mon:…}).error.issues
→ [{"path":["tue"],"message":"Invalid input: expected object, received undefined"},{"path":["sun"],…}]
```
</details>

<details><summary>Evidence: admin, audit and customer</summary>

```
GET /admin/merchants?filter=awaiting_go_live → 200 [{"name":"E2E Sadza Corner","pilotEnabled":false,"businessType":"restaurant",…}]
POST /admin/merchants/12a37d67-…/pilot {"enabled":true} → 409 {"reason":"no_live_dishes",
  "message":"This restaurant has no dish with a photo yet — its menu would be empty."}
-- after SQL photo seed: Chicken & rice|f|t · Mazoe orange (draft)|t|f · Rape & kapenta|f|t · Sadza & beef stew|f|t
POST …/pilot {"enabled":true,"note":"e2e go-live"} → 201 {"pilotEnabled":true,"auditId":"8dac7f8b-…"}
POST …/pilot {"enabled":true} → 201 {"pilotEnabled":true,"auditId":null}
SELECT * FROM audit_logs → 1 row: merchant.go_live | actor ad2c0ada-… | target 12a37d67-… | note "e2e go-live"
GET /admin/merchants?filter=awaiting_go_live → 200 []
GET /restaurants (customer) → 200 {"restaurants":[{"name":"E2E Sadza Corner",…}]}
GET /restaurants/12a37d67-…/menu → Mains: Sadza & beef stew 6.5, Chicken & rice 7, Rape & kapenta 4.25 (no draft)
PATCH /merchant/cash-rule {"cashRule":"pay_upfront"} → 200 (no UI for it)
```
</details>

## Not tested by automation

- **Native phone app screens.** This run tested the merchant *web* only, and only in `next dev`, not a production build.
- **Push notifications.**
- **Real GPS:** the browser geolocation was mocked.
- **Real OTP delivery:** console channel only.
- **Real ID check:** stub only.
- **Real photo upload and storage:** GCS/Azure were not contacted, and photo keys were seeded by SQL.
- **The Google Places address search:** it was not rendered without the key.
- **The live server's config.**
