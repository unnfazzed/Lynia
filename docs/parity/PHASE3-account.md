# Phase 3 — Customer account cluster alignment

> **Superseded in part (2026-08-16) — read `docs/DESIGN-DEVIATIONS.md` D-15 first.** The
> `LJ.profile → app/(tabs)/account.tsx` section below records this screen's alignment to the older
> static `Profile` mock. That target has since been **retired by owner decision**: the customer
> Account tab (and `app/profile/index.tsx`, and the row grammar of `app/settings/index.tsx`) now draw
> the **rider** account language from `RJM.account`, so the two Account screens stop looking a design
> generation apart. The two "honest deviations" this document flagged as candidates — the missing
> masked-ID row and the load-bearing second "hub" action Card — are resolved by that decision: the hub
> nav became the row list, and the ID row is moot on a screen no longer aligned to `Profile`. The
> `LJ.notifications` / `LJ.help` sections below are unaffected and still current.

Structure-first pixel-parity alignment of the five customer **Account / support** screens against the
design mocks in `packages/design/explorations/journey/screens.jsx`. The gallery/mock wins over any code
comment.

- **Side-by-side:** `tools/parity/out/phase3_account.png`
  (`cd tools/parity && node pair.mjs --keys "LJ.profile,LJ.notifications,LJ.help,LJ.settings,LJ.history" --out out/phase3_account`
  → all five print `mock ok · app ok`).
- **Verify:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test` = **907 passed**.

Values/tokens: all edits use `@lynia/shared` tokens (`space`, `color`, `radius`, `touchTargetMin`). The
handful of bespoke pixel sizes the mocks draw outside the type scale (details phone/role `13`, trip title
`14/600`, fare `15`, notification message `12.5`) are matched literally per "strict mock sizes" — they are
not values a token defines.

---

## LJ.profile → `apps/mobile/app/(tabs)/account.tsx`

Mock `Profile` (screens.jsx L680–698): Heading "Account" + Sub "Your details and session." → details Card
(name 18/700 · phone 13 muted tabular · **ID row + NOT VERIFIED badge** · "Customer" 13 muted) → action Card
[**"Trip history"** (primary), "Send a parcel" (ghost)] → "Sign out" (ghost).

| Mock rule | File:line change |
|---|---|
| Details **phone / role are 13px** muted (the app used 14px) | `account.tsx:67–68` — `fontSize: 14 → 13` on both |
| **No invented caption** — the mock draws no "Editing your details is coming soon." helper under the card | Removed that `<Text>` (was `account.tsx:77`) per "not drawn ⇒ not rendered" |
| Action card is **"Trip history" (primary) → "Send a parcel" (ghost)** — the mock's first button is Trip history, routing to the trips list; the app had led with "Notifications" | `account.tsx:~82–85` — first Card now `[Button "Trip history" → /history, Button "Send a parcel" ghost → /send]`, matching the mock verbatim |

Preserved: the `me` query + skeleton/error branches, the rider stats block + `KycBadge` (role-gated —
customers never see it, so the customer view matches the mock), and every navigation handler.

**Honest deviations (not faked):**

- **No masked-ID + "NOT VERIFIED" row.** The mock draws `ID 63•1234••••••42` + a NOT VERIFIED badge in the
  details card. The `Me` contract (`src/api/auth.ts`) exposes **no `idNumber`** on the customer path, so
  there is nothing to render — the row is omitted rather than faked. Candidate for `docs/DESIGN-DEVIATIONS.md`
  if the ID is to surface (needs an API field first).
- **Second "hub" action Card.** The minimal mock draws only the two-button card; the shipped Account **tab**
  is the customer's navigation hub, so Notifications / (Bike & documents | Become a rider / Rider dashboard) /
  Settings / Help & support are kept in a second Card — removing them would strand those screens (a behavior
  regression the task forbids). Flagged as a deviation candidate: the mock is a flow-map screen with no live
  nav, the app must expose it.
- The parity harness renders the tab **without its bottom tab bar** (the mock draws Home/Orders/Account);
  that is a standalone-render artifact, not a code divergence.

## LJ.notifications → `apps/mobile/app/notifications/index.tsx`

Mock `Notifications` (screens.jsx L752–782): `Top title="Notifications"` → list rows of **38px accent-wash
disc / 18px accent-text icon**, title 14/600 ink, message 12.5 muted (lineHeight 1.45), time 11 muted, an
8px accent unread dot; `padding 12px 0` + bottom hairline per row.

Already structurally aligned — the app `Row` matches disc size, icon size/colour, title/message/time type,
the unread dot, the hairline, and the relative-time labels ("now" / "2 min" / "1 hr" / "Yesterday"). **No
code change.**

**Honest deviation:** the app `AppBar` carries a **back chevron**; the mock's `Top onBack={false}` draws
none. Notifications is a *pushed* screen in the app (reached from Account), so the back affordance is
required — the mock's flow-map convention omits nav, matching the send/auth clusters' handling. The list
content differs because the parity **fixture** seeds different rows (honest fixture data, not a structural
change).

## LJ.help → `apps/mobile/app/help/index.tsx`

Mock `Help` (screens.jsx L784–817): `Top title="Help"` → **"Search help…" Field** → "Browse topics" label
(12/600 muted, margin 6/8) → 3 topic Cards (icon 20 accent-text · title 14/600 · sub 12 muted · **chevron 18
muted**) → mint WhatsApp Card (phone icon 20 · "Chat with us on WhatsApp" 13/600 · chevron 18 accent-text).

| Mock rule | File:line change |
|---|---|
| **"Search help…" field is the first element** (the app had none) | `help/index.tsx:~30–40` — added `<Field placeholder="Search help…" …>`; wired to **filter the static topic list locally** (`topics = q ? TOPICS.filter(…) : TOPICS`) so it is honest and functional, not a decorative box tapping into a nonexistent search backend |
| "Browse topics" label margin **6 top / 8 bottom** | `help/index.tsx:~46` — `marginTop: 6, marginBottom: space.sm` (was sm/sm) |
| Topic-row chevron is **muted** (the app drew it accent-text) | `help/index.tsx:~53` — `color: accentText → muted` |

Preserved: the WhatsApp routing (Help & support routes to WhatsApp by product decision, per CLAUDE.md) and
the honest tappable-vs-inert card gating on a configured `supportWhatsAppUrl()`.

**Honest deviation (keyless state):** with no support number configured (the harness default), topic cards
render **inert with no chevron** and the WhatsApp row is **hidden** rather than opening a dead link — the
mock draws the configured look (chevrons + WhatsApp card). This is the app's existing honest keyless
behavior, unchanged.

## LJ.settings → `apps/mobile/app/settings/index.tsx`

Mock `Settings` (screens.jsx L819–845): `Top title="Settings"` → profile header (52px accent-wash disc /
24px user icon · name 16/700 · phone 13 muted tabular) → Rows [Edit profile · Notifications "On" · Language
"English" · Payment "Cash"] → spacer → "Sign out" (danger) → "LyniaGo v1.0.0".

Already structurally aligned — profile header geometry, all four rows (icon 19, label 14/600, value 13
muted, chevron), the danger Sign-out row, and the centred version footer all match. **No code change.**

**Honest / sanctioned deviations:**

- **Real OS-permission value on Notifications.** The mock hardcodes "On"; the app reads the *real* permission
  (On / Off / —) and taps through to OS settings — the more-honest behavior the `settings_perms` shipped
  states (screens-shipped.jsx SH11) endorse.
- **"Coming soon" on Edit profile.** The mock draws Edit profile as active (chevron); there is no profile-edit
  endpoint yet, so the app shows a "Coming soon" value and no chevron (an honest dead-tap guard). Kept.
- **"Privacy notice" + "Delete account" rows** are **Google Play listing requirements** (in-app account
  deletion + reachable privacy notice — `docs/PLAY-STORE-SUBMISSION.md §4`), not mock extras. Sanctioned
  additions; they stay.

## LJ.history → `apps/mobile/app/history/index.tsx`

Mock `History` (screens.jsx L700–719): Heading "Your trips" + Sub "Every parcel you've sent." → trip Cards,
each: left "from → to" **14/600** ink + date line 12 muted tabular ("{date} · {role}{· ★ rating}"); right
Money **size 15** + 4px gap + StatusPill (expired → offline tone).

| Mock rule | File:line change |
|---|---|
| Trip title weight is **600** (the app drew 700) | `history/index.tsx:31` — `fontWeight: "700" → "600"` |
| Fare is **15px** (the app drew 16) | `history/index.tsx:41` — `fontSize: 16 → 15` |

Preserved: the warm-paint feed (`useHistoryFeed`), the stale-cache header + Retry, the skeleton / empty /
error branches, the reorder ("Send again") action, and role-correct row subtitles.

**Honest deviations (not faked) — the important ones for this screen:**

- **The `LJ.history` registry key's mock is `RC.orders`, not `History()`.** `screens.jsx:919` resolves
  `history` to `window.RC.orders()` when present (an *all-services* Orders list with a live order pinned on
  top + an EARLIER section), which the parity sheet shows on the mock side. That all-services list is
  implemented by **`app/(tabs)/orders.tsx`** (its own target, `RC.orders`), not by the standalone `/history`
  screen assigned here. This lane's app target (`app-targets.mjs:51`) is `app/history/index.tsx` — the simpler
  parcels/trips list — whose structurally-correct mock is the `History()` component I aligned to. Turning
  `/history` into the all-services orders list would be a behavior rewrite and would duplicate `orders.tsx`,
  so it is out of scope. **The sheet's history pane therefore compares two different screens** — a
  harness-mapping artifact, flagged so the mismatch isn't read as unaligned code. Candidate for
  `docs/DESIGN-DEVIATIONS.md` (or a harness re-map of `LJ.history` → `orders.tsx`).
- **Sub copy "…sent or delivered" vs mock "…sent."** `/history` is a *shared* screen — customers reach it
  from Account, riders reach it from the rider account (`app/rider/(tabs)/account.tsx`) — and it renders both
  sent (customer) and delivered (rider) rows. The mock is customer-only ("Every parcel you've sent."). The
  role-neutral copy is kept to avoid a rider-facing inaccuracy; flagged as a deviation candidate.
- **`AppBar` (with back) vs in-body Heading.** The mock draws history as a *tab* (in-body Heading, no top
  bar); the app's `/history` is a *pushed* screen needing a back affordance, so the `AppBar` is kept.
- **"Send again" reorder button** is a real functional action the static mock never drew; removing it would
  drop a feature, so it is kept and flagged.
