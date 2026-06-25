# Lynia — Design System & UX Spec

> Seeded by the gstack `/plan-design-review` stage. This is the living design system: every screen and
> future design review calibrates against it. Direction: **clean utility + a warm accent** — trust through
> clarity, tuned for a low-trust cash market on cheap Android phones and expensive data.

## Locked design decisions

| # | Decision | Choice |
|---|----------|--------|
| D-a | Visual/brand direction | Clean utility + warm accent |
| D-b | Customer home layout | Map-anchored home; scannable LIST for offer compare |
| D-c | Theme + data discipline | Light, sunlight-contrast, data-light (dark mode deferred) |
| D-d | Offer presentation | Sorted list, blended "best-match" default + 'recommended' marker |

## Design tokens

**Color (light theme, AA+ contrast):**

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#14181B` | body text (≥4.5:1) |
| `--muted` | `#5B6670` | secondary text, captions |
| `--bg` | `#FFFFFF` | page background |
| `--surface` | `#F6F7F8` | cards, sheets |
| `--line` | `#E2E6EA` | borders, dividers |
| `--accent` | `#1E7A46` | primary action / "go" (green) |
| `--highlight` | `#F2B705` | 'recommended' marker only (gold, sparing) |
| `--danger` | `#C0392B` | errors, destructive |
| `--success` | `#1E7A46` | confirmations |

Body text ≥ 16px and ≥ 4.5:1 contrast; primary actions tuned ≥ 7:1 for **sunlight readability** (riders outdoors).

**Type:** **Manrope** (UI + display) — a real typeface, deliberately NOT Inter/Roboto/Arial/system. **Tabular
numerals** for fares, ETAs, ratings. Headings 600/700; body 400/500. Minimum body 16px.

**Spacing:** 8pt base — `4 / 8 / 12 / 16 / 24 / 32 / 48`.

**Radius:** containers 12px, inputs 8px, primary CTA full pill. Consistent, not ornamental (no uniform "bubbly"
radius on every element).

**Data-light:** cache map tiles, throttle the GPS marker render, lazy-load images, skeleton loaders over spinners.

## Components

| Component | Spec |
|-----------|------|
| Primary CTA | full-width pill, **52px** tall, `--accent`, one per screen |
| Secondary | outline, 48px |
| Input | **visible label above** the field (never placeholder-as-label), 48px |
| Offer card | big **tabular price** · ★rating + count · ETA · optional 'recommended' marker |
| Rider card | photo · first name + last initial · ★rating · call button (active order only) |
| Status stepper | the §5c 7-step timeline |
| Map bottom-sheet | draggable sheet over a full-bleed map |

**Icons are always paired with a text label** (low-literacy users + screen readers).

## Screen information architecture

```
Customer:  [Map home + "Send a parcel" sheet] → pins + item + adjustable price → Broadcast
           [Broadcasting] map + "Finding riders…" → offers stream into a sorted bottom-sheet LIST
             → select → [Tracking] §5c 7-step stepper + live map + rider card
Rider:     [Home] big online/offline toggle · nearby broadcasts (accept/counter) · active job
```

Offer list (D-d): default sort by a **blended best-match** of price + rating + ETA, with a subtle
'recommended' marker; re-sortable by the customer. Reduces decision-paralysis and resists a pure
race-to-the-bottom while keeping "customer always selects" (CEO D5).

## Interaction-state coverage

```
FEATURE             | LOADING            | EMPTY                          | ERROR                       | SUCCESS          | PARTIAL
--------------------|--------------------|--------------------------------|-----------------------------|------------------|----------------
Broadcast / offers  | "Finding riders…"  | no-offers → nudge+rebroadcast  | network → retry banner      | offer list shown | offers as they arrive
                    |  skeleton list     | no-riders → notify-me          | GPS off → enable prompt     |                  |
Tracking (§5c)      | map skeleton       | n/a (active order)             | GPS drop → stale label      | step lights up   | last-known + "paused"
Offer select        | per-row spinner    | n/a                            | rider gone → "pick another" | assigned → track |
Signup / OTP        | "sending code…"    | n/a                            | send failed → retry / alt   | verified         |
```

### Empty states (designed — the highest-leverage screens)

- **No offers / window expired:** calm, illustration-light card — *"No riders took this price yet."*
  Primary action: **Nudge price & re-broadcast**. Secondary: Edit order. (A dead-end becomes an action.)
- **No riders online:** *"No riders online in [corridor] right now."* Primary: **Notify me when one's
  available**. Context line on typical busy hours.

## Responsive & accessibility

- Android-first, designed at 360px width; touch targets **≥ 44px** (52px for primary).
- **Sunlight contrast** (AA+, primary ≥ 7:1) — riders use the app outdoors.
- Icon + text label everywhere; logical screen-reader order; visible focus.
- Easy error recovery (retry, edit, go back) — replenish the goodwill reservoir.

## NOT in scope (design, deferred)

- Dark mode / system-follow theme — fast-follow.
- Visual mockups — generate later with `/design-html` from this spec.
- Written-comment display on profiles (ratings show score + count only, per CONCEPT §5d).

## Build tasks (from the review)

| ID | P | Task |
|----|---|------|
| DT1 | P1 | This file — tokens, Manrope scale, spacing, components |
| DT2 | P1 | Two empty states (no-offers / no-riders) with warmth + primary action |
| DT3 | P1 | Interaction-state coverage (loading/error/partial) for broadcast, offers, tracking, OTP |
| DT4 | P1 | Offer list best-match default sort + recommended marker (D-d) |
| DT5 | P1 | Map-anchored customer home + bottom-sheet create flow (D-b) |
| DT6 | P2 | A11y + sunlight + data-light pass (targets, contrast, labels, tile caching) |
| DT7 | P2 | Run `/design-review` (visual QA) post-implementation |

## Next steps (gstack flow)

- ✅ Office Hours · CEO review · Eng review · **Design review** (this doc).
- ⬜ **Build** — eng-review lane A → B/C → D/E/F, building screens from this system.
- ⬜ Optional `/design-html` to generate HTML previews from this spec.

**Design score: 4/10 → 8/10.** No unresolved decisions.
