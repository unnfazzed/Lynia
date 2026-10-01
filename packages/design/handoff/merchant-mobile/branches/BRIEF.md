# Design brief: branch switcher and Add branch

Oct 1, 2026 · @Shepherd Mahupa

## Why

Please draw two new merchant screens: a **branch switcher** and **Add branch**. With them, an owner with shops in several places can run all of them from one login.

The server side is already live in the code (PR #999, plan `docs/plans/2026-09-30-multi-branch-owners.md`). Each branch is its own business, with its own location, hours, menu, team, orders and cash. Customers see each branch as a separate restaurant or shop. The owner works in one branch at a time, and switching moves the whole app to that branch.

Nothing in the app calls this yet, because the merchant mobile handoff (D-48) draws neither screen. Under the pixel-parity rule, the app can't build them until the design does.

## Where they attach

Both screens hang off existing D-48 screens, so neither adds a tab or changes the 4-tab bar.

| New screen | Opened from | Kind | Fixed parent (back goes to) |
| --- | --- | --- | --- |
| Branch switcher | Tap the business name in the **B1** / **D1** Orders header | Bottom sheet (like `ConfirmSheet`: radius 20 top, `--shadow-sheet`) | Closes back to B1 / D1 |
| Add branch | A new **Branches** row on **C4 Account**, and "+ Add a branch" at the foot of the switcher | Pushed screen with an AppBar | **C4** Account, whichever way it was opened |

Suggested new screen ids: **C6 Branches** (the sheet) and **C7 Add branch**. Use different ids if the C series is full.

## C6 Branches (the switcher)

The switcher is a bottom sheet listing the owner's branches. Tapping one moves the whole app to that branch.

**Entry point.** In the B1 / D1 header, a small chevron-down sits after the 22/700 business name, and the name plus chevron becomes one tap target. Draw the chevron **only when the person has 2 or more branches**. With one branch, the header stays exactly as drawn today.

**Sheet contents, top to bottom:**

1. Title "Your branches" (18, sheet title).
2. One row per branch, the branch they're in first. Each row has:
   - the branch name (14.5 row title), e.g. "Mama's Kitchen · Avondale";
   - the location line under it (13 meta), e.g. "5th Street, Mbare" (the same text A4's location card shows);
   - on the right, a check mark for the branch they're in now;
   - a grey **"Not live yet"** pill (11.5) for a branch LyniaGo hasn't switched on. It still opens normally: the owner sets it up there.
3. A ghost button **"+ Add a branch"**, which opens C7.

**After a tap:**

- The sheet closes on that branch's Orders home (B1 or D1).
- A toast reads "Now at Mama's Kitchen · Avondale".
- The header, stats, orders, menu, Money and Team all show the new branch.
- Tapping the branch they're already in just closes the sheet.

**Who sees it.** In practice only owners: staff work at one business, so they never have a second row. Staff don't see "+ Add a branch" (owner only).

## C7 Add branch

This is a one-page form, built from A4's parts, that opens a new branch and drops the owner straight into it.

**Layout, top to bottom:**

1. AppBar "Add a branch", back to C4.
2. **Branch name** field. Hint: "How customers will see it, like Mama's Kitchen · Avondale". Leave it empty, not prefilled with the current name.
3. **Location**, reusing A4's block exactly: the result card (map pin, street, "From your phone's location", "Change"), the ghost "Use my current location" button, and "Or search street or area". No pin and no landmark field, the same as A4.
4. **Copy my menu** row with a `Switch` (44×26), on by default. Meta line: "12 dishes in 3 categories". A shop reads "Copy my items" and "40 items in 5 categories".
5. One muted line (13): "Your logo, photos, opening hours and cash rule come too. You can change them in the new branch."
6. Primary **"Create branch"** (52px), pinned at the bottom.

There's no phone field. The branch's contact number is the owner's sign-in number, the same rule as A4.

**After "Create branch":** the app switches to the new branch and lands on its Orders home, with a toast "Mama's Kitchen · Avondale is ready". The branch isn't live for customers until LyniaGo switches it on after a call. Please draw how B1 / D1 looks in that state: a "Not live yet" pill or line under the business name, and what the empty body says.

**Errors the API returns** (today's wording below; if the mock words them differently, the mock wins and the API copy changes to match):

| When | Today's message |
| --- | --- |
| Name already used by another of their branches | You already have a branch with that name. Add the area, like “Mama's Kitchen · Avondale”. |
| Location outside the area LyniaGo covers | That pin is outside the area LyniaGo covers for now. |
| 20 branches already | You can have up to 20 branches. Message LyniaGo on WhatsApp for more. |
| Account on hold | This account is on hold. Message LyniaGo on WhatsApp to sort it out. |

The "pin" wording predates the D-48 no-pins rule, so it probably wants rewording.

## States to draw

The app may only render what the mocks draw, so every state below needs a frame or a one-line note in the handoff.

| Screen | State | What it should show |
| --- | --- | --- |
| B1 / D1 header | One branch | Today's header, no chevron (no change) |
| B1 / D1 header | 2+ branches | Name + chevron |
| C6 | 2 branches, one not live | Check on the current one; "Not live yet" pill on the other |
| C6 | Many branches (up to 20) | The list scrolls inside the sheet; the sheet tops out below the status bar |
| C6 | A long name | Truncated with an ellipsis on one line; the location line too |
| C6 | Offline | The red offline bar; rows and "+ Add a branch" disabled (D-48 rule: no actions offline) |
| C7 | Empty form | "Create branch" disabled until there's a name and a location |
| C7 | Location from GPS / from search | A4's two result-card states |
| C7 | Saving | The primary shows a spinner; the form is locked |
| C7 | Each error in the table above | Inline under its field (name, location), or a banner for the limit and on-hold |
| C7 | Offline | The red offline bar; "Create branch" disabled |
| B1 / D1 | Just created, not live | "Not live yet" and the empty body copy |

**Open question for product: orders at the other branches.** Today the owner only hears the order alarm (B2 / D6) for the branch they're in, so an order at another branch rings only on that branch's devices. The fix is a design choice, not a code change, so it's for product. Options:

- **A:** leave it as is, since each branch has its own staff and devices;
- **B:** add a count badge per row in C6 ("2 new").

B needs a small server addition.

## Constraints

Use the D-48 handoff's own system; nothing new is needed except the chevron.

- **Viewports:** 360×720, checked at 320×640. Merchant is a phone app now.
- **Tokens only** (`packages/design/tokens/*.css`), no literal values: `--accent`, `--cta-fill`, `--line`, `--muted`, and so on. Cards are shadow-free with a 1px line border; only the sheet uses `--shadow-sheet`.
- **Targets:** every tappable row and the name + chevron are at least `--target-min` (44px); the primary is 52px. The app never enlarges a drawn target, so draw them at size.
- **Type and spacing:** Inter, with D-48's sizes (22 header name, 18 sheet title, 14.5 row title, 13 meta, 11.5 pills); 16px screen edge.
- **Copy:** final wording in the mock. The app copies it verbatim, with no rewording on our side.
- **Don't draw** extras the app would then have to build: no branch photos in rows, no per-branch stats in C6, no "delete branch" (nothing on the server supports it yet), no brand or chain settings.

## What to hand back

A new handoff export that the app can be aligned to, screen by screen:

- [ ] Frames for **C6 Branches** and **C7 Add branch**, plus the changed **B1 / D1** header and the **C4** Branches row, in the merchant mobile canvas and prototype.
- [ ] Each state in the States table, drawn or covered by a one-line note in the handoff README.
- [ ] The README updated: the screens list, the fixed-parent map (C6 → B1/D1, C7 → C4), and the final copy.
- [ ] The new screens added to the All Screens Gallery, so the screen-inventory check picks them up.
- [ ] An answer on the open question (other branches' orders: A or B).

When the export lands in `packages/design/`, the change carries a `docs/DESIGN-DEVIATIONS.md` entry, as the design-freeze CI check requires. Then the app PR wires the screens to the endpoints that already exist.
