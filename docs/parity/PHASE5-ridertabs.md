# Phase 5 — Rider TABS cluster alignment (RJM)

Pixel-parity (structure-first) alignment of the rider **one-app** tab cluster — the four `window.RJM`
states (registered by `packages/design/explorations/journey/rider-one-app.jsx`) against their app
screens under `apps/mobile/app/rider/(tabs)/`. The current rider design is **RJM** (one app: Jobs ·
Money · Account, one tagged board, Money tab, top-up gate); the stale interactive mobile kit and the
retired nine `RJ` originals are **not** aligned to. The gallery/mock wins over any code comment.

- **Side-by-side:** `tools/parity/out/phase5_ridertabs.png`
  (`cd tools/parity && node pair.mjs --keys "RJM.board,RJM.board_empty,RJM.money,RJM.account" --out out/phase5_ridertabs`
  → all four print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean, `lint` clean,
  `test` **907/907** pass.

Layout/structure only. No socket/heartbeat/GPS logic, online/offline toggle, KYC/online-gate tree,
bid-compose auction flow, wallet/ledger queries, top-up reconciliation, or navigation handlers were
changed — only how the online-state board chrome, the balance card, the ledger, and the account rows
are laid out. Per the harness's honest stubs, the board's socket is inert (the pill reads
**Reconnecting**, not a faked green "Online", and cards label their trip distance from the inert-GPS
fallback), and the Money tab's cash-held "yours/owed" render **0.00** with no active job — none of
these are faked.

The scoped screens are the **online / verified** happy paths (`showOpenOrdersList` on the board). The
offline / KYC / online-gate branches keep their existing ScrollView presentation (green BrandHeader +
go-online Card) — those are separate, still-⬜ tracker rows (`RJM offline`, `RJM gate_topup`, the `RJ`
KYC states) with their own mocks, out of this cluster's scope.

---

## RJM.board → `app/rider/(tabs)/index.tsx` (online, populated)

Fixture `rider_board`: verified rider, `isOnline: true`, four open parcels on the feed.

| # | Mock rule (`RJM.board`, rider-one-app.jsx:87-93) | File change that satisfies it |
|---|---|---|
| 1 | **Plain white `AppBar title="Jobs near you"`** with only a **bell** on the right — no green surface, no profile action | Replaced the green `BrandHeader` (`AppScreen dark banner={boardBanner}`) with a plain `AppScreen`; added `boardHeaderRow` — a `Heading` "Jobs near you" + a bell `Pressable` → `/notifications` — as the FlatList header. The `onProfile` action is dropped ("not drawn ⇒ not rendered"; profile lives on the Account tab). The green `BrandHeader` is a code-comment-defended "one sanctioned green surface" the mock never draws. |
| 2 | **`OnlinePill`**: `StatusPill online` · "…· one queue" subtitle · a right-aligned **"Go offline"** accent-text action — a compact row, not a big Card | Added `onlinePillRow` (status pill + subtitle + "Go offline" `Pressable` → `onlineM.mutate(false)`) as the FlatList header, replacing the big `onlineToggleCard` there. The go-online Card stays as the OFFLINE presentation on the ScrollView path (RJM `offline`). Status is honest: `board.connected && !beatStale ? "Online" : "Reconnecting"`. |
| 3 | Cards lead **straight from the pill** — no "Open orders" section label | Removed the `<Sub>Open orders …</Sub>` heading from the FlatList header (kept the transient, self-clearing `takenNotice`, which is null in steady state). |
| 4 | Each `JobCard` action is a **filled primary `Button`** (`<Button label={action}/>`) | `src/ui/rider/JobCard.tsx`: dropped `variant="ghost"` on the card action → primary green fill, one clear action per card. |
| 5 | Parcel card note reads **"{item} · asking ${fare}"** ("Documents envelope · asking $3.00") | `note={` `${o.itemDesc} · asking $${o.proposedFare}` `}` on both the FlatList `renderJobCard` and the ScrollView map. |
| — | TypeTag (FOOD/PARCEL), km, fare, route-line dot→square, one card anatomy | Already matched by the existing `JobCard`/`TypeTag`/`RouteLine`; unchanged. |

Preserved: the `showOpenOrdersList` FlatList virtualization (B-O1b), `ranked`/`renderItem` referential
stability (B-O9), the bid-compose `selectedCard`, sent-offers section, active-job banner, the online
reconnect `OfflineBanner`, and the whole KYC/location/online-gate ternary on the ScrollView path.

**Honest deviations (not faked):**
- **"Reconnecting" pill + top banner instead of a green "Online".** The parity socket is inert, so
  `board.connected` is false — the app honestly shows the reconnecting state the mock's frozen still
  can't depict. Not a structural miss.
- **Subtitle copy "Parcels · one queue" vs the mock's "Parcels and food · one queue".** Food dispatch
  is flag-gated (`merchantDispatchAutoEnabled`, off in the harness), and the board copy branches on it
  — an already-sanctioned deviation (`docs/DESIGN-DEVIATIONS.md`; `board_food_off` is the flag-off
  mock). The flag-ON branch renders the mock string verbatim.
- **"Back to customer" trailing action.** No RJM board mock draws it, but it is the only path back to
  the customer role and the RJM account mock has no home for it either. Kept (below the fold) rather
  than stranding a rider-who-is-also-a-customer. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **`0.0 km` trip labels.** The inert-GPS honest stub; not faked.

## RJM.board_empty → `app/rider/(tabs)/index.tsx` (online, nothing in range)

Fixture `rider_board_empty`: same verified/online seed, `GET /orders/open` → `[]`. Renders the same
new header + pill, then the `boardEmptyState` ("Nothing in range yet" + Refresh) as the FlatList
`ListEmptyComponent`. Copy already matched the mock's "Jobs that get taken simply leave the list"
rule. Same honest deviations as `RJM.board` (Reconnecting pill, flag-off subtitle, Back-to-customer).

---

## RJM.money → `app/rider/(tabs)/money.tsx`

Fixture `rider_money`: commission live (10%), balance $8.40 (healthy), a realistic ledger, no active
job.

| # | Mock rule (`RJM.money`, rider-one-app.jsx:237-268) | File change that satisfies it |
|---|---|---|
| 1 | Balance card is an **accent-bordered white `Card`** (not a solid-green fill): **"COMMISSION BALANCE"** uppercase 12/700 muted eyebrow, the balance in **ink at 28px**, a commission line, and **Top up inside the card** | Rewrote the hero: `Card accent={!heroBad}`, uppercase muted eyebrow, `formatMoney(balance)` at 28/700 ink, the commission line, and the `Top up` `Button` moved **inside** the card. The negative/below-floor states keep the `dangerWash` fill (RJM `gate_topup` is the empty gate — not drawn by M1). |
| 2 | Commission explanation lives **in the balance card** ("X% comes off this balance when a job closes — parcels and food, same rate. Run it to zero and you can't go online.") — no separate bottom card | Folded the copy into the hero (interpolating the real `config.ratePct`, not the mock's hardcoded "5%") and **removed the separate bottom honest-copy `Card`** ("not drawn ⇒ not rendered"). |
| 3 | `CashStrip` (YOURS / OWED TO A KITCHEN) directly under the balance card | `CashHeldStrip` already followed; unchanged (position now flows straight after the card since Top up moved inside). |
| 4 | Filter chips (All / Parcels / Food) with **no "History" label** | Removed the `<Text>History</Text>` label above `FilterChips`; chips lead straight into the rows. |
| 5 | Ledger rows are **bare, hairline-divided rows** (34px surface icon circle, 13.5/600 title, 12 muted meta, right-aligned amount) — not wrapped in a card | Dropped the `<Card>` wrapper; each `LedgerRow` now sits in a `View` with a `borderBottom` hairline, matching the mock's on-page rows. |
| — | Heading "Money" | Kept `Heading` (the app's realization of the mock's no-back AppBar title, per the aligned customer Account precedent); dropped the extra `Sub` the mock doesn't draw. |

Preserved: the `usePendingTopupReconciliation` recovery banner, wallet/ledger queries + focus-refetch,
`filterLedgerEntries`, load-older pagination (LC-B-SIB-2), the below-floor/negative/getting-low/grace
hero variants, and `LedgerRow`'s signed/coloured commission math.

**Honest deviations (not faked):**
- **Ledger amounts are signed commission debits/credits (−$0.45, +$10.00), not the mock's plain job
  fares.** This is a commission wallet — showing a debit as a plain positive fare would misrepresent
  it. Kept the honest signed ledger.
- **`yours = $0.00` vs the mock's $5.40; no "≈ N more jobs" runway.** The tab has no single job to
  point a "yours" figure at, and no server field for an estimated-jobs runway — neither is fabricated
  (documented in `CashHeldStrip` / this screen). Candidates for `docs/DESIGN-DEVIATIONS.md`.

---

## RJM.account → `app/rider/(tabs)/account.tsx`

Fixture `rider_account`: now serves `GET /auth/me` (verified rider, ★4.9, 132 trips) so the identity
card renders with real data.

| # | Mock rule (`RJM.account`, rider-one-app.jsx:287-315) | File change that satisfies it |
|---|---|---|
| 1 | **Identity card**: 48px accent-wash avatar circle (user icon), name, **"★ 4.9 · 312 jobs · verified"**, an online `StatusPill` | Added a `getMe` query + an identity `Card`: 48px accent-wash circle, `${firstName} ${lastName}`, `★ {rating|new} · {tripsCount} jobs · {kyc tag}`, and `StatusPill online` when `rider.isOnline`. Tapping it opens `/profile` (where session + sign-out live — the mock draws no separate settings row). |
| 2 | One card of **tile rows** (icon · label · sub-line · chevron): **Bike & documents** / **Job history** / **Money** / **Notifications** / **Help & support** | Replaced the old 3 rows (Rider setup / Trip history / Profile & settings) with the mock's five, copy verbatim: `Bike & documents` → `/rider/documents`, `Job history` "Parcels and food in one list" → `/history`, `Money` "Balance, cash held, commission" → `/rider/money`, `Notifications` "One inbox for both services" → `/notifications`, `Help & support` "Call the safety line" → `/help`. |
| — | Heading "Account" | Kept `Heading`; dropped the extra `Sub` the mock doesn't draw. |

Preserved: the `AccountRow` primitive and every navigation target (now expanded to the mock's set).

**Honest deviations (not faked):**
- **No separate "Profile & settings" / sign-out row.** The mock draws none; sign-out/settings is
  reached by tapping the identity card (`/profile`) — the same "tap your details" affordance the
  customer Account tab uses. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **"Bike & documents" sub is KYC-status-derived, not the mock's "Verified · expires Mar 2027".** No
  document-expiry field exists in `me.rider`; the honest sub reflects the real `kycStatus`. Candidate
  for `docs/DESIGN-DEVIATIONS.md`.
