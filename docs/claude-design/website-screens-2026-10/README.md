# lyniago.com — new app screens (Claude Design pack, 2026-10)

This pack redraws the app screens on lyniago.com so they show the current LyniaGo app. It also switches the site copy from "rider" to "biker", which is now the wording used everywhere.

> In the repo, `resources/` isn't committed (it would only duplicate files). Build it from the repo paths in the "Where the screens come from" table below, plus `apps/website/site/assets/screens/*.webp` for `current-site/`. Or use the zipped pack from the session that wrote this.

Two places on the page change:

| Section | Images | Prompts |
|---|---|---|
| **How it works**: 3 cards, each with a phone and a highlight crop | `step-1/2/3-phone`, `step-1/2/3-hl` | `prompts/01`–`03` |
| **Hero collage**: 4 tilted phones | `app-splash`, `app-send`, `app-tracking`, `app-rider` | `prompts/04`–`07` |
| **Copy**: "rider" becomes "biker" across the page | text only | `prompts/08` |

## How to use it in Claude Design

1. Open the lyniago.com website project.
2. Paste **`prompts/00-context.md`** first. Upload `resources/tokens/*.css` and `resources/current-site/*.png` with it, so Claude Design can see what is being replaced.
3. Run each prompt from `01` to `08` in turn. Each prompt starts with a **Resources to attach** list; upload those files with that prompt.
4. When every screen looks right, export the website handoff.

## Specs Claude Design must match (the site's CSS depends on them)

| File | Size (px) | What it contains |
|---|---|---|
| `app-splash` / `app-send` / `app-tracking` / `app-rider` | **265×530** (also export at 2× = 530×1060) | The **flat screen only**. No phone frame, no tilt, no shadow. The site draws the coloured frame, the 24px screen radius and the rotation in CSS (`.ph.p1`–`.p4`). Draw it at 360×720 and scale down; the ratio is the same 1:2. |
| `step-1-phone` | **500×605** | The top part of a phone: black bezel with the notch, transparent outside the device. The bottom edge crops straight through the screen, as the current file does. |
| `step-2-phone`, `step-3-phone` | **500×537** | Same as step 1. |
| `step-1-hl` / `step-2-hl` / `step-3-hl` | **600 wide**, height to fit (now 186 / 318 / 289) | The highlighted component **flat on white**. No outline, no shadow, no rotation. The site CSS (`.shot .sh`) adds the 3px coloured border, 8px white padding, shadow and tilt. If the height changes, the export must update the `height=""` on that `<img>`. |

The current files are in `resources/current-site/` (converted to PNG). Match their crop and framing.

## Where the screens come from (the app's design sources, all included)

| Screen | Source | In this pack |
|---|---|---|
| Splash ("1a Sun & orbit", no steps card) | `packages/design/handoff/splash-v1/` | `resources/splash/` |
| Send a parcel, step 1 Where | `packages/design/handoff/send-compose-v2/` | `resources/send-compose/` |
| Order screen: offers, on the way, delivery code | `packages/design/handoff/after-send-v2/` | `resources/order-screen/` |
| Biker job board | `packages/design/handoff/rider-v2/` | `resources/biker-board/` |
| Floating tab bar on the board | `packages/design/handoff/tab-bar-v1/` | `resources/tab-bar/` |
| Tokens | `packages/design/tokens/*.css` | `resources/tokens/` |

Open the `(standalone).html` files in a browser. They work offline and show every state. The `*-kit.jsx` files contain the exact copy objects (`S`, `A`, `R`).

**"Rider" is shown as "biker"** in every visible string (owner decision, ledger D-101). The source files still say "rider"; the prompts already have the biker wording.

## How it gets back onto the site

The website ships exactly what the handoff contains (CLAUDE.md, "Marketing website"). Export the updated site from Claude Design into `packages/design/handoff/lyniago-website/`. A Claude Code session then copies it into `apps/website/site/`. Don't hand-edit `apps/website/site`: the `website` CI job fails any difference from the handoff, except the approved launch edits.
