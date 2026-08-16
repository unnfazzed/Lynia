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

**Currently live deviations: D-03, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15.** D-01 and D-02 were
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
