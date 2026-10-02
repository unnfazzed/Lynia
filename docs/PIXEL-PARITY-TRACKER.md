# Pixel-parity tracker

Progress for the app-wide pixel-alignment workstream (`CLAUDE.md` → "Pixel parity"). Source of
truth is the **2026-08-10 rev 2** design export in `packages/design/`; the inventory below is
generated from `packages/design/EXPORT-MANIFEST.txt`.

**A screen counts as done when it is adopted (wired to an app target) and the automated guardrail
suite stays green** — token-conformance + screen-inventory + reverse-drift freeze (see `CLAUDE.md` →
"Pixel parity" → the guardrail suite). Owner decision 2026-08-11: the guardrail suite REPLACES the
per-screen human visual-OK sign-off; ✅ is a machine state, not an eyeball. Structure, geometry,
colour, type and copy must all match the mock, and the guardrails are what enforce it.

| Status | Meaning |
|---|---|
| ⬜ | not started (mock adopted, no app target wired — `PENDING` in `tools/parity/parity-status.mjs`) |
| 🔧 | in progress |
| ✅ | adopted + guardrails green — wired in `tools/parity/app-targets.mjs`, token/inventory/reverse-drift checks passing |
| ⛔ | backend-gated: designed but not renderable without a seeded backend — `BACKEND_GATED` (with a reason) in `tools/parity/parity-status.mjs`, tracked as an issue |
| ⏭ | superseded: an owner handoff replaced this gallery screen as the authority (see the ledger entry named on the row); not aligned to until a gallery export redraws it |

The guardrail suite is the enforcement: the screen-inventory guardrail
(`apps/api/src/parity/screen-inventory.spec.ts`) fails CI if any screen is neither wired nor
allowlisted, so this tracker can never silently fall behind the gallery.

**⛔ is provisional.** Only the states the 2026-08-05 audit named explicitly are pre-marked. Every
phase begins by verifying build status for its own screens against source — a screen is never
dropped from scope on the strength of a stale audit line.

**Standing drift watch (added 2026-08-23).** Between full alignment passes, the weekly **UI Parity
Audit** routine (`docs/ROUTINES.md` §"UI Parity Audit (report-only)", prompt mirror
`docs/routines/ui-parity-audit.md`) re-renders every wired screen against its mock and re-runs the
structural-conformance suite, specifically watching for a screen that regresses after being marked
👁/✅ here. It is **report-only** — it never edits this tracker's status marks or any app/design code,
only the dated `docs/UI-PARITY-AUDIT-<date>.md` report and `docs/KNOWN_BUGS.md` (`UIP-` rows). Treat a
`UIP-` ledger row as a signal to re-open this tracker's row for that screen, not as the tracker having
already been updated.

Retired designs (`LJ home_launcher`; the nine `RJ` originals) are **absent from the gallery by
design** and therefore absent below — never align to them. Note `RJM board` and `LJ profile` ARE
current; only the `RJ` originals were retired.

**rev 2 added 31 states (the `SH·` shipped-states wave)** — the offline / draft-restore / keyless-
search / flag-off / permissions / proof-of-pickup / merchant-item-out states the app already ships
but that had never been designed. They are built-but-unaligned, so they start at ⬜ like any other
screen; the handoff sheet is `ui_kits/mobile/shipped-states.html` (SH1–SH12).

Counts: **295 designed states** — customer 122 · rider 98 · merchant 48 · admin 7 · safety sheet 20.

## Foundation-F codegen adoption — final status (2026-08-12)

The mobile **structural-snapshot codegen** adoption (`docs/plans/2026-08-11-mock-adoption-program.md`)
ran to its ceiling. **32 mobile views are guardrail-proven congruent** to their mocks
(`node tools/parity/codegen/cli.mjs check` = 32/32; the structural-snapshot spec asserts each tree ≡
the mock's). Foundation tooling built across a→e: render-helper/SHELL unwrap, W-KIT member-tag
resolution, map/sheet remaps + non-`Screen` slot locator, `RTracker→Stepper`, and the transpiler
idioms (template-literal border / conditional shadow-spread / mixed text+element siblings).

**Merchant (47 RM) + admin (7)** are **web** (Next/direct-DOM), already built to the mocks in Phase 6
and enforced by the **token-conformance + screen-inventory** guardrails — the mobile codegen does not
apply to them; the only open item is a seeded parity instance for *offline-screenshot verification*
(#674, infra — not a structure gate).

**69 mobile states remain deferred, each with a precise recorded reason** in
`tools/parity/codegen/adopted.mjs`, in three buckets — none is a codegen gap:
- **Backend-gated (#670–#674)** — `RC.pay_*` (payment-prompt flow #670), `RC.track_secured`
  (rider identity #671), `RC.delivered_rate` (dual food+rider ratings/chips #672), discovery
  ratings/ETA/geo (#673). Owned by the backend session (`apps/api`); adopt when those land.
- **App re-architecture (sensitive, not codegen)** — the rider board/offer/active screens are aligned
  to the **superseded `r-rider` kit** and need realigning to the current **RJM** mocks; the parcel
  **auction** draws bids inline and needs its ranking/select container restructured. Both touch
  sensitive accept-offer / agreed-price / order-assignment code, so they are a deliberate, separately
  scoped, regression-tested effort — **not** an autonomous codegen sweep.
- **Undesigned superset** — live affordances no static mock draws (profile-draft-restored banner,
  account hub-nav, `on_hold` restore, `generic_error`). Need an upstream mock or descope.

Guardrail suite (token-conformance · screen-inventory · reverse-drift freeze · structural-snapshot)
is green on `main`; the adopted set is congruent-by-construction and cannot silently regress.

**Rendered-expectation coverage (2026-08-21).** All 67 wired mobile targets now carry a committed
`tools/parity/expected/<key>.json`, and all 67 reproduce byte-for-byte under
`node tools/parity/extract-expected.mjs --check`. The 11 `RC.*` targets wired by PR #795 (await_accept,
cart_empty, item_removed, list_error, list_loading, menu_closed, no_rider, pay_confirmed, refunded,
rejected, track_prep) had been listed pending with no expectation file extracted at all — which
`--check` reports as `≠`, indistinguishable from real drift, and which nothing caught because `--check`
was not in CI. Both holes are closed: `--check` runs as the last step of `parity-render` (non-blocking,
it needs a browser) and the *blocking* mobile test job now requires an expectation for every wired
target, an `index.json` that matches the directory, and no expectation outliving its target.

> **Lane wiring ≠ sign-off.** Phase 2 of the screenshot lane (PR for `claude/phase-2-multi-agent`) wired
> the app side of **47 screens** — the primary populated state of every top-level app route across all
> four surfaces — so an alignment reviewer can now generate a real side-by-side for them
> (`cd tools/parity && node pair.mjs --keys <src.id> --out out/sheet`) instead of an app-column
> "pending". This does **not** advance any status below: a screen still only earns 👁/✅ when its
> side-by-side is built and the user signs it off. The wiring is the *tool* that makes those sheets
> cheap to produce; the alignment work and sign-off remain per-screen. Wired keys and their fixtures
> are listed in `tools/parity/app-targets.mjs`; the coverage summary is in `docs/SCREENSHOT-LANE.md`.

---

## CUSTOMER (All Screens Gallery)


### C1 · First run

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C1·1 | `LJ splash` | Splash | | |
| ⏭ | C1·2 | `LJ onboard` | Onboarding · food  [FOOD] | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C1 Welcome (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·3 | `LJ onboard_send` | Onboarding · send  [PARCEL] | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C1 Welcome (carousel retired) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·4 | `LJ onboard_shared` | Onboarding · one app  [BOTH] | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C1 Welcome (carousel retired) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·5 | `LJ login` | Phone login | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C2/C3 Phone (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·6 | `LJ otp` | SMS OTP | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C4 Code (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·7 | `LJ role_select` | Choose your role | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — removed — no role choice screen (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·8 | `LJ register` | Profile registration | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C5 Name (no national ID) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| 👁 | C1·9 | `LJ perm_loc` | Permission · location | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| ⬜ | C1·10 | `LJ perm_notif` | Permission · notifications | | |
| ⏭ | C1·11 | `LJ onboard_flag_off` | Onboarding · food off  [PARCEL] | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C1 Welcome (carousel retired) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C1·12 | `LJ role_select_flag_off` | Choose your role · food off | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — removed — no role choice screen (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |

### C2 · Home & orders

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C2·1 | `RC home` | Home · service tiles  [BOTH] | **Calm Mint v2 (2026-10-01, D-55)** — rebuilt to `packages/design/handoff/calm-mint-v2-2026-10` H1–H6: address-first mint header, four service tiles, the Popular restaurants rail (Popular shops + Free delivery tag wait on backend), one floating live-order bar; the location and notify-me sheets as drawn. The gallery home-8c target is SUPERSEDED (structure-snapshot deferral + rendered-conformance pending). Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png`. Earlier: home 8c (2026-08-17) | guardrails: token-conformance · screen-inventory · reverse-drift freeze, green; structure snapshot + rendered conformance SUPERSEDED (D-55) |
| 👁 | C2·2 | `RC orders` | Orders · all services  [BOTH] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`); every live order now pins (not just the newest), food rows titled by restaurant | compact accent live-order card replaces the stepper LiveOrderCard per the mock |
| ⬜ | C2·3 | `RC orders_empty` | Orders · empty  [BOTH] | | |
| ⬜ | C2·4 | `LJ home_flag_off` | Home · Food tile soon  [BOTH] | | |
| ⬜ | C2·5 | `LJ order_restore` | Cold start · order running  [BOTH] | | |
| ⬜ | C2·6 | `LJ stale_cache` | Orders · saved copy  [BOTH] | | |

### C3 · Browse & compose

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C3·1 | `RC list` | Restaurant list  [FOOD] | **Browse v2 (2026-10-01, D-57)** — rebuilt to `packages/design/handoff/browse-v2` B1/B5–B7/B12/B14: mint header with the shared address control, one Sort pill + Free delivery, two full cards then compact rows, a 'Closed now' group. The gallery target is SUPERSEDED. Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C3·2 | `RC list_loading` | List loading  [FOOD] | **SUPERSEDED by D-57** — Browse v2 B8 (real header, skeleton body). Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C3·3 | `RC search` | Search  [FOOD] | **Browse v2 (2026-10-02, D-57 part 3)** — rebuilt to `packages/design/handoff/browse-v2` X1–X4: recent searches + Popular near you, Home results grouped by service (three each, 'See all n'), the Send a parcel row, Restaurants' PLACES + DISHES, no-results and offline states. The gallery target is SUPERSEDED. Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C3·4 | `RC menu` | Menu  [FOOD] | **Browse v2 (2026-10-01, D-57)** — rebuilt to `packages/design/handoff/browse-v2` S1–S7/S10–S13 + I1–I3: cover, logo, info strip, one scrolling menu under sticky scroll-spy tabs (Popular first), + inside the photo, the forest cart bar, the new-cart sheet. The Foundation-E regions were deleted; the gallery target is SUPERSEDED. Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⬜ | C3·5 | `RC item` | Item sheet  [FOOD] | | |
| ⏭ | C3·6 | `LJ home_empty` | Send composer · no address  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; app = v2 step 1 | |
| ⏭ | C3·7 | `LJ addr_search` | Address search  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; search is inline in the step-1 row | |
| ⏭ | C3·8 | `LJ addr_map_confirm` | Confirm pin on map  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; no confirm step | |
| ⏭ | C3·9 | `LJ home_pins` | Send · both set  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; app = v2 step 1 both pins | |
| ⏭ | C3·10 | `LJ home_expanded` | Send · sheet expanded  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; no expanded sheet | |
| ⏭ | C3·11 | `LJ disclaimer` | Broadcast disclaimer  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; disclaimer removed | |
| ⬜ | C3·12 | `LJ draft_restored` | Draft restored  [PARCEL] | | |
| ⏭ | C3·13 | `LJ addr_unavailable` | Address search down  [PARCEL] | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; drawn as the dropdown's limited row | |
| ⬜ | C3·14 | `LJ map_failed` | Map didn't load  [PARCEL] | | |
| ⬜ | C3·15 | `LJ loc_off` | Location off · composer  [PARCEL] | | |

### C4 · Commit & pay

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C4·1 | `RC cart` | Cart  [FOOD] | **Order flow v2 (2026-10-02, D-59)** — cart + checkout merged into ONE Review & place screen (`app/food/checkout.tsx`; `/food/cart` redirects), `packages/design/handoff/order-flow-v2` R1: white blocks on grey, inline − n + steppers, inline address card, pinned 'Place order · $X cash'. The Foundation-E footer region was deleted; the gallery target is SUPERSEDED. Part 5 (2026-10-02) adds shop & pharmacy carts (R2a/R2b), Schedule (R5a–c) and the Rx block behind its flag (R8a/R8b). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png`, `docs/parity/ORDER-FLOW-V2-SHOPS-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C4·2 | `RC cart_note` | Note for the kitchen  [FOOD] | **SUPERSEDED by D-59** — the line note is edited in place on Review (R1). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C4·3 | `RC checkout_cash` | Checkout · CASH  [FOOD] | **SUPERSEDED by D-59** — Review & place R1 (the summary/footer regions were deleted). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C4·4 | `RC checkout_wallet` | Checkout · WALLET  [FOOD] | **SUPERSEDED by D-59** — retired outright (cash only, BRIEF §14). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C4·5 | `RC placing` | Placing  [FOOD] | **SUPERSEDED by D-59** — Review R7a (veil + 'Placing your order…'). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C4·6 | `LJ auction_finding` | Auction · finding  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C4·7 | `LJ auction_live` | Auction · offers live  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C4·8 | `LJ auction_counter` | Counter-offer review  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |

### C5 · The kitchen confirms

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C5·1 | `RC await_accept` | Waiting on the kitchen  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — T2 / T3 on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⬜ | C5·2 | `RC confirm_call` | They call to confirm  [FOOD] | | |
| ⬜ | C5·3 | `RC pay_push` | Push · payment requested  [FOOD] | | |
| ⏭ | C5·4 | `RC pay_now` | Pay the restaurant  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — retired (cash only) on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⛔ | C5·5 | `RC pay_wait` | Prompt sent  [FOOD] | | |
| ⬜ | C5·6 | `RC pay_manual` | Paid another way  [FOOD] | | |
| ⏭ | C5·7 | `RC pay_confirmed` | Waiting to be confirmed  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — retired (cash only) on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |

### C6 · Track

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C6·1 | `RC track_prep` | Prep countdown  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — T4 on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⬜ | C6·2 | `RC track_secured` | Rider secured  [FOOD] | | |
| ⏭ | C6·3 | `RC track_way` | On the way  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — T9 on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C6·4 | `LJ track_code` | Tracking · code issued  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C6·5 | `LJ track_active` | Tracking · live  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |

### C7 · Hand-off & close

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C7·1 | `RC handoff` | Pay at the door  [FOOD] | | |
| ⬜ | C7·2 | `RC handoff_wait` | Waiting for rider confirm  [FOOD] | | |
| ⬜ | C7·3 | `RC handoff_code` | Both confirmed · code  [FOOD] | | |
| ⏭ | C7·4 | `RC delivered_rate` | Delivered · rate the food  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — D1 on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C7·5 | `LJ delivered_rate` | Delivered · rate the rider  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C7·6 | `LJ completed` | Completed  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C7·7 | `LJ rate_undo` | Rating sent · undo  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |

### C8 · Account & support

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C8·1 | `LJ profile` | Account | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 C6–C11 (customer Account) | aligns to the RIDER grammar (`RJM account`), not this older `Profile` mock — owner decision 2026-08-16. Four rows, role-separated: Notifications · Help & support · Settings · one bridge row. The mock's ID + verification detail lives on `/profile` (unmasked, D-23), which has had no in-app entry point since D-26 |
| 👁 | C8·2 | `LJ history` | Orders · all services  [BOTH] | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | mock key resolves to `RC.orders`; app target is standalone `/history` trips list — see doc |
| 👁 | C8·3 | `LJ notifications` | Notifications | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| ⬜ | C8·4 | `LJ notif_empty` | Notifications · empty | | |
| 👁 | C8·5 | `LJ help` | Help & support | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| ⏭ | C8·6 | `LJ settings` | Settings | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S4 (sectioned Settings, customer) | copy stays mock-verbatim; `settings_perms` / `settings_perms_ok` still assert green. Role-independent — the rider-only "Bike & documents" swap is gone, which moves this screen *closer* to the mock. The mock's "Edit profile" row is **not rendered** as of D-26 (owner, 2026-08-17), recorded as an `undrawn` entry in `tools/parity/expected/LJ.settings.json`; the identity card above it is inert |
| ⏭ | C8·7 | `LJ settings_perms` | Settings · real permissions | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S1/S3 (permissions read from the phone) | |
| ⏭ | C8·8 | `LJ settings_perms_ok` | Settings · all granted | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S1 | |
| ⬜ | C8·9 | `LJ privacy` | Privacy | | |
| ⬜ | C8·10 | `LJ delete_account` | Delete account | | |
| ⬜ | C8·11 | `LJ delete_final` | Delete · final confirm | | |
| ⬜ | C8·12 | `LJ phone_masked` | Order ended · numbers masked  [BOTH] | | |

### C9 · Trust & safety

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C9·1 | `LJ sos_idle` | SOS · live-trip control  [BOTH] | | |
| ⛔ | C9·2 | `LJ sos_confirm` | SOS · confirm  [BOTH] | | |
| ⬜ | C9·3 | `LJ sos_contacts` | SOS · contacts  [BOTH] | | |
| ⬜ | C9·4 | `LJ sos_error` | SOS · log failed (offline)  [BOTH] | | |
| ⬜ | C9·5 | `LJ report` | Report + block rider  [BOTH] | | |
| ⬜ | C9·6 | `LJ report_done` | Report sent  [BOTH] | | |
| ⬜ | C9·7 | `LJ trip_help` | Get help with this order  [BOTH] | | |
| ⬜ | C9·8 | `LJ trip_help_sent` | Issue logged  [BOTH] | | |

### C10 · Exceptions & edge

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | C10·1 | `RC list_empty` | Nothing open  [FOOD] | **SUPERSEDED by D-57** — Browse v2 B6 (no match) / B9 (nothing delivers here). Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C10·2 | `RC list_error` | Offline list  [FOOD] | **SUPERSEDED by D-57** — Browse v2 B10/B11. Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C10·3 | `RC menu_closed` | Closed restaurant  [FOOD] | **SUPERSEDED by D-57** — Browse v2 S8a/S8b (no + anywhere, Remind me). Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C10·4 | `RC closed_interrupt` | Closes while browsing  [FOOD] | **SUPERSEDED by D-57** — Browse v2 S9; on Review, Order flow v2 R6b (with 'Schedule for …', D-59 part 5). Evidence: `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png`, `docs/parity/ORDER-FLOW-V2-SHOPS-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-57) |
| ⏭ | C10·5 | `RC cart_oos` | Item sold out  [FOOD] | **SUPERSEDED by D-59** — Review R6a (sold out, struck through). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·6 | `RC cart_price` | Price changed  [FOOD] | **SUPERSEDED by D-59** — Review R6a (price went up). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·7 | `RC cart_empty` | Empty cart  [FOOD] | **SUPERSEDED by D-59** — Review R9a. Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·8 | `RC cart_min` | Under the minimum  [FOOD] | **SUPERSEDED by D-59** — Review R4 (small-order hint + fee row). Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·9 | `RC checkout_offline` | Offline mid-checkout  [FOOD] | **SUPERSEDED by D-59** — Review R7c. Evidence: `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⬜ | C10·10 | `RC pay_open` | Still unpaid · reminder  [FOOD] | | |
| ⛔ | C10·11 | `RC pay_failed` | Payment declined  [FOOD] | | |
| ⏭ | C10·12 | `RC item_removed` | One item unavailable  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — U2 (removals) on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·13 | `RC no_rider` | NO_RIDER  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — T11a / D3d on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⬜ | C10·14 | `RC track_paused` | Live paused  [FOOD] | | |
| ⏭ | C10·15 | `RC rejected` | Rejected · refund pending  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — D3b (cash copy) on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⏭ | C10·16 | `RC refunded` | Refunded  [FOOD] | **SUPERSEDED by D-59 (Order flow v2, 2026-10-02)** — retired (no prepaid orders) on the one order screen `app/order/[id].tsx` (`packages/design/handoff/order-flow-v2`). Not aligned to the gallery mock. Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` | structure snapshot + rendered conformance SUPERSEDED (D-59) |
| ⬜ | C10·17 | `RC cancel_sheet` | Cancel pre-pickup  [FOOD] | | |
| ⛔ | C10·18 | `RC rider_cancelled` | Rider cancelled · re-finding  [FOOD] | | |
| ⬜ | C10·19 | `RC handoff_dispute` | Rider didn't confirm  [FOOD] | | |
| ⬜ | C10·20 | `RC failed_noshow` | No-show · returned  [FOOD] | | |
| ⛔ | C10·21 | `RC resume` | App resumed mid-order  [FOOD] | | |
| ⏭ | C10·22 | `LJ no_riders` | No riders online  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·23 | `LJ select_race` | Rider just taken  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·24 | `LJ auction_expired` | Auction expired  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·25 | `LJ rider_cancelled` | Rider cancelled  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·26 | `LJ track_paused` | Live paused  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·27 | `LJ cancel` | Cancel · reason  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·28 | `LJ cancelled` | Cancelled  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·29 | `LJ undelivered` | Not delivered  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·30 | `LJ track_dark` | Rider went dark  [PARCEL] | superseded by D-53 (after-send handoff; `docs/parity/AFTER-SEND-2026-10-01.png`) — not aligned to; app = the one order screen | |
| ⏭ | C10·31 | `LJ otp_cooldown` | OTP · resend cooldown | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C4 Code (Resend in m:ss) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C10·32 | `LJ otp_resent` | OTP · code re-sent | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C4 Code (resend restarts the countdown) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⏭ | C10·33 | `LJ otp_locked` | OTP · expired / locked | **SUPERSEDED by D-55 (Calm Mint v2, 2026-10-01)** — C4 Code (That code has expired · Send a new code) (`packages/design/handoff/calm-mint-v2-2026-10`). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | structure snapshot + rendered conformance SUPERSEDED (D-55) |
| ⬜ | C10·34 | `LJ offline` | Offline banner | | |
| ⏭ | C10·35 | `LJ on_hold` | Account on hold | superseded by D-52 (send-compose-v2 handoff; `docs/parity/SEND-COMPOSE-V2-2026-10-01.png`) — not aligned to; app = handoff state 17 | |
| ⬜ | C10·36 | `LJ force_update` | Force update | | |
| ⛔ | C10·37 | `LJ no_gps` | Location off / no GPS | | |
| ⬜ | C10·38 | `LJ generic_error` | Generic error | | |
| ⬜ | C10·39 | `LJ conn_reconnecting` | Reconnecting banner | | |
| ⬜ | C10·40 | `LJ stale_cache_empty` | Offline · nothing saved | | |
| ⬜ | C10·41 | `LJ order_restore_error` | Restore failed  [BOTH] | | |
| ⬜ | C10·42 | `LJ draft_discard` | Discard draft · confirm  [PARCEL] | | |

## RIDER (All Screens Gallery)


### R1 · First run & sign in

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R1·1 | `RJ splash` | Splash | | |
| ⬜ | R1·2 | `RJ onboard` | Onboarding · rider | | |
| ⬜ | R1·3 | `RJ login` | Phone sign-in | | |
| ⬜ | R1·4 | `RJ otp` | SMS OTP | | |
| ⬜ | R1·5 | `RJ role_select` | Choose your role | | |
| ⬜ | R1·6 | `RJ perm_loc` | Permission · location | | |
| ⬜ | R1·7 | `RJ perm_notif` | Permission · notifications | | |

### R2 · Become a rider (KYC)

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R2·1 | `RJ kyc_intro` | Become a rider | superseded by D-55 (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10`) — R1 Why ride. Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | |
| ⏭ | R2·2 | `RJ kyc_form` | KYC form + consent | superseded by D-55 (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10`) — R1 → rider photo step (no bike reg). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | |
| ⬜ | R2·3 | `RJ photo_capture` | Rider photo · capture | | |
| ⬜ | R2·4 | `RJ photo_preview` | Rider photo · preview | | |
| ⬜ | R2·5 | `RJ photo_uploading` | Rider photo · uploading | | |
| ⏭ | R2·6 | `RJ kyc_pending` | Verification pending | superseded by D-55 (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10`) — R2 Rider setup while the automated check runs; manual review keeps the D-54 wall. Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | |
| ⏭ | R2·7 | `RJ kyc_unfinished` | Verification not finished | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G3 (Finish verifying) | |
| ⏭ | R2·8 | `RJ kyc_cant_start` | Couldn't open the ID check | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G7 (We couldn't open the ID check) | |
| ⏭ | R2·9 | `RJ kyc_verified` | Verified | superseded by D-55 (Calm Mint v2, `packages/design/handoff/calm-mint-v2-2026-10`) — R3 You're verified (new riders, once). Not aligned to the gallery mock. Evidence: `docs/parity/CALM-MINT-V2-HOME-2026-10-01.png` | |

> **Two rows here are newer than the export.** `kyc_unfinished` and `kyc_cant_start` (#841) were
> drawn in-repo rather than exported — see `docs/DESIGN-DEVIATIONS.md` D-35 and its upstream-sync
> warning. The E-series titles changed with them: D3 re-scoped that capture step from the ID document
> to a **rider portrait**, so it is "Rider photo", not "ID photo". Badges shift accordingly — what was
> R2·7 (`kyc_verified`) is now R2·9, matching the order `tools/parity/screens.generated.json` derives
> from the gallery.

### R3 · Online & the one board

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R3·1 | `RJM offline` | Offline  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J6 (always online; Reconnecting in the top card, the list dims — there is no offline screen) | |
| ⏭ | R3·2 | `RJM board` | Jobs · one list  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J1/J3 (map + busy zones + sheet of job cards) | white "Jobs near you" bar + bell (green BrandHeader removed), compact online pill, primary card actions; honest inert-socket "Reconnecting" + flag-off copy |
| ⏭ | R3·3 | `RJM board_empty` | Online · nothing in range  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J4 (empty sheet over the map, why-is-it-quiet, busy-zone pointer) | Card wrapper kept; omission recorded as `undrawn` on `tools/parity/expected/RJM.board_empty.json`; deferral baseline 76 → 77, reversible once an export redraws `board_empty` without the button |
| ⬜ | R3·4 | `RJM notifications` | One inbox  [BOTH] | | |
| ⏭ | R3·5 | `RJM board_food_off` | Jobs · food dispatch off  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J3 (food line hidden with dispatch off) | |
| ⏭ | R3·6 | `RJM board_empty_food_off` | Food off · nothing in range  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J5 (food sentence hidden with dispatch off) | |

### R4 · Taking a job

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R4·1 | `RJM offer_parcel` | Parcel · name your fare  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 O1–O4 (Make an offer, its own screen) | |
| ⏭ | R4·2 | `RJ offer_sent` | Offer sent · waiting  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J9 (YOUR OFFERS card: waiting, Withdraw + Undo) | |
| ⏭ | R4·3 | `RJ picked` | Customer picked you  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J11 (the locked "picked you" sheet → Open job) | |
| ⏭ | R4·4 | `RJM offer_food` | Food · accept the job  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 F1 (food offer: countdown sheet over the map) | one screen serves both food-offer keys; the harness fixture is a live cash-dispatch offer, so the app matches `RR offer_cash` — the `RJM offer_food` no-countdown surface is the flag-off branch (honest deviation) |
| ⏭ | R4·5 | `RR offer_cash` | Food · CASH collect  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 F1 | added the cta-fill NEW ORDER timer banner, CASH PayTag + YOU EARN row, marked COLLECT FROM/DELIVER TO legs card, and the return-leg note; COLLECT AT THE DOOR + accept/pass labels already matched |
| ⏭ | R4·6 | `RR offer_upfront` | Food · kitchen wants upfront  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 F2 (Pay the kitchen / Collect at the door tiles) | |
| ⏭ | R4·7 | `RR offer_wallet` | Food · already paid  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 F1 (prepaid: no money tiles) | |

### R5 · The active job

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R5·1 | `RJM active_parcel` | Active · parcel  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A1 (JobShell: map + stage sheet + one primary) | |
| ⏭ | R5·2 | `RJ job_assigned` | Job · assigned  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A1 (accepted jobs head to pickup on their own) | "Your job" + assigned pill, Agreed fare, revealed sender/recipient contacts (fixture now seeds the phones), items, stepper, "Confirm the job" verbatim; contacts render as JobDetailsCard "Call …" links vs the mock's boxed CallRows (shared-card shape, deviation) |
| ⏭ | R5·3 | `RJ job_pickup` | En route to pickup  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A1 | |
| ⏭ | R5·4 | `RJ job_verify` | Verify items at pickup  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A2 (Check before you leave + pickup photo) | |
| ⏭ | R5·5 | `RJ job_collect` | Parcel collected  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A6 | |
| ⏭ | R5·6 | `RJ job_dropoff` | En route to drop-off  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A7 | |
| ⏭ | R5·7 | `RJM active_food` | Active · food  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B1–B3 | fixture re-driven to the `picked_up` CARRY state: CashHeldStrip YOURS $2.50 / OWED $13.00 (goods debt open), food stepper mid-flow, plus the added "Collect $X at the door" accent card; CTA is "Navigate to the customer" (code entry lives at the door via the map-first leg, RR.nav_cust), header "Your job" (deviations) |
| ⏭ | R5·8 | `RR nav_rest` | To the restaurant  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B1 (Heading to the kitchen) | now its own fixture `rider_food_nav` at `en_route_pickup` → the map-dominant `FoodNavLeg` (full map + restaurant card + CASH PayTag + Open in Maps + arrival CTA); sheet sub-copy + missing ETA are FoodNavLeg copy deviations |
| ⏭ | R5·9 | `RR pay_merchant` | Pay the merchant  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B2 (Pay the kitchen now) | |
| ⏭ | R5·10 | `RR pickup_confirm` | Collect · CASH job  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B2 | |
| ⏭ | R5·11 | `RR pickup_paid` | Collect · already PAID  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B2 | |
| ⏭ | R5·12 | `RR nav_cust` | To the customer  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B3 (Heading to drop-off, CashSplit) | |
| ⏭ | R5·13 | `RR doorstep` | Collect · confirm cash  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B4 (the cash handshake, then the code) | |
| ⏭ | R5·14 | `RJM handoff` | Delivery code  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A8 (code page, 3 + 3 boxes) | |
| ⏭ | R5·15 | `RJ job_handoff` | Hand-off · parcel  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A8 | |
| ⏭ | R5·16 | `RJ job_delivered` | Delivered  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A13 (Job done) | |
| ⏭ | R5·17 | `RR delivered` | Delivered · food  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B6 | |
| ⏭ | R5·18 | `RR return_cash` | Return the kitchen's cash  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B5 (Return the cash, blocking) | |
| ⏭ | R5·19 | `RJM pickup_photo` | Proof of pickup · capture  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A3 (the phone's camera) | |
| ⏭ | R5·20 | `RJM pickup_photo_preview` | Proof of pickup · preview  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A4 / A5 | |

### R6 · Money

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R6·1 | `RJM money` | Money tab  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 M1–M12 (earnings first, balance, cash held, merged history) | accent-bordered balance card, cash-held strip, bare ledger rows; `yours` unmodelled at tab level (deviation) |
| ⏭ | R6·2 | `RJM gate_topup` | Gate · top up to keep riding  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G14 (Top up to keep riding) | |
| ⏭ | R6·3 | `RJ topup_amount` | Top up · amount  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 T1–T3 (Provider → Amount → Phone) | amount field + hint, 5/10/20 preset chips, phone field, "Pay with" rails, request CTA (via `TopUpSimulator`, test-build only); SIMULATED strip + neutral rail marks are honest test-build markers (deviation) |
| ⏭ | R6·4 | `RJ topup_wait` | Payment prompt · wait  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 T4 (Approve) | |
| ⏭ | R6·5 | `RJ topup_success` | Top up · success  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 T5 | |
| ⏭ | R6·6 | `RJ wallet_low` | Balance low  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 M5–M7 (balance card states) | |

### R7 · Account & support

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R7·1 | `RJM account` | Account | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 C1–C5 (identity card, Customer | Rider toggle, standing, four rows) | identity card (`/auth/me`) + tile rows; the mock's five keep their drawn order, then `Settings` (D-22) and `Switch to customer` (D-16). Since D-26 the identity card is INERT (the mock draws a plain Card); sign-out and the rest are reached through the `Settings` row |
| ⏭ | R7·2 | `RJ bike_docs` | Bike & documents | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S5 (Bike & documents, from Settings → RIDER) | in-body Heading/Sub (moved out of the AppBar), 3 doc rows + status pills, surface footer; ID shown fully masked + all-rows-pilled (deviations) |
| ⏭ | R7·3 | `RJ history` | Job history  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 C12 (Job history, rider jobs only) | |
| ⏭ | R7·4 | `RJ settings` | Settings | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S1–S3 (sectioned Settings) | |
| ⏭ | R7·5 | `RJ help` | Help & support | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 S6 (Help & support, rider side) | |
| ⏭ | R7·6 | `RJM strikes` | Reliability · strikes | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 C1–C3 (the Standing card on the rider Account) | |

### R8 · Trust & safety

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R8·1 | `RJ sos_idle` | SOS · live-job control  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X1 (the 999 row in the Problem sheet) | |
| ⏭ | R8·2 | `RJ sos_confirm` | SOS · confirm  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X13 (Call 999?) | |
| ⏭ | R8·3 | `RJ sos_contacts` | SOS · contacts  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X13 | |
| ⏭ | R8·4 | `RJ report` | Report + block customer  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X1 → Report the customer | |
| ⏭ | R8·5 | `RJ report_done` | Report sent  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X1 → Report the customer | |
| ⏭ | R8·6 | `RJ job_help` | Get help with this job  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X1 (Problem sheet, also the Help pill) | |
| ⏭ | R8·7 | `RJ job_help_sent` | Issue logged  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X14 (toast) | |

### R9 · Exceptions & edge

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⏭ | R9·1 | `RJ missed_order` | Job taken first  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J13 (toast: taken) | |
| ⏭ | R9·2 | `RJ not_chosen` | Not chosen  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J12 (toast) | |
| ⏭ | R9·3 | `RJ bid_expired` | Auction expired · no pick  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J14 (toast) | |
| ⏭ | R9·4 | `RJ handoff_wrong` | Wrong code · lockout  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A9–A11 | |
| ⏭ | R9·5 | `RJ undelivered` | Not delivered  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X4 / X5 | |
| ⏭ | R9·6 | `RJ job_bail` | Rider cancels (bail)  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X6 | |
| ⏭ | R9·7 | `RJ job_offline` | Connection lost mid-job  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X10 / X11 | |
| ⏭ | R9·8 | `RJ job_cancelled` | Customer cancelled  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X9 | |
| ⏭ | R9·9 | `RR offer_expired` | Offer expired  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 F4 | |
| ⏭ | R9·10 | `RR cancel_reason` | Drop the job · before pickup  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X8 (Drop this food job?) | |
| ⏭ | R9·11 | `RR cancel_blocked` | Can't drop after collecting  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X1 (after pickup the sheet offers no drop) | |
| ⏭ | R9·12 | `RR cash_dispute` | Customer confirmed, you didn't  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 B4 (handshake card) | |
| ⏭ | R9·13 | `RR code_wrong` | Wrong code  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A9 (food) | |
| ⏭ | R9·14 | `RR unreachable` | Customer unreachable  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X3 (food: the no-show card in a sheet) | |
| ⏭ | R9·15 | `RR return_rest` | Return to restaurant  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X5 (food, with the return leg) | |
| ⏭ | R9·16 | `RR handback` | Hand back confirm  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X9 (food) | |
| ⏭ | R9·17 | `RR offline_resume` | Resumed mid-delivery  [FOOD] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X12 (Job restored) | |
| ⏭ | R9·18 | `RJ kyc_failed` | Verification failed | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G4 (Tries left) | |
| ⏭ | R9·19 | `RJ kyc_expired` | ID expired (later) | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G6 (Re-verify my ID) | |
| ⬜ | R9·20 | `RJ photo_failed` | Rider photo · upload failed | | |
| ⏭ | R9·21 | `RJ gate_out_of_area` | Gate · out of area | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G9 | |
| ⏭ | R9·22 | `RJ gate_cooldown` | Gate · cooldown | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G10 | |
| ⏭ | R9·23 | `RJ gate_banned` | Gate · account closed | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G13 | |
| ⏭ | R9·24 | `RJ gate_kyc_locked` | Gate · verification locked | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G5 | |
| ⏭ | R9·25 | `RJ topup_declined` | Top up · declined  [BOTH] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 T6 | |
| ⏭ | R9·26 | `RJ offline` | Offline banner | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J6 (Reconnecting in the top card) | |
| ⏭ | R9·27 | `RJ on_hold` | Account on hold | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G11 | |
| ⬜ | R9·28 | `RJ force_update` | Force update | | |
| ⏭ | R9·29 | `RJ no_gps` | Location off / no GPS | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 G8 (Can't find your location) | |
| ⏭ | R9·30 | `RJ generic_error` | Generic error | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 J7 (Couldn't load, retries itself) | |
| ⏭ | R9·31 | `RJM pickup_photo_failed` | Proof photo · upload failed  [PARCEL] | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 A6 (Photo saved; the upload is queued) | |
| ⏭ | R9·32 | `RJM strikes_final` | One strike from a pause | superseded by D-54 (rider-v2 handoff) — not aligned to; app = Rider v2 X7 (Cancel and pause) | |

## MERCHANT (All Screens Gallery ← RGD.MERCHANT; trailing (RV …) = Restaurants Vertical badge)


### M1 · Get on shift

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | M1·1 | `RM login` | Phone + OTP login  (RV M0·1) | merchant login align (`docs/parity/PHASE6-merchant.md`, `tools/parity/out/phase6_merchant.png`); D-43 (APPROVED, merchant web upgrade L1): title "Sign in" and the channel-aware code line — structure unchanged | |
| ⬜ | M1·2 | `RM setup` | First login · setup  (RV M0·2) | D-43 (APPROVED, merchant web upgrade L1): the not-live line names the call within a day; a shop gets its own undrawn checklist. D-44 (APPROVED, merchant web upgrade L2): the shop checklist sits in the shop's own shell, and its steps go live. D-45 (L3): + an optional "Add your riders". D-46 (APPROVED, L4): a shop's gains an optional "Add your team"; Staff see one line, not the checklist | |
| ⬜ | M1·3 | `RM reboot` | Tablet rebooted mid-shift  (RV M0·b1) | | |

### M2 · The queue

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M2·1 | `RM queue_empty` | Open · no orders  (RV M1·1) | gated route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`). D-44 (APPROVED, merchant web upgrade L2): the Book a rider strip under the heading. L5 (D-47): the bar's business name and Open for orders pill, and Help in the nav, as drawn | |
| ⬜ | M2·2 | `RM queue_loading` | Loading  (RV M1·2) | gated route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`) | |
| ⬜ | M2·3 | `RM queue_new` | NEW ORDER · alarm  (RV M1·3) | gated route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`) | |
| ⬜ | M2·4 | `RM queue_board` | Kitchen board · 3 live  (RV M1·4) | gated route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`). D-44 (APPROVED, merchant web upgrade L2): the Book a rider strip ("N bookings live · View") under the heading | |
| ⬜ | M2·5 | `RM two_orders` | Two orders at once  (RV M1·b1) | | |
| ⬜ | M2·6 | `RM offline` | Connection lost  (RV M1·b2) | | |
| ⬜ | M2·7 | `RM offline_order` | Order arrived offline  (RV M1·b3) | | |

### M3 · Accept & cook

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M3·1 | `RM order_accept` | Accept + prep time  (RV M2·1) | | |
| ⬜ | M3·2 | `RM call_confirm` | Call, then request payment  (RV M2·6) | | |
| ⬜ | M3·3 | `RM awaiting_payment` | Awaiting payment · no clock  (RV M2·7) | | |
| ⬜ | M3·4 | `RM reject_sheet` | Reject · reason  (RV M2·2) | | |
| ⬜ | M3·5 | `RM waiting_rider` | Accepted · do not cook yet  (RV M2·3) | | |
| ⬜ | M3·6 | `RM cook_now` | Rider secured · cook now  (RV M2·4) | | |
| ⬜ | M3·7 | `RM mark_ready` | Mark ready  (RV M2·5) | | |
| ⬜ | M3·8 | `RM no_rider_merchant` | NO_RIDER · never cooked  (RV M2·b1) | | |
| ⬜ | M3·9 | `RM rider_cancelled` | Rider cancelled · re-dispatch  (RV M2·b2) | | |
| ⬜ | M3·10 | `RM item_out` | Don't have an item  (RV M2·8) | | |
| ⬜ | M3·11 | `RM item_out_wait` | New total · customer confirming  (RV M2·9) | | |

### M4 · Pickup confirm

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M4·1 | `RM pickup_cash` | Upfront · confirm cash  (RV M3·1) | | |
| ⬜ | M4·2 | `RM pickup_collect` | Collect-and-return · release  (RV M3·1b) | | |
| ⬜ | M4·3 | `RM pickup_wallet` | WALLET · confirm before cooking  (RV M3·2) | | |
| ⬜ | M4·4 | `RM wallet_mismatch` | Short payment blocked  (RV M3·b1) | | |
| ⬜ | M4·5 | `RM pickup_done` | Handed over  (RV M3·3) | | |
| ⬜ | M4·6 | `RM cash_return` | Count the returned cash  (RV M3·4) | | |
| ⬜ | M4·7 | `RM rider_noshow` | Rider no-show  (RV M3·b2) | | |
| ⬜ | M4·8 | `RM refund_exec` | Refund after wallet paid  (RV M3·b3) | | |
| ⬜ | M4·9 | `RM pickup_reveal` | Pickup code · hidden  (RV M3·5) | | |
| ⬜ | M4·10 | `RM pickup_revealed` | Pickup code · revealed  (RV M3·6) | | |

### M5 · Run the shop

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M5·1 | `RM catalog` | Menu · grouped by category  (RV M4·1) | gated `/menu` route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`). D-44 (APPROVED, merchant web upgrade L2): a shop sees it as Items, in its own words; a restaurant's is unchanged. D-46 (APPROVED, L4): Staff see the stock toggles only | |
| ⬜ | M5·2 | `RM category_manage` | Categories · reorder & hide  (RV M4·2) | D-46 (APPROVED, merchant web upgrade L4): Staff see one line | |
| ⬜ | M5·3 | `RM category_edit` | New category  (RV M4·3) | | |
| ⬜ | M5·4 | `RM category_rename` | Edit / delete category  (RV M4·4) | | |
| ⬜ | M5·5 | `RM catalog_empty` | No categories yet  (RV M4·b1) | D-44 (APPROVED, merchant web upgrade L2): a shop gets its kind's starting categories. D-46 (APPROVED, L4): Staff get no starters | |
| ⬜ | M5·6 | `RM item_edit` | Edit dish · photo required  (RV M4·5) | D-44 (APPROVED, merchant web upgrade L2): "Edit item" for a shop | |
| ⬜ | M5·7 | `RM dish_photo` | Dish photo · crop  (RV M4·6) | | |
| ⬜ | M5·8 | `RM dish_draft` | Draft · needs a photo  (RV M4·b2) | | |
| ⬜ | M5·9 | `RM oos_sheet` | Out of stock today  (RV M4·7) | merchant web upgrade L5 (D-47): the three drawn durations and the drawn line, now built (was one button) | |
| ⬜ | M5·10 | `RM hours` | Operating hours  (RV M4·8) | D-46 (APPROVED, merchant web upgrade L4): Staff read the week and keep busy mode | |
| ⬜ | M5·11 | `RM statement` | Weekly statement  (RV M4·9) | D-46 (APPROVED, merchant web upgrade L4): Staff see one line | |
| ⬜ | M5·12 | `RM eod` | End of day  (RV M4·10) | | |

### M6 · Shop front

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M6·1 | `RM shop` | Shop profile  (RV M5·1) | gated `/shop` route — needs seeded `PARITY_MERCHANT_URL` to shoot (see `docs/parity/PHASE6-merchant.md`). D-44 (APPROVED, merchant web upgrade L2): a shop's reads "What you sell" and has no cash-rule card. D-45 (APPROVED, merchant web upgrade L3): a restaurant's gains a "Your riders" card. D-46 (APPROVED, L4): a "Your team" card for the owner, both types; Staff see one line | |
| ⬜ | M6·2 | `RM cash_rule` | Your cash rule  (RV M5·4) | | |
| ⬜ | M6·3 | `RM shop_crop` | Position the banner  (RV M5·2) | | |
| ⬜ | M6·4 | `RM shop_upload` | Uploading · compressing  (RV M5·3) | | |
| ⬜ | M6·5 | `RM shop_upload_failed` | Upload paused · offline  (RV M5·b1) | | |

## Restaurants Vertical gallery badges (explorations/restaurants/Restaurants Vertical.html)


## ADMIN (ui_kits/admin — pages, gallery badges A1-A7)

**Admin shots are CHROME-ONLY.** With no `API_BASE_URL` the console renders its offline "API not connected"
shell — the real chrome (sidebar, header, `Conn`, `OfflineBanner`, filter chips, KPI-card frames, empty-state
cards) but **no populated tables / KPI values / nav badges**. The 👁 below means the offline **chrome** is
aligned and shot; the **populated data-state of every row is still ⬜** and needs `PARITY_ADMIN_URL` on a
seeded instance (out of offline-harness scope). Mapping + honest divergences (3 extra nav items, substrip
metric set): `docs/parity/PHASE6-admin.md`.

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | A1 | `index.html Overview` | dashboard — **chrome only**; populated KPIs/needs-attention/recent-orders ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A2 | `orders.html Orders` | — monitor & detail — **chrome only**; populated orders table ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A3 | `riders.html Riders` | — directory & profile — **chrome only**; populated directory table ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A4 | `customers.html Customers` | — directory & profile — **chrome only**; populated customers table ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A5 | `cash.html Cash` | & settlements (business model retired — see EXPORT-README) — **chrome only**; app renders the current prepaid-per-ride model, populated by-rider table ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A6 | `kyc.html KYC` | — queue & review — **chrome only**; populated KYC queue ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |
| 👁 | A7 | `issues.html Issues` | — disputes — **chrome only**; populated issues table ⬜ (seeded API) | admin chrome align (`docs/parity/PHASE6-admin.md`, `tools/parity/out/phase6_admin.png`) | |

## New customer flows sheet (ui_kits/mobile/new-flows.html)


## Trust, safety & recovery sheet (ui_kits/mobile/safety-flows.html; c=customer, r=rider)

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | B1·1 | `c sos_idle` | Idle — SOS pinned  (ref R-16 · P1) | | |
| ⬜ | B1·2 | `c sos_confirm` | Confirm step  (ref Q3 · resolved) | | |
| ⬜ | B1·3 | `c sos_contacts` | Emergency contacts  (ref Q3 · resolved) | | |
| ⬜ | B1·4 | `c sos_error` | Log failed (offline)  (ref Offline-first) | | |
| ⬜ | B2·1 | `c report` | Report + block rider  (ref F-15 / R-11 · P1) | | |
| ⬜ | B2·2 | `c report_done` | Report sent  (ref F-15 / R-11) | | |
| ⬜ | B3·1 | `c trip_help` | Get help with this trip  (ref X-1 · P1) | | |
| ⬜ | B3·2 | `c trip_help_sent` | Issue logged  (ref X-1) | | |
| ⬜ | C·1 | `c otp_cooldown` | Resend cooldown  (ref A0-1 / R0-1 · Wave 4) | | |
| ⬜ | C·2 | `c otp_resent` | Code re-sent  (ref A0-1 / R0-1) | | |
| ⬜ | C·3 | `c otp_locked` | Expired / locked  (ref A0-1 / R0-1) | | |
| ⬜ | D·1 | `c track_dark` | Rider went dark  (ref R-04 / R-05 · C5) | | |
| ⬜ | A1 | `r gate_out_of_area` | Outside service area  (ref A1-1 / R2-2 · Wave 3) | | |
| ⬜ | A2 | `r gate_cooldown` | Short cooldown  (ref gates.ts · cooldown) | | |
| ⬜ | A3 | `r gate_banned` | Account closed  (ref gates.ts · banned) | | |
| ⬜ | A4 | `r gate_kyc_locked` | Verification locked  (ref R-04 · isKycLocked) | | |
| ⬜ | E·1 | `r photo_capture` | Capture  (ref P3 · KYC photo) | | |
| ⬜ | E·2 | `r photo_preview` | Preview & self-check  (ref P3 · KYC photo) | | |
| ⬜ | E·3 | `r photo_uploading` | Uploading (non-blocking)  (ref P3 · KYC photo) | | |
| ⬜ | E·4 | `r photo_failed` | Upload failed  (ref P3 · recoverable) | | |

## Support kit (ui_kits/support/screens.js)


## Interactive mobile kit flow states (ui_kits/mobile/app.js state machine)


## Shipped-states sheet (ui_kits/mobile/shipped-states.html; c=customer LJ, j=rider RJM, m=merchant RM)


## RETIRED ids (kept in registries for record; never align to these — see EXPORT-README)


---

Generated from `packages/design/EXPORT-MANIFEST.txt` (export 2026-08-10 rev 2). If a future export
changes the inventory, regenerate the skeleton but carry the status column across by hand — never
reset it.

