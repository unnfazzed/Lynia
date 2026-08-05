# LyniaGo Design System — Engineering Handoff

> **⚠ July 2026 update:** the customer home, rider IA and a new Restaurants vertical changed after
> this guide's flows were built; that update has shipped (`apps/merchant`, the rider Money tab, the
> food flow). Screen source of truth: `explorations/journey/All Screens Gallery.html` (see "The one
> index to trust" below). Everything here remains valid except where the decision docs say otherwise
> (notably: rider Earnings/weekly settlement retired; map home is now the Send destination, not the
> root).

This folder is the **LyniaGo design system**: the brand, design tokens, reusable UI components, and
high-fidelity UI kits for the LyniaGo motorbike-courier product (customer + rider mobile app, admin
ops console, and the support/onboarding/edge flows). It was built against the `unnfazzed/Lynia`
monorepo (contracts, screens, pricing) and mirrors those real values.

> **What this is / isn't.** These are pixel-accurate, interactive **design** artifacts — not
> production code. UI kits cut corners on functionality (fake data, simulated sockets) but are
> faithful to the intended visuals, states and copy. Lift **values and layouts** from here; wire the
> real data/logic in the app.

---

## Where things live

```
packages/design/                 ← this folder (suggested location in the Lynia monorepo)
├─ styles.css                     ← THE entry point — consumers link only this (an @import list)
├─ tokens/                        ← CSS custom properties (source of truth)
│   ├─ colors.css   typography.css   spacing.css   icons.css   fonts.css
├─ assets/
│   ├─ brand/                     ← logo SVGs, app-icon PNG set, favicon, one-pager
│   │   ├─ lyniago-mark.svg  lyniago-mark-mono.svg  lyniago-icon.svg
│   │   ├─ icon/  (16–1024 PNG, maskable, favicon.ico, site.webmanifest, README)
│   │   └─ LyniaGo One-Pager.html
│   ├─ fonts/                     ← self-hosted Inter (400/600/700) + Fredoka 600 .woff2
│   ├─ lynia-icons.js             ← ~5KB self-hosted Lucide subset (window.lucide shim)
│   └─ icons/                     ← the raw Lucide SVGs the subset is built from
├─ components/                    ← reusable React primitives (see below)
├─ ui_kits/
│   ├─ mobile/    (customer + rider app — the core courier loop, interactive)
│   ├─ admin/     (ops console)
│   └─ support/   (onboarding, permissions, notifications, help, settings, edge states)
├─ templates/app-screen/          ← a starter LyniaGo screen scaffold
├─ guidelines/                    ← Design-System-tab specimen cards (tokens, brand, splash)
├─ explorations/                  ← logo/wordmark design record (not shipped to users)
├─ readme.md                      ← the full design guide (READ THIS FIRST)
├─ RESTAURANTS-DECISIONS.md       ← the restaurants contract (N-/D-/R- numbers)
├─ RIDER-ONE-APP-PLAN.md          ← one rider app (Send + Food), the seven decisions
├─ RIDER-JOURNEY-AUDIT.md         ← rider gap audit (R- IDs; status in BACKLOG-PLAN.md)
├─ CUSTOMER-JOURNEY-AUDIT.md      ← customer gap audit (F-/A- IDs; status in BACKLOG-PLAN.md)
├─ COVERAGE.md                    ← screen-by-screen: what's designed vs. out of scope
├─ INTERFACE-AUDIT.md             ← customer ⇄ rider seam audit + resolution log (D1–D12)
├─ BACKLOG-PLAN.md                ← remaining backlog sequenced into execution waves
└─ SKILL.md                       ← one-paragraph brand cheat-sheet
```

The `_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` files are **generated** by the
design tooling — you don't need them to consume the system in production (the mobile/support kits use
the bundle only to render their previews). Ship `styles.css` + `components/` + `assets/`.

## Source of truth

- **All design values are CSS custom properties in `tokens/`.** Never hardcode a hex/size that a token
  already defines — reference `var(--…)`. Colors, type scale, spacing (8pt), radii, shadows, icon
  sizes all live there. `styles.css` `@import`s the whole set; link that one file.
- **Components** (`components/<group>/<Name>.jsx` + `.d.ts` + `.prompt.md`) are cosmetic React
  primitives that read the tokens. They're the intended API: `Button`, `Card`, `StatusPill`, `Icon`,
  `Field`, `Heading`/`Sub`/`Label`, `EmptyState`, `Skeleton`/`SkeletonList`, `OfflineBanner`,
  `Stepper`. Each `.prompt.md` has usage + variants; each `.d.ts` has the props contract.
- **Fonts** are self-hosted in `assets/fonts/` (no Google Fonts round-trip): **Inter** 400/600/700 for
  all UI text; **Fredoka 600** for the LyniaGo wordmark only (via `--font-wordmark`).
- **Icons** come only from `assets/lynia-icons.js` (a ~5KB self-hosted Lucide subset) — never pull the
  full CDN library. Add a new icon by importing that one SVG and regenerating the subset.

## The one index to trust

`explorations/journey/All Screens Gallery.html` — every current screen for customer, rider and
merchant, in journey order, exceptions included, each tile rendered live from the design system.
**If a screen is in the gallery it is current; if a screen you coded is not in the gallery, it was
retired.** The gallery header in `gallery-map.js` names the retired rider screens explicitly.

Known-stale corners — don't follow them blindly:

- `ui_kits/admin/cash.html` shows the old weekly 15% settlement; the live model is prepaid,
  per-delivery, 0%→10% (`RIDER-ONE-APP-PLAN.md` decision 1, values in
  `docs/plans/2026-rider-wallet-design.md`).
- Anything showing the map as the customer root, a rider "Earnings" screen, or a rider
  float/headroom check (`RESTAURANTS-DECISIONS.md` §7 R-10 deleted the float concept).

**Order item model (founder decision, 2026-07-02):** an order captures **multiple line-items, each
`{ description, quantity }`** — nothing more descriptive for the pilot. Size, category and item-photo
are deferred as data-model seams; the optional note carries handling (fragile / upright / keep cold).
Shipped: repeatable item list on the customer home, per-row quantity stepper, rider job/board render
the line-items.

## Running the kits locally

They're plain static HTML — no build step. Serve the folder and open:
- `ui_kits/mobile/index.html` — the interactive courier app (use the 360/320 + Riders/Network demo
  chips to reach every state).
- `ui_kits/admin/index.html` — the ops console.
- `ui_kits/support/index.html` — the support/onboarding/edge gallery.

```bash
npx serve packages/design      # or any static server; then open the paths above
```

(React/Babel load from a pinned CDN in the kit HTML — internet needed to *view* the previews, not to
use the design system in production.)

## Brand quick rules

- One green: **#00B14F** for fills/graphics; **CTA buttons use #00812F** (`--cta-fill`, white text
  ≈4.7:1 for sunlight); green **text/icons** use **#006630** (`--accent-text`). Gold **#F2B705** only
  for the 'recommended' marker.
- Logo = the **Paper Dove** (`assets/brand/`). Full lockup ≥32px (crease-cross shows); silhouette
  below 32px. Wordmark is Fredoka 600 — self-hosted now; **outline it to vector for final production**
  so the logo never depends on a font file (interim is fine, it's self-hosted and can't fail).
- Voice: second person, sentence case, calm, honest; every dead-end offers an action; no emoji.
- Device rules: 320px-first, ~150KB/screen, skeletons over spinners, touch targets ≥44px.

---

## Repo-side engineering tickets (design can't fix these — app code must)

The original P0/P1 ticket list here (contact-phone enforcement, request timeouts, 409 race, OTP
lockout, phone reveal, heartbeat) predates the current code and is historical — the durable copy
lives in `docs/DESIGN-SYSTEM.md` §"Repo-side product tickets", and
`docs/plans/DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md` tracks what actually shipped. Only the
device-gated checks below remain open.

**On-device checks (can't judge from a screen)**
1. CTA green (#00812F) contrast in real sunlight — re-tune `--cta-fill` if needed (one line).
2. Skeleton→content reflow on a real device; bottom-sheet drag physics on the map home.

## 2026 journey review — new customer flows to wire

Six net-new screens + a Maps route-sync row were designed against the customer-journey gap review
(`CUSTOMER-JOURNEY-AUDIT.md`). Preview them in `ui_kits/mobile/new-flows.html`; flow context is the
map in `explorations/journey/`. Product decisions baked in: **payment is off-platform** (cash between
customer & rider; Lynia not a party), **non-delivery is at the customer's own risk** (disclaimed
pre-broadcast), the customer can **cancel anytime**, and riders can **accept _or_ counter** a price.

**P0 (launch-blockers)**
- **F-07 · Counter-offer.** A rider offering above the ask surfaces as an Accept/Decline (ask vs
  counter + delta). Accept assigns at the counter price; **decline keeps that rider's offer in the
  list at the countered price until the window closes** (one round, no counter-back — see seam
  contract C1 below). Never auto-charge above the customer's price.
- **F-01 · Rider cancelled → auto re-broadcast.** An assigned rider cancelling / no-showing re-opens
  the auction at the same price (new order lifecycle, same params) without the customer starting over.
- **F-02 · Undeliverable terminal.** Rider marks not-delivered (unreachable / refused / wrong
  address) with a reason; order closes in a terminal state. No return obligation on Lynia; keep the
  call-rider action.

**P1**
- **A1-8 · Pre-broadcast liability disclaimer.** Accept-to-continue gate before order create; persist
  consent (policy version + timestamp) on the order.
- **Search-first addressing.** Google Places autocomplete for pickup/drop-off (saved Home/Work,
  current location, set-on-map fallback); the confirm step stores `lat/lng + place_id` and the parcel
  route deep-links Google Maps for the rider's turn-by-turn.

## 2026 rider journey — full flow + new screens to wire

The complete rider journey (splash → sign-in → KYC → online → offer → active job → hand-off →
earnings → account, plus system/edge) is mapped screen-by-screen in
`explorations/journey/LyniaGo Rider Journey Map.html` (pannable canvas, 43 tiles, flow/branch/error
arrows, act bands, severity-tagged gap flags). Full gap list & severities in
`RIDER-JOURNEY-AUDIT.md`. Product decisions baked in: **one phone-first account, two roles**; **KYC
is the gate** to going online (partner **Didit**, selfie liveness, consent recorded); **payment is
cash, off-platform**, funded by a **prepaid, per-delivery commission wallet** (`ratePct` 0% at
launch → 10%, see "Rider commission wallet" below — this replaces the earlier "no commission /
earnings is a record of work" decision); **riders can accept _or_ counter** a price; **non-delivery
is the customer's own risk** (terminal
state + reason recorded).

Most tiles reuse states already built in `ui_kits/mobile/` (the interactive rider side). **Two
net-new screens** were added in this review and need wiring:

**Net-new screens (design done; wire into kit + app)**
- **Role selection.** After OTP — sign-in is identical to the customer up to here, so a signed-in
  user picks "Send a parcel" or "Earn as a rider" (one account, switchable later). Gates entry into
  the KYC flow. Needs a real entry point in the app IA (also covers R0-4 role-discovery).
- **Pickup item verification.** Between "En route to pickup" and "Parcel collected": the rider sees
  the sender's item list and **ticks each item** to confirm exactly what's physically collected
  before riding on. Prior step's CTA becomes "Arrived at pickup"; collection is only confirmed after
  the checklist ("Confirm N items collected"). Persist the per-item confirmation on the order;
  recipient still verifies delivery with the 6-digit code.

**Repo-side rider tickets (from `RIDER-JOURNEY-AUDIT.md` — app code must wire)**

*P0*
- **R-01 · Reliability score + bail maths.** The bail screen (`job_bail`) warns of a reliability
  score and re-broadcasts the order at the same price; define what counts (pre- vs post-pickup
  cancels, no-shows, low ratings), the threshold that trips `on_hold`, and whether a bail *after
  pickup* (parcel on the bike) differs from before.

*P1*
- **R-16 · Rider SOS / report.** ✅ **Designed** (`ui_kits/mobile/safety-flows.html`, §SOS + §Report). Emergency control on every live trip/job (both roles, one shared sheet) + report/block. Wire `raiseSos` / `reportUser`; see the trust/safety section below.
- **R-06 · Counter re-counter rules.** ✅ **Decided (seam contract C1):** one round, no counter-back
  — the customer accepts or declines; a declined counter stays live at the countered price until the
  window closes. No "your counter was countered" screen exists or is needed.
- **R-03 · Hand-off lockout recovery.** 5 wrong codes → lockout is designed; the lockout screen now
  has **"Ask customer to re-send the code"** — wire it to ping the sender (contract C4).
- **R-04 / R-05 · Mid-job connection.** Escalation threshold decided: **~2 min dark** on either side
  (contract C5). ✅ **Designed** — customer `track_dark` escalation (`safety-flows.html` §OTP/D·1). Still
  to wire: the escalation push itself, and the guard on a *deliberate* go-offline / app-close while
  holding a parcel (block or warn, don't silently allow — Wave 2).
- **R0-2 · Notifications-denied fallback.** A rider who declines push misses new-order and
  "you were picked" pings — warn and offer a fallback.
- **X-1 · Order-level support.** ✅ **Designed** — "Get help with this trip/job" (`safety-flows.html`
  §Report, B3·1/B3·2) files an `raiseIssue` tied to the order, not generic WhatsApp.

*P2/P3 roadmap (flagged on the map, deliberately not designed)* — reliability dashboard, demand /
heat-map hint, multi-job queue, scheduled shifts, in-app payout / mobile money (EcoCash), incentives
& bike-leasing hook. See `RIDER-JOURNEY-AUDIT.md` §Roadmap.

## 2026 seam resolution — customer ⇄ rider interface contracts

A cross-walk of the two journeys (`INTERFACE-AUDIT.md`) found 12 seams where the maps disagreed
about a *shared* state; all were resolved on 4 Jul (decisions D1–D12 in that file). Both journey
maps in `explorations/journey/` are updated — the rider map gained **two screens**
(`job_cancelled` 4·b5, `bid_expired` 3·b2). These are the engineering contracts; every one is a
**two-sided event** — implement each as one server-side transition that pushes to both apps, never
as two app-local features.

**C1 · Counter loop (one round).** A rider's offer is `accept_ask | counter(fare, eta)` — one per
order. Customer response to a counter is `accept | decline`; **decline is client-side dismissal
only** — the bid stays live at the countered price until the window closes. No counter-back, no
re-offer. Rider terminal states: `picked`, `not_chosen` (someone else picked), `bid_expired`
(window closed, nobody picked — distinct event, new screen).

**C2 · Auction clock is shared.** Expose the auction's `expiresAt` to bidders — the rider's
`offer_sent` screen renders a live countdown of the same 90s window the customer sees. On expiry
with no pick, push `bid_expired` to all bidders.

**C3 · Cancellation matrix (server-enforced).**
- *Rider cancel:* allowed only `assigned → en_route_pickup`; **blocked from `picked_up` onward**
  (UI removes the action; server rejects too). Triggers auto re-broadcast at the same price +
  reliability decrement. A post-pickup breakdown lands as `undelivered(reason: breakdown)`.
- *Customer cancel:* allowed at **any** status. Pushes a `job_cancelled` terminal to the rider
  (pre-pickup: back to board; post-pickup: sender contact shown for the hand-back). **No
  reliability impact on the rider.** Also covers the pick→confirm race: a cancel in that window
  lands the rider on `job_cancelled`, never a dead job.

**C4 · Code re-issue loop.** Rider lockout screen's "Ask customer to re-send the code" →
notification to the sender deep-linking their existing **Re-issue delivery code** button
(`rotateDeliveryCode`, ticket #4 above). Re-issue resets the rider's attempt counter.

**C5 · Presence, both directions.** `track_paused` / `job_offline` are the muted treatment for
*either* side's socket drop. One shared constant (**~2 min**) escalates both: customer gets
"rider offline — last seen… / call your rider"; rider gets "still saved" reassurance → warning.
Rider location staleness must be pushed to the customer's tracking (don't render a stale position
as live).

**C6 · Undelivered reason flows to the customer.** Reason enum
`unreachable | refused | wrong_address | breakdown` + attempt count persisted on the order and
rendered on the **customer's** terminal screen verbatim.

**C7 · One status machine.** The customer's 7-step timeline and the rider's job stepper are two
views of the same status enum (`assigned … completed`) — no separate customer-side progress model.

**C8 · Two-way rating.** `job_delivered` has an optional rate-the-sender (1–5). Store it; it feeds
fault attribution alongside the reliability score (R-01). Not shown publicly at launch.

**C9 · Role-switch de-dupe.** KYC form pre-fills name + national ID from the account registration
for customer-first users; permission priming runs once per device, not once per role.

**What's next:** the remaining (non-seam) backlog is sequenced in `BACKLOG-PLAN.md` — Waves 1–2
(reliability maths, SOS both roles, report/block, order-level support, auction-integrity eng) are
the pre-launch set.

## 2026 trust, safety & recovery — design done, wire it

Eleven screens were **shipped in app code (PR #98) with no design** — the biggest single design/code
drift in the review. They're now designed at production fidelity to the real contracts and gathered
in one handoff gallery: **`ui_kits/mobile/safety-flows.html`** (`@dsCard` → Design-System tab, "Mobile
app"). Flow context is the two maps in `explorations/journey/` (new bands B1–D on the customer map,
A1–A4 + B1–E on the rider map). Renderers live in `explorations/journey/screens-safety.jsx`
(customer, `window.LJ`) and `rider-screens-safety.jsx` (rider, `window.RJ`).

**Product decisions baked in (final, 5 Jul — closes blocking decision Q3):** emergency number **999** ·
Lynia staffed safety line **+263 77 883 1938** · every contact-support action is a **`tel:` call**
(not a WhatsApp/chat dead end) · the SOS server log is **best-effort and never gates the numbers**
(they're client-side constants so they work offline).

**SOS — both roles, one shared control** (`raiseSos`, `SosContacts { emergencyNumber, safetyLine }`).
Pinned danger pill on every live-trip / live-job map → deliberate confirm sheet (a pocket-tap can't
fire it) → two `tel:` rows (Call 999 dominant, safety line second). Confirming best-effort `POST
/orders/:id/sos` with trip + location; the **offline state (B1·4)** still renders both numbers because
a safety control must never dead-end on the network.

**Report + block** (`reportUser(reason, block?)` → `ReportResult { id, blocked }`). Post-trip, from the
rate screen, both roles. Blocking prevents any future rematch; the confirmation states reviewer
anonymity. **Order-level help** (`raiseIssue(type, description)` → `RaisedIssue { id, status }`) — job
context attached, distinct from the generic account Help→WhatsApp dead end (kills X-1).

**OTP resend / expiry / lockout** (extends the 0·4 "Check your WhatsApp" screen; the idle Resend
affordance is retrofitted in place). 60s throttle timer (`role=status`, Verify stays enabled) → re-sent
(**a fresh code resets the attempt counter server-side**, so a resend can't land in a locked record) →
expired/locked recovery (one action issues a fresh code + resets attempts; never a dead end). Closes
A0-1 / R0-1.

**Rider-went-dark escalation** (`track_dark`, contract C5). Escalates `track_paused` past ~2 min stale:
muted marker + warning banner (never a red alarm), Call-your-rider promoted to the dominant CTA, SOS
still pinned.

**Go-online gate states — rider** (`gates.ts` `OnlineGateReason`). One reason-keyed `EmptyState`
template — `out_of_area` / `cooldown` / `banned` / `kyc_locked`, icon/title/message/actions as props.
Every state keeps a real exit; the two terminal reasons (`banned`, `kyc_locked`) expose a `tel:`
support row — the mandatory exit that today's dead-end screens lack. Also retrofitted onto the existing
on-hold screen (S·2, both apps). Eng: **add `out_of_area` + `banned` to the reason union** and each
variant falls out for free. `out_of_area` needs Q1 (service-corridor definition, Wave 3).

**Rider commission wallet.** The rider "Earnings" screen was retired and replaced by the merged
**Money tab** (`RJM money`) — a prepaid, per-delivery commission wallet, not a payout balance.
Riders pre-fund an account; each completed ride debits `ratePct` of the agreed fare (**0% at
launch → 10%**), a **$2.00 online floor** blocks going online below it, and flipping online at zero
balance grants a one-time **$5.00 grace credit**. Top-ups are **$5–$50** via **EcoCash / InnBucks /
O'mari**, with a 90s payment-prompt window (`topup_amount` → `topup_wait` → `topup_success` /
`topup_declined`). A low balance warns via `wallet_low`; an empty one gates going online through
`gate_topup` — a fifth reason alongside the four `OnlineGateReason` states above. Design source:
`templates/wallet/`, `templates/top-up/`, `templates/gate-state/`, `explorations/Wallet Journey.html`;
full contract in `WALLET-HANDOFF-README.md`.

**KYC ID-photo loop — rider** (extends the KycForm photo row; fix P3). Capture (frame guide + 3
readability rules) → preview self-check ("can you read everything?" — filters glare/blur before it
burns one of two attempts) → non-blocking upload (form stays editable, Submit gated) → recoverable
failure. Hard rule stated in the UI and enforced in wiring: **a retake never wipes the last good photo
— it's only replaced once the new one uploads.**

Backlog mapping: this clears **Wave 1** (SOS, report/block, order-support) end-to-end on the design
side, plus the Wave-3 out-of-area gate and Wave-4 OTP-resilience screens. The two highest-severity
map gap-flags (Rider SOS, order support) are removed from both journey maps.

---

## 2026 admin ops console — handoff (design system · engineering · design)

The ops console was expanded from a single 3-tab page into a **7-screen monitor & support tool**
(`ui_kits/admin/`). It is a **monitor + support** surface — **no manual dispatch** (a no-offer order
expires; the customer re-broadcasts). Single ops-admin role, pilot-scale Harare data. Screens, states
and flows are in `ui_kits/admin/README.md`; coverage is in `COVERAGE.md`.

Preview: `ui_kits/admin/index.html` → sidebar to Orders / Riders / KYC / Customers / Issues / Cash.
Row clicks open detail screens; the **Tweaks** panel switches density, nav, data volume and the
**live / empty / loading / offline** state on every page.

### → Design system

The console is built on the existing tokens (`../../styles.css`) with **inline styles + one kit
stylesheet** (`admin.css`) — the real admin uses inline styles from `@lynia/shared`, not the React
primitives, so nothing new was added to `components/`. What the console introduces that the DS should
absorb as **canonical desktop-console patterns** (mobile-first tokens held; desktop is denser):

- **App shell** — 216px sidebar (brand lockup + Lucide-labelled nav + role footer), sticky, with a
  top-tab fallback. New pattern; not yet a component.
- **Data table** (`table.data`) — 13px, 12px muted header, hairline row rules, hoverable `rowlink`
  rows, `.mono`/`.num` cells (tabular figures on every fare/count/rating). The console's workhorse.
- **KPI card** (`.kpi`) — reuses Card; 28px tabular value, 12px label + hint. Dashboard + profiles.
- **Status pills** extend the existing muted/accent/danger convention with `good` (accent wash) /
  `bad` (danger wash `#faedeb`) / `mut` fills — order/KYC/settlement statuses.
- **Reason-code confirm modal** — the destructive-action pattern (title → consequence → required
  radio reason → optional/required note → audit line). Every suspend/ban/decline/refund/cancel uses it.
- **Detail scaffolds** — `.kv` key/value list, `.tl` 8-step delivery timeline (done/now/stall), `.warnbar`
  danger callout, `.doc-ph` striped document placeholder, `.empty` empty state, `.skel` skeleton rows.

**DS decision needed:** promote the six patterns above into real primitives (`DataTable`, `KpiCard`,
`ConfirmModal`, `KeyValue`, `Timeline`, `AppShell`) for the Next.js admin, or keep the console on
inline styles + `admin.css`. Recommendation: componentise `ConfirmModal` and `DataTable` first —
they carry the most logic and the audit contract. New pill fills (`bad` wash `#faedeb`) should be
tokenised (`--danger-wash`) rather than left as a literal.

### → Engineering (repo-side — `apps/admin`, Next.js)

The kit shows intended UX with fake data + simulated actions. Wire against the real API (`/admin/*`,
lane F). Tickets:

**P0**
- **A-01 · Audit log is a hard requirement, not UI polish.** Every suspend / lift / ban / KYC decline /
  fare-adjust / refund / order-cancel / issue-resolution / settlement must persist `{actor, action,
  target, reasonCode, note, timestamp}` server-side and be queryable. The modal already collects
  reason + note; the backend table + write path do not exist yet. Reason-code enums per action are
  defined in the kit's `confirmAction` calls — lift them as the source list.
- **A-02 · KYC decision write-back to Didit + rider app.** Approve → `kycStatus=verified` (rider can go
  online); decline → `failed` + reasonCode shown in the rider app, **one resubmit allowed** (attempt 2
  locks → support). Kit models the attempt counter and lock; wire the state machine + the rider-facing
  decline reason.
- **A-03 · Privacy masking is server-enforced.** Customer/rider full phone numbers must only be
  returned to admin **during an active order** (`PHONE_REVEAL_STATUSES`); masked otherwise. The kit
  masks in the client for the demo — the API must not send the full number outside that window.

**P1**
- **A-04 · Stuck-order detection.** "No GPS for N min while en_route" is a derived signal — define the
  threshold (kit uses 22 min shown, ~15–20 min suggested trigger), surface it on the order + the
  dashboard needs-attention queue, and back the **call / nudge** actions (nudge = push + SMS to rider).
- **A-05 · Dispute lifecycle.** Issues open from the app (customer/recipient/rider) with the order +
  OTP evidence attached; resolutions (**refund / rider strike / close-no-action**) must write to the
  order, the rider's strike count (3 → auto-cooldown, per mobile contract) and the customer record.
  The "delivery code not entered = unconfirmed delivery" rule should be a server flag, not a note.
- **A-06 · Cash settlement engine.** Weekly **15% commission** on agreed fares, settlement day Friday,
  refunds **netted** off a rider's commission, 7-days-overdue **auto-pauses** the rider account. These
  are assumptions baked into `cash.html` — **product must confirm the rate, cycle, netting and
  auto-pause rules** before this is built. Record-payment method enum: cash-at-agent / EcoCash / netted.
- **A-07 · Offline / stale discipline.** On socket drop the console shows the reconnecting banner,
  dims data and **disables all mutating actions** — mirror this: never let an action fire against
  stale state; re-enable on reconnect.

**Metrics the dashboard reads** (define/confirm the queries): live orders (`open_for_offers`+in-delivery),
riders online/verified, completed-today + completion rate, avg time-to-first-offer, expiry rate,
cancellation rate, KYC backlog, new signups, offers-per-broadcast, GMV/fares-today. Most map to the
existing `/admin/overview` shape; time-to-first-offer and completion-rate are new aggregates.

### → Design (open questions — product/design to confirm)

- **Didit auto-approve threshold.** Kit uses **face-match ≥ 0.85** as the auto-approve line and shows
  0.6–0.85 as "needs review". Confirm the real thresholds and what a human reviewer overrides.
- **Settlement model** (see A-06) — rate / cycle / netting / auto-pause are placeholders.
- **Reason-code taxonomies.** The per-action reason lists are a first draft — validate against how
  support actually categorises these, since they drive the audit log and any future analytics.
- **Roles.** Designed for a single ops admin (pilot-realistic). If support-agent vs super-admin
  splits later, ban/settlement/audit-export likely gate to super-admin — not designed yet.
- **KYC document viewer** uses striped placeholders; real ID/selfie rendering (and any
  redaction/retention policy for stored ID images) needs a design + legal pass.
- **Not designed (deliberately, pilot scope):** audit-log browser UI, bulk actions, search across
  all entities, CSV export, growth-scale multi-zone dashboards (the `growth` tweak only thickens
  data, it doesn't add zone filters).

## Before production

- Outline the Fredoka wordmark to SVG (drop the font dependency for the logo).
- Wire `assets/brand/icon/` into the app + web `<head>` (snippet in `assets/brand/icon/README.md`).
- Decide payment display copy when/if it moves beyond cash.
