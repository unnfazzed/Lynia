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

## 3. Options

### A — Status quo: one free-text description (+ optional note)
`itemDescription` (required) + `note` (optional). Universal, lowest friction, works for one item or
many ("3 boxes of car parts, ~20kg"). **But**: the rider gets no *structured* size to judge bike-fit,
pricing/ETA can't factor bulk, and there's no prohibited-items gate.
*Verdict:* fine as a floor; under-serves the rider's accept decision and safety.

### B — Description + a **size** selector (recommended core)
Keep the free-text description, add **one required size choice expressed in bike terms**, not abstract
S/M/L:

| Size | Plain label | Bike-fit hint | Icon |
|------|-------------|---------------|------|
| `small` | Fits in a bag | Envelope, phone, documents | `package` |
| `medium` | Backpack size | Shoebox, small parts, meal | `package` |
| `large` | Bulky / needs straps | Helmet box, big bag, multiple items | `package` |

Three chips, tappable, icon+label, one required tap. This is the rider's accept-decision input and the
hook pricing/ETA grows into. Maps directly to the reserved `size` field. **Note** carries handling.
*Verdict:* best friction-to-value ratio for the pilot; serves the rider without a catalogue.

### C — Category chips + size + description
Add a category row (Documents / Food / Clothes / Electronics / Parts / Other) on top of B. Category
*can* auto-imply handling (Food → "keep upright/cold" nudge; Electronics → "fragile"), and seeds
future analytics/verticals. **But**: more taps, more literacy load, and category is a weak proxy for
the thing that matters (size). Risk: sender picks "Other" for everything.
*Verdict:* defer. Revisit when there's data or when a vertical (food) actually needs it.

### D — Structured line-items (name + qty rows)
"Add item" → multiple rows. Matches the §5b seam literally and reads "professional." **But**: heavy UI
for a one-shipment parcel courier, high friction on a cheap phone, and the rider still just needs
size+bulk of the *whole load*. Multiple items in the pilot are better expressed as description + size
("10 shirts") than as ten rows.
*Verdict:* defer to the merchant/COD vertical, where a shop's order genuinely is line-items.

## 4. Recommendation

Ship **A + B + a prohibited-items acknowledgement**, defer C and D:

1. **Description** (required, free-text, universal) — one item or many, in the sender's words.
2. **Size** (required, 3 bike-fit chips) — the rider's accept input; maps to the reserved `size`
   field; future hook for pricing/ETA by bulk.
3. **Note** (optional, multiline — already built) — handling: fragile, upright, keep cold.
4. **Prohibited-items + cap acknowledgement** at broadcast — a single checkbox/line: *"No cash, no
   hazardous or illegal goods, nothing over $150."* Cheap, and exactly the trust/safety affordance a
   cash, low-trust market needs (§3.5). Ties to the declared-value cap.

This keeps the required path to **description + size + price + 2 phones + pins** — still one screen,
still low-friction — while giving the rider what they need to bid confidently and adding a real safety
gate. "Food, clothes, car parts, many items" are all expressible as *description + size + note* without
a taxonomy the pilot can't yet justify.

## 5. Engineering-lens note (data model)

- **Keep `itemDescription`** as the required string; **add a `size` enum** (`small|medium|large`) —
  the data model already anticipates it. Don't hard-code categories yet.
- **Reserve, don't build, line-items.** Per §5b keep the door open (a future `items: [{name, qty}]`)
  but the pilot writes one description + size. No migration cost later.
- **Prohibited/cap** is a client-side gate + the existing `declaredValue.max(150)` — no new server
  field needed for the acknowledgement (or a boolean `acknowledgedTerms` if we want an audit trail).
- **No image picker** for the item in the pilot (D7 deferral holds) — data cost + the rider's pickup
  photo already covers dispute evidence.

## 6. Open questions for you

1. **Size labels** — do the bike-fit labels ("Fits in a bag / Backpack size / Bulky") read right for
   Harare users, or do you want literal S/M/L, or a weight band instead (e.g. "<2kg / 2–8kg / heavy")?
2. **Prohibited-items gate** — a passive line, a required checkbox, or a first-time-only explainer?
3. **Category** — confident to defer for the pilot, or do you want Food specifically flagged now
   (perishable handling) ahead of the food vertical?
4. **Many items** — is "describe in text + size" acceptable for the pilot, or is multi-item a real
   day-one need for your senders?
