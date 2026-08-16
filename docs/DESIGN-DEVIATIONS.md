# Design deviations ledger

The **only** sanctioned differences between the shipped app and the design kit. Everything not listed
here must match the mocks (see the "Pixel parity" section of `CLAUDE.md` for the authority chain).

**How to use this file.** Before you defend a divergence, look for it here. If it is not here, the app
changes — a justification written in a code comment carries no authority. To add an entry you need the
user's explicit approval; record the date and the reason. When a deviation is later designed into the
kit, delete the entry and align.

Status key: **APPROVED** (user-approved, keep) · **OPEN** (needs the user's decision — do not act) ·
**RESOLVED** (decided in the mock's favour — not a deviation, an app defect to fix) · **RETIRED**
(the kit absorbed it; align to the mock, nothing special to do) · **PENDING** (decided, but not yet in
effect — see the entry for what is blocking) · **UPSTREAM** (a defect in the kit; the app is right, to
be reported back to Design).

**Currently live deviations: D-03, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-21, D-22.** D-20 is an UPSTREAM kit defect (no app-side effect). D-01 and D-02 were
retired by the 2026-08-10 rev 2 export; D-04 was decided in the mock's favour; D-05 has no app-side
effect. D-10/D-11/D-12 are the food-cluster per-element dispositions (menu cover search glyph kept
non-interactive per Foundation-E · checkout live drop-off capture · cart upsell omitted).

---

## D-01 · WhatsApp OTP → SMS OTP — RETIRED by the rev 2 export (2026-08-10)

**No longer a deviation.** The 2026-08-10 **rev 2** export changed the mocks themselves to SMS, so
there is nothing left to substitute — align to the mock copy verbatim, as everywhere else.

Changed on the design side: `LJ login` (C1·5), `LJ otp` (C1·6, now titled *SMS OTP* — "Check your
messages", "…by SMS", "SMS can take a minute on a busy network."), `LJ register` (C1·8, "Verified by
SMS ✓"), `otp_cooldown`/`otp_resent`/`otp_locked` (C10·31–33 = safety-flows C·1–C·3), `RJ login`
(R1·3), `RJ otp` (R1·4), the interactive kit's login/OTP/registration strings, plus the map and
README labels.

**Deliberately still WhatsApp, and correct:** help & support routes ("Chat with us on WhatsApp",
`map.jsx` A·5, `rider-map.jsx` A·5). That is a real product decision, not OTP. Verified by hand
across all six remaining files that mention WhatsApp — none is an OTP string.

---

## D-02 · States the mocks never modelled — RETIRED by the rev 2 export (2026-08-10)

**No longer a deviation.** rev 2 added the **`SH·` shipped-states wave — 31 screens** covering every
item on the list below, so these stop being improvised UI and become ordinary alignment targets with
mocks to match. Handoff sheet: `ui_kits/mobile/shipped-states.html` (SH1–SH12), with
normal/loading/error/empty coverage and the 320⇄360 toggle per state.

Where each went (gallery badge · registry id):

| Was undesigned | Now |
|---|---|
| Offline / reconnecting banner | C10·39 `conn_reconnecting` |
| Stale-cache header; offline with nothing saved | C2·6 `stale_cache` · C10·40 `stale_cache_empty` |
| Draft restore, and discarding it | C3·12 `draft_restored` · C10·42 `draft_discard` |
| Keyless address-search fallback | C3·13 `addr_unavailable` |
| "Map didn't load" | C3·14 `map_failed` |
| Location permission off (composer) | C3·15 `loc_off` |
| Active-order restore on cold start, and its failure | C2·5 `order_restore` · C10·41 `order_restore_error` |
| Rating undo window | C7·7 `rate_undo` |
| Real OS-permission rows (denied / ask-every-time) | C8·7 `settings_perms` · C8·8 `settings_perms_ok` |
| Privacy, delete-account, phone masking | C8·9 · C8·10 · C8·11 `delete_final` · C8·12 `phone_masked` |
| Feature-flag-off onboarding / role select / home tiles | C1·11 · C1·12 · C2·4 |
| Rider board with food dispatch OFF | R3·5 `board_food_off` · R3·6 `board_empty_food_off` |
| Proof-of-pickup capture, preview, upload failure | R5·19 · R5·20 · R9·31 `pickup_photo_failed` |
| Rider strike counter | R7·6 `strikes` · R9·32 `strikes_final` |
| Merchant per-item "don't have it" | M3·10 `item_out` · M3·11 `item_out_wait` |
| Merchant pickup-code reveal | M4·9 `pickup_reveal` · M4·10 `pickup_revealed` |

**If a genuinely undesigned state turns up during the screen walks, it gets a NEW ledger entry** —
do not treat this retired one as blanket cover for improvising.

<details><summary>Original rule, kept for the record</summary>

**Rule:** these stay in the app, but are **rebuilt from kit primitives** (kit cards, type ramp,
spacing, colour) so they read as the same product. The happy path stays 100% mock.

- Offline / reconnecting banners, stale-cache headers, degraded-network variants
- Draft restore ("Draft restored" chip + Clear) on the send composer
- Keyless address-search fallback ("Address search is unavailable — tap the map to set this pin") —
  removing it restores the silent-`null` P0 that `docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` was
  written to fix
- "Map didn't load" fallback, location-permission-off hints
- Feature-flag degradations (`getServiceTiles(flag)`, flag-off onboarding and role sets) — the kit has
  no concept of a flag-off build
- Rider board copy branched on `merchantDispatchAutoEnabled` — the unbranched kit copy promises riders
  food jobs a dormant flag will not deliver
- Privacy notice, two-step delete-account, phone-masking lines (compliance surface the mocks predate)
- Real OS-permission notification row (the mock hardcodes "On")
- Active-order restore banner, rating undo window, rider strike counter, proof-of-pickup photos,
  merchant per-item "don't have it", pickup-code reveal

The kit should eventually absorb these; until it does, "match the kit" and "don't ship a lie" point in
opposite directions on exactly these screens.

</details>

---

## D-03 · Two-layer shadows → closest single-layer approximation — APPROVED (2026-08-10)

**Mock:** `--shadow-card` is two layers — `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)`
(`packages/design/tokens/spacing.css`). **App (React Native):** one shadow layer per view; Android
renders `elevation` instead of a coloured shadow entirely.

Ship the closest single-layer match per platform, tuned by eye against the mock. Everything RN *can*
express exactly — radii, borders, colours, spacing, type — stays exact; this concession covers shadows
and CSS blur/spread semantics only. Web surfaces (merchant, admin) reproduce the two-layer shadow
exactly, since CSS supports it.

---

## D-04 · Stepper "done" node contrast — RESOLVED: follow the mock (2026-08-10)

> **Decision (user, 2026-08-10): follow the mock.** The done node becomes the `--accent` (#00B14F)
> fill with a white glyph, as drawn. This is therefore **not** a deviation — it is an app defect to
> fix, tracked here only so the reasoning is not re-litigated by a future session.
>
> **What changes:** `apps/mobile/src/ui/index.tsx`'s Stepper adopts the mock's done node. Scheduled
> for the shared-primitives pass (plan Phase 2) rather than done ad hoc, because the Stepper renders
> on every tracking and active-job screen and the change should arrive with a side-by-side like any
> other alignment work. `packages/design/` already mirrors the tool and needs no edit.
>
> One factual note, recorded once and not re-raised: the white-on-`#00B14F` mark measures ≈2.9:1, so
> Play's pre-launch accessibility scan may flag it — same class of report as the strict-mock-size
> decision. That is the accepted cost of matching the design.

**Mock (`components/journey/Stepper.jsx`, design tool):** done node is a **`--accent` (#00B14F) fill
with a white glyph**. **App (`apps/mobile/src/ui/index.tsx`) and, until this export landed, the repo's
copy of the design file:** `--accent-wash` fill with an `--accent-text` glyph.

A white glyph on `#00B14F` measures **≈2.9:1** — below the WCAG AA 4.5:1 floor for that mark. The
repo's variant measures ≈6.5:1. Commit `2e42159` changed **the design file in the repo** to match the
app, which is backwards under kit-as-truth; the export has now restored the design's version, so
`packages/design/` mirrors the tool again.

The Stepper appears on every tracking and active-job screen in the product, which is why the call was
the user's rather than mine. Resolved above in favour of the mock.

---

## D-05 · `--action-primary` alias — HALF-FIXED in rev 2 · UPSTREAM (no pixel effect)

**Fixed:** `tokens/colors.css` now maps `--action-primary: var(--cta-fill)` (#00812F), matching what
`components/core/Button.jsx` actually paints.

**Still stale:** `--action-primary-pressed` remains `var(--accent-700)` (#009D3B) while the component
presses to `var(--cta-fill-pressed)` (#006B27). Design flagged this deliberately in
`EXPORT-README.md` §3 and left it "pending your call".

**Our call: point it at `--cta-fill-pressed`.** The pressed alias should track the resting one, and
`Button.jsx` is the thing that renders. Still **no app change and no pixel effect** — the alias has no
consumers; this is purely so the semantic layer stops contradicting the component. Carry it in the
next round-trip to Design.

---

## D-06 · Design preview harnesses keep the repo's `postMessage` origin guard — APPROVED (2026-08-10)

`support.js` (root + the four `templates/*/` copies), `ui_kits/admin/shell.js` and
`handoff/google-play/src/tweaks-panel.jsx` receive `postMessage`. rev 1 had **no origin check at
all**; the repo had added a same-origin guard with a `file://` opaque-origin allowance.

**rev 2 adopted a guard — but a weaker one, so we still keep ours.** Compare:

```js
// rev 2 (design tool)
if (e.origin !== window.location.origin && e.origin !== "null" && window.location.protocol !== "file:") return;
// repo (kept)
if (e.origin !== window.location.origin && !(e.origin === "null" && window.location.protocol === "file:")) return;
```

The design version rejects only when **all three** conditions hold, so it accepts a message when
*either* the origin is `"null"` (on any page, including one served over https) *or* the page happens
to be on `file://` (from **any** origin, including a real attacker page). Ours accepts `"null"` only
**when** the page is itself `file://` — which is the actual case the allowance exists for.

Still preview plumbing, so no screen renders differently. Report the precise boolean upstream.

---

## D-07 · `packages/design/` excludes `uploads/`, `scraps/`, `store-assets/` — APPROVED (2026-08-10)

`handoff/update-2026-07/README.md` (the design team's own handoff) instructs: *"Exclude `uploads/` and
`scraps/` from the rsync; keep the generated `_ds_*` files."* Additionally the export's
`store-assets/` (14 MB) is **byte-identical** to the repo-root `store-assets/`, so the duplicate is
excluded; the repo-root copy is canonical. Everything else in the export is vendored verbatim,
including `explorations/store/_food/` (food photography needed to render the RC screens).

Also excluded from parity work entirely, per `EXPORT-README.md`: brand-record explorations, Play-Store
marketing assets, `guidelines/*.card.html` + `components/*.card.html` specimen cards, `templates/`
authoring scaffolds, `thumbnail.html`.

---

## D-08 · Kit-side icon set is 38 icons — APPROVED (2026-08-10)

The repo's copy of `assets/lynia-icons.js` had gained a 39th icon (`Copy`) during app work; nothing in
the design references it (the only `copy` hit is a CSS class). The export's 38-icon set is restored.
If an app screen genuinely needs a glyph the kit lacks, request it from Design rather than adding it
to the vendored kit.

---

## D-09 · CodeQL does not scan `packages/design/**` — APPROVED (2026-08-10)

**In effect.** `.github/codeql/config.yml` carries `paths-ignore: packages/design/**`, wired into
`.github/workflows/codeql.yml` via `config-file:`.

Chosen (user decision, 2026-08-10) over three alternatives, because it is the only one that both
leaves the vendored design byte-identical to the tool **and** survives future exports:

| Option | Mirror intact? | Comprehensive? |
|---|---|---|
| **Scope exclusion** (chosen) | yes | yes — both alerts, and anything a future export adds |
| Fix the regex in place | no — edits vendored design | no — the next export reverts it |
| Dismiss the alerts in the Security tab | yes | no — repeat after every export |
| Drop `explorations/store/` from the vendored copy | yes | no — clears 1 of 2; the generated bundle keeps the other |

Note on urgency, for whoever reads this next: the PR check only reports *new* alerts in code a PR
changes, so once these merged to `main` they stopped failing unrelated PRs (#642 went green). The
exclusion matters at the **next design export**, which would otherwise re-raise them.


The 2026-08-10 export introduced `/^cover|banner|dish|photo$/i` in
`explorations/store/play-export.jsx` (and its compiled copy in the generated `_ds_bundle.js`).
CodeQL is right that the precedence is wrong — it parses as `(^cover)|(banner)|(dish)|(photo$)`
rather than the intended `^(cover|banner|dish|photo)$`. But it is a **cosmetic placeholder-name
filter in a Play-Store screenshot mock tool**: it only decides which stock food photo fills a slot.
No untrusted input, no security boundary, and no app imports the file.

Fixing it in-repo would violate D-00's spirit and this ledger's own rule — the vendored design must
mirror the tool — and the next export would overwrite it anyway. So `.github/codeql/config.yml`
excludes `packages/design/**` from scanning: nothing there ships, we must not edit it, and any fix
is transient. Every app, package and workflow we author stays fully scanned.

**To report upstream** to Design as a genuine (if low-impact) bug in `play-export.jsx` — alongside
D-05 and D-06. None of the three have actually been sent yet; they need a design-tool round-trip.

---

## D-10 · RC.menu cover search glyph — non-interactive (matches the static mock) — APPROVED (2026-08-11)

**In effect. Revised by Foundation-E (2026-08-11).** The kit's `RC.menu` (r-customer-a.jsx:196-198)
draws a search glyph on the cover's top-right corner. There is **no in-menu dish-search backend**.
Foundation-D's disposition **omitted** the glyph as a dead control. **Foundation-E supersedes that:** the
cover is now a GENERATED, guarded region fragment (`menu-cover.view.tsx`) transpiled from the mock's
`CoverPhoto` sub-tree verbatim, so the search glyph is **present** and structurally congruent to the
mock — but it is **decorative / non-interactive** (no `onPress`, exactly as the static mock draws it: a
plain `<span>` with no handler). It therefore promises no action the app can't deliver — nothing happens
on tap because nothing is wired, matching the mock. Wire it to a real dish-search feature the moment one
exists (that is a data-seam change, no structural drift). The back glyph, by contrast, IS wired (a
transparent `Pressable(onBack)` in the fragment's data seam).

---

## D-11 · RC.checkout live drop-off capture — APPROVED (2026-08-11)

**In effect.** The kit's `RC.checkout_cash`/`RC.checkout_wallet` (r-customer-a.jsx:423-500) draw only a
**static address-summary Card** ("12 Lanark Rd, Belgravia · 3.1 km away"). The app collects the drop-off
**live on this screen** — `MapPicker` + `AddressSearch` + a landmark `Field` + a contact-phone `Field` +
the drag-to-adjust `AddressConfirmSheet` — because a food delivery has nowhere else in the flow to
capture where the food is going (the cart deliberately defers drop-off to here). This live capture is
**load-bearing** and is a sanctioned **superset** of the static mock, which draws no address-capture
surface to wire it into. Per the owner's Foundation-D instruction (2026-08-11) — *"the app's live
drop-off capture that the mock lacks a surface for → a DESIGN-DEVIATIONS.md entry (keep the capture;
it's load-bearing) and adopt the rest of the structure to the mock."* The rest of the checkout is
adopted to the kit: the pay bar now rides the Foundation-D `<Screen footer=…>` slot, the pay rows are
`PaymentMethodRow`, and the totals are the `PriceMath` card. The `EtaLine` primitive exists (Foundation-D)
but stays **un-wired** here until an ETA estimator backs it — rendering a fabricated arrival window would
violate the no-invented-figures rule.

---

## D-12 · RC.cart "Add a drink?" upsell rail omitted — APPROVED (2026-08-11)

**In effect.** The kit's `RC.cart` (r-customer-a.jsx:329-341) draws an "ADD A DRINK?" upsell rail of
`FoodThumb` cards. There is **no upsell/recommendation backend** to populate it — an empty "ADD A DRINK?"
heading is dead chrome, and hardcoding the mock's two static drinks would fabricate a menu. Per the
owner's Foundation-D instruction (2026-08-11) — *"the 'Add a drink?' upsell → if un-backed, ledger-omit"*
— the app **omits** the rail. The `FoodThumb` primitive exists (Foundation-D) and backs the menu-row
thumbnails; the upsell rail returns the moment an upsell backend exists. The cart's checkout bar now
rides the Foundation-D `<Screen footer=…>` slot.

---

## D-13 · Home "Send again" (ReorderRail) removed — APPROVED (2026-08-12)

**In effect.** The design sources conflict on the home's empty state:
`components/home/home.prompt.md` specs a **ReorderRail** ("order-again circles… hidden while a live
order shows"), while the newer canonical `components/home/AppHome.jsx` — the component the gallery's
`RC.home` renders — is explicit the other way: *"No order-again / send-again rails: the live cards
are the only thing above the venues."* No gallery screen draws a send-again rail on home. Per the
owner's instruction (2026-08-12, this session — *"remove the send again rails"*), the app follows
the AppHome contract: home renders BrandHeader → service tiles → live-order card(s) → "Restaurants
near you", nothing else. The app-side `ReorderRail` component and its `reorderRailItems` helper are
deleted; re-ordering remains available from the trip-history screen's own "Send again" action. If a
future design export resolves the conflict in `home.prompt.md`'s favour, this entry is the pointer
to revisit.

---

## D-14 · `/send` composer keeps a floating Back puck the map-home mock never drew — APPROVED (2026-08-16)

**In effect.** `LJ home_empty` / `home_pins` (`explorations/journey/screens.jsx` `Home`) draw exactly two
things in the floating top row: the brand pill left, the account puck right. No back — correctly, because
that mock was drawn when the map composer WAS the app's root screen (the pre-`(tabs)` rootless composer,
see `app/(tabs)/_layout.tsx`'s own note).

The shipped app no longer works that way. `/send` sits **outside** the `(tabs)` group and is reached only
by `router.push` — from Home's Express tile, Orders, Account, History and Profile — so the tab bar is
hidden while it is up. Following "not drawn ⇒ not rendered" literally therefore ships a screen with **no
exit**: no tab bar, no header, no gesture affordance. Reported by the owner from a device (2026-08-16):
*"There is no nav button here for someone to go back."* Approved in the same instruction.

What ships is deliberately not invented chrome — it is the kit's **own** floating back, lifted from
`LJ addr_confirm` (`screens.jsx`:443–445), the other map-anchored screen in the same flow: a 40×40 round
`--bg` puck with `shadow-card`, holding an 18px `--ink` arrow, at the row's leading edge. That makes it
the same object as the account puck already opposite it, at the same size, elevation and vertical offset.
Two ports, both pre-existing in this repo: the arrow is a flipped `arrow-right` because the icon subset
carries no left-pointing glyph (`shell/AppBar` does the same for its back chevron, ledger D-08 covers the
subset), and the drawn 40px stays 40px with `hitSlop` making up the touch floor.

Pressing it pops when `router.canGoBack()`; a deep-link / notification cold start that makes `/send` the
first route lands on `/home` instead of dead-ending. The one knock-on the side-by-side shows is that the
brand pill starts one puck + `space.sm` further right than the mock draws it — the row is otherwise
unchanged (same puck size, elevation and top offset, account action still alone on the trailing edge).
The on-hold wall (`SendAccountOnHoldView`) is untouched — that mock is a deliberate blocking state that
carries its own exits.

**Retire this entry** if a future export redraws `LJ home_empty` as a pushed screen (with or without its
own back affordance); align to whatever it draws.

---

## D-15 · Customer account cluster adopts the RIDER account grammar — APPROVED (2026-08-16)

**In effect.** The two Account screens were built from two different mocks a design generation apart,
and looked it. The rider tab is `RJM.account` (`rider-one-app.jsx :: account`, the current one-app
language): `AppBar` → identity card (48px avatar disc · name 15.5/700 · one identity line 12.5 muted ·
a trailing status pill) → ONE card of `icon 18 · label 13.5/600 · sub 12 muted · chevron 16` rows. The
customer tab was `LJ.profile` (`screens.jsx :: Profile`, the older language): `Heading` + `Sub` → a
text-only details card → seven full-width stacked `Button`s across two cards → a "Sign out" ghost
button.

Owner instruction (2026-08-16), from a handset photo of both screens side by side: *"The account under
customer is visually different than the rider account .. lets harmonise the design to match the state
of the rider account."* Answering the clarifying questions, the owner chose: authorise via **this
ledger** (not by redrawing the mock — `packages/design/**` stays a mirror of the design tool, D-00);
adopt the **full** rider language; fill the rider's online/offline pill slot with **verification state
when relevant** and leave it empty for a plain customer; and cover the **whole customer account
cluster**.

**So the deviation is:** `LJ.profile` is superseded as the customer Account tab's target. The app no
longer aligns that screen to the older `Profile` mock — it aligns to the *rider* mock's grammar. Every
number in `apps/mobile/src/ui/account/AccountRows.tsx` is copied from the GENERATED
`app/rider/(tabs)/account.view.tsx`, which the codegen locks to `RJM.account`, so the design kit is
still the source of truth — just a different (newer) screen of it. When a future export redraws
`Profile` in the one-app language, delete this entry and align normally.

**What each screen did, and what limited it:**

| Screen | Disposition |
|---|---|
| `app/(tabs)/account.tsx` (customer Account tab) | **Fully adopted.** AppBar, identity card + KYC pill, one row card. The `Heading`/`Sub`, both action Buttons and the standalone "Sign out" Button are gone — the actions became rows, and sign-out is on Settings and `/profile`, exactly as the rider reaches it. |
| `app/profile/index.tsx` (details screen behind BOTH identity cards) | **Fully adopted**, same grammar. "Sign out" stays here as a danger row — the rider's documented route to it. |
| `app/settings/index.tsx` | **Grammar adopted, copy untouched.** Its rows now draw in the shared row component, but every string stays mock-verbatim: `Language`/`English` and `Payment`/`Cash` moved from a right-hand value into the sub-line slot, and rows the mock draws label-only stayed label-only. Its `PermissionRow` block is NOT harmonised — it aligns to its own drawn mock (SH11 `SettingsPerms`), so changing it would be drift. `LJ.settings_perms` / `LJ.settings_perms_ok` still pass. |
| `app/help/index.tsx`, `app/notifications/index.tsx` | **Not touched — nothing to harmonise.** Both are codegen-ADOPTED (generated `*.view.tsx` locked to their mocks by `structure-snapshot.spec.ts`) **and** both are already SHARED: the rider Account's rows route to `/notifications` and `/help`, the same routes the customer uses. There is no customer-vs-rider divergence to remove, and un-adopting a screen that currently matches its mock would be a regression. |
| `app/history/index.tsx` | **Not touched — same reason.** `/history` is the destination of the customer's "Trip history" row AND the rider's "Job history" row; it is one screen already. Its rows are money/status order cards, not settings rows, so the account row grammar does not apply to them. Its own divergence from `LJ.history` is unrelated and still tracked in `tools/parity/rendered-conformance.pending.json`. |

**Icon note.** The Settings row uses `shield`, not a settings/cog glyph: the design kit's 38-icon
subset (`packages/design/assets/lynia-icons.js`) has no such glyph, and that row's contents genuinely
are permissions, privacy and sign-out. No new icon was invented for this work.

---

## D-16 · RJM.account "Switch to customer" sixth row — APPROVED (2026-08-16)

**In effect.** The kit's `RJM.account` (`explorations/journey/rider-one-app.jsx`, `account`) draws an
identity Card and **five** settings rows: Bike & documents · Job history · Money · Notifications ·
Help & support. The app draws a **sixth**: `["shopping-bag", "Switch to customer", "Order food and send
parcels"]`.

**Why.** The rider→customer bridge has to live somewhere, and the mocks never drew it anywhere. Until
now it was a "Back to customer" ghost button in the **Jobs board footer** — a placement no RJM board
mock draws either (already flagged in `docs/parity/PHASE5-ridertabs.md` and in the `RJM.board_empty`
rendered-conformance note). The owner's instruction (2026-08-16, from a photo of the rider board):
*"remove the back to customer button as well. This must be under the Account Tab."* So the deviation
did not appear here — it **moved** here, out of a screen where it broke the board's element tree and
into the one screen whose whole design is a list of account-level destinations, where it costs one row.
The board's tree is now closer to the mock than before; this ledger entry is the net remainder.

**Scope of the deviation.** One entry in the `rows` array the container already feeds the generated
`RiderAccountView` — no structural edit, so `account.view.tsx` still matches the mock tree and the
structure snapshot is untouched. The label is **not** the old button's "Back to customer": a settings
row sitting under "Help & support" reads as a destination, so it takes the destination's name.

**What came with it.** The board's confirmation guard moved too — leaving the rider side while online
or mid-job still asks first ("You're online for deliveries" / "You have a job in progress"), because
switching unmounts the board socket + heartbeat and, with no active job, takes the rider offline
server-side. It is rendered as a bottom sheet (the `src/ui/safety.tsx` idiom), not as the board's old
inline Card. Pinned by `app/rider/(tabs)/__tests__/account.test.tsx`.

**Revisit when** a design export draws a rider→customer bridge. Adopt whatever it draws and delete this.

---

## D-17 · Rider top-up back row says "Money", not the kit's "Wallet" — APPROVED (2026-08-16)

**In effect, and small.** `rider-screens-wallet.jsx:111` draws a back row above the Top-up heading: a
13px/600 `--muted` label with a 17px chevron 2px to its left, 12px below the row. The **intended**
output is `‹ Wallet`; the source currently reads `\u2039 Wallet` because the escape sits in a JSX text
node and is never interpreted, so the mock renders that literally — a kit defect logged separately as
**D-20**, not a copy the app should reproduce. This entry is about the label word; D-20 is about the
glyph. The
app had dropped that row entirely, which is what left the top-up ENTRY state with no exit at all
(`TopUpFlow` only offers "Back to Money" once a request is pending/succeeded/failed). Restoring it is
not a deviation — it is the app paying back plain drift, and the geometry is adopted verbatim.

The **label** is the deviation, and it is one word. The kit's destination "Wallet" is `RJ wallet`, a
**retired** screen id (`gallery-map.js` header: *"RJ wallet — replaced by the merged Money tab (RJM
money)"*). The rider IA that ships is RJM — Jobs · Money · Account — and `RIDER_TABS` labels that tab
"Money". Sending a rider "back to Wallet" would name a screen the app does not have, so the row
follows the tab the rider actually lands on. This is the same standing rule that governs the rest of
the rider surface (CLAUDE.md: *align rider look/IA to RJM, not to the kit*; *never align to a retired
screen*), recorded here because it is a copy change and copy changes need a ledger line first.

`RJ topup_amount` itself is **current**, not retired — it is in the gallery at band R·, so the screen
is a live alignment target and the rest of it is unchanged.

**Retire this entry** when an export redraws the top-up screen with RJM's own back label.

---

## D-18 · Pushed food screens keep a back the standalone-board mocks never drew — APPROVED (2026-08-16)

**In effect.** The generalisation of D-14, found by a navigation-blocker audit (`/design-review`,
2026-08-16) after the `/send` fix showed the shape. Both stacks run `headerShown: false`
(`app/_layout.tsx:87`, `app/food/_layout.tsx:10`), so **the only way off a pushed screen is one the
screen draws itself**. Most kit screens are drawn as standalone boards — the screen as if it were the
only thing on the phone — so "the mock draws no back" is not evidence that the shipped, pushed version
needs none. Two food surfaces were taken literally and shipped as dead ends:

**`/food/order/[orderId]` — the shared `OrderHeader` gains a back chevron.** The kit's `OrderHead`
(`r-customer-b.jsx:10`) is restaurant name + status pill. The app matched it faithfully across every
state, and the screen is pushed from the Orders tab (`app/(tabs)/orders.tsx:162`), so **eight of its
twelve state views had no exit of any kind**: awaiting-accept, item-approval, preparing,
ready-for-pickup, live-tracker, rider-dropped, refund-pending, and the safety-net fallback whose own
comment claims it exists so the screen "never dead-ends". The back lives in the shared header rather
than in eight views, so no future state can be added without it. The four views that already had an
exit are untouched, including the pay screen's own `AppBar`, whose back deliberately un-forces the pay
view rather than popping the order (see its note).

**`/food/search` — a back-only `AppBar`.** `RC.search` (`r-customer-a.jsx:155`) draws a search field
whose only control is a clear-x. The app shipped exactly that, pushed from `food/index.tsx:83`, with
the `x` labelled "Clear search" and wired to clear the query — no dismiss. The bar is mounted
**title-less**: the mock draws no header text, and adding a "Search" heading would trade one drift for
another. Every sibling food screen (`index`, `[id]`, `cart`, `checkout`) already carries an `AppBar`,
and the kit itself draws one on `RC.list_empty`, `RC.list_error` and `RCB.pay_failed` — search was the
odd one out, not the rule.

Both use the flipped-`chevron-right` glyph and wrapper-View rotation established by `shell/AppBar` and
D-14 (`react-native-web` drops a transform set on the glyph itself), and both fall back to a sensible
route when there is no stack to pop — `/orders` and `/food` — so a push notification or deep link
cannot strand anyone either.

**Retire this entry** if an export redraws these screens as pushed, with their own back affordances.
Adopt whatever it draws.

---

## D-19 · Parcel-order screen gains back chrome; the on-hold wall gets its drawn "Sign out" back — APPROVED (2026-08-16)

**In effect.** The remaining two findings of the 2026-08-16 navigation audit. Same root cause as D-14
and D-18: `headerShown: false` on both stacks means a pushed screen's only exit is one it draws.

**`/order/[id]` — a title-less `AppBar` above the heading.** Unlike the food cases this screen was not
a total dead end: `Button label="Back home"` has always been there. It sits at the **bottom**, though,
below the hand-off code card, the auction/rebroadcast cards, the cancel-confirm block, `GetHelpControl`
and `ReportControl` — so on a live order the way out is a long scroll away. The error branches
(`:607`, `:616`) place the same button near the top, which made the worst case the *normal* case. The
bar is title-less because `LJ.track_active` draws its own "Order 8f3a91c2" heading and a bar title
would duplicate it; "Back home" stays where it is, since it clears the stack rather than popping and
is the right control at the end of a finished order.

**The customer on-hold wall — restoring the mock's own "Sign out".** This one is drift, not a new
affordance: the kit's `OnHold` (`screens.jsx:852`) draws a "Sign out" ghost button under the support
call row and the app had dropped it. That omission is what made the wall a true dead end — `/send` is
pushed so no tab bar shows; `app/send.tsx` returns `SendAccountOnHoldView` **before** the map top bar
renders, so D-14's back puck never mounts for a held customer; and the manual "Refresh status" was
removed on 2026-08-16, leaving a phone number as the only interactive thing on screen.

**Superseded by D-21 (2026-08-16, same day).** This entry originally recorded that a held customer had
no *non-destructive* way back — signing out or calling support being the mock's whole exit set — and
left the question open for the owner. The owner took it: see **D-21**, which adds the plain back. The
reasoning for leaving it out is kept here only so the reversal is legible, not as live guidance.

**Retire this entry** if an export redraws the tracking screen or the on-hold wall with their own
navigation.

---

## D-20 · Rider wallet mocks print `\u2039` as literal text — UPSTREAM (2026-08-16)

**A defect in the kit; the app is right.** `explorations/journey/rider-screens-wallet.jsx` writes the
back chevron as a JSX **text node**:

```jsx
<span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Wallet
```

A `\uXXXX` escape is only interpreted inside a JavaScript *string literal*. In JSX text it is six
literal characters, so the mock renders **`\u2039 Wallet`** instead of **`‹ Wallet`**. Three sites:
`:62` and `:85` (`‹ Earnings` on the wallet screens) and `:111` (`‹ Wallet` on top-up). Visible in any
`tools/parity` sheet that renders `RJ.topup_amount` — the mock column shows the raw escape.

**Not fixed here.** `packages/design/` mirrors the design tool; editing it is how the repo's copy
stopped being the design in the first place, and the `design-freeze` CI job blocks exactly that. The
app renders a real rotated chevron (D-17), which is what the mock *means*, so nothing is shipped
wrong — the only casualty is that parity sheets for these screens will keep showing an ugly mock
column until Design fixes the source.

**For Design:** the fix is `{"\u2039"}` (an expression container, where the escape is interpreted) or
simply pasting the `‹` character.

**Swept, so the scope is known rather than assumed.** `grep -rn '\\u[0-9a-fA-F]\{4\}' packages/design
--include=*.jsx` returns every escape in the package; all of them except these three sit inside string
literals (`"\u2212$"`, `"Tue 14:02 \u00b7 ref 8821"`, `screens.jsx:114`'s `btn("\u2212")`) and render
correctly. Lines 62, 85 and 111 of `rider-screens-wallet.jsx` are the only bare-JSX-text cases, so this
entry is complete, not a sample.

**Retire this entry** when an export lands with the escapes fixed.

---

## D-21 · The account-on-hold wall keeps a plain back — APPROVED (2026-08-16)

**In effect. Supersedes the "deliberately not done" paragraph of D-19**, decided by the owner the same
day it was raised. The `OnHold` mock (`screens.jsx:852`) draws an icon, a title, a message, a support
call row and a "Sign out" ghost button. It draws no back, and D-19 initially took that at face value:
the wall had *an* exit (D-19 restored the dropped "Sign out"), so it was no longer a dead end, and
widening a blocking state looked like a judgment call to leave to the owner.

**What changes the answer is what a hold actually gates.** `accountOnHold` is checked in exactly ONE
place in the whole app — `app/send.tsx` — and the server-side hold blocks only the composing of NEW
orders (`getSnapshot` / cancel / rating all still succeed for a held customer; see the note on
`SendAccountOnHoldView`'s `ActiveOrderBanner`). Home, Orders, Account, trip history, settings,
restaurant browsing and live order tracking all keep working. So the wall was never gating the app —
it was gating one pushed screen, and the customer's only ways off it were:

- **Sign out** — ends the session, so checking your own order history costs an SMS re-verification, or
- **the support call row** — leaves the app for the dialer.

A 24-hour ops review should not cost a customer their session. The back is a title-less `AppBar`, the
same primitive and the same guarded fallback (`canGoBack()` → pop, else `/home`) as D-18 and D-19 use
everywhere else on this surface, mounted above the banner so the wall's own content is untouched.
"Sign out" stays exactly where the mock draws it — it is still the right control for a customer who
wants off the account; the back is for the far commoner one who just wants the rest of the app.

**Not drawn ⇒ not rendered still holds everywhere else.** This is the sanctioned escape working as
designed: an undrawn affordance, raised as an open question, decided by the owner, recorded before it
shipped.

**Retire this entry** when an export redraws `LJ on_hold` with its own navigation — `LJ.on_hold` is
`PENDING` in `tools/parity/parity-status.mjs` (adopted, not yet wired to an app target), so there is no
rendered-conformance assertion on this screen to update in the meantime.

---

## D-22 · The Account cluster's cards sit 32px in, not the mock's 16px — APPROVED (2026-08-16)

**In effect.** `RJM.account` (`rider-one-app.jsx :: account`) draws its two cards inside a single
`Pad` — `padding: "10px 16px 16px"` — so on a 360px phone the identity card and the settings card are
**328px** wide, and their left edge lines up (within 4px) with the `AppBar` title above them. The app
draws them **296px** wide, inset **32px**: the generated view nests that `Pad` inside the app
`Screen`'s own `padding: tokens.space.screen`, and the kit's `AppScreen` — which `Screen` ports — adds
no horizontal padding of its own. The double inset has been live on the rider tab since RJM.account
was codegen-adopted.

**How it surfaced.** Owner instruction (2026-08-16), from two handset photos: *"The customer options
tab does not have same margins as the rider options cards.. Align the customer cards so they have the
same dimensions and design as the rider cards."* D-15 had already harmonised the row GRAMMAR (same
icon/label/sub/chevron geometry, from the same shared component) but not the screen-edge inset, so the
two tabs drew identical rows at two different widths — customer 328, rider 296.

**The decision.** Asked which side should move — the design says 16px, which is what the *customer*
was already drawing, so the mock-faithful fix was to widen the rider — the owner chose the other
direction: **match the rider's current look, both tabs at 32px.** So this entry records a deviation
the app now makes deliberately on **both** Account tabs rather than accidentally on one:

| | Mock `RJM.account` | App (both tabs) |
|---|---|---|
| Card inset | 16px (one `Pad`) | **32px** (`Screen` 16 + `Pad` 16) |
| Card width @360 | 328px | **296px** |
| Card width @320 (entry phone) | 288px | **256px** |

**Scope — the two Account tabs only** (owner's answer to the scope question). `app/(tabs)/account.tsx`
now nests the same `Pad`-equivalent body wrapper the generated `app/rider/(tabs)/account.view.tsx`
carries, so both are `Screen` → `AppBar` → `Pad(padding: space.screen, paddingTop: 0)` → cards. The
same `Screen`-plus-`Pad` double inset exists on `RC.cart_empty`; it is **out of scope here and
unchanged**, and is NOT covered by this entry — if it is ever aligned, it aligns to the mock's 16px.

**What is NOT deviating.** Every value inside the cards still comes from the kit and is still asserted:
the shared row component (`apps/mobile/src/ui/account/AccountRows.tsx`) mirrors the generated rider
view number-for-number, and `app/(tabs)/__tests__/account-harmony.test.tsx` fails if either the row
geometry or the screen-edge inset splits the two tabs again. The `AppBar` title inset stays at the
app's 16px (the mock draws 12px) — untouched, pre-existing, and app-wide rather than specific to this
cluster.

**Scroll came with it.** The kit's `AppScreen` body is `{ flex: 1, minHeight: 0, overflowY: "auto" }`
— every mock screen scrolls when its content outgrows the phone. The app's `Screen` did not, so the
customer tab had bolted its own `ScrollView` around just the row list and the rider tab could clip its
last row on the 320×640 entry phone. `Screen` now takes an opt-in `scroll` prop that ports the kit's
scrolling body, the codegen's `S()`→`<Screen>` lowering emits it (which is why the rider view changed
by exactly one prop), and both tabs use it. This is a port of kit behaviour, not a deviation from it.

**Retire this entry** by widening both tabs back to a single 16px inset — a one-line change on each
side once the owner wants the mock's card width. Nothing else depends on 32px.
