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
be reported back to Design) · **PROPOSED** (built in an open PR that waits on the owner's approval of its
screenshot sheet; it becomes APPROVED when the owner approves that PR, which doesn't merge before —
merchant web upgrade plan §10, OV-11).

**Currently live deviations: D-03, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-18, D-19, D-23, D-24, D-27, D-29, D-30, D-32, D-34, D-37, D-38, D-39, D-40, D-41, D-42, D-43, D-44, D-45, D-46, D-47, D-48, D-49, D-50, D-51, D-52, D-53, D-54, D-55, D-77, D-80, D-81.** D-81 is the customer web app for iPhone users (2026-10-06): the same customer screens in a browser at app.lyniago.com, with a few web-only differences. D-80 is Google Maps on the web (2026-10-06): the merchant web and the planned customer web app draw maps with Google, replacing D-48's OpenStreetMap. D-77 is Merchant v2 (2026-10-04): the owner's merchant-v2 handoff gives kitchens, shops and pharmacies one shell and one five-step order lifecycle, on top of D-48. D-55 is Calm Mint v2 (2026-10-01): the owner's calm-mint-v2 handoff becomes the authority for the customer Home, customer onboarding and the rider's first run; it retires D-28 for Home and moves `--highlight` to #FFD23F. D-54 is Rider v2 (2026-10-01): the owner's rider-v2 handoff becomes the authority for the rider app and for BOTH Account tabs and Settings; it retires D-15, D-16, D-17, D-22, D-25 and D-26. D-53 is the customer order screen redesign (2026-10-01, with its v2 round the same day): the owner's after-send handoff replaces the gallery's separate auction / tracking / delivered / failure screens with one screen — a full-bleed map and a sheet that follows the order's stage. D-52 is the Send a parcel redesign (2026-10-01): the owner's send-compose-v2 handoff replaces the gallery's one-sheet composer with four steps (Where · What · Price · Review), edits addresses inline on the map, and drops landmarks, declared value and the disclaimer; it retires D-14, D-21 and D-31. D-51 is merchant branches (2026-10-01): the branch switcher, Add a branch, and the not-live Orders home. D-50 is restaurant auto-accept (2026-09-30): for restaurants still taking orders by phone, orders skip the accept window and LyniaGo ops confirm them by phone before a rider is sent. D-49 is the terms & conditions page (2026-09-30): one set of terms for customers, riders and businesses, linked from Settings in the app and the merchant sign-in line. D-48 is the merchant mobile redesign (2026-09-30): its handoff replaces the RM tablet mocks as the merchant authority and retires D-43 to D-47 as each phase lands. D-43 to D-47 are the
merchant web upgrade (L1–L5: sign-up, Book a rider and the shop's shell, Your riders, Team, and the drawn
restaurant screens), approved by the owner with PR #986 (2026-09-29). D-42 is the lyniago.com marketing website: the design handoff shipped as-is, with four owner-decided launch items (2026-09-28). D-41 is the iPhone app shipping customer-only (2026-09-27). D-40 reopens D-01
(WhatsApp OTP copy again, now that Bird Verify can deliver over WhatsApp) on an explicit 2026-09-01 user
decision — the mocks were not re-exported as part of it, so it stands as a ledgered app-side divergence
until they are. D-39 was authored by
this session executing UIP-04, not a quoted owner instruction like the rest — flag it for explicit
confirmation rather than treating it as settled. D-33 was RETIRED on the day it was
opened — the mocks were redrawn without the browser step, so nothing diverges (its entry carries an
upstream-sync warning for the next design export). D-20 is an UPSTREAM kit defect (no app-side effect). D-01 and D-02 were
retired by the 2026-08-10 rev 2 export; D-04 was decided in the mock's favour; D-05 has no app-side
effect. D-10/D-11/D-12 are the food-cluster per-element dispositions (menu cover search glyph kept
non-interactive per Foundation-E · checkout live drop-off capture · cart upsell omitted).

---

## D-01 · WhatsApp OTP → SMS OTP — RETIRED by the rev 2 export (2026-08-10)

> **Reopened by D-40 (2026-09-01):** the app now shows WhatsApp OTP copy again (dynamically, per the
> actual delivery channel) — see D-40 below for what changed and why. This entry is kept for history.

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

## D-14 · `/send` composer keeps a floating Back puck the map-home mock never drew — RETIRED by D-52 (2026-10-01)

> **Retired.** The send-compose-v2 handoff (D-52) draws its own header with "‹ Back" on every step, so the floating puck and the map-home mock it compensated for are both gone.

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

> **RETIRED by D-54 (2026-10-01).** The Rider v2 handoff redraws both Account tabs and Settings; this entry is kept as history only.

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

> **RETIRED by D-54 (2026-10-01).** The Rider v2 handoff redraws both Account tabs and Settings; this entry is kept as history only.

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

> **RETIRED by D-54 (2026-10-01).** Rider v2 redraws Top up with the After Send header ("‹ Back") and a step bar; this entry is kept as history only.

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

## D-21 · The account-on-hold wall keeps a plain back — RETIRED by D-52 (2026-10-01)

> **Retired.** The handoff's state 17 (D-52) draws the hold wall with the Send header's Back and a "Back to home" button; the app follows it. D-19's "Sign out" on the hold wall goes with it (the handoff draws "Call support" / "Back to home").

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

> **RETIRED by D-54 (2026-10-01).** The Rider v2 handoff redraws both Account tabs and Settings; this entry is kept as history only.

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

> **RETIRED by D-54 (2026-10-01).** The Rider v2 handoff redraws both Account tabs and Settings; this entry is kept as history only.

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

> **RETIRED by D-54 (2026-10-01).** The Rider v2 handoff redraws both Account tabs and Settings; this entry is kept as history only.

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
`FEED_RETENTION_MS`; widened to seven days on 2026-10-02, D-66 §6) and what makes it unread (now a real `Profile.notificationsReadAt` watermark rather
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

## D-28 · Customer home 8c — the design-package sync, and the two sheets the export specifies but does not draw — RETIRED by D-55 (2026-10-01)

> **Retired.** The Calm Mint v2 handoff (D-55) replaces the 8c home and draws both sheets this entry built undrawn (the location sheet is H5, the notify-me sheet is `H.notify`). The 8c files stay in `packages/design/` as the lineage record; the rider board's 8c header (D-29) is unaffected.

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
| Shift state | an `OnlinePill` row in the list header (status pill · queue subtitle · "Go offline"), plus a go-online Card on the offline path | **status only, no control** (amended 2026-08-20 — see below). The rider is ALWAYS ONLINE (*"you are always online"*), so no switch and no go-online Card; but a dot + "Online"/"Reconnecting" row now sits at the mock's `OnlinePill` position |
| "Jobs near you" | the screen's `Heading` | **removed** (*"Remove the text jobs near you"*) |
| "Parcels and food · one queue" | beside the online pill | **removed** (*"And the parcels and food one home text as well"*) |
| Job cards | `JobCard` list | **unchanged** |

**Amendment 2026-08-20 — the status half came back, the control did not.** Owner asked to "bring
again the toggle". Resolved to **status only, no action**: the rider stays always-online, so there is
still nothing to toggle, but the board had no affirmative signal that a shift was live. The
reconnecting banner speaks only when something is wrong, so a healthy board said nothing at all, and
silence was doing double duty as both "online" and "broken".

`HomeStatusRow` (already built for this and sitting unmounted in `HomeHeader.tsx` since this entry
orphaned it) now renders at the mock's `OnlinePill` position — first in the list header, on the
open-board path only. A rider behind a wall is not online, so the walls draw nothing.

**It renders only while the connection is healthy**, which is exactly when the reconnecting banner is
absent — the two are never on screen together. The first cut drew the row in both states with the
label switching to "Reconnecting", and the parity render showed the banner's *"Reconnecting… your
data may be a moment behind"* with a second *"Reconnecting"* 120px beneath it. Same word twice is
noise, and the banner already says more about the failure than a dot can. Banner speaks when
something is wrong; row speaks when nothing is.

Still NOT drawn, and still deliberate: the "Go offline" action, the go-online Card on the offline
path, and the "one queue" subtitle. The remaining gap to the mock is therefore the *action*, not the
row. Retire this half of the entry if always-online is ever reversed — at which point the mock's
`OnlinePill` is simply correct and nothing here is a deviation.

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

---

## D-30 · The rider board's empty state drops the mock's ghost "Refresh"; the Money tab drops pull-to-refresh — APPROVED (2026-08-17)

**In effect.** Owner instruction, standing since 2026-08-16 and restated this session: **there is no
manual refreshing anywhere in the app.** The app notices on its own; the rider is never asked to ask.

`#755` applied that instruction and removed eight buttons — all of them labelled **"Refresh status"**.
Two manual-refresh affordances survived it, both because of how they were labelled rather than because
anyone decided to keep them:

| Where | What | Why it survived #755 |
|---|---|---|
| `app/rider/(tabs)/board-empty.view.tsx` | ghost **"Refresh"** button in the empty-board Card | labelled plain "Refresh", and in its own generated file — the sweep matched "Refresh status" |
| `app/rider/(tabs)/money.tsx` | **pull-to-refresh** (`RefreshControl`) | a gesture, not a button; nothing to grep for |

Both are gone. This entry sanctions the first (the mock draws it) and records the second (no mock does).

**Half 1 — the empty-state "Refresh" is undrawn (DEVIATION).** `rider-one-app.jsx :: board_empty`
draws `Card( EmptyState( ghost "Refresh" ) )`. The app now draws `Card( EmptyState )`. The Card wrapper
stays — that was the structural win the region was adopted for, and it is unaffected. Recorded as an
`undrawn` entry against `tools/parity/expected/RJM.board_empty.json`, so the rendered-conformance lane
accounts for the omission by name rather than by silence (the D-26 mechanism).

**Cost, stated plainly: `RJM.board_empty` is no longer codegen-adopted.** The app now draws one node
fewer than the mock, and the structural snapshot has no way to express that — `snapshot.mjs` compares
the RAW mock fragment against the committed view, and `normalize.mjs` has no skip/undrawn concept. The
choice was to withdraw the region or to teach the snapshot to tolerate a missing node. Withdrawing is
the honest one: a tolerance for missing nodes would have blinded **every** adopted screen, which is the
exact hole the RC.home drift shipped through. So `adopted.mjs` carries `RJM.board_empty` as defer-only
with its reason, `board-empty.view.tsx` becomes hand-maintained, and the deferral ratchet
(`tools/parity/codegen/deferral-baseline.json`) is bumped **76 → 77** with the bump recorded in the file.
That bump is a debt, not a settlement — reverse it the moment either escape opens.

**Half 2 — the Money tab drops pull-to-refresh (NOT a deviation).** No mock draws a pull-to-refresh;
it is an invisible gesture, so removing it moves nothing away from the kit. It is recorded here only
because it was load-bearing: `ALR-06` (`docs/KNOWN_BUGS.md`) added it when a support-credit — the only
working top-up path at launch — appeared not to land on an open wallet screen. Removing the gesture
without replacing what it did would have re-opened that P1, so it is replaced by two inputs, neither a
gesture:

- an **app-foreground re-read**, which catches a credit that landed while the phone was in a pocket —
  the exact case the gesture existed for, and the same input that replaced the "Refresh status" buttons;
- a **20s re-read while the tab is focused AND the last read failed**, so a stale balance self-heals
  while the rider is looking at it instead of waiting for them to leave the tab and come back. Gated on
  `isError` deliberately: a healthy balance already refreshes on focus and foreground, and polling it on
  a metered link would buy nothing.

The stale-balance cue changes with it — "showing your last known balance. **Pull down to try again**"
became "showing your last known balance. **It'll update by itself**", because the first sentence now
instructs the rider to perform a gesture that no longer exists.

**What is NOT touched.** Retries are not refreshes, and #755 already drew that line: "Try again" on the
KYC wall (`index.tsx`) and the online gate re-run a **decision server-side**; "Retry" on a failed
board/balance read re-runs a request the user is staring at the failure of; "Reload" on the root error
boundary is crash recovery. None of these are a rider being asked to check whether the app is current.

**Guarded by** `app/rider/(tabs)/__tests__/board-empty.view.test.tsx` (the view: Card kept, message
renders, no "Refresh" label and **no pressable node at all** — so re-adding the affordance under any
other label still fails) and `app/rider/(tabs)/__tests__/index.test.tsx` (the same absence on the real
screen, where the button actually shipped). **Both were verified to FAIL with the button restored, not
merely to pass without it:** re-adding it to the view reddened both suites; the experiment was reverted.

**Retire this entry** when an export redraws `board_empty` without the Refresh button — then the region
is re-adoptable, the `undrawn` entry comes out of the expected tree, and the deferral baseline goes back
to 76. Half 2 needs no retirement: no mock draws a pull-to-refresh, so an export cannot contradict it.

---

## D-31 · The compose screen's submit bar and price block — RETIRED by D-52 (2026-10-01)

> **Retired.** The one-sheet composer this entry adjusted no longer exists. D-52's handoff draws the price as its own step (a big suggested fare, − / + $0.50, the band) and a stepped CTA with a one-line "what's missing" hint. The two owner rules from here that the handoff kept — the price opens on the suggested fare and is re-suggested when a pin moves, and a Send again keeps its own price — carry on unchanged.

**In effect.** Owner instruction 2026-08-17, from two photographs of the running app (`LJ home_empty`
and the same screen with both pins set). Four changes to `LJ Home`'s sheet, all in the owner's words:
*"Replace Broadcast request button text with Proceed. Also remove the text that says Add pickup & drop
off pins etc.. Leave that blank... Since the pickup location is now autofilled, the field below for
location must be autofilled to avoid confusing blank field with drop off location.. Also Autofill the
suggested price on the Your price with that price.. Though it's editable.. Remove the text as shown in
Pick that says suggested fair but keep the below which says Riders usually accept.. Keep that and
maintain the small font.. Remove the button for suggested fair since we are now autocompleting the Your
price."* The four open questions in it were put to the owner and answered before any code moved; each
answer is recorded against its half below.

These are **one change with one cause**: the pickup pin now auto-locates on open (owner instruction
2026-08-17, the session before this one). That single addition is what made a blank search box read as
the drop-off's, and what made a button whose only job was to type the suggested fare into an empty
field redundant. The mocks were drawn for a composer that opened completely empty; this is the same
composer with a position already in it.

### Half 1 — the CTA reads "Proceed", not the mock's "Broadcast request"

`screens.jsx :: Home` draws `<Button label="Broadcast request">`; the app draws `Proceed`. **Asked and
answered:** the button still broadcasts immediately — same disclaimer gate, same idempotent create,
same push to the auction screen. There is no new review step; only the word changed.

Applied in the codegen **bind** (`tools/parity/codegen/adopted.mjs`, `LJ.home_empty#footer`), not by
hand-editing `apps/mobile/app/send-compose-footer.view.tsx` — that file is generated, and a hand edit
would be silently reverted the next time anyone regenerates it. The structural snapshot is unaffected:
`normalize.mjs` drops text content by design, so the tree still matches the mock's.

### Half 2 — the missing-requirements hint is not shown at all

The mock draws `{!pins ? <div>Add pickup & drop-off pins, an item, a price and both phones to
broadcast.</div> : null}` above the CTA; the app rendered a live version naming every outstanding
requirement. It now renders nothing.

**The cost is real and was accepted deliberately.** That line was the only thing on screen explaining a
greyed-out CTA, so the button is now a silent dead end until the form is complete. The owner was offered
the alternative — keep the space blank but make the button tappable, so tapping with something missing
raises a brief toast naming it — and chose the silent one. Do not "fix" this as a bug; it is the
instruction. `submit()` still carries the same summary as an error toast, unreachable while the button
is disabled, kept as the belt-and-braces path.

**The node stays in the tree.** `SendComposeFooterView` keeps its `showHint` branch and the container
passes `showHint={false}` forever. Pruning the `<Text>` instead would have made the generated view one
node shorter than the mock, which `normalize.mjs` has no way to express — the exact situation that cost
D-30 its codegen adoption and bumped the deferral baseline. Nothing renders either way, so the honest
cheap option is the one that keeps `LJ.home_empty#footer` adopted and the snapshot meaningful.

### Half 3 — the address search field carries the slot's address

The mock draws an empty search field under the address rows. The app seeds it with the address the
active slot already holds. **Asked and answered:** fill the field (rather than switching the active slot
to drop-off on open, the alternative offered). The rule that keeps it from becoming a nuisance: only a
CHANGE of the underlying address writes to the field, so typing over it — or clearing it outright — is
never overruled by a re-render. Both variants of `AddressSearch` (Places-keyed and the device-geocoder
fallback) behave identically, via one shared `usePrefilledQuery` hook.

This is the **live-vs-static rule** in `CLAUDE.md` working as written, not against it: the mock's
element tree is unchanged — same field, same placeholder, same position — and the live behaviour is
derived inside it.

### Half 4 — "Your price" opens carrying the suggestion; the two affordances above it are gone

The mock (and the app until now) drew `Suggested fare $X · N km`, then the acceptance band, then a
ghost `Use suggested $X` button, above an empty price field. The app now draws **only** the band hint
above a field that already contains the suggested fare. The band keeps its drawn 12px — the owner asked
for the small font by name.

Both removals follow from the autofill rather than standing on their own: a line announcing the number
the field displays, and a button that types that number into the field, are both restating what is on
screen. `docs/PRICING.md` is updated to match — the anchor still reaches the customer, by a different
route.

**Asked and answered — re-suggest always.** When the customer has typed their own price and then moves
a pin, the NEW suggestion wins and overwrites what they typed. The owner chose this over
keep-what-you-typed when both were offered. It only fires when the suggestion itself changes, so typing
is never fought mid-keystroke: a typed price stands until the trip it was priced for stops being the
trip on screen. **One carve-out, and not by preference:** a re-broadcast opens with the original order's
fare AND both pins already set, so the first suggestion computed for those same pins would overwrite the
very number the customer is re-sending. Only that first write is skipped; move a pin afterwards and the
rule above applies.

**Also worth stating:** the price field is never empty any more, so broadcasting at the suggested fare
no longer requires the customer to consciously choose a number. This was flagged to the owner as part of
the same question and left as designed.

**Guarded by** `app/__tests__/send.test.tsx` (the price autofills on the second pin with no button
press; a typed price survives unrelated edits and is re-suggested over when a pin moves; a re-broadcast's
own fare survives its first quote; the retired "Suggested fare"/"Use suggested" strings are absent; the
band hint renders at 12px; the CTA answers to "Proceed") and `src/ui/__tests__/address-search.test.tsx`
(the field seeds from `prefill`, re-seeds when it changes, and never overrules typed or cleared text —
keyed and keyless alike).

**Retire this entry** when an export redraws `LJ Home` with a "Proceed" CTA, no submit hint, a prefilled
search field and a prefilled price field — then all four halves are simply the mock, and the codegen
label rewrite comes back out of `adopted.mjs`.

---

## D-32 · The merchant app is phone-first, and its alarm has no off switch — APPROVED (2026-08-19)

Owner instruction, verbatim: *"Make the merchant view mobile phone friendly and optimised. Also the
alarm must always be on no need for manual switching on or off .. No need to activate or deactivate
it. All screens must be mobile optimised. The top bar must fit into a screen."* Sent with two
screenshots of the merchant app on a phone: the top bar running off the right edge with the alarm
pill half-cut, and the Menu header doing the same.

Two deviations, one instruction.

### Half 1 — the top bar's alarm pill is gone

The kit draws a mute/unmute pill in `KitchenBar` (`r-parts.jsx:607`), and RESTAURANTS-DECISIONS §3
asks for the alarm state "shown at all times — muting is deliberate and visible, never silent." The
app now draws **no alarm control at all**.

That follows from the instruction rather than from layout convenience: an alarm that can never be
switched off has no state to show and nothing to toggle. `AlarmController` no longer holds a `muted`
field and exposes neither `isMuted()` nor `setMuted()` — `alarm.test.ts` asserts their absence, so
re-adding the switch fails a test rather than passing review. `start()` is gated only on "already
ringing", so there is no configuration in which a real order lands silently.

**`armed` is not the switch, and is no longer merchant-facing.** Browsers still refuse to loop audio
until a page load has seen one user gesture. That requirement has not gone away; what has gone away
is making the merchant aim a gesture at a control to satisfy it. The shell's global gesture listener
now calls `arm()` (it used to call `resume()`, which no-ops while unarmed), so the first tap on any
screen — any tap, anywhere — unlocks the AudioContext. The "You're signed in — the alarm needs one
tap" banner (`RearmBanner`) is therefore deleted, not restyled.

**Still drawn, and correct:** the manual test-ring on the queue and in the `/setup` checklist.
Playing the alarm to check the device volume is not switching it on.

Dropping the pill is also what lets the bar hold brand + role + connection status inside 320px
without truncation, which is Half 2's requirement.

### Half 2 — every screen has a phone tier the merchant mocks never drew

`CLAUDE.md` fixes the merchant tablet at **1024×680**, and the RM mocks draw that viewport only.
Nothing below it is drawn, so the phone layer is undrawn territory rather than a departure from a
drawn screen — but it is recorded here because it is new geometry the kit does not contain.

The rule the layer is built to: **at 1024×680 every screen renders exactly as it did before this
change.** Phone geometry lives entirely in `@media (max-width: 680px)` blocks and in `clamp()` whose
*maximum* is the drawn value (at 1024, `3.6vw` = 36.9px, far past a 16px cap — so the cap is what
applies). What changes below 680px:

- **Top bar** — the brand block is the only shrinking child, so a long status ("Offline (attempt
  12)") truncates the wordmark instead of pushing itself off-screen; on the narrowest phones the
  offline bar sheds the "Merchant" role label, which the connected bar keeps at every width.
- **Bottom nav** — the active marker moves from a left border to a top border (a left rule reads as
  stray debris on a bar lying on its side), and the bar clears the iOS home indicator via
  `env(safe-area-inset-bottom)`.
- **Two-column rows stack** (`.kitchen-split` / `.kitchen-aside`): shop editor + preview, hours +
  busy mode, category list + tab preview, the dish sheet's form + photo, and both takeover rails.
- **Header action rows wrap** — the title takes the first line, its buttons share the second.
- **List rows wrap** — a dish's price and buttons, a day's open–close pair, a statement line's
  money, a category's switch/rename/delete each drop to their own line. The grouping wrapper is
  `display: contents` at tablet width, so the drawn row is untouched there.
- **Sheets become bottom sheets** with their own scroller, capped at `88dvh`. Centred dialogs at
  tablet width, unchanged.
- **Form fields render at 16px** on phones only — under 16px iOS Safari zooms the whole page in on
  focus, and that zoom-and-pan costs more than the point of type size does.
- `viewport` gains `viewportFit: "cover"` so the safe-area insets above resolve. Zoom is not capped.

**Verified as images, not prose** (`CLAUDE.md` → "Every parity claim becomes an image"): all eight
routes plus the NEW ORDER takeover and three sheets were rendered against the production build at
**360×720, 320×640 and 1024×680**, asserting each screen actually rendered (a marker string, after
two runs where a redirect and a Next error page passed a weaker check) and that no element — page or
inner scroller — overflows horizontally. That sweep found and fixed four real defects: the queue's
board painting over its footer actions, the setup banner crushed to a two-word column, the hours
row's time inputs overflowing 320px, and a category name squeezed narrower than its own text.

**Retire this entry** when an export draws the merchant screens at a phone viewport — then the phone
tier is simply the mock, and Half 2 stops being a deviation. Half 1 retires when the kit's
`KitchenBar` drops its alarm pill.

---

## D-33 · Rider KYC finishes inside the app; the mocks drew a browser hand-off — RETIRED same day (2026-08-20)

> ✅ **UPSTREAM SYNC DISCHARGED (2026-08-21).** The Claude Design project has adopted these changes
> and shipped them back as `packages/design/handoff/kyc-2026-08/` (README + work order, now in this
> repo). Its README lists the same six screens — two net-new, three edited, one audited-no-change —
> and its spec matches what this repo already carries: every copy string, icon, size and token was
> re-checked against it screen by screen. **The next export will therefore not revert these.**
>
> One honest limit on that: the handoff shipped as two Markdown documents, **not** as exported JSX.
> So this is verified against the design project's own written specification, not diffed against its
> source files. If a future export contradicts the handoff, the export wins and this entry reopens.
>
> **Retired by the in-repo design change in this PR.** The mocks no longer draw the browser step, so
> the app and the design agree and **there is no deviation left to carry** — align to the mock as
> normal. The original entry is kept below as the record of the decision.
>
> 🗄️ **UPSTREAM SYNC OWED — HISTORICAL, discharged 2026-08-21 (see the note above); kept as the
> record of what was owed.** This change was made *in this repo*
> under the owner's explicit instruction ("design it in this session"), NOT exported from the Claude
> Design project that `packages/design/` mirrors. That project **still contains the
> "Continue in browser" button**, so the next export will silently reintroduce it and re-open this
> deviation. Apply the same three edits there — `rider-screens.jsx` `KycPending` (drop the ghost
> Button), `rider-map.jsx` node `kyc_pending` (`p` + `c`), `ui_kits/mobile/app.js` (the pending
> EmptyState and the consent card's "You'll finish in your browser" clause) — or diff against this
> commit when the next export lands. The compiled `_ds_bundle.js` was edited to match by hand; its
> header `sourceHashes` are therefore stale for those three files, which is harmless here (nothing
> in this repo validates them) but means the tool may see the files as changed on next sync.

**Owner instruction, 2026-08-20:** *"The current KYC process you will end up on didit's website. I
don't want riders to go on the didit interface. Everything must be done inside the app and didit will
do the analysis."*

**What the kit draws.** `RJ kyc_pending` (1·3, `explorations/journey/rider-screens.jsx` → `KycPending`)
is an EmptyState titled *"Finishing verification…"* whose only action is a ghost
**"Continue in browser"**; `rider-map.jsx:28` describes the step as *"selfie liveness in-browser"*;
and `RJ kyc_form`'s consent card names Didit as the partner. The shipped app matches all three today
— `become.tsx:232` and `rider/(tabs)/index.tsx:468` hand off to a Chrome Custom Tab via
`WebBrowser.openAuthSessionAsync`.

**Why this is a deviation and not an alignment fix.** The authority chain in `CLAUDE.md` makes the
gallery the source of truth, and the gallery currently draws the browser step. So removing it is a
**product change against a current mock**, which is exactly the case this ledger exists for. It is
recorded here rather than argued in a code comment.

**The deviation.** The three browser exits are removed. Verification runs inside the app through
Didit's native SDK (Route A, `docs/plans/2026-08-20-kyc-in-app-plan.md` §3). Concretely:
`kyc_pending` loses its "Continue in browser" action and becomes a wait state with at most a
*Check status* refresh; `kyc_failed` / `kyc_expired` re-enter the capture step instead of minting a
session and opening a tab; and `kyc_form`'s consent card drops "You'll finish in your browser" while
KEEPING the Didit partner naming, which is a real disclosure the mock is right to draw.

**Retire this entry** when an export redraws the ACT 1 KYC cluster without the browser step — at
which point the app is simply the mock again. Until then the mocks are stale on this point and must
not be aligned to. Note the manual-review variant (`KYC_MODE=manual`) never had a browser step and is
unaffected (BH-03).

---

## D-35 · The ACT 1 KYC cluster gains three drawn states and two exits — RETIRED same day (2026-08-20)

> ✅ **UPSTREAM SYNC DISCHARGED (2026-08-21).** The Claude Design project has adopted these changes
> and shipped them back as `packages/design/handoff/kyc-2026-08/` (README + work order, now in this
> repo). Its README lists the same six screens — two net-new, three edited, one audited-no-change —
> and its spec matches what this repo already carries: every copy string, icon, size and token was
> re-checked against it screen by screen. **The next export will therefore not revert these.**
>
> One honest limit on that: the handoff shipped as two Markdown documents, **not** as exported JSX.
> So this is verified against the design project's own written specification, not diffed against its
> source files. If a future export contradicts the handoff, the export wins and this entry reopens.
>
> **Retired on arrival**, like D-33: these are design CHANGES the owner commissioned, not divergences
> the app is carrying. Once exported they are simply the mocks. The entry exists because
> `packages/design/**` was edited in-repo, which the reverse-drift freeze requires be logged, and
> because the upstream sync below is still owed.

Commissioned by the navigation review (N-01, N-02) and the KYC plan (P0-1), with decisions D2/D3/D4
recorded in `docs/plans/2026-08-20-navigation-fix-forward.md`.

**Added — `RJ kyc_unfinished` (1·3b) and `RJ kyc_cant_start` (1·3c).** `kyc_pending` assumed the happy
path: it says *"your ID check is with Didit"*, which is false for a rider who backed out of the SDK
(nothing was submitted) and false again for one whose camera never opened. The SDK returns **three**
outcomes — `completed`, `cancelled`, `failed` — and one drawn state cannot serve all three, because
they differ in whether the rider still owes an action and in whose fault it is. `cant_start` is the
only one of the three carrying a support ghost: the other two are solved by one tap, and offering
support there would invite a call for nothing.

**Changed — `LJ register` (C1·8) gains "Use a different number".** It had no back, no skip and no
sign-out, immediately after OTP, so a mistyped number that passed its own code was a trap. This is the
one thing `docs/DESIGN.md` § Responsive & accessibility explicitly requires — *"easy error recovery
(retry, edit, go back)"* — so the mock was contradicting its own design system. Ghost weight, matching
the OTP screen's ghost *Back* one step earlier.

**Changed — `RJ photo_capture` (E·1): the ✕ became a control, and the screen became a portrait.**
The close was a bare 20px glyph with no role, label or hit area, absent from both the hierarchy and
accessibility notes, while the shutter beside it was a fully specified 68px button — and it is the
only exit from a full-bleed dark camera. It is now a labelled `button` at DESIGN.md's 44px floor. The
drawn glyph is unchanged at 20px; only the touch area around it grew.

Per **D3** the step is the **rider portrait**, not the ID document (the Didit SDK photographs the
document itself; our capture serves the admin reviewer and the `KYC_MODE=manual` fallback). So the
ID-card rectangle became a portrait oval and the rules changed from document readability to face
framing — *"all four corners in"* describes a card, not a person.

The 44px box is written `var(--target-min)`, not the literal — the token defines that value, and the
whole point of D2 is that the floor is a system decision, not a number this one screen chose.

**Changed — the rest of the E series follows the portrait re-scope.** D3 changes what E·1 *captures*,
so every screen and label describing that artifact had to change with it, or the flow would tell the
rider two different things about the same photo:

| | Was | Now |
|---|---|---|
| `photo_preview` (E·2) body | "Can you read everything?" · "Check the names, ID number and photo are sharp — glare or blur…" | "Is your face clear?" · "Check your whole face is in frame and sharp — blur or shadow…" |
| E·2 preview placeholder | "ID photo preview" | "Rider photo preview" |
| Gallery tiles + `rider-map.jsx` E·1–E·4 | "ID photo · capture / preview / uploading / upload failed" | "Rider photo · …" |

E·3 and E·4 keep their bodies: they describe upload mechanics and progress, which the re-scope does
not touch. Only their titles name the artifact.

**D2, recorded here because this is the screen that forced it.** `docs/DESIGN.md` requires ≥44px touch
targets; `CLAUDE.md` says a mock drawing smaller wins. The 20px ✕ was legal under one and a violation
under the other. Resolution: the 2026-08-10 rule is scoped to **parity** — it stops the APP silently
resizing a mock — and was never licence for the KIT to draw an unusable control. The app never
inflates; a below-floor mock is an **UPSTREAM defect to fix**, as done here. Still owed:
writing that precedence into `CLAUDE.md` so it stops being re-argued (T9).

🗄️ **UPSTREAM SYNC OWED — HISTORICAL, discharged 2026-08-21 (see the note under this heading).**
Compounded D-33's. Edited in-repo, not exported from the Claude Design
project that `packages/design/` mirrors, so the next export reverts all of it. Replay there:
`rider-screens.jsx` (two new components + registry), `gallery-map.js` (two band entries + the four
E-series tile labels), `screens.jsx` (Register ghost), `rider-screens-safety.jsx` (PhotoCapture
header + oval + rules, PhotoPreview re-caption), `rider-map.jsx` (E·1–E·4 titles, E·1/E·2 prose), and
the matching `_ds_bundle.js` twins. **Not touched:** the interactive kit's own registration form
(`ui_kits/mobile/app.js`) still lacks the exit — it is a live form needing a handler, so it was left
for the export rather than half-wired here.

**Retire this entry** when an export carries all of the above; nothing here is a standing deviation.

---

## D-34 · The Didit SDK's own verification UI is outside pixel parity — APPROVED (2026-08-20)

**The consequence of D-33's chosen route, stated so it is never mistaken for drift.** Route A embeds
`@didit-protocol/sdk-react-native`, whose capture, liveness and NFC screens are drawn by Didit's
native SDK, not by us. They are configurable only through the SDK's own knobs (`languageCode`,
`fontFamily`, `showCloseButton`, `showExitConfirmation`, camera options) — the design tokens in
`packages/design/tokens/*.css` cannot reach them, and no mock can be authored for them.

**Therefore:** the in-SDK verification screens are exempt from the pixel-parity guardrails. They get
no gallery id, no `tools/parity/app-targets.mjs` target, and no screenshot-lane sheet. Everything
AROUND them — the form that launches the SDK, and the pending / verified / failed / expired / locked
gates it returns to — stays fully in parity and is aligned as normal.

**The trade, recorded.** The alternative (Route B: our own capture UI against Didit's standalone
analysis APIs) would have been fully Lynia-drawn and parity-able. It was put to the owner and not
chosen, because it buys those pixels with passive-only liveness, no NFC, and a false-reject rate we
would own on entry-level phones — a bad trade at the gate that decides who carries strangers'
parcels.

**AMENDED 2026-08-20 — neither config knob is set, and the original instruction here was wrong.**
This entry first said to *"set the SDK's `fontFamily` to Inter and `languageCode` explicitly so the
embedded screens sit as close to the system as the seam allows."* That was written before the SDK was
read. Both halves fail on contact:

- **`fontFamily: "Inter"` would not resolve, and would be actively harmful if it did.** The SDK's own
  docs require the font to be *"registered in your app's native configuration"*. This app registers
  type through `expo-font`'s `loadAsync` at the RN layer, under the names `Inter_400Regular` /
  `Inter_600SemiBold` / `Inter_700Bold` (`src/ui/fonts.ts`) — there is no family called `Inter`, and a
  third-party native SDK resolving a `Typeface` does not see expo-font's registry. Worse, those TTFs
  are deliberately **subset** (there is a `check-font-charset` lint pinning the safe ranges): Didit's
  UI carries its own strings, so a subset face would render tofu for anything outside our charset.
- **`languageCode` has nothing honest to pass.** The app ships no i18n — no locale store, no
  `getLocales` call, English hardcoded throughout. Forcing `"en"` would *override* the SDK's default
  (device locale, English fallback) and take a Didit-supported language away from a rider whose phone
  is set to it. The default is strictly better until the app itself has a locale to hand over.

So `startVerification` is called with no `DiditConfig` at all (`src/kyc/verify.ts`), which also keeps
`showCloseButton` and `showExitConfirmation` at their `true` defaults — the exit affordance the
navigation review (N-05…N-07) requires of every full-screen step. **Revisit `languageCode` if and
when the app gains a locale setting; leave `fontFamily` alone until type is registered natively AND
shipped unsubset.**

**Retire this entry** if the document step later moves to Route B's in-app capture (kept open in the
plan's §3), at which point those screens come back under parity and need mocks.

---

## D-36 · The customer bridge returns to the KYC waiting walls — APPROVED (2026-08-20)

> ✅ **UPSTREAM SYNC DISCHARGED (2026-08-21).** The Claude Design project has adopted these changes
> and shipped them back as `packages/design/handoff/kyc-2026-08/` (README + work order, now in this
> repo). Its README lists the same six screens — two net-new, three edited, one audited-no-change —
> and its spec matches what this repo already carries: every copy string, icon, size and token was
> re-checked against it screen by screen. **The next export will therefore not revert these.**
>
> One honest limit on that: the handoff shipped as two Markdown documents, **not** as exported JSX.
> So this is verified against the design project's own written specification, not diffed against its
> source files. If a future export contradicts the handoff, the export wins and this entry reopens.

**This reverses D-16's placement decision for two screens, and it is the second time this control has
moved. Read the whole entry before moving it a third time.**

**History.** On **2026-08-16** the owner, from a photo of the rider board's "Finish verifying your ID"
wall, removed `"Back to customer"` from the board and moved the bridge onto the Account tab (D-16).
On **2026-08-20**, presented with T8 stated explicitly as *"REFUSED, needs an owner ruling — to land
it, the owner has to reverse 2026-08-16"*, the owner answered *"Just proceed.. Execute all"*. That is
the ruling, and this entry is it.

**What changed in the app and the kit.** `packages/design/explorations/journey/rider-screens.jsx`'s
`KycPending` (gallery id `RJ.kyc_pending`) gains a ghost `"Order food and send parcels"`, mirrored in
`_ds_bundle.js`. The app draws it on `in_flight` and on `manual_review` — the latter has no gallery
screen of its own (ops review is a *mode*, not a drawn state), so it borrows the same idiom.

**Where it is deliberately NOT drawn, which is the argument the reversal was granted on.** Not on
`unfinished` and not on `cant_start`. Both have a tap that clears the wall, and a bridge beside it
competes with the one action that actually solves the rider's problem. It appears only where the
rider can do nothing at all — the vendor is deciding, or ops is — which is the exact case the
constraint was about: *"not finishing KYC should not stop a rider from logging in"*, and a rider held
in manual review for two days otherwise learns the app is not for them yet.

**Why the label is not `"Back to customer"`.** The 2026-08-16 removal was pinned by absence tests
naming that string, so re-adding the bridge under any other name passed all of them — a near-miss
caught during T8. Those tests now pin the **whole action set per wall**, so the bridge's presence is
asserted exactly where it was asserted absent, and any *other* new action on a KYC wall still fails
on purpose. The chosen label matches the Account tab's own sub-line and says what the rider gets
rather than which role they are leaving. The button removed in 2026-08-16 — the one that opened an
offline-confirm sheet — stays removed; this is a plain ghost that navigates, because a rider behind a
KYC wall has never had a shift to protect.

🗄️ **UPSTREAM SYNC OWED — HISTORICAL, discharged 2026-08-21 (see the note under this heading).**
Compounded D-33's and D-35's. The `KycPending` change was made *in this
repo*, not exported from the Claude Design tool. The next export must carry it or it will silently
revert — and a revert here reads as the 2026-08-16 decision reasserting itself, which it is not.

**Retire this entry** when an export carries the ghost on `RJ.kyc_pending`; the placement itself is a
standing owner decision, not a deviation, so only the in-repo edit is what needs retiring.

## D-37 · The in-app ID-check sheet renders Didit's hosted flow — vendor pixels inside Lynia chrome — APPROVED (2026-08-22)

**D-34's exemption, carried to the surface that actually shipped.** D-34 approved that the Didit
**native SDK's** verification UI (Route A) sits outside pixel parity. That SDK is reverted with the
New Architecture (MOB-BOOT-04 — every build carrying the pair died at cold start), and the owner's
instruction stands: *riders must not do KYC on the Didit website outside the app, everything must
look like the app interface* (2026-08-20, reaffirmed 2026-08-22). The shipped mechanism is now an
**in-app sheet** (`apps/mobile/src/kyc/KycCheckHost.tsx`): Didit's hosted web flow rendered inside
LyniaGo via `react-native-webview`, under a Lynia header ("ID check · with our verification partner
Didit", token-drawn, ✕ at `--target-min`), with Lynia-drawn loading ("Opening your ID check…"),
error (the `kyc_cant_start` copy, verbatim) and exit-confirmation states.

**What is exempt, exactly as under D-34:** the pixels *inside* the sheet — document capture, selfie
liveness, progress — are Didit's hosted pages, not drawable from `packages/design/tokens` and not
coverable by the parity guardrails. Everything *around* them is Lynia chrome, built from tokens, and
IS subject to parity discipline. No gallery screen draws the sheet's chrome (the sheet is transport,
not a journey state — the drawn journey states remain `kyc_form` → `kyc_pending` /
`kyc_unfinished` / `kyc_cant_start`, all unchanged); if Design later draws one, the app aligns to it.

**Fallback lane, same exemption:** where the sheet cannot present (WebView module absent, hard
camera denial), the launch falls back to the in-app browser tab — vendor pixels again, plus browser
chrome. The API's `GET /kyc/return` landing (brand CTA green, shared tokens) is the branded end of
that lane for older builds.

**No kit edit was made** for this entry — `packages/design/**` is untouched, so no upstream sync is
owed. **Retire this entry** if the native SDK re-lands (D-34 then covers its UI again) or if Route B
(fully Lynia-drawn capture) ships and no vendor-drawn surface remains.

## D-38 · No vendor naming in rider-facing KYC copy — the check reads as Lynia's own — APPROVED (2026-08-22)

**Owner instruction (2026-08-22, from a build-#36 device screenshot of the in-app sheet):** *"Remove
the statement at the top that says 'with our verification partner Didit' … do it across all KYC
screens to remove any statement that says Didit … replace it with text that explains the action or
verification step … the idea is to make it look like it's us doing it."*

**This reverses the partner-naming half of the D-33/D-34-era decisions** ("KEEPING the Didit partner
naming, which is a real disclosure the mock is right to draw") and diverges from mocks that draw the
name. The three Lynia-drawn strings that carried it, and what they now say:

| Surface | Was | Now |
|---|---|---|
| ID-check sheet header sub (`KycCheckHost.tsx`) | "with our verification partner Didit" | "Have your national ID ready" |
| `RJ.kyc_form` consent card (`become.tsx`) | "…checked by our verification partner **Didit** — an ID photo plus a quick selfie liveness check…" | "We verify your national ID with an ID photo and a quick selfie check…" (storage/sharing sentence unchanged) |
| `RJ.kyc_pending` wall (`(tabs)/index.tsx`) | "Your ID check is with Didit — riders go online once it's verified…" | "We're checking your ID — riders go online once it's verified…" (rest verbatim) |

**Where the disclosure lives instead — recorded so this is never read as hiding the processing.**
The third-party-processor relationship remains disclosed in the privacy policy (the consent card
links to it), which is where CDPA/data-protection duty puts it; the per-screen naming was a courtesy
the owner has now withdrawn. Compliance posture unchanged.

**What this entry cannot remove:** the "Secured by Didit" footer INSIDE the embedded flow is drawn
by the vendor's hosted pages, not by this repo — removing it is a white-label setting in the Didit
dashboard (vendor plan permitting), tracked as a founder/ops item, not a code change.

**No kit edit was made** — `packages/design/**` untouched, so no freeze entry is owed, but the mocks
(`rider-screens.jsx` `KycPending`/`KycForm`) still draw the name: **UPSTREAM SYNC OWED** — the
design tool must adopt this copy or the next export reverts it. The affected screens are already in
`tools/parity/rendered-conformance.pending.json` for unrelated reasons, so no guardrail pins the old
strings. **Retire this entry** when an export carries the vendor-free copy.

---

## D-39 · RC.cart keeps a per-line edit affordance the mock's static sample never draws — APPROVED (2026-08-23)

**This session's disposition, executing UIP-04** (`docs/UI-PARITY-AUDIT-2026-08-23.md`), following the
D-11 precedent (*"the app's live X that the mock lacks a surface for → a DESIGN-DEVIATIONS.md entry,
keep it; adopt the rest of the structure to the mock"*) — flagged here for the user's review, not a
quoted owner instruction like D-11's.

The kit's `RC.cart` row (`r-parts.jsx`/`r-customer-a.jsx:317-331`) draws quantity as a **static 28×28
badge** and a per-dish note **only when one is already set** (`{c.note ? … : null}` — no "add a note"
affordance drawn at all). Neither is a static mock's oversight: the kit's own editing surface for a
cart line is the **Item Sheet** (`RC.item`, r-customer-a.jsx:257-289), whose bottom bar carries the
44px stepper — but that sheet is reached from the MENU when adding a dish, with no drawn path back to
it from an already-added cart line.

The app rebuilt the row to the kit's exact static structure — the badge is no longer a stepper, and
sits in the badge's left slot; the note text is conditional exactly as drawn — but a cart with items
already in it needs *some* way back into that editing surface once the customer has left the menu, so
`CartNoteSheet` (already the app's dish/whole-order note editor) gained the Item Sheet's own stepper in
its footer, and the row's note slot (pencil + "Note for the kitchen" prompt, shown even with no note
set) is now that surface's only entry point — kept as a **superset** of the static row for exactly this
reason, per D-11's rule. Per-line quantity/note editing is load-bearing (removing it entirely would be a
regression, not an alignment), so the surface is kept; only its trigger's constant visibility (rather
than appearing solely once a note exists) is the sanctioned divergence this entry covers.

Everything else on the row and the whole-order note now matches the mock's structure: the whole-order
note moved from a free-standing textarea below the card into a tappable summary row *inside* it (kit
r-customer-a.jsx:332-338 — muted pencil, ink-coloured value, between the lines and "Add more items"),
and the duplicate "a note can't change the price" disclaimer was removed from the main page (it already
lives correctly on the note sheet, matching kit r-customer-a.jsx:614).

---

## D-40 · SMS OTP copy → WhatsApp OTP copy — APPROVED (2026-09-01)

**User decision, this session (2026-09-01):** reopens D-01 (WhatsApp OTP → SMS OTP, RETIRED by the
2026-08-10 rev 2 export). D-01's own retirement note said the WhatsApp→SMS substitution existed only
because WhatsApp Business (BSP) onboarding was delayed (product decision 2026-07-18) and Bird's plain-SMS
API was "schedule insurance" in the meantime (`otp-sender.ts` `BirdOtpSender`, `docs/BIRD-SETUP.md`). The
user has now decided to move the OTP channel to Bird's **Verify** API (WhatsApp-first, with an automatic
SMS fallback if WhatsApp delivery fails for a given number — see `apps/api/src/auth/bird-verify.ts` and
`docs/BIRD-SETUP.md` "Bird Verify"), which is the scenario D-01's retirement did not anticipate: the app
now sometimes delivers over WhatsApp again, so mock copy that unconditionally says "SMS" would misdescribe
a real send. This is a new, deliberate reopening of that decision, not drift.

**Mock still says SMS — this is the divergence.** The gallery source (`screens.jsx`/`rider-screens.jsx`
`Login`/`Otp`, `ui_kits/mobile/app.js`) and `LJ register`/`RJ register` still draw the rev-2 SMS copy
("We'll SMS a one-time code…", "Check your messages" / "…by SMS", "Verified by SMS ✓"). Nothing in
`packages/design/**` was touched by this entry — per CLAUDE.md, that package mirrors the external design
tool and is never hand-edited to match the app. **A real design re-export reflecting the WhatsApp-first
channel is the follow-up this entry is standing in for**; until it lands, the screens below are a ledgered
app-side deviation, exactly like D-01 was in its original (pre-rev-2) form.

**Changed, and why each is safe to make dynamic rather than a second static claim:** because Bird Verify
can fall back to SMS on a per-send basis, a hardcoded "WhatsApp" string would sometimes be as wrong as the
mock's hardcoded "SMS" — so the app now says whichever channel the send actually used
(`AuthService.requestOtp`'s new `deliveryChannel` field, threaded through the OTP screens' route params),
rather than asserting a channel up front.

- `apps/mobile/app/phone.view.tsx` (LJ.login / RJ.login, via the shared phone.tsx container — one screen
  serves both roles pre-role-fork): "We'll SMS a one-time code…" → "We'll WhatsApp a one-time code…". This
  file is codegen-GENERATED (`tools/parity/codegen`) — the structural-snapshot guardrail
  (`apps/api/src/parity/structure-snapshot.spec.ts`) explicitly does not check text, only tree shape, so
  this hand-edit cannot fail it, but a future `codegen gen LJ.login` run against the CURRENT (SMS) mock
  will silently regenerate the old copy with no test catching the reversion — check this entry first.
- `apps/mobile/app/verify.tsx` (LJ.otp / RJ.otp, hand-written, not codegen'd): "…by SMS." and "SMS can
  take a minute…" now read "…by WhatsApp."/"WhatsApp can take a minute…" when `deliveryChannel ===
  "whatsapp"`, else the original SMS wording — both driven by the real `deliveryChannel` from the API, not
  a hardcoded claim. Untouched: "Check your messages" (channel-neutral already) and the locked-state copy
  ("Codes last 10 minutes, and 5 wrong tries locks one." — also channel-neutral).
- `apps/mobile/app/profile/setup.tsx` (LJ.register / RJ.register): "Verified by SMS ✓" → dynamic
  "Verified by WhatsApp ✓" / "Verified by SMS ✓", same `deliveryChannel` threaded one hop further from
  verify.tsx.

**Deliberately unchanged:** Help & support still routes to WhatsApp in the mocks (`map.jsx`/`rider-map.jsx`
`A·5`) — D-01 already confirmed that is a real, separate product decision, not OTP, and this entry does
not touch it. The merchant kitchen sign-in (`apps/merchant/app/login/page.tsx`) was never channel-specific
copy ("Enter the code we sent to {phone}.") and needed no change.

**Addendum, same day — SMS fallback removed (product decision 2026-09-01, after live-testing against a
real handset).** The paragraph above describing "WhatsApp-first, with an automatic SMS fallback" no
longer matches `bird-verify.ts`: `options.channels` now requests `["whatsapp"]` only, so Bird never
falls back to SMS — an undeliverable WhatsApp attempt fails loud, and a retry (the app's resend
affordance) is a WhatsApp retry, never a silent drop to SMS. The dynamic-copy mechanism this entry
introduced (§ "Changed, and why each is safe to make dynamic") is unaffected and stays in place — it
still correctly drives "SMS" copy on `OTP_CHANNEL=bird`/`local-sms` (real, static-per-deployment SMS
channels) and now always resolves to "WhatsApp" for `bird-verify`, rather than becoming a second
hardcoded claim. Live-tested 2026-09-01 against `+263778831938`: create call `200`,
`last_channel: "whatsapp"`, code received on WhatsApp. See `docs/BIRD-SETUP.md` "Bird Verify" for the
full arming record, including the same-session discovery that the send arrives branded "Bird Verify"
rather than "Authifly" by default (a Bird dashboard sender-identity setting, not an app or copy issue).

## D-41 · The iPhone app ships customer-only: no rider mode, no national ID — APPROVED (2026-09-27)

**User decision, this session (2026-09-27):** *"launching the ios app without the rider functionality.
The IOS version wont have ID collection and KYC. Zim riders use android which are low end phones. IOS
users are mostly customers and merchants."* Merchants are unaffected: they use the merchant web dashboard,
not this app. The same decision is what lets the App Store submission avoid ID capture, KYC, the
commission wallet and background location entirely (`docs/APP-STORE-SUBMISSION.md`).

**The divergence.** The gallery draws ONE app for both roles on every platform. On iOS the app does not
render any rider entry point, and it does not collect the national ID the sign-up mock draws:

- **LJ.role_select / LJ.role_select_flag_off** (the post-sign-in fork) is never shown on iOS: sign-in
  goes straight to the customer's permission priming (`src/logic/sign-in-route.ts`), and a stale deep
  link to `/role` continues as the "customer" choice would.
- **LJ.onboard_flag_off** (the food-off carousel) drops its closing "Earn as a rider" slide on iOS: one
  slide instead of the mock's two dots. The launched food-on deck has no rider slide and is unchanged.
- **LJ.register**: the "National ID number" field is not drawn on iOS; Continue needs only the name, and
  the PATCH carries no `idNumber` (optional in `UpdateProfileRequest`), so no ID number leaves an iPhone.
  The intro line drops "and ID" to match, reading "You're sending parcels. Just a name for your account
  record — no documents, no verification." (Android keeps the mock's line verbatim.)
- **The customer Account tab** (D-15/D-22) loses its bridge row ("Become a rider" / "Switch to rider").
- Smaller undrawn-state controls hide with it: the send screen's "Online as a rider" pill, the order
  screen's "Open your job" for a rider viewer, and the rider side of `/profile`.
- **Routing:** a saved rider role boots into the customer home, rider push/notification-row destinations
  open home (`src/push/push.ts`), and `RiderRouteGate` (`src/rider-route-gate.tsx`) sends any `/rider/*`
  or `/wallet/*` route home. A rider account signing in on an iPhone simply gets the customer app.

**Deliberately NOT done:** the app never tells iPhone users to use another platform to ride. App Review
guideline 2.3.10 bans naming other mobile platforms inside the app, so the rider entry points are absent
rather than replaced by a pointer.

**One switch, Android untouched.** Every gate reads `riderModeAvailable()` (`src/rider-mode.ts`, false
only when `Platform.OS === "ios"`). Android, and the react-native-web parity lane, see exactly the drawn
screens. The jest suite runs as iOS under jest-expo, so `apps/mobile/jest.setup.js` defaults the switch
on and the iOS cases override it: `src/__tests__/rider-mode.test.tsx`, plus iOS blocks in the role,
onboarding, account-tab, profile-setup, push and boot-route suites.

**Retire when:** the design kit draws an iOS customer-only variant (then align to it), or rider mode
comes to iOS. That would need the App Store organization account's KYC/wallet review and would flip
the one switch.

---

## D-42 · lyniago.com marketing website: the handoff shipped as-is, plus four launch decisions — APPROVED (2026-09-28)

**Owner instructions, this session (2026-09-28):**

- *"i have completed the landing page design, lets code this website … dont make design changes"*
- *"use the handoff assets dont change the design to match some rules in github. for the website
  apply as is"*

**This entry exists because the work necessarily touches `packages/design/**`**, which the
reverse-drift freeze gates. The design package here only *absorbs a new export*. Nothing in it is
edited to match code.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/lyniago-website/` | The website export, **verbatim**. This is the second export of 2026-09-28 (the "mobile optimisation" revision), which supersedes the first. Its only design change is one line in the `≤600px` block: `.form input{flex:none}` (the stacked callback field no longer collapses), footer links with a 44px minimum height and a `0 24px` gap, and 10px vertical padding on the phone-number links. The reference file carries the same change. |

### 2 · How the website differs from the rest of the kit (a scope rule, not a deviation)

The website is **not** a gallery screen and is outside the app's parity machinery: no gallery tile,
no token conformance, no tap-target or a11y overrides, no `tools/parity` registry entry. Its whole
spec is the handoff, deployed byte-for-byte from `apps/website/site/`. `scripts/check-website.mjs`
(CI job `website`) fails any drift. Never "fix" the website's CSS, copy or assets to match a repo
rule. A change comes back as a new export.

### 3 · The launch decisions (the handoff README's own "Items to finish before launch")

| README TODO | Decision | Effect on the shipped page |
|---|---|---|
| #1 Play Store link | **Keep `href="#app"`** while the listing is closed-testing only; the public URL 404s today (`CLAUDE.md` § Expo/EAS). | None. Exactly as delivered. |
| #2 OG image | Built to the README's spec: green `#00B14F`, the on-green Paper Dove (as `lyniago-icon.svg` and the app splash) with the Fredoka wordmark, and "Stay home. We'll bring it." in the hero's type. Source: `apps/website/og-image/`. | A new file, `assets/og-image.png`, that the page's existing `og:image` tag already names. |
| #3 About us | **Launch without it.** `/about` serves `404.html`: the page's own header and footer (derived by the check script), a "Page not found" heading and a "Back home" button, as README "Deploy" §6 allows. | A new page. The home page is unchanged. |
| #4 Terms / Privacy | **Privacy → `https://api.lyniago.com/legal/privacy`** (the live notice). **Terms → `https://api.lyniago.com/legal/terms`** (owner, 2026-09-30, once the terms page existed; D-49). | Two `href`s in the footer change (`LAUNCH_EDITS` → `privacy-link`, `terms-link`). It looks identical. |
| #3 About us, revisited | **Remove the link** (owner, 2026-09-30: *"remove the about us section in the website"*). There is no About page, so the footer's "About us" link is dropped rather than left pointing at a 404. | The footer loses one link (`LAUNCH_EDITS` → `about-removed`); `INTENTIONAL_404` is empty. `/about` still 404s like any unknown path. |

| (not a README TODO) Menu buttons stop short on phones | **Fix it** (owner, 2026-09-28, after the gstack QA and design reviews both found it). The lazy `biz-scooter-rider.svg` had no reserved size, so on a first visit at ≤960px the page grew about 350px while scrolling. The first tap on "Download the app" or "Send a parcel" then stopped 320–540px short of `#app`. The fix uses the README's own screenshot pattern: `width="460" height="460"` (the SVG's size) on that `<img>`, plus `height:auto` in `.biz-ill`. | Nothing looks different: the parity harness shows 0 px at all 7 widths. On a cold load the buttons now land where the reference lands (0px at 360, 390 and 768). **Report upstream** so the next export carries it; this row then retires. `LAUNCH_EDITS` → `biz-ill-size` and `biz-ill-height-auto`. |

Hosting-only files, none of which render: `_headers` (the README's caching rules plus security
headers), `robots.txt` and `sitemap.xml`.

**Retire when:** the Play listing is public (then add the link edits), or a new handoff export carries
the Terms link and drops About us (then `terms-link` and `about-removed` retire). Each of these updates this entry and `LAUNCH_EDITS` together.

## D-43 · Merchant web: self-serve sign-up, "Sign in", and the type-aware `/setup` — APPROVED (2026-09-29)

**Owner instruction (2026-09-29):** *"upgrade the merchant web side. It needs to enable both restaurants
and shops … simple for informal businesses in Zimbabwe … log in is by mobile number and whatsapp otp."*
The product spec is `docs/designs/merchant-web-upgrade.md` (L1, "Front door"); the plan is
`docs/plans/2026-09-29-merchant-web-upgrade-plan.md` (§10 lists this entry). **No RM mock draws sign-up,
business type or shops**, so these screens are built from RM primitives and ledgered here. The entry was
PROPOSED until the owner approved the web PR and its screenshot sheet (OV-11); **the owner approved it on
2026-09-29 with PR #986**. Nothing in
`packages/design/**` changes. **Upstream ask:** real mocks for sign-up and the shop checklist.

### 1 · Undrawn screens

Built at the merchant's 1024×680 and the D-32 phone tier, with the 320px check. Tokens only, targets
≥ `--target-min`, one 52px (`--target-primary`) primary per step.

| Screen | Route | Built from |
|---|---|---|
| **Set up your business, step 1:** "What do you sell?" Restaurant or Shop; a shop picks one of eight kinds; a pharmacy sees "Over-the-counter products only for now."; "You can't switch between restaurant and shop later." | `/onboarding` | The `RM.login` card (brand lockup, 22/800 title, 13.5 muted sub-line), the option-row pattern from `RM.oos_sheet`, pill chips |
| **Step 2, "Your business":** your name, business name, the map pin, a landmark, the contact phone, and the one-tap privacy line | `/onboarding` | The same card; `RM.login`'s 52px inputs; an OpenStreetMap pin that stays centred while the map is dragged, with zoom ± and "Use my location" |
| **A shop's `/setup`:** the pin (done at sign-up), "Book your first rider" and "Add your items" (both "Coming soon" until L2), and "Customers will find you when LyniaGo Shops opens. We'll check your items first." | `/setup` | `RM.setup`'s checklist card inside the login card's frame, not the kitchen shell (a shop has no Orders board and no alarm; its own nav lands in L2). **From L2 (D-44)** it sits inside the shop's own shell and both steps go live |

### 2 · Copy changes on drawn screens (structure untouched)

| Where | Mock | App | Why |
|---|---|---|---|
| `RM.login` title | "Kitchen sign-in" | "Sign in" | Shops use this screen too |
| `RM.login` code line | "Enter the code we sent to +263 77 •• •• 302." | "Enter the code we sent to your WhatsApp on {phone}." when the API's `deliveryChannel` is `whatsapp`; the drawn line otherwise | D-40's dynamic channel copy, extended to the merchant web |
| `RM.login` phone step (undrawn step of a drawn screen) | — | "Enter your phone number. We'll send you a 6-digit code." (was "Enter the phone number for this kitchen.") | Channel-neutral before the send, and not kitchen-only |
| `RM.login` error (undrawn) | — | On the API's `device_signup_cap` 429: "This device has added 3 new people today. Sign in on your own phone, or try tomorrow." | Says what to do on a shared counter device |
| `RM.setup` not-live line | "You go live once payment numbers and the alarm test are done." | "Finish this list and LyniaGo will call you within a day to switch you on. It isn't automatic." (was the app's "Finish this list, then LyniaGo switches your shop on …") | Names who switches a restaurant on, and when: ops calls within one business day (`docs/MERCHANT-GO-LIVE-RUNBOOK.md`) |

`RM.login` keeps its code boxes, the alarm notice and "Sign in & start the alarm". `RM.setup`'s restaurant
checklist is unchanged.

### 3 · Specified in the design doc, not built yet

- "Work at a business that's already on LyniaGo? Ask the owner to add you in Team." lands with Team (L4).
  Until then, step 1 ends with "Wrong number? Sign out".
- The restaurant go-live card's "Message LyniaGo on WhatsApp" button lands with Help (L5), which needs
  the same support number. The merchant web has none configured today (the mobile app's
  `EXPO_PUBLIC_SUPPORT_WHATSAPP` is unset too). L2 builds the plumbing (`NEXT_PUBLIC_SUPPORT_WHATSAPP`,
  from the `MERCHANT_SUPPORT_WHATSAPP` repository variable); it stays hidden until the owner sets it.
- The privacy line names only the privacy notice. No merchant terms text exists yet; the design doc calls
  it a dependency (`TODOS.md`).

**Retire when:** a design export draws these screens (then align to it), or the owner rejects a row (then
the app changes).

## D-44 · Merchant web: Book a rider, the shop's own shell, and shop words — APPROVED (2026-09-29)

**Owner instruction (2026-09-29):** the merchant web serves restaurants and shops, simply, for informal
businesses (D-43 quotes it). L2 of `docs/designs/merchant-web-upgrade.md` ("Book a rider (shops and
restaurants), plus the shop shell") and plan §10 list this entry. **No RM mock draws booking a rider, a
shop's navigation or a shop's words**, so these are built from RM primitives and ledgered here. **The owner
approved it on 2026-09-29 with PR #986** and its screenshot sheet (`docs/parity/MERCHANT-L2-D44-2026-09-29.png`,
OV-11). Nothing in `packages/design/**` changes. **Upstream ask:** real mocks for Deliveries, the booking
form, the pick screen and the shop nav.

Book a rider appears only once the API serves it: `GET /merchant/me` carries `location` from L2 on, and
the web shows nothing new until it does, whichever of the two deploys first.

### 1 · Undrawn screens

Built at the merchant's 1024×680 and the D-32 phone tier, with the 320px check. Tokens only, targets
≥ `--target-min`, one 52px (`--target-primary`) primary per screen. Status is never colour alone: every
state pill carries its words.

| Screen | Route | Built from |
|---|---|---|
| **Deliveries:** "Live now", then "Earlier"; each booking a card with its state pill, the countdown and offer count while finding a rider, the fare, what's going, where, the rider and "Booked by …"; "Book your first rider" when empty; "Booking riders is on its way." on an API that can't book yet; Sign out for a shop (its home) | `/deliveries` | `RM.queue`'s order card, its tag shape and the accept timer's countdown grammar |
| **Book a rider:** paste the location the buyer sent (a Google Maps link, short ones read by the API; a WhatsApp location; `geo:`; "lat, lng") or drag the pin; what the rider looks for; the buyer's phone; what's going; what it's worth (up to $150); the fare (Send's suggestion until typed over: "Suggested fare $x. Riders may offer a different fare; you pay the rider you pick, in cash at pickup."); a note; Send's three liability lines, "No prescription medicine, weapons, drugs or cash." (+ "Over-the-counter items only." for a pharmacy) and "No cash-on-delivery …"; "I understand and agree."; "Find a rider" | `/deliveries/new` | `RM.login`'s 52px inputs, L1's `LocationPin` (OpenStreetMap), `RM.setup`'s card |
| **One booking:** the 90-second countdown with each rider's offer (Pick; a teammate's offer disabled, "On your team, so they can't take your own delivery."); the delivery code, large, with "Send the code to the buyer on WhatsApp", Copy code and Send a new code; the rider with Call rider and "Pay $x in cash at pickup"; Picked up (no cancel, "message LyniaGo"); Delivered; Not delivered (the reason, Call rider); Cancelled (by the rider: follow the booking LyniaGo re-sent; by the business or the LyniaGo team, with its reason); No rider picked in time and the business's own cancel, with Try again and its fare | `/deliveries/[id]` | the same cards; the offer row follows the rider app's offer list |

### 2 · On drawn screens

| Where | Mock | App | Why |
|---|---|---|---|
| `RM.queue` (Orders), restaurants | no booking control | A strip under the heading: "A phone order to deliver? Book a LyniaGo rider." with "Book a rider", or "N bookings live · View" while any is live | R2-12: restaurants book riders for phone orders; no new nav item |
| `KitchenNav`, shops | Orders · Menu · Shop · Hours · Statement | Deliveries · Items · Shop · Help (Help opens WhatsApp support, and hides while no number is set) | A shop takes no customer orders, so its home is Deliveries (design doc L5 "Navigation"). Restaurants keep the drawn nav |
| `RM.setup`, shops | (D-43) | Inside the shop's shell. "Book your first rider" → the booking form, ticked by the first booking; "Add your items" → Items, ticked by the first item | Each step goes live with its layer |
| `RM.shop` (M5), shops | "How riders pay you" | Not shown | It's the rule for customers' cash orders, and shops take none yet (L1.5) |

### 3 · Shop words on drawn screens (restaurants unchanged)

`apps/merchant/app/lib/vocabulary.ts` (plan D6) owns every word that differs. Each swap, restaurant → shop:

| Screen | Restaurant (drawn) | Shop |
|---|---|---|
| Nav, `RM.catalog` title | Menu | Items |
| `RM.catalog` loading / error | Loading your menu… / Couldn't load your menu. | Loading your items… / Couldn't load your items. |
| `RM.catalog_empty` | "Dishes live inside categories — Mains, Sides, Drinks, whatever fits your kitchen. Create one and you can add dishes straight into it." | "Items live inside categories — {first three starters}, whatever fits your shop. Create one and you can add items straight into it." |
| `RM.catalog_empty` chips | Mains · Sides · Drinks · Breakfast | Per kind. Pharmacy: Pain relief · Cold & flu · Vitamins · Personal care. Grocery: Groceries · Drinks · Household · Snacks. Butchery: Beef · Chicken · Pork · Braai packs. Clothes & shoes: Women · Men · Kids · Shoes. Car parts: Engine · Brakes · Electrical · Tyres. Hardware: Building · Plumbing · Electrical · Tools. Phones & electronics: Phones · Accessories · Chargers · Audio. Something else: Popular · New in · Specials · Other |
| `RM.catalog`, `RM.category_manage` counts | N dish / dishes | N item / items |
| `RM.catalog` | + Add a dish · + Add dish here · No dishes yet. · "…every dish needs one photo before it goes live." · "…as the tabs on your menu" | + Add an item · + Add item here · No items yet. · "…every item needs one photo…" · "…as the tabs in your shop" |
| `RM.item_edit` | Add a dish / Edit dish · Delete dish · DISH PHOTO · "Every dish needs one photo before it goes live — dishes with photos are ordered about twice as often. Pick the file from this tablet; we shrink it for you." | Add an item / Edit item · Delete item · ITEM PHOTO · "Every item needs one photo before customers see it. Pick the file from this device; we shrink it for you." (the "twice as often" claim is about dishes) |
| `RM.category_edit` / `RM.category_rename` | "Customers see this name as a tab on your menu. Keep it short — “Breakfast”, “Combos”, “Kids”." · "…dishes inside it…" · "Hidden — customers don't see it or its dishes" | "Customers see this name as a tab in your shop. Keep it short — {first three starters}." · "…items inside it…" · "…or its items" |
| `RM.category_manage` | "…the tabs on your menu…" · Back to the menu · "…your dishes get somewhere to live." · "…your menu has no tabs right now." · "A hidden category and its dishes…" | "…the tabs in your shop…" · Back to your items · "…your items…" · "…your shop has no tabs…" · "…its items…" |
| `RM.dish_photo` | Position the dish photo · "Square crop. Fill the frame with the food, not the table." · HOW IT LOOKS ON THE MENU · This dish / Another dish · "How the photo reads at menu size" · "One clear daylight shot per dish is enough." · dish photo · 1:1 | Position the item photo · "…with the item, not the table." · HOW IT LOOKS IN YOUR SHOP · This item / Another item · "…at list size" · "…per item…" · item photo · 1:1 |
| `RM.shop` | WHAT YOU COOK · "This is your shop front. Changes go live straight away." · "A real photo of your food beats a logo on the banner. …" | WHAT YOU SELL · "This is your shop front. Customers will see it when LyniaGo Shops opens." · "A real photo of your shop beats a logo on the banner. …" |

### 4 · Specified in the design doc, not built yet

- Riders (L3) and Team (L4) in the shop nav and inside Shop.
- The top bar's business name and who is signed in, restaurant Help, the out-of-stock sheet's three
  options, and shop words on the screens a shop doesn't use (the reconnect banner's "you are not
  receiving orders", Hours, Statement) land with L5.
- Web Push and a merchant socket feed for bookings (Phase 2); the pick screen polls.

**Retire when:** a design export draws these screens (then align to it), or the owner rejects a row (then
the app changes).

## D-45 · Merchant web: Your riders — APPROVED (2026-09-29)

**Owner instruction (2026-09-29, the design review revision):** *"merchants have their preferred bikers ..
they have to put them on the platform by their phone numbers used to sign in to the platform. Can do a
section where they can manage these riders .. the ranking mechanism will tag them preferred and depending on
various factors rank them higher."* Spec: `docs/designs/merchant-web-upgrade.md` L3; plan §10 lists this
entry. **No RM mock draws a riders list, a rider's status or a "Your rider" tag**, so these are built from RM
primitives and ledgered here. **The owner approved it on 2026-09-29 with PR #986** and its
screenshot sheet (`docs/parity/MERCHANT-L3-D45-2026-09-29.png`, OV-11). Nothing in `packages/design/**` changes. **Upstream
ask:** a real mock for the riders list.

### 1 · Undrawn screens

Built at 1024×680 and the D-32 phone tier, with the 320px check; tokens only, targets ≥ `--target-min`.

| Screen | Route | Built from |
|---|---|---|
| **Your riders:** "N of 20"; the owner's "Add a rider" (their name, the number they sign in to LyniaGo with); each rider's label, masked number, status pill (On LyniaGo · Not on LyniaGo yet · Can't take jobs right now, never why), their LyniaGo name and "12 deliveries for you · ★ 4.9" only after a job; "Send the sign-up link on WhatsApp" for a number not on LyniaGo yet; Remove with an inline confirm; "Only the owner can add or remove riders." for staff; "No riders yet"; "Your riders is on its way." on an API before L3 | `/riders` | `RM.setup`'s cards, the booking form's inputs, the state-pill shape from D-44 |

### 2 · On drawn and D-44 screens

| Where | Mock / D-44 | App | Why |
|---|---|---|---|
| `KitchenNav`, shops (D-44) | Deliveries · Items · Shop · Help | Deliveries · **Riders** · Items · Shop · Help | Design doc L3: a nav item for shops, next to Deliveries |
| `RM.shop` (M5), restaurants | ends with How riders pay you | a "Your riders" card after it, with "Manage riders" | Design doc L3: for restaurants Riders sits inside Shop, so the drawn nav stays as it is |
| The pick screen (D-44) | offers in the API's order | ordered by `rankOffers` with the preferred bonus (a teammate's unpickable offer last), and a **"Your rider"** tag | Design doc L3 "How preferred ranks" |
| A shop's `/setup` (D-43/D-44) | pin, booking, items | + "Add your riders", tagged **Optional** and never counted | Design doc "A shop's /setup checklist" item 3 |

### 3 · Specified, not built yet

- The rider-side notice and opt-out ("{Business} calls you their rider") are a Phase 2 mobile release
  (TODO-3); v1 changes nothing in the rider app.
- Reach beyond Send's broadcast radius for a business's own riders is a later, Send-side change (TODO-6).

**Retire when:** a design export draws the riders list (then align to it), or the owner rejects a row (then
the app changes).

## D-46 · Merchant web: Team, Join, who is signed in, and the Staff views — APPROVED (2026-09-29)

**Owner instruction (2026-09-29):** *"They can add multiple users to log into same shop."* Spec:
`docs/designs/merchant-web-upgrade.md` L4 ("Team"), with its one permission table; plan §10 lists this entry.
**No RM mock draws a team, an invite, a Join screen, who is signed in, or a Staff view**, so these are built
from RM primitives and the in-repo wireframe (`docs/designs/merchant-web-upgrade-wireframe.png`, screen 3), and
ledgered here. **The owner approved it on 2026-09-29 with PR #986** and its
screenshot sheet (`docs/parity/MERCHANT-L4-D46-2026-09-29.png`, OV-11). Nothing in `packages/design/**` changes. **Upstream
ask:** real mocks for Team, Join and the top bar's signed-in person.

### 1 · Undrawn screens

Built at 1024×680 and the D-32 phone tier, with the 320px check; tokens only, targets ≥ `--target-min`.

| Screen | Route | Built from |
|---|---|---|
| **Team** (owner only, inside Shop): "‹ Shop", "Team", what Staff do in the business's words; each person's name, masked number ("· you" on the owner's own row) and an Owner / Staff tag; each pending invite's "invited, hasn't joined yet", an **Invited** tag, "Send the link on WhatsApp" and "Cancel invite"; "Add someone" → their name, their phone number, Invite → "Invite ready. Send them the link on WhatsApp."; Remove with an inline confirm that warns "If {name} is signed in on the counter tablet, sign it in again with someone else."; "Only the owner can see and change the team." for Staff; "Team is on its way." on an API before L4 | `/team` | the wireframe's screen 3, D-45's list rows, cards and inputs |
| **Join:** "{Owner} added you to {Business} as Staff." per invite; "Your name" (the invite's, to confirm or correct) and the sign-up's own one-tap privacy line; "Join {Business}" / "Not me"; "Set up my own business instead"; "Wrong number? Sign out" | `/join` | D-43's sign-up card and its privacy line |

### 2 · On drawn and earlier-ledgered screens

| Where | Mock / earlier | App | Why |
|---|---|---|---|
| `KitchenBar` (RM, all screens) | brand · "Merchant" · Connected · (D-32 dropped the alarm pill) | + who is signed in at the end, "Tendai · Staff", which opens "Switch person" and, for Staff, "Leave this business". At phone width the first name only, and the secondary label ("Merchant"; the business's name from L5, D-47) gives way to it; below 360px (and offline) the icon alone, the name in its menu, so the wordmark is never cut | Design doc L4 "Shared devices": everyone signs in with their own code, and a shared tablet says whose it is |
| `KitchenNav`, restaurant Staff | Orders · Menu · Shop · Hours · Statement | Orders · Menu · Hours · Help | The permission table: Shop and Statement are the owner's; Help opens support's WhatsApp (hidden when unset) |
| `KitchenNav`, shop Staff (D-44/D-45) | Deliveries · Riders · Items · Shop · Help | Deliveries · Riders · Items · Help | The permission table |
| `RM.catalog` (M4·1) and Items (D-44), Staff | the owner's list with Edit, add and category controls | the list with "Mark out of stock" / "Back in stock" only, and "Mark items out of stock and back. Only the owner changes the items." under the title; an empty list says "The owner adds the dishes here." | The permission table: stock toggles only |
| `RM.hours` (M5), Staff | the week's toggles and times, Save hours | the week as text, no Save; "Only the owner changes the opening hours. You can turn busy mode on and off."; busy mode unchanged | The permission table: busy mode only |
| `RM.shop` (M5), owner, both types | ends with How riders pay you (restaurants) / the profile (shops) | + a "Your team" card with "Manage team" | Design doc L5: Team lives inside Shop for both types, owner only |
| `RM.shop`, `RM.statement`, `RM.setup`, `category_manage`, Staff by an old link | the owner's screens | one line each ("Only the owner changes the shop's details, its riders and its team." · "Only the owner sees the statement and the day's totals." · "Only the owner sets up {Business}." · "Only the owner changes the categories.") | The permission table; the API refuses the controls anyway |
| `RM.setup` nudge on Orders (SetupBanner) | shown while the checklist is open | not shown to Staff | Setting up is the owner's |
| A shop's `/setup` (D-43…D-45) | pin, booking, riders, items | + "Add your team", tagged **Optional** and never counted ("N people on your team with you", or "N invites waiting") | Design doc "A shop's /setup checklist" item 5 |
| "Set up your business" (D-43) | the type cards | + "Work at a business that's already on LyniaGo? Ask the owner to add you in **Team**." under them; a number with a pending invite sees Join instead | Design doc L1.4 and L4 |

### 3 · Behaviour worth knowing

- Someone the owner removed signs out on their next tap, and their device's order alarm stops, so a shared
  tablet goes back to "Sign in". Their devices also leave the live queue at once (server side).
- Adding a number never tells the owner whether it works somewhere else; only the invited person hears it,
  at Join, without the other business being named.
- Support hands a business to a new owner from the admin console ("Hand over…", runbook §8); there is no
  owner-side transfer.

**Retire when:** a design export draws Team, Join or the signed-in person (then align to it), or the owner
rejects a row (then the app changes).

## D-47 · Merchant web: finishing the drawn restaurant screens (L5) — APPROVED (2026-09-29)

**Owner instruction (2026-09-29):** *"improving restaurant side also to simplify."* Spec:
`docs/designs/merchant-web-upgrade.md` L5 ("Shop words + finishing the drawn restaurant screens"). Most of L5
**removes** divergences, aligning the app to what the RM mocks already draw. The entry lists those alignments so
the sheet (`docs/parity/MERCHANT-L5-D47-2026-09-29.png`) can be read against them, and ledgers the few places the
app still differs. **The owner approved it on 2026-09-29 with PR #986** and its sheet (OV-11). Nothing in
`packages/design/**` changes.

### 1 · Aligned to the mock (no longer a deviation)

| Where | Before | Now (as drawn) |
|---|---|---|
| `RM.oos_sheet` (M4·3) | one button, "for the rest of today", defended in a code comment | the three drawn choices: Until I turn it back on · For the rest of today (chosen to start with, as drawn) · For 1 hour, and the drawn line only. `POST /merchant/dishes/:id/out-of-stock` takes the duration; none means the rest of today |
| `KitchenNav`, restaurants | Orders · Menu · Shop · Hours · Statement | + **Help**, the mock's sixth item, opening support's WhatsApp |
| `KitchenBar` | "Merchant" beside the lockup | the business's name there, as drawn |
| `KitchenBar`, restaurants | no open state | the drawn **Open for orders** / **Closed** pill after Connected: open while the restaurant is live and inside today's hours |

### 2 · Still different

| Where | Mock | App | Why |
|---|---|---|---|
| `KitchenBar` label | "Sadza Republic · Fife Ave" | the name alone | No area field exists; the landmark is a sentence, not an area |
| `KitchenBar` open pill | shown | tablet only; at phone width it gives way to the connection and the signed-in person (D-32's phone tier) | The bar can't hold four pills at 320–680px |
| `KitchenNav` Help | always drawn | hidden when `MERCHANT_SUPPORT_WHATSAPP` isn't set | A dead link is worse than no item (the mobile app does the same) |
| `KitchenBar`, shops | (no shop mock) | no open pill and no alarm flashing: a shop takes no customer orders | Design doc L5 "Order alarm" |

**Retire when:** a design export draws an area on the bar or a phone-tier bar (then align to it), or the owner
rejects a row (then the app changes).

## D-48 · Merchant: the mobile redesign replaces the RM tablet mocks — APPROVED (2026-09-30)

**Owner instruction, this session (2026-09-30):** *"i have redesigned the UI for the merchant web.
optimised it for mobile since we will move from web to mobile soon. Review this and implement. These
updated UIs are sources of truth."*

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze
gates. The design package only *absorbs a new export* here. Nothing in it is edited to match code.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/merchant-mobile/` | The merchant mobile handoff, **verbatim**: README (route map, 28 screens A1–E4, interactions, tokens, new components), the clickable prototype, the screens canvas, `reference/proto.js` (the interaction wiring), the stepper reference, tokens and the three assets. |

### 2 · Authority for the merchant app (a scope rule)

For **merchant** screens the authority chain's LOOK is now this handoff, not the gallery's `RM.*`
tablet registry: the handoff maps every RM route to its new screen (README "Route map") and says so.
The merchant canonical viewport becomes **360×720, with the 320px check** (README "Screens": "Common
frame: 360 × 720"). `RM.*` screens stay in the gallery until a gallery export redraws them; they are
not aligned to. D-43 to D-47 described the tablet app and retire screen by screen as the redesign
lands (below).

### 3 · Owner decisions on what the handoff assumes (2026-09-30, asked before building)

| Handoff assumes | Decision |
|---|---|
| Built in Expo with the RN design system | **The merchant web (Next.js), mobile-first at 360px.** It ships on the next deploy, keeps the working order logic, and can be wrapped as a native app later. |
| "Rider secured, start cooking" — a rider found at accept | **Keep dispatch at "Food is ready".** The cooking ticket keeps the prep ring; the rider step follows "Food is ready". |
| No payment tags; cash back on every order | **Cash only for food orders.** Wallet comes off the customer's food checkout; every food order is collect-and-return with the "Cash back to you" close. The API keeps accepting wallet from installed apps until they update. |
| Shops receive customer orders | **Not yet.** Shops get the new shell, Book a rider, Items, Money and Account; the customer-orders part appears when shop ordering launches. |
| No landmark field | **Landmark becomes optional in the API** for merchant locations (and later bookings). Rider-facing payloads still carry a non-empty string (the address line, else the business name), so installed rider apps keep working. |
| Google Maps | **Google Places (New) for address search and GPS lookup, OpenStreetMap for maps.** Keyless builds fall back to "your current location". *The OpenStreetMap half is superseded by D-80 (2026-10-06): maps are Google's.* |
| Delivery | **Four phased PRs**, each auto-merging on green: (1) handoff + shell + get-in + Account; (2) Orders, cash back and its backend; (3) Menu, Money, Hours, Team, Riders; (4) shop booking and Items. |

**Second round (2026-09-30, asked before PR 2):**

| Handoff draws | Decision |
|---|---|
| B4: the merchant types the rider's pickup code | **Keep today's direction**: the merchant's four boxes show the code and the rider types it in the rider app; "✓ Code matches" appears when the rider confirms. No rider-app change. |
| B1/B5: an open/closed switch | **Add a manual switch**: `merchants.closed_until`. Off holds until the next day starts or the merchant opens again; the API serves the restaurant with today's window dropped (so installed customer apps read it as closed) and refuses new orders (`restaurant_closed`). |
| B6/D5: "Mark ride completed … even if steps are left" | **Only after pickup**: it closes the merchant's side (nothing owed) and never changes the delivery, rider or customer. Before pickup it would be a cancel, which it is not. Same endpoint as B7's "No cash on this one" (`POST /merchant/orders/:id/close`). |

**Cash only, in the customer app:** the food checkout's "Mobile money" row (`RC.checkout_wallet`) is
removed and every food order is placed as cash at the door. This is an owner decision against the
customer gallery mock, recorded here; `RC.checkout_wallet` is no longer reachable. Every cash food
order is collect-and-return whatever the shop's older rule said. The cash is due back 30 minutes after
delivery (`RESTAURANTS_DEBT.cashReturnWindowMs`) and shows as overdue after that — shown, never chased.

The handoff's "Differences from the customer and rider apps" (8 open items) follow its own suggested
resolution unless the owner says otherwise: match tracking layout, delivery-code card, stepper time
placement and status label to the customer app; keep the merchant header and 4 tabs; add the new
components to the design system.

### 4 · Still different, while the phases land

| Where | Handoff | App now | Retires with |
|---|---|---|---|
| Shop front | not redrawn ("Banner, logo and tags") | the older profile editor under the new app bar | a design export that draws it |
| A3 "What do you sell?" | Restaurant or Shop only | same; a shop is stored with kind `other` (the API's kind field stays for ops) | — (a record) |
| Account, staff | "Staff should not see Money or Team (not drawn)" | Money and Team hidden; a staff member also gets **Leave this business**, the one action the old person menu held with no other home | a design export that draws it |

### 5 · Orders B1–B7 (PR 2b): what the app draws differently, and why

Evidence: `docs/parity/MERCHANT-MOBILE-ORDERS-2026-09-30.png` (mock left, app right, 360×720).

| Where | Handoff | App | Why |
|---|---|---|---|
| B1 New card | a "View & accept" card sits in the New segment | the card exists, but a ringing order always opens B2 over it | the alarm must be answered (B2 "Back is blocked here"); the card is what is left beneath the takeover |
| B1 / B6 ETA pill | gold "8 min" on the out-for-delivery row and the tracking title | the row's gold pill is the **cash-back countdown** once delivered; no ETA before that | the API has no rider ETA to the customer; nothing is invented |
| B1 cooking row sub | status line | "Cooking · ready by HH:MM" | the title already carries the items; the prep time is the only status a cooking order has |
| B1 Waiting-for-rider sub | "Blessing M. at your counter" style | "{rider} coming to your counter" | no "arrived" signal exists before the rider types the code |
| B3 | "Rider secured, start cooking" + "Blessing M. · ~8 min"; timeline Accepted · Rider secured · Rider at your counter | "Cooking · Ready by HH:MM · a rider is found when it's ready"; timeline Accepted · Food is ready · Rider at your counter | owner decision §3: dispatch stays at "Food is ready" |
| B3 "Can't finish this order" | confirm, then cancel | same, via `POST /merchant/orders/:id/cancel` (cash orders while cooking); a wallet order keeps the refund path | new endpoint; wallet orders from old installs still need a refund |
| B2 "Can't take it" | confirm sheet | same; the decline is sent with reason `other` | the handoff draws no reason picker |
| B4 / B6 rider row | 44px call button | no call button | rider phone numbers are not exposed to merchants |
| B4 "Hand over" | always live | enabled once the rider's code matched (status picked up) | owner decision §3: the rider types the code; handing over before that would skip the check |
| B6 map | live rider position | ~~OpenStreetMap tiles~~ a Google Static Maps image (D-80) centred on the kitchen with its pin | no live rider location in the merchant API yet |
| B5 offline bar | drawn inside B5 | the shell's "No connection, retrying…" bar (shown on every screen when offline) | same bar, one place |
| B5 closed body | power icon, "You're closed", Open now, busy mode | same, plus any orders still in the kitchen listed under "In the kitchen" | closing does not cancel orders already accepted; hiding them would strand them |
| Restaurant "Book a rider" strip | not drawn on B1 | removed | not drawn ⇒ not rendered |

### 6 · Menu C1–C2, Money C3, Items E1 (PR 3a)

Evidence: `docs/parity/MERCHANT-MOBILE-MENU-MONEY-2026-09-30.png` (mock left, app right, 360×720).

| Where | Handoff | App | Why |
|---|---|---|---|
| C1 category order | "`/menu/categories` becomes category chips (long-press to reorder)" | the separate categories page is gone; a long press (or right click) on a chip opens its category sheet, which has **Move earlier / Move later** beside rename, hours, hide and delete | the handoff names the gesture but draws no reorder UI; this is the smallest one that keeps the order customers see as tabs editable |
| C1 row, draft dish | not drawn | the sub-line reads "Draft · add a photo to go live" in gold | a draft is saved but hidden from customers until it has a photo; the owner needs to see why |
| C1 off line | "Off until tomorrow" | the same, or "Off until you turn it back on" for that choice | the API now returns `outOfStockUntil` (additive), so the line says what was chosen |
| C2 | two choices | two choices; the older "For 1 hour" is gone from the app (the API still accepts it) | not drawn ⇒ not rendered |
| C1 dish / category editors | "editor not drawn" | the existing dish and category sheets | nothing drawn to align to |
| C3 This week | not drawn | the same list, the last 7 days' delivered orders ("#A111 · Tue 12:31") | the segment is drawn; its content follows Today's layout |
| C3 | Sales, overdue row, Orders | the old statement's commission, "would have been", prep-time and cooked-food-loss tiles are gone | not drawn ⇒ not rendered |
| C3 overdue row | tap calls the rider ("Calling Tino…") | opens that order's cash-back screen (B7) | rider phone numbers are not exposed to merchants; B7 is where the cash is confirmed or reported |
| E1 | "All" chip first | "All" first on a shop's Items only (C1 draws none for a restaurant) | as drawn per screen |

### 7 · Hours C5, Team E2–E3, Riders E4 (PR 3b)

Evidence: `docs/parity/MERCHANT-MOBILE-ACCOUNT-2026-09-30.png` (mock left, app right, 360×720).

| Where | Handoff | App | Why |
|---|---|---|---|
| C5 "Per day" | the segment is drawn, its content isn't | one row per day: the day, open–close, a switch | the week the API stores; C5 opens on it when days differ |
| C5 time fields | "08:00" | 24-hour text fields that put the colon in themselves | a phone's own time picker draws "08:00 AM" and a clock in some locales |
| C5, staff | not drawn | the fields locked, no Save, one line saying only the owner changes hours; busy mode still works | the permission table (L4) |
| E2 staff row | "•••• 2210 · active today" | "•••• 2210" | the API has no last-active signal for a team member |
| E2 invite row | tap shows "Invite pending" | tap opens a sheet: send the link on WhatsApp, or cancel the invite | cancelling an invite needs a home, and nothing else draws one |
| E2 "+ Add someone" | toast "Add by phone number" | a sheet: their name, their phone number, Invite, then the WhatsApp link | not drawn; the L4 invite flow in the new sheet |
| **E3 Owner / Staff switch** | segmented role change | **not built** | the API keeps one owner per business, so making someone an Owner is an ownership change, not a toggle. **Owner decision (2026-09-30): leave it out for now** — one owner per business |
| E3 | "Remove Tendai" | the same, with the drawn consequence copy | — (a record) |
| E4 Online / Offline | pills | the same, from a new optional `online` on the riders list (an approved rider whose app still heartbeats within 3 minutes) | the API had three statuses only; still never a reason |
| E4 remove | not drawn | the owner taps a rider → "Remove Blessing?" confirm | the list needs a way to drop a rider, and the drawn row has no control |
| E4 "+ Add a rider" | "opens a sheet; not drawn" | a sheet: their name, the number they sign in with | — |
| Shop front "How riders pay you" | "Removed, since rider cash-back is now the single rule" (route map) | removed, and the Shop front's riders and team cards with it (they live on Account) | as the route map says |

### 8 · The shop D1–D5, D7 (PR 4a)

Evidence: `docs/parity/MERCHANT-MOBILE-SHOP-2026-09-30.png` (mock left, app right, 360×720).

**Owner decision (2026-09-30, asked before PR 4):** the rider collecting the goods' price for the shop is
**optional per booking** (a "buyer pays cash on delivery" choice on the booking). Until PR 4b builds it
(API, rider app, D3 toggle, D5 7th step, D7 cash card, Money), bookings stay delivery-only and the
booking terms still say "No cash-on-delivery".

| Where | Handoff | App | Why |
|---|---|---|---|
| D1 | New · Packing · Ready and a new-order card (D6) | not shown | shops take no customer orders yet (owner decision §3) |
| D1 trackers | finding and coming only | also the last day's ended bookings (grey), so a delivery can be opened for its result | the old Deliveries list's "Earlier" had no other home |
| D1 / D5 ETA pill | "6 min" / "12 min" | none | the booking has no rider ETA |
| D2 search | Places rows | Places rows; a Google Maps / WhatsApp location pasted into the same field is read too ("The location the buyer sent") | the buyer usually sends a location; the drawn field carries it (live-vs-static rule) |
| D3 "Type one" / "From your items" | toasts in the prototype | sheets: the shop's items with prices; or name, how many, price of one | not drawn; the price is needed for "Worth" |
| D3 terms | a "Booking terms" link | the link opens the terms; booking means accepting them (the old tick box is gone) | as drawn — the same pattern as A1's privacy line |
| D4 | the third offer card has no Pick button | every pickable offer has one (ghost below the first) | a drawing shortcut; every offer is pickable |
| D4 counter above the fare | "$0.40 less" | also "$0.80 more" (muted) | a counter can go either way |
| D5 rider row | "AFG 2231 · ★ 4.9" | the plate only | the booking payload carries no rating |
| D5 code | always shown | shown to whoever picked; anyone else gets "Get a new code" (the old one stops working) | the code is shown once and only its hash is kept |
| D5 links | "Cancel booking" · "Mark ride completed" | Cancel before pickup; "Help" after (the API refuses a cancel once the rider has it); no "Mark ride completed" | a booking has nothing to close until cash on delivery (PR 4b) |
| D5 stepper times | a time per step | "Booked" only; the current step says "live" | the booking payload has no per-step times |
| D7 hero | "Delivered 12:41" | "Delivered" | no delivered time in the booking payload |
| Not delivered · cancelled · nobody picked | not drawn | a hero in D7's pattern, call the rider, follow a re-sent booking, "Try again" with the fare stepper | the old screen's endings, restyled |
| Sign out on the shop home | — | removed | Account has it (C4) |

### 9 · Cash on delivery for shop bookings (PR 4b)

The owner's "optional per booking" (§8), built end to end:

- **D3** gains a **"Buyer pays cash on delivery"** switch card under Worth (not drawn — the handoff draws
  cash back as if every booking had it, so the choice needed a control): on, "The rider collects $51.00
  and brings it back to you"; off, "the buyer pays you as they do today". The booking terms follow it.
- **How it travels:** the booking carries one more line, "Cash on delivery: collect $51.00 from the
  buyer, bring it back to <shop>" (`packages/shared/src/booking-cod.ts`). Every rider app shows a
  booking's items, so a rider on an older install sees the cash before offering, with no forced update;
  Send copies items on a re-broadcast and "Try again" rebuilds the line. The merchant web hides it from
  the item list. A cash booking carries up to 9 goods lines.
- **At delivery** (the buyer has paid at the door) the order's existing debt opens for the declared
  value, in the same commit (`OrderLifecycleService.confirmDelivery`) — the restaurant cash-back fields,
  due 30 minutes after delivery. A not-delivered booking owes nothing (the goods go back).
- **D5** shows the drawn 7th step, "Cash back to you"; **D7** the drawn cash card: "I got $51.00" and
  "No cash on this one · mark completed" (confirm, `POST /merchant/bookings/:id/cash`). **D1** keeps a
  delivered booking mint with "Delivered · cash back $51.00" until then; **C3 Money** lists it as
  overdue after 30 minutes, opening the booking.
- **Rider app** (new builds): a gold "Collect $51.00 cash from the buyer" card on the job and the cash
  strip's owed tile. The rider takes no new jobs while the shop's cash is out (the C4 soft-lock now
  covers bookings), exactly as for restaurant cash.
- **Fixed along the way:** closing a food order's cash with "No cash on this one" / "Mark ride
  completed" (PR 2a) left the debt open, which kept the rider soft-locked and counted it in admin's open
  debt. The lock, the food dispatch filter and admin's totals now ignore a debt the merchant closed.
- **Not built:** reporting a booking's cash as not returned (the restaurant flow's "report non-return");
  support handles it (C3's overdue row opens the booking).

**Retire when:** all four phases have merged and a gallery export carries the merchant screens (then
the RM registry is replaced and this entry shrinks to the sync record).

## D-49 · Terms & conditions: one page for customers, riders and businesses — APPROVED (2026-09-30)

**Owner instruction, this session (2026-09-30):** *"create a Terms which is combined for both merchants,
riders and customers. dont make it sophisticated. learn from the privacy [notice], our business at
lyniago.com and chowdeck nigeria. Then when done link it to the website and apps .. Also remove the about
us section in the website .. ship everything and auto approve."*

| Where | Mock | App | Why |
|---|---|---|---|
| `GET /legal/terms` (API) | — (a hosted legal page, like `/legal/privacy`) | Plain-language terms: Part A for everyone, then parts for customers, riders and businesses. Copy in `apps/api/src/legal/legal.content.ts` (`termsHtml`), pinned by `legal.content.spec.ts` to the policy the code enforces (US$150 cap, 3 strikes → 2 h offline, 0% commission) | The owner's instruction; the store listing and lyniago.com need a terms page |
| Settings (`LJ.settings`, both roles) | No terms row | A **"Terms & conditions"** row (`file-text` icon) after "Privacy notice", opening the hosted page in the browser | No mock draws a terms screen; the row is listed as an `extra` in `LJ.settings_perms*.json` |
| Merchant sign-in line | "By continuing you accept the privacy notice." | "By continuing you accept the **terms** and **privacy notice**." — both links to the API pages | Merchants accept the terms where they already accept the privacy notice |
| lyniago.com footer | `Terms` → `#`, `About us` → `/about` | `Terms` → the terms page; `About us` removed | See D-42 §3 |

Nothing in `packages/design/**` changes. **Upstream ask:** a drawn terms entry in Settings and in the
merchant sign-in, and a website export with the Terms link and without About us.

**Not legal advice.** Like the privacy notice, the terms describe the system accurately but were not
written by counsel; have them reviewed before the public production listing.

---

## D-50 · Restaurant auto-accept: the confirming state, the ops call list, and "Collected" — APPROVED (2026-09-30)

**Owner instruction, this session (2026-09-30):** *"let the restaurant auto accept orders. rather than
removing order in 3 minutes. they can respond offline with customer but continue the order in the
platform for tracking"* — framed as change management from phone-based ordering to the app. The owner
then chose, in this session: ops calls the restaurant and the customer may call it; the rider search
starts near the end of prep time; the rider confirms pickup without a code; the restaurant (or ops)
edits items agreed by phone; and "Implement" on the five safeguards (no rider until the kitchen is
confirmed; pickup only at the restaurant; hours enforced by the server; ops tools; phone numbers only
with consent). Plan: `docs/plans/2026-09-30-restaurant-auto-accept.md`.

| Where | Mock | App | Why |
|---|---|---|---|
| Customer food tracker (`RC.track_*`) | Waiting-for-accept then Cooking | A **"Confirming"** state between them for auto-accepted orders: "Sent to {Restaurant}", free cancel, and a "Call {Restaurant}" row only when the restaurant agreed to show its number; an "{Restaurant} changed your order" notice after a phone-agreed edit | No mock draws an order accepted on the restaurant's behalf |
| Rider food job, at the restaurant (`RJM` pickup) | 4-digit pickup-code entry | For auto-accept restaurants, a **"Collected"** card; the server accepts it only within 150 m of the restaurant | The kitchen may not be in the app to read a code out |
| Merchant Orders (B1) and Cooking (B3) | New = ringing orders; Cooking ticket | An auto-accepted order sits under **New** with "Accepted for you" and **"Got it, we're making it"**; Cooking shows the customer's number and a **"Change items"** sheet | Not drawn in `handoff/merchant-mobile` |
| Merchant Account (C4) | Shop front · Opening hours · Preferred riders · Team · Help | Adds **"Taking orders"** (owner only): accept automatically, show our number to customers | Not drawn |
| Admin console | No food-ops queue | **"Orders to confirm"** call list (confirm · no answer · change items · can't make it) and a **"Taking orders"** section on the merchant page | Ops work the restaurants that don't use the app |

Nothing in `packages/design/**` changes. **Upstream ask:** draw the confirming state, the Collected card,
the merchant auto-accept card, the Taking orders settings and the ops call list.


## D-51 · Merchant branches: the switcher (C6), Add a branch (C7), and the not-live Orders home — APPROVED (2026-10-01)

**Owner decision, this session (2026-09-30 / 2026-10-01):** option 1 for owners with shops in several
places (*"option 1 is preferred"*: each branch is its own business, one login works in one branch at a
time; server in PR #999, plan `docs/plans/2026-09-30-multi-branch-owners.md`). The owner then had the
screens drawn from the brief and handed over the export (`design_handoff_merchant_branches`, 2026-10-01).
The export answers the brief's open question with **A**: an order rings only on the current branch's
devices; no alarm for other branches.

**The design-package sync (a record, not a deviation).** `packages/design/handoff/merchant-mobile/`
absorbs the export **verbatim**: the README is the export's updated D-48 README (new section F · Branches,
the C4 Branches row, C6/C7 in the fixed-parent map); the screens canvas (rows F and G) and the clickable
prototype; `reference/proto.js`; five Lucide assets (`check`, `chevron-down`, `circle-alert`, `map-pin`,
`store`); and `branches/` holding the delta README, the original brief, the work order and the 16 frame
screenshots. Tokens are byte-identical to the D-48 copy. Nothing in it is edited to match code.

**Recorded by the handoff itself (its README checklist):** 2026-10 · Merchant D-48 · Added C6 Branches
(sheet) and C7 Add branch, B1/D1 branch chevron + not-live state, C4 Branches row. New icon use:
chevron-down in the Orders header. API error copy for "outside area" reworded to "That address is
outside the area LyniaGo covers for now."

| Where | Mock | App | Why |
|---|---|---|---|
| "Not live yet" (C6 pill, B1/D1 state) | A branch "LyniaGo hasn't switched on" | Live = a **shop**, or a **restaurant** ops switched on (`pilotEnabled`) | Ops only ever switch restaurants on (the go-live switch refuses shops), so a shop read by the flag alone would never leave "Almost ready" and would lose Book a rider |
| B1/D1 not-live state | "After Create branch, or switching to a not-live branch" | Shown for **any business not live**, whatever its branch count (was: an owner with 2+ branches only) | Owner, 2026-10-06 (E2E FS-4, *"Reuse 'Almost ready'"*): a single new business was told "You're open" while customers couldn't see it. A not-live **shop** keeps "Book a rider" on its top card (owner, 2026-10-06: *"Keep 'Book a rider'"*; the API lets it book, merchant-v2 draws the card); the open switch and stat tiles stay hidden |
| C4 Account rows | Shop front · Opening hours · **Branches** · Preferred riders · Team · Help | D-50's owner-only "Taking orders" stays, after Branches | D-50 row, not drawn in either export |
| Three tap targets (C7 back chevron, the location card's "Change", the C7 banner's "Open WhatsApp") | 36px | `var(--target-min)` (44px); "Change" and "Open WhatsApp" keep the drawn layout with a −4px margin; C7 uses the shared AppBar's 44px back | **Upstream kit defect** (CLAUDE.md, owner decision D2 2026-08-20): a mock may not draw below the floor and the app never reproduces it. "Change" was already 36px in A4 (D-48); fixed there too, as it is the same component |

**Owner OK on both readings (this session, 2026-10-01):** *"Shops are live yes. Shop orders don't expire"*,
and "Almost ready" for owners with 2+ branches only ("Yes, 2+ branches only"; superseded 2026-10-06 by
*"Reuse 'Almost ready'"* for any business not live, E2E FS-4). The second half of the first
answer, that **shop customer orders don't expire**, is recorded for the shop customer surface (plan
2026-09-29 Phase 3); shops take no customer orders yet, so nothing here depends on it.

**Upstream ask:** redraw those three at ≥ `--target-min`.

---

## D-52 · Send a parcel: the stepped redesign replaces the one-sheet composer — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** the owner asked for the Send screen ("the screen after
you click send … where you put all the details") to be redesigned, answered a round of questions, had
Claude Design draw it, and handed the result back with *"here lets implement"*. Earlier in the same
session the owner set: *"the address for sending or current must be editable in the same place where it
displays map without going to another field … i am also removing the disclaimer entirely and also
removing landmarks"*, then chose, when asked: type in the row (no search screen); the address name is
the rider's label; a short summary before sending; steps; the sender phone stays a full prefilled field;
a big price with − / +; declared value removed.

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze
gates. The design package only *absorbs a new export* here. Nothing in it is edited to match code.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/send-compose-v2/` | The handoff, **verbatim**: `PROMPT.md` (the brief, whose decisions are final), `README.md` (tokens, components, the 17 states, interactions, validation, copy), and `design/` (the standalone HTML of every state at 360×720 and 320×640, and the `sc2-*.jsx` sources with the `S` copy object). |

### 2 · Authority for the customer Send flow (a scope rule)

For `app/send.tsx` the authority chain's LOOK is now this handoff, not the gallery's `LJ` composer
screens. Those gallery screens stay until an export redraws them, and they are **not aligned to**:

| Gallery screen | Now |
|---|---|
| `LJ.home_empty`, `LJ.home_pins` | Superseded by steps 1–4. Still wired to `app/send.tsx` for the parity render, with SUPERSEDED reasons in `tools/parity/rendered-conformance.pending.json` and as deferrals in `tools/parity/codegen/adopted.mjs` (the old `map` / `footer` generated regions were deleted with the sheet; deferral ratchet 77 → 75). |
| `LJ.home_expanded`, `LJ.addr_search`, `LJ.addr_map_confirm`, `LJ.addr_unavailable`, `LJ.disclaimer` | No counterpart any more (no expanded sheet, no search screen, no confirm-pin step, no disclaimer). PENDING with a SUPERSEDED reason in `tools/parity/parity-status.mjs`. |
| `LJ.on_hold` | The handoff's state 17 (deferral reason updated). |

### 3 · What changed in the app

- **Four steps** (`app/send.tsx`, `src/ui/send/*`): header "‹ Back · Send a parcel" with the step bar;
  Back walks one step back and leaves the flow from step 1 (Android back too); everything entered is kept.
- **Step 1 · Where:** the floating two-row address card over the full-bleed map. Tapping a row turns it
  into the input in place; the dropdown (Use my current location · results · Tap the map to set the pin)
  opens under it inside the card. Places autocomplete as you type; no key or offline → the device
  geocoder with the "Search is limited right now" row; a Places search that finds nothing also tries the
  device geocoder before "No matches". Picking commits straight to the row and moves the pin. Map taps set
  the active row's pin. Pins are the handoff's green circle / red square with "Pickup" / "Drop-off" labels,
  a 5px accent route, "Use my location" and the distance pill above the Next bar. Out of area: the row's
  "Outside our area" line, the calm notice, Next disabled.
- **Step 2 · What:** route strip, item cards (Qty − / +, Remove, "Add another item", the 10-item notice),
  rider note, sender phone (full field, prefilled), recipient phone with recent-recipient chips. Phone
  errors show on blur; the CTA hint names what is still missing.
- **Step 3 · Price:** the big suggested fare (tap to type), − / + $0.50 (floor $0.50), the band bar, the
  soft below / far-above warnings, "Cash to your rider".
- **Step 4 · Review:** route, items, note, phones, each with Edit; the price pinned in the CTA bar;
  "Send to riders" goes straight to the auction. A failed send shows the "Try again" toast with the same
  idempotency key; offline keeps Send disabled with "Connect to the internet to send."
- **Removed:** the disclaimer sheet and its consent flag (orders no longer carry `disclaimerVersion`; the
  API keeps accepting it, and sign-out still deletes the old device flag), the landmark fields (each
  stop's `landmark` is now the address name, so rider apps keep reading a non-empty label), declared value
  (sent as 0), the confirm-pin step in this flow (`AddressConfirmSheet` / `AddressSearch` stay for food
  checkout), the map-home top bar, the "Online as a rider" pill and the active-order banner (not drawn;
  live orders are reached from Home and Orders).

### 4 · Still different from the handoff

| Where | Handoff | App | Why |
|---|---|---|---|
| Send again (state 16) | Opens on the summary | Opens on the **first incomplete step** — normally step 2, because the recipient's phone is never carried in route params (a courier app keeps third-party numbers out of routing state); the banner shows on steps 2–4 | Opening on Review with no recipient would offer a send that can only fail |
| A pin with no geocoder answer | Not drawn | The row shows the pin's coordinates until a name arrives | A stop's label can never be empty (rider apps read it) |
| Send again banner date | Always drawn | Omitted ("Copied from your order. Check it, then send.") when the source order carries no date | Nothing to show |
| Map hint | "Or tap the map to set your drop-off" | The same; no hint is shown for an empty pickup (none is drawn) | Not drawn |

Evidence: `docs/parity/SEND-COMPOSE-V2-2026-10-01.png` (handoff left, app right, 360×720), produced by
`tools/parity/shoot-send-v2.mjs`.

**Upstream ask:** redraw the gallery's `LJ` composer screens (and `LJ.on_hold`) from this handoff, so the
gallery and the shipped flow agree again.

## D-53 · After Send: one order screen replaces the gallery's auction, tracking and end screens — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** the owner uploaded the Claude Design handoff for the
screens after "Send to riders" (`design_handoff_after_send`) with *"implement this . taking off from last
session for send screen redesign"*. The handoff's `BRIEF.md` records the owner's product decisions and
says they are final.

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze
gates. The design package only *absorbs a new export* here. Nothing in it is edited to match code.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/after-send/` | The handoff, **verbatim**: `BRIEF.md` (the decisions, final), `README.md` (tokens, anatomy, components, the 24 states, interactions, navigation, state), `CLAUDE-CODE-PROMPT.md`, `design/` (the standalone HTML of every state, `as-kit.jsx` with the `A` copy object, `as-screens.jsx`, `sc2-kit.jsx`) and `screens/` (2× PNGs of every state, plus the 320×640 re-checks). |

### 2 · Authority for the customer order screen (a scope rule)

For `app/order/[id].tsx` (customer view) the authority chain's LOOK is now this handoff. The gallery's
order screens stay until an export redraws them, and they are **not aligned to**: `LJ.auction_finding`,
`LJ.auction_live`, `LJ.auction_counter`, `LJ.no_riders`, `LJ.select_race`, `LJ.auction_expired`,
`LJ.rider_cancelled`, `LJ.track_active`, `LJ.track_code`, `LJ.track_paused`, `LJ.track_dark`,
`LJ.cancel`, `LJ.cancelled`, `LJ.undelivered`, `LJ.delivered_rate`, `LJ.rate_undo`, `LJ.completed`
(SUPERSEDED reasons in `tools/parity/parity-status.mjs` and `tools/parity/rendered-conformance.pending.json`;
⏭ rows in `docs/PIXEL-PARITY-TRACKER.md`). The `[BOTH]` safety screens (`LJ.sos_*`, `LJ.report*`,
`LJ.trip_help*`, `LJ.phone_masked`) also serve the rider job screen and are left as they were.

### 3 · What changed

- **App — one screen** (`app/order/[id].tsx`, `src/ui/order/{copy,kit,cards,stages,panels,OrderMap,OrderSheet}.tsx`,
  `src/logic/order-stage.ts`): the Send header (Back · per-stage title · red Help on live trips), a
  full-bleed map (green dot / red square / 5px route, the new ink rider marker with name pill, paused
  "Last seen" variant, the dotted line to pickup, the finding rings), and a sheet with the per-stage peek
  heights and a full snap. Every string comes from `copy.ts` (the handoff's `A`, verbatim). States 1–19
  as drawn; Back closes a panel, then collapses a full sheet, then leaves (Android back too).
- **"Send to riders" replaces into the order** (`app/send.tsx`), so Back never lands on Review.
- **Removed:** the order-id title and status pill, the vertical timeline, sort chips, the full-width
  "Choose this rider", the counter card with Decline, the map box with Expand / Recenter, the
  "Re-issue delivery code" button, the separate expired / no-riders / rider-cancelled screens, "Raise
  price & send again" opening a new order, the separate rating card, the gold pin, the "You're matched"
  / "Delivered!" toasts and the SOS pill (its job moved into Get help's Emergency row, which still
  alerts the safety team). Deleted: `AuctionClock`, `CounterOfferCard`, `PickupPhoto`, `ReceiptCard`.
- **API (the handoff's "Needs backend"):** `POST /orders/:id/price` raises an open order's price in
  place (the window keeps running, riders are re-pinged); `POST /orders/:id/resend` is the one-tap
  retry (re-prices an already-open re-broadcast of the order, else clones it at the new price);
  parcel rating tags (`ParcelRatingTag`); the snapshot's `riderCard` (name, photo, rating, plate =
  vehicle info, Verified = KYC verified) for the customer.
- **Root offline strip** stands down while the order screen draws its own ink banner (state 19).

### 4 · Still different from the handoff

| Where | Handoff | App | Why |
|---|---|---|---|
| Delivery code | 4 digits ("4182"); hand-off boxes 64×80 (54×70 < 340px), card digits 30/800 | The real code is **6 digits**; the hand-off boxes shrink to fit the sheet (≈43px at 360, 36px at 320) and the card digits come down to fit beside "Share code" — never truncated | The code length is a server security property; the drawn sizes don't fit six |
| Code missing on a live order | Not drawn (the "Re-issue" button is removed) | The screen issues a fresh code once, by itself, so the card is never empty | A code card with no code would strand the hand-off |
| Rider cancels before pickup | State 13 retry | The server still opens a re-broadcast at the same price at once; the screen stays on state 13 instead of jumping to it, and "Send again at $X" re-prices and opens that auction | No second auction for one parcel |
| "Send again" on completed / not delivered / cancelled | Not specified | Opens the Send flow prefilled (D-52's Send again) | Only the retry stages are one-tap |
| Grabber | "Drag or tap the grabber" in a 16px row | Drag only (and screen-reader expand / collapse); not a tap target | A 16px tap target is below `--target-min` (CLAUDE.md D2) — **upstream**: draw the grabber row ≥ 44px or drop "tap" |
| "3 riders have seen it" | `seenCount` | The live count of online riders near the pickup (`ridersNearby`) | No per-order seen count exists yet |
| ETA per leg | Live ETA | Straight-line distance at 22 km/h × 1.3 road factor (`logic/eta.ts`), from the last fix | No routing engine |
| Share my trip | A live link | A text message with the route and the rider | No public trip link exists yet |
| Raised fare on riders' boards | — | Riders who already hold the card see the new fare on their next poll | No WS event updates a board card's fare yet |
| "You rated Tendai ★★★★" on Trip complete | Drawn | Shown only in the session that rated | The snapshot does not carry the rating yet |
| Map | Drawn streets | The real map (grey in the parity render) | — |
| `/dev/order-states` route | Asked for by the prompt | Not shipped; `tools/parity/shoot-after-send.mjs` renders the states from fixtures instead | No dev-only route in the production bundle |

Evidence: `docs/parity/AFTER-SEND-2026-10-01.png` (handoff left, app right, every state at 360×720 and
the four 320×640 re-checks), produced by `tools/parity/shoot-after-send.mjs`.

**Upstream asks:** redraw the gallery's `LJ` order screens from this handoff; draw the delivery code at
six digits; make the grabber row clear `--target-min` or drop "tap the grabber".

### 5 · The v2 round (2026-10-01) — corrections + the states v1 didn't draw

**Owner instruction, this session:** the owner sent the v1 gaps back to Claude Design (the prompt and
materials are in `packages/design/handoff/after-send-v2/PROMPT-v2.md`), uploaded the answer
(`design_handoff_after_send_v2`) with *"claude code has designed the gaps you gave"*.

| Path | What |
|---|---|
| `packages/design/handoff/after-send-v2/` | The v2 handoff, **verbatim**: `README.md` (the v2 spec + changelog per state, peek floors, share and push copy, gallery map), `PROMPT-v2.md`, `BRIEF.md`, `CLAUDE-CODE-PROMPT.md`, `v1/README-v1.md`, and `design/` (the standalone HTML with every v1 + 2.x state at 360×720, 320×640 and font scale 1.3; `as-kit.jsx` with the updated `A`; `as-screens.jsx`; `as-v2.jsx`). It supersedes `after-send/` as the LOOK for `app/order/[id].tsx`; `after-send/` stays as the v1 record. |

**What v2 resolved from §4 above:** the code is drawn at six digits (3+3, "418 290"); the grabber row is
28px with a 120×44 tap/drag target above the sheet edge (tap toggles; "Show more" / "Show less");
state 13 is redrawn as the re-broadcast's finding state ("Tendai had to cancel." · "Raise to $3.86");
the "Re-issue" gap is drawn as "Getting your code…" (2.14); "You rated Tendai ★★★★ Good" comes from the
snapshot now; Share my trip shares text (no link). Those §4 rows no longer apply.

**What changed in the app:** every 2.x state (2.1 opening · 2.2/2.3 load errors · 2.4 the saved copy on
an offline cold start · 2.5/2.6 raise in flight / failed, non-optimistic · 2.7 · 2.8 notify confirmed /
unavailable · 2.9 choose in flight + slow · 2.10 the 15 s choose grace · 2.11 offer variants · 2.12 no GPS
fix · 2.13 rider card variants · 2.14 · 2.15 no number yet · 2.16 the photo viewer · 2.17 Report a problem
· 2.18 back from the emergency call · 2.19 · 2.21/2.22/2.24 failures with "Try again" · 2.23 no reason
pre-selected · 2.25 rate a completed trip within 7 days · 2.26 · 2.27 receipt variants · 2.29 reasons +
bodies · 2.30 · 2.31 · 2.32 font scale: buttons grow, labels wrap, header title ellipsises), the measured
peek with the README's floors, and the CHANGED v1 states. **API:** the snapshot's `rating`; rating an
auto-closed order within 7 days (side effects once); new offers refused after the window, choosing allowed
for 15 s more (`OFFER_CHOOSE_GRACE_MS`), expiry deferred while offers are pending; parcel push copy from
the README table (never the delivery code). The order screen keeps its last snapshot on disk
(`net/order-copy-store.ts`, wiped with the query cache at sign-out) for 2.4.

**Still different from v2:**

| Where | v2 | App | Why |
|---|---|---|---|
| 2.33 Home live-order bar | A 60px white card per stage; "Rider at the drop-off · Code 418290" | Home keeps Calm Mint v2's live-order bar (no code) | **Settled (owner 2026-10-02): superseded by Calm Mint v2 — see D-67.** Not built |
| 2.34 "Arriving" push | "Tendai is at the drop-off" | Not sent; the `en_route_dropoff` push stays "On the way to drop-off" | The server has no arrival signal — `en_route_dropoff` fires when the rider leaves the pickup |
| 2.34 ETAs in pushes | "Arriving in about 6 min", "About 12 min" | Dropped (the offer push keeps the bid's ETA) | The server has no live ETA |
| 2.34 LyniaGo-cancelled push · 18c / 2.31 | Push: "Open to see why. Nothing to pay."; screens 18c / 2.31 leave "Nothing to pay." out | Push as drawn; the LyniaGo-cancelled sheet (18c, 2.31a/b) also shows "Nothing to pay." (`A.nothingOwed`, the 18a row) | **Settled (owner 2026-10-02): say it in both.** The push and the screen share the sentence verbatim; `cancelled-nothing-to-pay.test.tsx` pins both |
| 2.4 saved copy | Any stage | Saved per status change while the order is live; the code card still works from SecureStore | — |
| 2.17 Report a problem | "Tell us more · Optional" | When left empty, the picked type is sent as the description | The support case requires a description |
| 2.18 | The note shows when the app becomes active again | Shows as soon as Emergency is tapped (the dialer is in front) | Same outcome without an AppState listener |
| Part 3 — the gallery | Delete the old LJ order screens, register the v2 ids | Not done here | `packages/design/` mirrors the design tool: the gallery changes with a design export (CLAUDE.md). The old ids stay SUPERSEDED |
| `/dev/order-states` | Every v1 + 2.x frame | `tools/parity/shoot-after-send.mjs` renders them from fixtures | No dev-only route in the production bundle |
| Map | Drawn streets | The real map (grey in the parity render) | — |

Evidence: `docs/parity/AFTER-SEND-V2-2026-10-01.png` (v2 handoff left, app right).

**Upstream asks (v2):** export the gallery with the v2 ids; ~~settle 2.33 against home-8c~~ (settled,
D-67); ~~confirm "Nothing to pay" for LyniaGo cancels~~ (settled 2026-10-02: on the screen and in the push
— redraw 18c / 2.31 with the line); confirm the 999 number and support hours with ops.

**Owner decisions 2026-10-02 on the v2 round's open items:** (1) "Nothing to pay." in both the
LyniaGo-cancelled push and screen (row above); (2) a late rating within the 7-day window **replaces** the
auto-close's +2 reliability credit — reversed once, then the rating's normal effect (API only:
`orders.auto_close_reliability_credit`, migration 0069; `docs/ARCHITECTURE.md` § order lifecycle);
(3) 2.33 superseded by Calm Mint v2 (D-67).

---

## D-54 · Rider v2: the rider app, both Account tabs and Settings follow the rider-v2 handoff — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** the owner briefed Claude Design on the rider side (the
brief asked for the rider app in the new Send / After Send style, plus a joint Account redesign with a
visible Customer | Rider switch and Settings separated by role), answered its clarifying questions
(switch = a toggle at the top of Account; Settings = one screen, sectioned; always-online stays; all four
priorities — map + demand on the board, earnings first on Money, a simpler active job, standing
visible; rider-only settings = job alerts, navigation app, top-up number, bike & documents; design both
food states; histories split by side), then uploaded the result (`Lynia_Design_System_-_rideer_side.zip`,
`design_handoff_rider_v2`) with *"here is the design . please proceed with implementation"*. The
handoff's `BRIEF.md` records the decisions and says they are final.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/rider-v2/` | The handoff, **verbatim** except its `tokens/` copies (left out: they are older copies of `packages/design/tokens/*.css`, which stays the one token source): `BRIEF.md` (the decisions, final, and four open questions), `README.md` (the spec: global rules, components, every state J1–S6, state management, motion), `PROMPT.md` (the brief Claude Design was given), `CLAUDE-CODE-PROMPT.md` (the phased build plan) and `design/` (the standalone HTML with every state, `rv-kit.jsx` with the `R` copy object, `rv-board.jsx`, `rv-job.jsx`, `rv-money.jsx`, `rv-account.jsx`, and the After Send / Send v2 kits it builds on). |

### 2 · Authority (a scope rule)

The LOOK for `app/rider/**`, `app/wallet/top-up.tsx`, `app/settings/index.tsx`, `app/history/index.tsx`
and BOTH Account tabs (`app/(tabs)/account.tsx`, `app/rider/(tabs)/account.tsx`) is now this handoff.
The gallery `RJM` / `RJ` rider screens it lists as replaced, and the gallery `LJ` Account/Settings
screens, stay until an export redraws them and are **not aligned to**. This retires **D-15, D-16, D-17,
D-22, D-25 and D-26** (the Account/Settings harmonisation, the switch row, the "Money" back label, the
role-separated rows, the settings card and the inert identity card): the handoff draws all of those
decisions anew. D-29 (the rider board's 8c header) is superseded by the board's MintTop when the board
lands; D-30 (no manual refreshing anywhere) stands and the handoff draws it too.

### 3 · What has landed (part 1, this PR)

- **Shared rider kit** (`src/ui/rider/kit.tsx`, `copy.ts` = the handoff's `R`, verbatim, with the sample
  values as formatters): MintTop (one-line 22/700 greeting, 18 under 340dp; Conn; sun/moon hidden under
  340dp; 44px bell), RCard / RRow, Seg + RoleToggle (48px, selected = `--cta-fill`), IdentityCard,
  Standing, MSheet, LRow, Chips, CashSplit / CashLine, BecomeCard, RStepBar, PushHeader, CentreState.
  After Send / Send v2 parts are reused (SmBtn, CtaButton, CtaBar, IconDisc, OrderHeader, Notice,
  Countdown). Twelve Lucide glyphs added to the icon subset.
- **Tab bar** (both sides): the active icon sits in a 52×26 `--accent-wash` pill; labels 12; Home uses
  the House glyph and Money the Wallet glyph, as drawn.
- **Rider Account (C1–C5)**: tappable identity card → `/profile?side=rider`; Customer | Rider toggle;
  the standing card (real strikes from `/auth/me`); Job history · Notifications · Help & support ·
  Settings. Customer → the C4 confirm (goes offline: that is what stops dispatch — the "active side" is
  the rider's online flag) or, with a job running, C5 (stays online, "Back to my job").
- **Customer Account (C6–C11)**: the sibling; the toggle for riders, the Become-a-rider card
  (start / in progress / under review / failed) for everyone else; Trip history · Notifications ·
  Help & support · Settings. iPhone builds stay customer-only (D-41).
- **Settings (S1–S4)**: YOUR ACCOUNT → CUSTOMER → RIDER (riders only) → Sign out / Delete account last.
  Job alerts with Test ping / Test alarm (local notifications) and, when off, the danger box + Open phone
  settings; Location with the rider consequence; Navigation app (Google Maps | Waze, on the phone);
  Top-up number (provider + number, on the phone, prefilled into Top up); Bike & documents.
- **Job history / Trip history (C12/C13)**: one route, split by `?side=`; the rider list shows the fare
  (or "No fare") and a this-week summary; day groups.
- **Money (M1–M12)**: earnings first (Today | This week, the week strip), the balance card's five states,
  cash held, one history list (fares merged with commission and top-ups), infinite scroll; the pending
  top-up notices. "Load older" is gone.
- **Top up (T1–T6)**: Provider → Amount → Phone → Approve with the step bar, then Done / Failed.

### 3b · What has landed (part 2)

- **Jobs board (J1–J14)**: MintTop with the Conn dot and the detected place; a full-bleed map with the
  busy zones (dashed accent circles, the busiest labelled), a job pin per card (fare pill, selected =
  ink) and the rider's own marker; the board sheet (`OrderSheet`, peek 50% of the screen, 44% when
  empty) holding the notifications-off row, the stale / load-failed / no-fix notices, the active-job
  bar, YOUR OFFERS (offer sent, waiting, Withdraw → hidden at once with a 5 s Undo, then the API) above
  NEARBY JOBS (km to pickup, asking fare, route, trip km · item, Make an offer); the empty state (J4) with
  "Why is it quiet?" and the busy-zone pointer. Resolution toasts: not chosen, offer expired, taken. The
  "picked you" sheet (J11) is locked and opens the job. Always online; nothing to refresh.
- **Make an offer (O1–O4)**: its own pushed screen (`app/rider/offer/[jobId].tsx`) with the Send v2 price
  step — route strip, "<name> is asking", a tap-to-type fare in cents (− / + $0.50, min $0.50) with the
  usual-band bar and the well-above warning, ETA chips 5/10/15/20 (10 preselected), the one-offer notice,
  "Send offer · $x" + "Skip this job"; a failed send keeps the rider there with Try again.
- **Gates (G1–G14)**: one resolver (`logic/rider-gate.ts`) in the handoff's priority order, one Gate
  component (72 disc, title, body, facts box, primary / ghost / the "Order food and send parcels" bridge
  ghost). Every gate clears on its own when its input changes.
- **API**: `DELETE /orders/:id/offers/mine` withdraws a pending offer while the order is still open for
  offers (declined, with an offers-changed emit); open orders and the rider's order snapshot carry the
  customer's first name (`customerFirstName`) for "Rudo is asking" / "Rudo picked you!".

The gallery keys this replaces are recorded as SUPERSEDED deferrals in `tools/parity/codegen/adopted.mjs`
(`RJM.board`, `RJM.board_empty`, `RJM.offer_parcel`; deferral baseline 76 → 78) and as ⏭ rows in the
tracker. D-29 (the 8c board header) is superseded by the MintTop board.

### 3c · What has landed (part 3)

- **The active job (A1–A13, B1–B6)**: one shell for parcel and food (`src/ui/rider/job-kit.tsx`) — the
  After Send header with Help, a full-bleed map (the rider's "You" marker, the dotted line to the pickup),
  a sheet sized to its content and one primary. The step track (Pickup · Collected · Drop-off · Done), the
  StopCard (Call · WhatsApp · Navigate in the app chosen in Settings), the cash line / CashSplit and
  "Problem with this job?". The server's own steps the handoff draws no tap for are advanced by the screen
  (accept → heading to pickup on open; collected → heading to the drop-off), and "I'm at pickup" /
  "I'm at the drop-off" / "I'm at the kitchen" are on-device arrival marks per order that survive an app
  kill (`logic/rider-job-stage.ts`).
- **Pickup check (A2–A6)**: the item ticks, then the pickup photo — the phone's camera, a preview with
  "Use this photo" / "Retake", and "Photo saved" straight away; the upload runs behind it and an upload
  failure never blocks (kept on the phone, re-sent on the next foreground). Collect waits for a tick and a
  photo, with the hint saying what's missing.
- **Delivery code (A8–A12)**: its own page, six boxes 3 + 3 over the phone's number pad; wrong / last try /
  locked (Call the sender to re-send) / saved-offline.
- **Done (A13 / B6)**: "You earned", cash collected, commission at the configured rate, "How was <name>?".
- **Food (B1–B6)**: the kitchen StopCard (order # as the kitchen sees it, ready-in from the prep time),
  "Pay the kitchen $x now" at an upfront kitchen, the CashSplit to collect at the door, and the blocking
  "Return the cash" page with "Call the kitchen" until the kitchen confirms.
- **Exceptions (X1–X14)**: the Problem sheet (also the Help pill), can't reach the customer (the 10-minute
  wait with calls and WhatsApps counted, then Mark undelivered), the five undelivered reasons, cancel (with
  the strike count, or the one-strike-from-a-pause warning), drop a food job, the customer-cancelled and
  undelivered terminals, connection lost (and after 4 minutes), job restored, Call 999, help requested.
- **Food offer (F1–F4)**: FoodHeader, the map, the countdown pill and bar off the server's `expiresAt`,
  the FOOD tag, the kitchen, "Your fare", the stops or (upfront) the two money tiles, Accept / Not this one,
  and the expired state.
- **API / shared**: `UndeliveredReason` gains `other` (X4 draws a fifth reason); the customer's terminal
  already falls back to "Delivery not completed" for a reason it has no line for.

The gallery keys this replaces are SUPERSEDED deferrals in `tools/parity/codegen/adopted.mjs`
(`RJM.active_parcel`, `RJM.active_food`, `RJM.handoff`, `RJM.offer_food`; their generated CashStrip and
offer-card views are deleted; deferral baseline 78 → 76) and ⏭ rows in the tracker.

### 3d · What has landed (part 4)

- **Bike & documents (S5)**, from Settings → RIDER: National ID · Rider photo · Bike (the plate), each
  "Verified" while the rider's check holds; "Changed bikes? Re-verify with the new plate." and the ghost
  "Re-verify my bike", which asks support on WhatsApp with the plate written out (no self-edit endpoint).
- **Help & support (S6)**, rider side (`app/rider/help.tsx`, from the rider Account): Message us on
  WhatsApp · Call LyniaGo support · the 24-hour safety line · COMMON QUESTIONS, each question opening
  WhatsApp with the question written out. The customer Account keeps the gallery's adopted Help hub
  (`LJ.help`).
- **Customer Home live-job bar (C5)**: a verified rider who switched to the customer side mid-job sees
  "Job in progress · <stage>" on Home, which returns to the job.

### 4 · Still different from the handoff (part 1)

| Where | Handoff | App | Why |
|---|---|---|---|
| Acceptance % and "oldest strike clears on" (Standing) | "92%", "clears on 19 Oct" | "—", and the sentence ends before "Your oldest strike…" | No endpoint serves either yet (`src/api/rider-v2.ts`, `TODO(backend)`) |
| Earnings, cash YOURS | Server figures | Derived on the phone from the rider's delivered jobs (`logic/rider-earnings.ts`): a delivered job's agreed fare, by the order's creation time | No earnings aggregate by day exists; `/orders/history` is capped at 50 rows |
| Undelivered job in Job history | "+$1.50" | "No fare" | An undelivered parcel was not paid for at the door |
| "You cancelled · strike" row | Drawn | "Cancelled" | The history row doesn't say who cancelled |
| Food filter chips | Drawn | Shown only with food dispatch on, as the handoff says for J3/M4 | — |
| BecomeCard "in progress" | "2 of 3 steps done. Next: your bike photo." + a 66% bar | "You started the ID check but didn't finish. It takes about 3 minutes." (the handoff's own `gUnfinishedB`), no bar | The app doesn't know which step the rider stopped at |
| Top-up number edit sheet | Not drawn | A sheet with the provider chips, the number field and "Save" | The row needs somewhere to edit; one undrawn string (`save`) |
| Test alarm | The looping food-offer alarm | One local notification with sound + a strong haptic | No alarm sound ships yet (see "Food-offer alarm" below) |
| `/dev/rider-states` | Asked for by the build plan | Not shipped | No dev-only route in the production bundle (as D-53) |
| Job tags on the board (owner 2026-10-01) | PARCEL and FOOD drawn | PARCEL · FOOD · SHOP; SHOP (a business's booking, named for the business) in the highlight wash (`shop`) | Owner: "food jobs and shop jobs and send package jobs all appear there with tags" |
| Food job on the board (owner 2026-10-01) | Food only rings full screen | The food offer the server is holding for this rider is also a FOOD card ("your fare", "Accept this job" → the offer) | Food is dispatched to one rider at a time, so the board shows the one this rider can take |
| Board count with mixed kinds | "4 parcels near you" | "N jobs near you" (`jobsNearYou`) when food or shop jobs are among them | The parcel wording would be wrong |
| Usual-band bar (O1) | Server band for the trip | A band derived on the phone from the asking fare (`fareBand`) | No fare-band endpoint |
| Unknown sender name | "Rudo" | "The sender" (one undrawn string, `theSender`) | An order whose customer has no first name on file |
| Force update (G15) | A gate on the board | The app-wide force-update screen, which runs before any tab mounts | Already shipped; same copy |
| Pickup camera (A3) | An in-app viewfinder with a 72 shutter | The phone's own camera; the preview (A4) and saving (A5) are in the app | Taking a photo is the phone's job; no camera module ships in the app |
| Recipient name (A7–A8) | "Chipo M. · recipient", "Ask Chipo for the delivery code" | "Recipient", "Ask the recipient for the delivery code" (`recipientRole`, `theRecipient`) | Send v2 collects the recipient's phone, not their name |
| Kitchen pickup code (B2) | Not drawn | "Ask the kitchen for the 4-digit pickup code" + four boxes, unless the kitchen is auto-accept | The server only releases the food against the kitchen's code |
| Collect at a kitchen not paid up front (B2) | Only "I've paid and collected the food" is drawn | "I've collected the food" (`collectedFood`) | The handoff says non-upfront kitchens skip the pay step |
| Cash handshake at the door (B4) | Not drawn | The existing confirm-cash card before the code on a cash order | The customer and rider both confirm the cash before the code is accepted |
| Can't reach the customer, food (X3) | The parcel timer | The existing no-show card (logged calls + the server's wait) in a sheet | The food no-show is server-timed and needs logged calls |
| Food undelivered (X5) | Terminal only | The terminal plus the existing "return the food to the restaurant" card | The food is still on the bike until the kitchen confirms it back |
| Live notices on the job | Not drawn | "Location is off…", "The customer's app looks offline…", a shop's cash-on-delivery line | The app already knew these states; each is a calm or warn notice at the top of the sheet |
| Cancel reason | Not drawn | No reason is captured (the old free-text field is gone) | X6 draws none |
| Get help from LyniaGo (X14) | Toast "Our team will call you within 5 minutes" | Opens a support case for the order, then the toast | The case is what tells the team to call |
| Food-offer alarm | A looping sound, full screen over the lock screen | A strong haptic repeated every 4 s while the offer is live | No alarm sound or full-screen intent ships yet; the offer still arrives as the `food_offer` push and on the board |
| Post-trip "Report" / "Get help" on the done page | Not drawn | Removed (the Problem sheet holds both during the job) | Not drawn ⇒ not rendered |
| Document dates (S5) | "Verified · expires 12 Mar 2028", "Verified · Aug 2026", "Honda CG125 · ABH 4721" | "Verified" and the plate only | KYC stores no document expiry, verification date or bike model (`TODO(backend)`) |
| Licence disc row + renewal box (S5) | Licence disc "60 days" + "Your licence disc expires in 60 days…" + Update photo | Not rendered | No licence-disc record exists (`TODO(backend)`); the row appears the day one does |
| Support phone (S6) | "+263 242 700 100 · 7am–9pm" | The safety line's number, the only staffed line configured | No separate support number is configured |
| Common questions (S6) | Three rows | Each opens WhatsApp with the question | There are no help articles to open |
| Live-job bar position (C5) | Not drawn (described in the switch rules) | A filled 44 SmBtn above the service tiles, the same bar the Jobs board draws | The handoff names the bar and its copy but draws no Home frame |
| "Finish verifying" wall (G3) — startup review 2026-10-06, R-1 | "Finish verifying" + the customer bridge | Also the WhatsApp ghost the failed wall (G4) draws (`whatsappSupport`, an existing string) | A check that won't finish (a dead vendor session, a phone that can't open it) needs a way out besides the resume |
| Declined wall (G4) body — R-6 | "The photo of your ID was blurry. Try again in good light, with all four corners showing." | That, unless the decline carries a known reason other than an unreadable photo: then "‹reason›. Check this, then try again." (`RF.gFailedWhyB`, one undrawn formatter; the reason is the shared `KYC_DECLINE_REASON_LABELS` label) | A face-mismatch rider was told to retake a blurry photo and could spend their last try on it |
| Become card, failed (C9) body — R-6 | "The ID photo was blurry. You have 1 try left." | Same rule: "‹reason›. You have N tries left." (`RF.kycFailWhyB`, one undrawn formatter) for a known reason | Same as above |
| Become card, both tries used — R-10 | Not drawn (only the one-try-left failed card is) | The board's own G5 copy on the card — "We still couldn't verify your ID", "You've used both tries…" — and "Message support on WhatsApp" (all existing strings) instead of "Try again" | The server refuses a third try; "You have 0 tries left" + "Try again" was a dead end |
| Held for review (Didit In Review, a review-band face match, an ID collision) — R-3 | Not distinguished | The "under review" wall (G2), like manual review; `/auth/me` serves `rider.kycHeld` | "Usually under a minute" (R2) is false while a human reviews it. See also D-55 §4 "R2" |

### 5 · Still to land

Nothing from this handoff remains to build; the rows in §4 marked `TODO(backend)` fill in as their data
arrives.

**Open questions (BRIEF.md): all four decided by the owner on 2026-10-01.**

1. Food, shop and parcel jobs all show on the board, tagged.
2. Busy zones come from orders pending and in progress (`GET /orders/demand`: the last hour's waiting
   and on-the-road orders near the rider, grouped into ~1 km cells, the busiest three).
3. No limit on withdrawing an offer.
4. The "picked you" sheet stays as built: it opens on its own, locked, the moment a customer picks the
   rider, and its only action opens the job. No 10 s timer.

**Food dispatch: the best 10 first, then everyone (owner, 2026-10-01).** A ready food order used to
ring one rider at a time for 60 s. Now each 60 s round rings several riders at once and the first to
accept gets it:

- **Round 1** goes to the best 10 eligible riders within 8 km: the restaurant's own riders first (L3,
  within 2 km of the nearest), then the nearest.
- **Every round after** goes to everyone eligible.

Eligible means online, verified, in good standing, not on a ride and not owing a restaurant cash. A
rider who taps "Not this one" (or drops the job) is never offered that order again. A rider who just let
a round run out is offered the next one.

The NO_RIDER cap is unchanged: six rounds, then the kitchen's hold screen. Policy lives in
`RESTAURANTS_DISPATCH` (`firstRoundSize`, `radiusM`). The round logic is in
`merchant/food-dispatch.service.ts`, and the transitions table records each edge.

Because a round now rings many riders, the old C3 lock (a rider with a food offer ringing could not bid
on a parcel) is gone. Otherwise every rider near a kitchen would be shut out of parcels while it
searched. The one-active-ride rule still stops a rider from holding both. The rider app needed no change:
the offer screen already says "another rider took it" when a round closes on someone.

**Paying the kitchen up front: allowed for every rider (owner, 2026-10-01).** A kitchen set to "pay me
up front" is offered to any eligible rider. The offer shows "Pay the kitchen" and "Collect at the door"
before they accept (F2), and the job asks them to pay first (B2). No rider is filtered out by cash
rule.


---

## D-55 · Calm Mint v2: the customer Home, customer onboarding and rider onboarding follow the calm-mint-v2 handoff — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** the owner briefed Claude Design on the customer Home
and both onboarding flows (a combined brief with screenshots of every current screen, the lyniago.com
style pack and the tokens), answered its clarifying questions, and uploaded the result
(`Lynia_Design_System_-_home.zip`, `handoff/calm-mint-v2-2026-10`) with *"lets build the designs
here"*. The decisions the owner gave in that brief are final:

1. Match the website's accent colours and vibrancy, with a stronger local feel.
2. "Free delivery" is merchant-funded: the venue pays, the rider is paid in full.
3. The designer chooses the layout for the discovery sections (it chose two rails, Free delivery as a tag).
4. Four service tiles: Send · Restaurants · Shops · Pharmacy.
5. No national ID at customer sign-up; it is optional, later.
6. No role choice screen: everyone starts as a customer; "Ride with LyniaGo" is the secondary path.
7. Riders need only the Didit ID check to start; licence and bike papers are optional, later, in Account.
8. The first top-up is waived: commission-free first jobs, then the prepaid-balance gate.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/calm-mint-v2-2026-10/` | The handoff, **verbatim**: `README.md` (tokens, H1–H6, C1–C5, R1–R3, NEEDS BACKEND, retires), `CLAUDE-CODE-PROMPT.md` (the work order), `Calm Mint v2 - all screens.html` + `shared.js` / `mint2.js` / `calm-mint-v2.js` (the pixel reference; `?screen=H1` … `R3` renders one screen at 360px), the four v2 service stickers, four illustrations, fonts and sample food photos. |
| `packages/design/tokens/colors.css` | `--highlight` **#f2b705 → #ffd23f** (and `--highlight-border` with it) — the handoff replaces the gold everywhere; the admin and merchant faces follow (token-conformance). New: `--forest`, `--on-forest-muted`, `--star-stroke`, `--free`, `--coral`, `--sky`, `--tile-send/-food/-shops/-pharmacy`, `--rider-wash`, `--highlight-chip-wash`, `--kind-*`. |

### 2 · Authority (a scope rule)

The LOOK for `app/(tabs)/home.tsx` (and the location / notify-me sheets it opens) is now this handoff,
H1–H6. Customer onboarding (`app/onboarding.tsx`, `app/phone.tsx`, `app/verify.tsx`,
`app/profile/setup.tsx`, `app/role.tsx`, `app/permissions.tsx`) aligns to C1–C5 and the rider's first
run to R1–R3 as those parts land. The gallery `RC home` (home-8c) and the gallery first-run screens the
handoff retires (`LJ onboard*`, `LJ role_select*`, `LJ register`'s ID field, `LJ perm_loc`/`perm_notif`
as standalone screens, `RJ kyc_intro`) stay in the gallery until an export redraws them and are **not
aligned to**. This retires **D-28** (the 8c home sync and its two undrawn sheets — both are drawn now)
for Home. D-13 (no send-again rail) stands: the handoff draws none. The rider-v2 handoff (D-54) keeps
the KYC gates on the job board; its "live-job bar" for a rider in customer view (C5) is a sibling of
this bar and lands with that work.

### 3 · What has landed (part 1 Home, part 2 customer onboarding, part 3 rider onboarding)

- **Art:** the four v2 stickers and four illustrations are transcribed node for node into
  `react-native-svg` by `apps/mobile/scripts/svg-to-rn.mjs` (`src/ui/art/`, generated; c2pa metadata
  dropped). Metro has no SVG transformer, so this is how "use the SVGs verbatim" is honoured.
- **Home (H1–H6)** (`src/ui/home/kit.tsx`, `copy.ts` = the handoff's `H`, verbatim): the mint header
  with three decorative circles, the address control → location sheet, the 44px bell, the one-line
  greeting with the name in green (wraps under 340dp, H3), the 48px search; four tiles (64px / 44px
  sticker / "Food" under 340dp); the "Popular restaurants" rail of 148px cards; skeleton rails on
  first load (H4); the H6 card with no address; ONE forest live-order bar 12px above the tab bar with
  "+N order(s)". The location sheet (H5) and the notify-me sheet (`H.notify`) are restyled to the
  drawing; the shared `HomeHeader` stays for the rider board (D-29, until D-54 replaces it).

- **Customer onboarding (C1–C5)** (`src/ui/onboarding/kit.tsx`, `copy.ts` = the handoff's `O`/`OB`,
  verbatim): C1 Welcome replaces the intro carousel (`app/onboarding.tsx`); C2/C3 the +263 phone screen
  (`app/phone.tsx`, `logic/zw-mobile.ts`); C4 the six-box code screen that submits on the sixth digit
  (`app/verify.tsx`); C5 First name + Surname with no national ID (`app/profile/setup.tsx`). The role
  choice screen is gone (`app/role.tsx` deleted): a new account starts as a customer, or as a rider when it
  came in through C1's "Ride with LyniaGo" (`logic/sign-in-route.ts`). Customers skip the permission
  priming screens — location is asked on Home, notifications right after the first order goes out
  (`src/push/ask-in-context.ts`, called from Send and food checkout).

- **Rider onboarding (R1–R3)** (`src/ui/onboarding/rider.tsx`, `copy.ts` `RO`): `app/rider/become.tsx`
  opens on R1 "Why ride" (hero, chips, the three-step checklist, "Start ID check"), then the rider photo
  step, then the in-app ID check. While the automated check runs the board shows R2 "Rider setup"; the
  first time a new rider opens the board verified it shows R3 "You're verified" once. API: the bike plate
  is optional (`bikeReg` optional on `POST /riders/become`, migration `0065_rider_bike_reg_optional`),
  per the owner's decision that riders need only the ID check to start.

### 4 · Still different from the handoff (parts 1–3)

| Where | Handoff | App | Why |
|---|---|---|---|
| Shops and Pharmacy tiles | "Everything is live", no SOON chips | No chip; the tile opens the notify-me sheet (Shops: the drawn `H.notify`; Pharmacy and a kill-switched Restaurants: the same drawing with their own title/body) | No shop or pharmacy vertical exists yet (README §5 "Customer shop list"); a tile must never be inert. Two undrawn title/body pairs |
| "Free delivery" tag | On cards whose venue funds delivery | Never shown | No `free_delivery` flag on venues yet (README §5); the work order says hide it when absent |
| "Popular shops" rail | Drawn | Hidden | No customer shop list yet (README §5); the work order says hide it when absent |
| "Popular restaurants" | "Most ordered near you" | The nearest open venues (up to 8) | No popularity ranking yet (README §5); the copy is the drawn string |
| Live bar title | "Tendai is on the way" | That, once the order is moving and the rider's name is on the phone; otherwise the order's status ("Heading to pickup", "Order placed", "On the way") | The active-orders API carries no rider name; one cached identity per phone |
| Live bar icon for a food order | Bike | Utensils | Tells a food order from a parcel at a glance; a bike disc on a "Golden Bao" bar reads as a parcel |
| Live bar tap | "Tapping it opens the Orders tab" | One order → that order; two or more → the Orders tab | Opening the list for a single order is an extra tap |
| Offline | A muted banner under the header | The app-wide offline banner at the top of the screen | One banner owner (`_layout.tsx`); the rails keep their cached data either way |
| Location sheet | Search, current location, Home, Work, Add a place | The same, plus the existing one-line notes when location is off or a fix fails; "Add a place" focuses the search (saving a found place as Home/Work is the search's own job) | The sheet must still explain why "Use my current location" did nothing |
| C2 wrong prefix | Only the too-short line (C3) is drawn | A nine-digit number that isn't 71/73/77/78 gets "That doesn't look like a mobile number…" | Sending a code to a landline wastes a send; one undrawn line |
| C4 channel line | "Sent on WhatsApp to …" | That, or "Sent by SMS to …" when Bird fell back to SMS for this number | D-40: Bird Verify is WhatsApp-first with a per-number SMS fallback; a fixed "WhatsApp" would sometimes be false |
| C4 resend line after an SMS send | "Resend on WhatsApp" | That, or the screen's own "Send a new code" when the code went by SMS | "Resend on WhatsApp" beside "Sent by SMS" contradicts itself (E2E 2026-10-05 P-8); no new string — the locked state's drawn CTA copy. **Owner-approved 2026-10-06** |
| C4 "Fills in by itself" | Auto-read from the message | The input carries the platform autofill hints (`sms-otp`, `oneTimeCode`); a WhatsApp code is pasted or tapped in from the suggestion strip, and the sixth digit still submits | No app can read a WhatsApp message; true zero-tap needs WhatsApp's one-tap autofill template (NEEDS BACKEND, Bird) |
| C4 on a QA build | — | "Test build: code pre-filled." in place of the channel line | No message is sent on a QA build (console OTP); the drawn line would be false |
| C2 / C4 rate limit | No rate-limit state drawn | A toast "Too many tries. Try again in N min." (or "N h"), from the API's `retryAfter`, when a send or verify hits a cap (5 sends an hour per number, 3 new accounts a day per device). Other send/verify failures that aren't the number's or the code's fault (network, server) are a toast too; only a bad number paints C2's field red (C3) | Without the wait, the user saw "try again later" for up to 55 minutes, or a red "number" error that wasn't about the number. One undrawn line (start-up review 2026-10-06, C-9) |
| Privacy (SH7), opened from C2's footer before sign-in | Both action rows | Signed out, only "Request a copy of my data"; "Delete my account" is not shown | There is no account to delete before sign-in, and the deletion flow needs a session. The mock draws the signed-in screen |
| C5 | Two fields, the verified row, the note | The same, plus the existing "We saved what you'd filled in…" line when a draft is restored | A half-filled form survives an app kill (LC-C10); the line says why the fields are already filled |
| C5 exit | None drawn | None — the kyc-2026-08 "Use a different number" ghost is gone with `Register` | A mistyped number is fixed with C4's "Change" before the code is accepted |
| Rider path after sign-in | Permissions in context | Riders still see the location + job-alert priming screens (`/permissions?next=/rider`) before the rider app | A rider without location and job alerts cannot take work; the handoff's in-context rule is written for customers |
| R1 / R2 vendor name | "ID check with Didit", "Didit is checking your ID" | "ID check", "We're checking your ID" | D-38 (owner, 2026-08-22) stands: the app never names the verification partner; the handoff's brief named it by mistake |
| R1 note | "No top-up to start. Your first jobs are commission-free. Licence and bike papers can wait." | "Licence and bike papers can wait." | The free-jobs rule doesn't exist on the server yet (README §5); the first two sentences would be false. They render once it does. **Resolved by D-70 (2026-10-02):** drawn in full against a server that serves the rule |
| R3 meter | "Commission-free jobs · 5 of 5 left" card | Not drawn | Same: NEEDS BACKEND · free-jobs rule. Until then a new rider at a $0 balance still meets the top-up gate after "Go online". **Resolved by D-70 (2026-10-02):** drawn from `/auth/me` `rider.freeJobs` |
| R1 → ID check | "Start ID check" opens the check | "Start ID check" opens the rider photo step first (the existing capture + review), then the check | The rider photo is uploaded before the vendor session is opened (`POST /riders/become` needs it); R2 draws the photo as done before the check, so this is the handoff's own order |
| Photo step | Not drawn | "Rider photo for your profile", the capture/review card, and — only when the account has none on file — the name and national-ID fields | Rider onboarding needs a national ID on the profile (one-ID-one-account) and C5 no longer collects it; Didit prefill is NEEDS BACKEND. **Superseded by D-75 (2026-10-03):** no ID is typed; the check supplies it, and only a nameless account sees a name step (C5's grammar) |
| R2 | Every pending check | Only while the automated check is with the vendor; manual (ops) review — and since 2026-10-06 (startup review R-3) a check HELD for a human review (`rider.kycHeld`: Didit In Review, a review-band face match, an ID collision) — keeps the Rider v2 wall | "Usually under a minute" is false for any human review |
| Become → board (startup review 2026-10-06, R-2 / R-5) | "Start ID check" → the check → R2 | From the board's "Earn with your bike" gate, Become returns to that same board; from Account it goes through the rider permission priming (`/permissions?next=/rider`, which forwards at once if this phone already primed) — the same as C1's rider path | A second board was mounted under the first; from Account, R2's "We'll notify you" couldn't arrive without the notification permission |
| R3 | After verification | Once per account per phone, and only for a rider with no trips yet | No verified-at date is served; a rider with trips is not "just verified" |

### 3c · What has landed (part 3: Search, 2026-10-02)

- **App.** `app/food/search.tsx` is the shared `BrowseSearchScreen`, scoped by the route: `?scope=all`
  from Home's search bar searches every switched-on section; anything else searches Restaurants (X3).
  Shops and Pharmacy keep their own scoped search (`ShopSearchScreen`, D-58). The storefront's
  "Search all restaurants" carries its query as `?q=`. X1 recent searches (kept on the device, at most
  six) and the popular chips; X2a groups RESTAURANTS · SHOPS · PHARMACY · DISHES & ITEMS, three each with
  "See all n"; X2b the "Send a parcel" row for parcel words; X3 PLACES + DISHES; X4a no results; X4b the
  offline note over the recent searches. 300 ms debounce, two characters minimum (work order §3). A hit
  opens its storefront in its own section; a shop item only browses until Order flow v2 (D-58).
- **API.** Home composes the existing searches — `GET /restaurants/search` and each switched-on
  section's `GET /shops/search` in parallel; a section that fails answers empty rather than failing the
  rest. New `GET /restaurants/search/popular` backs "Popular near you": the five dishes most ordered at
  live restaurants over 30 days (three orders or more). Restaurants only — shops take no app orders yet.
- The old `RestaurantRow` / food `FoodThumb` the previous search used are deleted.
- **Evidence:** the same sheet, rows X1, X2a, X2·320, X2b, X3, X4a, X4b.

### 4c · Still different from the handoff (part 3)

| Where | Handoff | App | Why |
|---|---|---|---|
| X2b's line under the Send row | Drawn as a literal in the screen (`No restaurants, shops or items match “documents”.`), not in `B` | The same words, with the query | Mock copy verbatim; it lives in the screen because the handoff's `copy.ts` has no key for it. |
| Popular chips | Five sample terms, across services | The live five most-ordered restaurant dishes, or none | README §3 "honest data": no chips beat invented ones, and shops have no orders to rank until Order flow v2. |
| An item hit | Adds to the cart | Opens its storefront | Restaurants: the storefront is where the item sheet and + live. Shops: D-58, browse only. |

### 5 · Still to land (follow-up PRs, same handoff)

Bike & documents (S5), Help & support (S6), and the customer Home live-job bar (C5).
Until each lands, its current screen stays as it is.

**Open questions (BRIEF.md, not decided here):** food cards on the board; the demand feed; a withdraw
limit; auto-opening the "picked you" sheet.


## D-56 · Tab bar v1: the floating pill bar replaces the flat bar on both sides — APPROVED (2026-10-01); v1.4 update (2026-10-03); glass APPROVED (2026-10-06, §6) — power-save rule §6 PENDING OWNER REVIEW

**Owner instruction, this session (2026-10-01):** the owner asked for a prompt to redesign the bottom
menu bar for both the rider and customer sides, took a detailed brief to Claude Design, and uploaded the
signed-off result (`Lynia_Design_System.zip`, `handoff/tab-bar-v1`, v1.3) with *"lets execute the home
page here … the home nav bars"*. The handoff's `README.md` says every number in it is final.

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze
gates. The design package only *absorbs a new export* here.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/tab-bar-v1/` | The handoff, **verbatim**: `README.md` (the spec), `CHANGES.md` (what it supersedes, v1.1–v1.3), `CLAUDE_CODE_PROMPT.md` (the build brief), the prototype (`Tab Bar Prototype.html` + its offline standalone), `Board.html`, `load-tabbar.js`, and `reference/` (the kit sources and the token files as the design tool had them). |
| `packages/design/components/shell/TabBar.jsx` + `.d.ts` | Replaced by the handoff's `reference/TabBar.jsx.txt` / `TabBar.d.ts.txt`, as its `CHANGES.md` directs (the kit stays the source of truth). |
| `packages/design/components/shell/AppScreen.jsx` | Replaced by `reference/AppScreen.jsx.txt` (the 72 + inset + 16 reserve and the CTA dock). `AppScreen.d.ts` gains the matching `role` / `tabBadges` / `inset` props. |
| `packages/design/tokens/colors.css` | **Added** (nothing removed): `--accent-illus`, the `--illus-*` / `--illus-idle-*` illustration palette, and the Home (Calm Mint v2) surfaces `--tile-mint/-peach/-lilac/-sun`, `--coral-ink`, `--sun-ink`, `--live-bar(-ink)`, `--rider-accent` (`--rider-wash` already arrived with D-55, same value). The handoff's `reference/colors.css` is an older snapshot without the home-8c tile tokens; those stay. Several of these share a value with D-55's Calm Mint names (`--tile-mint` = `--tile-send`, `--tile-peach` = `--tile-food`, `--tile-lilac` = `--tile-shops`, `--tile-sun` = `--highlight-chip-wash`, `--live-bar` = `--forest`, `--live-bar-ink` = `--on-forest-muted`, `--rider-accent` = `--free`, `--illus-coral` = `--coral`, `--illus-sky` = `--sky`). Both exports name them independently and the repo keeps each export's names verbatim; consolidating them is a design-tool decision, not the app's. One word in the `--accent-illus` comment is changed (a colon → "since") because the token-conformance parser read `--accent-wash: #00b14f` inside the comment as a declaration. No value changed. |
| `packages/design/tokens/spacing.css` | **Added** `--shadow-float`, `--shadow-active`, `--shadow-badge`. |

### 2 · Authority (a scope rule)

The tab bar on both sides (`src/ui/shell/TabBar.tsx`, the `(tabs)` layouts) follows this handoff. It
supersedes the `### TabBar` section of `handoff/rider-v2/README.md` (D-54 §3's "Tab bar" bullet: the flat
60px bar with the 52×26 wash pill) and the old kit bar. Older handoff kits (`rv-kit.jsx` etc.) still draw
the old bar; those drawings are superseded wherever they show it.

### 3 · What landed

- **The bar:** the illustrated variant, the handoff's default. A floating 60px pill 12 from the sides and
  12 + the safe-area inset from the bottom, white with a 1px `line` edge and `shadow-float`. Three 52px
  cells hold the 28px faux-3D art, a 2 gap and a 12/16 label (600 `muted` idle, 700 `ink` active).
  - One shared indicator slides 200ms on `cubic-bezier(0.34, 1.36, 0.64, 1)`. It takes the active tab's
    tile tint with a 2px ring in that tint's ink, cross-fading over 160ms.
  - The active art rests at −2 / 1.08 and pops 0.86 → 1.16 → 1.08 on activation, never on first mount.
  - Press scales the cell to 0.94, plus a `surface` fill on an idle cell.
  - Reduce motion (the OS setting) makes every change instant.
- **Art:** the 10 illustrations (5 drawings × active / idle) are drawn with `react-native-svg` from the
  kit's `ILLUS` table, coordinates 1:1. The solid `GLYPHS` fallback is not ported (see §4).
- **Badges** come from data the tab roots already fetch: cache-only observers, no new requests.
  - Customer Orders `live`: active orders.
  - Rider Jobs `count` (9+ cap): new jobs since Jobs was last open; clears on opening Jobs.
  - Rider Money `warn`: balance below the floor, the same rule as the board's top-up gate.
  - Rider Account `dot`: verification not done.
  - Each badge has a 2px `bg` ring and `shadow-badge`, is anchored to the cell, and pops on appear or
    change.
- **Layout contract:** tab roots pad their scroll content by 72 + inset + 16 (`useTabRoot` /
  `useTabBarSpace`). The rider board's sheet ends its scroll area at the bar, and its toast sits above
  the bar.
- **The dock:** the rider gates' CTA bar becomes the dock: CTA → 12 → bar → 12 + inset.
- **Re-tap and keyboard:** re-tapping the active tab scrolls its root to the top, with no haptic. The bar
  is removed while the keyboard is open.
- **Accessibility:** the bar is a `tablist`; each cell is a `tab` with `selected` and the exact strings,
  e.g. "Orders, tab, 2 of 3, 1 active order".

### 4 · Deviations (each forced by the platform or the data)

| What | Handoff | App | Why |
|---|---|---|---|
| Bar edge | `inset 0 0 0 1px` ring (takes no space) + padding 4 | A real 1px border + padding 3 | RN has no inset box-shadow. The cells and indicator still sit exactly 4 in. |
| Shadows | `--shadow-float` (two layers), `--shadow-badge` | One RN shadow layer each (`tokens.shadow.float` / `.badge`) | RN draws one shadow per view (the same documented approximation as `shadow.card`). |
| Focus ring | `0 0 0 2px bg, 0 0 0 4px ink` outside the cell | A 2px `ink` ring on the cell's pill | No box-shadow spread in RN, and no room outside the cell inside the bar's padding. D-pad/keyboard only either way. |
| Label colour change | 120ms linear fade | Instant | Animating text colour needs the JS driver on every cell for a 120ms change; weight changes instantly in both. |
| Tab-change haptic | `HapticFeedbackConstants.CLOCK_TICK` | The app's `tap` cue (a 12ms tick on Android; none on iOS) | The app ships no haptics module (see `src/ui/haptics.ts`). |
| Customer Account `dot` | Verification / KYC needs attention | Not shown | Customers have no verification step, so there is no source. It appears the day one exists. |
| Solid-vector fallback | `glyphStyle="solid"` kept behind a flag, not wired by default | Not ported; the drawings stay in the kit's `TabBar.jsx` | The handoff says to build it only if asked, and unused code is still downloaded over metered data: the merged bundle went 2.4 KB over its Hermes budget (`size-budget.json`) with it in. |
| Board sheet behind the bar | Content scrolls behind the bar | The sheet's white runs behind the bar; its list ends at the bar's top | `OrderSheet` measures its peek against its scroll area; the list stays fully reachable. |

### 5 · v1.4 update (2026-10-03)

**Owner instruction, this session (2026-10-03):** *"i want to redesign the menu bar . here is the
handoff"*, with a new `Lynia_Design_System.zip` holding `handoff/tab-bar-v1` at **v1.4** (glass, flat,
smooth motion). Its `README.md` "v1.4 overrides" block wins over every older line, §3 and §4 above
included.

**Design-package sync (a record):** `packages/design/handoff/tab-bar-v1/` takes the export verbatim
(`README.md`, `CHANGES.md`, `CLAUDE_CODE_PROMPT.md`, the standalone prototype, `reference/TabBar.jsx.txt`
+ `.d.ts.txt`; the other files are byte-identical). `packages/design/components/shell/TabBar.jsx` + `.d.ts`
are replaced by the new reference again. Tokens are unchanged: `--shadow-float` / `--shadow-active` stay
defined; the bar just stops using them.

**What changed in the app (`src/ui/shell/TabBar.tsx`):**
- No edge and no shadow: the 1px `line` border and `shadow.float` are gone, and the padding is back to
  the handoff's 4. This retires the "Bar edge" and "Shadows" (bar part) rows in §4.
- The indicator is `tileMint` on every tab with no ring. `TAB_TINT` and the tint cross-fade are removed.
- Motion is all on `cubic-bezier(0.32, 0.72, 0, 1)`: the indicator slides in 420ms. The active art eases
  to −2 / 1.08 over 420ms and eases back when it is deselected, with no pop. Press is 0.97 over 160ms and
  releases over 360ms. The badge pop is unchanged.
- Labels are always 700. The muted → ink change and the idle → active art now **fade over 300ms**, as
  two stacked layers whose opacity cross-fades on the native driver. This retires the "Label colour
  change" row in §4.
- Reduce motion still makes every change instant, and the press fill stays.

**Deviations (v1.4):**

| What | Handoff | App | Why |
|---|---|---|---|
| **Glass material** (SETTLED 2026-10-06: glass ships, see §6) | `bg` at 72% over a 24dp backdrop blur + 180% saturate, solid only as a fallback | Always the solid fallback (opaque `bg`) | The app ships no backdrop-blur module. The handoff says to **ask before adding a dependency** (`expo-blur` or Haze) and **never to show a translucent bar without blur**. Adding a native module also needs a new EAS binary, since an OTA can't deliver it. Solid is the handoff's own fallback, and on API < 31 and low-RAM phones it is what most riders would see anyway. Glass ships once the owner approves the dependency. |
| Press-fill release | `surface` fill fades out over 300ms | Fades with the 360ms press release | The fill rides the press scale's native-driven value, so there's no second animation. |
Backend, per README §5: popularity ranking, the
merchant-funded free-delivery flag (and "Delivery: Free, paid by <venue>" at checkout), the customer
shop list with `kind`, the new-rider free-jobs rule, Didit ID prefill.

### 6 · Glass (2026-10-06) — APPROVED

**Owner instruction, this session (2026-10-06):** after a review of the bar against the usual standards
for floating and translucent tab bars, the owner answered *"i approve glass"*. That settles §5's glass
row and approves the dependency it was waiting on.

**What landed:**
- **`expo-blur` ~15.0.8** (the SDK 54 version). It is a native module. It shifts the `fingerprint`
  runtimeVersion, so glass reaches phones only with the next EAS build (`mobile-release.yml`), never by
  OTA (`mobile-ota.yml`'s JS-only rule). An OTA from a `main` that has it no longer matches binaries built
  before it.
- **The fill** (`src/ui/shell/TabBar.tsx`): a `BlurView` under a transparent bar, clipped to the pill.
  `tint="systemChromeMaterialLight"` overlays white (= `bg`) at 0.97 × intensity / 100, and on Android it
  blurs at intensity / `blurReductionFactor` (4). So **intensity 96 is 93% `bg` and a 24 radius** (Dimezis
  BlurView 2.0.6, `RenderEffectBlur` on API 31+). The tint is raised from the handoff's 72% for
  readability; see the "Glass tint" row below. No shadow. The edge is a hairline outline; see the "Bar
  edge" row below.
- **The fallback** (`src/ui/shell/useGlass.ts`) is solid `bg` whenever the handoff says so. The settings
  are read live, and until the first read settles the bar is solid, so a user with one of them on never
  sees a frame of glass:

  | Handoff condition | Read from |
  |---|---|
  | Reduced transparency | iOS Reduce Transparency; web `prefers-reduced-transparency` |
  | Increased contrast / high-contrast text | Android high contrast text; iOS Increase Contrast; web `prefers-contrast: more` |
  | Forced colours | web `forced-colors: active` (no native equivalent) |
  | Backdrop blur not supported | Android below API 31; web without `backdrop-filter` |
  | Android API < 31 | `Platform.Version` |
  | `isLowRamDevice()` | `expo-device` total memory below 3.5 GiB (see below) |
  | Power-save mode | **not detected** (see below) |

- `material="solid"` forces the opaque bar, as the kit's `material` prop does.
- **Bundle:** +5,610 B Hermes (7,276,950 → 7,282,560), within `size-budget.json`, so no raise.
- **Tests:** `tab-bar-glass.test.tsx` pins the 96 / `systemChromeMaterialLight` / `dimezisBlurView` fill,
  an idle label's ≥ 4.5:1 through the glass over black, `ink` and `forest` (computed from expo-blur's own
  overlay formula, so the 72% tint fails it), the transparent bar, the solid paths (`material="solid"`, Reduce Transparency, Increase Contrast live both
  ways), the API 31 and RAM cut-offs, and that the bar is never translucent without the blur.
- **Evidence:** `docs/parity/TAB-BAR-V1-4-GLASS-2026-10-06.png`, the prototype beside the app at every
  state, glass on both sides (the prototype at its 72%, the app at 93%). The parity lane renders expo-blur's
  real web build (`saturate(180%)` + blur + the tint), shimmed in `tools/parity/mobile/shims/expo-blur.js`. Headless Chromium leaves a
  few glyphs near the bar's bottom edge legible on **both** sides; that is a renderer artefact and it
  matches. The Android blur itself (Dimezis) can only be checked on a phone.

**Deviations (glass):**

| What | Handoff | App | Why |
|---|---|---|---|
| **Glass tint** (APPROVED 2026-10-06) | `bg` at 72% | `bg` at 93% | **Owner instruction, this session (2026-10-06):** *"improve readability"*, in answer to the contrast finding below. At 72% an idle label (`muted`) falls under 4.5:1 over dark content. At 93% it holds 5.0:1 even over black (5.1:1 over `ink`, 5.2:1 over `forest`). The blur radius is unchanged (24). Content behind still shows through, softly. |
| **Bar edge** (APPROVED 2026-10-06) | No edge (v1.4: no `--line` ring, no `--shadow-float`) | A hairline outline: one physical pixel (`StyleSheet.hairlineWidth`) in `ink` at 6% (`EDGE`, about #F0F1F1 on white), glass or solid, always shown | **Owner instructions, this session (2026-10-06):** shown three edge options rendered on the real screens (a 1px `line` outline, outline + `shadow-float`, shadow only), the owner chose *"option A but make is as thin as possible and greyer"*. A first cut in `illus-idle-mid` (#AEB6BD) read too strong: *"the outline is still darker and thicker. i want it subtle and not noticeable"*. Asked how faint and when, the owner picked "fainter than any design grey", "all the time". So the colour is `ink` + an alpha suffix (the construction `Tappable`'s ripple uses), lighter than `line`, the lightest design border; a test pins that. Without any edge the white pill vanishes into the white tab roots. It is an overlay, so the cells and the indicator still sit 4 in. A shadow was ruled out: on the old architecture Android only draws `elevation` under a view with a solid background, which would hide the glass. The parity lane draws the hairline at 1 CSS px (react-native-web fixes `hairlineWidth` at 1), so the sheet shows it slightly heavier than a phone does. |
| Saturation | `blur(24px) saturate(180%)` | Android: blur only. Web: `saturate(180%)` applied | Dimezis BlurView has no saturation step and expo-blur exposes none. |
| Web blur radius | 24px | 19.2px | expo-blur's web build blurs at intensity × 0.2. Parity lane only; Android is exactly 24. |
| iOS fill | `bg` + 24 blur | UIKit's light chrome material at intensity 0.96 | expo-blur on iOS is a `UIVisualEffectView`, which has no exact-alpha tint. The iPhone app ships customer-only. |
| Low-RAM rule | `ActivityManager.isLowRamDevice()` | Total memory below 3.5 GiB | No installed module exposes the flag. A "3GB" phone reports about 2.8 GiB and a "4GB" one about 3.7 GiB, so the cut-off keeps the build brief's "2–3GB devices get the solid fallback". Android's own flag only covers ≤1GB Go phones. |
| **Power-save rule** (PENDING OWNER REVIEW) | Solid while power-save is on | Not detected | Needs `expo-battery`, a second native module. The owner approved the blur dependency only. It can ride the same binary if wanted. |
| The bar's own art in the blur | Blur of the content behind | Dimezis also snapshots the bar's indicator and art, so a faint wash of them sits under the tint | expo-blur on Android puts its children beside the Dimezis view, not inside it. Under 93% `bg` this is at most about 7% of an already-blurred image. |
| Maps behind the bar | Blurred map | Window background | Dimezis snapshots with a software canvas, which can't draw SurfaceView/TextureView. On the Jobs tab the board's sheet, not the map, is behind the bar. |

**Contrast finding (reported upstream; the app's fix is the "Glass tint" row).** The kit's `useGlass`
comment says the 72% tint "keeps `--muted` ≥ 4.5:1 over any backdrop". Over dark content it doesn't. Blur
averages colour and doesn't lighten it. An idle label (`muted`) on 72% `bg` over `forest` (#063B22, the
Orders NOW cards) is 3.38:1, and over `ink` it is 3.15:1. Holding 4.5:1 over near-black needs at least an
89% tint. The next export should raise the tint (or darken idle labels on glass) so the kit and the app
agree again.

## D-57 · Browse v2: the Restaurants list and storefront follow the browse-v2 handoff (Shops and Pharmacy next) — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** the owner briefed Claude Design with
`docs/designs/browse-v2/PROMPT.md` ("design the page for view restaurants and view shops and
pharmacies … ideally they should be similar except maybe from your discretion"), uploaded the result
(`Lynia_Design_System.zip`, `handoff/browse-v2-2026-10`) and said *"Lets proceed with implementation"*.
The brief's proposed decisions went to Claude Design as final and its `BRIEF.md` records the outcome:

1. One template, three skins: list → storefront → item sheet → cart bar is the same for Restaurants,
   Shops and Pharmacy; only the sticker/tint, the categories, the storefront body, the note label, the
   time word and Pharmacy's over-the-counter notice change.
2. Pharmacy is its own page (Shops locked to kind = pharmacy), not a Shops chip.
3. One Sort button (the cuisine / shop type is a dropdown inside the Sort sheet) and one "Free delivery"
   button. No "Open now" filter: closed venues form a "Closed now" group at the end.
4. One scrolling storefront under sticky scroll-spy tabs; + adds one with no sheet; adding from another
   venue asks "Start a new cart?" before anything is cleared.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/browse-v2/` | The handoff, **verbatim**: `README.md` (B1–B14, S1–S13, I1–I3, X1–X4, the component spec with the §4b round-2 values, NEEDS BACKEND, retires), `BRIEF.md`, `CLAUDE-CODE-PROMPT.md` (the work order), `PROMPT.md` (our brief), `Browse v2 - all screens.html` + `browse-kit.js` / `browse-screens.js` (the pixel reference; `?screen=B1` renders one screen at 360px), `code/copy.ts` (`B`) and `code/tokens.ts`, `screens/` (58 PNGs at 2×), `assets/` (fonts, the v2 service stickers, the Lucide subset, sample food photos) and `round1/` (history). No token files change: the handoff uses Calm Mint v2's tokens only. |

### 2 · Authority (a scope rule)

The LOOK for `app/food/index.tsx` (the restaurants list) and `app/food/[id].tsx` (the storefront, its
item sheet, the new-cart sheet, the just-closed modal and the in-venue search) is now this handoff. The
Shops and Pharmacy routes and the Home / service search (`X1–X4`, `app/food/search.tsx`) align to it as
those parts land. The gallery `RC list`, `RC list_loading`, `RC list_error`, `RC list_empty`,
`RC menu`, `RC menu_closed`, `RC closed_interrupt` and `RC search` stay in the gallery until an export redraws them
and are **not aligned to** (each is a SUPERSEDED deferral in `tools/parity/codegen/adopted.mjs`; the
generated `food-list.*.view.tsx`, `menu-*.view.tsx` and `closed-interrupt.view.tsx` were deleted).
`RC search` was the target for `app/food/search.tsx` until part 3 landed; it is now SUPERSEDED too. Cart and checkout
(`RC cart*`, `RC checkout*`) are out of scope and unchanged. The Calm Mint v2 notify-me sheet (D-55)
now uses this handoff's drawn Pharmacy and Restaurants copy (`B.svc.*.off`) in place of the two strings
D-55 had to write for it.

### 3 · What has landed (part 1: Restaurants)

- **Kit** (`src/ui/browse/kit.tsx`, `store.tsx`, `sheets.tsx`; `copy.ts` = the handoff's `B`,
  verbatim; view model in `src/logic/browse.ts`): the mint list header with the shared address control,
  the collapsed white bar, the Sort / Free delivery bar, the Sort sheet (category dropdown + radio rows,
  distance sorts greyed without a location), full cards and compact rows, the "Closed now" group, the
  no-location card, empty / error / offline / skeleton states; the storefront cover, logo, title, open
  line, info strip, closing and closed strips with Remind me, sticky tabs, section headings with the
  time-window chip, the Popular rail, dish rows with the + inside the photo, the stepper (a bin at one),
  the item sheet, the new-cart sheet, the just-closed modal, the forest cart bar with the small-order
  hint, and the ink toast.
- **List (B1, B5–B12, B14):** open venues by the chosen sort, then the closed group; the first two are
  full cards; the header scrolls away and the compact bar + Sort bar stick; pages load 20 at a time
  with "Loading more…" and the end-of-list line; B13 shows the dimmed header under the notify-me sheet
  when the service is switched off.
- **Storefront (S1–S13, I1–I3):** one scroll with scroll-spy tabs; a closed kitchen keeps prices and
  photos but has no + anywhere and its item sheet is read-only with "Opens at HH:MM"; the in-venue
  search (S12) runs over the menu already loaded.
- **API (additive, optional, an installed app ignores both):** `RestaurantMenuResponse.popularDishIds`
  (a kitchen's most-ordered dishes over 30 days: three delivered orders or more, at most six, none
  under two) and `availableFrom` / `availableTo` on each menu category (D-29's windows, which the
  customer read API never sent). Shared helpers `closingTimeToday` / `nextOpening`.
- **Evidence:** `docs/parity/BROWSE-V2-RESTAURANTS-2026-10-01.png` (handoff left, app right: B1, B1·320,
  B5a, B7, B8, B11, S1, S5, S8a, I1a, I3), shot by `tools/parity/shoot-browse-v2.mjs` from the `bv2_*`
  fixtures with the handoff's own sample venues and photos.

### 4 · Still different from the handoff (part 1)

| Where | Handoff | App | Why |
|---|---|---|---|
| Closed / out-of-stock photos | Grayscale at 50% opacity | 50% opacity over the surface tint, no grayscale | The app runs React Native's old architecture (`newArchEnabled: false`), which has no `filter` style. |
| "Fastest" sort | Drawn, tagged NEEDS BACKEND | Not shown | No live prep/queue signal exists; the work order (CLAUDE-CODE-PROMPT §5) says hide it until it does. |
| "Recommended" sort | A ranking | Nearest open first | No ranking exists yet (README §7); the work order names nearest-open as the fallback. |
| "Free delivery" pill and tag | Shown when a venue funds delivery | Never shown | No merchant-funded `freeDelivery` flag exists yet (README §7); the work order says show it only when one does. |
| Words the mock draws outside `B` | "Cuisine" / "Shop type" (Sort sheet), "(optional)" (note label), "Popular" (storefront tab), "1 place" (B3a), "in Harare" (B7), "07:00 tomorrow" (S10's runtime value) | The same words | They are drawn in `browse-screens.js` rather than in `B`, so they are the mock's copy; "in Harare" is read off `B.list.summaryNoLoc`. |
| "Closes in 15 min · order by {t}" | Sample value 17:45 for an 18:00 close | The close time | Orders are refused at close, so the close time is the honest last-order time; the sample value is static data. |
| Popular rail | Always drawn for restaurants | Shown only with two or more dishes that three or more delivered orders picked in 30 days | A thin rail would claim popularity the kitchen has no history for. |
| Info strip without a location | Four cells | Rating cell only | No km, time or fee without a location (README §3 "honest data"); the strip keeps the cells it can stand behind. |
| "Busy · +10 min" | In `B.store.busy`, not drawn on a frame (open question) | Not shown | Not drawn ⇒ not rendered. |

### 5 · Still to land (follow-up PRs, same handoff)

- Parts 2 and 3 have landed: Shops and Pharmacy as D-58 (browse only), search as §3c below.
- **Backend (README §7):** the free-delivery flag, a Recommended ranking, a live prep signal for Fastest.

Open questions (`BRIEF.md`): a 16:9 cover upload for merchants; promoting the Fashion / Auto parts
inks to tokens (they already are: `--kind-fashion-ink`, `--kind-auto-ink`); real shop photos; busy mode.

## D-58 · Browse v2 part 2: Shops and Pharmacy open, browse only until Order flow v2 — APPROVED (2026-10-01)

**Owner instruction, this session (2026-10-01):** *"enable shops and pharmacies in the app and in
production. No more coming soon."* Asked how far that goes, the owner chose:

1. **Browse now, order later.** Shops and Pharmacy ship as browse-only sections. Checkout, hand-over
   and done for shops wait for the Order flow v2 handoff (`docs/designs/order-flow-v2/` brief, #1022);
   nothing is improvised for them.
2. **Same go-live switch as restaurants.** Ops switch each shop on in admin after the runbook call; the
   API's go-live switch no longer refuses shops (`shops_not_open` is gone).
3. **Pharmacy: the OTC notice only.** No licence-upload gate; ops check the licence on the go-live call
   (`docs/MERCHANT-GO-LIVE-RUNBOOK.md` §3).
4. **Production:** the API ships with both sections on (`SHOPS_ENABLED` / `PHARMACY_ENABLED`, default on
   in the release workflows), and qualifying shops are switched on.

### 1 · Authority (a scope rule)

`app/shops/*` and `app/pharmacy/*` (list, storefront, search) align to `packages/design/handoff/browse-v2/`
B2, B3a/b, B4, S3, S4, I1b, I1c and X3 (scoped to one section), on the D-57 kit. The Home tiles for
Shops and Pharmacy open those sections while their flag is on; the Calm Mint v2 notify-me sheet (D-55)
is now only the flag-off state (B13), as the handoff's §8 retires it. Home's "Popular shops" rail
(Calm Mint v2 §2.5, NEEDS BACKEND until now) renders from the new list API.

### 2 · What landed

- **API:** `GET /shops?service=shops|pharmacy`, `GET /shops/search`, `GET /shops/:id/catalogue`
  (`ShopsController`, `ShopsEnabledGuard`: 503 before auth while a section is off), visibility =
  `pilotEnabled` + `businessType = shop` + the section's kinds (`customerVisibleShop`). Public
  `GET /app/service-flags` (`ServiceFlagsResponse`) — its own body because `MerchantFeatureFlagsResponse`
  is strict and two more keys would fail every installed client's parse. `placeOrder` still refuses
  shops (D8).
- **Admin:** Go live on a shop's page, with shop / pharmacy wording; "awaiting go-live" lists shops too.
- **Merchant web:** a shop is live once switched on (`isLive` reads the flag alone), and its profile
  line is the restaurant one ("Changes go live straight away").
- **Mobile:** `ShopListScreen`, `ShopStoreScreen`, `ShopSearchScreen` (`src/ui/browse/`), the shop tile
  grid, pharmacy rows and OTC notice (`store.tsx`), `useServiceFlags` (fails OPEN like
  `restaurantsEnabled`), `useShopListFeed` (persisted like the restaurant list).

### 3 · Still different from the handoff

| Where | Handoff | App | Why |
|---|---|---|---|
| Closed strip | "Closed · opens 10:00" + Remind me | The strip without Remind me (and no Remind me row in the closed item sheet) | The reopen reminder is a restaurants-only API (`/restaurants/:id/reopen-reminder` answers only customer-visible restaurants); a closed shop holding a basket offers "Order for when they open" (R5c) instead. |
| Search (X3) | PLACES + ITEMS, item hit adds | PLACES + ITEMS, an item hit opens its shop | Search-side adding is not in Order flow v2 part 5 (storefront ordering only). |

**Closed by Order flow v2 part 5 (ledger D-59 §3, 2026-10-02):** the + on tiles / rows, the stepper,
the cart bar, S5/S6 and I3 ("Start a new cart?" across every venue — one cart); the item sheet's
Quantity, "Note for the shop / pharmacy" and "Add · $x" (I1b/I1c); the closing strip S7 ("order by …");
the just-closed modal S9. The section's kill switch off ⇒ the storefront falls back to browse only.

## D-59 · Order flow v2: Restaurants, Shops and Pharmacy from checkout to done follow the order-flow-v2 handoff — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-01/02):** the owner briefed Claude Design with
`docs/designs/order-flow-v2/PROMPT.md` (#1022), answering four questions first: cover the customer,
merchant **and** rider phones; restaurant, shop and pharmacy orders use **the same order screen as
parcels** (After Send v2, D-53) with merchant stages; **cash only**; and draw out-of-stock substitution,
pharmacy prescription upload (behind a flag), proof photos at hand-over and scheduled orders. The owner
uploaded the result (`Lynia_Design_System.zip`, `handoff/order-flow-v2-2026-10`) and said *"i have done
this designs now you can implement. Complete everything … if its multiple PR continue until they are all
done"*. Its `BRIEF.md` decisions are final; its five open questions are implemented as drawn (the drawn
default) and listed in §4.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/order-flow-v2/` | The handoff, **verbatim**: `README.md` (R1–R9, T1–T16, U1–U5, P1–P5, D1–D5, M1–M8, RD1–RD4, G1–G3, component spec, per-service table, peek table, NEEDS BACKEND, keep/retire), `BRIEF.md` (16 decisions + 5 open questions), `CLAUDE-CODE-PROMPT.md` (the work order: six PRs), `PROMPT.md` (our brief), `Order flow v2.1 - all screens.html` + `of-kit.js` / `of-polish.js` / `of-screens-*.js` / `of-render.js` (the pixel reference; `?screen=T4` renders one frame; v2.1 = v2 + `of-polish.js`, the final look), `order-flow-v2-1.html` (the same canvas offline), `Order flow v2 - all screens.html` (pre-polish, history), `code/copy.ts` (`O`) and `code/tokens.ts`, `assets/` (fonts, the v2 service stickers, the Lucide subset, a sample photo). **Added by us:** `design/screens/` — every prototype frame rendered at 360×720 (1×) from `?screen=<id>`, with `INDEX.tsv` (id → label), as the reference the parity sheets pair against. |

`code/tokens.ts` names one value Calm Mint v2's token files don't carry as a named token,
`highlightWash #FFF6D6` (the "Cash back to you" row once due, and the ETA chip's wash); the faces adopt
it only where the guardrail allows, and no design token file changes in this sync.

### 2 · Authority (a scope rule)

From the PR that wires each part, the LOOK and copy of:

- **the customer order screen for merchant orders** — `app/order/[id].tsx` (one screen for parcel,
  restaurant, shop and pharmacy orders; T1–T16, U2–U5, P1–P5, D1–D5; strings from the handoff's `O`,
  verbatim) — replaces `app/food/order/[orderId].tsx` and every app-only `src/ui/food/*` order view;
- **Review & place** — R1–R9, one screen replacing `app/food/cart.tsx` + `app/food/checkout.tsx`;
- **the merchant's order screens** — M1–M8 and U1 on top of the merchant-mobile handoff (D-48), whose
  B6 eight-step stepper becomes the four-step track + "Cash back to you" row;
- **the rider's merchant jobs** — RD1–RD4 on top of Rider v2 (D-54);
- **G1–G3** — Home's live-order bar, the Orders tab Now cards and push copy for merchant orders;

align to `packages/design/handoff/order-flow-v2/`. The gallery `RC.cart`, `RC.cart_empty`,
`RC.checkout_cash`, `RC.checkout_wallet`, `RC.await_accept`, `RC.item_removed`, `RC.pay_now`,
`RC.pay_confirmed`, `RC.track_prep`, `RC.no_rider`, `RC.track_way`, `RC.delivered_rate`, `RC.rejected`
and `RC.refunded` are **superseded and not aligned to** (README "Keep / redesign / merge / retire");
each becomes a SUPERSEDED deferral as the PR that replaces it lands. `RC.checkout_wallet`,
`RC.pay_now`, `RC.pay_confirmed`, `RC.refunded`, AwaitingPayment and RefundPending are retired outright
(cash only, BRIEF §14). D-58's "Still different from the handoff" rows (no + / cart / item sheet
ordering for shops) close when shop ordering lands here.

**Owner change carried by the handoff:** every code is **6 digits shown 3+3**, the pickup code included
(BRIEF §16; it was 4). The rider enters both codes in six CodeBoxes.

### 3 · What has landed

Each PR of the build order appends its line here.

- **PR 0 (this entry):** the package sync above; CLAUDE.md pointer.
- **PR 2 (Review & place):** `app/food/checkout.tsx` is the one Review screen (R1, R3a/b, R4, R6a/b, R7a–c, R9a/b; `/food/cart` redirects to it, the storefront cart bar pushes it); Place → `dismissAll` + `replace` into the order, so Back goes Home. WHEN draws the ASAP state only and R6b omits 'Schedule for …' until the slots API (R5) lands — a control that does nothing is not rendered. The payload is unchanged (cash; the rider note, else the address line, is the drop-off landmark). `RC.cart*`, `RC.checkout_*`, `RC.placing` are SUPERSEDED deferrals (baseline 81 → 78); evidence `docs/parity/ORDER-FLOW-V2-REVIEW-2026-10-02.png` (`tools/parity/shoot-order-flow-review.mjs`).
- **Backend B (API + shared contracts only, no UI):** shop & pharmacy ordering, scheduled orders, Rx behind
  a flag, the D3f owed balance. Every wire change is additive (contract snapshot: additive only).
  - *Shops & pharmacy:* `POST /restaurants/:merchantId/orders` takes any customer-visible venue (a live
    restaurant, or a live shop whose section flag is on) — reused, no `/shops/:id/orders`. Shops never
    auto-accept (3-minute window → auto-cancel). Same pricing (delivery fee, < $4.00 → $1.00 fee), cash
    only. Backend A's `MerchantOrderResponse.venue {name, businessType, shopKind}` picks Cooking vs Packing
    and the tile colour; the merchant's "Order is packed" is the existing `mark-ready`. Migration
    `0067_order_flow_v2_shops_scheduled_rx` (expand-only: three `BOOLEAN NOT NULL DEFAULT false` columns —
    `merchant_dishes.rx_required`, `merchant_order_items.rx_required`, `merchant_members.is_pharmacist` —
    and three new tables `order_schedules`, `order_prescriptions`, `customer_balance_entries`). Rider offer
    tags (RD1a–d) come as `FoodOfferResponse.job {businessType, shopKind, scheduledFor, rx}` on
    `GET /merchant/orders/dispatch/offer` — never inside the strict `food:offer` socket payload.
  - *Scheduled (§12):* `GET /restaurants/:merchantId/schedule-slots?lat&lng` (`ScheduleSlotsResponse`:
    today/tomorrow 30-minute slots, `full` at `ORDER_SCHEDULE.slotCapacity` = 12, `firstAvailable` for
    "Order for when they open", `leadMinutes`); `scheduledFor` on the place body (a closed venue takes only
    a scheduled order); `POST /restaurants/orders/:orderId/schedule` (Change time); `GET
    /merchant/scheduled-orders` (M7a). Model: no new `MerchantPhase` value (strict zod enum on installed
    apps) — the order waits in `awaiting_accept` with no deadline plus an `order_schedules` row, off the
    live queue; a sweep rings it at `ringsAt` (= slot − prep − delivery) exactly like a new order.
    Read fields `scheduledFor` / `ringsAt` / `scheduleStartedAt`. Free cancel until the kitchen starts.
  - *Rx (§13), `RX_ENABLED` default off, served by `GET /app/order-flags` (`OrderFlagsResponse
    {rxEnabled}` — its own body because `ServiceFlagsResponse` is strict on installed apps):* dish
    `rxRequired` (pharmacies only; hidden from customer reads while off); `POST /uploads/prescription-photo`;
    `prescription {photoKeys 1–3, patientName, consent:true}` on the place body (required with Rx lines;
    refused while off); pharmacist = a team member with `isPharmacist` (`POST
    /merchant/team/members/:profileId/pharmacist`, owner only; `myIsPharmacist` on `/merchant/me`) —
    `POST /merchant/orders/:id/prescription/approve|decline {reason: unreadable|expired|not_valid|other,
    note?}`; decline takes the Rx lines off and re-prices (all-Rx → cancelled, `rx_declined`), the customer
    may then cancel the rest free; `mark-ready` waits for the check; rider `POST
    /merchant/orders/:id/prescription/saw-original`, required before delivery completes. The track holds at
    Confirmed while the check is pending and sets `track.rxChecked` once approved. Photos as 5-minute
    signed URLs only for the customer (`GET /restaurants/orders/:id/prescription`), the pharmacy (`GET
    /merchant/orders/:id/prescription`) and admin (`GET /admin/orders/:id/prescription`).
  - *Owed balance (D3f, open question 2):* a customer cancel after collection records the full total
    (`customer_balance_entries`); the order read shows `owedUsd`; `GET /restaurants/balance`; the next
    merchant order carries it as `previousBalanceUsd`, inside `total` and the doorstep cash amount, never
    inside goods/delivery. Paid once that order is delivered; freed again if it isn't. Where the collected
    money goes is ops reconciliation from the ledger row (open question 2 stays open).
- **PR 1 (2026-10-02):** the customer order screen for restaurant orders — `app/order/[id].tsx` hands a merchant order to `src/orderflow/MerchantOrderScreen.tsx` (venue header, full-bleed map with the VenuePin / drop square / dashed → cased accent route, stage title → ETA hero → four-step track derived on the phone, `src/logic/merchant-order.ts`): T2–T4, T6, T7, T9, T11a/b, T12a/b, T14a–d, T15a/c/d, T16a/b, U2 (removals), P1/P1b/P2/P2b/P3a/P3b, D1/D1b, D2a/b, D3a–e (D3f without the owed line), D4. `app/food/order/[orderId].tsx` only redirects; the `src/ui/food/*` order views are deleted; `RC.await_accept`, `RC.item_removed`, `RC.pay_now`, `RC.pay_confirmed`, `RC.track_prep`, `RC.track_way`, `RC.no_rider`, `RC.delivered_rate`, `RC.rejected`, `RC.refunded` are SUPERSEDED deferrals (with PR 2's cart / checkout keys the baseline goes 81 → 75). Not built here (server or later PRs): T1 (placing, with Review & place), T5/T13 (shops, pharmacy, scheduled), T8 photo row and T15b (no pickup photo / no cancel entry after collection), the venue rating row (D1/D2), U2 swaps, the cancel link while cooking (the server takes no customer cancel once the kitchen has confirmed). Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02.png` (`tools/parity/shoot-order-flow-customer.mjs`).
- **PR 5 (shops & pharmacy ordering, scheduled, Rx on Review; 2026-10-02):** the shop and pharmacy storefronts order like the restaurant one (Browse v2 S3–S7, S9, I1b/I1c, I3 — closes D-58's rows above); ONE cart across every venue (`src/food/cart-context.tsx` is a shared store that `/food`, `/shops` and `/pharmacy` each provide), carrying the venue's `businessType`/`shopKind` and each line's `rxRequired`; the cart bar opens the same Review (`app/food/checkout.tsx`, the venue read from `GET /shops/:id/catalogue` for a shop) and places through `POST /restaurants/:merchantId/orders`. Review: R2a "If something's out of stock" (Ask me · Remove it → `outOfStockPref`, shops + pharmacy only; "Items" in the breakdown), R2b the pharmacy OTC notice, R5a the schedule sheet (`GET …/schedule-slots?lat&lng` with the drop-off; Full disabled; a day with nothing shows one "Closed" chip), R5b the scheduled WHEN row (✎ Edit reopens the sheet; `scheduledFor`), R5c the closed venue's cart bar "Order for when they open · {first slot}" on restaurant AND shop storefronts (Review opens on that slot, `?schedule=first`), R6b's "Schedule for …" restored, and behind `GET /app/order-flags` → `rxEnabled` (fails closed) R8a/R8b (the "Prescription needed" pill on pharmacy rows and Review lines; the RX block above Items while empty, placing blocked with "Add a photo of your prescription to place this order"; pages uploaded through `POST /uploads/prescription-photo` + the signed PUT; patient name + consent → `prescription`). D3f: `GET /restaurants/balance` lines not yet carried show as a breakdown row inside the total and the cash. **Copy added outside `O`** (listed here per CLAUDE-CODE-PROMPT.md, in `src/ui/orderflow/copy.ts` `O_ADDED`): "Owed from a cancelled order" (the D3f breakdown row — no R frame draws it) and "Review" (the R5c bar's button, drawn in the frame but not a key). Interpretations: switching back to ASAP after scheduling is by leaving Review (the drawn sheet has no ASAP); a missing patient name or consent is said once in the ink toast (only the Rx photo blocks, per README); an Rx page can't be removed once added (not drawn). Not built: search-side adding (X3), the order screen's shop/pharmacy/scheduled/Rx stages (T5/T13, other PRs). Evidence: `docs/parity/ORDER-FLOW-V2-SHOPS-2026-10-02.png` (`tools/parity/shoot-order-flow-shops.mjs`).
- **Backend A (API + shared contracts, no UI):** substitution (BRIEF §8, U1–U5/M2), proof at hand-over
  (§9, RD2b–d/RD4c–d/M4b/M5b/P5), venue rating + receipt fields (§11, D1/D1b) and the four-step track
  (§4). Migration `0066_order_flow_v2` (expand-only: five nullable `orders` columns,
  `merchant_order_items.replaces_item_id`, new `merchant_order_substitutions`(+`_lines`) with a one-open-
  round partial unique index, new `venue_ratings`). Endpoints: `POST /merchant/orders/:id/substitution`
  (merchant: remove / reduce / swap lines; at accept it is the accept), `POST
  /restaurants/orders/:id/substitution/confirm` (customer answers every swap), `POST
  /merchant/orders/:id/pickup-proof` and `/door-proof` (rider), `POST /restaurants/orders/:id/venue-rating`
  (customer). `PlaceMerchantOrderRequest.outOfStockPref` (ask | remove; remove ⇒ swaps refused). The
  merchant-order read (`MerchantOrderResponse`) gains optional `shortId`, `venue`, `itemsSubtotal`,
  `smallOrderFee`, `track`, `outOfStockPref`, `substitution`, `pickupProofRequired`, `pickupProof`,
  `doorProof`, `venueRating`; `order:status` and the generic `GET /orders/:id` snapshot carry `track`.
  Shared pure helpers: `deriveMerchantOrderTrack`, `substitutionTotals`, `merchantGoodsForSubtotal`,
  `orderShortId`, `RESTAURANTS_TIMING.substitutionWindowMs` (3 min). Swap window timeouts run on the
  existing 20 s DB sweep. Shop (incl. pharmacy) pickups require the photo; restaurants don't. The pre-v2
  app still sees a coherent at-accept round (legacy `awaiting_item_approval`, swapped lines as removed;
  its approve = swaps declined, decline = free cancel). Not in this PR: merchant-side push for answers
  (socket queue refresh only), "finish delivery without the code" (the door photo is evidence only).
- **PR 3 (merchant + rider deltas, 2026-10-02):** the pickup code is minted as **6 digits** (BRIEF §16;
  the wire also accepts a legacy 4 so an installed rider app gets a clean "wrong code" 400). Merchant:
  **M1a** (an auto-accepted order rings full screen until the kitchen confirms), **M3a/M3b** (ticket with
  "Cooking/Packing · ready HH:MM", priced lines, Change items, the customer's 4-step track), **M4** (code
  read out 3+3, "{rider} entered the code"), **M5** (4-step track + "Cash back to you" row replacing B6's
  8-step stepper), **M6a/M6b**. Rider: **RD1** tag variants (SHOP #DDD5FF, PHARMACY #C5E9DF — no shop or
  pharmacy offer reaches a rider until build step 5), **RD2a** (6 CodeBoxes), **RD4a/RD4b** (door card
  mirror; the code sends itself on the 6th digit). **Rider no-show wait copy 10 → 8 min** (rider-v2 `R`
  `reachB` / `undelHint` / `reachWait`), sanctioned here; the parcel reach timer follows to 8 min so copy
  and timer agree. Not drawn because they need the backend: M4b/M5b photos, the M5 ETA pill, the rider
  call button (no rider number on the merchant read), RD1 seal note, RD4c "Can't use the code?". No
  customer name on a merchant order, so "· Rudo" (M1a/M3 header), "Rudo confirmed with the code" (M6a,
  B7's "Buyer confirmed with the code" stands in) and the first sentence of `O.m.backS` are left out.
  Kept although not drawn (functional, from D-48/D-50): "Mark ride completed" (M5), "It wasn't returned"
  (M6b), the customer's number (moved into the Change items sheet). Merchant `--highlight-*` tokens stay
  the merchant face's values (no parallel tokens).
- **PR 4 (2026-10-02, customer order screen round 2):** on Backend A's API. Substitution U2a/U2b/U3/U4a/U4b/U5:
  an open round is the sheet's first block (SubCard per line; the 3-min countdown pill + bar from
  `deadlineAt`; the U2 sub-line, now true since the server carries on after a timeout; "Was / New total"
  live through the shared `substitutionTotals` — an unanswered swap counts as offered, as U2a draws it;
  "Confirm changes · New total $X" disabled with the "Answer the swap to confirm" hint until every swap is
  answered → `POST …/substitution/confirm`; "Cancel the whole order — free" → the unpaid cancel). U3 = the
  "Changes: … taken off" note + the timeout toast once; U4b = the highlight announcement; U5 = the
  `all_out_of_stock` ending. The legacy 60 s item approval still runs for orders without a v2 round.
  Photos: T8 "Collected · sealed bag photo · View" (leads while < 5 min old, then under the rider card) +
  the T8b ink viewer; P5 door-photo row + hero line ("Left with … at the gate — you agreed with …"); D4's
  delivery-attempt photo. The four-step track is the server's (`track` on the read / `order:status`), the
  phone's derivation only as a fallback. D1/D1b/D2: the two-row rating (venue: `POST …/venue-rating`,
  4–5★ `O.d.tagsV`, 1–3★ `O.d.tagsVbad`; rider as before, tags now `careful_with_food`/`easy_to_reach`),
  one Send + Skip, 10 s Undo for both, the D1b toast is `O.d.rated`; receipt from `shortId`, `itemsSubtotal`,
  `smallOrderFee`. T15b (Backend B): after collection a "Cancel order" link under the rider card (the
  handoff draws the sheet, not its entry) opens the full-cost sheet, "Cancel and pay $X" → the generic
  cancel, which records the owed line; D3f renders the owed sentence + "$X owed" from `owedUsd`. Not here:
  shops/pharmacy/scheduled/Rx, the `previousBalanceUsd` receipt line (no copy in `O`).
  Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02-ROUND2.png`.
- **PR 7 (2026-10-02, customer round 3 — shops, pharmacy, scheduled, Rx, G1–G3):** the order screen speaks per
  service off `venue.businessType/shopKind` (README "Per service": the VenuePin / venue tile in #DDD5FF / #C5E9DF
  with the shop / pharmacy sticker, Packing and items vocabulary, the track's labels, Order again / Try again into
  `/shops` or `/pharmacy`): T3 for shops (never auto-accept), T5a, T5b (+ the drawn seal note), P1s (door row ①
  "Check the seal is unbroken before you pay" for a pharmacy, or a shop whose rider ticked "Bag is sealed").
  Scheduled (Backend B read fields): T13a while `scheduledFor` is set and `scheduleStartedAt` isn't (free cancel,
  the track with no step started, "Change time" → Review's R5a ScheduleSheet (part 5) on the venue's slots for this
  drop-off, then `POST …/schedule`), T13b ("{v} started cooking", the
  slot as the arrival range). Rx (by order data, so it renders only when the flag let an Rx order exist): T5c
  while the check is pending after accept (T3 holds during the accept window), D5a after a decline (reason chip +
  note, the Rx lines named in `O.d.rxNoGo`, "Cancel the rest — free" → the unpaid cancel), D5b (customer cancel
  after a decline; a pharmacy-side all-Rx `rx_declined` cancel reads `O.d.rxNo` / "Nothing was charged." — the
  drawn "you cancelled the rest" wouldn't be true), track step 1 "Prescription checked" from `track.rxChecked`.
  **G1:** Home's live bar keeps its Calm Mint look and takes the merchant order's stage copy (`O.g.bar` as
  templates, the order screen's own stage + ETA honesty) and four segments; the service sticker is drawn as a
  white glyph (utensils / shopping-bag / pill) because the sticker can't be whitened in RN. **G2:** the Orders tab
  pins a running merchant order as the forest Now card (no "Now" heading — the tab keeps its title). **G3:**
  `apps/api/src/notifications/merchant-order-push.ts` holds `O.g.push` c/m/r as templates (spec: filled with the
  samples they equal the handoff's strings byte for byte); wired: customer collected / at the door / delivered /
  not delivered (new merchant status notices), rider heading to the venue, swap to answer, venue couldn't take
  it, no rider, Rx declined, scheduled order started, and the rider's new food / shop job. No server ETA exists,
  so ETA sentences are dropped, never invented. Not wired (no merchant push channel exists; rider ready / cancel
  / return pushes have no call site yet): `m` and `r[2–4]`. Markup strings added: `OXS` (kit-copy.ts), `OG`
  (live-copy.ts). Evidence: `docs/parity/ORDER-FLOW-V2-CUSTOMER-2026-10-02-ROUND3.png`.

- **Part 6 (merchant + rider round 2, 2026-10-02, on Backend A/B):** Merchant: **U1a/U1b** — the ringing
  sheet is the proposer (tap a line → "Remove it" / "Swap for…"; the swap picker lists the venue's own live
  items with the price difference; a removed line strikes with "Removing", a swap shows the green ⇄ line;
  "Send n changes to customer" is the accept, `POST …/substitution` with `prepMinutes`; only "Remove it"
  when the customer chose "Remove it" for missing items); **U4a** — mid-prep "Change items" opens the same
  proposer (the quantity-stepper sheet and `edit-items` are no longer used by the app); **M2** — the
  ticket waits with the round's countdown, "Swap asked" / "Removing" and "Order is packed" held (an accept
  that asked about a swap opens here too); **M1c** — a scheduled order rings with "SCHEDULED · START NOW"
  and the slot ("Start cooking · ready HH:MM" for an auto-accepting kitchen); **M7a/M7b** — the 4th
  segment "Scheduled n" from `GET /merchant/scheduled-orders`, its cards, and the scheduled ticket (decline
  behind the confirm sheet); **M3b** — the seal reminder for shops; **M4b/M4** — a shop's "Hand over"
  waits for the rider's sealed-bag photo (photo row + viewer); **M5b/M6b** — the door photo row; **M8a/M8b**
  — Prescription check (pharmacists only, only for an order that carries a prescription): the zoomable
  photo with its page pill, patient, items that need it, Approve / Decline with the reason chips + note.
  Owner's pharmacist switch per team member and the dish editor's "Prescription needed" render only for
  a pharmacy while `GET /app/order-flags` says `rxEnabled`. A shop **live to customers** (`pilotEnabled`)
  now has its Orders home on `/queue` (Deliveries stays one tap away via the header's "Book a rider").
  Rider: **RD1b–d** (the offer reads `job` from `GET …/dispatch/offer`: shop/pharmacy header and tag,
  "Sealed bag · photo at pickup", "Scheduled · customer expects …", the Rx note), **RD2a–d** ("At the
  shop", "Ask the shop for the pickup code"; a shop's code leads to the camera step — TickRow "Bag is
  sealed", the 72 shutter, Retake, "I've collected the order", the offline "Photo saved on your phone…"
  note; the photo uploads via `POST /uploads/pickup-photo` + `POST …/pickup-proof {key, bagSealed}` before
  the code is sent, since the server won't complete a shop pickup without it; optional at a restaurant via
  a secondary "Photo of the sealed bag"), **RD3** (the Rx note + "I saw the original prescription", "Name
  on it: …"; hand-over and the code wait for it), **RD4c/RD4d** ("Can't use the code?" → why → who + the
  door photo → `POST /uploads/delivery-proof` + `POST …/door-proof`; "Finish delivery" also raises a help
  issue, since the photo is evidence only and our team finishes the delivery). The handoff's "Rudo" in
  merchant copy reads "the customer" (no customer name on a merchant order); the rider's door-photo line
  names the customer's first name. Drawn-not-keyed strings used: U1a/M2 bar hints, "Swap for {item}",
  M1c's note and CTA, M3b's seal note, "Delivery attempt photo" (M6b), RD1a/b headers, "Next · take a
  photo", "Name on it: …". The camera is the phone's own (the shutter opens it; the viewfinder is the
  frame, then the shot). Sheet: `docs/parity/ORDER-FLOW-V2-MERCHANT-RIDER-2-2026-10-02.png`.

### 4 · Open questions, implemented as drawn (owner to confirm)

1. A swap that lowers the price still needs a yes (drawn: "any swap needs a yes").
2. Cancel after collection: "You owe $X — pay it on your next order" (D3f) needs a customer ledger line;
   the ledger landed with Backend B (`owedUsd`, `GET /restaurants/balance`) and D3f renders it (PR 4).
3. Restaurant pickup photos stay optional.
4. Same-day slots a venue can't meet are hidden (no "Too late for today").
5. No limit on merchant "Change items" rounds.

## D-60 · Owner UI review 2026-10-02: no hour hints, no profile page, Help is WhatsApp, Home "Coming soon" — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-02),** after testing the Order flow v2 build on the Closed
testing track. The owner listed seven comments, then answered a set of clarifying questions; the four
below change drawn copy or drawn structure, so they are recorded here. The rest (Send map, service area,
the rider KYC photo screen, the Orders empty state) are not deviations: see §5.

### 1 · No time-of-day hints (After Send v2 `A.noOnlineHint`, Rider v2 `whyQuietB`)

*"remove the statement that riders are usually available around 7 to 9"*, and yes to the rider side too.

| Where | Handoff | App |
|---|---|---|
| Customer, no riders online (`src/ui/order/copy.ts`) | "Most riders are online 7–9am and 5–7pm. We'll keep looking until the timer ends." | "We'll keep looking until the timer ends." |
| Rider board, quiet (`src/ui/rider/copy.ts` `RF.whyQuietB`) | "It's quiet around {place} right now. Most jobs come in 7–9am and 5–7pm." | "It's quiet around {place} right now." |

### 2 · The identity card is not tappable; `/profile` is deleted (Rider v2 C1/C6)

*"On Account when i click my name it shows old UI settings. Remove them."* Rider v2 draws the card with a
chevron and calls it "Tappable → profile sheet", but draws no profile sheet; the tap opened the old
`app/profile/index.tsx` (old `AppBar` + a duplicate row list). Both Account tabs now draw the card with
**no chevron and no tap**, and `app/profile/index.tsx` is deleted (`app/profile/setup.tsx`, the sign-up
name step, stays). Settings S1 already draws its identity row as not tappable.

### 3 · Help & support is the WhatsApp chat itself (Rider v2 S6, gallery `LJ help`)

*"When i click help and support on new UI it shows old UI. Replace that with a link to whatsapp number
0778831938 .. no thing else."* — both sides.

- The **Help & support** row on both Account tabs opens `https://wa.me/263778831938` directly. Its sub
  line reads "Message us on WhatsApp" (`R.hWa`) instead of "WhatsApp or call the safety line".
- `app/help/` (the gallery `Help` hub) and `app/rider/help.tsx` (Rider v2 S6) are deleted. Settings →
  Privacy → "Request a copy of my data", which pushed `/help`, opens the same chat.
- `src/config.ts` defaults `SUPPORT_WHATSAPP` to `263778831938` (a build may still override it). The
  number was never set in any build, so every other "Message support on WhatsApp" button (KYC gates G4,
  G5, G7; Bike & documents) was hidden or fell back to dialling; they now reach this chat.
- **The rider's 24-hour safety line stays** (owner: "Move to rider Account"). S6's `--danger-wash` row,
  "Call the safety line · 24 hours, for riders in danger", sits under the rider Account's rows card
  (`SafetyLineRow`, `src/ui/rider/kit.tsx`).
- S6's "Call LyniaGo support" (a placeholder number in the design) and COMMON QUESTIONS rows go with the
  screen.
- Parity: `LJ.help` leaves `app-targets.mjs`, is recorded SUPERSEDED in `parity-status.mjs` and as a
  SUPERSEDED deferral in `codegen/adopted.mjs` (baseline 75 → 76); its expectation and fixture are deleted.
  `shoot-rider-v2.mjs` drops its S6 row.

### 4 · Home with both rails empty says "Coming soon near you" (Calm Mint v2 README §2)

*"Home empty state should not tell you to update address but should tell you that we are onboarding
merchants in your area but you can send packages now."* The owner picked option B of three drafts.

| | Handoff (H6 card, "both rails empty" rule) | App |
|---|---|---|
| Title | "Nothing delivers here yet" | "Coming soon near you" |
| Body | "Set your area to see restaurants and shops that deliver to you." | "We're bringing local restaurants and shops on board. Need something moved now? Send a parcel." |
| Buttons | "Use my location" + "Type an address" | one **"Send a parcel"** (`package` icon) → `/send` |

The card keeps the H6 geometry and art (mint wash, r20, the TrustTracking art, `PillButton`).
`NoLocationCard` and `ComingSoonCard` share it (`MintEmptyCard`, `src/ui/home/kit.tsx`). The **no-address**
H6 card ("Where should we deliver?") is unchanged (owner: keep).

### 5 · Not deviations, recorded so the next session finds them

- **Send map never loads (Closed testing, ends on "The map didn't load").** No map code changed in D-52 or
  D-53. On a Play-signed build the signature points to the Android Maps key rejecting the app (the
  Play App Signing SHA-1 is not on the key, or Maps SDK for Android / billing is off). This is a Google
  Cloud console fix, and the owner asked that Send also work fully without the map. Tracked separately.
- **Service area** (Harare metro, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden,
  Goromonzi; no merchant distance cap, fee stays per km): a policy change, not a design deviation.
- **Become-a-rider photo** (`app/rider/become.tsx`) and the **Orders empty state** have no drawn design.
  They wait for Claude Design, using the prompts in `docs/designs/owner-review-2026-10-02/PROMPTS.md`.
  The app does not improvise them.

## D-61 · The service area names its towns in the out-of-area copy — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-02):** *"Chitungwiza, Norton, Ruwa people should always be
visible and Harare metro even outside CBD should get access to restaurants and merchants even if they are
far. Don't put a distance limit."* Clarified: add Epworth, Domboshava, Mt Hampden and Goromonzi. "Visible"
means **both** that people there can use everything **and** that the app names these towns as served.
The delivery fee stays per km with no cap. Riders may go online anywhere in the area.

**The rule (not a design change).** The single 25 km disc around Harare CBD is replaced by
`isInServiceArea` (`packages/shared/src/service-area.ts`), a union of town discs:

| Town | Radius |
|---|---|
| Harare (the old 25 km disc) | 25 km |
| Chitungwiza | 10 km |
| Norton | 10 km |
| Ruwa | 10 km |
| Epworth | 6 km |
| Domboshava | 10 km |
| Mt Hampden | 8 km |
| Goromonzi | 10 km |

It is enforced everywhere a location is checked:

- parcel create and resend (API);
- **restaurant / shop / pharmacy order placement (API)**, which had no server check before;
- rider go-online (API);
- merchant sign-up and new branch (API + merchant web pre-check);
- the app's Send and checkout pre-checks.

Merchants were never filtered by distance and still aren't. The broadcast hard cap (`BROADCAST.maxRadiusM`,
25 km around the pickup) is unchanged.

**The copy deviations.** Each one names the towns via `serviceTownsLabel()`:

| Where | Handoff | App |
|---|---|---|
| Send step 1 out-of-area notice (send-compose-v2 `S.outArea`) | "We don't cover that pickup or drop-off yet. Move your pins closer to Harare to send your parcel, or check back as we expand." | "We don't cover that pickup or drop-off yet. We deliver across Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi." |
| Rider gate, outside the area (Rider v2 `R.gAreaB`) | "LyniaGo works in Harare for now. Jobs show again as soon as you're back inside." | "LyniaGo works in Harare, Chitungwiza, …, Mt Hampden and Goromonzi. Jobs show again as soon as you're back inside." |
| Rider online-gate message (`ONLINE_GATE_COPY.out_of_area`, API `REFUSAL_MESSAGE`) | "…inside the Harare service area / corridor…" | names the towns |

The checkout's per-venue `O.r.outArea` ("{v} doesn't deliver to {a}…") is unchanged.

## D-62 · The rider photo is optional and not a sign-up step — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-02),** after seeing the old-UI "Rider photo for your profile"
screen: *"taking a photo is not mandatory, it's optional, and mention that they can do it later in the
flow. Remove that at KYC or onboarding. Put it where you said licensing and bike details can wait."*
Clarified:
- a rider with no photo works normally, with **no reminder**;
- the add-later home is **Settings → Bike & documents**;
- **Didit's own selfie + ID check is enough**: no admin review for a missing photo;
- the add-photo screen **waits for its design**.

**What changes**

| Where | Handoff (Calm Mint v2 / Rider v2) | App |
|---|---|---|
| R1 checklist | Your account · ID check · Rider photo for your profile ~30 sec | Your account · ID check |
| R1 note | "Licence and bike papers can wait." | "Your photo, licence and bike papers can wait." |
| R2 checklist | Your account · Rider photo (Done) · ID check · Go online | Your account · ID check · Go online (3) |
| R3 link | "Add licence and bike papers later in Account" | "Add your photo, licence and bike papers later in Account" |
| After R1 | the photo page (undrawn; old-UI capture + preview) | **"Start ID check" opens the check directly.** Only when the account lacks its name or national ID does an app-authored "A few details first" step ask for just that. **Superseded by D-75 (2026-10-03):** only a missing name is asked for, in C5's grammar; the national ID comes from the check. |
| S5 Bike & documents, "Rider photo" row | "Verified" | "Not added yet" when the rider has none (`me.rider.hasPhoto === false`) |

- **API:** `POST /riders/become` takes `photoUrl` as **optional**. When one is sent, it is still
  namespace-checked and verified. `riders.photo_url` becomes nullable (migration
  `0068_rider_photo_optional`, expand-only: `DROP NOT NULL`). `/auth/me` adds `rider.hasPhoto`, which is
  additive.
- **Removed:** the photo capture, review and resume code in `app/rider/become.tsx`,
  `src/ui/rider/PhotoReviewCard.tsx`, and their tests.
- **Parity:** `RJ.photo_capture` and `RJ.photo_preview` stay PENDING with this reason. The add/change
  photo flow from S5 is Claude Design prompt 1 in `docs/designs/owner-review-2026-10-02/PROMPTS.md`.

## D-63 · Orders v2: the customer Orders tab follows the orders-v2 handoff — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-01/02):** the owner briefed Claude Design with
`docs/designs/orders-v2/PROMPT.md` (#1011, #1014; eight answered questions), uploaded the result
(`Lynia_Design_System.zip`, `design_handoff_orders_v2`) and asked to be told about any overlap with
redesigns already in the app before implementation. The overlap was reported and the owner decided four
points (§3); everything else is the handoff as drawn.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/orders-v2/` | The handoff, **verbatim**: `README.md` (O1–O22, component spec, NEEDS BACKEND, retires, open questions), `BRIEF.md` (16 decisions + 3 open questions), `CLAUDE_CODE_PROMPT.md` (the work order), `PROMPT-original-brief.md` (our brief), `copy.ts` (the strings, shipped as `apps/mobile/src/ui/orders/copy.ts`), `types.ts`, `design/Orders v2.html` + `o-kit.js` / `o-screens.js` (the pixel reference; `?screen=O1`, `&w=320`, `&fs=1.3`) and `design/assets/`. |

`CLAUDE_CODE_PROMPT.md` names this entry **D-56**; that number had already gone to the tab bar (D-56), so
the entry is D-63. The prompt's 60px flat tab bar is likewise the floating pill (D-56): the tab pads by
its reserve, not 60 + 16.

### 2 · Authority (a scope rule)

From this PR, `app/(tabs)/orders.tsx` — the mint header + search, NOW, chips, the day-grouped history,
search, and the O15–O21 cards — aligns to `packages/design/handoff/orders-v2/`. Strings come from
`src/ui/orders/copy.ts` (the handoff's `copy.ts`, verbatim, plus the `OX` block below). The gallery
`RC orders` and `RC orders_empty`, and Rider v2 **C13 Trip history**, are **superseded and not aligned
to**: the customer Account loses its Trip history row (O22) and `/history?side=customer` redirects to the
Orders tab; the rider's Job history (C12) is unchanged. `LJ.history` (whose mock resolves to the Orders
list) now renders the Orders tab. All three keys are SUPERSEDED in `tools/parity` (deferral count
unchanged: RC.orders and LJ.history were already deferrals and are re-reasoned).

### 3 · Owner decisions where the handoff meets what had already shipped (2026-10-02)

| Where | Handoff | App | Why |
|---|---|---|---|
| Now card, merchant orders | 7-segment track; its own titles ("Sadza Republic is cooking") | Orders v2's card (NOW label, 15/12.5 type, ETA chip / quiet pill), with **Order flow v2's four-step track and G2 stage copy** (`merchantLive`) | Owner: "Orders v2 card, Order flow v2 copy". The card, Home's live bar and the order screen must never disagree (D-59 G1/G2). |
| Now card, parcels | 7 segments (finding 1 … on the way 6) | Same card on **four** segments, After Send v2's track: finding 0 · matched 1 · picked up 2 · on the way 3 | Same decision: one track grammar for every running order. |
| Chips | All · Parcels · Food · Shops | **+ Pharmacy** (`OX.pharmacyChip`), shown only when pharmacy is on; its empty filter reads `OX.pharmacyNone`; a pharmacy kitchen timeout reads `OX.pharmacyTimeout` | Owner: "Add a Pharmacy chip". Pharmacy is its own service in the app (D-58/D-59). |
| "Refunded" outcome, "$7.50 back" | drawn | **not built** | D-59 retired refunds: every merchant order is cash, so nothing is ever refunded. |
| Account O22 Help row sub | "WhatsApp or call the safety line" | "Message us on WhatsApp" | D-60 §3 (owner) stands. |
| Open questions (README §11) | — | Not delivered = "No charge" · stars: filled only · "No rider found" · Now type 15/12.5 | Owner answers, as drawn. |

### 4 · App additions with no drawn string (`OX` in `src/ui/orders/copy.ts`)

- **Nameless parcel titles.** Before the rider's name reaches the phone (`riderCard` absent), the Now card
  title is After Send v2's stage name: "Rider assigned" · "Heading to pickup" · "Parcel collected" ·
  "On the way". The handoff's titles always name the rider.
- **The ETA chip text** "12 min" is Calm Mint v2's live-bar chip format (the handoff draws it, but its
  `copy.ts` carries no formatter).

### 5 · Fallbacks until the backend lands (README §9, "frontend first, backend after" — owner 2026-10-02)

Each is marked `NEEDS BACKEND (orders-v2)` in `src/ui/orders/model.ts` / `app/(tabs)/orders.tsx`:

- **The history feed lists only delivered/completed orders** (`historyForUser`, `COMPLETED_ORDER_STATUSES`),
  so the cancelled / no-rider / not-delivered outcomes render correctly but don't appear until the API
  returns those rows. The cancel reason is not on the row yet: a cancel reads "Cancelled by you".
- **Service:** the row has no venue type, so every merchant row files under Food (the Shops / Pharmacy
  chips match only once it does).
- **Amount:** the row's agreed fare (for a merchant row this is already the grand total).
- **Area:** "Parcel to <area>" uses the first comma segment of the drop-off address.
- **Paging:** no cursor yet. The End row shows only when the feed returned fewer than 50 rows; "Loading
  older" (O12) and the page-failed row (O14/O14t) wait for `/orders/history?cursor=`.
- **Search** matches the loaded rows on the phone (online and offline alike).

**Evidence:** `docs/parity/ORDERS-V2-2026-10-02.png` (`tools/parity/shoot-orders-v2.mjs`, the `ov2_*`
fixtures) — O1, O2, O5, O9a, O16, O17, O18, O21, handoff left, app right.

### 6 · The backend round (2026-10-02, the owner's "backend after")

`GET /orders/mine/history` (`OrdersService.customerOrders`) now feeds the tab: the customer's own orders
in **every** terminal outcome, newest first, 50 a page behind a `createdAt|id` cursor, each row carrying
`service` (parcel / food / shops / pharmacy), `outcome` and `chargedTotal` (null = no charge; a merchant
row's grand total, which `agreedFare` already holds). `/orders/history` is unchanged — the rider's Job
history, Money and earnings keep reading completed trips across both roles. The mobile feed
(`useCustomerOrders`, key `["history", "customer"]`) pages automatically near the bottom (O12), shows the
page-failed row (O14) and the End row only when the server has no next page (O13), keeps paging under a
chip with no matches (README §5), and warm-paints through the persisted query cache. An API without the
endpoint (404) falls back to the legacy feed as one page. §5's fallbacks for service, outcome, amount and
paging are retired.

Outcomes the handoff's table doesn't label, with their copy in `OX` (neutral tone, `ban` icon):

| Outcome (server) | When | Label |
|---|---|---|
| `venue_declined` | the venue turned the order down (out of stock, prescription declined) | "Restaurant couldn’t take it" · "Shop couldn’t take it" · "Pharmacy couldn’t take it" |
| `cancelled_by_lynia` | an ops cancel (README §9's `lynia` reason) | "Cancelled by LyniaGo" |

**Still open:** search matches the pages already loaded (no server search yet); the area in "Parcel to
<area>" is still the drop-off's first address segment (no suburb field); and the O14t toast speaks the
handoff's text once but carries no "Try again" action (the app's toast has none) — the page-failed row
right above it offers the retry.

## D-64 · Splash v1 — "1a Sun & orbit": the splash stays up until the app is ready — handoff APPROVED (2026-10-02); steps card removed (owner, 2026-10-06); deviations 1–7 PENDING OWNER REVIEW

> **Update 2026-10-06 — the steps card is gone (owner).** Owner instruction, this session: *"update the
> splash screen"*, with a new export of the same handoff attached (`Lynia_Design_System.zip` →
> `design_handoff_splash/`). It changes one thing: `CHANGE-2026-10-06.md` removes the white steps card
> ("Checking it's you" / "Loading your saved places" / "Finding riders near you") in every phase. Vendored
> verbatim into `packages/design/handoff/splash-v1/` (the new `CHANGE-2026-10-06.md`; `README.md` gains a
> pointer to it; `Splash.html` hides the card; the mark and fonts are unchanged). In the app
> (`src/boot/splash/*`):
> - The card, its rows, its rise-in, the tick pop, the spinning ring and the three step labels are deleted.
> - The boot logic stays: the three tasks run in parallel and the splash is `done` when every task its
>   destination waits for is in **and** the 1300ms intro has played. The per-step 400ms minimum and the
>   300ms "let the tick be seen" wait before a non-Home cut go with the card, so a fast boot is now
>   intro + exit (~2.45s, was ~3.65s) and a signed-out boot cuts at 1300ms (was 2000ms).
> - Task status is kept for retry (`pendingTasks` in `timeline.ts`): "Try again" probes at once and only
>   the unfinished tasks resume (a finished one is stamped once in `boot-readiness.ts` and never re-runs).
> - Accessibility: "Loading LyniaGo" is announced once, when `loading` first starts (it replaces the card's
>   live region). The slow pill (status) and the offline panel (alert) are unchanged.
> - Layout: nothing sits under the wordmark any more, so the anchor is the handoff's 44% of H on every
>   screen; #7 below now only grows the offline lift. Everything else (sun, orbit, dove, wordmark, blobs,
>   slow pill, offline panel, exit, reduced motion) is unchanged.
>
> The bullets and table below are updated to match; text that described the card is struck or reworded.

**Owner instruction, this session (2026-10-02):** *"lets implement a new splash screen. It should open
with the time it takes to be ready to show the home screen."*, with the design handoff attached
(`Lynia_Design_System.zip` → `design_handoff_splash/`). Vendored verbatim as
`packages/design/handoff/splash-v1/` (README, `Splash.html`, the mark, the fonts). It replaces the
static green dove splash (journey node 0·1, gallery `LJ splash` / `RJ splash`, MOB-BOOT-05's held native
frame + `app/splash.view.tsx`). Those gallery screens are SUPERSEDED and not aligned to.

**What the app does** (`src/boot/splash/BootSplash.tsx`, timing rules in `src/boot/splash/timeline.ts`):

- **On screen for exactly as long as the boot takes.** The brand intro plays (1300ms) while three REAL
  tasks (`src/boot/boot-readiness.ts`) run in parallel, with no UI of their own since 2026-10-06:
  1. the session check — the boot decision in `app/index.tsx` (session, onboarding flag, saved role,
     cold-start push);
  2. saved places — Home's `["me"]` read settles (seeded by the boot aggregate);
  3. Home's first content (each enabled rail has data, or failed).
  When the last one is in (and not before the intro has played) the sun floods the screen and Home
  slides up over it, its sections rising in turn (`src/boot/splash/BootEntrance.tsx`). Home therefore
  arrives drawn, not as skeletons.
- **Not Home** (onboarding, sign-in, profile setup, the rider app, a push-tap deep link): hands off
  as soon as the session check is in (and the intro has played), with no exit, as the handoff says.
- **Slow** (4s into loading): the yellow pill. **Offline** (the API unreachable, `src/net/reachability.ts`):
  the orbit pauses, the dot greys, the offline panel slides up; "Try again" probes at once
  (`probeNow`) and shows loading for 3s before the panel can return. Retrying in the background is the
  existing reachability probe.
- **Reduced motion:** no pops, drift, spin, breathing or bob; state changes cross-fade (200ms); Home
  cross-fades in.
- **Layering:** the splash is drawn under the app, and the navigator waits off-screen (105% down,
  hidden from accessibility) until the exit raises it (`AppStage` in `app/_layout.tsx`, BootPhase
  `reveal`). The force-update gate and the ErrorBoundary still end the boot themselves.
- **Native launch screen:** held only until the JS splash's first layout, then dropped onto it.
- **Tokens:** three new values the handoff names, added to `packages/design/tokens/colors.css` and the
  mobile face: `--illus-pink` (#ff8ac5, the README's own ask), `--on-accent-soft` (#d6f5e2, "Go" on
  green), `--on-ink-muted` (#c9d0d6, the offline body).

**Where the app differs from the handoff, and why**

| # | Handoff | App | Why |
|---|---|---|---|
| 1 | Task 3 = "nearby-rider or zone availability call" | Home's first content (the rails) | No customer-side nearby-rider or zone endpoint exists. Home's content is what "ready to show the home screen" means. |
| 2 | Loading keeps going indefinitely on a slow network | Hands off after 20s (`GIVE_UP_MS`) of ONLINE loading — time on the offline panel doesn't count (2026-10-06) | Never strand the app on a hung request; Home has its own loading and empty states. Counting offline time made a phone that came back after 20s offline exit straight into an unloaded Home. |
| 3 | Offline panel 14px from the bottom, pill at top 44 (the steps card's 16px went with the card, 2026-10-06) | Plus the device's bottom inset; pill at max(44, top inset + 8) | The mock frame has no system bars; this keeps them clear of gesture/nav bars and notches. |
| 4 | Pill shadow `0 8px 20px -8px rgba(0,0,0,.3)` (~~card shadow `0 18px 40px -12px`~~ — the card is gone, 2026-10-06) | One-layer RN shadow (offset 8, radius 10, opacity .3, elevation 6) | The app runs the old architecture: no `boxShadow`, no spread. |
| 5 | Orbit's CSS dashed border | SVG circle, `strokeDasharray 6 6` | Dashed rounded borders aren't reliable on Android. |
| 6 | Splash starts on plain green | ~~The native launch frame still shows the old dove + wordmark lockup~~ **Resolved (owner, 2026-10-02: "remove it entirely the old dove and wordmark"):** the native launch screen is now plain green (`assets/splash-blank.xml` / `splash-blank.png`); the lockup generator (`src/ui/splash-lockup.ts`, `scripts/build-splash-icon.mjs`) and its assets are deleted. | Native config: reaches devices only in the next store build (none dispatched — owner: "dont build an expo"). Until then installed binaries keep the old frame. |
| 7 | Anchor at 44% of H; wordmark top at anchor + 152; the offline lift is 64px | The anchor is always 44% of H (~~moved up to clear the steps card~~ — the card is gone, 2026-10-06). Where the 64px lift leaves less than 24px between the lifted wordmark and the offline panel, the lift grows (`src/boot/splash/geometry.ts`, measured panel height). Reduced motion keeps the lift, without the motion. (2026-10-06, startup review S-5) | The mock frame has no system bars. At 320×640 with a 48dp 3-button nav bar #3 put the offline panel over the lifted wordmark; the handoff's own answer to a panel is "the content moves up". Exactly 64px at 640/700/720 with no nav bar and at 720/780 with one. |

## D-65 · The Home service tile reads "Food", not "Restaurants" — APPROVED (2026-10-02)

**Owner instruction, this session (2026-10-02):** *"Rename restaurants on home to Food but keep
everything named restaurants like that."*

| Where | Handoff (Calm Mint v2 `H.tiles.food`) | App |
|---|---|---|
| Home service tile (H1–H5, 360px) | "Restaurants" | "Food" (and its accessibility label) |
| Home service tile (H3, 320px) | "Food" | "Food" (unchanged) |

Scope is the Home tile label only. Everything else keeps "Restaurants" verbatim: the "Popular
restaurants" rail, the "Restaurants are coming soon" sheet, the Browse v2 list, search, storefront and
order screens (`src/ui/browse/copy.ts`), and code names (`RestaurantsSticker`, routes).

| 6 | Splash starts on plain green | The native launch frame still shows the old dove + wordmark lockup until the JS splash draws | Changing it needs a new store build (native assets). **Follow-up:** a plain-green native launch frame, so the cold start reads as one screen. |

## D-66 · Notifications v1: the shared Notifications screen follows the notifications-v1 handoff — handoff APPROVED (2026-10-02); deviations 1–3 SETTLED by the owner (2026-10-02, §6); deviations 4–9 PENDING OWNER REVIEW

**Owner instruction, this session (2026-10-02):** *"lets implement the notification changes now to the app"*,
with the design export attached (`Lynia_Design_System.zip` → `handoff/notifications-v1/`). Vendored
verbatim as `packages/design/handoff/notifications-v1/` (README, BRIEF, CLAUDE-CODE-PROMPT, `n-kit.jsx`
with the `N` copy object, `n-screens.jsx`, `n-stickers.js`, the copied Rider v2 kits under `kit/`, and both
HTML pages; `Notifications v1 (standalone).html?only=N1&w=320` is the pixel reference).

### 1 · Authority (a scope rule)

From this PR, `app/notifications/index.tsx` — both sides, one screen — aligns to
`packages/design/handoff/notifications-v1/` (N1–N10). Strings come from `src/ui/notifications/copy.ts`
(the handoff's `N`, verbatim, plus the `NF` sentence shapes and the `NX` block below). The gallery
`LJ notifications` / `LJ notif_empty` (the August screen) and `RJM notifications` are **superseded and not
aligned to**: `app/notifications/notifications.view.tsx` (the generated LJ.notifications view) is deleted, the
two LJ targets leave `tools/parity/app-targets.mjs` / `codegen/adopted.mjs` / `expected/`, and all three
keys are PENDING-with-SUPERSEDED-reason in `parity-status.mjs`. The rendered-conformance floor drops from
six asserted screens to five (LJ.notif_empty was one of them).

### 2 · What the app does

- **Page:** the pushed-screen header (Rider v2 `PushHeader`), a `--surface` page, padding 16 (12 under
  340px), white r16 cards with 1px `--line` dividers, day labels TODAY · YESTERDAY · "MON 28 SEP".
- **One row per order** (`src/ui/notifications/model.ts`): the feed rows are grouped by order id in the
  app; the row shows the order's latest update, titled "Parcel to <drop-off area>" / the venue (customer) or
  "<pickup> → <drop-off>" (rider). The order's earlier updates (its status beats plus its offer / fare /
  SOS / review / swap rows) are the timeline behind the bead line ("4 earlier updates"), with Hide updates /
  Open order (Open job). Account, money and safety rows stay single rows.
- **Disc + tone:** order rows wear the v2 service sticker on its tile tint with the tone as the 18px corner
  mark; other rows a Lucide icon on a tone-filled disc. Gold is the unread dot only.
- **Danger pin:** an SOS on a running trip, or a pause / block / hold still in force, pins above the day
  groups in a `--danger` card; lifted, it drops into its day as neutral.
- **Needs you:** See offer (offers still open) · Review swap (an open swap round) · Try again (ID check
  declined → `/rider/become`).
- **Read state:** focus stamps the read watermark; the dots of rows that were new stay until the user
  leaves (collected per visit, so a refetch can't clear them early).
- **Side:** `?side=rider` (the rider tabs' bell and the rider Account row now pass it). Order rows follow
  the side; account and safety rows show on both. Dual-role users get the other side's row when it has
  unread order updates.
- **Notifications off:** the J8 row while the permission isn't granted (re-checked on focus and foreground).
- **Swipe:** either way; past 35% of the width removes the whole order's row, the toast "Notification
  removed" + Undo stays 5s, and the dismissals are sent only when it expires (or the user leaves).
- **States:** skeleton rows; "Slow connection. Still loading…" after 6s; couldn't-refresh keeps the feed
  with the stale notice; couldn't-load with nothing cached is N10 with a 52px Try again; empty is the mint
  card with trust-tracking (customers: Send a parcel → `/send`).

### 3 · Server (`notifications-feed.service.ts`, additive)

The README's "Outside the design" asks are done in the same PR, additively (old clients keep `title` /
`message`, which are unchanged):

- **Merchant orders are in the feed** for their customer (the A-7 skip is lifted): the four stage beats in
  the stage push's own words (`merchantCustomerCopy`, `O.g.push.c`), `accepted` / `preparing` synthesized
  from `kitchenConfirmedAt` / `prepStartedAt`, and a swap row per swap round (`merchantOrderSubstitution`).
  A rider's merchant job reads as a job (rider voice, gated like a parcel).
- **Structured fields on every row:** `type`, `beat`, `action`, `service`, `pickupArea` / `dropoffArea`
  (first landmark segment), `venue`, `riderName`, `customerName`, `amount`, `count`, `prepMinutes`, `swap`,
  `steps` (the order's stage history, latest first — see §6) and `active` (in force); since §6 also
  `reason`, `balance` and `cancelledBy`.

### 4 · App strings with no drawn string (`NX`, `NF`)

- `NX.tlFare` "Fare updated" and `NX.tlRebroadcast` "Your rider had to cancel" — timeline steps the
  handoff has no label for (the server rows' own titles).
- `NF.otherSub` builds "1 update · …" / "2 updates · …" from the other side's order titles.
- `NF.mSwap` with a price difference reads "…instead, +$0.10." (the handoff draws only "same price").

### 5 · Where the app differs from the handoff, and why (PENDING OWNER REVIEW)

| # | Handoff | App | Why |
|---|---|---|---|
| 4 | Merchant "Tendai collected your food. On the way." | Restaurants only; shops and pharmacies keep the stage push's line | "food" is wrong for a shop or pharmacy order. |
| 5 | Trash2 | Lucide `trash` | lucide-react-native 1.45 ships no `trash-2` (see `src/ui/Icon.tsx`). |
| 6 | Gesture Handler pan + Reanimated | Core `PanResponder` + `Animated` (native driver) | Neither library is installed; the app's sheets use the same pair. |
| 7 | OtherSide opens the C4/C5 switch sheet | Rider side: the C4/C5 sheet. Customer side: switches straight to the rider app | The customer side has no switch sheet (its Account toggle switches directly). |
| 8 | Stale notice "Showing updates from 09:41" | The time of the last successful fetch on this phone | The feed has no server timestamp of its own. |
| 9 | `--skeleton` | `SKELETON` (#EEF1F3, the browse-v2 literal) | No skeleton token exists in `packages/design/tokens/`. |

Rows 1–3 of this table were settled by the owner on 2026-10-02 and are no longer deviations — see §6.

### 6 · Settled by the owner (2026-10-02): retention, the timeline, the detail fields

The three questions rows 1–3 left open, answered by the owner and built (no longer deviations):

1. **Retention is seven days.** `FEED_RETENTION_MS` = 7 days (`notifications-feed.service.ts`), replacing
   STREAMLINE-01's one day for every row source, the dismissal read and the dismissal prune alike. The order
   scan and row caps rise from 50 to 100 (a week at about 14 jobs a day). The day groups now reach back a
   week: TODAY · YESTERDAY · "WED 30 SEP" … , and rows older than yesterday read "28 Sep".
2. **The timeline is every order step.** A row's `steps` is the order's stage history in the viewer's own
   voice — every stage the handoff draws for that service and side, pushed to the viewer or not: customer
   parcel Posted · Rider assigned · Rider on the way · Parcel collected · On the way to drop-off · Delivered;
   restaurant / shop / pharmacy Accepted · Being prepared · Rider collected · At your door · Delivered; rider
   You got the job · Heading to pickup · Parcel collected · Delivered (plus the outcomes each side draws).
   Two statuses on one stage (assigned + confirmed, delivered + completed) are one step. The row's headline
   is still the latest beat addressed to the viewer (FEED_AUDIENCE). A step's server `title` is the same
   named copy the headline would use for that beat (e.g. "Tendai has your order"), no longer the generic
   table title.
3. **The detail is stored, and the rows read as the handoff's sentences.** Additive optional fields:
   - `reason` — a KYC decline's `KycDeclineReason` key (from `AuditLog.reasonCode`; the vendor webhook's
     free text never passes), and a pause / block / hold's reason as a key mapped from the admin console's
     reason label (`StandingReason`); on a restore, the reason of the pause it lifted. The ops label itself
     is never sent.
   - `amount` + `balance` on `wallet.credit` — recorded on the audit row since migration
     `0073_audit_log_amount` (expand-only: two nullable `DECIMAL(10,2)` columns on `audit_logs`).
   - `cancelledBy` (`customer` · `rider` · `merchant` · `lynia`) on cancelled rows — derived from the
     order's `cancelledBy` / `rejectionReason`, the same reading as Orders v2's `customerOrderOutcome`, so
     it needs no new data and old orders have it too.

   The app (`src/ui/notifications/model.ts`) uses them: aIdB for an unreadable-photo decline, aPausedB /
   aRestoredB for a pause for (or a restore after) a customer report, aWalletR ("$5.00 top-up added. Your
   balance is $12.60.") for a credit, rCancelled ("Nyasha cancelled the order. …") when the customer
   cancelled. Rows recorded before the data was, and rows whose value the drawn sentence doesn't describe
   (another decline reason, a pause for fare fraud, a held customer — aPausedB says "You can't take jobs"),
   keep the push's own line rather than state something false. Not covered by the owner's decision and
   unchanged: sResolvedB (the refund kind), sUpdate, aWalletC (customers have no wallet-credit path).

---

## D-67 · After Send v2 state 2.33 (Home live-order bar) is superseded by Calm Mint v2's live-order bar — APPROVED (2026-10-02)

**Owner decision, 2026-10-02:** the question D-53 left open ("2.33 … **owner to choose**") is settled —
keep Home's existing live-order bar; Calm Mint v2 is the authority for Home; do **not** build 2.33.

| Where | After Send v2 (2.33) | App |
|---|---|---|
| Home, while an order is running | A 60px white card per stage: icon disc + one line + chevron (Finding · Choose · On the way · Arriving with the delivery code · Delivered, not rated) | Calm Mint v2's single forest live-order bar (`packages/design/handoff/calm-mint-v2-2026-10/README.md` §6, ledger D-55): 40px brand disc, "Tendai is on the way", sub line + "+1 order", 7-segment progress, ETA chip. No delivery code on Home. |

**Why:** two handoffs drew the same element. Calm Mint v2 (D-55) owns `app/(tabs)/home.tsx`; After Send v2
(D-53) owns `app/order/[id].tsx`, and its 2.33 frame reached outside that screen. The Home bar keeps the
code off Home on purpose (home-8c removed it; Calm Mint v2 kept it off).

**Scope:** `app/(tabs)/home.tsx` and `LiveOrderBar` are unchanged by this entry. 2.33 is not a gallery
screen, so `tools/parity/parity-status.mjs` has nothing to mark; the After Send sheet
(`tools/parity/shoot-after-send.mjs`) does not shoot 2.33 and now says why. D-53's "Still different
from v2" row for 2.33 points here.

**Upstream ask:** drop 2.33 from the After Send handoff, or redraw it as Calm Mint v2's bar.

## D-70 · Calm Mint v2 "NEEDS BACKEND": commission-free first jobs and the Didit ID prefill — APPROVED (2026-10-02)

**Owner decision, 2026-10-02:** build the two rider items the Calm Mint v2 README §5 (D-55) left as
NEEDS BACKEND. No design change — this entry records the rule the server now implements and the
assumptions the handoff left open.

**Free-jobs rule.** The handoff draws R3 "Commission-free jobs · 5 of 5 left" with the caption "After
these, commission comes off a prepaid balance. We'll remind you before you need to top up.", R1's note
"No top-up to start. Your first jobs are commission-free.", and §6 "the $2 gate at first go-online …
now shows only after the free jobs run out". README §5 leaves the rule open ("N jobs or $X of
commission"). Implemented:

| Question | Rule | Source |
|---|---|---|
| How many | **5 jobs** (`COMMISSION.freeFirstJobs`) | The drawn "5 of 5" meter (the README leaves N open) |
| What is free | No `ride_commission` debit and no ledger row on the rider's 1st–5th completed job | "Commission-free jobs" |
| The gate | While any free job is left, the low-balance (`commission_low_balance`) go-online gate is waived; it returns after the 5th completed job | §6 "shows only after the free jobs run out" |
| What counts | A **completed** job (`Rider.tripsCount`, incremented once per completion on every completion path, parcel or merchant). A cancelled or undelivered job never consumes one | "jobs"; nothing in the handoff counts a cancel |
| Who | Every rider by completed-job count, so riders with 5+ completed jobs are unaffected; a rider with fewer than 5 gets the remainder. Every completion so far ran at the 0% launch rate, so no rider is short-changed or double-served | "Your first jobs" |
| Shown | R1 note in full when `/wallet/config` serves `freeFirstJobs`; R3 meter from `/auth/me` `rider.freeJobs {left,total}` | — |

No schema change: the count is derived from `tripsCount`, which the completion transaction increments
under the rider row lock before the debit runs.

**Didit ID prefill.** The vendor-verified document number (already extracted from the decision webhook
for IR26-04 dedupe, which kept only its hash) is now also stored ENCRYPTED on `riders.verified_id_number`
(migration `0070_rider_verified_id_number`, expand-only), nulled on erasure, and returned to its owner
only as `/auth/me` `kycIdNumber` once the check is verified (memory-only on the phone, like `idNumber`).
The become-a-rider details step ("A few details first", app-authored) starts its national-ID field with
that number when the account has none on file. It stays **editable**: the handoff draws no such field
and its README says "prefill or confirm", so the rider confirms rather than retypes. The IR26-04 fraud
checks (typed vs vendor number, collisions) are unchanged.

**Superseded by D-75 (2026-10-03):** the details step and its prefilled ID field are gone. A new rider types no ID; the
server adopts the number the check verified.

## D-71 · Free delivery, paid by the restaurant or shop — the flag the handoffs asked for is built — PENDING OWNER REVIEW (2026-10-02)

**Owner decision, this session (2026-10-02):** build free delivery paid by the restaurant or shop. The
designs draw it but it was never built (D-55 table "Free delivery tag: Never shown"; D-57 table "Free
delivery pill and tag: Never shown"). This entry retires both of those rows: the tag, the pill and the
filter now show whenever the venue's flag is on.

**What the designs settle, and where**

| Rule | Source |
|---|---|
| A merchant-funded `free_delivery` boolean per venue | calm-mint-v2 README §5, browse-v2 README §7, browse-v2 CLAUDE-CODE-PROMPT ("`freeDelivery` per venue") |
| The venue pays; the rider is paid in full | D-55 owner decision 2 |
| "Free delivery" only when the venue funds it (honest data) | browse-v2 README §2, order-flow-v2 PROMPT ("Honest data only") |
| The purple `free` token: tag on full cards, bold purple text in compact rows, the Free delivery pill shown only when a venue offers it | browse-v2 BRIEF §4/§7, calm-mint-v2 README §2 |
| "Checkout reads 'Delivery: Free, paid by <venue>'" | calm-mint-v2 README §5 |

**What the app does (cash only)**

- **Customer pays $0 delivery.** Review & place's Delivery fee row reads "Free, paid by {venue}" (bold,
  `free` token) and the cash total is the goods (+ small-order fee, + any owed balance). The order screen
  and receipt read the same, and every later total (edits, swaps, a declined prescription) keeps it free.
- **The rider earns the full fee**, unchanged: the offer's fare, the board's asking figure and the
  delivered screen all show `deliveryFee`.
- **The venue's money is the goods less the fee.** Nobody carries a separate fare in a cash world: the
  rider keeps the fee out of the cash the customer paid and hands back the rest. The collect-and-return
  debt opens at goods − fee; the merchant's Money lines, today's sales and the weekly statement (and its
  commission line) use the same net. This follows the current D-48 collect-and-return model, not the
  retired weekly-15% settlement in `ui_kits/admin/cash.html`.
- Server: `merchants.free_delivery`, `orders.merchant_delivery_share` (migration
  `0072_merchant_funded_free_delivery`, expand-only); one split for every surface,
  `foodOrderMoney` in `packages/shared/src/restaurants-order.ts`.

**What the designs don't settle: the simplest safe choice (owner to confirm)**

| # | Question | Choice |
|---|---|---|
| 1 | How a venue turns it on | A third switch, **"Free delivery"**, on the existing app-only *Account → Taking orders* page (owner only), and the same switch on the admin merchant profile's Taking orders card (reason-coded, audited). Neither handoff draws it. A shop or pharmacy now reaches Taking orders too and sees only this switch (shops never auto-accept). |
| 2 | Minimum order / radius | None. The only floor is that the goods (with the small-order fee) must cover the fee at placement; below it the customer pays delivery as usual, so a venue never pays to give food away. No radius: the fee is per km inside the service area, as for every order. |
| 3 | An edit drops the goods below the fee | The order stays funded; the venue's share is capped at the goods total, the customer pays only the uncovered part. The rider is never short and the venue never goes below $0. |
| 4 | The switch changes mid-order | The share is snapshotted at placement; only new orders change. |
| 5 | Wallet orders | Never funded (cash only). |
| 6 | Customer cancels after collection | They owe what they would have paid (goods, $0 delivery) — the existing D3f rule on the order's total. |
| 7 | Copy not in any handoff | "Free, paid by {v}" (`O_ADDED.r.freePaidBy`, the README §5 sentence); the merchant switch's line "Customers pay $0 delivery on new orders. You pay the rider's delivery fee: it comes off the cash for each order."; the admin card's lines and two audit reasons. |

## D-72 · "Popular" is a real ranking: recent delivered orders, not the nearest open venues — APPROVED (2026-10-02)

**Owner decision (2026-10-02):** "Popular restaurants" / "Popular shops" on Home and the browse lists'
default "Recommended" sort meant "the nearest open venues". Both handoffs list a real ranking as NEEDS
BACKEND (Calm Mint v2 README §5 "Popular ranking"; Browse v2 README §7 "A Recommended ranking"). This
builds it. **No drawn element, string or geometry changes**; only the order of the cards.

**The formula.** For each venue the customer's list can see (the restaurant rule, or one shop section's):

    score = Σ over its delivered orders in the last 30 days of 0.5 ^ (age / 7 days)

- "Delivered" = `delivered` or `completed`. Cancelled and undelivered orders don't count.
- A venue needs **3 or more** such orders to rank. The ranking engages only when **2 or more** venues
  qualify. Below that (cold start, which is today's closed test) the server answers no ranking.
- Tie-break: score, then the raw order count, then distance on the phone.
- On the phone, only **open** venues that **deliver to the customer** rank: the venue has its pin, and the
  customer is inside the service area (or not located yet; D-61, no distance cap). Ranked venues lead.
  Every other open venue follows **nearest first**, then the closed group, as before. With no ranking the
  order is exactly the old nearest-open order. A closed venue never ranks, however popular.
- The explicit **Nearest**, **Top rated** and **Lowest fee** sorts are unchanged.

**Where.** `GET /restaurants/popular` and `GET /shops/popular?service=` (`MerchantService.popularVenues`).
Each is one aggregate over `orders`, served by the new `(merchant_id, created_at)` index (migration
`0071_orders_merchant_created_at_popularity_index`, expand-only, `CONCURRENTLY`). It is cached for 10
minutes per list. The 30-day window, the delivered statuses and the 3-order minimum are shared with the
X1 "Popular near you" search chips and the storefront "Popular" dish rail (D-57) in
`apps/api/src/merchant/venue-popularity.ts`, so "popular" has one definition. Phone:
`src/logic/popularity.ts`, `popularNearYou(…, popularity)`, `browseList(…, popularity)`. A failed or
malformed read means no ranking. A list whose ranking names a venue on a page it hasn't loaded fetches
the next page, so a popular venue on page 2 can still lead.

## D-74 · Merchant: section labels as drawn, deletes confirm, calm "Try again", and wallet orders retired — APPROVED (2026-10-03)

**Owner instruction (2026-10-03):** an audit of every screen still on the pre-October design (waves 1–2,
see D-73) found four old-UI leftovers in the merchant app. The owner approved the plan: *"execute wave 1
and wave 2"*. This entry covers the merchant app and the API change behind it.

**1 · Section labels and trackers look as drawn again (a regression, not a deviation).** Order flow v2
(#1031) added a secondary button under the class name `.m-sec`, which merchant-mobile B1, D1 and C3 already
used for plain 15/700 section labels. The later rule won, so "Waiting for rider", "Out for delivery",
"Riders you booked" and "Orders" drew as grey centred pills. #1031 also reused `.m-trk` (D1's mint tracker
pill) for its four-step track, so every booked-rider tracker drew grey. The button is now `.m-btn-sec` and
the track `.m-track`; the labels and trackers match the handoff again. A guard test
(`apps/merchant/app/mobile-css.test.ts`) fails when a class gets a second top-level rule.

**2 · Destructive actions confirm (merchant-mobile's own rule).** "Delete dish" (a shop's "Delete item")
and a category's "Delete" deleted at once. Both now open `m/ConfirmSheet` over the editor; "Keep" returns
to the editor unchanged.

**3 · "this phone", not "this tablet".** The merchant app is phone-first (D-48); the dish-photo help and
its error said "this tablet".

**4 · Errors follow Order flow v2's rule on every merchant screen.** Its global rule: a failed first load
shows a calm "↻ Try again", and there are no lasting red error lines. `RetryableError` (an old 16px red box
with an outline Retry) is now the merchant-mobile centred state: a 72px disc with the wifi-off glyph, the
error at 18/700, "Check your data connection and try again." and a primary "↻ Try again". The Orders home
no longer shows a red line while its poll fails: a failed first poll shows "Try again"; after the first
load the board keeps its last state, a lost connection is left to the shell's offline bar, and any other
poll error is said once in the ink toast. Staff who open an owner page from an old link get the muted hint
line Team already uses, not the old shadowed card.

**5 · Wallet orders are retired (this supersedes D-48's "The API keeps accepting wallet from installed
apps until they update").** Order flow v2 is cash only (its BRIEF §14), and the customer app has sent only
cash since D-48.
- **API.** A new restaurant, shop or pharmacy order with `paymentMethod: "wallet"` is refused with HTTP 400,
  reason `wallet_not_accepted`: "Orders are cash on delivery now. Choose cash to place your order." The
  check runs after the idempotency replay, so a retry of an order placed before the change still returns
  that order. The `MerchantPaymentMethod` enum is unchanged (legacy rows still parse); parcel orders,
  wallet top-ups and the legacy accept, payment and refund endpoints are untouched.
- **Merchant order screen.** The old wallet lane (the order card with its WALLET tag and second "Mark
  ready", the "Confirm the payment landed" sheet, `PayTag`, the rider no-show sheet) is deleted, with
  ~450 lines of tablet-era CSS no screen used. Wallet checkout did reach customers before D-48, so a wallet
  order placed before this change may still be open. It stays finishable in the new screen's parts:

| Where | Handoff draws | App does | Why |
|---|---|---|---|
| Order screen, an unpaid wallet order placed before D-74 | nothing (cash only; no payment-type tags anywhere) | a ticket from the M3/M7b parts: a "Waiting for payment" note, the lines, "Ask for payment", a red "Cancel order" behind a confirm, and "I got $X" with a reference sheet | such an order must be finishable or cancellable; the old card is retired |
| M3a "Can't finish this order", on a paid wallet order | a confirm, then cancel | the confirm holds a "Refund reference" field, then refunds | LyniaGo never held the money; the refund endpoint needs the business's reference |
| M2 for a shortened order from before Order flow v2 | the swap line ("…swaps are declined") | that line is left out | no swaps exist on such an order, and a timeout cancels it |
| `ConfirmSheet` | a title, one line, confirm and Keep | can hold one field | the payment and refund endpoints need a reference |
| Failed first load, every screen | T14b: 21/800 title, full-width button, "Back to home" | the merchant-mobile centred state (72 disc, 18/700, auto-width primary), no "Back to home" | one shared component; every screen already has its back or tabs |
| Orders home, poll failure | not drawn | "Try again" before the first load; afterwards one ink toast, or the offline bar | no lasting red line |
| Menu delete confirm | not drawn | `ConfirmSheet` | merchant-mobile: destructive actions confirm |
| Staff on an owner page | not drawn | a muted hint line, as on Team | consistency |

**New app-authored strings.** Menu: "Delete {name}?", "It comes off your menu. You can’t undo this."
(shop: "…off your shop…"), "Delete category", toast "{name} deleted". Photo help: "…Pick the file from
this phone; we shrink it for you.", "That file couldn't be opened as a photo. Pick a JPEG or PNG from
this phone." Wallet ticket: "Start once it’s in your own statement.", "Ask for payment", "Payment asked
for · customer told", "Only if they never paid. The customer is told.", "Is {p} in your statement?",
"Check your own statement, not a screen someone shows you.", "Reference", "Payment confirmed · start
cooking" (shops: "start packing"), "Refund the customer {p} first, then add the refund reference.",
"Refund reference". API: "Orders are cash on delivery now. Choose cash to place your order."

**Open for the owner.** (a) Raise the minimum app version (`MIN_SUPPORTED_APP_VERSION` on the API) past
every build that still offers wallet checkout, so no customer meets the refusal; until then an old install
that picks mobile money is told to choose cash. (b) Once ops confirms no wallet order is open, the payment
ticket, the refund branch and the legacy payment endpoints can go. (c) Pre-existing: the old customer app
asked for goods + delivery, while `confirmPayment` checks the goods total; left as it was.

## D-75 · A new rider's national ID comes from the ID check, not a typed field — APPROVED (2026-10-03)

**Owner decision (2026-10-03):** "execute wave 1 and wave 2" (the old-UI audit's Wave 2, decision 1).
Calm Mint v2 lists **"Didit ID prefill: to prefill or confirm the ID number afterwards"** as NEEDS BACKEND
(README §5), retires "national ID on register" (§6), and C5 tells the customer "No ID needed". D-70 built
the *prefill* half: an editable ID field, pre-filled, on an app-authored "A few details first" page that
no handoff draws. This builds the *confirm afterwards* half instead, and the page goes.

**What changes**

| Where | Before | Now |
|---|---|---|
| R1 "Start ID check" | Opened "A few details first" (name + national ID, D-70 prefill) when the account lacked either | Opens the check straight away. Only an account with no name (legacy) sees a name step first |
| The name step | The old-kit page: Heading, Sub, Field × 3 (name, surname, national ID), a privacy paragraph, Button | C5's own grammar: `OB.nameTitle` / `OB.nameSub`, the two side-by-side `NameFields`, the `VerifiedPhoneRow`, and R1's CTA "Start ID check". C5's "No ID needed…" note is not drawn here, because the ID check is the next step |
| After the check | An old-kit "Rider setup" outcome page with its own lines per outcome | `router.replace("/rider")`. The board already draws each outcome: R2 while the check is reviewed, R3 once verified, Rider v2 "Finish verifying" after a cancel, the review wall in manual mode |
| The draft (keystore) | Name, national ID, bike plate | Name only. A national ID stored by an older draft is dropped on the first visit |
| `POST /riders/become` | 400 without a national ID on the profile (IR26-02) | No ID needed. An account that has one is still refused on a live collision before a paid session opens |
| A verified ID-check decision | The vendor's number was hashed (IR26-04) and stored encrypted (D-70) | When the account has no national ID, the vendor-verified number **becomes** its national ID: same normalisation, AES-GCM encryption and HMAC hash as a typed one, in the decision's own transaction |

**The adoption rules** (`RiderService.applyKycResult`):

- The decision takes the number's advisory lock first. It is the key `completeProfile` and
  `auth.updateProfile` take, so every concurrent claimer of the number queues behind it.
- If the number is on another account (typed or vendor hash, erased tombstones included), the rider is
  held for review (`verified_id_collision`) and nothing is adopted.
- The ID is adopted only by a decision that will verify the rider in this transaction (not held, and newer
  than the last applied one). It is a CAS on an empty `idNumberHash`. If a different ID landed on the
  account during the check, that is a mismatch and the rider is held.
- If the live-ID unique index (IR26-05) still refuses the write, the decision is re-applied once with
  adoption off, and the rider is held as a collision. The webhook never 500s on it.
- An account that already has a national ID is unchanged: the IR26-04 mismatch and collision holds apply
  as before.
- **No number at all** (none on file and none in the decision): the rider is **verified**. The extractor
  is fail-open by design, and a held rider's only way forward is another paid session. The
  `rider.kyc_approve` audit row carries `verified_id_missing`, so ops can find every such rider.

**The extractor had never read a real webhook (IR26-06).** Our Didit destination is registered as V3
(`docs/PILOT-READINESS.md` step 3), and V3 carries the ID report as `decision.id_verifications[]`.
`extractDiditDocumentNumber` read only V2's singular `id_verification`, so IR26-04 and D-70 had no data.
It now reads the V3 array first. It prefers `personal_number`, Didit's national ID number "when distinct
from the document number" (a passport's document number is the passport number), and falls back to
`document_number`.

**Strings.** None are new: the name step reuses C5's `OB.nameTitle`, `OB.nameSub` and `OB.draftRestored`
and R1's `RO.startIdCheck`. These are removed with the page: `RO.detailsTitle` "A few details first",
`RO.detailsSub`, `RO.privacy` "We verify your national ID with an ID photo and a quick selfie check. We
store your ID number…", and `RO.privacyTest`.

**Supersedes:**
- D-55's "Photo step" row (already narrowed by D-62);
- D-62's "After R1" row;
- D-70's "Didit ID prefill" paragraph. The encrypted `verified_id_number` and `/auth/me` `kycIdNumber`
  stay, but become-a-rider no longer reads `kycIdNumber`.

It changes IR26-02 on purpose: rider onboarding no longer requires a typed national ID. The
one-ID-one-account dedupe now runs against the number the check verified.

**Follow-up (2026-10-04, IR26-08): an approval by hand adopts the number too.** This closes item 2
below. `adminSetKyc` serves the review page's Approve, the queue's quick Approve and every approval in
manual mode. It now settles the national ID as the verified webhook does, through helpers the two share
(`RiderService.adoptVerifiedId`, with its lock and collision count):

- **The account has no ID and the ID check verified one** (`riders.verified_id_number`): that number
  becomes the account's national ID. The webhook's guards apply: the number's advisory lock before the
  row lock, the collision count on both hash axes, the CAS on an empty slot, and the unique-index
  backstop.
- **That number is on another live account:** the approval is **refused** with a 409 the console shows:
  "Can't approve: the national ID from this rider's ID check is already on another live account.
  Resolve that account first." Nothing is adopted and nothing is approved. An erased tombstone does not
  refuse. The webhook holds such a match so that a human can approve a returning user, and this
  approval is that human; the one-ID-one-account rule draws the same line.
- **No vendor number at all** (manual mode, or a payload without one; until the second follow-up below,
  also any result the webhook held as `pending`): the rider is approved, and the `rider.kyc_approve` audit
  row carries `verified_id_missing`, as the webhook's does.
- **An account that already has an ID** is approved exactly as before.

What changes for riders: a rider approved by hand now has the verified number as their national ID,
the same as a rider the webhook verified. On the admin KYC review page, a pending review with no ID on
file shows a "No national ID on file" notice in the kit's own `.warnbar` (the element the resubmission,
duplicate-ID and mismatch notices already use). It says either what approving will adopt, that
approving will be refused, or that there is nothing to adopt.

**Second follow-up (2026-10-04, IR26-09): a result held for review stores its number.** Owner's call
(item 2 below): store it. The webhook now stores the number Didit read from the document when it holds a
result Didit **judged** for a human (`isDiditReviewHold`): Didit's In Review, or a Didit approval whose
face match falls in the review band, which is final at Didit. A session Didit never finished judging
(Abandoned, Expired, In Progress, Resubmitted) is still ignored: a number in its partial data verified
nothing.

- **What is written** (`RiderService.recordHeldVerifiedId`): `verified_id_hash` and `verified_id_number`,
  normalised and encrypted like a typed ID. Nothing else. The decision is not resolved, so the rider stays
  `pending` with `kycStatus`, `idVerified` and `kycResolvedAt` unchanged. Nothing is adopted onto the
  profile, and no audit row or notification is written. The rider's own app gets the number only once
  they are verified (`/auth/me` `kycIdNumber`).
- **Only while the rider's current check is undecided:** the session matches `kycRef`, the rider is
  `pending`, and `kycResolvedAt` is empty. Every decision stamps `kycResolvedAt`: the webhook's (a verify
  it holds for review included, which stores its own number) and a hand approval, decline or expiry. So a
  held result never overwrites a resolved decision's number, in any delivery order. This is deliberately not the
  event-time comparison decisions make: the only time a webhook carries is Didit's dispatch time, and
  Didit re-signs a retry with a fresh one. A check that `retryKyc` replaced, and an erased account
  (erasure nulls `kycRef`), match no row. Erasure still scrubs the number and keeps its hash (DS15-02b).
- **IR26-04 carries over:** the stored hash makes a later applicant showing the same document collide, as
  the verified-but-held path already does on purpose. The write takes the number's advisory lock first,
  like every writer of a national ID.

What changes: the review page's "No national ID on file" notice now names the number for a held rider
("Approving makes the number the ID check verified, … this account's national ID", or that approving
will be refused), the duplicate-ID and mismatch notices work for them, and approving adopts the number
instead of flagging `verified_id_missing`. A held result whose delivery Didit drops after its two
retries, or that arrives only after a human decided, still stores nothing; approving that rider is
flagged as before.

**Open for the owner**

1. **Watch the coverage after deploy.** Look for the log line `KYC <ref>: verified webhook carried no
   document number` and for `verified_id_missing` audit rows. If they are common, the Didit workflow is
   not returning document data, and the dedupe has nothing to key on.
2. ~~**A KYC approved by hand adopts no ID.**~~ **Closed 2026-10-04 (IR26-08)**: see the follow-up above.
   ~~**One gap remains, and since IR26-07 it is the common case.**~~ **Closed 2026-10-04 (IR26-09), the
   owner's call:** see the second follow-up above. The gap was that a result the webhook holds as
   `pending` stored nothing, the number included: Didit's In Review and, since IR26-07 made the face-match
   bands run, a Didit **approval** whose face match falls in the review band (0.6–0.85), which is final at
   Didit. Such a rider reached the admin queue with no number, so approving them adopted nothing and was
   flagged `verified_id_missing`.
3. **No consent line before the check.** The privacy notice says consent for the ID and selfie is "given
   when you start rider verification". The only written line for it was `RO.privacy` on the details page,
   and since D-55/D-62 most riders had already skipped that page. R1 draws no such line. If the owner
   wants one, it is a Claude Design request: the app does not improvise it.

## D-76 · Pharmacies launch in full: a Pharmacy card at sign-up, prescriptions on by default — APPROVED (2026-10-04)

**Owner instruction, this session (2026-10-04):** *"Shops are also fully launched. If not they must be
launched."* then *"Pharmacies must be launched too in full."*

Before this, no business could become a pharmacy. The merchant-mobile A3 "What do you sell?" draws only
Restaurant and Shop (D-48 §4 records it), a shop is stored with kind `other`, and nothing in the merchant
web or admin console sets the kind. So the customer Pharmacy section (D-58), which lists only kind
`pharmacy`, could never list anyone. Prescriptions (D-59, BRIEF §13) were built but `RX_ENABLED` had no
workflow Variable, so production kept them off.

### 1 · What changes

| Where | Mock / before | App now | Why |
|---|---|---|---|
| Merchant `/onboarding` A3 | Two radio cards: Restaurant, Shop | **Three:** Restaurant, Shop, **Pharmacy**. Same `m-opt` card (84px, r14, 56px tile). Pharmacy uses the design's `assets/service-icons/pharmacy.svg` on the `--tile-pharmacy` tint (#C5E9DF). Picking it signs up `businessType: shop, shopKind: pharmacy` (the API has accepted `shopKind` since L1). | A pharmacy needs a way in. Undrawn, so it reuses A3's own card and the customer app's Pharmacy sticker. **Upstream ask:** draw the third card. |
| Release / staging workflows | `RX_ENABLED` not passed (env default `false`) | `RX_ENABLED: ${{ vars.RX_ENABLED \|\| 'true' }}` (staging: `STAGING_RX_ENABLED`), validated `true\|false` with the other kill switches | "In full" includes prescriptions. Setting the Variable to `"false"` is the kill switch. Safeguards are unchanged: only a team member the owner ticks as pharmacist can approve or decline, and an Rx order can't be packed until one does (runbook §5). |

**Ungated (owner, 2026-10-04: "Ungate prescription orders"):** the API's own default for `RX_ENABLED` is
now `true` too (`apps/api/src/config/env.ts`, `.env.example`), so no deploy path leaves prescriptions off by
omission. `"false"` stays the kill switch; the pharmacist check stays mandatory.

Nothing in `packages/design/**` changes.

### 2 · Open for the owner (PENDING OWNER REVIEW)

- The browse-v2 OTC notice (B4/S4, `B.list.otc`, verbatim) reads *"Over-the-counter only. No prescription
  medicine yet."* With prescriptions on, that line is no longer true, while Order flow v2 draws the Rx
  states (R8a/R8b, T5c, M8, RD1d). The two handoffs disagree. The app keeps the drawn copy until the owner
  picks the wording (or a browse export redraws it). The fix would land in the customer app and ship with
  the next build.
- **Resolved 2026-10-06 (E2E FS-5, owner: *"Hide it while Rx is on"*).** The notice (list, storefront and
  the item sheet's line) renders only while `rxEnabled` is off, and so does Review & place's matching
  `O.r.otc` note ("Over-the-counter medicine only…"). `useOrderFlags` fails closed, so an unknown
  flag (an older API, offline) keeps it shown. No copy changes.

## D-77 · Merchant v2: one shell and one order lifecycle for kitchens, shops and pharmacies — APPROVED (2026-10-04)

**Owner instruction, this session (2026-10-04):** *"i want to redesign merchant flows for both kitchen and
shops … they shld be simple and in line with latest customer side redesign. kitchen and shops should share
common things except where fundamentally different."* Then, with the export: *"here are the redesigns.
review them and implement."*

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze gates.
The design package only *absorbs a new export* here; nothing in it is edited to match code.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/merchant-v2/` | The Merchant v2 export (`merchant-v2-2026-10`), **verbatim**: `BRIEF.md` (the product rules, "final"), `README.md` (screens K1–K5, S1–S4, P1, T1–T4, the component spec table, Needs backend, Keep/Retire), `CLAUDE-CODE-PROMPT.md`, the 14 screens (`Merchant v2 - all screens.html` and its source `MerchantV2.dc.html`) and a `tokens/` snapshot. |
| `packages/design/handoff/merchant-v2/` (2026-10-05) | The **follow-ups export** (`merchant-v2-followups-2026-10-05`, the owner's answer to Part A), merged over the folder **verbatim**: the new `README.md` (shared sheet patterns, K2a/S2a, K3a–c, K1b/c, K5b/c, T1b, T2b, A1/A2, the 44px rule), `CHANGELOG.md`, `CLAUDE-CODE-PROMPT.md`, the rebuilt `Merchant v2 - all screens.html` (27 frames) and `source/MerchantV2.dc.html` + `source/MerchantV2Followups.dc.html` (which replace the root `MerchantV2.dc.html`). The 2026-10-04 `README.md` and prompt are kept as `README-2026-10-04.md` / `CLAUDE-CODE-PROMPT-2026-10-04.md`; `BRIEF.md` and `tokens/` are unchanged (identical). |

### 2 · Authority for the merchant app (a scope rule)

For merchant screens the LOOK is now this handoff. It **builds on D-48** (merchant-mobile, the phone
frame and the screens Merchant v2 doesn't redraw: sign-in, onboarding and the settings sub-screens, which
are restyled only) and supersedes D-48's B1–B7, C1–C5 and D1–D7 and D-59's merchant M-screens where they
overlap. Order flow v2's copy (`ORDER_FLOW` in `apps/merchant/app/lib/vocabulary.ts`) stays the source for
any string Merchant v2 doesn't draw. Viewport unchanged: 360×720 with the 320px check.

### 3 · Owner decisions on what the handoff assumes (2026-10-04, asked before building)

| Handoff says | Decision |
|---|---|
| BRIEF §3: a 60 s (kitchen) / 90 s (shop) countdown to answer | **Keep the server's 3-minute accept window.** The ringing screen counts down the real time left (`acceptDeadlineAt`). No customer-facing change. |
| S1/S2 name the customer ("Rudo asked for 4 items", "4 items · Rudo · cash") | **Add the customer's first name** to the merchant's order read (additive), so the drawn copy is used word for word. First name only. |
| BRIEF open question 2: does +5 min notify the customer? | **Yes**, a silent push with the new time. |
| BRIEF open question 1: a manual hand-over when the rider's phone is offline | **Build it behind a flag that stays off.** |
| S4 "Booking terms" (2026-10-05) | **No booking-terms UI.** Send's liability terms are implied at sign-up; the owner updates the Terms & Conditions. The booking still sends the disclaimer version the API records (no UI). |
| Sign-in, onboarding and the settings sub-screens (2026-10-05) | **The restyle stands** — confirmed, no redraw. |

### 4 · What differs from the drawings, and why

| Where | Mock | App | Why |
|---|---|---|---|
| Handoff `tokens/colors.css` | `--highlight-sun`, `--highlight-sun-ink` | `--highlight`, `--highlight-chip-ink` | The export carries an older token snapshot. D-55 already made `--highlight` the sun gold (#FFD23F) and `--highlight-chip-ink` is the same #3D3100, so no colour is added. |
| T1 live bar | "Blessing is at your counter" | As drawn once the rider's location reaches the pickup (`riderArrivedAt`); "Blessing is coming to your counter" before that | Arrival comes from the rider's location pings (`TrackingService.observeRiderLeg`, within 80 m of the pin), additive on the merchant read. |
| T1 live bar, undrawn states (2026-10-05) | Drawn by T1b: the ringing bar (accent, "New order · #A1B2 · 2:28", "Tap to answer · 0:48 to answer"), the counter bar (only once the rider has arrived), the waiting bar ("Waiting for Rudo's OK", "2 changes on #A1B2 · keep packing") and the counts bar ("Next ready HH:MM") | As drawn; the ringing bar opens the board, the counter bar jumps to that order's card | Resolved by the follow-ups export. |
| T4 on a shop | "Customers can see your menu" | "…your items" | A shop has no menu; the shop's vocabulary word. |

| K1 board, "ON THE WAY" card | "Arrives 07:38 · then brings you $12.00" | As drawn once the rider's location gives an estimate (`riderEtaAt`); "On the way · then brings you $12.00" until the first ping | The estimate is the ride at the slot planner's speed model, refreshed every 15 s and rewritten when it moves a minute. |
| K1 counter card on a shop booking | Drawn on a kitchen order | The same card for a booking whose rider is coming, without the BOOKED tag | The drawn counter card carries no tag. |
| K2 ringing, auto-accepted / scheduled | "Only the banner line changes" | Auto-accepted: the sub-line reads "LyniaGo accepted this for you", the countdown is the 1-hour auto-cancel, no ready-in chips (the time is already set). Scheduled: "SCHEDULED · START NOW · #A1B2". | As BRIEF §3 says; the words are Order flow v2's (`O.m.auto`, `O.m.scheduled`). |
| S2 accept without changes | Only "Accept with 2 changes" drawn | "Accept" | Shops get no ready-in picker (BRIEF §3), so there is no time to quote. |
| K2 kitchen with a removed dish | Drawn without changes | The same "Accept with N changes" and "New total" as S2 | BRIEF §3: accepting and sending changes are one action. |

| K3 cooking ticket, rider line | "Blessing M. arrives 07:31" | As drawn while the rider heads in; "Blessing M. is at your counter" once there; "is booked to collect it" until the first ping; "Finding a rider" / "We book the rider to arrive as it's ready" before one is booked | Same arrival and estimate as K1. |
| K4 rider card sub-line (2026-10-05) | A1: "AFG 2231 · ★ 4.9 · arrives 07:31" before arrival, "… · at your counter" (accent) once arrived | As drawn; with no estimate yet the time is dropped (A2) | Resolved by the follow-ups export. |
| A1 / A2 arrival states (2026-10-05) | K1 counter card: before arrival 1px line, surface disc, "Arrives 07:31 · #A444 · $10.00", no button; arrived 2px accent, "Since 07:30 · …", Hand over, top of NEEDS YOU. A2: K3 "… is on the way to you" (muted), K5 "… · on the way · 2 dishes", never "arrives —" | As drawn, on the board, K3, K4, K5 and the booking K5. A shop booking's counter card keeps its items after the time ("Arrives 07:31 · Bread, Eggs"), since a booking has no order number on the board. | Resolved by the follow-ups export. Evidence: `docs/parity/MERCHANT-V2-FOLLOWUPS-ARRIVAL-2026-10-05.png`. |
| K4 / K5, the call button | Drawn | Shown when the order carries the rider's number: the merchant's own read now does (`riderPhone`, additive) | BRIEF "Needs backend". |
| S3 step 2 before the photo | Drawn done ("Tendai photographed it") | "Tendai photographs it" / "Waiting for Tendai M.'s photo of the sealed bag" until it's in | The undone state of the drawn step. |
| K5 sub-line | "Blessing M. · arrives 07:38 · 2 dishes" | As drawn once the rider's location gives an estimate; "Blessing M. · 2 dishes" until then | Same estimate. |
| K5 cash card before delivery | "Blessing brings it back by 07:55, after delivery" | "Blessing brings it back after delivery"; the time appears once delivered | The due time is set at delivery (delivered + the return window). |
| +5 min | — | `POST /merchant/orders/:id/extend-prep` adds 5 min of prep (capped at 120) and sends the customer a **silent** push (FCM data-only / APNs background) with the new ready time | Owner decision (BRIEF open question 2). The customer app refreshes the order and its Orders/Home cards when the push arrives, and never shows it as a banner (`kind: "food_ready_time"`). Dispatch already follows the new time: an auto-accepted order's rider search starts 8 min before the extended ready time, and any other order dispatches only once the kitchen marks it ready. |
| "Open, but busy" | README "Needs backend": +10 min on every ETA quoted | Prep on accept already carries +10 (`BUSY_MODE_EXTRA_MIN`); the browse cards' and venue page's quoted prep (`prepBaselineMinutes`) now carries it too while busy is on | So the customer's estimate matches what the kitchen will set. |
| Offline-rider fallback | — | "Rider can't enter code" on K4/S3 behind `NEXT_PUBLIC_MERCHANT_HANDOVER_FALLBACK` (off). It asks the API for a signed 15-minute link (`POST /merchant/orders/:id/handover-fallback`, needs `MERCHANT_WEB_URL`) and opens the merchant's own SMS app to the rider with it. The rider's page (`/h/<token>`, no sign-in) takes the same 6-digit code the counter reads out (same check and attempt cap as the app). The link dies at expiry, at pickup, and when the code is re-minted. Both routes are throttled and audit-logged. | Owner decision (BRIEF open question 1): built behind a flag that stays off. The rider's page and the SMS text aren't drawn; **upstream ask:** draw them. |
| Shop's ready button | "Order is packed" (Order flow v2) | "Packed" | BRIEF §4. |
| Back header | merchant-mobile's 16/700 bar | 52 tall, 44 back target in accent text, title 17/700 — on every pushed screen | Merchant v2 spec ("restyle only" for settings sub-screens). |

| S4 "Going to" from a pasted link | "Pin the buyer sent · Copacabana" | As drawn once the reverse lookup answers; "Pin the buyer sent" until then, or when there is no Places key or no area | The reverse lookup (Geocoding API, the key the Places search already uses) runs after the pin shows. |
| S4 "+ Add" | A chip | Opens the shop's items, with "Type one" at the bottom; a chip taps to remove its line | The two ways in from D-48's D3, in one sheet. |
| P1 checklist storage | — | The three ticks are stored with the check (`order_prescriptions.checklist`, JSONB, nullable — migration 0074, expand-only) on approve and on decline | BRIEF "Needs backend": stored for the audit trail. An older screen still approves without them. |
| P1 → S2 | README: "P1 comes before S2. Approving P1 continues into S2." | A pharmacist's ringing screen shows "Check the prescription" in place of Accept until it's approved; the check returns to the ring | The API already allowed the check while the order rings. |
| P1 decline prefill | "Already filled in from the unticked box" | The first unticked box picks the reason (name / stamp → Not valid; date → Expired) and a one-line note | The note text isn't drawn; it is plain and editable. |

| T2 Money, today's rows (2026-10-05) | Drawn by the follow-ups T2: cash on its way "$8.00" with "back by 13:05", "You couldn't take it · Too busy" and "Missed · no answer in time" with "No sale" | As drawn: `lines[]` now carries `dueAt` and the rejection `reason` (additive). A missed order is one the accept sweep closed (`shop_closed`) or an unconfirmed kitchen (`kitchen_unconfirmed`); a rejected order with any other reason reads "You couldn't take it" alone. Cancelled and not-delivered rows also read "No sale" (undrawn; same rule as BRIEF §9). The rows' titles had been inheriting the link green (`.m-app a:not([class])`); fixed. | Resolved by the follow-ups export. |
| T2b Money, this week (2026-10-05) | Bars, then one row per day of the locale week | As drawn, from the new `GET /merchant/summary/week` (Monday to today, server-local days). Days not yet reached have no bar and no row. Two undrawn sub-lines: "N orders · cash on its way" (cash still out, none late) and "0 orders". A tapped earlier day opens in the Today layout (`GET /merchant/summary/today?date=`) with "This week" still selected and its date as the section heading in place of "TODAY"; its late-cash cards are Today's only. | The README says "opens that day in the T2 Today layout" without drawing it. **Upstream ask:** draw the opened day. |
| T3 Account rows | Values drawn on some rows | Every row shows its value where the API has one (hours today, rider count, "1 invite open") | Built from the drawn row; no new words. |
| T3 "Help" (2026-10-05) | Drawn by T3: its own HELP group, "Help & support" with the value "WhatsApp" | As drawn, shown when the support WhatsApp number is configured | Resolved by the follow-ups export. |
| T1 Menu, "Add a dish" (2026-10-05) | Drawn by T1: a "+ Add a dish" pill beside the title (the vocabulary's item word for shops) | As drawn; the old bottom CTA is gone | Resolved by the follow-ups export. |
| Shop booking after the pick | "Book a rider → offers → K5" | D-48's tracking (D5) and delivered (D7) screens are replaced by K5: map, Step 3/4/5 of 5, rider card, the buyer's code until delivered, the cash card and "I got $X" | BRIEF §5. The vertical stepper is retired. |
| K5 cash card on a shop | "Food $12.00" | "Goods $51.00" | A shop sells goods, not food (the BRIEF's vocabulary swap). |

| Tap targets (2026-10-05) | Every pressable ≥ 44px | As drawn: the K3 Problem pill, S4 item and "+ Add" chips, T1 category chips (`.m-chip`), the T2 Call pill, the K1 "Hand over" pill and P1 "Zoom" are 44px; every padded-hit-area workaround is gone. `apps/merchant/app/tap-targets.test.ts` fails any pressable drawn under 44px or padded with an invisible hit area. | The follow-ups export redrew them. Allowed exceptions, each named in the test: the 44×26 switch (its row is the target; **upstream ask:** confirm), T2's segments inside their 44px track (as drawn), and the hours day chips (restyle-only screen). |

| K2a / S2a / K3a / K3b (2026-10-05) | Drawn | As drawn: the shared `ReasonSheet` / `PathCard` / `InfoStrip` (`components/m/ReasonSheet.tsx`). The reasons are the API's codes (D-11): `out_of_ingredient` / `out_of_stock`, `too_busy`, `closing_soon`, `other` to turn down; `ran_out`, `kitchen_problem`, `too_busy`, `other` to cancel (`out_of_stock`, `ran_out`, `kitchen_problem` are new, additive). "Something else"'s note (≤ 80) is stored on the order and follows the customer's push sentence in quotes. | The handoff's `OUT_OF_INGREDIENT`-style constants are the existing lower-case codes. The customer's in-app order screen doesn't render the note yet (mobile); the push carries it. |
| K3c refund (2026-10-05) | "The API refunds the customer first, then cancels" | The same sheet, plus the "Refund reference" field, then `POST …/refund` (refund-then-cancel); "Refunding…" while it runs and the drawn error if it fails | Wallet orders are retired (D-74), so K3c only finishes an order placed before then; its refund is the merchant's own mobile-money refund, so the API still needs that reference. No refund-status field is added. |

| K1b / K1c (2026-10-05) | Drawn | As drawn: CASH TO COME BACK rows ("$12.00 · #A105", "Blessing M. · delivered 07:12 · back by 07:30"; a late row gold with a LATE chip, "was due 07:10" and a 44px Call pill, late rows first), SCHEDULED rows (dashed, clock, "12:30 today · #A301" / "Tue 07:00 · #A301", "3 dishes · $18.00 · rings at 12:00"), and "All quiet for now" with "Check your menu" / "Book a rider". A booked delivery's cash row reads "$51.00 · Brake pads". A several-line title joins names with commas ("Mazondo, Sadza & greens"), as drawn. | The booking row isn't drawn; it is the order row with the booking's goods. "Cash due" at zero is `--muted`, as the README says (the frame draws it in ink). |

| K5b / K5c (2026-10-05) | Drawn | As drawn: "#A115 delivered" · "Blessing M. · 07:41 · 2 dishes", every step done, the door photo, the mint "Paid by wallet · $14.00 / Nothing to bring back. It's in your Money tab." and no CTA; "#A117 couldn't be delivered" · "Customer didn't answer · 07:44", step 4 red, the GOODS BACK TO YOU card ("2× Mazondo · $10.00", "… brings it back by 07:58" or "… is bringing it back"), "I got the food back" / "I got the goods back" and "It wasn't returned" (a one-confirm sheet, "Report to LyniaGo", then "We've told LyniaGo. We'll WhatsApp you."). The "after delivery" CTA is drawn disabled (`--surface`, `--muted`). | A cash order on "pay me at pickup" (no cash back) reads "Paid at pickup · $X" in the same strip (not drawn). The "back by" time is the return deadline (`cashDueAt`); the rider's return trip has no estimate. "Mark ride completed" stays only while on the way. |

*Further rows are added PR by PR as the screens land.*

## D-78 · Empty states v2: one quiet component for every empty, nothing-found and couldn't-load state — APPROVED (2026-10-06)

**Owner instruction, this session (2026-10-06):** *"i want to redesign the card for empty states. They dont look
that nice."* Then, with the export: *"i have redesigned please implement and test"*.

**This entry exists because the work touches `packages/design/**`**, which the reverse-drift freeze gates.
The design package only *absorbs a new export* here, plus the one token its README §5 names.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/empty-states-v2-2026-10/` | The export, **verbatim**: `README.md` (the component, two sizes, three tones; the 17 drawn frames; the rules for the undrawn states; out of scope), `copy.ts` (every string, with the old copy as `was:` notes), `CLAUDE-CODE-PROMPT.md` and the 17-frame canvas `Empty States Minimal v2.html`. |
| `packages/design/tokens/colors.css` | `--accent-wash-pressed: #d4f2e0`, the soft pill's pressed fill (README §1 and §5 name it `accent-wash-pressed`). Mirrored as `accentWashPressed` in `packages/shared/src/design-tokens.ts` and asserted by the token-conformance guardrail. |

### 2 · Authority (a scope rule)

For any empty, nothing-found or couldn't-load state in `apps/mobile`, this handoff overrides the handoff that
owns the screen around it: Orders v2 (D-63: O9d, O10c, O16–O18, O20, O21), Calm Mint v2 (D-55: H6 and the
both-rails-empty card, reworded by D-60), Notifications v1 (D-66: N8a/b, N10), Browse v2 (D-57/D-58: B3b, B6,
B7, B9a–c, B10b, B11, S8, S12b, S13c, X4a, X4b), Order flow v2 (D-59: R9a, T14c), After send v2 (D-53: 2.3) and
Rider v2 (D-54: J4/J5, M9, and C12, which drew no empty state). Strings come from `src/ui/emptyCopy.ts`, the
handoff's `copy.ts` verbatim.

**Copy approval.** The handoff lists every changed line and every removed action ("Proposed copy changes",
README §6) for sign-off; the owner sent it to be implemented, which is that sign-off. The removed actions stay
removed: O16/O17 "Send a parcel" + "Find food or shops", N8a "Send a parcel", B9 "Send a parcel", the Home
both-rails "Send a parcel" (D-60) and J4's "Why no jobs?" box.

**Out of scope, untouched (README §3):** rider gates (G1–G14), S9 "just closed", F4 food offer gone, the
service-soon sheet, the merchant app and the admin console.

### 3 · What the build decides where the handoff doesn't draw

| Where | Handoff | App | Why |
|---|---|---|---|
| B9 on Shops / Pharmacy | Draws Restaurants only ("No restaurants in {area} yet" / "We’re adding kitchens near you.", `utensils`) | "No shops in {area} yet" / "We’re adding shops near you." (`store`); "No pharmacies in {area} yet" / "We’re adding pharmacies near you." (`pill`) | The drawn lines with the section's noun. **Upstream ask:** confirm. |
| S12b on Shops / Pharmacy | "Try all restaurants instead." / "Search all restaurants" | "restaurants" becomes "shops" / "pharmacies" | Same rule. |
| B11 on Shops / Pharmacy | "Couldn’t load restaurants" | "Couldn’t load shops" / "Couldn’t load pharmacies" (Browse v2's titles), body and pill as drawn | Same rule. |
| O9d title | "No {service} orders yet" | `{service}` is "parcel", "food", "shop" or "pharmacy" | The chip's own word, singular. |
| Job history summary | "This week · {count} jobs · {amount}" | "1 job" when there is one | Grammar; every other count as drawn. |
| Placement (README §1) | Top of the mark at ≈30% of the free height, min 48 | As drawn wherever the block fills a screen. Where it sits in content-sized space it takes the drawn offset: Home 52 below the tiles, storefront 120 below the info, a list's header 48, Job history 56, a sheet 24 | A content-sized list or sheet has no free height to measure. |
| Rider "couldn't load" (job, food job, Job history) | "none — rider screens never show Retry; line says what the app is doing, e.g. 'Trying again in 10 s'" | The error tone, the screen's existing title, and "Trying again in {s} s" counting down; the screen retries every 10 s. Back moves into the app bar. "Your active job is safe" is no longer shown | One line, as drawn. |
| Root crash screen | — (not listed) | The error tone with "Reload" as the soft pill; its title and line unchanged | A crashed tree can't retry by itself, so it keeps its one action. |
| Food offer, Restaurants switched off | — | The info tone, with an app bar back to Jobs | It was a dead end with no way out. |
| Notifications, empty or failed | Drawn on white | The page is white while empty or failed; the feed itself stays on `--surface` | As drawn. |
| J4 reconnecting | "shown only in the header status line, not as a banner in the sheet" | The sheet banner is hidden while the board is empty; with jobs on the board (J6) it stays | J6 is not part of this handoff. |
| Shops / Pharmacy search | Idle state is new; X4b is a row above the recents | Idle: "Search shops" / "Search pharmacies" as drawn. Offline: the X4b row (this screen keeps no recents) | As drawn. |
| Storefront couldn't load (S13b), order not found (2.3, T14c) | B11's rules; "Order not found" as listed | S13b: the error tone with Browse v2's title, "Nothing was lost." and "Try again". Not found: the info tone with "Back to home" as the soft pill (on the parcel order screen it sits in the sheet and the bottom bar goes) | README §3. The transient "couldn't load" states of the two order screens are not empty states and keep their own treatment. |

**Retired:** `InfoCard`, `IconDisc` and `EmptyArt`/`ServiceArt` (Orders kit), `MintEmptyCard`, `PillButton`,
`NEmpty`, `NFail`, `BrowseEmpty`, Browse's `NoLocationCard`, `WhyQuiet`, and `TrustTrackingArt` (the pin is no
longer drawn anywhere in the app; its SVG stays in the Calm Mint v2 handoff).

**Evidence:** `docs/parity/EMPTY-STATES-V2-2026-10-06.png` (before / after for every drawn frame, 360×720, rendered by
`tools/parity`); the 320×640 check was run on O16, H6, B9, S8 and J4.

## D-79 · Owner decisions 2026-10-06: Personal details, rider photo + bike plate, free-jobs reminder, immediate deletion copy — APPROVED (2026-10-06)

**Owner decisions (2026-10-06, this session)**, after the startup review
(`startup-review-2026-10-06`, items C-10, R-8 and §6) found four promises the app made and didn't keep:
C5 "You can add it in Account" (nowhere to add an ID), R1/R3 "Your photo … can wait" / "Add your photo …
later in Account" (Bike & documents was read-only), R3 "We'll remind you before you need to top up" (no
reminder existed), and Delete account's "Sign back in within 30 days and the deletion is cancelled" (the
API erases at once). The owner chose to make the first three true and to change the fourth's words. None
of the new screens or strings is drawn; this entry is their approval.

### 1 · Personal details (C-10)

| Where | Mock | App | Why |
|---|---|---|---|
| Settings → YOUR ACCOUNT, second row (both sides; Settings is one screen) | Calm Mint v2 `mint2.js` `OB.account` draws the row "Personal details · Name, phone, optional ID" on an Account screen the app doesn't use | The row, words verbatim (`R.sPersonal` / `R.sPersonalS`), an `id-card` disc, after the identity row | Makes C5's note true. The row's words are drawn; its place in Rider v2's Settings is not. |
| `app/settings/personal.tsx` | Not drawn | Rider v2's `PushHeader` ("Personal details"); C5's side-by-side `NameFields` (editable), the `VerifiedPhoneRow`, a 52px ID field under the `FieldLabel` "National ID (optional)", C5's surface `Note`, the 52px `Cta` "Save" (`R.save`, D-54) | Built from the two drawn grammars the owner named. |
| The ID | — | Optional. Saved through `PATCH /auth/me` (sent normalised, only when it changed). The one-ID-one-account refusal (409 `id_in_use`) and the verified-ID freeze (403) show under the field in the API's own words. A stored ID can't be emptied here (the API has no clear): Save stays off and the line below says how. | Existing API rules; no API change. |
| A verified rider | — | The ID read-only, masked to its last three characters ("••••••••A42"), "Verified" (C5's word) and the note below, no field | Since D-75 the check's number becomes the account's ID; the API refuses to change it. |
| Storage | — | Memory only: `me` is persisted with `idNumber` / `kycIdNumber` stripped (`redactBeforePersist`, unchanged); the screen keeps no draft | |

**New strings** (`src/ui/rider/copy.ts`): "Personal details" (also the title), "Name, phone, optional ID" (both
drawn), "National ID (optional)", "Only if you want to add it. We keep it private and only use it to
confirm who you are.", "This came from your ID check. To change it, contact support.", "To remove your
national ID, contact support.", "Couldn't load your details. Check your connection and try again.",
"Couldn't save your details. Check your connection and try again."

### 2 · Rider photo and bike plate on Bike & documents (R-8)

| Where | Mock | App | Why |
|---|---|---|---|
| Rider photo row | Rider v2 S5: "Rider photo · Verified" | No photo: sub "Not added yet" (D-62), value "Add photo". A photo: value "Change". Never "Verified". Tapping opens a sheet ("Rider photo", "A clear, recent photo of your face, on its own.", "Take photo" / "Choose from gallery"); the shot is downscaled, uploaded to `kyc/<you>/` (`POST /uploads/kyc-photo`) and attached with the new `PATCH /riders/me`. While it saves the value reads "Saving photo…" (`R.photoUploading`). | The photo is the rider's own upload after D-62, not something a check verified. |
| Bike row | S5: "Bike · ABH 4721 · Verified" | The plate as the sub. "Verified" **only** for a verified rider who has a plate; no plate: value "Add plate". Tapping opens a sheet ("Your bike's number plate", the field "Number plate", the hint "As it's written on the plate, like AEE 4471.", "Save"). | Since D-75 no plate is collected at sign-up, so every verified rider used to read "Bike · Verified" with no plate (review R-8). |
| Settings → Bike & documents row | S1: value "Verified" | The same rule (`bikeVerified`): no "Verified" without a plate | Same. |
| "Re-verify my bike" | Drawn | Kept (support on WhatsApp) | |
| Licence | R1 / R3 mention licence papers | **Not built** — no licence row (owner: licences aren't collected) | See §5. |
| `PATCH /riders/me` | — | `{ photoUrl?, bikeReg? }`, strict. The key must sit under the caller's own `kyc/<id>/` and pass the attach-time `UploadVerifier` (as `become` does); the plate is validated as `become` validates it (3–20 once trimmed) and stored upper-case with single spaces. Each change writes a `rider.profile_update` audit row (actor = the rider; the plate's old → new in the note), reserved against the free-text audit route. A replaced photo object is deleted after commit. Throttled 20/hour. | No migration: the `riders.photo_url` and `bike_reg` columns exist. |

**New strings:** "Add photo", "Change", "A clear, recent photo of your face, on its own.", "Choose from gallery",
"Allow camera and photo access in your phone's settings, then try again.", "Couldn't save your photo.
Check your connection and try again.", "Add plate", "Your bike's number plate", "Number plate", "As it's
written on the plate, like AEE 4471.", "Couldn't save your plate. Check your connection and try again."

### 3 · The free-jobs top-up reminder (R3)

| Where | Mock | App | Why |
|---|---|---|---|
| A push + an in-app Notifications row | R3: "We'll remind you before you need to top up." (no reminder drawn) | When a completed job leaves the rider **one** commission-free job: "One commission-free job left" / "After your next job, commission comes off your prepaid balance. Top up in Money so you can keep going online." When it leaves **none**: "Your free jobs are used up" / "Commission now comes off your prepaid balance. Top up in Money to keep going online." | Owner's words, verbatim. |
| When | — | Decided inside each completion transaction (customer rating, auto-close, ops adjudication), after the `tripsCount` increment, by the exact count (`freeFirstJobs − 1`, `freeFirstJobs`); a `rider.free_jobs_one_left` / `rider.free_jobs_used_up` audit row is the once-per-rider key and the feed row; the push (`kind: "free_jobs"`) goes after commit. Riders already past either count are never told late. | |
| While commission is off | — | **Silent.** At the 0% launch rate nothing comes off any balance and there is nothing to top up, so the sentences would be false. They start the day `COMMISSION_RATE_PCT` is flipped above 0. | Honesty over a reminder for a cost that doesn't exist yet. |
| Tap | — | The push and the row open the rider's Money tab (`/rider/money`), where "Top up" is | |
| The row's look | Notifications v1 draws no such row | The generic account row: banknote disc, neutral tone, the push's title and sentence | |

### 4 · Deletion is immediate (§6)

| Where | Mock | App | Why |
|---|---|---|---|
| `LJ.delete_final` paragraph | "Your account closes now and is permanently deleted after **30 days**. Sign back in within 30 days and the deletion is cancelled — after that, nothing can be recovered." | "Your account is deleted **straight away** and can't be recovered. Order records we must keep by law are anonymised." | `PrivacyService.eraseAccount` anonymises at once (phone → `erased:<id>`); signing back in makes a new, empty account. Resolves `docs/APP-STORE-SUBMISSION.md` D9. |
| `LJ.privacy` "How long we keep it" | "… · a deleted account is gone after 30 days." | "… · a deleted account is erased straight away." | Same. |

Nothing in `packages/design/**` changes. **Upstream asks:** draw Personal details, the photo and plate sheets,
the free-jobs rows, and redraw `delete_final` / `privacy` with the immediate-deletion copy.

### 5 · Open for the owner (PENDING OWNER REVIEW)

- R1 "Your photo, licence and bike papers can wait." and R3 "Add your photo, licence and bike papers later in
  Account" (`RO.notePapers`, `RO.papersLater`) still promise **licence** papers, which nothing collects. The
  photo and plate are now true; the licence half needs a decision (drop the word, or build a licence row).
- The reminder is silent until commission is switched on (§3). If the owner wants riders told during the 0%
  period, the copy needs different words.

## D-80 · Google Maps on the web apps: the merchant web drops OpenStreetMap — APPROVED (2026-10-06)

**Owner decision (2026-10-06, this session):** *"i will stay with google maps on both merchant and customer
web apps"*, after a cost review of a mobile web version for iPhone users. It replaces the OpenStreetMap half
of D-48 ("Google Places (New) for address search and GPS lookup, OpenStreetMap for maps"); Places and the
reverse lookup are unchanged.

| Where | Before | App | Why |
|---|---|---|---|
| Merchant B6 / D5 tracking band (`components/m/StaticMap.tsx`, on `/queue/[id]` and `/deliveries/[id]`) | OpenStreetMap tiles at zoom 15, a fixed 480px strip centred and cropped | One **Maps Static API** image at zoom 15, requested at the band's measured width (≤ 640px, centred beyond that) × its height at `scale=2`, with the same drawn pin on top. No marker, no map script. | Owner decision. Requesting the exact width keeps the image uncropped, so Google's logo (its terms) stays visible. |
| No key, or the image is refused | (OSM needed no key) | The handoff's grey placeholder, children (the back button) kept | Same key-gated, failure-quiet rule as address search. |
| The key | — | The existing browser key `NEXT_PUBLIC_GOOGLE_PLACES_KEY` (repo variable `MERCHANT_GOOGLE_PLACES_KEY`). **Owner action:** add **Maps Static API** to that key's allowed APIs, and set a daily quota cap on it in Google Cloud. Since 2026-10-06 the key is restricted to `https://merchant.lyniago.com/*`, so it also needs **Maps JavaScript API**: the "use my location" street lookup goes through its Geocoder, because the Geocoding web service refuses website-restricted keys. | One key per web app, restricted to its own address. |
| The customer web app (not built yet) | — | Will use Google's Maps JavaScript API for its interactive maps, with its own referrer-restricted key | Recorded here so its plan starts from this decision. |
| `lib/geo.ts` tile maths | Web Mercator + OSM tile helpers (left over from the retired `LocationPin`) | Removed; `staticMapUrl` + `insideServiceArea` remain | Nothing used them once the band stopped drawing tiles. |

**Cost** (Google's list price, to confirm on its pricing page): Static Maps and Dynamic Maps each carry a
monthly free allowance of about 10,000 loads, then roughly $2 and $7 per 1,000. At pilot volume this is
about $0. Nothing in `packages/design/**` changes; the merchant-mobile handoff draws a map band without naming
a provider.

## D-81 · The customer web app for iPhone users: web-only differences — APPROVED (2026-10-06)

**Owner decisions (2026-10-06, this session):** build a mobile web version of the customer app for iPhone users
(`docs/plans/2026-10-06-customer-web-app-plan.md`, W1–W5): `app.lyniago.com`, anyone with the link, an Android
"Get the app" banner, Add to Home Screen. It renders the same customer screens and follows the same mocks; the rows
below are the only differences, and they apply **only** in the web build (`EXPO_PUBLIC_LYNIA_WEB=1`,
`src/web-build.ts`). Phones and the parity lane are unchanged.

| Where | Mock | Web build | Why |
|---|---|---|---|
| C1 onboarding "Want to earn? Ride with LyniaGo" and every rider entry | Drawn | Hidden (`riderModeAvailable()` is false) | Customer-only, as on iPhone (D-41). |
| `LJ.perm_notif` (second permission step) | Drawn after location | Skipped: the location step finishes priming | No push on web until phase 5; asking for a permission nothing uses is a dead step. |
| Force-update screen | Drawn | Never shown | The web build is always the latest version. |
| Maps | Drawn on the phone's Google map | Google's Maps JavaScript map (D-80) with the screens' own pins, route lines and zones; a plain grey panel when there is no key or Google refuses it | Same map provider as the Android app; the browser has no native map. |
| Android "Get the app" banner | Not drawn | Not built yet: waits for the public Play listing, which returns 404 during closed testing | Owner decision W4; a banner to a dead listing would be worse than none. |

Nothing in `packages/design/**` changes. **Upstream ask:** draw the Android banner and the web Add to Home Screen hint.

## D-82 · First Run v2: permissions, app update, Personal details, Bike & documents, ID-check outcomes, rider entry, splash steps — handoff APPROVED (2026-10-06)

**Owner instruction, this session (2026-10-06):** the owner sent Claude Design the brief
`docs/designs/first-run-v2-PROMPT.md` (with the current-UI pack) and uploaded the result
(`Lynia_Design_System.zip` → `handoff/first-run-v2-2026-10`). Before building, the owner asked to review every
place where it clashed with the shipped UI ("where there are inconsistencies with current UI ask me for review
before execution"); §2 records those answers.

### 1 · The design-package sync (a record, not a deviation)

| Path | What |
|---|---|
| `packages/design/handoff/first-run-v2/` | The handoff, **verbatim**: `README.md` (shell, screens A–I, Android wiring, state, tokens, retires), `BRIEF.md` (18 decisions), `CLAUDE-CODE-PROMPT.md` (phases 0–6), `copy.ts` (`PC`, `RP`, `UP`, `PD`, `BD`, `KY`, `SP`), `design/` (the HTML reference: `First Run v2.html`, `First Run v2 - All States.html?screen=<ID>`, `fr-kit.js`, `fr-states.js`, `fr-copy.js`, assets) and `screenshots/` (one 1× PNG per state, `index.html` contact sheet). |
| `packages/design/tokens/colors.css` | **Phase 1 (2026-10-06):** adds `--danger-sun: #f4d9d5` — the sun on a danger hero panel (README §1 tones; BRIEF open question 1, answered by the owner below). Decor only, never text. Mirrored on every face (`packages/shared/src/design-tokens.ts` `dangerSun`, admin + merchant `globals.css` `:root`) and pinned by `design-tokens.drift.spec.ts`. `#FFF6D6` needed no token: it is the existing `--highlight-chip-wash`. |

### 2 · Owner decisions where the handoff meets what already shipped (2026-10-06, asked before building)

| # | Clash | Decision |
|---|---|---|
| 1 | D1/PC11/P15 redraw Settings (round back button, large title, YOU + ALERTS cards with toggles) and leave out Privacy, Terms, Payment, Delete account, Test ping/alarm | **New look on Settings and its sub-pages (Personal details, Bike & documents, Language, Privacy, Delete account), keeping every existing row.** A toggle mirrors the OS permission: it requests it, or opens phone settings; the app cannot switch a permission off |
| 2 | H1/H2 draw a different splash (big centred wordmark, corner sun, card radius 20, no dove/orbit) | **Keep splash-v1's look for everyone.** Take only the rider's two steps (`SP.r1`/`SP.r2`), the 320×640 rule (card 16dp above the nav bar, brand centred above it) and the offline row |
| 3 | F1–F8 are full screens with only ✕ (no tab bar, no mint top card, no "Order food and send parcels") | **As drawn; ✕ switches to the customer side (Home).** Reopening the rider side shows the same F page |
| 4 | The handoff toast is a bottom forest bar; the app's toast is a top strip | **The bottom toast replaces the shared toast app-wide** |
| 5 | Permissions move after R3, so "Go online" appears on R3 and P13 | **R3's "Go online" starts the flow (P1…); P13's "Go online" goes online.** A rider who has granted everything goes straight online. The priming after sign-in (before R1) is removed (G1) |
| 6 | The brief asked only for Delete account copy; the handoff redraws it (I) | **Adopt the redesign**, keeping the two-step confirm and D-79's immediate-deletion copy |
| 7 | U4a/U4b soft update banners need a server setting | **Build now:** `recommendedVersion` on `/app/version-gate`, off until set; once per version |
| 8 | Checklist markers 28 vs R1/R2's 22, icons 16/20/24 vs 18/22, titles 28/700 vs C2–C5's 24/700 | **Handoff values on the new screens only**; R1–R3 and C1–C5 stay as their handoff drew them |

Also decided: `#F4D9D5` (the sun on danger heroes) becomes the token `dangerSun` (tokens CSS + every face);
`#FFF6D6` is the existing `highlightChipWash`. The customer notification re-ask cap of 3 is built as drawn
(**owner to confirm**). The licence is dropped from all copy (BRIEF 13).

### 3 · What has landed

_Filled in phase by phase (phases 1–6, `CLAUDE-CODE-PROMPT.md`)._

**Phase 0 (read and plan, 2026-10-06).** The primitives map, every permission request today (file:line), the
KYC status → F mapping and the per-worker file plan for phases 2–6 were reported before any edit. Shared-file
owners: `app/settings/index.tsx` → phases 2+3 (it owns every Settings row, D1 included); the rider board
`app/rider/(tabs)/index.tsx` → phase 6 (the others land region-disjoint mount hunks or export components it
wires); `app/(tabs)/home.tsx` → phases 2+3 (phase 4 adds the one-line U4a mount).

**Phase 1 (shell parts and copy, 2026-10-06).**

- **Copy:** the handoff's `copy.ts` ships **byte-for-byte** as `apps/mobile/src/ui/firstrun/copy.ts` (`PC`, `RP`,
  `UP`, `PD`, `BD`, `KY`, `SP`) — one file, not split, next to the parts that read it (`KycChecklist` reads `KY`).
  A jest test fails if it ever differs from `packages/design/handoff/first-run-v2/copy.ts`. Import it from
  `src/ui/firstrun/copy`; it is deliberately not in the `src/ui` barrel (two-letter names).
- **Parts** (`apps/mobile/src/ui/firstrun/`, exported from `src/ui/index.tsx`; every number is `fr-kit.js`'s):
  `HeroPanel` (`tone` mint|violet|danger|neutral|green, `height?`, `decor?` = the coral dot, `topLeft?` = the ✕
  slot 12 inside the corner), `HeroDisc` (104/84, 40 icon at 1.75, halo 14 out, `spinner` = F8's 48 ring),
  `SplitTitle` (`a`, `b`, `tone`; 28/31.4, 24 at 320), `Body`, `PinnedFooter` (`primary` 52 + `link` 44, or
  `inline` in a sheet), `PrimaryButton` (`icon`, `iconAfter`, `disabled` = U3 line/muted, `done` = D3 inline
  "Saved"), `TextLinkButton`, `ExitButton`, `FrSoftPill` (mint / white / dangerWhite — the barrel's `SoftPill` is
  the empty-state one), `Toggle` (draws the OS state; `onPress` requests or opens settings), `BackHeader` +
  `LargeTitle` (owner #1's Settings look), `ListCard` / `ListRow` / `IconDot` (n|ok|vi|bad, `danger` row),
  `BulletList` (P1), `StepMarker` / `Spinner` / `StepList` / `SystemSettingsSteps` (`shakeKey` for P6) /
  `KycChecklist` (`step2` active|next|done, `label`), `TipChips`, `TriesMeter` (`left`, `total`, `label` = F4's
  box), `InfoBox` (ok|bad|n, `title`), `FrBadge` (mint|gold|checking|surface, `lead` for U1's "New"),
  `SampleNotification` (`behind` = .94), `FrField` / `VerifiedRow`, `FrSheet` (radius 24, grab 4×36, dim .45),
  `FirstRunScreen` (status bar + 12 / 6, scrolling body, pinned footer, keyboard-aware), `FirstRunToast`, and
  `useFirstRunMetrics()` / `firstRunMetrics(width, fontScale)` (≤340 wide → hero 160, disc 84, title 24;
  font scale ≥1.2 → hero 176, disc 84). Icons added to `Icon`: `volume-x`, `sun`, `battery`, `upload` (`trash-2`
  is the existing `trash`). (A dev gallery route was removed again: every route ships in the release bundle.)
- **Token:** `dangerSun #F4D9D5` (see §1).
- **Toast (owner #4):** `ToastProvider` (`src/ui/Toast.tsx`) now draws the bottom toast app-wide — `forest`, radius
  14, padding 14 16, white 600 14, a 20 brand check, 96 above the bottom + the safe-area inset, slides up, gone
  after **2.5s** (`TOAST_DURATION_MS` 4000 → 2500). API unchanged (`useToast().show`, `useActionError`,
  `useActionErrorEffect`, `pushToast`), so no caller moved.

**Phase 6 (ID-check outcomes F, rider entry G, copy pass I — 2026-10-06).**

- **One mapping** (`apps/mobile/src/logic/kyc-outcome.ts`, `kycScreenFor`): the board's existing resolvers
  (`resolveKycGate` → `resolveGate`) → one page. No rider record → **R1** (G1). Fresh `completed` launch (the 30 s
  `KYC_COMPLETED_HINT_MS` hint) → **F8**; automated check with the vendor → **R2** (Calm Mint v2 stays, README G3
  "or R2"); manual review → **F1**; held → **F2**; unfinished (and an API with no pending state, and a cancelled
  launch) → **F3**; declined below the lock → **F4a–d** by `kycDeclineReason` (`declineVariant`: `id_unreadable` → a,
  `face_mismatch`/`liveness_failed` → b, `id_expired`/`doc_tampered` → c, `name_mismatch`/`other`/unknown →
  d; `duplicate` → **F5dup**, see §4); locked → **F5**; expired (the record, or the server's `kyc_expired` refusal) → **F6**; the SDK couldn't open →
  **F7**; the server's plain `kyc` refusal on a cached-verified rider → **F3**. The non-KYC gates (GPS, area, cooldown,
  hold, suspended, banned, top-up) keep their Rider v2 walls. Unit-tested state by state (`kyc-outcome.test.ts`).
- **One shell** (`src/ui/firstrun/IdCheckOutcome.tsx`): `FirstRunScreen` + `HeroPanel` (✕ in `topLeft`) + `HeroDisc`
  + `SplitTitle` + `Body` + `TipChips` / `TriesMeter` / `KycChecklist` + `PinnedFooter`, composed per `fr-states.js`
  (F8 spinner + checklist "…", F1/F2 "In review", F3 "~2 min" + trailing arrow, F4 camera CTA + tries box + WhatsApp
  link, F5 WhatsApp CTA, F6 camera CTA, F7 refresh CTA + WhatsApp link). `KY` verbatim; the checklist's "In review" /
  "~2 min" are Calm Mint v2's `RO.inReview` / `RO.stepIdTime` (the same drawn words).
- **Board** (`app/rider/(tabs)/index.tsx`): an F page replaces the whole tab — no `MintTop`, no tab bar
  (`useHideTabBar`, new in `src/ui/shell/TabShell.tsx`: a tab root holds the floating bar hidden while mounted), no
  "Order food and send parcels" bridge. ✕ = `saveRolePreference("customer")` + `replace("/home")`, the same switch the
  Account toggle makes; reopening the rider side re-resolves the same page from `/auth/me`. "Try again" / "Finish ID
  check" / "Re-verify my ID" run the existing `retryKyc` + SDK lane (force-fresh-session rules unchanged), WhatsApp is
  the existing support link. `KycCheckHost` stays mounted under the F page. The Rider v2 KYC gate branches and their
  strings (`gNotRider*`, `gPending*`, `gUnfinished*`, `gFailed*`, `gFailed2*`, `gExpired*`, `gCantOpen*`, `reverify`,
  `finishId`, `becomeRider`, `RF.gFailedV/gFailedWhyB/gExpiredB/gPendingV`) are deleted.
- **G1:** the board's "Earn with your bike" interstitial is gone: a non-rider reaching `/rider` is `replace`d by R1
  (`/rider/become`) — only once the mount's re-read of `me` has landed, so a cached customer `me` can't bounce a rider
  who just registered. `become.tsx` hands over with `replace("/rider")` after re-reading `me` (no `?from=board` back
  path any more, and no `/permissions` priming before the board — owner #5).
- **R3 → permissions (owner #5):** R3's "Go online" marks R3 seen, then calls `startRiderPermFlow(router)` from
  `src/logic/rider-perm-flow.ts` — the single adapter phase 3 swaps for its own export. Until then it `replace`s to the
  existing `/permissions?next=/rider` (which forwards straight back on a primed phone).
- **G2:** the customer Account's start card is `BecomeRiderCard` (`src/ui/firstrun/BecomeRiderCard.tsx`, `fr-states.js`
  G2: radius 24 `riderWash`, 120 sun, 14 coral, 22/700 "Earn with **your bike**", `KY.becomeBody`, 52 "Start →") → R1.
- **G3:** mid-check the Account's in-progress / review / failed card switches to the rider side the way the toggle does
  (`saveRolePreference("rider")` + `replace("/rider")`, was a `push`) and so lands on the current F page or R2; the F
  page's ✕ comes straight back. Locked keeps its WhatsApp action.
- **I · copy pass:** the Account card bodies now use `KY`'s times and channel — in progress `KY.unfBody` ("About 2
  minutes", was "about 3 minutes"), review `KY.checkBody` for the automated check ("Usually under a minute") or
  `KY.reviewBody` for a person ("Usually a few hours. We'll notify you.", was "We'll SMS you."), locked `KY.lockedBody`.
  The licence is gone from R1 ("Your photo and bike papers can wait.") and R3 ("Add your photo and bike papers later in
  Account") — BRIEF 13, settling D-79 §5's first bullet. `grep -ri licen` over `apps/mobile/{app,src}` now finds only
  code comments.
- **I · Delete account (owner #6):** `app/settings/delete-account.tsx` is frame I — `BackHeader`, danger hero 180 with
  the trash disc, "Delete **your account?**", I's sentence, the live box (`ok` "No delivery running", or `bad` with the
  shipped running-delivery sentence), "Keep my account" (primary, back) over the `dangerInk` link "Delete account"
  (disabled while a delivery runs). The two-step confirm stays: the link opens the final step in the same shell —
  "This is **the final step**", D-79's sentence with "straight away" bold, the acknowledgement tick, "Keep my account"
  over the danger link "Delete my account" armed by the tick. Parity: `LJ.delete_account` / `LJ.delete_final` stay
  wired (fixtures unchanged) and move to `rendered-conformance.pending.json` as SUPERSEDED TARGETs; the guardrail's
  asserted-screens floor drops by exactly those two (5 → 3), as D-66 did. `RJ.kyc_pending`, `kyc_unfinished`,
  `kyc_cant_start`, `kyc_failed`, `kyc_expired` and `gate_kyc_locked` carry SUPERSEDED reasons in `parity-status.mjs`.
- **Mount slot** for the other phases: one marked comment in the board's `AppScreen` (J8 `RiderPermBoardRow` / G8
  `RiderLocEmpty` from phase 3, U4b `SoftUpdateBanner` from phase 4).

**Phases 4 + 5 (app update C, splash H, Personal details D, Bike & documents E — 2026-10-06).**

- **U1–U5** (`app/force-update.tsx`): `FirstRunScreen` + a green 280 `HeroPanel` (no dot: it holds the mark, not a disc)
  with the dove's three facets in white (`lyniago-mark-mono.svg` tinted white) + "Time to **update**" + `UP.body` + the
  server's what's-new line as `FrBadge` "**New** …" + `PinnedFooter` "Update now" / "Help on WhatsApp". U2 (no
  `STORE_URL`): `UP.noLinkBody`, the CTA becomes "Message us on WhatsApp", no pill, no link. U3 (offline, store link
  present): the CTA disabled (`line`/`muted`) over an `n` box "Waiting for a connection"; re-enabled by the app-wide
  reachability store (the screen checks `/health` on mount and on every return to the foreground, so a dead link
  starts the store's probe loop and its first OK re-enables the button). U5 = the same screen on return.
  `app/force-update.view.tsx` is deleted; `LJ.force_update` left `codegen/adopted.mjs`; its target stays wired (the
  fixture now renders U1) with a SUPERSEDED reason in `rendered-conformance.pending.json`; `RJ.force_update` carries a
  SUPERSEDED reason in `parity-status.mjs`.
- **Soft update (owner #7):** `GET /app/version-gate?soft=1` answers `{ minSupportedVersion, recommendedVersion,
  whatsNew }` (`VersionGateSoftResponse`, strict). Opt-in because the plain body is `.strict()` on every installed
  build — adding keys to it would turn their force-update gate off; a request without `soft` still gets exactly
  `{ minSupportedVersion }`. Server env `RECOMMENDED_APP_VERSION` / `RECOMMENDED_APP_VERSION_IOS` (dotted, per platform
  like the minimum) and `APP_WHATS_NEW` (≤80), all off (null) when unset or ""; wired as optional Variables in
  `release-azure.yml`. The client asks with `soft=1`, falls back to the plain body from an older server, and shares the
  one cold-start answer (`useServerVersionGate`). `SoftUpdateBanner` / `useSoftUpdate`
  (`src/ui/firstrun/SoftUpdateBanner.tsx`, `src/logic/soft-update.ts`): U4a `forest` (body `illusMint`, brand-green
  "Update" pill, 44 ✕) is mounted under Home's header (one line in `app/(tabs)/home.tsx`); U4b `violet` is exported for
  the board's marked slot. Once per version: Update or ✕ stores the version (`lynia.softUpdateDismissed.v1`).
- **Splash (owner #2):** splash-v1 unchanged for everyone, plus: a boot into the rider board (`/rider`) shows the two
  rider steps `SP.r1` / `SP.r2`; step 2 is the board's first reads (`["me"]` + `["activeJob"]`) settling in the shared
  query cache (`src/boot/rider-board-ready.ts`, a new `rider` boot signal), then a cut (no exit into Home); a rider
  boot sent elsewhere first (rejected session) hands off at once. On the entry phone (≤340 wide or ≤640 tall) the brand
  — orbit to wordmark — is centred in the space above the card (`splashGeometry({ W, … })`); the card was already 16
  above the nav bar. A rider boot that goes offline swaps the card's rows for the single offline row (`wifi-off` disc,
  "You're offline", "We'll continue when you're back.") — no dark panel, no button; it resumes on reconnect.
  **Merged with splash-v1's `CHANGE-2026-10-06` (owner, 2026-10-06, option 1):** that change removed the steps card
  from the customer's splash while this PR was open. Its note says "Don't change Home or the rider splash" and to keep
  the step labels if the rider splash still uses them. So the customer splash has no card, and only a rider-board
  boot draws this card: H1's white card (radius 20, 48dp rows, splash-v1's step markers), its 400ms per-step minimum
  and the cut after the last tick (`src/boot/splash/timeline.ts` `riderStepTimes`). The 320×640 brand centring
  applies only while that card shows.
- **D2–D7** (`app/settings/personal.tsx`): `BackHeader` + `LargeTitle`, `FrField` First name / Surname (gap 12), the
  phone as `VerifiedRow`, the optional ID (`63-123456A78`, `PD.idWhy`). `src/logic/national-id.ts` normalises (spaces,
  case, the dash) and checks `^\d{2}-\d{6,7}[A-Z]\d{2}$` on blur and on Save (D5); the server still receives its
  canonical undashed form. D3: the button turns mint with a check and "Saved" for 1.5 s and stays on the page. D4: the
  `id_in_use` 409 → the field's red border (`FrField` gained `invalid`: the border without a helper line), the `bad`
  box "**This ID is on another account**" + body, and the CTA "Message us on WhatsApp" until the ID is edited. D6:
  `VerifiedRow` "••-••••••K07" "✓ Verified", helper "From your ID check". D7: `FirstRunScreen`'s pinned footer rides
  the keyboard (Android `adjustResize`).
- **E1–E6** (`app/rider/documents.tsx`): progress bars + "N of 3" (`bikeDocsProgress`), the three rows with the "+
  Add" pill at `tokens.touchTargetMin` (`ADD_PILL_HEIGHT`, see §4), `BD.optional`; the "Re-verify my bike" WhatsApp
  button is gone. E2a `FrSheet` camera / gallery; E2b a full-screen `ink` modal (✕, "Face the **camera**", the 220×290
  dashed oval, three translucent tips, the 76 shutter); E2c the 240 round preview, "Use photo" / "Retake"; E2d the
  row's sub-line becomes the 4dp bar with "Uploading…". E4: `FrSheet` + `FrField` (600, `.06em`), `PLATE_RE`
  `^[A-Z]{3}\s?\d{4}$`, "Plates look like ABC 1234"; Save closes the sheet at once and the row shows the plate, the
  `checking` `FrBadge` "Checking" and `BD.plateReview` before the server answers (a failure restores the row). E5:
  everything on file → no large title, the mint 200 hero riding up under the header with a filled brand disc and white
  check, "You're **all set**", rows with Change / Edit. E6: the danger hero with `upload`, "Upload **didn't finish**",
  "Try again" — the shot is kept as a SecureStore draft from "Use photo" until the attach lands, so Try again re-sends
  it, also after a relaunch. `bikeVerified()` (also Settings' row) reads `plateStatus` once the server sends it.
- **`plate_status` (NEEDS BACKEND → built):** migration `0078_rider_plate_status` (expand-only: `CREATE TYPE
  "PlateStatus"` + `riders.plate_status NOT NULL DEFAULT 'none'`, catalog-only). `PATCH /riders/me` sets `checking` on a
  real plate change and returns `plateStatus`; `/auth/me` rider carries it; `POST /admin/riders/:id/plate-verify
  { plate }` flips `checking` → `verified` with a CAS on the plate ops looked at, audited as the reserved
  `rider.plate_verify`; the admin rider list / detail expose it. `PlateStatus` enum in `@lynia/shared`.
- **Language and Privacy** (owner #1): the round `BackHeader` + `LargeTitle` replace `AppBar`; content unchanged.

**Phases 2 + 3 (customer permissions PC1–PC11, rider permission flow P1–P16, Settings — 2026-10-06).**

- **Permission state** (`apps/mobile/src/permissions/`): `location.ts` / `notifications.ts` read and ask (README §3:
  `canAskAgain`, `android.accuracy === 'coarse'`, `hasServicesEnabledAsync`, `enableNetworkProviderAsync`, the
  `job-alerts` channel via `getNotificationChannelAsync`), pure `classifyLocation` / `classifyNotif` into README §4's
  states; `state.ts` `usePermissions()` re-reads on mount and on every AppState `active`; `store.ts` holds the
  per-install `riderPermFlowDone` and `custNotifAsks` (cap 3, **owner to confirm**). Nothing in the app asks without
  an explainer any more: Home's deliver-to (`useHomeLocation`) and the rider board only READ the permission, so no OS
  dialog opens at mount or over the splash (S-6 is now moot).
- **PC1–PC7** (`src/logic/location-ask.ts` + `src/ui/firstrun/CustomerLocationSheet.tsx`, wired by
  `src/ui/home/LocationAsk.tsx`): one state machine behind H6 "Use my location" and H5 "Use my current location" — PC1
  explainer sheet (mint hero 150) → the Android dialog → precise: the fix fills the header and PC7's bottom toast says
  "Delivering to <resolved address>"; approximate → PC3 (hero 130, re-asks for precise; keeping approximate uses the
  approximate fix); denied once → PC4 (title + the address search); blocked → PC5 (danger title + the three phone
  settings steps, re-read on return); GPS off → PC6 (neutral hero, `enableNetworkProviderAsync`). Also mounted on the
  Restaurants and Shops/Pharmacy lists, which open the same H5 sheet.
- **PC8–PC10** (`app/order-updates.tsx`, `src/push/ask-in-context.ts`): after Send and after Review & place, the order
  route is `routeAfterOrderPlaced()` — PC8 first while notifications are undetermined and PC8 has shown < 3 times on
  this install; "Turn on updates" → POST_NOTIFICATIONS (allowed → push registration kicked, on to the order; declined →
  PC10 "Updates are off" → "Back to my order"); "Not now" → the order.
- **P1–P16** (`app/permissions.tsx` rebuilt, `src/logic/rider-perm-flow.ts`): `?from=flow` walks location (P1 → P3 +
  the P8 toast "Location on", or P4 / P5 / P6 / P7) → notifications (P9 with the drawn offer card and "Play a test
  ping" → P13, or P11 / P12) → P13 "Go online". Every "Not now" moves on; P6/P11/P12 re-read on return from settings
  ("I've turned it on" shakes the steps card while still off). Owner #5: R3's "Go online" calls
  `startRiderPermFlow(router, goOnline)` — straight online when everything is granted (or the flow already ran on this
  phone), else the flow, whose P13 runs `goOnline`. The sign-in priming is gone (`signedInDestination` → `/rider`), and
  a legacy `/permissions?next=/rider` forwards to the board.
- **P14** (rider board): J8 (`RiderNotifOffRow`, the danger box; "Turn on" → P9) replaces the old notif row; G8
  (`RiderLocEmpty`, the Empty States v2 mark; "Turn on" → P1, or P6 when blocked) replaces the G-gps wall when the
  permission is missing (J8 above it when both are). A granted permission with no fix keeps the Rider v2 GPS wall.
- **Settings** (`app/settings/index.tsx`, owner #1): the round `BackHeader` + `LargeTitle`; PC11's danger card while
  order updates are off ("Turn on" opens the Android dialog directly, or the phone-settings steps when blocked —
  owner answer 6 below); YOU (Personal details first with `PD.row/rowSub`, Bike & documents with "N to add" from
  `bikeDocsProgress`, Language, Privacy, Terms, Payment); ALERTS with toggles that mirror the phone (Job alerts,
  Location, Order updates — an off toggle opens P9 / P1 / the dialog, an on toggle opens phone settings), P15's danger Location row ("Off · You can't receive
  jobs", the row reopens P1/P6), Battery saver → P16; Test ping / Test alarm under ALERTS (job-alert channel); RIDER
  (Navigation app, Top-up number); Sign out, Delete account last. Strings the drawing carries but `copy.ts` doesn't are
  `src/ui/settings/copy.ts` (`ST`), verbatim from `fr-states.js`.
- **NEEDS NATIVE:** the foreground-service notification already read `RP.fgsTitle/fgsBody`; it now imports them from the
  copy (a JS string). The location permission rationale in `app.config.ts` is now `RP.manifestRationale` — native, it
  reaches devices only with the next store build.
- **Parity:** `LJ.perm_loc` / `LJ.perm_notif` left `app-targets.mjs` (fixtures `auth_perms_*` and their expected JSON
  deleted) and are PENDING with a SUPERSEDED reason in `parity-status.mjs`, as are `RJ.perm_loc` / `RJ.perm_notif`;
  the codegen views `permissions-location/-notifications.view.tsx` were deleted and both states are SUPERSEDED
  deferrals (baseline 76 → 78); the rendered-conformance floor drops by those two.

### 4 · Still different from the handoff

_Filled in phase by phase._

- **Toast tones (phase 1).** The handoff draws only the success toast (check). An action failure raised through
  `useActionError` (tone `warning`) keeps the same forest bar but shows a `circle-alert` in `highlight` instead of
  the check — a green check on "Couldn't send the offer." would read as success. `info` uses the check.
- **Local toasts (phase 1).** Five screen-local toasts drawn by their own handoffs (`OrderToast`, `BrowseToast`,
  `ReviewToast`, `RToast`, `SendToast` — ink bars, several with an Undo / Try again action) are not the shared
  `ToastProvider` and were left as their handoffs drew them; owner #4 covered the shared top strip. Flagged for the
  owner: unify them on the forest bar or keep them.
- **"+ Add" pill (E1) — UPSTREAM KIT DEFECT, fixed in the kit (owner, 2026-10-06: "Fix the kit to 44dp").** The
  handoff drew it 36 tall (`fr-states.js` `addBtn`, `min-height:36px`), under `--target-min`. Per CLAUDE.md D2 the app
  never resizes a drawn target and a below-floor mock is fixed upstream: `packages/design/handoff/first-run-v2/design/
  fr-states.js` now draws it `min-height:var(--target-min,44px)`, and the app builds it at `tokens.touchTargetMin`
  (`ADD_PILL_HEIGHT` in `app/rider/documents.tsx`). The 1× `screenshots/E1.png` / `E4c.png` / `E2d.png` still show the
  old 36 (they can't be re-rendered here) — **report upstream** so the next export redraws them.

**Phases 4 + 5 (C / H / D / E):**

- **U4b's ✕.** U4a draws a 44 ✕; U4b (the violet board banner) draws none. "Once per version" needs a way to say "not
  now", so both get the ✕ (`UP.softDismiss` as its label). **Owner decision (2026-10-06): keep the ✕ on both.**
- **The soft banner without a store link** is not shown at all (its only action is the store). `#DCD5FF` (U4b's body
  line) is not in the token table; used as drawn, as a named constant in `SoftUpdateBanner.tsx`.
- **U3 detection.** "Offline" is the app's reachability store (real `/health` round trips), not the OS radio state,
  so a captive portal also counts as offline. U3 applies only while a store link exists (U2 has no network action).
- **The rider offline row is rider-only.** H2c draws it on the rider splash; a customer boot keeps splash-v1's dark
  offline panel with "Try again". **Owner decision (2026-10-06): keep the split.**
- **E2b is a guide, not a viewfinder — NEEDS NATIVE.** The app ships no in-app camera (`expo-camera` is a native
  dependency = a new store build); the guide's shutter opens the phone's own front camera, which returns to E2c. The
  oval therefore frames nothing live. **Owner decision (2026-10-06): keep it for now; with the next native build, add
  `expo-camera` and draw the live front camera inside the oval** (the shutter then captures in-app).
- **E2d's bar is staged** (prepared → minted → bytes sent → attached): `fetch` exposes no byte progress.
- **E5's photo row** is drawn with the initials disc and "Verified"; the photo is never checked by anyone (BRIEF: Verified
  "only for what was actually checked"), so its row has no sub-line — just "Change". The app never receives the photo
  itself (`/auth/me` sends `hasPhoto` only), so the disc is the initials, as drawn.
- **Plates on file from before migration 0078 go to ops review (owner decision 2026-10-06).** Migration
  `0079_rider_plate_review_backfill` (data-only, idempotent, the 0064 precedent) sets `checking` on every rider with a
  real plate still at `none`, so they show "Checking" in the app and sit in the admin queue until confirmed. (Before,
  Bike & documents called any verified rider's plate "Verified" — review R-8.)
- **Admin (owner decision 2026-10-06).** The rider profile's Bike reg row carries a `checking` / `verified` pill and,
  while checking, a reason-coded "Confirm plate…" (`REASONS.riderPlateVerify`) → `POST /admin/riders/:id/plate-verify`.
  The Riders page gains an "all riders | plates to check" subnav (the kit's `.subnav`, not drawn on the kit's directory)
  and `/riders?plate=checking` (`GET /admin/riders?plate=checking`) lists the queue with Confirm plate per row. No
  sidebar entry or badge was added (the kit's NAV doesn't draw one).
- **D2's Save** is drawn enabled; it stays enabled (pressing it with nothing changed shows D3's "Saved") except while a
  name is empty, where it is the disabled `line`/`muted` pill (undrawn). Clearing a stored ID still shows the shipped
  "To remove your national ID, contact support." (D-79, undrawn) and a verified rider's 403 shows the server's words.
- **E2c's title** "Looking **good**" is drawn in `fr-states.js` but missing from `copy.ts`; used verbatim from the drawing.

**Phase 6 (F / G / I):**

- **F6's date — BUILT (owner 2026-10-06, answer 4).** `KY.expBody` is drawn "Expired 2 Oct 2026. Re-verify to keep
  riding." Nothing stored the day an ID expired, so migration `0077_rider_kyc_id_expiry` adds `riders.kyc_id_expires_on`
  (DATE, nullable, expand-only). The verified decision webhook stores the document's `expiration_date`
  (`extractDiditDocumentExpiry`, fail-open); an `expired` result — Didit's "Kyc Expired" webhook or the ops expire —
  stamps the lapse day (`kycIdExpiryOnLapse`: the document's own day when it is on or before the event, else the event's
  day). `/auth/me` serves `rider.kycExpiredOn` ("YYYY-MM-DD", only while `expired`; for a rider who lapsed before 0077,
  the day the expiry was applied, `kyc_resolved_at`), and F6 renders `KYF.expBody(date)`. An older server omits the
  field and F6 drops the date.
- **F4's tries meter.** `KY.triesLeft` ("1 try left") is the only drawn label. `kycAttempts` counts declines and the
  lock is 2, so a decline below the lock is always 1 left; the box is drawn only then (an account with 0 recorded
  declines on a `failed` status — legacy data — shows no box rather than an undrawn "2 tries left").
- **F4 for `name_mismatch`; `duplicate` on F5's page (owner 2026-10-06, answer 5).** No variant names them.
  `name_mismatch` gets F4d ("We couldn't verify your ID · Try again, or message us"), not F4c, whose advice ("Use your
  Zimbabwe national ID card…") would be wrong when the document was fine. A `duplicate` decline (below the lock) gets
  **F5dup**: F5's shell — mint hero, `message-circle`, "Let's finish **this together**", one CTA "Message us on WhatsApp",
  no tries meter, no retry — because no retry can fix an ID that is on another account. F5's body ("Both tries are
  used…") would be false there, so its body is PD's one-ID-one-account words drawn for D4: **"This ID is on another
  account. One ID, one account. Message us and we'll sort it."** — undrawn on an F page, **owner-approved 2026-10-06**.
  A duplicate that is also locked (two declines) is plain F5, whose sentence is then true. `liveness_failed` shares F4b's
  face tips with `face_mismatch`.
- **F1 / F2 vs README G3's "or R2 if pending".** Only the automated check in flight is R2; held (F2) and manual review
  (F1) are their own drawn pages, as README F draws them.
- **The F pages' ✕ from the customer Account (G3).** Mid-check the Account still shows the shipped in-progress / review /
  failed / locked card rather than the Customer | Rider toggle README G3 mentions ("switching the Account toggle back to
  Rider") — the toggle only exists for a verified / expired rider. The card now switches sides like the toggle. **Owner
  question, answered 2026-10-06:** keep the status card (as built).
- **F8's drawn "…" and the checklist meta.** The F8 checklist's step-2 meta is the drawn literal "…"; F1/F2's "In review"
  and F3's "~2 min" come from Calm Mint v2's `RO` (identical words), since `KY` has no key for them.
- **Delete account's final step** is undrawn by I: built in I's shell (danger hero, two-tone title "This is **the final
  step**", D-79's sentence, the tick). Its destructive action follows I's grammar — the `dangerInk` text link, armed by
  the tick — instead of the shipped danger-filled button; "Keep my account" is the 52 primary on both steps (**owner,
  2026-10-06: keep the red text link**). A running delivery keeps the shipped sentence in the `bad` box.
- **Free-job pushes `KY.notif1T/B`, `KY.notif0T/B` — not adopted (owner 2026-10-06, answer 2).** D-79 §3 already ships
  the owner's own words for the same two moments ("One commission-free job left" / "Your free jobs are used up", silent
  while commission is 0%). The owner keeps the D-79 wording; the handoff's `I·free` frame and its two `KY` pairs are not
  built, and the server templates are unchanged.
- **Suspended wall: "by SMS" → "in your notifications" (owner 2026-10-06, answer 6).** Rider v2's `gSuspB` said "Our
  team sent the details by SMS." The server sends **no SMS** on a suspension (SMS is used only for sign-in codes): the
  admin suspend (`admin-riders.service.ts`) sends a push, "Account paused — open the app for details.", and the
  Notifications feed (`notifications-feed.service.ts`, `ACCOUNT_FEED_COPY["rider.suspend"]`) pins an "Account paused" row
  carrying the reason while the pause holds. So `RF.gSuspB` now reads "You can't take jobs until {date}. The details are
  in your notifications." (or "You can't take jobs right now. The details are in your notifications."). Undrawn
  sentence, owner-approved 2026-10-06.

**Phases 2 + 3 (PC / P / Settings):**

- **PC4's field** is the shipped address search (`AddressSearch`, its H5 `sheet` variant: borderless surface fill,
  the shipped suggestions) rather than the drawn bordered/focused field with two pin rows; it is focused on open.
  PC3's "keeping the approximate centre for search bias" is not built (the search takes no bias point).
- **PC7's toast** is `PC.grantedToast` with its sample address ("12 Samora Machel Ave", data, not copy) swapped for the
  resolved one. When a grant gets no fix (indoors, a cold GPS), the H5 search opens instead of a toast (undrawn).
- **PC11 "Turn on" — owner decision 2026-10-06 (answer 6).** Not PC8 again (README): while the OS can still ask,
  Settings' "Turn on" (and the off Order updates toggle) opens the Android notification dialog directly; a decline
  leaves the rider/customer on Settings with the card up. When the OS won't ask again, a sheet shows the PC5-shaped
  phone-settings steps in notification words — `RP.blockedA/B`, then `PC.setOffBody` (customer) or `RP.blockedBody`
  (rider), then `RP.step1`, `RP.nStep2` and `RP.nStep3` (for a customer only its first half, "Allow notifications",
  since "Job alerts on" is a rider channel — derived copy) — with "Open phone settings". PC8 now only follows an order.
- **PC8's sample code — owner-approved copy exception 2026-10-06 (answer 4).** The handoff draws "Your delivery code is
  4821"; every real code is 6 digits shown 3+3 (D-59), so PC8 shows **"Your delivery code is 482 193"**. `copy.ts`
  stays byte-for-byte; the swap is in `app/order-updates.tsx`. **Note for the designer:** redraw PC8's second card with
  a 6-digit code.
- **P9's offer card** is an illustration: its "0:58" is a static literal, and "Play a test ping" (like Settings' test
  buttons) posts a local notification on the `job-alerts` channel — silent until notifications are allowed.
- **`job-alerts` channel — BUILT (owner 2026-10-06, answer 3).** The API sends rider job pings (`kind: broadcast`) and
  food-offer alarms (`kind: food_offer`) with `android.notification.channelId = "job-alerts"`
  (`androidChannelFor` in `apps/api/src/adapters/push/push.interface.ts`, mapped by `buildFcmMessage`; spec
  `notifications/job-alerts-channel.spec.ts`); every other push stays on the default channel. The app creates
  `job-alerts` (HIGH importance, sound) when the rider tab shell mounts, in the rider flow and in Settings. A build
  without the channel gets FCM's fallback to the default channel, so P12 still treats a rider as muted when EITHER
  channel is below HIGH and opens that channel's page.
- **P16 — the battery list, owner decision 2026-10-06 (answer 5).** `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` needs the
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` manifest permission, which Play restricts; P16's CTA opens the phone's battery
  optimisation list (`IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, no permission) and returns to Settings when the rider comes
  back. Whether the app is exempt can't be read from JS, so the Settings row stays a plain chevron row.
- **P15's "Tap Location to reopen P1."** is a design annotation, not rendered.
- **Settings' kept rows (owner #1)** sit where they did: Privacy, Terms and Payment in YOU after Language; Test ping /
  Test alarm as white soft pills under ALERTS (while job alerts are on); Navigation app and Top-up number in a RIDER
  card; Delete account last, its title in danger ink. The shipped name / phone row is **removed** (owner 2026-10-06,
  answer 1): Personal details is the first YOU row, as drawn. The 44×26 toggle keeps its drawn size; its hit area
  reaches 44 by slop.
- **Bare asks still outside an explainer** (BRIEF 1, not drawn by the handoff): the Send pickup auto-locate
  (`use-pickup-autolocate.ts`), the map picker's locate button (`MapPicker.tsx`), the keyless geocoder
  (`geocode.ts`), "Notify me" for a Soon service (`service-interest.ts`) and the rider's job-start stream
  (`use-rider-location.ts`, normally granted by P1 by then). **Left as they are — owner decision 2026-10-06
  (answer 2).**

**Screen-local toasts (owner, 2026-10-06: "move all five to the new bar").** `OrderToast`, `BrowseToast`,
`ReviewToast`, the rider board's `RToast` and `SendToast` now draw the shared First Run v2 bar
(`FirstRunToast`: forest, radius 14, white 600 14, a 20 glyph). Each keeps its own position above its screen's
CTA and its action ("Try again", "Undo") as a 44 mint pill on the right, which the handoff's toast does not draw.
Failure toasts show the `circle-alert` in highlight (the owner-approved error toast); the others keep their glyph
(bell, check, undo) in brand green.

