# Mockup ↔ Code Alignment Review — Customer & Rider Journeys

> **Update 2026-07-06 — code brought into line with the designs.** The designs are the source of
> truth, so the inconsistencies below were fixed in code. Shipped in this branch: **P0** — rider
> undeliverable flow (client + reason picker; post-pickup cancel hidden, keyed off the shared
> `RIDER_CANCELLABLE_STATUSES`); `order:taken` WS event → rider "not chosen" state + board card removal;
> cancel-anytime confirm with reason (both roles) + reason/who-cancelled on the terminal + rider-bail
> reliability warning. **P1/P2** — wrong-code "N attempts left"; rider job "live paused" banner;
> sender's note field (compose → rider job); "nudge & re-broadcast" re-seeds the compose draft; rider-bail
> interstitial (3·b0); customer-side presence escalation (3·b1); one-tap **Accept $X** offer segment;
> "a customer picked you!" win state; no-GPS gate; customer registration (0·6); permission priming
> (0·7/0·8); Settings, Help (WhatsApp), Bike & documents; green splash; WhatsApp OTP copy; earnings
> zero-state hero. Verified: typecheck (shared/api/mobile) + tests (api 419, mobile 53) green. The
> gap table below is the pre-fix baseline; **rate-the-sender (4·7) is the one designed item still
> deferred** — it needs a rider-rates-customer endpoint that doesn't exist yet.

**Date:** 2026-07-05
**Scope:** the two journey-map mockups (`packages/design/explorations/journey/` — `screens.jsx` + `map.jsx` for the customer, `rider-screens.jsx` + `rider-map.jsx` for the rider) compared against the shipped mobile app (`apps/mobile/`), with server contracts (`packages/shared/src/contracts.ts`) and lifecycle endpoints (`apps/api/src/orders/`) checked wherever a screen depends on them.
**Method:** every node in both journey maps (40 customer, 46 rider) was checked against the actual code — screen by screen, state by state, including WS events, push notifications, and API endpoints.

---

## Verdict

**The core transactional loop is faithfully implemented — the shell around it is not.**

- The happy path (compose → disclaimer → 90s auction → counter-offers → select → track → OTP hand-off → rate) is aligned with the mockups, often line-for-line on copy, and in several places the code is *ahead* of the design (SOS, report/block, rating-undo, KYC retry lockout, online-gate states).
- The **first-run shell** (onboarding carousel, customer registration, permission priming) and the **persistent shell** (notifications centre, settings, help hub, bike & documents, force-update / no-GPS gates) are largely **not built**.
- Three **journey-integrity breaks** exist where a designed state is unreachable or dead-ends in the real app — the worst being that a rider **cannot mark a parcel undeliverable at all**, despite the API supporting it and the customer app rendering the terminal state.

| | ✅ Aligned | 🟡 Partial | ❌ Missing |
|---|---|---|---|
| Customer (40 designed states) | 15 | 16 | 9 |
| Rider (46 designed states) | 20 | 13 | 13 |

---

## P0 — Journey-integrity breaks (designed flow exists, real flow dead-ends)

### 1. Rider cannot mark a job undeliverable (mockup 4·b2)
- The mockup designs a full "Couldn't deliver" flow: reason picker (unreachable / refused / wrong address / breakdown), attempt count, own-risk hand-back note.
- The contract (`MarkUndeliveredRequest`, `packages/shared/src/contracts.ts:106`) and the endpoint (`POST /orders/:id/undelivered`, `apps/api/src/orders/lifecycle.controller.ts:47`) **both exist**.
- The mobile app has **no client function and no UI** for it (`apps/mobile/src/api/orders.ts` has no `markUndelivered`; `app/rider/job.tsx` has no control).
- Compounding it: the server correctly **rejects rider cancels post-pickup** (`order-lifecycle.service.ts:371`), but the rider UI still shows "Cancel job" at every active stage. So a rider who genuinely can't deliver after pickup taps the only escape hatch shown, gets a 409, and is **stuck on the job forever**. The customer-side `undelivered` terminal card (`app/order/[id].tsx:629`) is fully built — and unreachable from the app.
- **Fix:** add `markUndelivered()` to the API client and a post-pickup "Can't deliver?" flow (reason chips per the mockup) on `rider/job.tsx`; hide "Cancel job" once status ≥ `picked_up`.

### 2. Rider "not chosen" state doesn't exist — sent offers dead-end at 0:00 (mockup 3·b1)
- Designed: "Customer picked another rider. You're still online and first for the next one."
- Reality: the only board push is `bid:expired` (nobody picked). When the customer picks **someone else**, no event reaches the losing bidders; the sent-offer card on `app/rider/index.tsx` keeps counting down and then sits at **"Customer's window closes in 0:00" forever** (the order also silently stays in `sentOffers` until the rider goes offline).
- **Fix:** push an `offer:not-chosen` (or reuse an order-assigned board event) to losing bidders; render the mockup's muted "Not this time" state and clear the card.

### 3. Customer cancel loses the mockup's guarantees (mockups 3·b2 / 3·b3)
- Pre-pickup cancel fires **instantly with no confirmation** (mockup designs a confirm + optional reason at any stage; code only confirms post-pickup, `app/order/[id].tsx:675`).
- `CancelRequest.reason` is supported by the contract and persisted by the server (`cancelReason`), but the app **never sends or displays a reason** — the cancelled terminal shows a bare "This order is cancelled." with no reason and no "Send a new request" CTA (mockup 3·b3 has both).

---

## P1 — Designed screens that are missing outright

| Screen (mockup ref) | Journey | Notes |
|---|---|---|
| Onboarding carousel (0·2) | both | No slides; app boots straight to phone login. |
| Customer registration — name + national ID (0·6) | customer | `completeProfile` exists but is only called in the rider KYC flow. Customers have no name on their account; the Account screen renders an empty name and the mockup's "ID · NOT VERIFIED" row can't exist. Also breaks the designed KYC prefill ("no double entry", S12). |
| Permission priming — location & notifications (0·7/0·8) | both | OS dialogs fire cold (`Location.requestForegroundPermissionsAsync` in `rider/index.tsx`, push on sign-in). No pre-permission explainer screens. |
| "No riders online" empty state (2·b1) | customer | No supply check before broadcast; a customer in a dead corridor burns the 90s window instead of seeing "no riders online — notify me". |
| Notifications centre + empty state (A·3/A·4) | customer | Push lands (FCM wired end-to-end) but there is no in-app notification list. |
| Settings (A·6) | both | No settings screen (language, notifications, payment=cash, edit profile). Sign-out lives on Account. |
| Help & support hub (A·5) | both | No topic list, no "Chat on WhatsApp". (Order-scoped help *is* built — see "code ahead".) |
| Bike & documents (rider A·2) | rider | Bike reg shows as one line on Account; no document-status screen. |
| "ID expired — re-verify" (rider 1·b2) | rider | A lapsed document lands on the generic KYC gate copy, not the designed distinct state. |
| "Order taken first" board notice (rider 2·b1) | rider | No assignment event removes a taken order from the board; it lingers until the 15s poll and there's no muted "taken by another rider" notice. |
| Force update (S·3) | both | No version gate anywhere. |
| No-GPS blocking state (S·4) | both | Location denial fails silent (board silently falls back city-wide); no "open location settings" screen. |
| Rider job offline state (4·b4) | rider | `rider/job.tsx` renders **no reconnecting banner** and has no "job saved locally, syncs on reconnect" behaviour; the customer side has the banner, the rider side doesn't. |
| Rate the sender (4·7 / S10) | rider | Two-way rating not built (report/block exists, rating doesn't). |

---

## P2 — Partial implementations worth closing

1. **Home compose paradigm (1·1)** — the mockup is a *map-anchored* home (full-bleed map, brand pill, two Uber-style address rows, sheet over the map). The code is a *form-first* screen: two 180-px inline `MapPicker`s inside a scrolling card stack. Functionally complete (and the disclaimer/bottom-sheet/thumb-zone CTA all match), but it's the single biggest visual divergence from the designed product.
2. **Address search (1·2)** — inline Places autocomplete exists (key-gated, session-tokened — good engineering), but the designed search screen's **saved places (Home/Work), recents, "use my current location" and "set on the map" rows, and Google attribution** are all absent.
3. **Offer compose (rider 3·1)** — the mockup's headline interaction is a segmented **"Accept $2.50 | Counter your fare"** one-tap accept. The code prefills the fare field and infers accept-vs-counter from whether the number equals the ask (`rider/index.tsx:215`) — the semantics survive, the one-tap affordance doesn't.
4. **Auction expired (2·b3)** — the mockup's "Nudge & re-broadcast" keeps the order and bumps the price. The code routes to `/home` — and since the draft was cleared on the successful create, the customer **re-types the whole order from scratch**. The pre-expiry ghost button (nice touch) has the same destination.
5. **Rider-bail cancel (4·b3)** — designed: reason field + reliability-score warning + confirm. Code: a one-tap ghost "Cancel job" with no confirm, no reason, no warning (the strike + cooldown are real server-side, so the rider is penalised without ever being warned).
6. **Wrong-code lockout (4·b1)** — 403 lockout is handled with honest copy, but no per-attempt "N attempts left" counter and no "ask customer to re-send" ping (the customer *does* have the re-issue button, so the rider must phone them).
7. **Rider-cancelled interstitial (3·b0)** — `order:rebroadcast` correctly moves the customer to the fresh auction, but silently: the designed "Tendai had to cancel — finding you another rider at the same price" explanation never shows.
8. **WhatsApp OTP framing (0·3/0·4)** — mockups say "We'll WhatsApp a one-time code" + a no-WhatsApp fallback hint; the code says only "a one-time code" (channel-neutral). If WhatsApp is the launch channel, the copy undersells it; if not, the mockups are stale.
9. **Note for the rider (1·4)** — `CreateOrderRequest.note` exists in the contract (max 280) and the rider mockups display a sender's note on the job; the compose screen never offers the field, so no note can ever exist.
10. **Presence escalation asymmetry (3·b1 / 4·b4)** — `presence:stale` is consumed on the rider job socket (`customerStale` warning, well done) but the customer's order socket ignores it, so the designed "call your rider" escalation after ~2 min dark is one-sided.
11. **Splash (0·1)** — designed as the brand-green dove moment; the code's boot state is a white/surface `BrandLockup` + "Loading…".
12. **Earnings zero state (5·2)** — designed as the $0.00 hero card + "your first fare starts here"; code shows a plain EmptyState (no hero card).
13. **Counter-decline persistence** — decline is component state (`declinedCounterIds`), so leaving and reopening the order screen resurrects the prominent Accept/Decline treatment for an already-declined counter. Matches "stays live at their price", but not "declined" persistence.

---

## Where the code is AHEAD of the mockups

The mockups' own gap flags call some of these out as undesigned — the code shipped them anyway:

- **SOS on live trips** (`src/ui/safety.tsx`, both roles, with GPS attach) — flagged **P1 gap** in the rider map, fully built.
- **Report / block counterparty** after a trip (both roles) and **order-scoped "Get help with this trip"** with structured issue types → ops queue — richer than the designed WhatsApp-only help.
- **Rating with a 4-second undo window** + screen-reader announcements (D3) — beyond the mockup's static stars.
- **KYC decline reasons, retry with a fresh Didit session, and a 2-attempt lockout → support** — richer than the mockup's single "Try again".
- **Online-gate states** (suspended / banned / on-hold / cooldown, each with distinct copy and iconography in `src/logic/gates.ts`) — the mockup only designed "on hold".
- **Draft persistence** (PII-free, SecureStore) with a "Draft restored" chip; **out-of-service-area** as a calm distinct state with client pre-check + server authority; **ETA seeding from real distance**; **auction accessibility** (bid announcements, threshold countdowns, reduce-motion) — none of this is in the mockups.

---

## Design review

**System fidelity: strong.** The app consumes the same design language the mockups are built from — `tokens` from `@lynia/shared`, and DS primitives (`Button`, `Card`, `Field`, `StatusPill`, `Stepper`, `EmptyState`, `Skeleton*`, `OfflineBanner`) that mirror the kit primitives (`LyniaKit` / `LyniaSupport`) one-for-one. Copy is frequently verbatim from the mockups (disclaimer rows, counter-offer card, online-empty board, undelivered terminal, customer-cancelled hand-back). The 7-step shared status machine ("one timeline seen from two sides") is implemented exactly as designed, including paired customer/rider labels.

**Where design intent is diluted:**
1. **Map-first vs form-first** (P2 #1) — the designed product feels like a ride-hailing app; the built product feels like a form. This is the gap a user would notice first.
2. **Celebration moments are flattened** — "You're verified → Go online" (1·4) and "A customer picked you!" (3·3) are designed as win states; in code both collapse into quiet dashboard cards (the push "You got the job" does exist).
3. **The shell is bare** — no onboarding, notifications, settings, or help hub means the app has no "home" outside a transaction; every designed persistent surface funnels through ghost buttons on the header.
4. **Terminal states lose their reasons** — cancelled shows no reason, rider-bail warns of nothing, wrong-code shows no attempts-left. The mockups are consistently explicit about *why*; the code sometimes isn't.

## Engineering review

**Strengths (well above pilot bar):**
- Shared Zod contracts + WS event schemas keep both ends of the wire honest; the client re-validates (`CreateOrderRequest.safeParse`) before submit and mirrors contract floors in `canSubmit` so the CTA can't enable and then bounce off Zod.
- Realtime is done right: WS push with poll self-heal, cache-merge with dedupe, optimistic mutations with `cancelQueries` + rollback (select-offer, status advance), race-aware 409 handling rendered as muted notices rather than errors.
- Accessibility is systematically applied (roles, states, announcements, reduce-motion, 44-px targets) — rare at this stage.
- Defensive patterns: key-gated Places (app runs fully unkeyed), best-effort drafts/consent that can never block the broadcast, frozen countdown during reconnect, `.strict()` PII rejection on board waypoints.

**Weaknesses / risks:**
1. **The two P0 dead-ends above** are engineering-visible (endpoint exists, UI doesn't; countdown state never resolves) — they'd surface in the first field week.
2. **Message-sniffing gates** — `onlineGateReason` and `isOutOfServiceArea` fall back to sniffing human-readable messages (`gates.ts` TODOs). Fine as a bridge; fragile the moment copy changes. The rules-API `code` contract should be pinned.
3. **UI/server rule drift** — rider cancel shown post-pickup while the server rejects it is exactly the class of bug the shared-contract discipline is meant to prevent; the cancel affordance should key off the same shared status sets the server uses (they exist: the file comment says "both sets are the shared source of truth the clients import").
4. **`confirmItems` is fire-and-forget** with a `TODO(api): route pending` comment while the endpoint appears live — worth reconciling so pickup verification is actually persisted.
5. **Session-scoped client state** (`sentOffers`, `declinedCounterIds`, `bidIds`) evaporates on process death mid-auction — acceptable for 90-second windows, but the rider's "your offers" list disappearing on an app restart mid-window will read as a bug.

---

## Recommended order of work

1. **P0-1:** rider undeliverable flow (client fn + reason picker + hide post-pickup cancel). Unblocks the already-built customer terminal.
2. **P0-2:** not-chosen signal + state; clear dead sent-offer cards.
3. **P0-3:** cancel confirm + reason capture (both roles) + reason on the cancelled terminal; rider-bail warning card.
4. **P1 shell, cheapest-first:** permission priming (2 static screens), rider job offline banner (component exists), no-GPS state, "nudge & re-broadcast" (retain the draft or re-create server-side), customer registration screen, note-for-rider field (contract already accepts it).
5. **P1 shell, larger:** notifications centre, settings, help hub, bike & documents, onboarding carousel, force-update gate.
6. **P2 polish:** map-anchored home, saved places/recents in search, one-tap Accept segment, celebration states, WhatsApp copy decision, earnings zero-state hero.

---

*Every finding above was verified against the actual source (file:line references inline). The mockups' own ⚑ GAP flags (saved-places manager, scheduled delivery, multi-order, edit-in-flight, proof of delivery, tips, heat-map, shifts, multi-job queue, reliability dashboard, mobile-money) were treated as intentionally out of scope and are not counted as misalignments — with the exception of rider SOS, which the design flagged as a gap and the code has already shipped.*
