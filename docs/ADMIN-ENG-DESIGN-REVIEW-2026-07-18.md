# Admin Console — Engineering & Design Review (2026-07-18)

**Target:** https://lyniagoadmin.lyniafinance.com/ (Cloud Run `lynia-admin`, behind Google IAP)
**Code reviewed:** `apps/admin` @ `599f0af` (= `origin/main`, the deployed revision)
**Design source of truth:** `packages/design/ui_kits/admin/*.html` — the kit `globals.css` says the console
"reproduces 1:1".

## How this was reviewed

- The live site is **fail-closed behind Google IAP**: every unauthenticated request 302-redirects to Google
  OAuth (`Invalid IAP credentials: empty token`). Authenticated live QA is impossible from this environment, so
  the **exact deployed source** was built (`next build --webpack`) and run locally with
  `ADMIN_CONSOLE_REQUIRE_AUTH=false`, driven headless against a mock API returning realistic Harare-pilot data,
  and screenshotted across live / empty / offline / not-found states (27 app renders + 7 kit renders).
- An **8-lane agentic review** (auth/security · server-actions · api+components · 2× design-parity · design-system+a11y ·
  journeys · deploy-parity) ran with **adversarial verification** of each finding to suppress false positives.
- Mock data values are synthetic — only structure / layout / state / copy / **wiring** issues are reported. Two of
  the workflow's own candidate findings were **refuted** during verification (see "False positives caught").

---

## 1. Deployment: main vs deployment — IN SYNC ✅

- `deploy-admin.yml` fires on push to `main` touching `apps/admin/**`. Run **#7 succeeded on `599f0af`** (the current
  `main` HEAD, via the PR #313 merge). **No admin-touching commit sits on `main` beyond the deployed revision.**
- Earlier runs #4/#5 failed on `5a485b6` (PORT / IAP-arming) but were superseded by the green #6/#7.
- The **fail-closed IAP gate is verified working in production** (401 / OAuth redirect on every unauthenticated hit).
- **No design-vs-deployment drift from an undeployed branch** — the gaps below are the *code itself* diverging from
  the *design kit*, not stale infra.

---

## 2. Engineering findings

### E1 · HIGH (FIXED) — Rider detail page 500s for any *reported* rider
The API (`admin-riders.service.ts:575`) returns `reports` as a **count (number)** plus `reportLog` (the entry array),
but the console typed `RiderDetail.reports: ReportEntry[]` and passed the number straight into `<ReportsCallout>`
(`riders/[id]/page.tsx:122`). `ReportsCallout`'s guard `!reports || reports.length === 0` lets a positive number
through (`(5).length` is `undefined`, not `0`), then `for (const r of reports)` throws `TypeError: reports is not
iterable` → **HTTP 500**. Riders with 0 reports render fine (`0` is falsy → early return); riders with ≥1 report —
exactly the ones ops most needs to suspend/ban — crash the whole detail page.
- **Fix (this PR):** wire the page to `r.reportLog`; correct the type to `reports?: number` + `reportLog?: ReportEntry[]`;
  harden `ReportsCallout` with `Array.isArray(...)` so a stray count can never 500 it again.
- **Verified end-to-end:** with the mock returning the real shape (`reports: 1` + `reportLog[1]`), the reported-rider
  detail now returns **200** and renders the callout; a rider with no reports stays 200.
- *(Customer detail is unaffected — the API returns no `reports` field there, so its `<ReportsCallout>` gets
  `undefined` and renders nothing; customer reports surface via `flagLog`.)*

### E2 · MEDIUM — `ADMIN_CONSOLE_REQUIRE_AUTH` parsing fails **open** for any non-`"true"` value
`middleware.ts:35` uses `=== "true"`, so `ADMIN_CONSOLE_REQUIRE_AUTH=1` / `=yes` / `=TRUE` all resolve to **auth
disabled**. Mitigated in practice — the deploy never sets the var (defaults to `production` → on) and Cloud Run is
`--no-allow-unauthenticated` + IAP-invoker-only, so IAP-at-the-LB is the real gate — but it's a latent footgun.
**Recommend:** treat only `"false"`/`"0"` as off and everything-else-when-set as on (fail closed on typos).

### E3 · LOW — IAP JWT verification doesn't pin the algorithm
`iap-jwt.ts` calls `jwtVerify` without `algorithms: ["ES256"]` (IAP uses ES256) and without `clockTolerance`.
Key-type via JWKS mitigates alg-confusion, but pinning + a small skew tolerance is cheap hardening.

### E4 · LOW — Proxy-header fallback trusts a forgeable header when the IAP audience is unset
`middleware.ts:52` falls back to the plaintext `x-goog-authenticated-user-email` when `ADMIN_CONSOLE_IAP_AUDIENCE`
is empty. The deploy always sets the audience and ingress is LB-only, so it's config-dependent, not currently
exploitable — but the fallback should at least log loudly / be gated behind an explicit opt-in.

### E5 · LOW (FIXED) — `adjustFare` didn't revalidate the orders list
`orders/actions.ts` revalidated only `/orders/:id`, unlike `cancelOrder`/`adjudicateDelivered` which also
revalidate `/orders`. The list Fare column could serve a stale value after an adjustment. **Fixed** (added
`revalidatePath("/orders")`).

### E6 · NIT (FIXED) — `decideKyc` didn't revalidate the rider-detail page
It revalidated the KYC screen + list but not `/riders/:id`, whose KYC pill the decision changes. **Fixed.**

### E7 · NIT — minor cleanups
- `actions/audit.ts`'s "single write path behind every destructive action" comment is stale — destructive actions
  now go through the real `mutate*` endpoints with `auditInEndpoint` suppressing the audit-only POST (code is correct).
- `mutateRider` carries an unused `target` parameter.
- `StatusPill` has no mapping for the `requested` OrderStatus (falls back to muted grey; intentional `?? "mut"` —
  a judgment call, left as-is).
- `console-auth.isPublicConsolePath` uses `startsWith("/icon")` (also matches `/iconanything`) and a comment
  mentions "health" with no matching path.

**Overall the engineering/security foundation is solid** — fail-closed IAP gate, JWT verification, inbound
`x-lynia-operator` stripped and re-asserted from the verified identity, destructive actions calling real mutation
endpoints with the audit row written **in-transaction**, and the F-07 forgery vector (client-chosen action/target)
closed for the follow-up-note path. The findings above are one real crash (E1, fixed) plus hardening/polish.

---

## 3. Design-parity findings (design kit vs shipped)

### D1 · HIGH — The Overview (landing) page is a stripped-down placeholder vs the kit
`app/page.tsx` vs `ui_kits/admin/index.html`. The kit Overview is the operational hub; the shipped one is missing
most of it:
- **Duplicate branding** — the sidebar already shows "LyniaGo / operations", yet `page.tsx` renders a *second*
  inline "LyniaGo — operations" header with a redundant `Riders  Orders  ● live` nav.
- **Wrong headline KPIs** — ships Live-orders / Riders-online / Offers-per-broadcast / Expiry-rate; the kit's two
  headline ops KPIs, **Completed today (+ completion rate)** and **Fares today**, are absent.
- **The entire "Needs attention" queue is missing** (stuck order · open dispute · KYC backlog · commission) — the
  single most useful operational element of the design.
- **The secondary funnel substrip is missing** (time-to-first-offer / expiry / cancels / KYC pending / signups /
  offers-per-broadcast).
- **Recent orders** — 3 columns (Order/Status/Fare) with raw status *text*; the kit has Route / colored status
  **pills** / Rider / Fare / Created + an "All orders →" link.
- **No sidebar count badges** (KYC / Issues) and a generic "Ops admin" footer instead of the operator identity.
- **Also an API-contract gap:** `/admin/overview` doesn't even carry completed-today / fares-today / needs-attention /
  funnel data — closing this needs **both** a UI rebuild and an `/admin/overview` contract extension.
- **Root cause:** `page.tsx` predates the shared-shell refactor — it's the only page still hand-rolling its header and
  cards inline instead of `.content` / `header.page` / `.panels` / `.kpi`.

### D2 · MEDIUM — Overview KPI grid collapses instead of laying out 4-across
`page.tsx:45` renders `<main style={{ maxWidth: 1040, margin: "0 auto" }}>` as a flex child of `.shell` **without
`flex:1` / `width:100%`**, so the `repeat(auto-fit, minmax(220px,1fr))` grid can't expand — the KPI cards stack
**1-across (live)** / **2-across (offline)** rather than 4. Every page using the shared `.content` class renders its
KPI row correctly. `orders/page.tsx` and `riders/page.tsx` share the inline-`<main>` (their wide tables mask it).

### D3 · MEDIUM — Orders & Riders *list* pages diverge from the shell/kit
`orders/page.tsx`, `riders/page.tsx` hand-roll tables with inline styles instead of the shared `DataTable` + `Pill`
used by Customers/Issues: status rendered as **raw machine text** (`en_route_dropoff`) not colored **pills**; a
leftover **"← Dashboard"** back-link although a persistent sidebar exists (and it says "Dashboard" while the sidebar
item is "Overview" — naming drift).

### D4 · MEDIUM — The Riders "directory" is actually the KYC queue
`riders/page.tsx:38` defaults the `kyc` filter to **`pending`** and hard-titles the page **"Riders — KYC review"**.
Both the sidebar **"Riders"** and **"KYC review"** items land here. The kit ships a rich rider **directory**
(`riders.html`) distinct from the KYC **queue** (`kyc.html`); the console conflates them.

### D5 · MEDIUM — The rider directory can't show account standing
The list contract (`riders/page.tsx` `Rider`) has no `accountStatus`, so a **suspended / banned / on_hold** rider is
indistinguishable from active in the directory (only KYC + strikes + online show). Standing appears only on the
detail page. The kit README lists a "suspended-rider state" for the directory.

**Well-built & on-design (verified):** KYC review (resubmission lock, duplicate-national-ID guard, Didit checks,
reason-coded decision), Order detail (8-step timeline, stuck-order call/nudge/cancel, reason-coded adjust/refund/cancel,
delivery-proof), Issue investigation (OTP-not-entered callout, both statements, reason-coded refund/strike/close),
Rider & Customer detail, SOS, Commission — all closely match the kit with correct empty/offline states.

---

## 4. Accessibility findings

### A1 · MEDIUM — Confirm modal has no focus management
`ConfirmModal.tsx` declares `role="dialog" aria-modal="true"` and closes on Escape/backdrop, but on open it **doesn't
move focus into the dialog, doesn't trap Tab focus, and doesn't restore focus to the trigger on close** — keyboard/SR
users stay on the background, which remains reachable behind the modal (WCAG 2.4.3).

### A2 · MEDIUM — Modal form controls lack programmatic labels
The reason radios, the amount `<input>`, and the note `<textarea>` are labelled with `<span class="field-label">`,
not `<label htmlFor>` / `<fieldset><legend>`. Screen readers don't announce "Note"/"Reason" for these controls
(WCAG 1.3.1 / 4.1.2). The radio group also has no `role="radiogroup"`/group label.

### A3 · LOW — Section titles aren't headings
Card titles ("Delivery timeline", "People", "Documents", …) are `<div class="block-title">`, so screen-reader users
get no in-page heading structure below the `<h1>`.

---

## 5. Journey coverage

| Journey | Status |
|---|---|
| Sign **in** (Google IAP) | ✅ enforced fail-closed at the LB and in middleware |
| Sign **out** / switch operator / "signed in as…" | ❌ **absent everywhere** (J1) |
| Sidebar nav → every page resolves | ✅ (Overview/Orders/Riders/KYC/Customers/Issues/SOS/Commission all route) |
| Per-page live / empty / loading / offline / not-found states | ✅ present and honest (distinct `unconfigured`/`unreachable`/`not-implemented`/`not-found` copy) |
| Order: cancel / adjust-fare / refund / adjudicate-delivered + stuck call/nudge | ✅ reason-coded, real endpoints |
| Rider: suspend / lift / ban / KYC approve / decline / resubmit-lock | ✅ reason-coded, real endpoints |
| Customer: hold / lift | ✅ (flag/clear/ban are display-only placeholders, by design) |
| Issue: resolve refund / rider-strike / close | ✅ (backed by `admin-issues.controller`) |
| SOS: acknowledge | ✅ |
| Rider **wallet** credit / bulk seed-credit | ❌ **no UI** (J2 / KNOWN_BUGS DOC-16-03) — API exists, console doesn't |

- **J1 · MEDIUM — No sign-out / operator identity.** No sign-out affordance and no "signed in as <operator>" indicator
  (footer is a static label; the kit shows the operator). Surface `x-lynia-operator` and add an IAP sign-out link.
- **J2 · MEDIUM — No rider wallet management UI** (DOC-16-03). `POST /admin/riders/:id/wallet-credit` and bulk
  seed-credit exist API-side but have no console UI; the Commission page is read-only. Blocks the launch top-up rail.
- **J3 · LOW — SOS rows aren't click-through** (order id + raiser render as plain text).
- **J4 · LOW — Offline copy leaks env-var names** ("Set API_BASE_URL (and ADMIN_API_TOKEN)…") to operators.

---

## 6. Copy fixes (applied this PR)

- **C1 (FIXED)** — Stuck-order banner ran words together: "…24 min**Currently at**…" (JSX dropped the space between
  `{stuckNote}` and "Currently"; confirmed in the RSC payload). Fixed with an explicit `{" "}`.
- **C2 (FIXED)** — "1 strike**s**" pluralization on the riders list; now count-aware.
- **C3 (nit, not fixed)** — the suspend banner is a run-on ("Repeated late pickups The rider cannot go online…") — no
  terminator after the reason.

---

## 7. False positives caught by verification

- ~~"Issues feature is unbacked by the API"~~ — **refuted.** `apps/api/src/issues/admin-issues.controller.ts`
  (`@Controller("admin/issues")`) implements `GET /`, `GET /:id`, `POST /:id/resolve`. The finder only scanned
  `admin/*.controller.ts` and missed the issues module.
- ~~"Report reason / issue type render as raw enums (`unsafe_riding`, `delivery_dispute`)"~~ — **refuted, review-mock
  artifact.** The code correctly uses `REPORT_REASON_LABELS` / `ISSUE_TYPE_LABELS[x] ?? x`; the raw display came from
  the review mock passing enum values that don't exist (`unsafe_riding` isn't a `ReportReason`), triggering the fallback.

---

## 8. Prioritized recommendations

1. **(shipped here)** Fix the rider-detail 500 for reported riders (E1) + the four low/nit correctness & copy fixes.
2. **Rebuild the Overview to kit parity** (D1) — biggest operator-value gap; needs a UI rebuild **and** an
   `/admin/overview` contract extension (completed-today, fares-today, needs-attention, funnel).
3. **Migrate `page.tsx` / `orders` / `riders` lists to the shared shell** (D2/D3) — fixes the KPI-grid collapse, the
   duplicate header, raw-status text, and the "← Dashboard" leftover in one pass.
4. **Split the rider directory from the KYC queue and add a standing column** (D4/D5).
5. **Surface operator identity + add sign-out** (J1); **build the wallet-credit / bulk seed-credit UI** (J2) before
   the commission rate turns on.
6. **A11y:** focus-trap + labels in `ConfirmModal` (A1/A2); heading semantics (A3).
7. **Auth hardening:** fail-closed `REQUIRE_AUTH` parse (E2), pin JWT algorithm + clock skew (E3).

*Items 2–5 are feature-sized (several new/rebuilt screens, some needing API contract changes) — sized as follow-up
builds, not folded into this review PR.*
