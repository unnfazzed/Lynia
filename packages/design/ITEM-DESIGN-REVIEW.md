# Design review — "What are you sending?" (the item model)

> gstack-style design pass on how Lynia should capture *what* is being sent, given the range: food,
> clothes, car parts, documents — one item or many. Calibrated against `docs/CONCEPT.md` (§5b
> superapp seams, §3.5 declared-value cap + prohibited items), `docs/DESIGN.md` (data-light,
> low-literacy, icon+label, one primary CTA), and the contract (`CreateOrderRequest.itemDescription`,
> `declaredValue`; the data model's reserved `size` + line-items seam).

> **DECISION (2026-07-02, founder):** capture **multiple line-items, each `{ description, quantity }`** —
> nothing more descriptive for the pilot. **Size, category and item-photo are all deferred** (kept as
> data-model seams). This is Option D below, scoped down to just description + quantity per row.
> Shipped in the mobile kit: the home has a repeatable item list ("Add another item", per-row quantity
> stepper, remove); the rider job + board render the line-items so the §5c "Items & note confirmed"
> step is real. The optional **note** carries handling (fragile / upright / keep cold).

---

## 1. Reframe: who is the item field *for*?

It's tempting to design a rich "product" input. But on Lynia the item description isn't a catalogue
entry — it exists to answer **three practical questions**, all from the rider's and safety's point of
view, not the sender's vanity:

1. **Can I carry it on a motorbike?** — the single biggest accept/decline factor. A rider needs to
   know *size + bulk* before bidding. "Car parts" could be a spark plug or an exhaust; "clothes"
   could be a shirt or ten. **Size, not category, is the decision input.**
2. **How do I handle it?** — fragile, keep upright, keep cold (food), don't bend (documents). This is
   a *handling* signal, already served by the free-text **note** (D7).
3. **Is it allowed / what's it worth?** — prohibited items (cash, hazardous, live animals) and the
   **declared-value cap** (~$150 pilot). A safety + liability gate, not a description.

So the design question isn't "how do we model food vs. car parts" — it's **"how do we capture size +
handling + allowed, at the lowest friction, for a low-literacy sender on a cheap phone?"** Category is
only useful insofar as it's a shortcut to those three.

## 2. Constraints that rule options in/out

- **Low-literacy, low-trust, cheap Android, expensive data** → icon+label, few taps, no long forms,
  no image-heavy pickers. One primary CTA per screen.
- **Pilot = point-to-point parcel, one corridor** → the sender already has *the item(s)*; the rider
  only transports. We are NOT building a merchant catalogue (that's the COD/merchant vertical, §1b).
- **Superapp seam (§5b):** the data model reserves **line-items** ("use line-items, not a single
  hard-coded item field") and a **size** category — so we can *grow into* structure without a
  migration. That means: don't over-build now, but don't paint ourselves into a single-string corner.

---

> ## §3–6 SUPERSEDED
> The analysis below recommended **Option B** (one description + a required `size` enum, defer
> line-items). **That recommendation was NOT adopted.** The founder chose **Option D — multiple
> line-items `{ description, quantity }`** (see the decision block up top), and Option D shipped in the
> mobile kit and the contract (`packages/shared/src/contracts.ts` — `items` line-items; `size`,
> `category`, `itemPhotoUrl` deferred as data-model seams). The framing in §1–2 still holds; the
> option verdicts and open questions here are kept only as the pre-decision design record. **Do not
> build the size selector.**

## 3–4. Options considered (superseded)

Four options were weighed: **A** free-text description only; **B** description + a required 3-chip
`size` selector in bike-fit terms (this pass's original recommendation); **C** category chips on top of
B; **D** structured line-items (`{name, qty}` rows). The original recommendation was **A + B + a
prohibited-items acknowledgement**, deferring C and D.

**What actually shipped: Option D.** Line-items (description + quantity, add/remove per row) matched the
§5b superapp seam literally, and the rider reviews the whole load on the job card. `size`, `category`
and `itemPhotoUrl` were all deferred (kept as data-model seams); handling notes ride on the optional
free-text **note** (D7). The prohibited-items/declared-value cap remains a client-side gate against
`declaredValue.max(150)`.

## 5–6. Resolved

The §5 data-model recommendation (add a `size` enum, reserve line-items) was **overtaken** — the
contract ships line-items now, with `size` reserved. The §6 open questions (size labels, prohibited-
items gate style, category, multi-item day-one need) are all **resolved by the Option-D decision**:
multi-item is a day-one need and is expressed as line-items; no size enum ships in the pilot.
