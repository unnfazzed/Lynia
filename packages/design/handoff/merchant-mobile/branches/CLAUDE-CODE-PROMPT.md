# Work order — merchant branches (C6 switcher, C7 Add branch)

Implement the multi-branch owner screens in the merchant app, wired to the endpoints already live from PR #999.

1. Read `README.md` in this folder end to end. It is the spec; copy is final and verbatim.
2. Open `Merchant Prototype (standalone).html` and click through: Orders header → C6 → pick a branch; Account → Branches → C7 → Create branch.
3. Match each frame in rows F and G of `Merchant Screens Canvas (standalone).html` (ids in the README state tables).
4. Build with the existing design-system components and tokens only (`packages/design/tokens/*.css`). No literal colours or sizes.
5. Scope every merchant query to `currentBranchId`; persist it.
6. Hide the chevron, the C4 Branches row and "+ Add a branch" for staff and for owners with one branch (the chevron only).
7. Map the API errors to the four C7 cases; update the API's copy to the README wording.
8. Add the `docs/DESIGN-DEVIATIONS.md` entry from the README checklist.
9. Check at 360 × 720 and 320 × 640. Never enlarge or shrink a drawn target.

Do not build: branch photos, per-branch stats in C6, delete branch, brand/chain settings, alarms for other branches.
