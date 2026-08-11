# Mock-adoption program — structure-by-construction across all screens

**Owner instruction (2026-08-11):** adopt the design mocks' structure across **all 275 current screens**,
enforced by **automated guardrails** (no per-screen human visual comparison — the owner codes from a
phone and cannot eyeball side-by-sides). This doc is the durable spec + decision log so the work
survives across sessions and the two active sessions stay coordinated.

## Goal
Every adoptable screen's presentational structure is **provably the mock's**, verified in CI by a
**text diff readable on a phone** — not an image. No visual comparison anywhere in the loop.

## Architecture (in `main`)
- **Mobile** — `tools/parity/codegen/`: a Babel transpiler turns a mock's JSX + inline CSS into a
  structurally-faithful RN presentational component (`<name>.view.tsx`). 96% of style decls map
  mechanically; the container wires the data seam (the only hand work). `react-strict-dom` was
  evaluated and **rejected** (mocks are dynamic-inline `<div style>`, not RSD's static-StyleX model).
- **Web (admin/merchant)** — direct-DOM adoption (same React/DOM/CSS substrate); work is data-wiring.
- **Four CI-blocking guardrails** enforce conformance:
  1. **token-conformance** (`apps/api/src/design-tokens.drift.spec.ts`) — every token category × all
     three faces value-identical to `packages/design/tokens/*.css`.
  2. **screen-inventory** (`apps/api/src/parity/screen-inventory.spec.ts` + `tools/parity/parity-status.mjs`)
     — every current mock is wired or allowlisted (`PENDING`/`BACKEND_GATED`); no phantom/retired targets.
  3. **reverse-drift freeze** (`scripts/check-design-freeze.mjs`, CI job `design-freeze`) — fails any PR
     editing `packages/design/**` without a `docs/DESIGN-DEVIATIONS.md` entry.
  4. **structural-snapshot** (`apps/api/src/parity/structure-snapshot.spec.ts` + `tools/parity/codegen/`)
     — reduces mock-tree and app-view-tree to a normalized component-tree S-expression and fails with a
     phone-readable tree-path diff. Supports **multi-state** screens (per-state `state → mock-key → view`)
     and treats `FlatList ≡ virtualized map`. `node tools/parity/codegen/cli.mjs check` reports per-state
     congruence + deferrals.

Adoption is registered in `tools/parity/codegen/adopted.mjs`; a screen is **✅ adopted** when its
generated view(s) are congruent and the guardrail suite is green — never "eyeballed".

## The three tracks
- **Track 1 — UI adoption** *(this session: `apps/mobile` + `tools/parity`)*. Foundation → broad
  codegen adoption of the ~220 customer/rider screens; web direct-DOM for admin/merchant.
- **Track 2 — Backend for the 51 hard-blocked screens** *(the OTHER session: `apps/api`)*. Builds the
  features behind mocks that can't be adopted by restyling. Tracked as issues **#670–#674**. When a
  feature lands, its ⛔ screens become adoptable by Track 1.
- **Track 3 — Design/soft-blockers**. Superset screens (app exceeds the base mock) split into:
  **(A)** the superset already has its own mock (e.g. settings' Play rows → `C8·9–12`) → composite-adopt;
  **(B)** genuinely-undesigned visible state → draft a mock upstream (sanctioned shipped-state addition
  + ledger, like the `SH·` wave) or descope; **(C)** invisible/technical (e.g. `FlatList` virtualization)
  → guardrail equivalence, no design.

## Standing policies (owner decisions)
- **Verification is by guardrails, not human visual comparison** (2026-08-11).
- **Alignment/parity PRs auto-merge on green** (2026-08-11) — never on red; fix forward.
- **Live-vs-static: the mock's STRUCTURE wins; derive the live behaviour inside it** (2026-08-11) — see
  CLAUDE.md "Pixel parity". Restructure the app to the mock's tree and wire functionality into it;
  don't keep a divergent app structure because it's "more functional".
- **Hard blockers: build the backend** (not descope) — the other session owns this.
- Mocks are the source of truth; **never edit `packages/design/` to match the app**; deviations only via
  `docs/DESIGN-DEVIATIONS.md`; never align to retired screens.

## Status (2026-08-11)
- Foundations complete in `main`: guardrail suite (#667), codegen + structural-snapshot (#668, #675),
  DS primitives + empty-state Card (#676), multi-state model + `FlatList≡map` (#678); Foundation-C
  `Screen.banner` slot + Foundation-D `EtaLine`/`ShopLogo`/`FoodThumb`/`Screen.footer` primitives.
- **Foundation-E — region/fragment guarding for INTERACTIVE containers.** The whole-screen model can't
  host an interactive container's behaviour; such screens now adopt **piece-by-piece**: an `adopted.mjs`
  entry carries `regions[]`, each a generated guarded FRAGMENT of a named mock sub-tree, and a static
  **composition check** asserts the container mounts the fragments in the mock's region order/nesting.
  See `tools/parity/codegen/README.md` → *Region/fragment adoption*.
- **Adopted: 6 views across 5 screens** — `LJ.help`, `RC.cart_empty`, `RC.list_loading`, `RC.list_error`,
  `RC.placing` (whole-screen / state), **plus `RC.menu` — the FIRST region-adopted interactive screen
  (3 regions: cover · rows · cart bar) + a passing composition check** (all congruent).
- Registry: 275 screens (customer 122 · rider 98 · merchant 48 · admin 7); **51 `BACKEND_GATED`**
  (issues #670–#674), the rest `PENDING` adoption.
- Known follow-ups: give the DS `Screen` a `banner` slot (unblocks *error* states app-wide); the
  structural guardrail treats primitive JSX-attribute *slots* (e.g. `Screen banner=`) as invisible —
  extend to verify slotted content.

## Foundation-F — interactive map/sheet region codegen (deferred, high-leverage)
The parcel **send-composer** (the flagship `Home` mock) is **not region-decomposable** under the current
Foundation-E codegen and is registered **defer-only** (`LJ.home_empty`/`home_pins`/`home_expanded`/
`addr_search`/`addr_map_confirm`, each with a reason in `adopted.mjs`). Root cause is a shared gap, not a
one-off: the mock's regions root in raw `<div>`s and **kit primitives the transpiler can't resolve**
(`FauxMap`, `MapSheet`, mock-local `AddressFields`/`QtyStepper`), and there is **no `<Screen footer>`** to
anchor the submit region the way `RC.menu` did. The app already realizes this shell **live and
mock-wins-correctly** (`ComposeMap` tap-to-pin under a peek/expanded `BottomSheet`, `AddressSearch` +
`AddressConfirmSheet`, submit validation/idempotency/disclaimer gate) — so nothing is dropped; it is the
*guardrail* that can't yet prove congruence.

The **same `FauxMap`/`MapSheet`/`BottomSheet` family underlies parcel tracking and the rider board/jobs
screens**, so this is one high-leverage build that unblocks a whole cluster family. A **second domain**
surfaced the same class of gap: the **parcel auction / order-detail** screens (`LJ.auction_live`/`finding`/
`expired`/`counter`, container `order/[id].tsx`) are authored as **kit-composite member tags** (`K.OfferCard`,
`K.SortChips` — `JSXMemberExpression` tags the transpiler can't rename/import and locators can't anchor),
**mock-local helpers** (`OrderHead`), and a **variant-switch function** (`Auction(variant)`) whose states are
early-returns the normalizer can't isolate by component name — plus one composite `<Screen>` interleaving all
order states (no per-state Screen to swap a whole-screen view into). Registered defer-only alongside the
composer.

A **third wall** blocks the ENTIRE rider surface: every screen in `rider-one-app.jsx` (board, offer_*, active_*,
handoff, notifications, money, account, gate_topup) returns `S(<div>…</div>, { tab })` — a **mock-local
render-helper** wrapping the body in the DS `AppScreen`/SHELL. `normalize.mjs` cannot see through a non-`.map`
CallExpression, so `treeOfNamedComponent`/`treeOfMockFragment`/`mockCompositionTree` all throw "no JSX render"
for every rider mock — no whole-screen view AND no region fragment can be extracted at all. This is a
prerequisite for adopting ANY rider screen (even the near-leaf `account` tab).

Foundation-F is therefore the consolidated codegen build that unblocks all three domains:
(a) `DS_RENAME`/uiPrims remaps `FauxMap→ComposeMap`, `MapSheet`/`HarareMap`→`BottomSheet`; (b) a **sheet-footer
scaffold** + a **generalized non-`Screen` slot locator** so a submit region anchors under a plain-`<div>` root;
(c) **mock-local + member-tag (`K.*`) helper inlining/resolution** (`AddressFields`/`QtyStepper`/`OrderHead`/
`OfferCard`/`SortChips`); (d) **variant-switch state isolation** so `Auction(variant)` early-returns map to
per-state views without editing the mock; (e) a **render-helper / SHELL unwrap** — teach the normalizer to take
the first JSX argument of a wrapper call (`S(<jsx>, opts)`) as the render root, plus `SHELL`/`AppScreen`→`SCREEN`
canonicalisation (unblocks the whole `rider-one-app.jsx` surface). (f) the transpiler-idiom cleanup
(template-literal border / conditional shadow-spread / mixed text+element siblings) for `role_select`/`register`/
`delivered_rate`.

**Adopted vs deferred, end of harvest phase (2026-08-11):** ~12 views adopted & merged (customer auth/account/
system-leaf + food menu/closed-interrupt/cart/checkout regions) — everything the current codegen reaches. **69
states deferred**, every one attributable to a wall above (W-KIT primitives, map/sheet, variant-switch,
render-helper wrapper, live-vs-static superset, or backend #670–#674). The deferrals are recorded per-state in
`adopted.mjs`; Foundation-F converts the tooling-blocked majority to adopted in one sweep. Strategy: **harvest-first** — keep adopting the many clusters that
don't need it (food browse/cart/checkout, rider onboarding/money/account, merchant, admin, leaf/simple-region
screens), then do Foundation-F once and sweep the map/sheet + composite-order family (send-composer, auction,
tracking, rider board/jobs) in one wave — alongside the transpiler-idiom cleanup (template-literal border /
conditional shadow-spread / mixed text+element siblings) that the auth/register/role deferrals need.

## Honest velocity note
The hard architecture is done; adoption itself is **incremental** — each screen tends to surface one
small thing (a missing primitive capability, a backend feature, or a live-vs-static restructure). It is
many small auto-merged PRs, not a single finish line. Backend-gated screens complete only when the
other session lands #670–#674.
