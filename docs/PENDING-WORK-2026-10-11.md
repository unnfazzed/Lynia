# Pending work: 2026-10-11

What is still open after waves 0–4 of the 2026-10-07 reviewed list (`docs/REVIEWED-ISSUES-2026-10-07.md`).
Every item names its ID, what is wrong, and how to fix it.

## Where things stand

| Area | State |
|---|---|
| Code on `main` | All five wave-4 PRs merged (#1134–#1138). Every reviewed item the owner selected has a **FIXED** row in `docs/KNOWN_BUGS.md`, except the ones below. |
| API (Azure) | Live, migration 0087 applied, canary passed. |
| Merchant site / customer web | Live (auto-deploy on merge). |
| Expo OTA | `preview` branch: Android group `2d16f6b2`, iOS group `8c612fb9`. |
| Google Play | Build `64ba32d4` (v0.51.0, versionCode 46) FINISHED; submission `14e31fe5` FINISHED on **Closed testing**. |

Legend: **Who** = Owner (you do it, no code) · Decision (you choose, then Claude codes it) · Design (waits for a new
design export) · Code (Claude can do it now, no decision needed).

---

## 1. Owner actions: no code needed

### 1.1 Tick a pharmacist on every pharmacy (high)
- **Why:** prescription (Rx) orders need a ticked pharmacist to approve them (C3a). A pharmacy with nobody ticked
  hides its Rx items and refuses Rx orders with `rx_unavailable`.
- **How:** sign in at merchant.lyniago.com as the pharmacy owner → **Team** → **Pharmacists** → switch on
  "{name} is a pharmacist" for at least one person. Repeat for every pharmacy (and every branch).
- **Check:** open that pharmacy in the customer app. Its Rx items should now show and be orderable.
- **Optional code help:** an admin-side toggle so you can tick it for them (see 3.4).

### 1.2 Run the photo thumbnail backfill once (low urgency)
- **Why:** D7 thumbnails are made on save for **new** photos only. Older dish, shop-item, cover and logo photos still
  serve full size until they get a thumbnail. Nothing breaks in the meantime; it is just slower.
- **How:** from a shell or Cloud Run job with the **same env as the API** (DATABASE_URL, storage vars):
  ```bash
  pnpm --filter @lynia/api thumbs:backfill                 # dry run: counts only
  pnpm --filter @lynia/api thumbs:backfill -- --apply      # writes thumbnails
  ```
- It is idempotent and resumable: if it stops, just run it again.

### 1.3 `PII_ENCRYPTION_KEY`: confirmed set, never change it
- The production API refuses to boot with the default or a short key (`apps/api/src/config/env.ts:475`). The
  2026-10-11 release booted and passed canary, so a real key is set.
- **Rule from now on:** do **not** rotate this key casually. Pickup and delivery codes are now stored encrypted
  with it (D2), and so are national IDs. A new key makes every stored code unreadable: live orders would need a code
  re-issue. If it ever must rotate, ask for a re-encryption script first.

### 1.4 Approve the two new D-94 lines
- `docs/DESIGN-DEVIATIONS.md` → **D-94** adds two app-only strings:
  - "{name} isn't available any more. Pick another rider." (a rider you chose went offline or was taken)
  - "No answer in time. Nothing was charged." (a pharmacy never answered an item approval, N-18)
- **How:** reply "approve D-94", or give the wording you want and it gets changed.

### 1.5 Google Play: the road to public release
- Testers on **Closed testing** get v0.51.0 once Google finishes processing it. Phones already on versionCode 45 get
  the same fixes by OTA on their next full restart.
- Still needed before the public listing (`docs/PLAY-STORE-SUBMISSION.md` §8):
  1. Keep the closed test running with enough testers for Google's **~14-day** clock.
  2. Apply for **production access** in Play Console when the clock completes.
  3. Grant the service account production-track permission, then arm the `production` EAS profile.
- Until then, never dispatch `mobile-release.yml` with `profile: production`. Use `closed`.

---

## 2. Decisions needed: then Claude codes them

### 2.1 C18 / U65: what happens if `RESTAURANTS_ENABLED` is blank
- **Today:** restaurants are **on**, because the Azure deployment variable `RESTAURANTS_ENABLED` is set to `true`.
- **The risk:** the API's default is `false` (`apps/api/src/config/env.ts:407`), and `release-azure.yml:429` passes
  `${{ vars.RESTAURANTS_ENABLED }}` with no fallback. If that variable is ever deleted, renamed or left blank on a new
  environment, every restaurant, shop and pharmacy order route switches off at the next deploy, with no error.
- **Options:**
  - **(a) Recommended:** make blank mean on. One line in `release-azure.yml`:
    `RESTAURANTS_ENABLED: ${{ vars.RESTAURANTS_ENABLED || 'true' }}`. Turning it off then needs an explicit `false`.
  - **(b)** Leave as is and close C18. The variable must then never go missing.

### 2.2 P26: same-origin API for the customer web app (speed, medium)
- **What:** app.lyniago.com calls api.lyniago.com, a different origin. Every request that has an id in its URL
  (select a rider, cancel, open an order…) pays an extra CORS "preflight" round trip first: about **+300–600 ms per
  tap on 3G**, on the web app only. The Android app is not affected.
- **Fix:** have the existing app.lyniago.com Cloudflare Worker forward `/api/*` to api.lyniago.com, and build the web
  bundle with `EXPO_PUBLIC_API_URL=https://app.lyniago.com/api`. WebSockets stay on api.lyniago.com.
- **Trade-off you decide:** the Worker stops being static-only, so API traffic from the web app counts against
  Cloudflare Workers request quota. That can cost money above the free tier, and it adds a hop if the Worker is
  down.
- **Effort:** S–M (Worker handler, build variable, config split, smoke test).

### 2.3 P32: split the web bundle (speed, medium, risky)
- **What:** the web build ships every screen, including the whole rider app (about 50–80 KB compressed), in one
  bundle. That costs about 0.4–0.7 s on a first visit over 3G, plus parse time.
- **Fix:** turn on expo-router `asyncRoutes` for the **web build only**. The Android config must stay byte-identical
  so its fingerprint doesn't change. Then fix the three things that would pull routes back into the main bundle:
  prewarm `require`s, service-worker cache cleanup, and `output: "single"` checks.
- **Recommendation:** defer until the web app has real traffic. It is size L, touches boot and caching, and one
  reviewer refuted the size of the gain.

---

## 3. Code Claude can do now (no decision needed, say "go")

### 3.1 MJ-RL6: "Get a new code" kills the buyer's code without warning (low)
- **Where:** `apps/merchant/app/(app)/deliveries/booking/page.tsx:364`.
- **Fix:** a confirm step before rotating: "The buyer's current code stops working. Send them the new one." After
  the rotation, put "Send to buyer" first. The confirm copy is app-only, so it needs a one-line ledger entry.

### 3.2 MJ-RL15: an invite to someone already on another business dead-ends silently (low)
- **Where:** `apps/merchant/app/login/page.tsx:244`.
- **Fix:** when the invited number already belongs to another business, tell the inviter "They already work at
  another business". Show the invitee an Account line "{Business} invited you. Leave this business to join."
  The line is new copy, so it needs a ledger entry and may count as design-gated under D6. Confirm if unsure.

### 3.3 MJ-M11: scheduled order at an auto-accept restaurant rang "0:00 to answer" (verify)
- **Status:** the D1 rewrite of `RingingScreen.tsx` uses the same answer window for every ring, and its countdown
  holds at 0:00 by design. That probably resolved M11, but no row names it.
- **Fix:** add a regression test (a scheduled + auto-accepted order rings with a sane countdown) and a ledger row. If
  the test fails, fix it.

### 3.4 Optional extras offered earlier
- **Admin pharmacist toggle:** let admin tick "is a pharmacist" for a merchant member, so you don't need each
  pharmacy's login (1.1). Size S: an admin endpoint plus a switch on the admin merchant page, audit-logged.
- **Play ledger entry:** add build `64ba32d4` / submission `14e31fe5` to `docs/PLAY-STORE-SUBMISSION.md`.
- **C17 arrival push:** the customer gets no push when the rider actually reaches the door (the early push was
  removed in wave 1). The server stamp `riderAtDropoffAt` now exists, so a push on that stamp ("{rider} is at your
  door") is a small change. Its copy needs approval.
- **FJ partials from #1112** (rider merchant jobs):
  - FJ-M1: no server idempotency key on the hand-over.
  - FJ-M3: no merchant "code OK, photo pending" state.
  - FJ-L1: the hand-over tap is not sent to the server.
  - A typed pickup code is lost if the app is killed while the bag photo is queued.

  Each is size S–M.

---

## 4. Waiting on a design export (owner decision D6: copy only, no new UI)

Ask the designer for these, then they get built. Until then **nothing is rendered** (the rule "not drawn means not
built").

| ID | What's missing | What to ask the designer for |
|---|---|---|
| MJ-RH2 | Ended rider bookings (expired, failed, cancelled, delivered) vanish from the merchant board. The empty-state part is fixed. | "Ended booking" cards on the Deliveries board, with Try again / Call the rider. |
| MJ-M16 | "Joining a team instead?" with no invite bounces silently, so a cashier may create a duplicate business. | A "You need an invite" explaining state on the join screen. |
| MJ-M13 (countdown) | The Rx check has no countdown. Photo links and the alarm are already fixed. | A countdown on the prescription-check screen. |
| U21 | After cancelling a parcel post-pickup, the customer is told to "arrange it with the rider", but there is no way to reach them. | An 18a "after pickup" variant with the rider card and Call / WhatsApp. The server also needs to reveal the rider's phone to the customer. |
| U66 | The venue's "Something else" note reaches the customer only by push, never on screen. | The note on D3b ("{Venue} couldn't take your order"). |
| U04 (UI half) | The locked-code re-issue works, but there is no "your code changed" note or "Send a new code" button. | A locked-code state in after-send-v2 (2.14). |
| U29 (UI half) | No way to remove one prescription page. | The R8b remove-page control (D-92 upstream ask). |
| MJ-RL10 | No "Stay closed today" before opening time. | A "Stay closed today" option on the closed header / switch. |
| MJ-RL13 | Flagged in review as possibly needing UI. | Check with the designer whether it needs a drawing. |

---

## 5. Dropped on purpose: no action

| ID | Why |
|---|---|
| U60 | Needs a sign-up abandoned on one device and finished on another. Negligible. |
| U63 | The "fix" adds a row the design never drew. |
| P28 | Refuted: Home already warms the map. |
| P31, P40 | Negligible gain. P41's useful part was folded into wave 3. |
| MJ-RL5 | Not a bug: the replay key only replays after a lost success, and changing it would book a second rider. |

---

## Quick checklist

- [ ] 1.1 Tick a pharmacist on every pharmacy
- [ ] 1.2 Run `thumbs:backfill -- --apply`
- [ ] 1.4 Approve D-94 copy
- [ ] 1.5 Keep the closed test running ~14 days, then request production access
- [ ] 2.1 C18: choose (a) or (b)
- [ ] 2.2 P26: yes / no / later
- [ ] 2.3 P32: defer (recommended) or do
- [ ] 3.x Say "go" for MJ-RL6, MJ-RL15, MJ-M11 test and any extras
- [ ] 4 Send the design list to the designer
