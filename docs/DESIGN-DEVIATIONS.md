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

**Currently live deviations: D-03, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-21, D-22, D-23, D-24, D-25, D-26, D-27, D-28, D-29.** D-20 is an UPSTREAM kit defect (no app-side effect). D-01 and D-02 were
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

> **Amended the same day by D-22.** This entry settled how the two Account screens LOOK; D-22 settles
> what each one CONTAINS, and supersedes two things here. (1) The verification-pill decision above is
> withdrawn for the customer TAB: "when relevant" only ever resolved to "this account is also a
> rider", which is the role bleed D-22 exists to remove — the pill now renders on the rider tab and on
> `/profile?side=rider`, never on the customer hub. (2) The per-screen dispositions in the table below
> describe the row sets as they stood before the role split; the current sets are in D-22. Everything
> else here — the grammar, the geometry mirroring, and `LJ.profile` being a superseded target — stands
> unchanged and is still what `account-harmony.test.tsx` pins.

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
| `app/profile/index.tsx` (details screen behind BOTH identity cards) | **Fully adopted**, same grammar. "Sign out" stays here as a danger row — the rider's documented route to it. *(D-26 removed both identity-card taps, so this screen has no in-app entry point today; sign-out's live route is the Settings row.)* |
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

> **Amended by D-22 (same day).** The rider tab now draws **seven** rows, not six: D-22 adds a
> "Settings" row between "Help & support" and this one. "Switch to customer" is still the last row and
> still the only route-less entry in the container's index-aligned `routes` array, so the mechanism
> described here is unchanged — there is simply one more route ahead of it.

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

## D-22 · Account tabs are role-separated; both carry a Settings row — APPROVED (2026-08-16)

**In effect.** D-15 made the two Account screens look alike. It did not make them mean different
things, and by sharing the row set it actually spread each role's entries onto the other's screen.
Owner instruction (2026-08-16), after D-15 landed: *"Let's have a clear separation of what shows up
under account for a rider and customer. Review what's necessary under customers vs rider Account
Tab."* Answering the clarifying questions the owner chose: strict separation with **one bridge row**
per side; remove **both** duplicated customer rows; add a **Settings row to both tabs**; keep
`/profile` as a row list but make it role-correct, and make that role **context-aware** rather than
account-derived.

**The shape it settles.** The two tabs are mirror images — each side's own destinations, then the same
tail: `Help & support` · `Settings` · one bridge row to the other side.

| | Customer tab (`app/(tabs)/account.tsx`) | Rider tab (`app/rider/(tabs)/account.tsx`) |
|---|---|---|
| Own rows | — | Bike & documents · Job history · Money |
| Shared tail | Notifications · Help & support · Settings | Notifications · Help & support · Settings |
| Bridge | Switch to rider / Become a rider | Switch to customer (D-16) |
| Identity pill | none | Online/Offline (the mock's) |

**What came off the customer tab, and why none of it is a lost feature:**

- **Trip history** — the Orders tab already *"absorbs `app/history`'s content directly instead of
  bridging out to it"* (`app/(tabs)/orders.tsx`). The row was a second door onto a screen one tab away.
- **Send a parcel** — a TASK, not an account destination. Every other row on either tab is somewhere
  you go about your account; the composer is reached from Home and from the Orders empty state.
- **Bike & documents** — rider maintenance. Drawing it here put it on three screens at once and put
  rider state on the customer's hub.
- **The KYC pill** — verification is a rider fact. This withdraws that half of D-15 (see the amendment
  note there): "when relevant" only ever meant "this account is also a rider", which is the bleed.

**The deviation proper** is the **Settings row on the rider tab** — a seventh row where `RJM.account`
draws five and D-16 sanctioned a sixth. The mock draws no settings row at all and left the identity
card as the only way in, which put permissions, the privacy notice and account deletion two taps deep
for a rider, *behind a `/profile` whose rows were the customer's*. Privacy notice and Delete account
are Google Play listing REQUIREMENTS (`docs/PLAY-STORE-SUBMISSION.md` §4), not niceties. The customer
tab has carried a Settings row since D-15, so this also completes the mirror. Like D-16 it is one
entry in the `rows` array the container feeds the generated `RiderAccountView` — no structural edit,
so `account.view.tsx` still matches the mock tree and the structure snapshot is untouched.

**`/profile` takes its side from the CALLER.** `?side=rider|customer`, set by whichever tab owned the
tap, with the account's role as the fallback for arrivals that carry no side (deep links, push taps).
Keying off `me.role` — the obvious implementation — is indistinguishable from correct until a
dual-role user taps their name on the customer hub: their role is `"rider"` permanently, so they would
get the rider list on the customer side, reintroducing on that screen exactly the bleed this entry
removes from the tab above it. *(**D-26** removed the taps that set `?side`; the mechanism is intact
and correct for whatever entry point `/profile` is eventually given, but nothing sets the param today.)*

**Settings is role-independent again.** The rider-only "Bike & documents" swap is gone, so every row is
device, app or legal and both roles get the same screen. *(This paragraph originally led with the
mock's own "Edit profile" row as the proof; **D-26** removed that row on the owner's instruction. The
role-independence claim is unaffected — it was never about that row in particular.)*

**Pinned by** `app/(tabs)/__tests__/account-role-separation.test.tsx`, which asserts ABSENCE in both
directions for a dual-role account — the case a hand-check skips, because a plain customer's tab
looked correct throughout. Also `app/profile/__tests__/profile-screen.test.tsx` (side param) and the
Settings-row block in `app/rider/(tabs)/__tests__/account.test.tsx`.

**Revisit when** an export redraws either Account screen with its own role split. Adopt what it draws
and delete this.

---

## D-23 · `/profile` draws the national ID unmasked — APPROVED (2026-08-16) · DORMANT since D-26

> **Dormant, not retired (2026-08-17).** D-26 removed every in-app tap into `/profile`, and the ID line
> renders only there — so this deviation is still implemented and still guarded, but is not currently
> drawn anywhere a user can reach. Nothing here is withdrawn; it simply has no live surface until
> `/profile` is given an entry point or the ID line is given a drawn home elsewhere. If the owner
> decides it should not come back, retire this entry and reconsider the `idNumber` widening on
> `GET /auth/me` with it.

**In effect.** `LJ.profile` (`screens.jsx :: Profile`) draws the account's national ID **masked**,
paired with a tag: `ID 63•1234••••••42` `NOT VERIFIED`. The app draws the same line with the number in
full: `ID 63-123456-A-42`.

**Why.** Owner instruction (2026-08-16), deciding how `/profile` should earn its place once D-22 left
it carrying the same rows as the tab above it: *"Want it to display full ID and phone number since
this is user account."* It is the account owner reading their own record on their own authenticated
screen — the mask was protecting them from themselves.

**Scope — this is one line on one screen.** It renders on `/profile` only, never on a tab, and only
when the account has an ID at all (a customer can register name-only; the line is simply absent
otherwise). The paired verification tag is kept exactly as drawn, because it is the honest half: a
customer's ID is stored and never checked (*"Riders go through a separate ID check"*, registration
mock), so the number without the tag would imply a verification that never happened. A verified rider
gets the same pill in the affirmative — a state `LJ.profile`, a customer screen, never drew.

**What it cost on the API side, and the guard that came with it.** `GET /auth/me` now returns
`idNumber` decrypted in full (it is stored AES-256-GCM; the only other reader is the admin KYC
review). The `["me"]` query is on the disk-persistence allowlist (`src/query/persist.ts`), so without
a guard the plaintext ID would have been serialised into `rq-cache.json` and left there between
launches. It is stripped at serialize time by `redactBeforePersist` — memory-only, full stop. The file
is app-private and purged on sign-out, but shared handsets are common in this market (S1) and a
national ID is the one field in that payload whose exposure signing out does not undo. Cost: after a
cold start the ID line arrives with the first live `/auth/me` rather than with the warm paint.

**Phone** needed no deviation — `me.phone` was already the complete number; `/profile` now formats it
`+263 77 883 1938` (`formatPhoneDisplay`) instead of the local trunk form.

**Retire this entry** if an export redraws `Profile` with an unmasked ID (then it is alignment, not
deviation) — or if the owner reverses the call, in which case the masking belongs on the SERVER, not
in the component.

---

## D-24 · The Account cluster's cards sit 32px in, not the mock's 16px — APPROVED (2026-08-16)

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
icon/label/sub/chevron geometry, from the same shared component) and D-22 had settled WHICH rows each
side gets, but neither touched the screen-edge inset — so the two tabs drew the same row grammar at
two different card widths: customer 328, rider 296.

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
geometry or the screen-edge inset splits the two tabs again. This entry is orthogonal to D-22: that
one governs WHICH rows each side lists, this one only how far in the cards that hold them sit. The `AppBar` title inset stays at the
app's 16px (the mock draws 12px) — untouched, pre-existing, and app-wide rather than specific to this
cluster.

**Scroll came with it.** The kit's `AppScreen` body is `{ flex: 1, minHeight: 0, overflowY: "auto" }`
— every mock screen scrolls when its content outgrows the phone. The app's `Screen` did not, so the
customer tab had bolted its own `ScrollView` around just the row list and the rider tab could clip its
last row on the 320×640 entry phone. `Screen` now takes an opt-in `scroll` prop that ports the kit's
scrolling body, the codegen's `S()`→`<Screen>` lowering emits it (which is why the rider view changed
by exactly one prop), and both tabs use it. This is a port of kit behaviour, not a deviation from it.

**Retire this entry** by widening both tabs back to a single 16px inset. Nothing else depends on 32px,
but it is NOT a one-line edit per side — the rider half is machine-generated, so retiring it means:

1. `app/(tabs)/account.tsx` — drop the `Pad` body wrapper (the customer half; one edit).
2. The rider half comes from the CODEGEN, so **never hand-edit `app/rider/(tabs)/account.view.tsx`** —
   the next `gen-all` would put the 32px back. Its inner 16px is `PAD_BASE` in
   `tools/parity/codegen/transpile.mjs`, which every generated view shares, so the targeted lever is
   usually `Screen`'s own `padding: tokens.space.screen` (drop it for the `scroll` branch) rather than
   `PAD_BASE`. Change the source, then `node tools/parity/codegen/cli.mjs gen RJM.account`.
3. `app/(tabs)/__tests__/account-harmony.test.tsx` — the geometry half asserts the combined inset is
   `tokens.space.screen * 2`; it is meant to fail here, so update it to the new value in the same PR.

Then re-run the guardrails: `structure-snapshot` proves the regenerated view still matches the mock.

---

## D-25 · Settings adopts the Account-tab card design; permissions move inside the card — APPROVED (2026-08-16)

> **Amended by D-26 (2026-08-17).** The "no dead taps" half below resolved the `Coming soon` problem by
> routing **Edit profile** and the **identity card** into `/profile`. The owner has since chosen the
> other resolution: *"Remove the edit profile for now.. Don't even put coming soon. Also when I click
> the profile under accounts it must not be clickable to display another window."* So the row is gone
> entirely and the identity card is inert — see D-26. Everything else in this entry (one card,
> permissions inside it, the dropped header and paragraph, the right-hand values, the 32px inset,
> Language/Payment as detail screens) stands unchanged.

**In effect.** `app/settings/index.tsx` now draws the Account cluster's shape — identity card, then
**one** `AccountRowList` card holding every row — at the Account tabs' 32px inset (D-24). The two
`Settings` mocks (`screens.jsx :: Settings` and `screens-shipped.jsx :: SettingsPerms`, SH11) draw the
screen with **no cards at all**: bare rows on the page, separated by hairlines, with the permissions
under their own all-caps section header and a framing paragraph beneath them. That is the divergence
this entry sanctions.

**How it surfaced.** Owner instruction (2026-08-16), from a handset photo of Settings beside the
Account tab: *"The settings page should have the same card design and dimensions as the Account Tab.
Remove the 'edit profile coming soon' statement. These must be viewable. Permissions must fall under
the same card and not be separate."* Followed by the owner's answers to four scoping questions — one
card for everything; the permission VALUE stays on the right; header and paragraph both dropped; and
*"if u click the tab with name it must open for viewing the details for editing.. Editing is locked
for now and no need to display that."*

**What changed.**

| | Mock (`Settings` / `SettingsPerms`) | App (this entry) |
|---|---|---|
| Container | no card — bare rows on the page | identity card + **one** row card |
| Card inset | n/a | **32px** (`Screen` 16 + `Pad` 16), matching D-24 |
| Permissions | own section: header · rows · paragraph | rows **inside** the one card |
| `PERMISSIONS — READ FROM YOUR PHONE` | drawn | **not rendered** |
| `These show your phone's real settings…` | drawn | **not rendered** |
| Edit profile | row, no value | ~~row, no value, **opens `/profile`**~~ → **not rendered** (D-26) |
| Row value (`On` · `English` · `Cash`) | right-aligned, before the chevron | **unchanged** — right-aligned |

**Why the two dropped strings are not a copy loss.** Both existed to frame a *separate section*. Once
the rows sit in the same card as everything else there is no section for a header to name, and the
paragraph's claim ("these are your phone's real settings") is made by the rows themselves: each reads
the live OS permission, taps through to Android settings, and a **denied** permission still spells out
its consequence inline — `You won't hear when a rider offers or when your parcel arrives. Open system
settings` — which is the one piece of that framing that carries information rather than decoration.
Recorded as `undrawn` entries against `tools/parity/expected/LJ.settings_perms{,_ok}.json` so the
rendered-conformance guardrail accounts for them by name rather than by silence.

**"These must be viewable" — no dead taps.** Every row on Settings now opens something:

- ~~**Edit profile** and the **identity card** → `/profile`, the account record (name, phone, national
  ID + its verification tag). This is the "details for editing"; editing itself is still unbuilt, and
  per the owner the screen does **not** say so — hence `Coming soon` is gone, and `docs/KNOWN_BUGS.md`
  PXR-05 (which tracked that string) is resolved by this entry rather than by a profile-edit
  endpoint.~~ **Superseded by D-26**: the row is removed and the identity card is inert. `Coming soon`
  stays gone and PXR-05 stays resolved — by removal of the row rather than by a route off it.
- **Language** → `app/settings/language.tsx`, and **Payment** → `app/settings/payment.tsx`. Both are
  **undrawn by the kit** — the mocks draw the settings ROW but nothing behind it — so they are covered
  here too. Each is the same card grammar, so a screen pushed from that card doesn't change shape
  under the user. Payment states the app's real behaviour rather than restating "Cash": parcels are
  cash to the rider at the agreed price, food is cash at the door **or** mobile money at checkout
  (`app/food/checkout.tsx` draws both, ungated) — a screen that said only "Cash" would contradict the
  checkout one tab away.

**What is NOT deviating.** Every value inside the card still comes from the kit: the rows are the
shared `AccountRowList` grammar, which mirrors the generated rider view number-for-number
(`app/(tabs)/__tests__/account-harmony.test.tsx` still gates that). The row VALUES are the mock's own
strings in the mock's own right-hand slot — the `value`/`warn`/`consequence` slots added to
`AccountRow` exist precisely so the move into the card did not have to restyle them into sub-lines.
This entry is orthogonal to D-15 (row grammar) and D-22 (which rows each Account tab lists); it is the
sibling of D-24, which set the inset this screen now shares.

**Guarded by** `app/settings/__tests__/settings-card.test.tsx`: one row card (a second is the old
split returning), every row inside it, the inset measured equal to the Account tab's, no `Coming soon`
and no handler-less row. `app/settings/__tests__/permissions-section.test.tsx` keeps what the
permission rows SAY and asserts the two dropped strings stay dropped. Since D-26,
`app/settings/__tests__/identity-card-inert.test.tsx` owns the negative half (no Edit-profile row, no
tappable identity card).

**Retire this entry** if an export redraws Settings in the card language (then align to it and delete
this), or if the owner reverses the merge — in which case the permission rows go back to their own
section, the header and paragraph come back, and the two `undrawn` entries come out of the expected
JSONs. Language/Payment becoming drawn screens would retire only that half.

---

## D-26 · Settings drops the mock's "Edit profile" row; the identity card opens nothing — APPROVED (2026-08-17)

**In effect.** Owner instruction (2026-08-17): *"On profile.. Remove the edit profile for now.. Don't
even put coming soon. Also when I click the profile under accounts it must not be clickable to display
another window for both rider and customer sides."*

Two halves, and only the first is a deviation.

**Half 1 — the "Edit profile" row is gone (DEVIATION).** `screens.jsx :: Settings` draws
`Row icon="user" label="Edit profile"` as the first row of the settings list. `app/settings/index.tsx`
no longer draws it in any form: not with a `Coming soon` value, not as a disabled-looking row, not as a
row that opens a read-only record. Profile editing is unbuilt and the screen now says nothing about it
at all. Recorded as an `undrawn` entry against `tools/parity/expected/LJ.settings.json`, so the
rendered-conformance guardrail accounts for it by name rather than by silence.

> This reverses one line of **D-25**, which had removed the `Coming soon` string by routing the row to
> `/profile` instead ("no dead taps — every row opens something viewable"). The owner has now chosen
> the other resolution of the same problem: no row. Everything else D-25 settled — one card,
> permissions inside it, the dropped section header and paragraph, the right-hand values, the 32px
> inset — is unchanged.

**Half 2 — the identity card is inert (ALIGNMENT, not a deviation).** Three screens draw the
identity card, and all three used to wrap it in a `Pressable` opening the account-record window:

| Screen | Was | Now |
|---|---|---|
| `app/(tabs)/account.tsx` (customer tab) | `→ /profile?side=customer` | inert |
| `app/rider/(tabs)/account.tsx` (rider tab) | `→ /profile?side=rider` | inert |
| `app/settings/index.tsx` | `→ /profile` | inert |

Every mock draws that card as a plain `Card` — `rider-one-app.jsx :: account` and `screens.jsx ::
Settings` both draw identity as *information*, never as a control. So removing the tap moves all three
screens **towards** the kit; there is nothing here to sanction. On the rider tab the wrap was added by
the codegen bind (`tools/parity/codegen/adopted.mjs`, `RJM.account`), so it was removed there and the
view regenerated — `account.view.tsx` now has no `onIdentityPress` prop at all, and the structural
snapshot is closer to the mock than it was, not further.

`AccountIdentityCard` (`src/ui/account/AccountRows.tsx`) **no longer accepts an `onPress`**. Removing
the capability rather than the three call sites is deliberate: the tap cannot come back one screen at
a time, and the customer/rider "both sides" half of the instruction is then true by construction
rather than by each screen remembering.

**What this leaves reachable.** Nothing is stranded. Sign out, permissions, language, payment, the
privacy notice and account deletion are all on **Settings**, which both Account tabs list as a row
(D-22 put it on the rider tab for exactly this reason). Notifications and Help & support are rows on
both tabs. The rider's Bike & documents, Job history and Money are rows on the rider tab.

**What this leaves UNREACHABLE, stated plainly.** `app/profile/index.tsx` — the account-record screen
— now has **no in-app entry point**; it is reachable only by an explicit `/profile` deep link. The file
is kept rather than deleted, because the instruction was scoped to the taps and said *"for now"*. The
one thing that renders **only** there is `AccountIdLine`, the unmasked national ID of **D-23** — so
D-23 is dormant in practice: still implemented, still guarded, currently not drawn anywhere a user can
reach. If that display matters it needs a drawn home of its own, not the tap back; if it does not,
D-23 should be retired and the `idNumber` widening on `GET /auth/me` reconsidered with it. Flagged
here rather than decided, because both are the owner's call.

**Guarded by** `app/settings/__tests__/identity-card-inert.test.tsx` — a negative suite over all three
screens: the identity card has no pressable ancestor, no handler on any of the three routes to
`/profile`, and Settings renders neither `Edit profile` nor `Coming soon`. **The suite was verified to
FAIL without each half of the fix, not merely to pass with it:** re-wrapping the shared card in a
`Pressable` failed the customer-tab and Settings cases, and restoring the codegen wrap and regenerating
the view failed the rider case (in this suite and in the rider account suite). Both experiments were
reverted. Also `app/rider/(tabs)/__tests__/account.test.tsx` (the rider card, on the real screen,
because the generated view carries its own copy) and `app/settings/__tests__/settings-card.test.tsx`
(the row set, minus Edit profile).

**Retire this entry** when profile editing is built — the row comes back, drawn as the mock draws it,
and the `undrawn` entry comes out of `LJ.settings.json`. Half 2 needs no retirement: it is alignment,
and an export would have to start drawing the identity card as a control to change it.

---

## D-27 · Notifications gains swipe-to-dismiss and an unread count on the Account row — APPROVED (2026-08-17)

**In effect.** Two additions to the notifications cluster that no mock draws:

1. **Swipe-to-dismiss** on the rows of `LJ notifications` (`app/notifications/notifications.view.tsx`).
2. **An unread count** in front of the Notifications row's sub-line on both Account screens —
   `3 new · One inbox for both services` (`src/query/use-notifications-unread.ts`,
   `notificationsRowSub`).

Both bend "not drawn ⇒ not rendered", which is why they are here.

**How it surfaced.** Owner instruction (2026-08-17): *"Let's streamline notifications tab. How long
should notifications stay. How should they disappear."* On the answer to the scoping question the owner
chose the fullest option — retention **must be 1 day**, and *"Everything incl. dismiss + badge"*, whose
option text stated plainly that those two need a ledger entry. This is that entry.

**What the mocks draw, and what the app now adds.**

| | Mock (`screens.jsx :: Notifications`, `rider-one-app.jsx :: notifications`) | App (this entry) |
|---|---|---|
| Row gesture | tap only (static mock; a gesture cannot be drawn) | tap **or** horizontal swipe to dismiss |
| Row element tree | icon disc · title · message · relative time · unread dot | **unchanged** — no node added or removed |
| Account row sub | `One inbox for both services` | `N new · One inbox for both services` when N > 0; **byte-identical at N = 0** |
| Bell badge / "Clear all" / filter tabs | not drawn | **still not rendered** — deliberately out of scope |

**Why this is the smallest possible bend.** Neither addition changes a drawn structure:

- The swipe is `PanResponder` handler props spread onto the row's **existing** `Pressable`, plus a
  `transform`/`opacity` on the **existing** row `View`. No wrapper element, no re-kinded node — so
  `apps/api/src/parity/structure-snapshot.spec.ts` (guardrail #4) stays green *by construction*, and a
  regeneration of the codegen view diffs only in the lines marked `STREAMLINE-01`. It also adds no
  dependency: `PanResponder` is React Native core, so there is no `react-native-gesture-handler` in the
  bundle and nothing for `docs/APP-SIZE.md` to absorb.
- The count is a **prefix**; the mock's string survives verbatim as the tail, and an account with
  nothing unread reads exactly as the kit draws it. The structural normalizer drops text, so the
  Account tab's own snapshot (`RJM.account`) is unaffected either way.

**Why not the alternatives.** A bell badge on the board AppBar and a "Clear all" action were both
considered and **rejected** for now: a badge would add a drawn node to a generated view (a real
structural deviation, not a text one), and with a one-day retention window and honest read state
"Clear all" solves a problem that ageing already solves an hour later. If either is wanted, it needs its
own entry — not this one.

**The retention half needs no deviation.** How long a row lives (now one day — see
`FEED_RETENTION_MS`) and what makes it unread (now a real `Profile.notificationsReadAt` watermark rather
than a "younger than 24h" proxy) are invisible to the mocks: the kit draws a row **with** and
**without** the unread dot and says nothing about either lifetime or read semantics. Same for the row
collapse — the mock's own sample data is already one status row and one offer row per order, so
collapsing moves the app *toward* the drawing, not away from it.

**Guarded by** `app/notifications/__tests__/index.test.tsx` (the read stamp fires on focus, a dismissal
is optimistic and posts the row's synthetic id, a failed write rolls back by refetching) and the
existing structural snapshot, which is what proves the row tree did not move.

**Retire this entry** if an export draws a dismissal affordance on the notification row (align to it and
delete this half) or an unread count on the Account row's Notifications entry (delete the other half).

---

## D-28 · Customer home 8c — the design-package sync, and the two sheets the export specifies but does not draw — APPROVED (2026-08-17)

**What arrived.** A new design-tool export, `Lynia_Design_System.zip → home-8c/`, marked
**SELECTED (2026-08-17)**: the redesigned customer home, lineage 2a → 7a/7b → 8a → 8b → **8c**. It
replaces the pre-8c home body wholesale — the accent-green `BrandHeader` block becomes a mint header
with a time-aware greeting and the **detected current location**, the 62px round-square icon tiles
become Chowdeck-scale sticker tiles with the label inside, the bordered live-order cards become a
single mint tracker pill, and the horizontal venues rail becomes a two-column "Popular near you"
grid. Zero box-shadows anywhere; gold only on the unread dot, the SOON chip, the ETA chip and stars.

**This entry exists because the work necessarily touches `packages/design/**`,** which the
reverse-drift freeze (`scripts/check-design-freeze.mjs`) gates. Nothing here is the app being
"fixed into" the design — it is the design package absorbing a new export, plus two surfaces the
export names but does not draw.

### 1 · The design-package sync (not a deviation — the record of what landed)

| Path | What |
|---|---|
| `packages/design/handoff/home-8c/` | the export, **verbatim** (pixel reference `home-8c.html`, the work order, the three sticker SVGs, the placeholder venue photos, the Lucide subset) |
| `packages/design/assets/service-icons/{send,food,pharmacy}.svg` | the canonical copies the export's own README specifies |
| `packages/design/ui_kits/mobile/home-8c.html` | the DS card the export's README names |
| `packages/design/explorations/home-redesign/home-8c.jsx` | the gallery-renderable transcription (four named members: `HomeHeader` · `ServiceTiles` · `LiveOrderCard` · `RestaurantCard`) |
| `packages/design/explorations/restaurants/r-customer-a.jsx` | `RC.home` now renders 8c; the pre-8c `HomeBody` survives **unreferenced**, as the lineage record only |
| `packages/design/tokens/colors.css` | six values 8c introduces: `--highlight-chip-ink` and the five `--tile-*` service-tile tints |
| `packages/design/explorations/journey/gallery-map.js` | header note retiring the pre-8c home body. **No tile changed**, so `tools/parity/screens.generated.json` regenerates byte-identical — `RC home` keeps its id, title, tag and badge |

**Never align to the pre-8c body.** It is retired the same way `LJ home_launcher` is: still on disk,
never a target.

**`LJ home_flag_off` still draws the pre-8c body**, and that is correct for now — the 8c wave shipped
no flag-off mock, so there is nothing to align that screen to. It stays ⬜ until one is exported. The
app's flag-off path is not left inconsistent: with the restaurants kill switch off, the Restaurants
tile takes the same SOON treatment Pharmacy carries (chip + notify-me sheet), so the grid never
reflows and the tile is never inert.

### 2 · Two undrawn surfaces the export REQUIRES — APPROVED

The export specifies both by name and says what they must do, but designs neither:

- **The location sheet.** README §1: *"Tap → address/location sheet."* Built as
  `src/ui/home/LocationSheet.tsx` from parts that already exist — `DisclaimerSheet`'s modal grammar
  and the send composer's `AddressSearch` — offering exactly the three things a *detected* value
  needs: re-detect ("Use my current location"), the saved Home/Work slots, and a free address search.
- **The notify-me sheet.** README §2: *"tap opens the notify-me sheet — never dead."* Built as
  `src/ui/home/ServiceSoonSheet.tsx`, a REVERSIBLE toggle (the `RemindWhenOpen` precedent: the second
  most likely thing a customer does after asking is change their mind). There is no pharmacy backend,
  so the intent is recorded on-device (`logic/service-interest.ts`) and the notification permission is
  asked for at the same moment — which is the part that has to be true before any launch notification
  can arrive. When the vertical gets a backend this becomes the local half of a sync; the call site
  does not change.

Both are deliberately plain, so a future mock has nothing to undo. **Retire this half** the moment an
export draws either sheet.

### 3 · Two per-string escapes on the rendered-conformance lane

Recorded in `tools/parity/expected/RC.home.json` as `dynamic` (the element must exist; the value is
live), not as sanctioned drift:

- **The greeting.** A static mock can only draw one half of the day; the app's greeting is
  time-aware *by the export's own instruction*, so the string is asserted by regex
  (`^Good (morning|afternoon|evening), Rudo$`).
- **`$1.00` delivery fee.** The mock draws sample fees; the app computes the real one with the same
  `haversineKm → deliveryFeeForDistance` path the server charges with, and
  `RESTAURANTS_PRICING.deliveryFeeMin` is **$1.50** — so $1.00 is below the shipped floor and no
  honest fixture can produce it. Quoting the drawn figure would mean showing a fee the customer would
  not be charged.

The rest of the mock's copy is asserted **verbatim**, and the fixture (`tools/parity/mobile/fixtures/
food_home.mjs`) was restaged to the mock's own sample data — venue distances chosen so the app's own
ETA arithmetic reproduces the drawn 25/30 min rather than the fixture asserting numbers the screen
does not compute.

### 4 · Two owner-directed departures from the drawn header (2026-08-17)

Both are **explicit owner instructions**, given after seeing the first side-by-side sheet, and both
change drawn geometry — so they are logged here rather than defended in a comment.

- **The greeting always breaks over two lines** — the phrase on top, the name beneath
  (`logic/greeting.ts`). The mock's COPY is untouched ("Good morning, Rudo"); what changes is where
  it breaks. The reference wraps it only incidentally: the greeting column is ~216px wide, so
  "Good morning, Rudo" happens to need two lines while "Good evening, Rudo" fits on one — meaning the
  drawn header would change height with the time of day. An explicit newline makes the break
  deliberate and the header a stable size. The newline lives inside ONE text node, so the
  rendered-conformance lane (which whitespace-normalizes) still sees the mock's string verbatim.
- **The time-of-day sticker is 42px, not the drawn 46px**, and sits in a row with the bell so the two
  share a vertical centre — *"the icon for sun or moon must be same diameter or size as the
  notifications icon and aligned with the notifications icon to look good."* Both now size off one
  `BELL_SIZE` constant, so they cannot drift apart.

**Everything else in the header keeps the drawn geometry.** Tile and card boxes were measured against
the mock in the same browser and are identical — tiles **104×84**, venue cards **159×126**, the tile
row **360×98**, the venue grid **360×262**, the tracker pill **328×54**. Three text line-boxes were
pinned to Inter's own 1.21 ratio (the section header, and the two ETA chips) because React Native's
default line box is ~2px shorter than the browser's and left those blocks short.

One residual, not a choice: the gold ETA chip is ~6px narrower than drawn because the mock's page has
a true Inter 800 while the app ships only 400/600/700 and aliases 800 → 700 (`tokens.font.weight`).
Fixing it would mean adding a font weight to the bundle.

### What is NOT deviating

The address row is the **detected current location** (`logic/home-location.ts`), not a saved profile
address — the export is explicit, and the pre-8c hardcoded "Harare" is gone. The rider name on the
tracker pill is the mock's drawn `"Tendai M."` whenever the app knows it; where it does not (the
active-orders API carries a rider's `profileId` and GPS but no name, and the on-device identity cache
holds one order), the pill falls back to honest service copy inside the same drawn structure. The
mock's second card line, the pre-8c payment/delivery-code meta, is **not drawn by 8c and therefore
not rendered** — the tracker screen owns it.

---

## D-29 · The rider board adopts the 8c mint header — APPROVED (2026-08-17)

**Owner instruction, this session:** *"Let's implement the same design language for the Rider home
page.. I want the Top card, the greeting and notifications icon there... Remove the search bar."*

The 8c export designs the CUSTOMER home only. There is no rider mock in that language, so this is a
deliberate extension of it rather than an alignment — hence a ledger entry, not a parity claim.

**What changed on `RJM board` (`app/rider/(tabs)/index.tsx`):**

| | RJM mock / shipped | Now |
|---|---|---|
| Header | plain white bar: `Heading` "Jobs near you" + a bell, with a green `BrandHeader` on the gated/offline path | the **8c mint top card** — two-line time-aware greeting, sun/moon sticker paired to the 42px bell (gold unread dot), on BOTH paths |
| Search bar | not drawn | **still not drawn** — omitted by instruction, and `HomeHeader.search` is optional precisely so a face with nothing to search renders none |
| Location | not drawn | the header's **`subRow`** — the DETECTED current location, the same `HomeAddressRow` the customer home draws, in **detect** mode (*"keep the location on the rider card just like the customer home"*, then *"Detect only"*) |
| Connectivity banner | first element on the screen | **still first** — pinned into the header's `topSlot`, inside the mint block above the greeting, so it keeps the top of the screen (*"keep it at the top like before"*) while the header stays the one component owning the top inset |
| Shift state | an `OnlinePill` row in the list header (status pill · queue subtitle · "Go offline"), plus a go-online Card on the offline path | **gone entirely** — no pill, no switch. The rider is ALWAYS ONLINE (*"you are always online"*) |
| "Jobs near you" | the screen's `Heading` | **removed** (*"Remove the text jobs near you"*) |
| "Parcels and food · one queue" | beside the online pill | **removed** (*"And the parcels and food one home text as well"*) |
| Job cards | `JobCard` list | **unchanged** |

**Why the two labels came off.** The greeting names the screen, the tab bar names the tab, and the
cards are self-evidently the jobs — a heading over the only content on a screen labels the obvious.
The queue composition was a build-time fact about dispatch, not something a rider acts on.

**Why the rider's location row is DETECT-ONLY.** Two location paths feed a rider, and neither reads
this row: the board fetches with `getOpenOrders(loc, 5000)`, where `loc` is the live GPS fix the
screen requests for itself, and the server targets new-job pushes off the heartbeat position
(`broadcastToNearbyRiders`). A picker here would therefore have promised something it could not do —
a rider choosing "Borrowdale" would have re-labelled the row while the list underneath kept showing
Avondale parcels, with nothing to explain why. Wiring the pick into the list query alone would only
have moved the mismatch (the list would say Borrowdale while the server kept pushing Avondale), and
jobs are proximity-ranked for a physical reason: the rider has to ride there.

So `HomeAddressRow` grew a `mode`: `"pick"` (customer — a chevron, opening the sheet, where choosing
an address really does re-sort the venues and re-price delivery) and `"detect"` (rider — a refresh
glyph, tapping re-detects, no sheet mounted). **The trailing glyph is the promise the row makes**;
give this row a picker only on a screen where picking changes something. Owner decision 2026-08-17.

Making the rider's location genuinely selectable — "I'm heading across town, show me work there" — is
a real feature and a server-side change (list query *and* heartbeat targeting). It is not claimed here.

**Why the whole tab, not just the happy path.** The board has two returns — the virtualized open-orders
list and the gated/offline fallback (KYC, expired ID, no-GPS, offline). Both now mount the same header,
so a rider crossing between a live board and a wall never sees the tab's identity change underneath
them. The walls keep their own recovery actions — but NONE of them carries a shift control any more,
including the no-GPS wall, which was the last place in the app still drawing "Go offline".

**Always online — what replaced the switch.** `online` stopped being user state and became machine
state: being on this screen, past every wall, IS the shift. The app asserts `setOnline(true)` to the
server once the gates are clear, and the walls (KYC, expired ID, no-GPS, a server refusal) are what
hold a rider off — each of them re-arms the assertion for when it clears. Three details that are not
obvious and are easy to regress:

- **It waits for a position.** The server records a broadcast-eligible rider only `if (online &&
  location)`, so firing the instant the gates clear — before the cold GPS fix lands — would put a
  rider on shift *invisible to every broadcast* until the next 20s heartbeat carried a position. The
  effect waits for `loc`, or for `locHint` (the "no fix is coming" signal), and going online
  position-less is correct in that second case.
- **It is not gated on the local flag.** That flag is seeded optimistically from the warm cache, so
  skipping the call when it is already true would leave a locally-online / server-offline rider
  silently deaf to broadcasts — the exact failure MOB-BOOT-02 was about, in the other direction.
- **A response missing `online` counts as online.** The mutation now runs on every mount, so an older
  API or a proxy that ate the body would otherwise blank the board for a rider who is genuinely on
  shift. A real refusal arrives as a 403 and still lands on the gate wall.

**Four defects this shipped with, found in review and fixed in the follow-up** — recorded because
each is a trap the next always-online screen could fall into:

1. **A customer's manual address shown as the rider's location.** `useHomeLocation` restores a stored
   MANUAL pick and then stops detecting, and the slot is shared between the two faces — so a dual-role
   user who set a deliver-to on the customer home saw it on the rider board labelled as where they
   are, and a rider tapping refresh silently discarded that pick. The hook grew a `detectOnly` option:
   it still paints the stored label as a last-known, but never adopts a manual pick as this face's
   answer and never writes back.
2. **The no-fix warning became unreachable.** `locHint` does not block going online, so the live board
   renders while the rider has no position — and the one line explaining why the board may be empty
   lived in the offline toggle Card, a screen state that no longer exists. It is now rendered at the
   top of the board itself.
3. **The no-GPS wall kept a "Go offline" button.** Removing a control everywhere except one wall is
   worse than not removing it: it is the one screen still offering a switch the rest of the app says
   does not exist.
4. **A transient activation failure stranded the rider offline.** The auto-online effect consumes its
   ref on the attempt, so a single network blip at launch left a verified rider off-shift for the life
   of the screen. Now bounded-retried (3 attempts, 15s apart); a REFUSAL still goes straight to its
   wall and is never retried.

**The trade this makes, recorded honestly.** A rider can no longer stop receiving work from inside the
app; closing it is the only way off shift, which works because the server ages riders out on heartbeat
staleness (`heartbeatMaxAgeMsForPush`). The GPS heartbeat and the board socket also run for as long as
the screen is open. That is the owner's call and it is deliberate; it is written down here so the next
person to read this screen does not mistake it for an oversight.

**Guardrails are unaffected and stayed green.** `RJM.board`'s codegen adoption anchors ONE region — the
job list (`RiderBoardListView`) — which this does not touch, so the structural snapshot still reduces to
`SCREEN(REGION:list)` on both sides. `RJM.board` was already in `tools/parity/rendered-conformance.pending.json`
(the parity socket is inert, so the screen paints its reconnecting banner), so no copy assertion moves.

**Retire this entry** when an export draws the rider board in the 8c language — then it stops being an
extension and becomes an ordinary alignment target.

**Evidence:** before/after render at 360×720 from the same `rider_board` fixture, produced by the new
`tools/parity/old-vs-new.mjs` driver (the second lane beside `pair.mjs`: `pair` answers "does the app
match the mock?", this answers "what did this change do?" — the only question available for a screen
with no mock of its own).
