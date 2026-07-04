# LyniaGo — Design System v3 Implementation Plan

**Date:** 4 Jul 2026 · **Branch:** `claude/design-system-implementation-dausly`
**Inputs:** `Lynia_Design_System_3.zip` (full package — supersedes `Lynia_Design_System_2.zip`, whose
`handoff/` folder it contains byte-for-byte) · the vendored `packages/design/` · the running apps.
**Status:** Phase 0 (vendor sync + token fix + this plan) is done on this branch. Phases 1–6 are the
execution plan, gated as noted.

This doc is two things: **(A)** the design ↔ code inconsistency register — every place the uploaded
design and the repo disagree, with the resolution — and **(B)** the phased engineering plan to
implement the new rider-journey, customer-journey and admin-console designs.

---

## A. Design ↔ code inconsistency register

### A1. The precedence rule — design system wins, except where it carries a violation

**Decision (4 Jul 2026). Two-part rule, applied in this order:**

1. **The updated design system is the source of truth for design decisions and edge cases.** Layouts,
   copy, states, the new flows/screens, the seam contracts — DS3 is authoritative and `packages/design/`
   is synced from it. The repo does not second-guess the design's intent.
2. **Where the design carries an objective *violation*, the corrected code file overrules it** — and
   only the violation is corrected, nothing else. A violation is a measurable defect, not a taste call:
   a WCAG contrast failure, a dropped accessibility feature. The design system does not get to keep a
   violation just because it is authoritative. The fix is **also** back-ported upstream so the next
   export stops carrying it.

These four DS3 files carry a violation, so the repo's corrected versions stand:

| # | File | DS3 (violation) | Repo (kept — corrects only the violation) |
|---|------|-----------------|-------------------------------------------|
| 1 | `packages/design/tokens/colors.css` | `--action-primary: var(--accent)` (#00B14F ≈2.9:1) | `var(--cta-fill)` (#00812F ≈4.7:1) — a white label on green must clear AA-large; `--accent` fails it |
| 2 | `packages/design/ui_kits/mobile/app.js` | Earnings hero `background: var(--accent)` + white text | `var(--cta-fill)` — same white-on-green contrast rule |
| 3 | `packages/design/ui_kits/mobile/kit-parts.js` | Toggle on-state: solid `--accent` fill + white text | `--accent-wash` bg + `--accent-text` — the on-state legible, not a 2.9:1 white-on-bright-green |
| 4 | `packages/design/components/feedback/Skeleton.jsx` | Pulse always animates | `prefers-reduced-motion: reduce` → static at 65 % opacity — restores the dropped a11y affordance |

**Scope of the override is minimal:** each file differs from DS3 by exactly the contrast/motion fix
and nothing else — every other layout, value and state in these files is DS3's. Everything in DS3
that is *not* a violation was taken as-is (the entire admin kit, the new flows, the journey maps, the
audit docs, the rest of every one of these four files).

**Back-port (upstream, owner: design tool):** re-land these four fixes in the design tool's source and
regenerate `_ds_bundle.js`, so the export stops contradicting the design system's own brand rules
(`readme.md` / `HANDOFF.md` already say white-on-green ⇒ `--cta-fill`, selected ⇒ wash — the token
file and kit just drifted from those rules). Standing rule for every future drop: **take the design
verbatim, except revert any re-introduced violation to its corrected version and flag it here.**

> Note: even absent the override, production contrast is safe — the apps consume
> `packages/shared/src/design-tokens.ts` + their own primitives, not `@lynia/design`, and DS3 didn't
> change those. The override matters for anyone lifting values out of the reference kit, which is
> exactly what the kit is for.

### A2. Repo-only artifacts the zip lacks — **preserved, do not delete on future syncs**

- `packages/design/assets/brand/lyniago-wordmark.svg` — the **outlined vector wordmark**
  (harfbuzz-kerned paths from Fredoka SemiBold). The zip's HANDOFF still lists "outline the
  wordmark" as a pre-production task — **it is already done in this repo** (plus
  `apps/mobile/src/ui/wordmark-paths.ts`; the Fredoka runtime font dep was removed).
- `packages/design/package.json` — the pnpm workspace manifest (`@lynia/design`); the zip is not a
  workspace member.
- `uploads/pasted-*.png` in the zip is unreferenced design-tool detritus — excluded from the sync.

### A3. Design docs list "repo-side tickets" that are already implemented — **docs stale, code ahead**

The zip's `HANDOFF.md` P0/P1 ticket list predates the current code. Verified in-code status:

| Handoff ticket | Status in repo | Evidence |
|---|---|---|
| P0 · Enforce both contact phones on submit | ✅ done | `apps/mobile/app/home.tsx:238` — broadcast blocked until both phones pass the contract's `min(6)` floor |
| P1 · Bounded timeouts + error states | ✅ done | `apps/mobile/src/api/client.ts` — 15 s AbortController, `ApiError`, friendly-message map |
| P1 · Select-offer 409 rollback ("rider just taken", muted) | ✅ done | `apps/mobile/app/order/[id].tsx:254-258` |
| P1 · Delivery-OTP 401 retry / 403 lockout + re-issue | ✅ done | `apps/mobile/app/rider/job.tsx:63-65`; `rotateDeliveryCode` wired API + customer screen |
| P1 · One round per rider (board hiding) | ✅ done | `apps/mobile/app/rider/index.tsx:146` (`bidIds` filter) + DB unique `[orderId, riderId]` |
| P1 · Phone reveal gated to active window | ✅ done (customer/rider) | `PHONE_REVEAL_STATUSES` enforced in `apps/api/src/orders/orders.service.ts` — **but not for admin, see A5·A-03** |
| P1 · Rider heartbeat + cooldown-403 auto-offline | ✅ done | `apps/mobile/app/rider/index.tsx:91-110`, `apps/api/src/riders/rider.service.ts` |

**Resolution:** treat the vendored `HANDOFF.md`/`ALIGNMENT-REVIEW.md` ticket lists as historical;
this register is the live one. Only the items in A4/A5 below are actually open.

### A4. Genuine contract conflicts and gaps — **code must change** (the real work)

These are the seam contracts (`INTERFACE-AUDIT.md` C1–C9) and 2026 journey flows the code doesn't
implement yet. Verified against the code, not assumed:

| ID | Conflict / gap | Current code | Required by design | Fix |
|----|----------------|--------------|--------------------|-----|
| **C3** | **Cancellation matrix conflict** | `CUSTOMER_CANCELLABLE_STATUSES` = `open_for_offers…en_route_pickup` (pre-pickup only) in `packages/shared/src/enums.ts:53` | Customer may cancel at **any** status; post-pickup cancel shows sender contact for hand-back; rider gets `job_cancelled` terminal, **no** reliability impact. Rider cancel blocked from `picked_up` onward, triggers auto re-broadcast + reliability decrement | Extend the enum + server guard; add rider-side cancel window; push one two-sided event |
| **C6 / F-02** | **No undeliverable terminal** | `OrderStatus` has only `cancelled`/`expired` terminals | `undelivered` terminal with reason enum `unreachable \| refused \| wrong_address \| breakdown` + attempt count, rendered verbatim on the customer's terminal screen | Prisma migration + shared enum + lifecycle transition + both apps' terminal screens |
| **F-07 / C1** | **Counter-offer UX missing** | `OfferType.counter` exists in schema/contracts; riders can send a fare ≠ ask. But `apps/mobile/app/order/[id].tsx` renders all offers identically — no ask-vs-counter comparison, no accept/decline treatment, no "decline keeps the bid live at the countered price" semantics | Counter surfaces as Accept/Decline (ask vs counter + delta); decline is **client-side dismissal only**; one round, no counter-back; never auto-charge above ask | Customer offer card variant + local dismissal state; server: nothing new except guaranteeing one offer per rider (already unique-indexed) |
| **C2** | **Auction clock not shared** | `expiresAt` never sent to bidders (`contracts.ts` board payloads carry no expiry) | Rider's `offer_sent` screen shows a live countdown of the same 90 s window; on expiry with no pick, push `bid_expired` to all bidders (distinct from `not_chosen`) | Add `expiresAt` to board/offer payloads; add `bid_expired` WS event + rider screen |
| **F-01** | **Rider-cancel → auto re-broadcast** absent | No re-broadcast path | Assigned rider cancelling/no-showing re-opens the auction at the same price without the customer starting over | New lifecycle transition cloning order params into a fresh `open_for_offers` window |
| **C4** | Lockout → re-issue loop is one-sided | Lockout copy + customer re-issue button exist, but no rider → customer "ask to re-send" ping | Rider lockout screen action → push notification deep-linking the customer's existing re-issue button; re-issue resets the attempt counter | New notification + attempt-counter reset in `rotateDeliveryCode` |
| **C5** | Presence escalation missing | Reconnecting chips exist both sides; no ~2-min escalation, no staleness push to customer tracking | One shared constant (~2 min dark) escalates both sides; stale rider position must not render as live | Shared `PRESENCE_ESCALATION_MS`; server watchdog + WS event; muted → warning UI both apps |
| **C8** | Rate-the-sender missing | `Rating` model is per-order single-direction (customer → rider) | Optional rider → sender 1–5 at `job_delivered`; feeds fault attribution; not public at launch | Add direction/role to `Rating` (unique per order **per rater**), rider UI |
| **C9** | Role-switch de-dupe | KYC form asks name/ID fresh | Pre-fill from `Profile` (registration already stores name + ID); permission priming once per device | Mobile-only change (`rider/become.tsx` prefill) |
| **New screens** | Role selection · pickup item verification · pre-broadcast disclaimer (A1-8) · Places search-first addressing | None exist in `apps/mobile/app/` | Designed in `new-flows.html` + journey maps | Phase 3/4 below; item verification also persists per-item confirmation on the order (JSON alongside `items`) |
| **R-01** | Reliability score | `cancelStrikes` + `cooldownUntil` exist on `Rider` — a seed, not the designed score | Defined maths (pre/post-pickup cancels, no-shows, ratings), threshold trips `on_hold` | Blocked on product decision **Q2** — see §C |

### A5. Admin console: designed 7-screen tool vs. implemented 3-page monitor

Current `apps/admin` = dashboard, orders, riders-KYC (Next.js server components, inline styles).
The DS3 kit adds **Customers, Issues, Cash & settlements, order/rider/customer detail screens,
reason-code confirm modals, and live/empty/loading/offline states on every page.** Verified backend
gaps behind the kit's tickets:

| Ticket | Verified gap | Fix |
|---|---|---|
| **A-01** Audit log (P0) | No `AuditLog` model in `prisma/schema.prisma`; no write path | New table `{actor, action, target, reasonCode, note, timestamp}` + write in every admin mutation; reason-code enums lifted from the kit's `confirmAction` calls |
| **A-02** KYC decision write-back (P0) | `retryKyc` exists (`rider.service.ts:97`) but **no attempt counter, no 2-attempt lock**, no rider-facing decline reason | Attempt counter on `Rider`, lock at attempt 2 → support; decline `reasonCode` surfaced in the rider app |
| **A-03** Privacy masking (P0) | `admin.service.ts:85-91` returns **full phone numbers unconditionally** — the kit only masks client-side | Server masks outside `PHONE_REVEAL_STATUSES` of an active order; API never sends the full number otherwise |
| **A-04** Stuck-order detection | No derived no-GPS signal | Threshold (~15–20 min) + needs-attention queue + call/nudge actions |
| **A-05** Dispute lifecycle | No `Issue` model | Issues from app with order + OTP evidence; resolutions write to order, rider strikes (3 → cooldown exists already), customer record |
| **A-06** Cash settlement | Nothing (earnings screen shows 0 % placeholder) | **Blocked on product confirming** rate (kit assumes 15 % weekly, Friday, netting, 7-day auto-pause) |
| **A-07** Offline discipline | No socket in admin (plain fetch, server components) | When admin goes live-data: disable mutating actions on stale state |

**DS decision (from the handoff, recommendation adopted):** componentise **`ConfirmModal` and
`DataTable` first** (they carry the audit contract and the console's workhorse layout); keep the
rest (`KpiCard`, `KeyValue`, `Timeline`, `AppShell`) as `admin.css` patterns until a second consumer
appears. `--danger-wash` is now a real token (see A6).

### A6. Design-internal debt fixed in this drop

- **`--danger-wash #FAEDEB` tokenised** (was a literal ×4 in `ui_kits/admin/admin.css`): added to
  `packages/design/tokens/colors.css`, `packages/shared/src/design-tokens.ts` (`dangerWash`),
  `apps/admin/app/globals.css`, `docs/DESIGN.md` — all four palette faces.
- `--action-primary` is held at `--cta-fill` (the §A1 violation override); it is also a **dead token**
  (no consumer — `Button.jsx` uses `--cta-fill` directly), so wire it or drop it in the design tool.

### A7. Code-side systemic debt the new designs will collide with

Found while mapping; these make every future design drop more expensive and should be paid down
(Phase 6):

1. **Typography tokens exist but are unused.** `tokens.font.size`/`tokens.leading` are consumed in
   exactly **one** place (`apps/mobile/src/ui/MapPicker.tsx:136`). Everything else hardcodes
   `fontSize:` literals — `apps/mobile/app/order/[id].tsx` ×21, `src/ui/index.tsx` ×13,
   `home.tsx` ×10; admin uses none. A type-scale change in the DS would propagate **nowhere**.
   Fix: adopt `font.size.*`/`font.weight.*` in the primitive library first, screens opportunistically.
2. **The palette exists in three hand-synced copies:** `packages/design/tokens/colors.css` (truth),
   `packages/shared/src/design-tokens.ts` (apps), `apps/admin/app/globals.css` (hand-copied hexes).
   Fix: generate the TS mirror and the admin `:root` block from the CSS (build step or checked-in
   codegen with a drift test) — a one-day guard that ends this whole class of bug.
3. **RN `shadow` tokens are documented approximations** of the multi-layer CSS shadows — any shadow
   change needs a manual RN re-tune (accepted; keep documented).
4. **Off-scale magic numbers** (Button `paddingVertical:14`/`paddingHorizontal:22`, pill radius 11,
   `phone.tsx` literal `24`, admin pill `32/36` heights). The desktop-density ones are intentional —
   tokenise as `--target-desktop-*` rather than leaving literals.
5. **`KycBadge` is a bespoke pill** because `StatusPill` lacks a `danger` tone — either add the tone
   to the shared pill (design decision) or keep documenting the divergence.

---

## B. Phased execution plan

Sequencing follows the design package's own `BACKLOG-PLAN.md` principles: pairs stay pairs (every
seam contract is **one server-side transition pushed to both apps**), logic before polish, decisions
unblock waves. Sizes: S ≤1 d · M 2–3 d · L ≥1 w.

### Phase 0 — Vendor sync + guardrails ✅ (this branch)
DS3 synced into `packages/design/` (regression-safe per §A1/A2); `--danger-wash` tokenised; this
plan. **Gate:** `pnpm build && pnpm typecheck && pnpm lint` clean.

### Phase 1a — Order-lifecycle contracts & schema (M, blocks Phases 2–4)
One PR that changes the **shared status machine once** (C7: customer timeline and rider stepper are
two views of one enum):
- `OrderStatus.undelivered` + `UndeliveredReason` enum + attempt count (Prisma migration + `enums.ts`).
- **Deployed-client compatibility (required):** old app builds switch on `OrderStatus` and will
  receive the new `undelivered` value over WS/REST. Before the server ever emits it, ship a client
  fallback (unknown status → generic terminal treatment, never a crash) and audit every exhaustive
  switch (`Stepper`, admin status pills, history rows). Staged rollout: enum lands + clients tolerate
  → server starts emitting.
- `CUSTOMER_CANCELLABLE_STATUSES` → all pre-terminal statuses; new `RIDER_CANCELLABLE_STATUSES`
  (`assigned…en_route_pickup`). **Regression tests on the existing pre-pickup cancel path are
  CRITICAL** — this edits behavior existing callers rely on.
- `expiresAt` on board/offer payloads; WS events `bid_expired`, `job_cancelled`, presence-escalation;
  shared `PRESENCE_ESCALATION_MS ≈ 120_000`.
- `disclaimerAcceptedAt` + policy version on `Order` (A1-8 consent); `itemsCollected` JSON (item
  verification); `Rating.raterRole` (C8).
- **Token drift test (pulled forward from Phase 6):** a unit test in `packages/shared` that parses
  `packages/design/tokens/*.css` and asserts value-identity with `design-tokens.ts` (and optionally
  the admin `globals.css` `:root` block). Hours of work; guards every UI phase that follows.

### Phase 1b — Admin/compliance schema (S, blocks Phase 5 only)
Separate PR so admin-lane models never gate the mobile-critical migration:
- `AuditLog` model `{actor, action, target, reasonCode, note, timestamp}` + `Issue` model.
- **Reason-code enums live in `packages/shared`** (one source for API validation, admin UI and the
  audit log) — lifted from the kit's `confirmAction` calls, not re-typed per app.
- KYC attempt counter on `Rider`.

### Phase 2 — Server-side seam transitions (L)
Implement C1–C6 + F-01 as lifecycle transitions in `order-lifecycle.service.ts` / `matching.service.ts`,
each pushing to both apps over the existing socket gateway: counter one-round rules (C1), shared
clock + `bid_expired` fan-out (C2), cancellation matrix + auto re-broadcast (C3/F-01), re-issue loop
+ attempt reset (C4), presence watchdog + staleness push (C5), undelivered reason flow (C6).
Design decisions pinned by the eng review:
- **F-01 re-broadcast creates a NEW `Order` row** (cloned params, `rebroadcastOfId` back-link), never
  re-opens the old row — the append-only `OrderEvent` timeline and settlement history stay clean.
- **C5 watchdog mechanism:** extend the existing heartbeat machinery (`Rider.lastHeartbeatAt` +
  socket disconnect events) with a periodic scan over `ACTIVE_RIDE_STATUSES` orders; one shared
  `PRESENCE_ESCALATION_MS` constant on both sides of the seam. Pilot-scale scan is fine — no new
  infrastructure (boring by default).
- **Auction expiry has one timer authority (the server).** Clients render countdowns from
  `expiresAt`; only the server's expiry emits `bid_expired`/`expired` — no client-driven expiry
  mutations, no thundering re-fetch.
- **A-03 masking reuses the existing redaction helper** in `orders.service.ts` (the
  `PHONE_REVEAL_STATUSES` logic) — one masking implementation, admin routes call the same code path.
**Gate:** integration specs per transition (extend `order-lifecycle.int.spec.ts`), including
**two-sided assertions** — each contract's spec asserts the WS payload BOTH apps receive (e.g.
post-pickup customer cancel → rider gets `job_cancelled` with sender contact), plus the race cases:
pick-vs-cancel, counter-accept vs window expiry, re-issue resets the attempt counter.

### Phase 3 — Mobile customer flows (L)
Wire `new-flows.html` designs: pre-broadcast disclaimer gate → counter-offer Accept/Decline card →
rider-cancelled auto-re-broadcast notice → undeliverable terminal → cancel-anytime (incl. post-pickup
hand-back warning) → Places search-first addressing + confirm-pin + Maps route-sync row (needs a
Google Places key + budget decision).

### Phase 4 — Mobile rider flows (M)
Role selection after OTP (shared entry, also fixes R0-4 discovery) · pickup item-verification
checklist ("Confirm N items collected") · `bid_expired` + `job_cancelled` screens · offer-sent live
countdown · lockout "ask customer to re-send" · go-offline/app-close guard with active job (R-05) ·
KYC pre-fill (C9).

### Phase 5 — Admin console build-out (L)
`DataTable` + `ConfirmModal` primitives → Customers/Issues/Cash pages + detail screens → A-01 audit
log on every mutation → A-02 KYC state machine → A-03 server-side masking → A-04 stuck-order queue →
A-05 dispute lifecycle. A-06 settlement **only after product confirms the model**. Dashboard adds
time-to-first-offer and completion-rate aggregates to `/admin/overview`.

### Phase 6 — Design-debt paydown (M, parallelisable)
Typography-token adoption in both primitive libraries · palette **codegen** (the drift *test* moved
to Phase 1a; codegen replaces the three hand-synced copies when convenient) · desktop target tokens ·
`StatusPill` danger tone decision · upstream the four §A1 fixes into the design tool and regenerate
the bundle.

### Cross-cutting gates (gstack)
Per CLAUDE.md: `/review` + `/codex` on each phase PR, `/qa` browser pass on admin + the mobile kits,
`/ship` for release. Waves 1–2 of `packages/design/BACKLOG-PLAN.md` (SOS, report/block, order-level
support, reliability maths, auction-integrity hardening) run as the **pre-launch product backlog**
alongside Phases 2–4 — they are product scope, not design-propagation scope.

---

## C. Open product decisions (block specific phases, not the plan)

| # | Decision | Blocks | Owner |
|---|---|---|---|
| Q2 | Reliability-score maths + `on_hold` threshold | R-01 (Phase 2 hard-codes only the event hooks) | Product |
| Q3 | SOS behaviour (999 / safety line / WhatsApp) | Backlog Wave 1 | Product |
| A-06 | Settlement: 15 % weekly Friday, netting, 7-day auto-pause — kit assumptions | Phase 5 cash screens | Product/Finance |
| — | Didit auto-approve threshold (kit: face-match ≥ 0.85, review 0.6–0.85) | Phase 5 KYC review | Product/Compliance |
| — | Reason-code taxonomies (drive the audit log) | Phase 5 | Support/Product |
| Q1 | Service corridor boundary | Backlog Wave 3 | Product |
| — | Google Places API key + usage budget | Phase 3 addressing | Eng/Product |

---

## D. Eng-review outputs (gstack `/plan-eng-review`, 4 Jul 2026)

### NOT in scope (considered, explicitly deferred)
- **Payment/settlement engine** — off-platform cash by product decision; only the Phase 5 record-keeping screens, and only after A-06 is confirmed.
- **BACKLOG-PLAN Waves 3–7** (compose guardrails, auth resilience, live-trip quality, account/KYC depth, growth) — product backlog, sequenced separately; only Waves 1–2 run alongside this plan.
- **Localisation (Shona/Ndebele)** — Q4, post-launch call.
- **Multi-role admin (support-agent vs super-admin)** — single ops-admin at pilot; deliberately not designed.
- **Audit-log browser UI, bulk actions, CSV export** — pilot scope excludes them (kit does too); the audit *write path* (A-01) is P0, the browser is not.
- **In-app chat** — help stays on WhatsApp.
- **Design-tool upstreaming** of the §A1 fixes — tracked in Phase 6; can't be done from this repo.

### What already exists (reuse, don't rebuild)
The register's §A3 table is the inventory: contact-phone guard, bounded timeouts, 409 rollback,
OTP lockout + `rotateDeliveryCode`, one-round board hiding, `PHONE_REVEAL_STATUSES` redaction,
heartbeat/cooldown — all live code. Phase 2 **extends** these (attempt-counter reset hooks into
`rotateDeliveryCode`; presence watchdog extends heartbeat; masking reuses the redaction helper;
re-broadcast reuses order-creation + matching). `OfferType.counter` and the unique
`[orderId, riderId]` index already encode C1's one-round rule at the data layer — the work is UX
and transition logic, not schema.

### Failure modes (per new codepath → mitigation in plan)
| Codepath | Realistic failure | Covered by |
|---|---|---|
| `undelivered` over WS to old clients | deployed app crashes on unknown enum | Phase 1a fallback + staged rollout + switch audit |
| Post-pickup customer cancel | rider left on a dead job screen (pick→confirm race) | C3 two-sided event + race spec (Phase 2 gate) |
| Auto re-broadcast (F-01) | double re-broadcast on retried cancel webhook | new-row + `rebroadcastOfId` uniqueness; idempotency spec |
| `bid_expired` fan-out | client timers drift → premature "expired" UI | single server timer authority; clients render `expiresAt` only |
| Presence watchdog | flapping socket → escalation spam | escalate only after `PRESENCE_ESCALATION_MS` continuous dark; reset on reconnect |
| Counter accept | accept lands after window expiry | server validates status at accept; 409-style muted rollback (pattern exists) |
| Re-issue code | attempt counter not reset → rider stays locked | spec asserts reset in `rotateDeliveryCode` path |
| Admin mutations | action fires without audit row | audit write in the same transaction as the mutation (A-01) |
| Token edits | CSS/TS/globals drift silently | Phase 1a drift test in CI |

### Worktree parallelisation
| Lane | Steps | Modules | Depends on |
|---|---|---|---|
| A | Phase 1a → Phase 2 | `packages/shared`, `apps/api` | — |
| B | Phase 1b → Phase 5 | `packages/shared` (additive), `apps/api/admin`, `apps/admin` | 1a merged (shared enums rebase) |
| C | Phase 3 → Phase 4 | `apps/mobile` | Phase 2 transitions it consumes (screen-by-screen, not all-of-Phase-2) |
| D | Phase 6 | `packages/design`, both primitive libs | — (fully parallel) |

Launch A first; B and D immediately after 1a merges; C tracks Phase 2 transition-by-transition.
Conflict flag: A and B both touch `packages/shared` — keep 1b additive-only and rebase.

## E1. Verification run — 4 Jul 2026 (implementation branch)

Executed against the implemented branch, not just static checks:

- **Static gate:** `pnpm typecheck` (5/5), `pnpm lint`, `pnpm build`, `pnpm test` all green.
  Unit tests: 329 API + 23 mobile + shared.
- **Real DB migration:** Postgres 16 + PostGIS 3.4 (local cluster). `prisma migrate deploy` applied
  all 9 migrations clean, `0009_seam_contracts` included; verified in-DB that the `undelivered` enum
  value, the seven new `orders` columns, `riders.kyc_attempts`, and the rebroadcast index all landed.
- **Integration suite (needs a live PostGIS):** `pnpm --filter @lynia/api test:int` → **32/32** —
  order-lifecycle (the two-sided seam transitions: cancellation matrix, F-01 re-broadcast, undelivered
  guard), matching offer-loop, tracking, client-metrics. Surfaced one **test-only** bug the mocked unit
  run couldn't (Prisma `Decimal.toString()` drops trailing zeros: `"2.50"` → `"2.5"`); fixed the
  assertion to compare Decimals by value.
- **Admin browser QA (headless Chromium):** all **10 routes** (overview, orders, riders, customers,
  issues, cash + detail views) return 200 with zero console/page errors and the DS3 shell on every
  page. Degraded (`API_BASE_URL` unset) states render correct placeholders; the **A-06 settlement
  caveat** banner is prominent on `/cash`; accent-split verified visually (active nav = `accentWash` +
  `accentText`, not a fill). **Not covered here** (needs a connected API + seed): the ConfirmModal
  destructive-action interaction and DataTable-with-rows — actions are deliberately disabled until the
  console is connected, so that belongs to a connected-stack QA.

## E. Verification checklist (every phase)

1. `pnpm install && pnpm build` clean (Turbo) · `pnpm typecheck` · `pnpm lint` · `pnpm test`.
2. Token drift: CSS ↔ `design-tokens.ts` ↔ admin `globals.css` ↔ `docs/DESIGN.md` value-identical.
3. Accent-split audit greps stay clean everywhere: no white text on `accent`; green text only via
   `accentText`; selected states only wash+text; gold never carries text. This holds in the shipping
   layer (`packages/shared` + app primitives + screens) **and** in the `packages/design/` reference
   kit — the four §A1 violation overrides keep the kit clean too. A future DS drop that re-introduces
   any of these four is a **violation**: revert it to the corrected version and note it in §A1.
4. No new hardcoded hexes/sizes where a token exists (`_adherence.oxlintrc.json` is the design-side
   lint; extend repo lint similarly).
5. Journey maps + `COVERAGE.md` updated when a designed screen ships (the standing rule from
   `BACKLOG-PLAN.md`).

---

## GSTACK REVIEW REPORT

**Skill:** `/plan-eng-review` (via `/gstack` router) · **Date:** 4 Jul 2026 · **Branch:** `claude/design-system-implementation-dausly`
**Target:** this plan · **Mode:** autonomous remote session (spawned-mode rules: recommended options auto-adopted, findings applied in place)

| # | Section | Finding | Severity · Confidence | Resolution |
|---|---|---|---|---|
| 1 | Architecture | Phase 1 bundled admin-only models with the mobile-critical status-machine migration | P1 · 8/10 | **Applied** — split into Phase 1a (lifecycle) / 1b (admin), §B |
| 2 | Architecture | New `undelivered` enum value reaches deployed clients that switch exhaustively on `OrderStatus` | P1 · 8/10 | **Applied** — client unknown-status fallback + staged rollout in Phase 1a |
| 3 | Architecture | F-01 re-broadcast semantics unpinned (reopen row vs new row) | P2 · 7/10 | **Applied** — new `Order` row + `rebroadcastOfId`, Phase 2 |
| 4 | Architecture | C5 watchdog had no named mechanism/home | P2 · 7/10 | **Applied** — heartbeat-scan extension, no new infra, Phase 2 |
| 5 | Code quality | Token drift test scheduled last (Phase 6) though it guards Phases 3–5 | P2 · 8/10 | **Applied** — pulled into Phase 1a |
| 6 | Code quality | Reason-code enums risked being re-typed per app | P2 · 7/10 | **Applied** — single source in `packages/shared`, Phase 1b |
| 7 | Tests | `CUSTOMER_CANCELLABLE_STATUSES` change edits existing behavior with no regression tests named | P1 · 9/10 | **Applied** — regression tests marked CRITICAL, Phase 1a (iron rule) |
| 8 | Tests | Seam-contract specs were server-state only; two-sided WS payloads unasserted | P2 · 8/10 | **Applied** — two-sided assertions + race cases in the Phase 2 gate |
| 9 | Performance | Watchdog scan / dashboard aggregates at pilot scale | P3 · 6/10 | No action — boring-by-default; revisit at growth scale |
| 10 | Performance | Client-side auction timers could drive expiry mutations | P2 · 7/10 | **Applied** — single server timer authority, Phase 2 |

**Scope challenge (Step 0):** complexity check triggers by design (multi-phase program, >8 files); scope
is the uploaded design drop, not creep. Largest deferral opportunities are already deferred (§D NOT in
scope). Reuse inventory confirmed (§D What already exists) — no parallel rebuilds found.

**Outside voice:** skipped — `codex` CLI unavailable in this environment. Recommend `/codex` as an
independent second opinion when running locally, per repo convention (CLAUDE.md step 6).

**Verdict: DONE_WITH_CONCERNS** — plan locked with the applied changes above. Concerns that remain open
(not blockers, tracked in §C): four product decisions (Q1–Q4), settlement model A-06, Didit thresholds,
and the §A1 back-port — the design system is source of truth, but four DS3 files carry an objective
violation (WCAG contrast ×3 + a dropped reduced-motion affordance), so the corrected code overrules
them and the fixes must be re-landed in the design tool so the next export stops re-introducing the
violation.
