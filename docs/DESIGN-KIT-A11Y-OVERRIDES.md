# Design-kit accessibility overrides (2026-08-05)

**Context.** The Claude Design screens (`packages/design/`, synced from the hosted Design project) are the
source of truth: where the shipped app diverges, the app changes. **This document is the exception list** —
the handful of places where the app deliberately deviates from the kit *to satisfy WCAG contrast*, so
applying "kit is source of truth" literally would reintroduce a failure. For these, the **kit adopts the
app's value**, not the other way round.

See `docs/UI-KIT-VS-SHIPPED-VISUAL-AUDIT-2026-08-05.md` §9 for how this category was identified.

---

## How a kit change actually lands (read before editing `packages/design/`)

1. The **source of truth is the hosted Claude Design project.** `packages/design/` is a downstream mirror
   of it, kept current with `DesignSync` (the `/design-sync` flow).
2. `packages/design/_ds_bundle.js` and `_ds_manifest.json` are **generated artifacts** — the Design app's
   self-check compiles them from the component sources. Do not hand-author them; they regenerate on sync.
3. `DesignSync` **cannot push from a non-interactive session** (it needs `/design-login`). So a kit change
   must be made in an **interactive** session (or in the Claude Design web app), which also regenerates the
   bundle, and then synced into this repo.

Net: a kit fix is a three-step thing — (a) change the component source, (b) regenerate the bundle/manifest,
(c) update the hosted project so the next sync doesn't revert it. A repo-only edit to a component source is
a **stopgap** that the next sync overwrites unless (c) also happens.

---

## 1. Stepper "done" node — RESOLVED in source, bundle + hosted pending

**The failure.** The kit's `Stepper` draws a completed step as a bright `--accent` (`#00B14F`) fill with a
white (`--on-accent`) `✓`. White on `#00B14F` is **≈2.9:1 — fails WCAG AA** (the token's own comment
reserves `--accent` for non-text fills precisely because it "is never legible as text").

**The accessible treatment (what the app ships, `apps/mobile/src/ui/index.tsx` `Stepper`).** Done node is a
mint **`--accent-wash`** fill with a green **`--accent-text`** glyph — **≈6.5:1, passes**. The *failed* node
is untouched (white `!` on `--danger` red ≈5.4:1, passes).

**Status**

| Step | State |
|---|---|
| (a) component source `packages/design/components/journey/Stepper.jsx` | ✅ updated (this change) — done fill `--accent` → `--accent-wash`, done glyph `--on-accent` → `--accent-text` |
| (b) generated `_ds_bundle.js` | ⏳ **stale** — regenerates via the Design app self-check on the next sync; not hand-patched (it carries the node pattern more than once and getting it half-right is worse than leaving it) |
| (c) hosted Claude Design project | ⏳ **pending** — apply the same node change there in an interactive design session, or it reverts on the next sync into this repo |

No app change is required — the app is already correct. This item exists so the kit stops *disagreeing*
with the accessible app.

---

## 2. White on the bright `--accent` brand fill — OPEN, needs a product decision

**Not** a category-1 item (the app does **not** fix this — it matches the kit), so it is listed separately
as a decision to make, not a fix to apply.

Three kit surfaces put white text or icons on the bright `--accent` (`#00B14F`) fill — ≈2.9:1 — and the app
mirrors all three:

| Surface | Kit | App |
|---|---|---|
| `SystemState` green tone / force-update | `components/feedback/SystemState.jsx:14` (white title + body on `--accent`) | `apps/mobile/app/force-update.tsx` (same) |
| `BrandHeader` band | `components/home/BrandHeader.jsx:29` (white "DELIVER TO" + address on `--accent`) | `apps/mobile/src/ui/shell/BrandHeader.tsx` (same) |
| `ServiceTiles` tiles | `components/home/ServiceTiles.jsx:23` (white icon on `--accent`) | `apps/mobile/src/ui/shell/ServiceTiles.tsx` (same) |

The large display type and the 27px tile icons are **borderline** (AA-large / non-text graphics want 3:1;
`#00B14F` is ≈2.9:1). Body copy on the force-update screen is the clearest miss (needs 4.5:1).

**Options (pick per surface):**
- **Accept as brand** for the pure-graphic / large-display cases (the green splash is a deliberate brand
  moment; the tile icons are large graphics). Cheapest; leaves a borderline value.
- **Darken the text-bearing fills to `--cta` (`#00812F`, ≈4.7:1)** where real copy sits on green — most
  cleanly the force-update **body** line and the BrandHeader address. Keeps the brand green for the
  non-text graphics. Recommended for the text-bearing surfaces.

Whichever is chosen applies to **both** the kit (at the source, per the process above) and the app in
lockstep, since here they already agree.

---

## Summary

- **1 clean fix**, made accessible-correct in the kit source this change (Stepper done node); bundle
  regeneration + the hosted-project update are the remaining, interactive-session steps.
- **1 open decision** (white-on-`--accent` brand fills) — shared by kit and app, so not an app-vs-kit
  divergence; needs a per-surface call, then applied to both together.
