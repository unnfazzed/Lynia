# Navigation design review — customer & rider journeys (plan)

**Date:** 2026-08-12 · **Planned by:** Claude (planning session) · **To be executed by:** a separate
Claude session on Opus 4.8 (owner instruction: plan and execution run on different models).
**Owner request:** review navigation across all customer and rider screens in the **actual design
UI** (rendered mocks, not documentation): how to proceed next, how to go back, how to reach home,
how to opt out of a running process, and how to switch Customer ↔ Rider without confusing
functionality from the other side.

---

## 1. Scope

All phone-registry screens in the design gallery (the LOOK authority,
`packages/design/explorations/journey/All Screens Gallery.html`):

| Side | Sources | Screens |
|---|---|---|
| Customer | LJ (74) + RC (48) | 122 |
| Rider | RJ (59) + RJM (19) + RR (20) | 98 |

Merchant (RM) and admin are **out of scope** (owner asked for customers and riders). Retired
screens are never reviewed (`LJ home_launcher`, nine `RJ` ids — see `EXPORT-README.md`). The
review examines **rendered screens** (PNGs from `tools/parity`), with the registry JSX
(`screens*.jsx`, `rider-*.jsx`, `r-customer-*.jsx`, `r-rider.jsx`) as the index and line-reference
source.

### The five lenses (owner's list, made checkable per screen)

1. **Forward** — is the next step unambiguous (one primary CTA, drawn destination)?
2. **Back** — is there a drawn way to the previous state? Which grammar (AppBar chevron, ghost
   "Back", sheet grabber, ×)? If none: is Android hardware-back's implied target safe and obvious?
3. **Home** — is home reachable (tab bar, explicit "Back home/board" CTA)? If not, how many taps
   away is it through drawn affordances?
4. **Opt-out** — can the user abandon the running process (order, auction, KYC, top-up, active
   job) and land somewhere safe? Is the consequence stated before commitment?
5. **Role switch** — can a customer reach rider mode and vice versa without stumbling into the
   other role's functionality? Is the switch discoverable where the mocks promise it?

---

## 2. Investigation findings (already established — do not re-derive)

### 2.1 The drawn navigation grammar

- `AppBar` (`packages/design/components/shell/AppBar.jsx:8`) — back chevron **on by default**;
  `back={false}` suppresses it. No close/× variant exists in the DS.
- `TabBar` (`components/shell/TabBar.jsx`) — customer tabs **Home · Orders · Account**; rider
  passes its own **Jobs · Money · Account** (`rider-one-app.jsx:14-18`). Renders **only** when a
  screen passes `tab` to `AppScreen` (`AppScreen.jsx:17`).
- **Tab-bar reach is very thin.** Customer: ~8 of 122 screens draw it (RC home/orders/orders_empty,
  LJ profile/history/home_flag_off/stale_cache(+empty), order_restore). Rider: only 14 RJM screens;
  **zero** RJ and RR screens.
- Ad-hoc grammar coexists with the DS: hand-drawn `arrow-left` (LJ addr_search/addr_map_confirm),
  ghost "Back" buttons (LJ/RJ otp), non-interactive text spans "`‹ Wallet`"/"`‹ Top up`"
  (rider-screens-wallet.jsx:111,139), × glyphs that are not buttons (photo capture,
  addr_unavailable), grabber-only sheets, and headerless map screens (RR nav_rest/nav_cust).
- The journey maps encode the **intended transition graph** (`journey/map.jsx` edges ~L80,
  `rider-map.jsx` edges ~L99; kinds flow/trans/ret/branch/err). **Caveat: the rider map's edges
  still route through retired screens** (`rider_offline → board → offer_compose`) — the rider
  expected-graph must be re-derived for RJM before use.

### 2.2 Seed findings — hypotheses for the execution session to verify on rendered UI

Each was found by reading registry JSX; execution must confirm on the rendered PNG, then classify
(§4). File:line refs are in the two investigation appendices the executor should regenerate or
request; headline items:

**A. Role switch is promised but never drawn (both sides).** `role_select` copy says *"It's one
account — pick how you'll use LyniaGo now, and switch anytime"* (screens.jsx:666,
rider-screens.jsx:163) — but no customer screen (profile/settings/privacy) and no rider screen
(RJM account, RJ settings) draws a switch row. A working switcher exists only in the stale
interactive kit (`ui_kits/mobile/app.js:291` — pre-July flow, not authority). **Meanwhile the
shipped app already has the affordances**: customer Account "Become a rider"/"Rider dashboard"
(`apps/mobile/app/(tabs)/account.tsx:92-96`), rider board "Back to customer" with an
online/active-job confirm sheet (`app/rider/(tabs)/index.tsx:851-885`), and a "You're online as a
rider" pill on the send composer (`app/send.tsx:675-690`). Under the standing rule **"not drawn ⇒
not rendered", a naive parity pass would delete the app's role switching.** This is the single
most consequential outcome of the review: it must end either in an upstream design request
(drawn switch affordances) or an owner-approved `docs/DESIGN-DEVIATIONS.md` entry protecting the
app behaviour. Flag to owner in all cases.

**B. Journey-map ⇄ screen contradictions (design-internal).**
- `map.jsx` draws edges `track_active → cancel` labelled *"Cancel any time"* and the cancel node
  says *"Cancel at ANY point (per decision)"* — but the drawn `LJ track_active` and `track_paused`
  screens have **no cancel affordance** (screens.jsx:301-321). `track_code` has it; it disappears
  once live.
- `LJ auction_live` drops the "Cancel order" button that `auction_finding` and `select_race` have
  (screens.jsx:265-278 vs :222,:238) — mid-auction with offers streaming is exactly when a
  customer may want out.
- `RC cancel_sheet` exists (r-customer-b.jsx:385-404) but no tracking screen draws an entry to it.
- Rider: `RJ job_bail` (cancel sheet) and `RR cancel_reason` exist, but **no active-job screen
  draws a link to them**; `strikes_final` copy tells riders to use *"Get help with this job"*
  before dropping — also not drawn on `RJM active_parcel`/`active_food`.

**C. Users trapped mid-money-flow (drawn copy blocks exit, no control).** `RC placing` ("Don't
close the app", zero controls), `RC await_accept`/`confirm_call` (3-minute kitchen window,
no exit), `RC pay_wait` (no back; only "I paid another way"), `RJ photo_uploading` (**zero enabled
affordances** — submit disabled, no cancel), `RJ offer_sent` (no withdraw; copy says the offer
"stays live at this price until the window closes"), `RR return_cash`/`return_rest` (no exit,
banner blocks new offers). Some are deliberate holds — the review must judge each against lens 4
and the consequence copy.

**D. Mocks referencing retired destinations.** `RJ wallet_low` back-label "`‹ Earnings`"
(rider-screens-wallet.jsx:85 — Earnings is retired), `RJ topup_success` sole CTA "Back to wallet"
(:177 — wallet is retired; Money tab replaced it; the gate→top-up→success loop as drawn returns to
a screen that no longer exists). These are design defects to report upstream.

**E. Account/support screens suppress back and have no tab.** LJ notifications/help/settings/
settings_perms and RJ settings/help all draw `Top … onBack={false}` — no chevron, no tab bar:
drawn dead ends reached from a screen (profile/account) that does have the tab bar. Verify whether
this is a deliberate "hardware-back only" stance or a gap; it is at minimum inconsistent —
`RJM notifications` is the only rider screen drawing **both** chevron and tab bar, while
`LJ notifications` draws neither.

**F. First-run and KYC dead ends.** Customer: splash/login/register/role_select have no drawn
back (forward-only funnels — likely fine; verify). Rider KYC: `kyc_intro`/`kyc_form` no exit at
all, `photo_capture`'s × is a glyph not a button, `kyc_pending`/`kyc_expired` dead ends. A rider
mid-KYC who wants to go use the customer side has no drawn path anywhere.
- Gates: `gate_out_of_area`/`gate_cooldown` retry-only dead ends; `gate_topup`'s only escape is
  the Money tab bar; `gate_kyc_locked` is the only gate with a drawn Back.

**G. Terminal/edge screens with no onward path.** Customer: menu_closed, track_paused (both
services), resume, handoff_dispute, handoff_wait, handoff_code, `LJ delivered_rate` (stars but no
submit/skip/back), phone_masked, track_dark, undelivered/cancelled (forward-only "Send a new
request" — no "back home"), offline/conn_reconnecting overlays. Rider: job_offline, missed/
not_chosen/bid_expired (board cards are the only path), handoff_wrong (no abandon),
kyc_expired. `force_update` is an **intentional** hard block — the exemplar of a justified dead
end; the review should use it as the bar.

**H. Grammar inconsistency as a pain-point in itself.** At least six coexisting back idioms
(§2.1). The synthesis should propose one navigation grammar table (which idiom belongs to which
screen class: root/pushed/sheet/camera/gate/terminal) as an upstream recommendation.

### 2.3 What is already fine (don't re-litigate)

Safety flows draw consistent exits (sheet Cancel/Close, report/help screens have chevrons and
"Back to board/job/order" CTAs). Exception screens overwhelmingly carry either a back chevron or
an explicit recovery CTA. The rider board band (RJM) is fully tabbed. Onboarding "Skip",
permission "Not now" secondaries exist.

---

## 3. Execution method (for the Opus 4.8 session)

**Ground rule: review the picture, not the prose.** Every finding must cite a rendered PNG (and
the JSX line only as a pointer). Static mocks have non-interactive controls by design — a chevron
that isn't clickable is *not* a finding; a chevron that isn't **drawn** is.

### Phase 0 — render the evidence (once, ~30 min)

```bash
cd tools/parity
# first run fetches pinned react/babel/leaflet into .vendor/ via curl (proxy-aware); after that hermetic
node pair.mjs --category customer --out out/sheet-nav-customer   # 122 mocks + app column where wired
node pair.mjs --category rider    --out out/sheet-nav-rider      # 98 mocks
```

Per-screen PNGs land in `out/sheet-nav-*-parts/mock-<src>.<id>.png` (mock) and `app-<key>.png`
(app, where wired — keep these: app-vs-mock navigation divergence is in scope). Playwright/Chromium
are preinstalled (`PLAYWRIGHT_BROWSERS_PATH`); no DB needed for mock rendering; OSM tiles are
stubbed. Verify the part count ≈ 220 before proceeding; screens that fail to render get listed,
not skipped silently.

### Phase 1 — banded review fan-out

One reviewer agent per band group, each given: its screen keys + PNG paths, the JSX refs, the five
lenses as a per-screen checklist, the §2.2 seed hypotheses for its band, and the expected-edge
list from `map.jsx` / `rider-map.jsx` (rider edges re-mapped to RJM first — a small Phase-1a task:
rewrite retired-id edges per the retirement map in `gallery-map.js` header). Suggested grouping
(11 reviewers, within the default <15-agent workflow guideline):

- Customer: ① first-run+account/support, ② home/orders+browse/compose, ③ commit&pay+kitchen,
  ④ track+handoff/close, ⑤ trust&safety, ⑥ exceptions&edge.
- Rider: ⑦ first-run+KYC, ⑧ board+taking-a-job, ⑨ active job (RJM+RJ+RR steps), ⑩ money+account,
  ⑪ safety+exceptions.

Structured output per screen: `{key, forward, back, home, optOut, deadEnd?, hardwareBackRisk?,
findings:[{lens, claim, evidencePng, jsxRef, severity}]}`.

### Phase 2 — cross-cutting reviewers (3 agents)

1. **Role-switch lens** — both sides end-to-end, including the app-side reality (§2.2-A) and what
   a parity pass would do to it.
2. **Grammar consistency** — catalogue every back/home/dismiss idiom across all 220 PNGs; flag
   same-class screens using different idioms.
3. **Graph contradictions** — journey-map edges promising transitions no drawn control initiates
   (§2.2-B), plus transitions into retired screens (§2.2-D).

### Phase 3 — adversarial verification

Every finding gets an independent verifier prompted to **refute** it against: (a) the rendered
PNG (is the affordance genuinely absent — check the full-height render `--full` if the screen
scrolls); (b) intent docs — `RIDER-ONE-APP-PLAN.md`, `RESTAURANTS-DECISIONS.md`, `HANDOFF.md`,
`EXPORT-CHANGELOG.md`, `docs/DESIGN-DEVIATIONS.md` — is the absence a recorded decision (e.g.
force_update, the disclaimer gate)? (c) the SH shipped-states sheet (`ui_kits/mobile/
shipped-states.html`) whose per-state notes sometimes specify CTA behaviour the static frame
can't show. Findings that survive get `CONFIRMED`; refuted ones are dropped with the refutation
recorded.

### Phase 4 — synthesis

One report: **`docs/NAVIGATION-DESIGN-REVIEW-2026-08-<dd>.md`** (dated-report convention), with:

- Per-lens summary tables (customer / rider), severity-ranked findings, each linking its evidence
  PNG (commit the handful of headline PNGs under `docs/parity/`, precedent:
  `docs/parity/RC-home-live-cards-2026-08-12.png`; the full sheets attach to the PR).
- A proposed **navigation grammar** table (§2.2-H) as the upstream recommendation.
- Severity scale: **P0** trapped mid-money/mid-job or destructive ambiguity (§2.2-A/B/C);
  **P1** dead end with unsafe hardware-back target or retired-screen reference; **P2** promised-
  but-missing affordance with workaround; **P3** grammar inconsistency/polish.

---

## 4. Classification & action rules (constraints from CLAUDE.md — binding)

Every confirmed finding is classified; the class dictates the only permitted action:

| Class | Meaning | Action |
|---|---|---|
| `DESIGN-GAP` | The mock lacks a navigation affordance users need | **Report upstream** in the review doc's "upstream requests" section. **Never edit `packages/design/**`** (reverse-drift freeze fails CI without a deviations entry). |
| `APP-AHEAD` | The app has navigation the mocks don't draw (e.g. role switch, §2.2-A) | Draft a `docs/DESIGN-DEVIATIONS.md` entry (next D-NN, status **PENDING**) — **adding it requires explicit owner approval; the execution session drafts, presents, and waits**. Do not let any parity work remove the affordance meanwhile. |
| `APP-DIVERGENCE` | The mock draws navigation the app doesn't implement | App-side fix, follow-up alignment PR(s) with `pair.mjs` sheet evidence, normal merge-on-green. |
| `INTENTIONAL` | Absence is a recorded decision (force_update, disclaimer gate…) | Note with the decision source; no action. |

The review PR itself (report + drafts + evidence) is docs-only → merge-on-green per standing
policy. **D-NN ledger entries and any `packages/design/` change are excluded from auto-anything**
— owner approval first, no exceptions.

## 5. Prerequisites checklist for the execution session

- [ ] gstack installed (`ls ~/.claude/skills/gstack/bin`) — the PreToolUse hook blocks the Skill
      tool otherwise. Fresh containers need the install from CLAUDE.md.
- [ ] `tools/parity/.vendor/` populated (first `pair.mjs` run does it; needs outbound curl via the
      session proxy).
- [ ] Do **not** run `npm i` in `tools/parity` unless app-side rendering fails without it.
- [ ] Branch: continue on `claude/navigation-design-review-occg03` if unmerged, else restart it
      from `main` per repo git rules.
- [ ] Read this plan §2.2 as hypotheses, §4 as law.
