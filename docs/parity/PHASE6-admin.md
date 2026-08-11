# Phase 6 — Admin console alignment (offline shell chrome vs the `ui_kits/admin` kit)

Pixel-parity (structure-first) alignment of the Lynia **admin console** (Next.js web, 1440×900) against
its design authority — the standalone kit pages in `packages/design/ui_kits/admin/*.html` (which `app-targets.mjs`
treats as the admin mock source). Admin is a **Next.js** app rendered via Playwright on a running
`next dev --webpack` server (`tools/parity/serve-web.mjs admin`, :4311), not react-native-web — the web
parity lane (`docs/SCREENSHOT-LANE.md` → "Web app side"). The kit wins over any code comment.

- **Side-by-side:** `tools/parity/out/phase6_admin.png` / `.html`
  (`cd tools/parity && node serve-web.mjs admin &` then
  `node pair.mjs --keys "ADMIN.index.html,ADMIN.orders.html,ADMIN.riders.html,ADMIN.customers.html,ADMIN.cash.html,ADMIN.kyc.html,ADMIN.issues.html" --out out/phase6_admin`
  → all 7 keys print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/admin typecheck` clean, `lint` (oxlint) clean, `test` **57/57** pass.
- **The web parity lane rendered all 7 admin routes** — this re-confirms `docs/SCREENSHOT-LANE.md`'s admin
  path end-to-end in this container (kit page served hermetically from the design mirror; app screenshotted
  from a live `next dev` server at the 1440×900 console viewport).

## The hard constraint this phase operates under (honest, not faked)

With **no `API_BASE_URL`**, every console route renders its **offline "API not connected" shell** — the real
console *chrome* (sidebar, page header, `Conn` status pill, `OfflineBanner`, filter chips, KPI-card frames,
empty-state cards) but **no populated data rows/tables/KPI values**. So this phase aligns and verifies the
**chrome only**: the pieces the offline shell actually draws. Where the kit draws populated data the offline
shell cannot (table rows, live KPI numbers, the needs-attention queue, the by-rider commission table, nav
badge counts), that data-state is **left unverified and flagged for a seeded shoot** — it needs
`PARITY_ADMIN_URL` pointed at a seeded instance, out of offline-harness scope. Nothing is faked.

## What was already aligned (prior work) vs what changed here

**The admin chrome was already almost entirely aligned from prior alignment work.** `apps/admin/app/globals.css`
is a near 1:1 port of `ui_kits/admin/admin.css` (every value reads a token; no literal hexes), and the page
components carry in-code kit line-references for their column orders/copy. Verified already-correct and left
untouched: the 216px sidebar shell + brand lockup (`LyniaGo` / `operations` + the 28px dove polygon), the
`nav-item`/`nav-badge` styling, the page header (`h1` + `.sub` + `.conn`), the `OfflineBanner`, the `.card` /
`.panels` / `.kpi` / `.substrip` frames, `table.data` + `DataTable`, `.kpill`/`StatusPill`, `.subnav`/`FilterNav`
chips, `.empty`/`EmptyState`, and the confirm-modal chrome. The side-by-sides confirm the offline shell reproduces
the kit chrome faithfully across all 7 routes.

**The one change made this phase** (`apps/admin/app/components/Sidebar.tsx`): the sidebar **foot descriptor**
was `Harare pilot · single ops role`; the kit draws `ops admin · Harare pilot` (`shell.js` foot:
`<b>Rufaro C.</b>ops admin · Harare pilot`). Aligned to the kit copy verbatim. The operator **name** line stays
dynamic (`operator || "Ops admin"`) — the kit's `Rufaro C.` is demo data; the app binds the verified IAP
identity, which is correct, not a divergence.

No test asserted the foot copy or the sidebar structure (only `ConfirmModal.test.tsx` and `states.test.tsx`
exist among component tests) — nothing to update. All logic preserved.

## Per-route mapping

| Key | Route | Shot type | Chrome aligned (verified in the offline shell) | Needs a seeded API (`PARITY_ADMIN_URL`) — unverified |
|---|---|---|---|---|
| `ADMIN.index.html` | `/` | chrome-only | sidebar, `Overview` header + sub + `Conn`, `OfflineBanner`, the 4 KPI-card frames (Live orders / Riders online / Completed today / Fares today) with `—` placeholders, the substrip frame, the `Recent orders` card + `All orders →` link + empty-state | populated KPI values, the substrip metric values, the **Needs-attention** queue (omitted offline — it only renders when `connected`), and the recent-orders table rows + column headers |
| `ADMIN.orders.html` | `/orders` | chrome-only | sidebar, `Orders` header + sub + `Conn`, `OfflineBanner`, both `FilterNav` chip rows (type: all/parcel/food · status chips), the table card + "Orders not connected" empty state | the populated orders table + its column headers (Order · Type · Route/merchant · Status · Rider · Fare · Distance · Note · Created) |
| `ADMIN.riders.html` | `/riders` | chrome-only | sidebar, `Riders` header + sub + `Conn`, `OfflineBanner`, the table card + "Riders not connected" empty state | the populated directory table + column headers (Rider · Phone · Bike · KYC · Trips/rating · Strikes · Status) and the standing/KYC pills |
| `ADMIN.customers.html` | `/customers` | chrome-only | sidebar, `Customers` header + sub + `Conn`, `OfflineBanner`, the `FilterNav` chips (all/active/on hold/flagged), the table card + "Customer directory not connected" empty state, the status-pill legend | the populated customers table + column headers (Customer · Phone · Orders · Spend · Cancel rate · Flags · Food payment · Joined) |
| `ADMIN.cash.html` | `/cash` | chrome-only | sidebar, `Commission` header + sub + `Conn`, `OfflineBanner`, the gold launch-model marker banner, the 4 KPI-card frames (Commission rate / Rides / Fares delivered / Commission accrued) with `—`, the `By rider` card + empty state, the disabled flip-day `SeedCreditCard` | the populated by-rider commission table + values. **NB:** the kit `cash.html` shows the **retired weekly-15% settlement model** (CLAUDE.md); the app deliberately renders the current prepaid-per-ride model — visual language matched, business logic intentionally NOT aligned to the retired kit |
| `ADMIN.kyc.html` | `/riders?kyc=pending` | chrome-only | sidebar (KYC review item lights via `kycMode`), `Riders — KYC review` header + KYC sub + `Conn`, `OfflineBanner`, the KYC `FilterNav` (pending/verified/failed/expired/all), the table card + empty state | the populated KYC queue table + column headers (Rider · Phone · Bike reg · KYC · Trips/rating · Action) and the inline Approve/Review row actions |
| `ADMIN.issues.html` | `/issues` | chrome-only | sidebar, `Issues` header + sub + `Conn`, `OfflineBanner`, the `FilterNav` (all/open/investigating/resolved), the table card + "No open issues" empty state | the populated issues table + column headers (Issue · Type · Order · Opened by · Opened · Status) |

## Honest divergences carried forward (documented, not silently "fixed")

1. **The sidebar has 3 nav items the kit does not draw — `Merchants`, `Food disputes`, `SOS` — and they are
   kept, not removed.** The `ui_kits/admin` kit is a pre-food/-merchant/-SOS snapshot (it still ships the
   retired weekly-15% cash model, per CLAUDE.md), so it simply predates these areas. Each of the three is a
   **real shipped route** with its own `page.tsx`, server actions and tests (`apps/admin/app/merchants/**`,
   `apps/admin/app/merchants/disputes/**`, `apps/admin/app/sos/**`). "Not drawn ⇒ not rendered" governs
   *cosmetic* extras (confetti, invented headings, badges); it does not sanction deleting navigation to working
   product areas — that would orphan shipped features and violates "PRESERVE all logic". The kit-matching 7
   items (`Overview · Orders · Riders · KYC review · Customers · Issues · Commission`) appear in the **same
   relative order** as the kit, with the 3 extras interleaved (Merchants + Food disputes after Customers, SOS
   after Issues). **This is a product-scope question for the user**, and a candidate `docs/DESIGN-DEVIATIONS.md`
   entry (either the kit absorbs these areas, or they are sanctioned as app-only nav). Not resolved unilaterally.
2. **Nav badges (`KYC review 3`, `Issues 2`) do not show in the offline shell.** They are driven by
   `/admin/nav-counts`, which is null offline — so the app honestly renders no badge. Data-state; verify against
   a seeded instance.
3. **Overview sub copy.** The kit draws `Harare pilot · Eastlea–CBD corridor` (a data-driven pilot-corridor
   scope the shell recomputes per data volume); the app renders a static `Harare pilot · monitor & support
   console`. The corridor name is pilot demo data the offline app does not hold — same class as the KPI numbers,
   left as-is rather than hardcoding a corridor.
4. **Overview substrip metric set.** The frame + `<b>value</b> label` pattern match the kit; three of the six
   metric slots differ because the app's `/admin/overview` data model differs from the kit's imagined funnel
   (app: offers-per-broadcast / expiry / cancelled / KYC-pending / open-disputes / broadcasts-with-an-offer;
   kit: avg-time-to-first-offer / expiry / cancelled / KYC-pending / new-customers-riders / offers-per-broadcast).
   `expiry rate`, `cancelled`, `KYC pending` match; the rest are a data-model question, not chrome. Verify/settle
   on the seeded shoot rather than inventing metrics the API does not return.
</content>
</invoke>
