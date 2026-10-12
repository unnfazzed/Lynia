# 09 · Remove one prescription page (U29)

**App:** Customer, pharmacy checkout. **Extends:** order-flow-v2 **R8b** "Prescription block · added". See `resources/screens/R8a.png` and `R8b.png`. Ledger D-92.

## The problem

The customer adds up to **3 photo pages** of a prescription. If one page is blurry, or the server refuses one at placement, there's **no way to remove just that page**. With 3 pages the add tile is gone, so they're stuck. Today the only escape is the app clearing *all* pages after a server refusal.

## Must

- A **remove action on each page thumbnail** (64×80, radius 12). Its target is at least 44, even though the thumb is small: the hit area can extend past the drawn mark.
- After a removal the add tile comes back (fewer than 3 pages).
- Remove is instant. Use an undo toast rather than a confirm dialog, since retaking is cheap.
- A thumb that is still uploading (spinner) can also be removed.
- Accessible name: "Remove page {n}".
- The rest of R8b is unchanged: the dashed + tile (camera), Patient name, the consent tick.

## Your call

- An ✕ badge on the thumb corner, tap-the-thumb-to-open (view / Retake / Remove), or long-press. Pick whatever works one-handed in sunlight.
- Whether a refused page gets marked (danger ring) rather than everything being cleared. Today the server can't tell us which page failed, so draw it only if you think it's worth asking engineering.

## Copy to start from

"PRESCRIPTION" · "Add a photo of your prescription" · "Up to 3 pages. A pharmacist checks it before packing." · "Take photo" · "From gallery" · "Page {n}" · "Patient name" · "Remove" (Send kit) · "Retake" (rider kit)

Suggested toast: "Page removed · Undo".

## Draw

1. R8b with 3 pages and the remove affordance visible.
2. After removing one: 2 pages + add tile + undo toast.
3. The page-detail view, if you choose tap-to-open.
4. 320×640 of frame 1 (3 thumbs + tile must fit or wrap cleanly).

Suggested ids: `R8c`, `R8d`.
