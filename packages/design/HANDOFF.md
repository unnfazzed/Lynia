# LyniaGo Design System — Engineering Handoff

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
├─ DESIGN-IMPROVEMENTS.md         ← gstack design-review response
├─ ALIGNMENT-REVIEW.md            ← design ↔ contract alignment (all P0/P1 resolved)
├─ ITEM-DESIGN-REVIEW.md          ← the "what are you sending?" model decision
├─ COVERAGE.md                    ← screen-by-screen: what's designed vs. out of scope
├─ INTERFACE-AUDIT.md             ← customer ⇄ rider seam audit + resolution log (D1–D12)
├─ BACKLOG-PLAN.md                ← remaining backlog sequenced into 7 execution waves
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

Carried from `ALIGNMENT-REVIEW.md`. The design shows the intended UX; these wire it to the backend.

**P0**
1. **Enforce both contact phones on submit.** `apps/mobile/app/home.tsx` must block "Broadcast" while
   either pickup or drop-off `contactPhone` is empty (contract requires `min(6)`). The design already
   requires both on the required path — the app currently can send `contactPhone: ""`.

**P1**
2. **Bounded request timeout + error state on every async action** (send code, broadcast, select,
   submit KYC, confirm delivery). 15s AbortController → a friendly retry (the `Field.error` slot and
   `OfflineBanner` exist for this). No screen should hang on a spinner.
3. **Select-offer race (409).** Optimistic assign → on 409 roll back with the muted "That rider was
   just taken — choose another." (never error-red). Kit shows the UX; wire the real mutation.
4. **Delivery-OTP: 401 retry + 403 lockout + re-issue.** 5 wrong attempts → lockout copy on the rider
   side; customer "Re-issue delivery code" calls `rotateDeliveryCode`. Kit shows both.
5. **One round per rider on the board.** After an offer, hide that order (`bidIds`); a job starts only
   when the customer selects. Kit shows this.
6. **Bidirectional phone reveal** gated to `assigned`→`completed` (`PHONE_REVEAL_STATUSES`); hide
   after. Kit shows both sides.
7. **Rider heartbeat + cooldown-403** → auto-flip to offline with a reason; connection chip supports
   the "Reconnecting" state.

**On-device checks (can't judge from a screen)**
8. CTA green (#00812F) contrast in real sunlight — re-tune `--cta-fill` if needed (one line).
9. Skeleton→content reflow on a real device; bottom-sheet drag physics on the map home.

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
cash, off-platform, no commission at launch**; **earnings is a record of work, not a wallet**;
**riders can accept _or_ counter** a price; **non-delivery is the customer's own risk** (terminal
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
- **R-16 · Rider SOS / report.** No emergency control or report-a-customer on a live cash hand-off —
  highest-value safety gap. (Flagged on the map.)
- **R-06 · Counter re-counter rules.** ✅ **Decided (seam contract C1):** one round, no counter-back
  — the customer accepts or declines; a declined counter stays live at the countered price until the
  window closes. No "your counter was countered" screen exists or is needed.
- **R-03 · Hand-off lockout recovery.** 5 wrong codes → lockout is designed; the lockout screen now
  has **"Ask customer to re-send the code"** — wire it to ping the sender (contract C4).
- **R-04 / R-05 · Mid-job connection.** Escalation threshold decided: **~2 min dark** on either side
  (contract C5). Still to wire: the escalation itself, and the guard on a *deliberate* go-offline /
  app-close while holding a parcel (block or warn, don't silently allow).
- **R0-2 · Notifications-denied fallback.** A rider who declines push misses new-order and
  "you were picked" pings — warn and offer a fallback.
- **X-1 · Order-level support.** Let a rider raise an issue tied to a specific job with its context,
  not just generic WhatsApp help.

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
- **A-06 · Commission (prepaid per-ride).** Commission is a **percentage of the amount paid per ride**,
  deducted per completed ride from a **commission account the rider pre-funds**; a low balance blocks
  going online until they top up. The rate is **0% for the launch period** (nothing collected), so
  `cash.html` is a read-only overview of ride volume + commission accrued at the current rate. This
  **replaced** the old weekly 15% cash-settlement engine (no more weekly billing, refund-netting,
  record-payment or overdue auto-pause). Rate/gating live in `@lynia/shared` `COMMISSION`; the prepaid
  wallet (balance, top-ups, per-ride deduction ledger) is a later build — see
  `docs/plans/2026-biker-prepaid-commission.md`.
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
