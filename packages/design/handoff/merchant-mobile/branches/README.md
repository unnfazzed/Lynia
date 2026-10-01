# Handoff: Merchant branches — branch switcher (C6) and Add branch (C7)

2026-10-01 · delta on the D-48 merchant mobile handoff · answers the brief in `reference/BRIEF.md`

## Overview
Owners with shops in several places run all of them from one login. **Each branch is its own business** (location, hours, menu, team, orders, cash); customers see each as a separate restaurant or shop. The owner works in **one branch at a time**; switching moves the whole app (header, stats, orders, menu/items, Money, Team) to that branch.

Server side is live (PR #999, `docs/plans/2026-09-30-multi-branch-owners.md`). This package adds the screens the app needs to call it:

| Id | Screen | Kind | Opened from | Fixed parent |
|---|---|---|---|---|
| — | B1 / D1 header, 2+ branches | change | — | — |
| **C6** | Branches (switcher) | bottom sheet | tap business name in B1 / D1 (and B5) header | closes to B1 / D1 |
| **C7** | Add a branch | pushed screen + AppBar | C4 → Branches row; C6 → "Add a branch" | **C4**, however it was opened |
| — | C4 Branches row | change | — | — |
| — | B1 / D1 not live yet | state | after "Create branch", or switching to a not-live branch | — |

No new tab; the 4-tab bar is unchanged.

## About the design files
The HTML files here are **design references** — prototypes showing intended look and behaviour, **not production code**. Recreate them in the merchant app (Expo / React Native, same stack as the customer and rider apps) using its existing patterns and the Lynia design-system components (`Button`, `Card`, `Field`, `StatusPill`, `AppBar`, `TabBar`, `Icon`, `EmptyState`, `OfflineBanner`, and the D-48 additions `Switch`, `StatTile`, `ConfirmSheet`).

## Fidelity
**High fidelity.** Final colours, type, spacing, radii and copy. Copy is final: use it verbatim. Pixel-parity rule applies: the app may only render what the mocks draw, and never enlarges a drawn target.

---

## Screens

Common frame: 360 × 720, must also work at 320 × 640. 16px screen edge. 30px status bar. Inter 400/600/700, tabular numerals for counts.

### 1. B1 / D1 header — 2+ branches
- **One branch:** header exactly as today (D-48 B1/D1). **No chevron.** Don't change anything.
- **2+ branches:** a `chevron-down` icon, **20 × 20, `--ink`**, sits 4px after the business name (22/700, letter-spacing −0.01em, one line, ellipsis). Name + chevron are **one tap target, min height 44px** (`--target-min`). To keep the header the same height, the target box has margin −8px top / −6px bottom. The status line ("● Open until 22:00", 12.5/600 `--accent-text`) and the open switch are unchanged.
- Tap → opens C6.
- Same treatment on B5 (closed header) and D1.
- Staff never have 2+ branches, so they never see the chevron.

### 2. C6 Branches (switcher sheet)
Bottom sheet over a scrim (`rgba(20,24,27,.45)`), same shell as `ConfirmSheet`:
- Sheet: `--bg`, radius **20 20 0 0**, `--shadow-sheet` (`0 -2px 16px rgba(20,24,27,.08)`), padding **10 16 20**, vertical gap 8.
- Grab handle 36 × 4, radius 2, `--line`, centred, 4px below.
- Title **"Your branches"** — 18/700, padding 2 0 4.
- **Branch rows** (list, top to bottom: current branch first, then others in creation order):
  - min-height **64px**, gap 12, 1px `--line` bottom border (none on the last row). Whole row is the tap target.
  - Left column (flex 1, min-width 0): name **14.5/600 `--ink`**, then 2px, location **13/400 `--muted`**. **Both one line with ellipsis.**
  - Location text = the branch's street/area line (same text A4's location card shows), e.g. "5th Street, Mbare".
  - Right, current branch: `check` icon 20 × 20, `--accent-text`.
  - Right, not-live branch: pill **"Not live yet"** — height 22, padding 0 8, radius 999, 11.5/700, bg `--surface`, text `--muted`. Pill and check never shrink.
- **"+ Add a branch"** — ghost button, full width, min-height 44, radius 999, 1px `--line` border, bg `--bg`, 14.5/600 `--accent-text`, `plus` icon 16px, gap 6. **Owner only.**

States:
| State | Drawing |
|---|---|
| 2 branches, one not live | Frame `c6-two` |
| Many (up to 20) | Sheet `top: 38px` (8px below the status bar); title and Add button fixed; **list scrolls inside** (`c6-many`) |
| Long name | Name and location each truncate, one line (`c6-long`) |
| Offline | Red offline bar (bg `--danger`, white 13/600, `wifi-off` 16px, "No connection, retrying…", padding 10 16) full-bleed under the title; rows and Add button **disabled** at 45% opacity (`c6-offline`) |

Behaviour:
- Tap another branch → sheet closes, the app switches to that branch and shows its Orders home (B1 restaurant / D1 shop, or the not-live state). Toast: **"Now at {branch name}"**.
- Tap the current branch → just close.
- Tap the scrim, or hardware back → close.
- "+ Add a branch" → push C7 (back from C7 goes to **C4**, not the sheet).

### 3. C4 Account — Branches row
New row between **Opening hours** and **Preferred riders**, same row pattern as the others (min-height 56, 1px `--line` bottom border):
- `map-pin` icon 18px `--accent-text` · "Branches" 14.5/600 · **count** (12px `--muted`, tabular; only when 2+) · `chevron-right` `--muted`.
- Tap → push C7.
- **Owner only**; hidden for staff.
- C4's header name shows the **current branch's** name.

### 4. C7 Add a branch
Pushed screen. AppBar: back chevron (36px target) + **"Add a branch"** 16/700. Body padding **4 16 16**, gap 14, column:

1. **Branch name** — label 12.5/600; input min-height 48, radius 12, 1px `--line`, padding 0 14, 15px text; focus = `--accent` border + 3px `--accent-wash` ring. **Starts empty** (not prefilled). Hint under it (12px `--muted`): **"How customers will see it, like Mama’s Kitchen · Avondale"**.
2. **Location** — A4's block, unchanged. Label "Location", then:
   - Result card (only once a location is set): 2px `--accent` border, `--accent-wash` bg, radius 12, padding 10 14, `map-pin` `--accent-text`, street **14.5/700** ("Fife Ave, Avondale"), meta 12px `--muted`: **"From your phone’s location"** (GPS) or **"From search"** (search), link **"Change"** 13/600 `--accent-text` (36px).
   - Ghost button **"Use my current location"** (`navigation` 16px), full width, 44px.
   - Search field **"Or search street or area"** (`search` 16px, placeholder `--muted`), 48px.
   - No map pin, no landmark field.
3. **Copy row** — bordered row (1px `--line`, radius 14, padding 0 14, min-height 64): title 14.5/600 + meta 13 `--muted`, `Switch` 44 × 26 on the right, **on by default**.
   - Restaurant: **"Copy my menu"** · "{n} dishes in {m} categories" (mock: 12 / 3).
   - Shop: **"Copy my items"** · "{n} items in {m} categories" (mock: 40 / 5).
4. Muted line, 13/1.45 `--muted`: **"Your logo, photos, opening hours and cash rule come too. You can change them in the new branch."**
5. Spacer, then primary **"Create branch"** — 52px, radius 999, `--cta-fill`, white 16/600, pinned at the bottom.

No phone field: the branch's contact number is the owner's sign-in number (same rule as A4).

States:
| State | Drawing |
|---|---|
| Empty | No result card. Primary **disabled**: bg `--line`, text `--muted` (`c7-empty`) |
| From GPS | Result card meta "From your phone’s location" (`c7-gps`) |
| From search | Result card meta "From search"; shop copy row (`c7-search`) |
| Saving | Primary shows an 18px spinner (2.5px ring, white 35% + white top) + **"Creating branch…"**; form at 50% opacity, not interactive; back disabled (40% opacity) (`c7-saving`) |
| Name taken | Input border `--danger`; the hint is replaced by an error line (12.5/1.4 `--danger-ink`, `circle-alert` 15px, gap 6) (`c7-err-name`) |
| Outside area | Result card border `--danger`, bg `--danger-wash`, pin `--danger-ink`; error line under the card (`c7-err-loc`) |
| 20 branches | Banner at the top of the form: bg `--danger-wash`, `--danger-ink` 13/1.45, radius 14, padding 12 14, `circle-alert`, text + underlined link **"Open WhatsApp"** (36px). Primary disabled (`c7-err-limit`) |
| On hold | Same banner, on-hold copy. Primary disabled (`c7-err-hold`) |
| Offline | Red offline bar under the AppBar; fields editable; primary disabled (`c7-offline`) |

**Enable rule:** primary is enabled when `name.trim() !== ''` **and** a location is set, and the device is online, and no banner error is showing.
**Clearing errors:** the name error clears as soon as the name changes; the location error clears on "Change" / a new location.

**Error copy (final; the API copy changes to match):**
| API case | Where | Copy |
|---|---|---|
| Name used by another of their branches | inline, name | You already have a branch with that name. Add the area, like “Mama’s Kitchen · Avondale”. |
| Location outside coverage | inline, location | That address is outside the area LyniaGo covers for now. *(reworded from "That pin…")* |
| 20 branches already | banner | You can have up to 20 branches. Message LyniaGo on WhatsApp for more. |
| Account on hold | banner | This account is on hold. Message LyniaGo on WhatsApp to sort it out. |

**Success:** the app switches to the new branch → its Orders home in the **not-live** state → toast **"{branch name} is ready"**. The nav stack resets to that root (C7 is gone).

### 5. B1 / D1 — just created, not live yet
- Header (mint `--accent-wash`, as B1): name + chevron (as §1), and under it the grey pill **"Not live yet"** (4px top margin) **instead of** the "● Open until" line. **No open/closed switch, no stat tiles.**
- Body centred, padding 0 28, gap 10: 72px `--surface` circle with `store` 30px `--muted` · **"Almost ready"** 18/700 · **"LyniaGo will call you to switch this branch on. Customers can’t see it until then."** 13 `--muted` · ghost button **"Check your menu"** (shop: **"Check your items"**; `utensils` / `package` 16px; one line, padding 0 20) → C1 / E1 · link **"Set opening hours"** 13/600 → C5.
- Tab bar as normal (Orders · Menu|Items · Money · Account).
- When LyniaGo switches the branch on, it becomes the normal B1 / D1.

---

## Interactions & behaviour
- **Toasts:** ink bubble, left/right 16px, 84px above the bottom, radius 14, padding 12 14, white 13.5/600, 2.2s.
- **Hardware back:** closes C6 first if open; C7 → C4; during C7 saving back is blocked.
- **Switching is global:** every query (orders, stats, menu/items, Money, Team, hours, preferred riders) is scoped to the current branch id. Persist the current branch so a relaunch returns to it.
- **Order alarm (B2 / D6):** rings only for the **current** branch on this device. Other branches ring on their own staff devices. (Open question answered: **A**, below.)
- **Offline:** no actions offline (D-48 rule); see C6 and C7 offline states.

## Open question — orders at other branches → **A**
Leave it as is. Each branch has its own staff and phones, and those ring for every order; ringing the owner for other branches adds a second alarm path and a server change. Revisit with **B** (a "2 new" count per C6 row, needs a server addition) if owners report missed orders.

## State
```
branches: { id, name, location: { street, area, lat, lng }, live: boolean }[]   // owner's branches, ≤ 20
currentBranchId: string                                                          // persisted
role: 'owner' | 'staff'                                                          // staff: no chevron, no Branches row, no Add
showBranchChevron = role === 'owner' && branches.length >= 2
c7: { name: string, location: Location | null, locationSource: 'gps' | 'search' | null,
      copyCatalogue: boolean (default true), saving: boolean,
      error: null | 'name_taken' | 'outside_area' | 'limit_reached' | 'on_hold' }
```
Use the endpoints from PR #999 for list / switch / create; map their error codes to the four cases above.

## Design tokens (from `reference/tokens`)
- ink `#14181B` · muted `#5B6670` · bg `#FFFFFF` · surface `#F6F7F8` · line `#E2E6EA`
- accent `#00B14F` · accent-text `#006630` · accent-wash `#E9F8EF` · cta-fill `#00812F`
- danger `#C0392B` · danger-wash `#FAEDEB` · danger-ink `#8F2418`
- `--shadow-sheet: 0 -2px 16px rgba(20,24,27,.08)` (sheet only; cards are shadow-free with a 1px line border)
- Radius: inputs 12 · rows/cards 14–16 · sheet 20 top · pills/buttons 999
- Targets: `--target-min` 44 · primary 52
- Type: 22 header name · 18 sheet title · 16 buttons/AppBar · 14.5 row title · 13 meta · 12.5 labels · 11.5 pills
- Tokens only in code — no literal values.

## Assets
Lucide icons from the design-system subset (`lynia-icons.js`): **chevron-down (new use)**, check, map-pin, store, circle-alert, plus, navigation, search, wifi-off, utensils, package, chevron-right. SVGs for the new ones are in `assets/`.

## Files
- `Merchant Screens Canvas (standalone).html` — all D-48 screens; **rows F (switcher) and G (add branch)** are this delta. Each frame has a `data-frame` id (used above). Append `?frame=<id>` to the source canvas to view one frame alone.
- `Merchant Prototype (standalone).html` — clickable. Tap the business name on Orders home → C6; pick a branch; Account → Branches → C7 (type a name, "Use my current location", Create branch). Use the side panel's Restaurant/Shop switch for shop copy.
- `reference/proto.js` — prototype wiring (branch state, C6/C7 logic, fixed parents).
- `reference/D-48-README.md` — the full D-48 handoff README, updated with this delta.
- `reference/BRIEF.md` — the original brief.
- `reference/tokens/` — colour, type, spacing tokens.
- Design-project sources: `explorations/merchant/Merchant App Redesign.html`, `explorations/merchant/Merchant App Prototype.html`; gallery bands MM1/MM2 in `explorations/journey/All Screens Gallery.html`.

## Screenshots
`screenshots/branches/` — the 16 frames of this delta, 360 × 720 PNG, named by screen and state.
Screenshots are for quick reference only; the HTML files are the source of truth.

## Checklist for the app PR
- [ ] Header chevron only for owners with 2+ branches; 44px target.
- [ ] C6 sheet, all four states; switch scopes every query to the new branch; toast.
- [ ] C4 Branches row (owner only) → C7.
- [ ] C7 form, enable rule, saving, four errors, offline; success → not-live home + toast.
- [ ] Not-live B1 / D1 state.
- [ ] `docs/DESIGN-DEVIATIONS.md` entry: *2026-10 · Merchant D-48 · Added C6 Branches (sheet) and C7 Add branch, B1/D1 branch chevron + not-live state, C4 Branches row. New icon use: chevron-down in the Orders header. API "outside area" copy reworded to "That address is outside the area LyniaGo covers for now."*
- [ ] Checked at 360 × 720 and 320 × 640.
