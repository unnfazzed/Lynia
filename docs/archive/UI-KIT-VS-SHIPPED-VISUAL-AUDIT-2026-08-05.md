# UI kit vs shipped — visual fidelity audit (2026-08-05)

**Trigger.** A side-by-side of gallery screen **C3·6** (`LJ home_empty`) against the installed Android
build: the kit's primary CTA reads **"Broadcast request"**, the app reads **"Send to riders"**, and the
surrounding UI differs in layout, fill, icon and type. Two prior audits had reported this area as
matching.

**Scope.** Every screen in `explorations/journey/All Screens Gallery.html` — the `LJ`, `RC`, `RJ`, `RJM`,
`RR` and `RM` registries plus the admin set — compared element by element against `apps/mobile/app`,
`apps/mobile/src/ui`, `apps/admin/app` and `apps/merchant/app`, and the shared token/primitive layer
underneath them.

---

## 1. Verdict

**1 of 244 screens matches its design.** That screen is the offline banner.

| Surface | States | ✅ matches | ⚠ diverges | ❌ not shipped |
|---|---:|---:|---:|---:|
| Customer · parcel (`LJ`) | 54 | **1** | 51 | 2 |
| Customer · food (`RC`) | 48 | 0 | 41 | 7 |
| Rider (`RJ`+`RJM`+`RR`) | 91 | 0 | 78 | 13 |
| Merchant (`RM`) | 44 | 0 | 36 | 8 |
| Admin | 7 pages | 0 | 7 | 8 sub-features |
| **Total** | **244** | **1** | **213** | **30** |

Shared foundations, audited separately because every screen inherits them:

| Layer | Items | ✅ | ⚠ | ❌ |
|---|---:|---:|---:|---:|
| Design tokens | 78 | 70 | 3 | 5 |
| Shared primitives | 26 | 4 | 17 | 5 |

The tokens are in good shape — 70 of 78 values match exactly, including all 20 raw colours and all 15
semantic aliases. **The components built from them are not.** That gap is the finding: the palette was
ported faithfully and then applied through primitives that diverge, so the app reads as the right brand
in the wrong shapes.

This is not screen-by-screen sloppiness. It is a **systematic re-interpretation**: individually each
delta is defensible, and many are documented in code comments as deliberate improvements. Collectively
they mean essentially no screen matches its design.

---

## 2. What this supersedes, and why the earlier audits were wrong

This document supersedes the verdicts in `UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` and retracts
`UI-KIT-VS-SHIPPED-AUDIT-2026-08-05-DESIGNSYNC-RECHECK.md` entirely.

**Two method failures compounded.**

1. **The earlier audit matched copy strings and route existence, not pixels.** It says so about itself:
   *"the app-wide sweep matched the kit's copy strings against the shipped source, so a feature that
   ships under different wording reads as missing."* That method can answer "does a screen exist that
   does this job?" — it cannot see layout, fill, spacing, icon or type. Every ✅ it recorded meant the
   former and was read as the latter.
2. **The recheck compared the design against itself.** It diffed a hosted-project export against
   `packages/design/` and found them byte-identical — a true result answering "has the design changed?",
   reported as though it answered "does the app match the design?" It then inherited the earlier ✅ marks
   without re-deriving them.

**Concrete contradictions found by re-deriving from source:**

| Earlier claim | Actual |
|---|---|
| "Foundations — ✅ full parity, token-for-token, no drift found" | 4 of 26 primitives match; the whole of `tokens/icons.css` has no shipped counterpart |
| Food is "the strongest-adopted area… the money handshake shipped **verbatim**", listing `pay_wait` and `pay_failed` as shipped | Neither screen exists. There is no payment-prompt path and no decline path anywhere in the food journey |
| "Admin — ✅ complete and ahead of the kit" | 0 of 7 pages match; 2 complete ops tools designed and never built |
| "Merchant — ✅ queue, menu, hours, shop, statement, login" | 0 of 44 tiles match; 8 screens absent; every button is the wrong shape |

---

## 3. Method

- Each registry was audited independently against source on both sides, with `file:line` required for
  every claim. Verdicts were re-derived from scratch; the prior audit's conclusions were explicitly not
  used as input.
- Comparison covered structure/layout, every visible copy string, colour tokens, spacing and size,
  icons, and states present or absent.
- A screen counts ✅ only if copy, structure **and** styling match. A differing CTA label makes it ⚠.
- **The findings below marked ✓verified were re-checked by hand** against the files after the audits
  reported them. Two agent claims were found overstated and are corrected in §7.

**Kit currency.** The hosted Design project was exported by hand and compared against `packages/design/`:
all four screen files are byte-identical (`All Screens Gallery.html` md5 `8e9c6238…`). `DesignSync`
cannot authenticate non-interactively, but the kit side of this comparison is confirmed current, so
every delta below is a real shipped-vs-designed gap, not a sync artefact.

---

## 4. Root cause: the foundations

Five findings explain a large share of the 213 ⚠ screens.

### 4.1 Every screen sits on the wrong background — ✓verified

`Screen` (`src/ui/index.tsx:86`) fills `tokens.color.surface` = **`#F6F7F8`**. The kit's semantic layer
says `--surface-page: var(--bg)` = **`#FFFFFF`** (`tokens/colors.css:46`), and the kit's own `AppScreen`
defaults to `bg = "var(--bg)"` (`AppScreen.jsx:10`). `Screen` is the app's dominant page scaffold.

The single largest visual delta in the product, and invisible to any per-screen diff because it *is* the
page.

### 4.2 `--shadow-card` was re-authored, not ported — ✓verified

| | Kit | Shipped |
|---|---|---|
| `card` | `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)` — **two layers** (`spacing.css:30`) | offset `(0,2)`, radius `8`, opacity `.08` — **one** (`design-tokens.ts:152-159`) |
| `sheet` | `0 -2px 16px rgba(20,24,27,.08)` | offset `(0,-2)`, radius 16, opacity .08 — **exact** |
| `menu` | `0 4px 16px rgba(20,24,27,.1)` | offset `(0,4)`, radius 16, opacity .1 — **exact** |

`sheet` and `menu` map 1:1, which establishes the porting convention — `card` alone breaks it. Every
elevated surface in the product reads flatter and heavier than designed.

### 4.3 The icon-size token file has no shipped counterpart — ✓verified

`tokens/icons.css` defines `--icon-size: 20px`, `--icon-size-lg: 24px`, `--icon-size-tile: 28px`,
`--icon-stroke: 2px`. None exist in `packages/shared/src/design-tokens.ts`. The only trace is a
**comment** at `Icon.tsx:107`. With nothing enforcing the scale, shipped icon sizes have spread to
20 / 21 / 22 / 27 / 34.

### 4.4 Only 4 of 26 shared primitives match

✅ `OfflineBanner` · `Skeleton` · `Label` · `LiveOrderCard`

❌ absent entirely: `Money` · `SystemState` · `AppBar` · `AppHome` (`StatusBar` is mock chrome; its
absence is correct).

⚠ diverging, with the widest blast radius first:

| Primitive | Delta | Reach |
|---|---|---|
| `Icon` | default colour `ink`, not `currentColor`; no `style` prop; 6 kit glyphs unrenderable (`ban`, `minus`, `pencil`, `power`, `timer`, `volume-2`) | 64 files |
| `Button` | no horizontal padding; ghost-pressed mint where the kit greys; `ActivityIndicator` not the kit's ring; no `block` prop, no icon slot | 60 files |
| `Card` | **no `accent` prop** — 9 emphasis sites draw a 1px border where the kit specifies 1.5px | 48 files |
| `EmptyState` | message 14/lh20 vs kit 12/lh1.45; icon 34@1.75 vs 36@2 | 19 files |
| `Field` | **no focus state** at all (kit: `--accent-700` border on focus); no multiline, no char counter, no `fromMap`, no `disabled` | 18 files |
| `Stepper` | done node is `accentWash` fill + green glyph vs kit `accent` fill + white glyph; no `failAt` failure state | all trackers |
| `Heading` | letterSpacing `-0.4` vs `-0.48`; no `lineHeight` | 22 files |

`AppBar` being absent is structural: there is no shared header, so screens improvise. Two competing back
affordances coexist — a bottom ghost "Back" button on most screens, a top-left inline `Pressable` on the
food screens — and neither matches the kit.

### 4.5 The handoff token file is stale and says it isn't

`packages/design/handoff/design-tokens.ts` — the artefact an external implementer would be handed —
asserts at `:6-7` that it is *"VERIFIED IN SYNC… the exact contents of `packages/shared/src/design-tokens.ts`"*.
It is missing `color.dangerWash`, `color.dangerInk`, and the entire 15-role `semantic` export.

---

## 5. C3·6 — the reported screen, element by element

Kit `screens.jsx` `Home`/`AddressFields` vs shipped `app/send.tsx` + `src/ui/MapHome.tsx`. ✓verified.

| Element | Kit | Shipped | |
|---|---|---|---|
| Primary CTA | `"Broadcast request"` `:173` | `"Send to riders"` `send.tsx:794` | ⚠ |
| Sheet model | overlaid on a full-bleed map, snap 58%/88%, drag handle `kit-parts.js:131` | flex sibling below the map, fixed `maxHeight:340`, no snap | ⚠ |
| Address rows | inside the sheet, above "What are you sending?" `:174` | float over the map, above the sheet `send.tsx:671` | ⚠ |
| Active row | no active state — plain `var(--bg)` `:69` | `backgroundColor: accentWash` `MapHome.tsx:125` | 🆕 |
| Filled-row icon | `pencil` `:77` | `map-pin` `MapHome.tsx:144` | ⚠ |
| Row height | `minHeight: 48` `:69` | `minHeight: 52` `MapHome.tsx:123` | ⚠ |
| Divider inset | `marginLeft: 35` `:83` | `marginLeft: 40` `MapHome.tsx:83` | ⚠ |
| "Use my location" | top-right `:166` | bottom-right `ComposeMap.tsx:204` | ⚠ |
| Top bar | brand pill + **one** round action `:154` | brand pill + **two** (notifications, account) `MapHome.tsx:33` | 🆕 |
| Item box | description + qty in a bordered box `:177` | no box `SendItemsList.tsx:31` | ⚠ |
| Qty label | `"Qty"` `:180` | `"Quantity"` `SendItemsList.tsx:40` | ⚠ |
| Sender phone | `"Your phone (sender)"` + privacy hint `:190` | `"Pickup contact phone"`, no hint `SendPhoneFields.tsx:32` | ⚠ |
| Recipient hint | "So the rider can reach them at drop-off." `:191` | absent | ❌ |
| Price hint | "We'll suggest a fair price once your pins are set." `:189` | absent | ❌ |
| Note placeholder | "…at **the pharmacy counter**; keep it upright." `:188` | "…at **reception**; keep it upright." `send.tsx:818` | ⚠ |
| Footer hint | "…and both phones **to broadcast**." `:171` | "…a price **to send**." `send.tsx:766` | ⚠ |
| Sheet heading | *(none)* | `"Delivery details"` `send.tsx:808` | 🆕 |
| Draft chip | *(not in kit)* | `"Draft restored"` / `"Clear"` `send.tsx:694` | 🆕 |

Nineteen deltas on the screen the previous audit reported as clean.

---

## 6. Cross-cutting patterns

The same seven substitutions recur across all four journeys. Fixing them centrally closes far more
ground than fixing screens one at a time.

1. **Bottom sheets became inline cards.** The kit designs modal sheets with a dimmed backdrop and a
   36×4 grab handle; shipped renders `Card`s in a scroll — `BailSheet`, `UndeliveredSheet`,
   `RiderCashHandshakeCard`, `UnreachableCustomerCard`, the food cancel sheet, `cart_note`.
2. **Sticky footers became inline buttons.** Every kit CTA sits in a fixed footer; every shipped CTA is
   the last child of a `ScrollView`.
3. **Digit-box code grids became single fields.** The kit specifies 6-box grids with per-state borders
   (`handoff`, `job_handoff`, `doorstep` step 3, `code_wrong`); every shipped code entry is one `Field`.
4. **The `CallRow` treatment is unused.** The kit's contact row — surface tile, 11/600 label, 14/600
   name, tabular number, 44px accent circle with a white phone glyph — ships as `SupportCallRow` and is
   wired **only** to gate states. Every in-job contact is a bare green text row.
5. **Hero money figures are uniformly shrunk or dropped.** Kit amounts at 82/44/42/38/34px render at 30
   or less, or vanish — across `pay_now`, `handoff`, `pickup_cash`, `cash_return`, `pay_merchant`,
   `doorstep`, `handback`.
6. **Money washes are inverted.** Four rider/food surfaces flip the kit's `highlightWash`/`highlightInk`
   (caution) to `dangerWash`/`dangerInk` (alarm); one drops a highlight wash to a plain card.
7. **Evidence logs and money consequences are dropped.** Every timestamped log the kit specifies is
   absent (`WHAT'S LOGGED`, `WHAT HAPPENED`, the cash-handshake ledgers, `Sent at`, refund times), and so
   are the stated money consequences — the $15.50 cancellation cost, the $2.50 no-show fee, the goods +
   delivery split, the per-km fee explanation.

---

## 7. Corrections to the audit findings themselves

Two claims from the sub-audits were checked by hand and found overstated. Recorded so this document
isn't trusted the way the last one was:

- **Rider parcel stepper labels.** Reported as "6 of 7 differ". Actually **5 of 7** — `"Parcel collected"`
  and `"Delivered"` do match (`rider-one-app.jsx:181` vs `src/ui/index.tsx:395-403`). The wider point
  stands: the rider *food* steps match all seven verbatim, so parcel is the outlier.
- **`rider/documents.tsx` "has no entry point".** It is linked from `profile/index.tsx:78`,
  `settings/index.tsx:115` and `(tabs)/account.tsx:83`. Only the rider tab's own account screen skips it,
  routing to `/rider/become`. A navigation inconsistency, not a dead screen.

---

## 8. Prioritized fix list

Ordered by blast radius, not by screen.

### P0 — one-line changes that move hundreds of screens

| # | Fix | Reach |
|---|---|---|
| 1 | Point `Screen`'s background at `bg` (`#FFFFFF`), not `surface` (§4.1) | every screen |
| 2 | Restore `shadow.card` to the kit's two-layer definition (§4.2) | every elevated surface |
| 3 | Set merchant `primaryButtonStyle`/`ghostButtonStyle` `borderRadius` to `999` per `--radius-button`; ghost label to `--accent-text` — ✓verified `queue/styles.ts:9,19` | every merchant button |
| 4 | Add `iconSize`/`iconStroke` to the token module and adopt the 20/24/28 scale (§4.3) | every icon |

### P1 — primitive repairs

| # | Fix | Reach |
|---|---|---|
| 5 | `Icon`: default to `currentColor`, add a `style` prop, add the 6 missing glyphs | 64 files |
| 6 | `Card`: add the `accent` prop at 1.5px; adopt at the 9 emphasis sites | 48 files |
| 7 | `Button`: add horizontal padding, grey ghost-pressed, `block` prop, icon slot | 60 files |
| 8 | `Field`: add the focus state — the app has no keyboard-focus affordance anywhere | 18 files |
| 9 | `EmptyState`: message to 12/lh1.45, icon to 36@2 | 19 files |
| 10 | Build `AppBar` and adopt it, retiring the two competing back affordances | every pushed screen |
| 11 | Build `Money`, or apply `tabular` at all 116 `formatMoney` sites (only 62 have it today) | all prices |
| 12 | `Stepper`: kit's done-node treatment + a `failAt` state (needed by `no_rider`) | all trackers |

### P2 — safety and correctness, not cosmetics

| # | Fix | Why |
|---|---|---|
| 13 | **Add the `sos_confirm` gate** — ✓verified the sheet opening *is* the alert (`safety.tsx:423-442` fires `raiseSos` in a `useEffect` on `open`; zero hits for the kit's confirm strings). Any accidental tap pages ops | safety-critical |
| 14 | **Restore the merchant cash-confirmation grammar** — the 82px amount, the "I counted $X in my hand" checkbox and the "don't release the food" escape. Two of four screens render it as a single 12px caption (`OrderCard.tsx:213-214`) | fraud control |
| 15 | **Fix rider first-run copy** — ✓verified riders see `"Update to keep sending."` (`force-update.tsx:28`) where the kit says `"…keep riding."`. Same missing role branch in `onboarding.tsx`, `permissions.tsx`, `phone.tsx`, `verify.tsx` | live copy bug |
| 16 | **Ship the customer cancel-reason field** — ✓verified `cancelOrder(orderId)` sends no reason (`order/[id].tsx:508,660`) while `:1025` renders `cancelReason`. The customer can never set what the UI displays | orphaned input |
| 17 | Restore the customer food tracker's first two steps — ✓verified `STEP_LABELS.customer.food` starts at `"Rider secured"`, the kit's *third* step, so the whole kitchen-confirm and payment phase is invisible | tracker |

### P3 — unbuilt screens, by surface

- **Admin (2 complete tools, ✓verified 0 grep hits each):** bulk seed-credit (`cash.html`, 20 refs);
  `commission_freeze` wallet hold (`riders.html`, 14 refs).
- **Merchant (8):** setup/onboarding · the "Don't start cooking yet" rider-secured gate ·
  rider-cancelled-after-securing · hand-over confirmation · rider no-show · category management
  (**including all reordering**) · dish photo crop · banner crop.
- **Rider (13):** in-app ID capture + preview · the two map-first navigation screens · pay-the-merchant ·
  the four top-up screens · cancel-blocked · return-to-restaurant · offline resume · generic error.
- **Food (7):** `cart_note` · `pay_wait` · `pay_failed` · `rejected` · `rider_cancelled` · `resume`.
- **Parcel (2):** `sos_confirm` · customer `no_gps`.

### P4 — copy alignment

CTA drift is systemic, not one label: `Broadcast request`→`Send to riders`, `Agree & broadcast`→`Agree &
send`, `Go to checkout`→`Continue`, `Place order · pay $X cash`→`Place order · $X`, `Send to Lynia`→`Send
to our team`, `Confirm cancellation`→`Yes, cancel this order`, `Close`→`I'm safe now`,
`Enter address manually`→`Not now`. Per §9 the kit's string wins in every case; restore them.

---

## 9. Direction — the kit is the source of truth

**Decision (2026-08-05, product):** the Claude Design screens are authoritative. Where the app diverges,
**the app changes.** §8 is a work list, not a menu, and §5's table is a defect list.

That resolves every ⚠ in this document by default. It does **not** resolve the 🆕 column, which splits in
two:

**(a) Additions with no design consequence — remove or leave, cheap either way.** Confetti on terminals,
the "Delivery details" heading, the second top-bar action, "Open now" on restaurant cards, "Load older"
pagination, section labels the kit doesn't have.

**(b) States the kit never modelled — these are the "issues" to start on, because kit-as-truth cannot be
applied literally without regressing real fixes.** Each one exists because shipping taught us something
the design didn't anticipate. The kit needs to absorb them; deleting them to match the kit would be a
regression:

| Shipped state | Why the kit can't just win |
|---|---|
| Keyless address-search fallback — *"Address search is unavailable — tap the map to set this pin."* | The kit assumes Places is always keyed. Removing this restores the silent-`null` P0 the previous audit was written to fix |
| Rider board copy branched on `merchantDispatchAutoEnabled` | The kit shows "parcels and food, one queue" unconditionally. Removing the branch promises riders food jobs a dormant flag won't deliver |
| Degraded/offline variants throughout — reconnect banners, draft restore, stale-cache headers, "Map didn't load", SOS pending/offline states | The kit models the happy path only. These are the states a real network produced |
| Feature-flag degradations — `getServiceTiles(flag)`, flag-off onboarding and role sets | The kit has no concept of a flag-off build |
| Privacy notice, two-step delete-account, phone-masking lines | Compliance surface the kit predates |
| Real OS-permission notification row | The kit hardcodes "On" |
| Rating undo window, rider strike counter, proof-of-pickup photos, merchant per-item "don't have it", pickup-code reveal | Capability the kit never specified, already load-bearing in production |

**Recommended order:**

1. **Foundations first** (§8 P0–P1) — four one-line token/primitive fixes move hundreds of screens with no
   per-screen work. Do this before touching individual screens, or the screen work gets redone.
2. **Correctness gaps** (§8 P2) — SOS confirm, rider first-run copy, the orphaned cancel-reason field, the
   truncated food tracker. These are defects regardless of which artefact is authoritative.
3. **Update the kit** to model category (b) above, so kit-as-truth is safe to apply literally.
4. **Then the per-screen ⚠ work** (§5 and the per-surface tables), and the unbuilt screens (§8 P3).

Step 3 matters: until the kit models degraded, keyless, flagged and offline states, "match the kit" and
"don't ship a lie" point in opposite directions on exactly the screens where that lie is most expensive.
