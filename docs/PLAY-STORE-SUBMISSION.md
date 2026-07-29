# Google Play submission package (LR20)

> Everything needed to create, fill in and ship the **LyniaGo** Play Console listing, in the order the
> console asks for it. Companions: `docs/LAUNCH-EXECUTION-RUNBOOK.md` §8c (arming the release
> pipeline), `docs/LAUNCH-DEPLOYMENT-STRATEGY.md` §1b (build/submit mechanics),
> `docs/DATA-RETENTION.md` (the source of truth behind every data claim here).
>
> **Status (2026-07-29):** the Play developer account is approved and can create apps. The repo side
> of the submission is now complete except for the four founder-only items in §7. Nothing here has
> been entered into Play Console yet.

---

## 1. App identity

| Field | Value | Where it comes from |
|---|---|---|
| App name (Play listing, ≤30 chars) | `LyniaGo` | `apps/mobile/app.config.ts` → `name` |
| Package / application id | `zw.co.lynia` | `app.config.ts` → `android.package` — **immutable once published** |
| Default language | English (United Kingdom) — `en-GB` | Copy below is UK-spelled ("anonymised") |
| App or game | App | |
| Free or paid | Free | Commission is charged to riders in-app, not at install |
| Category | Maps & Navigation | Closest fit for a courier marketplace; Business is the alternative |
| Tags | Delivery, Courier, Navigation | |
| Contact email | `support@lyniafinance.com` | Matches `SUPPORT_URL` in `apps/mobile/src/config.ts` |
| Website | *(none — see §7.3)* | |
| Version name at first submission | `0.11.0` | `app.config.ts` → `version` (release-please-managed) |
| Version code | EAS-managed, auto-incrementing | `eas.json` → `appVersionSource: "remote"` + `autoIncrement` |

---

## 2. Store listing copy

Paste verbatim. Character counts are Play's hard limits; the counts given are what the copy uses.

### Short description (80 max — uses 74)

```
Send a parcel across town by motorbike. You name the price, riders bid, you pick.
```

### Full description (4000 max — uses ~1,720)

```
LyniaGo moves your parcel across town by motorbike — and you decide what it costs.

Tell us where it's going, name your price, and nearby riders respond. Some accept your
price, some counter with theirs. You see every interested rider with their price, rating
and ETA, and you choose who carries your parcel. No dispatcher, no fixed tariff, no
haggling back and forth.

SEND SOMETHING
• Set pickup and drop-off on the map, or search for an address
• See a suggested price, then move it up or down — it's your call
• Add a photo and a note so the rider knows exactly what they're collecting
• Watch your rider on the map from collection to hand-over
• Confirm delivery with a one-time code, so a parcel only ends up with the right person
• Rate your rider afterwards

RIDE AND EARN
• Go online and see delivery requests near you
• Accept the offered price or counter with your own
• Follow the route, update the customer as you go, collect your earnings
• Track every job and payout in one place
• Verified riders only — every rider passes an ID check before their first delivery

BUILT FOR HOW ZIMBABWE ACTUALLY MOVES
Deliveries are paid in cash, directly between you and your rider. LyniaGo doesn't handle
the money for your goods and riders never carry a float — they carry the parcel. The app
is built to stay usable on a slow connection: it's light, it caches what it can, and it
tells you honestly when something can't load rather than spinning forever.

SAFETY
• Every rider is identity-verified before they can take a job
• Live tracking on every delivery, so you always know where your parcel is
• A one-time code at hand-over
• An in-app emergency button and a way to report a problem on any trip

Lynia is a marketplace that connects senders and riders. Riders are independent operators,
not employees, and they transport items — they don't buy them for you or handle payment
for them.

Questions? support@lyniafinance.com
```

### App icon

512 × 512 PNG, 32-bit, ≤1 MB. **Derive it from `apps/mobile/assets/icon.png`** (already 1024 × 1024 —
downscale, do not redraw): the store icon and the launcher icon must read as the same mark.

---

## 3. Data safety form

**This section must match the code.** The claims below are generated from
`apps/api/src/privacy/pii-manifest.ts` and `docs/DATA-RETENTION.md`, and
`apps/api/src/legal/legal.content.spec.ts` fails the build if a new personal-data column appears in
the schema without being declared in the published privacy notice. When that test fails, update the
notice **and this table** together — an under-declared Data safety form is a policy violation that
can pull a live listing.

### Overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS everywhere; `Strict-Transport-Security` set globally) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — `https://lyniago.lyniafinance.com/legal/account-deletion` |

### Per-type declarations

`Collected` = leaves the device. `Shared` = passed to a third party. Every row is **required** for app
functionality unless marked optional, and **none** is used for advertising or sold.

| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes¹ | Required | App functionality, Account management |
| Email address | Yes | No | **Optional** | Account management |
| Phone number | Yes | Yes¹ | Required | App functionality, Account management |
| User IDs | Yes | No | Required | App functionality, Account management |
| Government ID (Personal info → Other) | Yes | Yes² | Required (riders only) | Fraud prevention, safety & compliance |
| Approximate location | Yes | Yes¹ | Required | App functionality |
| Precise location | Yes | Yes¹ | Required | App functionality |
| Photos | Yes | Yes² | Required | App functionality, Fraud prevention |
| User payment info (mobile-money number) | Yes | No | Required (riders only) | App functionality |
| Purchase history (wallet ledger) | Yes | No | Required (riders only) | App functionality |
| App interactions | Yes | Yes³ | Required | Analytics |
| Crash logs | Yes | Yes³ | Required | Analytics |
| Diagnostics | Yes | Yes³ | Required | Analytics |
| Other user-generated content (item notes, ratings, reports) | Yes | Yes¹ | Required | App functionality, Fraud prevention |

¹ With the counterparty to that specific delivery only (the customer sees the assigned rider's first
name/photo/rating/live position; the rider sees the customer's first name, the points, and the
delivery contact number). Not with any other user, and not with a third-party company.
² With the KYC verification provider (ID/selfie) and Google Cloud Storage as the storage processor.
³ With Sentry (crash) and PostHog (product analytics) as processors.

**Do NOT tick:** "Data is used for advertising or marketing", "Data is shared with a data broker",
"App collects data for advertising ID purposes" — none is true, and each is independently verifiable
against the dependency list (there is no ads SDK in `apps/mobile/package.json`).

---

## 4. App content declarations

Play Console → **App content**. Every item, with the answer and the evidence.

### 4.1 Privacy policy — ✅ ready

```
https://lyniago.lyniafinance.com/legal/privacy
```

Served by `apps/api/src/legal/legal.controller.ts` — unauthenticated, uncached-by-session, no
geofence, no external subresource (a strict `default-src 'none'` CSP is set and the content test
asserts nothing remote is referenced, so it cannot break for a reviewer on a restricted network).

### 4.2 Account deletion — ✅ ready

```
https://lyniago.lyniafinance.com/legal/account-deletion
```

Play requires **both** a deletion URL and an in-app path for any app offering account creation. The
in-app path is **Account → Settings → Delete account** (`apps/mobile/app/settings/index.tsx`), a
two-tap confirm that calls `DELETE /auth/me`. Regression-tested in
`apps/mobile/app/settings/__tests__/delete-account.test.tsx`.

### 4.3 Ads

**No**, the app contains no ads. There is no ads SDK, no advertising ID use, and no ad mediation.

### 4.4 App access — ⛔ **BLOCKER, see §7.1**

The whole app is behind a phone-number OTP sign-in. Play reviewers **cannot** receive a Zimbabwean
WhatsApp OTP, so "All functionality is available without special access" is false and will fail
review. Demo credentials must be supplied — and the mechanism to honour them does not exist in
production yet. This is the single largest remaining blocker; §7.1 has the detail.

### 4.5 Content rating questionnaire

Category: **Utility, Productivity, Communication or Other**. Answers:

| Question | Answer |
|---|---|
| Violence, sexuality, profanity, controlled substances, gambling, horror | **No** to all |
| Does the app share the user's current location with other users? | **Yes** — a rider's live location is shown to the customer during their delivery |
| Does the app allow users to interact or exchange content? | **Yes** — ratings, comments, reports; plus a phone-call/hand-off between the two parties |
| Does the app allow users to purchase digital goods? | **No** — the rider commission wallet is a real-money service fee, not a digital good |
| Does the app contain user-generated content? | **Yes** — item photos/notes, rating comments |
| Do you provide a way to report/moderate UGC? | **Yes** — in-app report & block plus admin moderation |

Expected outcome: **PEGI 3 / ESRB Everyone / IARC "3+"**, with a "Users Interact" and "Shares
Location" descriptor.

### 4.6 Target audience and content

Target age group: **18 and over only**. Do not tick any child age band — riders must pass identity
verification, and the service is not designed or appealing to children. The app is therefore out of
scope for Families policy and no Designed-for-Families declaration is needed.

### 4.7 Financial features — declare carefully

Play's Financial features declaration exists to catch lending, investing, crypto and payment apps.
LyniaGo is **none** of those, and answering "yes" pulls the listing into a licensing-evidence review
it cannot pass and does not need. The accurate answers:

- **Does your app provide financial products or services?** — the honest answer here is **No**.
  Lynia is a matchmaking marketplace. Customers pay riders in **cash, directly**; the app never
  processes payment for the goods (`docs/CONCEPT.md` §1, "the rider handles the item, never the money").
- The rider commission wallet is a **prepaid balance for the platform's own service fee**, not a
  stored-value or money-transmission product, and it is not offered to customers at all.
- **If Play challenges this**, the defensible position is exactly the above, plus: no lending, no
  interest, no third-party money movement, no crypto, no investment product. Founder should confirm
  with counsel before answering — see §7.4.

### 4.8 Government apps, health, news, COVID-19

**No** to all four.

### 4.9 Data safety

Filled from §3.

---

## 5. Sensitive permission declarations

The manifest requests two permission families that trigger their own Play review. Both need a written
justification **and a demo video** — budget time for this; it is a common cause of a first-submission
rejection.

### 5.1 Foreground service — location (`FOREGROUND_SERVICE_LOCATION`)

Added by the `expo-location` plugin's `isAndroidForegroundServiceEnabled: true`
(`apps/mobile/app.config.ts`, which documents exactly why).

**Declaration text:**

```
LyniaGo is a motorbike courier marketplace. When a rider is actively carrying a customer's
parcel, the app streams the rider's location to that customer so they can watch their
delivery arrive. The rider must be able to switch to a maps app for turn-by-turn
directions while riding, so this streaming has to continue while LyniaGo is in the
background — otherwise the customer loses sight of their parcel exactly when they need it
most. A persistent Android notification is shown for the entire time the foreground
service runs. Location updates start when a delivery is assigned and stop when the
delivery completes or the rider goes offline. The app requests only while-in-use location
permission and never requests ACCESS_BACKGROUND_LOCATION.
```

**Note for the form:** we deliberately do *not* request `ACCESS_BACKGROUND_LOCATION`, so the
background-location policy review (the slow one) should not apply. If Play's form asks anyway,
the answer is that the foreground service runs only during an active, user-initiated delivery.

**Demo video must show:** rider accepts a job → persistent notification appears → app is backgrounded
→ customer's screen shows the rider still moving → delivery completes → notification disappears.

### 5.2 Photos and camera

Justified inline by the permission strings already set in `app.config.ts` (`expo-image-picker`):
ID/profile photo for verification, item and proof-of-delivery photos. No separate declaration needed
unless Play asks about broad photo/video access — the app uses the picker, not
`READ_MEDIA_IMAGES` on the whole library.

---

## 6. Graphics assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 PNG, ≤1 MB | ⚠️ **Derive** from `apps/mobile/assets/icon.png` (1024²) |
| Feature graphic | 1024 × 500 PNG/JPG, no alpha | ❌ **Missing — must be created** |
| Phone screenshots | 2–8 images, 16:9 or 9:16, each side 320–3840 px | ❌ **Missing — must be captured** |
| 7" / 10" tablet screenshots | Optional | Skip — phone-only product |
| Promo video | Optional (YouTube URL) | Skip for v1 |

**Screenshot shot list** (capture from a real release build, not the test APK — the TEST BUILD banner
must not appear). Eight screens, in the order that tells the product story:

1. Home — set a pickup and drop-off
2. Price entry — the suggested price with the adjust control visible
3. Offers list — several riders with price, rating, ETA (the differentiator; lead with this)
4. Live tracking — rider on the map en route
5. Hand-over — the one-time delivery code
6. Rider board — open requests near the rider
7. Rider earnings
8. Rating screen

Use `/qa` or the device checklist in `docs/QA-DEVICE-CHECKLIST.md` to drive the app into each state.

---

## 7. Open items — founder only

These four cannot be closed from the repo.

### 7.1 ⛔ Reviewer access to a login-gated app

**The problem.** Sign-in is phone + OTP over WhatsApp. A Play reviewer in another country cannot
receive that code, so they cannot open the app past the phone screen, and the submission is rejected
under "App access". The existing QA escape hatch does **not** solve this: `OTP_TEST_PHONES` returns
the live code in the HTTP response, and `apps/api/src/config/env.ts` **rejects it at boot in
production** on purpose (it is an account-takeover vector). So today there is no production-safe way
to hand a reviewer a working account.

**Options, worst to best:**

1. *Ship as-is and hope* — will be rejected. Not an option.
2. *Give the reviewer a real Zimbabwean number and relay codes by email* — reviews are asynchronous
   and re-run on every update; this fails the second time and blocks every release.
3. **Recommended: a single allowlisted demo account with a fixed OTP.** One phone number, held in a
   secret (not a repo variable), whose OTP verification accepts one fixed code held in a *second*
   secret. Crucially it must NOT echo the code in the response the way `OTP_TEST_PHONES` does — the
   reviewer is told the code out-of-band via the App access form. Scope it hard: exactly one number,
   customer role, rate-limited like any other, excluded from payouts and from the rider board, and
   auditable. This is what Bolt/inDrive-class apps do.

This is a deliberate, security-sensitive change to the auth path, so it wants an explicit decision
and a `/security-review` pass before implementation — it is not something to slip into a routine PR.
**Decide this first: it gates the entire submission.**

### 7.2 Play Console + EAS credential setup

One-time, human-only, already scripted where possible — run `scripts/eas-arm.sh` and follow the
prompts (`scripts/eas-arm.sh --verify` audits what is armed). In Play Console you must, for
`zw.co.lynia`:

1. Create the app and enrol it in **Play App Signing**.
2. Create a **Play Developer API service account** (Play Console → API access) and download its JSON
   key; `eas credentials` uploads it so `mobile-release.yml` can auto-submit.

### 7.3 Corporate identity on the legal pages

`apps/api/src/legal/legal.content.ts` names "Lynia (LyniaGo), Zimbabwe" as the data controller. Before
the production listing goes live, replace with the **registered company name, registration number and
address**, and designate a CDPA data-protection contact. Counsel should also confirm the retention
windows stated (they are accurate to the code; the question is whether they are the right *policy*).

### 7.4 Financial-features answer

Confirm §4.7 with counsel. The engineering position is solid — no money movement for goods, cash
between the parties, the wallet is a prepaid platform fee — but the answer is a regulatory
representation, not an engineering one.

---

## 8. Release sequence

Once §7.1 and §7.2 are closed:

1. **Internal testing track.** Actions → *Mobile Release (Play)* with profile `preview`
   (`eas.json` → `submit.preview.android.track: "internal"`). Verifies the whole pipeline —
   EAS build, Play App Signing, auto-submit — with no public exposure.
2. **Closed testing.** Promote in Play Console; run `docs/QA-DEVICE-CHECKLIST.md` on real handsets
   on the target network. This is where the sensitive-permission review usually surfaces questions.
3. **Production, staged.** Tag `v<version>` on `main` → `mobile-release.yml` builds and submits to the
   production track with `releaseStatus: inProgress` and `rollout: 0.1` (10%). Advance or halt in
   Play Console → Releases as crash-free rate holds. Sentry must be live before this step so a bad
   rollout is visible (LR20).
4. **JS-only hotfixes** go out via Actions → *Mobile OTA Update* (no review). Anything touching the
   native layer shifts the `fingerprint` runtime version and **must** go through a store release.

---

## 9. Pre-submission checklist

- [ ] §7.1 reviewer access decided and implemented
- [ ] Play Console app created for `zw.co.lynia`, enrolled in Play App Signing
- [ ] `scripts/eas-arm.sh --verify` reports everything armed
- [ ] Store listing copy (§2) pasted; 512² icon derived
- [ ] Feature graphic created; 8 screenshots captured from a release build
- [ ] Data safety form (§3) submitted and matching `legal.content.ts`
- [ ] Content rating questionnaire (§4.5) completed
- [ ] Foreground-service-location declaration (§5.1) submitted with demo video
- [ ] Privacy policy + deletion URLs resolving in an incognito window from outside Zimbabwe
- [ ] Corporate identity on the legal pages ratified (§7.3)
- [ ] Sentry receiving crashes from a release build (LR20 exit test)
- [ ] Internal track build installed and smoke-tested on a real device
