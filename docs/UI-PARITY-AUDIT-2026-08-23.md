# UI Parity Audit — 2026-08-23

Weekly, report-only comparison of the shipped app against its design mocks
(`docs/ROUTINES.md` §"UI Parity Audit (report-only)"). **First run of this routine** — no prior
`UIP-` ledger rows to dedup against, and no prior dated report to diff for regressions. This audit
makes **zero** app, design, or `docs/PIXEL-PARITY-TRACKER.md`/`docs/DESIGN-DEVIATIONS.md` changes;
every mismatch below is logged in `docs/KNOWN_BUGS.md` (prefix `UIP-`) for a future alignment PR or
the user to act on.

## Phase 0 — context read

Read `docs/KNOWN_BUGS.md` in full (no prior `UIP-` rows), `docs/PIXEL-PARITY-TRACKER.md`,
`docs/DESIGN-DEVIATIONS.md` (D-01…D-38 — every APPROVED entry encountered below is treated as
sanctioned, not re-flagged), and `tools/parity/rendered-conformance.pending.json` (the existing
per-key rendered-drift inventory this run extends rather than re-derives). `pnpm install` succeeded;
`main` was not separately re-tested for a baseline since this run changes no product code.

## Phase 1 — machine-checkable sweep (every wired screen)

All three checks green, no failures:

| Check | Result |
|---|---|
| `node tools/parity/codegen/cli.mjs check` | **43/43** adopted views (state-views + region fragments + composition checks) structurally congruent; 77 states remain DEFERRED, each with its own recorded reason (unchanged) |
| `node tools/parity/extract-expected.mjs --check` | **67/67** keys reproduce byte-for-byte |
| `pnpm --filter ./apps/mobile exec jest rendered-conformance` | **31/31** tests passing (7 coverage-ledger checks + 24 asserted screens) |

**Regressions vs. the prior run: none — this is the first run, there is no prior report to diff
against.** The next run diffs against this one.

One tooling note surfaced in the course of Phase 1: this session's checkout was missing
`tools/parity/.vendor/` (gitignored, populated by `tools/parity/lib/vendor.mjs`'s `ensureVendor()`)
and `tools/parity` had no local `node_modules` — both are one-time, documented setup steps
(`tools/parity/README.md`), not a defect, and were completed before any check ran.

## Phase 2 — visual sweep

**Deep-dive category this run: customer food (RC)** — first in the rotation (customer food →
customer send/auth/account → rider → merchant → admin), since there is no prior report to say which
category was least-recently reviewed.

Rendered the full wired sheet: `node pair.mjs --wired --out out/sheet-wired` (75 screen renders
across all 67 wired keys; admin/merchant web servers backgrounded via `serve-web.mjs`). Every RC
screen was compared at the alignment-PR bar (structure, geometry, colour, type, copy); every other
wired screen (LJ, RJ/RJM/RR, ADMIN, RM) got a pass/fail glance — a sample across those lanes
(`LJ.onboard`, `RJM.board`, `ADMIN.index.html`) confirmed no additional regressions and reconfirmed
UIP-01 (below) as cross-cutting rather than RC-specific.

### RC screens — deep-dive verdicts

| Screen | Verdict | Evidence | Root cause | Recommendation |
|---|---|---|---|---|
| `RC.home` | ✅ matches | sheet render + jest pass | Codegen-adopted region view; venue photos fall back to initial-letter tiles because this sandboxed renderer has no network access to remote photo URLs (same TLS/proxy constraint `tools/parity/lib/vendor.mjs` documents) — a render-environment limitation, not an app defect | none — reconfirms guardrail-green ✅ status |
| `RC.orders` | ❌ blank render (UIP-02) | sheet render + jest | Fixture doesn't stage a populated orders feed; screen shows nothing, not even a loading skeleton | see UIP-02 |
| `RC.orders_empty` | 🟡 structure matches, font diverges (UIP-01) | sheet render | Shared `EmptyState`/`Heading` primitives rely on a runtime Inter patch this harness doesn't trigger | see UIP-01 |
| `RC.list` | ❌ structural gap (UIP-03) | sheet render | Row component never rebuilt to the mock's photo/rating/ETA/fee card; already tracked in `docs/parity/PHASE4-browse.md` | see UIP-03 |
| `RC.search` | 🟡 PLACES results structurally match; DISHES section absent (already an accepted deferral per tracker C3·3) | sheet render | Same row-card gap as RC.list for the PLACES section | see UIP-03; also see the "not a ledger finding" note on `pending.json`'s stale blocker text |
| `RC.menu` | 🟡 mostly matches; minor back-button/name-row collision (UIP-06) | sheet render | `CoverPhoto`'s photo-less fallback (D-10-adjacent, intentional) may expose a positioning issue | see UIP-06 |
| `RC.cart` | ❌ structural gap beyond D-12 (UIP-04) | sheet render | Live-editable-cart component built around its own row shape instead of the mock's static recap card | see UIP-04 |
| `RC.checkout_cash` / `RC.checkout_wallet` | 🟡 live drop-off capture is an approved superset (D-11); rest matches reasonably | sheet render | D-11 | none beyond D-11 |
| `RC.track_way` | ❌ heaviest map-screen gap, reconfirmed (UIP-05) | sheet render | Gray map stub is an already-sanctioned honest deviation (tracker C6·3); the status timeline and Google-Maps row are an undocumented superset | see UIP-05 |
| `RC.pay_now`, `RC.delivered_rate`, `RC.await_accept`, `RC.item_removed`, `RC.pay_confirmed`, `RC.rejected`, `RC.refunded`, `RC.track_prep`, `RC.no_rider`, `RC.menu_closed` | 🟡 copy/fixture divergence only (no new structural finding) | `tools/parity/rendered-conformance.pending.json` per-key blockers, cross-checked against the sheet | Order-reference format (UUID vs. mock's `LG-####`), fixture restaurant/basket mismatches, and live-timer/status-vocabulary differences — all already named per-key in `pending.json` | fixture alignment + copy pass per the existing blocker text; no fresh UIP row (extends existing tracking, not a new finding) |
| `RC.list_loading` | 🟡 jest-vs-browser staging gap, already documented | `pending.json` | fixture can't suspend the query in the jest harness | as documented |
| `RC.list_error`, `RC.cart_empty` | 🟡 copy-only divergence, font issue applies (UIP-01) | sheet render | `EmptyState` primitive + copy phrasing | see UIP-01; copy pass per `pending.json` |

### Cross-lane glance (not this week's deep-dive)

No regressions found. `LJ.onboard` and `RJM.board` both reconfirm UIP-01 (serif fallback text on
hand-written screens). `RJM.board`'s 8c-style mint header is the already-approved D-29 deviation,
functioning as documented. `ADMIN.index.html`'s chrome (sidebar, KPI-card frames, "API not
connected" empty states) matches the mock; the three extra sidebar items (Merchants, Food disputes,
SOS beyond Commission) are the already-documented honest divergence noted in
`docs/parity/PHASE6-admin.md`.

## Phase 3 — explanations

See the per-row root cause and recommendation in the table above and in the `docs/KNOWN_BUGS.md`
`UIP-01`…`UIP-06` rows (this run's ledger entries carry the same explanations verbatim). No divergence
listed here duplicates an `APPROVED` entry in `docs/DESIGN-DEVIATIONS.md` (D-10, D-11, D-12, D-29 were
each encountered and correctly excluded as sanctioned, not re-flagged).

## Phase 4 — ledger & disposition

Six fresh findings logged in `docs/KNOWN_BUGS.md` as `UIP-01`…`UIP-06`, all OPEN, owner
"design/alignment — report-only lane, no autonomous fix; see the dated report for the recommendation".
No `UIP-` rows existed before this run, so nothing was reconfirmed/deduped — this is the baseline the
next run diffs against.

**Highest-value finding:** UIP-01 — the parity screenshot lane's own app-side renderer doesn't apply
the app's Inter-font patch, so almost every hand-written screen's "type" comparison in this lane's
evidence is currently unreliable (codegen-adopted screens are unaffected). This is a tooling gap in
`tools/parity`, not necessarily a shipped-app defect — recommend confirming on a real device/Expo Go
build whether Inter renders correctly there (expected: yes, since `app/_layout.tsx` always loads the
font patch on a real boot) before treating any of this as user-visible drift, and separately fixing
`tools/parity/render-mobile.mjs` to import `apps/mobile/src/ui/fonts.ts` (or invoke
`applyInterToTextComponents()`) before mounting any target screen so future sheets are trustworthy.

**Next run:** deep-dive **customer send/auth/account (LJ)** — second in the rotation.
