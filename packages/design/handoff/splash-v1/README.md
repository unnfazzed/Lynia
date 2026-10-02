# Handoff: LyniaGo Splash — "1a Sun & orbit"

## Overview
This is the cold-start splash for the LyniaGo customer app. It plays a short brand moment, then stays up with a live loading state until the session check and app bootstrap finish. Once they do, it hands off straight to Home. It replaces the current "dove lift-in" splash (journey map node 0·1).

The look comes from the lyniago.com hero: a yellow sun with coral, pink, sky and violet blobs on brand green. A coral rider dot orbits the sun while the three sign-in steps tick off on a white card.

## About the design files
`Splash.html` is a **design reference built in HTML**. It's a prototype that shows the intended look, timing and states. It isn't production code. Rebuild it in the app's own stack and patterns (React Native / Flutter / native). Use the existing Lynia tokens and the self-hosted Inter/Fredoka fonts. Use the brand mark from the codebase (`lyniago-mark.svg`). Don't copy this file in.

Open `Splash.html` in a browser to compare against. It has controls for network (Fast / Slow / Offline), screen size (320×640, 320×700, 360×780) and Reduced motion, plus a live phase/time readout.

## Fidelity
**High-fidelity.** Colours, type, sizes, timings and easings are final. Rebuild them exactly.

## Screen: Splash

### Layout (screen is W×H; designed at 320 wide first)
- Background: `#00B14F` (brand green), full bleed. Use light status-bar icons. The "9:41" in the mock is only a device status-bar placeholder.
- **Centre anchor:** horizontally centred, at **44% of H**. The sun, orbit and dove all centre on this point.
- **Sun:** a 220×220 circle, `#FFD23F`.
- **Orbit:** a 272×272 circle with a 2px dashed border, `rgba(255,255,255,.5)`. The rider dot sits on top of it: 22×22, `#FF6B4A`, with a 5px white ring. When offline the dot turns `#AEB6BD`.
- **Dove (brand mark):** 128×128, offset (−60, −70) from the anchor. Facets are `#00B14F`, `#00B14F` and `#009D3B`. The crease strokes are `#FFD23F`, 2.4 wide (on yellow they replace the usual white creases).
- **Wordmark:** "Lynia" + "Go" in Fredoka 600, 40px, line-height 1, letter-spacing −0.01em. "Lynia" is `#FFFFFF` and "Go" is `#D6F5E2`. Centred, with its top at anchor + 152px.
- **Blobs** (decorative only; hide them from accessibility):
  - Coral `#FF6B4A`, 74px: left 28, top 13%H.
  - Pink `#FF8AC5`, 34px: right 40, top 21%H.
  - Sky `#3EC1F3`, 54px: right −8, top = anchor + 64.
  - Violet `#4B2FBF`, 150px: left −62, bottom −56.
- **Steps card:** inset 16px left, right and bottom. White, radius 24, padding 16/18, gap 12. Shadow `0 18px 40px -12px rgba(0,0,0,.3)`.
  - Each row is a 22px status circle, a 12px gap, then the label in Inter 600 15px.
  - Labels, in order: **"Checking it's you"**, **"Loading your saved places"**, **"Finding riders near you"**.
  - Row states:
    - *pending:* text `#5B6670`, ring 2px `#E2E6EA`.
    - *active:* text `#14181B`, a 2px `#00B14F` ring with a transparent top segment, spinning at 0.8s per turn (linear).
    - *done:* text `#14181B`, filled `#00B14F` with a white tick (5×10, 2px stroke). The tick pops in over 300ms.
- **Slow-network pill:** top 44, centred. Background `#FFD23F`, text `#3D3100`, Inter 600 13px, padding 9/14, full pill. Copy: **"Slow network — still connecting"**.
- **Offline panel:** inset 14px. Background `#14181B`, radius 24, padding 20.
  - Title: **"You're offline"**, Inter 700 18px, white.
  - Body: **"We'll keep trying. Check your mobile data or Wi-Fi."**, Inter 400 14px/1.45, `#C9D0D6`.
  - Button: **"Try again"**, 52px tall, full pill, background `#FFD23F`, text `#14181B` in Inter 700 16px.
  - While the panel is showing, the anchor group and the wordmark move up 64px (450ms) so they stay clear of it.

### Handoff target
This is the existing Home screen. The Home in the mock is only a stand-in.

## Interactions & behaviour

### Phases
| Phase | Trigger | What happens |
|---|---|---|
| `boot` | app launch | Brand intro plays (timeline below). Start the auth/bootstrap work immediately, in parallel. |
| `loading` | 1300ms after launch | Orbit and steps card appear. Each step goes active, then done, as its real task resolves. |
| `slow` (flag) | still loading 4000ms into `loading` | Slow pill drops in. Loading keeps going. |
| `offline` | network failure / no connectivity | Orbit pauses, dot greys, steps card hides, offline panel slides up. "Try again" goes back to `loading`. Keep retrying in the background. |
| `done` | all three steps resolved **and** at least 1300ms elapsed | Exit transition, then Home. |

Map the steps to real work:
1. **Checking it's you** = token refresh / session validation.
2. **Loading your saved places** = saved addresses / profile fetch.
3. **Finding riders near you** = nearby-rider or zone availability call.

Give each step a **minimum of 400ms in the active state** so the ticks don't flicker past on fast connections. If there's no valid session, skip the exit and route to onboarding/login after step 1.

### Timeline (ms from launch, boot phase)
| t | Element | Animation |
|---|---|---|
| 100 | Sun | scale 0 → 1.08 → 1, 700ms, `cubic-bezier(.3,1.5,.5,1)` |
| 250 / 450 / 650 | Dove facets (wing, body, keel) | opacity 0 → 1 with scale .3 → 1 and rotate −14° → 0, 500ms each, ease-out |
| 550 / 700 / 800 / 900 | Blobs (coral, pink, sky, violet) | scale pop, 600ms, `cubic-bezier(.3,1.5,.5,1)` |
| 950 | Crease lines | fade in, 300ms |
| 1000 | Wordmark | rise from translateY 14px with opacity 0 → 1, 550ms, `cubic-bezier(.2,.7,.3,1)` |
| 1300+ | Blobs | drift loop, 6s ease-in-out: translate (0,0) → (8,−10) → (−6,6) |

### Loading loops
- **Orbit:** fades in over 400ms while scaling .85 → 1, then rotates 360° every 2.6s (linear). When offline it pauses where it is.
- **Sun:** breathes scale 1 → 1.04 → 1, 2.4s ease-in-out.
- **Dove:** bobs translateY 0 → −8px with rotate 0 → −3°, 2.4s ease-in-out.
- **Steps card:** rises translateY 24 → 0 with opacity 0 → 1 (500ms, `cubic-bezier(.2,.9,.3,1.2)`).

### Exit (`done`)
| t (from done) | Element | Animation |
|---|---|---|
| 0 | Steps card | All rows show done. The card stays in place. |
| 0 | Orbit | scale → .3 and opacity → 0, 500ms |
| 0 | Dove | opacity → 0, 200ms |
| 0 | Sun | scale ×6 (fills the screen with yellow), 650ms, `cubic-bezier(.6,0,.2,1)` |
| 450 | Home | slides up from translateY 105% with top radius 40 → 0, 700ms, `cubic-bezier(.2,.8,.2,1)`. Status bar switches to dark icons. |
| 800–1110 | Home content | Staggered rise, 70–80ms apart, 450ms each |

### Reduced motion (`prefers-reduced-motion` / OS animation scale 0)
- No pops, drift, orbit spin, breathing or bob. Every element appears in its final position.
- State changes cross-fade over 200ms.
- The sun doesn't scale ×6. Home cross-fades in.
- The steps card still shows real progress.

### Accessibility
- The steps card is a polite live region; announce each step as it completes.
- The offline panel is an alert.
- The dove is labelled "LyniaGo". The wordmark text is hidden from screen readers because it repeats that label.
- Blobs and the orbit are hidden from accessibility.
- The "Try again" button is 52px tall (minimum 44).

## State
- `phase`: one of `boot | loading | offline | done`.
- `slow`: boolean.
- `steps`: three entries, each `pending | active | done`.
- `bootStartedAt`: timestamp used to enforce the 1300ms minimum.
- Retry restarts `loading` from the first step that isn't done yet.

## Design tokens used
- Green `#00B14F`, deep green `#009D3B`, mint text-on-green `#D6F5E2`.
- Sun `#FFD23F`, sun ink `#3D3100`.
- Coral `#FF6B4A`, pink `#FF8AC5` (website only, not yet a token), sky `#3EC1F3`, violet `#4B2FBF`, idle grey `#AEB6BD`.
- Ink `#14181B`, muted `#5B6670`, line `#E2E6EA`, offline body text `#C9D0D6`.
- Radii: card 24, pill 999.
- Shadows: card `0 18px 40px -12px rgba(0,0,0,.3)`; pill `0 8px 20px -8px rgba(0,0,0,.3)`.
- Fonts: Inter 400/600/700 (UI) and Fredoka 600 (wordmark only).
- There are no gradients, photos or bitmap assets. Everything is vector or solid shapes, which keeps the splash small.

## Review notes (pre-handoff)
- ✅ Fits 320×640, the smallest supported screen. The steps card clears the wordmark by about 26px. In the offline state the content moves up 64px to clear the panel.
- ✅ Every non-happy path has an action: offline gets "Try again" plus background retry; slow keeps loading with an explanation.
- ✅ Body copy contrast passes. Step labels in `#14181B` on white are about 17:1. Muted pending labels in `#5B6670` are about 6:1. The slow pill (`#3D3100` on `#FFD23F`) is about 11:1.
- ⚠️ "Go" in `#D6F5E2` on green is low contrast (about 2.3:1). It's accepted as a logotype, matching the existing brand splash card.
- ⚠️ Pink `#FF8AC5` comes from the website and isn't in `tokens/colors.css`. Add it as `--illus-pink` if this ships.
- ⚠️ On low-end Android, run the loops on the native/UI thread (Reanimated / Lottie / native animators). If frame time goes over 16ms, drop the blob drift first.

## Files
- `Splash.html`: the interactive reference with all states, sizes and reduced motion.
- `assets/lyniago-mark.svg`: the brand mark.
- `assets/fonts/`: Inter 400/600/700 and Fredoka 600 (woff2).
- Exploration history (in the design-system project, not bundled): `explorations/splash-redesign/Splash v2.html` (the three directions) and `Splash 1a refined.html` (the comparison).
