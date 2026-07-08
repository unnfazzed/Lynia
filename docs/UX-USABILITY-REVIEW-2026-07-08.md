# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-08 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set + `docs/DESIGN.md` mockups only. No new features, no architecture changes.

> **How this was run.** Four parallel deep audits (customer journey, rider journey, cross-cutting
> resilience, copy/admin) against **current source**, deliberately *not* trusting prior review docs'
> "shipped" claims. This repo has already absorbed many UX rounds (inDrive-parity, UX-richness,
> offline-resilience, mockup-alignment, and a bug-sweep merged the night of 2026-07-07). The findings
> below are the **genuine remaining gaps** — several of them in the *same class* as things those recent
> fixes touched but didn't fully close. The top 3 were re-verified by hand against the code.

---

## 1. Summary — the five highest-impact fixes

Ranked by impact on a customer on a $20 Android with one bar of signal, waiting to find out where their parcel is.

1. **A customer who force-closes mid-delivery can't find their way back to the live order.** Signed-in
   users always land on `/home` (a blank compose form) — there is no "you have a delivery in progress"
   restore path. The **rider side has exactly this** (`/orders/mine/active` + an active-job banner); the
   customer endpoint is rider-only. On cheap Android the OS kills backgrounded apps constantly, so this is
   the everyday case, not the edge. *(HIGH / M)*

2. **The order-creation idempotency key doesn't survive an app kill** — so the one scenario the fix was
   built for (a retry after a dropped response) still creates a **duplicate live auction**. The persisted
   draft has no key field; a relaunch mints a fresh key, and the server dedupes on the key. *(HIGH / S)*

3. **The rider cooldown copy lies about its length.** A cooled-down rider is told *"wait a few minutes"*
   but the actual lockout is **2 hours** (`COOLDOWN_MS = 2 * 60 * 60 * 1000`), and the moment they earn it
   the app throws away the `cooldownUntil` the API already returned — so they get no acknowledgement, then
   discover the real duration by being blocked. In a market where a rider's income depends on being online,
   this is a trust breach. *(HIGH / S)*

4. **The admin KYC reviewer is looking at the wrong photo, labelled as the right one.** The console shows
   the rider's in-app **self-portrait** under `alt="Rider's submitted ID document"` / "National ID · front",
   and the "Didit liveness capture" tile is a permanent hardcoded placeholder. The real ID document lives at
   Didit and is never fetched. Last night's "show the reviewer the document" fix wired a signed URL to the
   selfie, not the ID. A human approving rider identity for a low-trust market is comparing a mislabelled
   image. *(HIGH trust&safety / S to relabel)*

5. **Two of the most reassurance-critical notifications dead-end on tap.** "New delivery nearby" sends a
   rider to `/order/:id`, which **403s** with a Retry button that can *never* succeed (the rider hasn't bid
   yet). "A rider's online near you" carries no destination and taps to nothing. Both are the same class as
   the "dead-end tap-through" fix merged last night — just on notification types that fix didn't cover. *(HIGH / S)*

---

## 2. Findings table

| # | Journey | Lens | File:line | What the user experiences today | Proposed fix | Impact | Effort |
|---|---------|------|-----------|---------------------------------|--------------|--------|--------|
| 1 | Customer cold-start / tracking | Resilience, Low-tech | `apps/mobile/app/index.tsx:35-39`; `apps/api/src/orders/orders.controller.ts:82-85` (`/orders/mine/active` is rider-only) | Force-closed mid-delivery → reopen app icon → blank compose screen, no hint a live order exists. Only path back is Profile → History → find the row. | Add `activeForCustomer` (any non-terminal order owned by caller), query it from `home.tsx`/`index.tsx` and render the same "You have an active delivery" banner the rider board already has (`rider/index.tsx:338-355`). | High | M |
| 2 | Customer create → broadcast | Idempotency | `apps/mobile/app/home.tsx:307-310` (key in `useMemo`); `apps/mobile/src/logic/order-draft.ts:17-26` (persisted draft has no key) | App killed after `createOrder` sent but before response → relaunch restores draft, mints a **new** key → resubmit is not deduped → two live auctions, double rider push. | Persist the idempotency key with the draft (or derive it from draft content + a stored attempt id) so a kill-and-relaunch retry keeps the same key. | High | S |
| 3 | Rider cancel → cooldown | Trust, Copy | `apps/mobile/src/logic/gates.ts:92` ("wait a few minutes") vs `apps/api/src/orders/order-lifecycle.service.ts:43` (`COOLDOWN_MS = 2h`); `apps/mobile/app/rider/job.tsx:180-187` discards `cooldownUntil` | Told "short cooldown, wait a few minutes"; actually locked out 2 hours; gets no in-the-moment notice when the strike lands. | Fix the copy to state the real duration (ideally render the returned `cooldownUntil` as a concrete time — "You can go online again at 3:40pm"). Stop discarding `cooldownUntil` in `job.tsx`. | High | S |
| 4 | Admin KYC review | Trust & safety, Feedback | `apps/admin/app/riders/[id]/kyc/page.tsx:166-190`; `apps/api/src/admin/admin-riders.service.ts:105-160`; capture is "Your photo" (`rider/become.tsx:120`, `documents.tsx:51`) | Reviewer sees the rider's **selfie** labelled "Rider's submitted ID document / National ID · front", plus a fake "Didit liveness capture" placeholder that never holds an image. Decides identity on mislabelled evidence. | Relabel honestly ("Rider photo", drop/annotate the fake liveness tile) as the same-day fix; the real fix (fetch Didit's ID/liveness images) is a vendor-integration question — log it. | High | S (relabel) / M (real) |
| 5 | Rider broadcast push; customer no-riders push | Feedback, Latency | `apps/api/src/notifications/notifications.service.ts:197-211` (`kind:"broadcast"`), `:218-229` (`kind:"riders_available"`); `apps/mobile/src/push/push.ts:79-86` (`pushDestination` has no `kind` branch) | "New delivery nearby" → `/order/:id` → 403 "Couldn't load this order" + a Retry that can never work. "A rider's online near you" → taps to null, nothing happens. | In `pushDestination`, route `kind:"broadcast"` (and any push to a not-yet-assigned rider) to `/rider`; route `kind:"riders_available"` to `/home` (or carry the customer's orderId). | High | S |
| 6 | Rider signup (KYC); customer signup (OTP) | Timeouts | `apps/api/src/kyc/didit-kyc-vendor.ts:22-30`; `apps/api/src/auth/otp-sender.ts:70-74` — bare `fetch()`, no `AbortController`, no global dispatcher timeout | If Didit or Meta's Graph API hangs, the rider's "start verification" / every user's OTP request hangs with **no ceiling**; server connections pile up under retries. | Wrap both in `AbortSignal.timeout(10_000)` and surface a friendly "try again shortly" on timeout. | High | S |
| 7 | Customer no-riders empty state | Feedback | `apps/mobile/app/order/[id].tsx:369-375` (`notifyM` has no `onError`), `:430` (`notifyM.error` not in the `mutationError` chain), `:691-703` | Taps "Notify me when a rider's online", it fails on a blip → spinner stops, button reappears, **no error, no confirmation** — can't tell if they're queued. | Fold `notifyM.error` into the existing `mutationError` chain (the other 4 mutations already do this). | High | S |
| 8 | Everywhere status is shown | Copy | `apps/mobile/src/ui/index.tsx:224` (`StatusPill` renders `status.replace(/_/g," ")`) used at `order/[id].tsx:510`, `rider/job.tsx:352`, `history/index.tsx:36` | The pill shows raw enum — **"en route pickup"**, **"en route dropoff"**, **"open for offers"** — right next to a `Stepper` that says the human "Heading to pickup". Same screen, two vocabularies. | Route the pill through the existing `STEP_LABELS` map (already defined at `ui/index.tsx:253-272`) via an `orderStatusLabel(status, view)` helper. | High | S |
| 9 | Customer price adjust | Low-tech, Feedback | `apps/mobile/app/home.tsx:676-681` (free decimal entry), only a "too low" guard (`src/logic/fare-band.ts:51`); server cap is `$100,000` (`contracts.ts:65`) | Fat-fingered extra digit ($2.50 → $250) sails through — no upper guard, unlike the item-**quantity** field which uses a `QtyStepper`. Real cash-mistake risk. | Mirror `isBelowBand` with an `isFarAboveBand` (>2–3× `band.high`) and a calm non-blocking "That's a lot more than usual — sure?" hint. | Med-High | S |
| 10 | Interested-riders list, tracking | Data frugality | `apps/mobile/src/ui/Avatar.tsx:33-42` (bare `<Image>`, no thumbnail); capture `rider/become.tsx:46-47` is `quality:0.6`, no dimension cap; no server resize | Scanning 5–10 bids downloads that many full-size photos to paint 40px circles — real cost on expensive data, against DESIGN.md's "lazy-load images / data-light". | Cap capture dimensions on-device (`expo-image-manipulator` → ~256px) before the signed PUT, or add a server thumbnail step. | Med | S–M |
| 11 | Rider KYC form | Resilience | `apps/mobile/app/rider/become.tsx` (name/ID/bikeReg/photo in plain `useState`, no persistence) vs customer `order-draft.ts` (full persisted draft) | Launching the camera mid-form OOM-kills the app on cheap Android → the whole form is lost, including a re-typed national-ID string. | Persist the KYC form fields (SecureStore) like the compose draft does; restore on relaunch. | Med | M |
| 12 | Customer OTP entry | Resilience, Low-tech | `apps/mobile/app/verify.tsx:33-37` (relative `setTimeout` decrement, no `Date.now()` anchor / `AppState` recompute) | The screen's own flow is "go read the code in WhatsApp" — i.e. backgrounding is normal. JS timers pause while backgrounded, so "Resend in 0:35" freezes and blocks the button longer than the real 60s. | Store `cooldownEndsAt = Date.now()+60_000`, derive remaining each tick and on `AppState` foreground. | Med | S |
| 13 | Repeat order / rebroadcast | Low-tech | `apps/mobile/src/logic/order-draft.ts:88-111` (`buildRebroadcastParams` carries no phones); `home.tsx:634` (pickup phone, no quick-fill) | Every "Send again / Nudge & re-broadcast / Send another request" lands with Broadcast disabled until **both** phones are retyped — including the customer's **own** pickup number, every time. | Persist the customer's own last pickup phone locally (it's not third-party PII, so the draft-privacy rule doesn't block it) and prefill it. | Med | S |
| 14 | Rider board realtime | Resilience | `apps/mobile/src/realtime/use-rider-board.ts:58-64` (connect handler only re-emits `boardSubscribe`, never invalidates `["openOrders"]`) unlike `use-order-socket.ts` / `use-rider-job-socket.ts` | A socket blip while the board stays foregrounded can leave it stale up to 15s (poll), instead of self-healing immediately like the other two sockets. | Add `qc.invalidateQueries({queryKey:["openOrders"]})` in the connect/connect_error handlers — match the pattern the recent fixes set. | Low-Med | S |
| 15 | Rider board push latency | Latency | `apps/api/src/notifications/*` — FCM broadcast push is `await`ed before the same-process WS board emit | A rider already staring at the board waits on an FCM round-trip before the WS push that could reach them instantly within the 90s window. | Emit the in-process WS board event first, then fire FCM `void`-style (matching how lifecycle pushes are already fire-and-forget). | Med | S |
| 16 | Support / help | Low-tech | `apps/mobile/app/help/index.tsx:29-39` — three topic `Card`s styled like the working WhatsApp row but with no `Pressable`/`onPress` | Taps "A delivery problem" expecting the same response as the WhatsApp card below — nothing happens, no feedback. | Route topic taps into the existing `supportWhatsAppUrl()` prefilled with that topic's context. | Low-Med | S |
| 17 | Admin orders / riders | Latency (founder) | `apps/admin/app/orders/page.tsx`, `riders/page.tsx`, `page.tsx`, the `[id]` routes — no `loading.tsx` (unlike `cash/`, `customers/`, `issues/`) | The two screens a founder checks constantly render a **blank page** during the server fetch on weak Harare connectivity. | Add `orders/loading.tsx` + `riders/loading.tsx` (and `[id]`) reusing the proven `PageSkeleton`. | Med | S |
| 18 | Admin lists | Data visibility (founder) | `admin-orders.service.ts:22`, `admin-riders.service.ts:31`, `admin-customers.service.ts:23` — hard `take:100`, no pagination UI or caption | Past 100 rows in a filtered view, older rows are **permanently invisible**, not just slow — a silent ceiling. | At minimum a "showing latest 100" caption; real fix is cursor pagination. Won't bite at pilot volume but is a landmine. | Med | Trivial (caption) |
| 19 | Settings | Feedback | `apps/mobile/app/settings/index.tsx:68-69` — `Notifications: "On"` and `Language: "English"` hardcoded, no `onPress`, never reflects real permission state | A customer who denied notifications is told "On" — wrong, uncorrectable from the one screen meant to show it. | Reflect the real permission state (and deep-link to OS settings), or drop the row until it's wired. | Low | S |

---

## 3. Quick wins (High impact + Small effort)

Concrete, low-risk, mostly one-file changes:

- **#7 — silent "Notify me" failure** (`order/[id].tsx:430`): add `notifyM.error` to the existing
  `mutationError` chain. One line, same pattern as the other four mutations.
- **#5 — dead-end pushes** (`push.ts:79-86`): add `kind`-aware branches to `pushDestination` — `broadcast` →
  `/rider`, `riders_available` → `/home`. Kills two "tap does nothing / tap 403s with a useless Retry" traps.
- **#3 — cooldown copy** (`gates.ts:92`): replace "wait a few minutes" with the real 2-hour figure, ideally
  rendered from the `cooldownUntil` the API already returns (stop discarding it at `job.tsx:180-187`).
- **#6 — outbound timeouts** (`didit-kyc-vendor.ts:22-30`, `otp-sender.ts:70-74`): wrap both `fetch()`s in
  `AbortSignal.timeout(10_000)`. Prevents unbounded server-side hangs on signup/verification.
- **#8 — StatusPill jargon** (`ui/index.tsx:224`): reuse the `STEP_LABELS` already in the same file so the pill
  stops showing "en route pickup" next to the stepper's "Heading to pickup".
- **#2 — idempotency across app-kill** (`order-draft.ts`): add an `idempotencyKey` field to the persisted draft.
- **#4 — admin KYC relabel** (`kyc/page.tsx:166-190`): change `alt`/heading to "Rider photo" and annotate the
  fake liveness tile. Removes a genuine trust&safety mislabel today; the real Didit-image fetch is a separate log.
- **#17 — admin blank screens**: two `loading.tsx` files reusing `PageSkeleton`.
- **#9 — price upper guard** (`fare-band.ts`): add `isFarAboveBand` + a calm confirm hint. Reuses existing infra.

---

## 4. Copy fixes (before → after)

| file:line | current | proposed | why |
|---|---|---|---|
| `apps/mobile/src/ui/index.tsx:224` (StatusPill) | raw enum: "en route pickup", "en route dropoff", "open for offers" | route through `STEP_LABELS` → "Heading to pickup", "On the way to drop-off", "Finding riders" | Biggest remaining jargon leak; human labels already exist in the same file for the Stepper. |
| `apps/mobile/src/ui/index.tsx:260` | `delivered: "Delivered (OTP)"` (customer stepper) | `"Delivered"` | The rider pairing (line 269) already just says "Delivered"; no reason a customer sees "OTP". |
| `apps/api/src/notifications/notifications.service.ts:43,64` | body "Your parcel is en route to the destination." | "Your parcel is on the way to drop-off." | The title on the same object already says "On the way to drop-off"; body reverts to formal "en route". |
| `apps/mobile/app/home.tsx:558` | `Button label="Broadcast request"` | "Send to riders" | "Broadcast" is radio/internal jargon; DESIGN.md's target vocab is "send". |
| `apps/mobile/app/home.tsx:530` | "Add … to broadcast." | "…to send." | Same leak, disabled-state hint. |
| `apps/mobile/app/home.tsx:553` | "Move your pins closer to Harare to broadcast…" | "…to send your parcel…" | Same. |
| `apps/mobile/src/ui/home/DisclaimerSheet.tsx:103` | `Button label="Agree & broadcast"` | "Agree & send" | Same term in the disclaimer CTA. |
| `apps/mobile/app/rider/index.tsx:643,685` | "Counter your fare" / "Send counter-offer" | "Offer a different price" / "Send my price" | The *customer*-facing `CounterOfferCard` already avoids "counter"; the rider side is the last spot using it. |
| `apps/mobile/src/ui/rider/BailSheet.tsx:28` | "The customer's order is re-broadcast at the same price…" | "…goes out to other riders again at the same price." | Rider-facing "re-broadcast" jargon. |
| `apps/api/src/auth/otp-sender.ts:59` | throws "OTP delivery is not configured" (propagates to phone screen) | "Couldn't send the verification code — try again shortly." | Edge case (misconfigured deploy) but exposes raw "OTP" to a real user if it fires. |
| `apps/mobile/src/ui/order/CounterOfferCard.tsx:86` | "…one counter round, no counter-back." | "…you can still pick them later at this price." | Dev-speak parenthetical a customer doesn't need. |

**Already clean (no action):** onboarding, permissions, force-update, the OTP entry screen itself ("Enter your
code" / "6-digit code", never "OTP"), `become.tsx`/`documents.tsx` ("verify your ID", never "KYC"), the online-gate
copy in `gates.ts` (except the cooldown-duration bug, #3), SOS/safety, earnings, notifications feed.

---

## 5. Ambiguity audit — "did that actually happen?"

Every place a user can end up unsure whether an action registered, with the fix:

| Situation | Today | Fix |
|---|---|---|
| App killed after tapping Broadcast, before the response lands | Relaunch mints a new idempotency key → a **second live auction** is created and every nearby rider is double-pushed. The user may see two auctions for one parcel. | Persist the key with the draft (#2). |
| Force-close mid-delivery, reopen via the app icon (not a push) | Blank compose screen — **no signal a live order exists**. Is the parcel still being delivered? | Customer active-order restore banner (#1). |
| Tap "Notify me when a rider's online", network blips | Spinner stops, button reappears, **no error and no confirmation** — queued or not? | Add `notifyM.error` to the error chain (#7). |
| Rider hits a 3rd strike | No in-the-moment notice (the returned `cooldownUntil` is discarded); later blocked and told "wait a few minutes" when it's actually 2 hours. | Surface `cooldownUntil` + honest duration (#3). |
| Tap a "new delivery nearby" / "a rider's online" notification | 403 with a Retry that can't work / nothing happens at all. Did the app break? | `kind`-aware `pushDestination` routing (#5). |
| Didit or WhatsApp hangs during signup/verification | Request hangs with **no ceiling** — is verification stuck or just slow? | `AbortSignal.timeout` on both (#6). |

**Verified solid (no ambiguity):** offer submission (unique `(order_id, rider_id)` + row-lock → clean 409),
rider selection (guarded CAS, no double-assign), status transitions / delivery-OTP verify / both ratings
(each a guarded CAS or unique-constraint-backed → `ConflictException`, never a duplicate side effect), the
already-open tracking screen's offline cold-start (shows `lastKnown` snapshot, not a dead error), socket
staleness UI on all three consumers (reconnect banners + "Live paused" + Online/Reconnecting chip), GPS
dead-zone coalescing (`location-buffer.ts` keeps only the freshest fix, no flood on reconnect), and KYC photo
upload (compressed, 15s timeout, rollback-safe on failure).

---

## 6. Out-of-scope log (needs a new feature, vendor integration, or architecture decision — one line each)

- **Real Didit ID-document + liveness image fetch** into the admin console (today Didit holds them; only the
  in-app selfie is available) — vendor integration, beyond the mislabel relabel in #4.
- **Item photo + size UI on order creation** — contract fields exist (`itemPhotoUrl`), consciously deferred
  (`ITEM-DESIGN-REVIEW` 2026-07-02); noted because the journey brief lists "photo, size".
- **Profile edit** — "Editing your details is coming soon" (`profile/index.tsx:69`), matches DESIGN.md DT10.
- **Shared segmented `CodeInput` component** (larger digits/letter-spacing for sunlight, without breaking
  autofill/paste) for the OTP and delivery-code screens — a new UI primitive, not a within-screen tweak.
- **Admin cursor pagination** end-to-end (beyond the "showing latest 100" caption in #18).
- **In-app chat, in-app payments, share-a-link tracking** — all explicitly deferred features; not in scope.
