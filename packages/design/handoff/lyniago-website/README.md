# Handoff: LyniaGo marketing website (lyniago.com)

## Overview
This is a single-page marketing site for **LyniaGo**, an on-demand motorbike delivery service in Harare, Zimbabwe. It is written for **customers** (people sending parcels), **merchants** (businesses that need deliveries) and **riders** (people who want to earn), not for investors.

The page's main jobs:
- get people to download the app
- get businesses onboarding through WhatsApp
- get riders signing up

## What's in this bundle
```
lyniago-website/
├── README.md                  ← this spec (self-sufficient)
├── CLAUDE-CODE-PROMPT.md      ← paste into Claude Code to deploy
├── site/                      ← PRODUCTION-READY static site. Deploy this folder as-is.
│   ├── index.html             ← the whole page (HTML + inline CSS + small inline JS)
│   └── assets/
│       ├── brand/lyniago-mark.svg
│       ├── fonts/  inter-400/600/700.woff2, fredoka-600.woff2
│       ├── illustrations/  19 SVGs
│       └── screens/  10 WebP app screenshots (alpha preserved)
└── reference/
    └── LandingPage-reference-offline.html   ← approved design, all assets inlined. Open in a browser to compare pixel-for-pixel.
```

## Fidelity: HIGH, ship as-is
`site/index.html` is the **final, approved, pixel-exact design**. It has no framework, no build step and no third-party requests, and it works on any static host.

**The deployment goal is a visual 1:1 match with `reference/LandingPage-reference-offline.html` at every width.**

Do not redesign, re-space, re-colour, swap fonts or "modernise" anything.

If you port it to a framework (Next.js, Astro and so on), keep all of these byte-for-byte:
- the markup
- the class names
- the CSS values
- the breakpoints
- the asset files

The simplest correct option is to deploy `site/` as a static site.

---

## Deploy (recommended path)
1. Put `site/` at the web root of lyniago.com, so `https://lyniago.com/` serves `index.html`. Any static host works: Cloudflare Pages, Netlify, Vercel (static), GitHub Pages, or cPanel `public_html/`.
2. All asset paths are **relative** (`assets/...`), so the folder works from the root or from a subpath.
3. Set up HTTPS and redirect `www.lyniago.com` to `lyniago.com` (or the other way round, but pick one; the canonical tag says `https://lyniago.com/`).
4. Caching headers:
   - `assets/*`: `Cache-Control: public, max-age=31536000, immutable`. If you use immutable caching, rename files with a hash whenever an asset changes.
   - `index.html`: `Cache-Control: no-cache`
5. Serve `.woff2` as `font/woff2` and `.svg` as `image/svg+xml`, and turn on gzip/brotli for HTML and SVG.
6. Add `/404.html` if the host needs one (optional: copy the header and footer and add a "Back home" button).

### Items to finish before launch (known TODOs)
| # | Item | Where | Action |
|---|------|-------|--------|
| 1 | **Play Store link** | Every "Download the app" / "Send a parcel" / "Become a rider" button currently points to `href="#app"` | When the app is published, set the three "Download the app" buttons and the "Send a parcel" hero button to `https://play.google.com/store/apps/details?id=<PACKAGE_ID>` with `target="_blank" rel="noopener"`. "Become a rider" also goes to the Play Store listing. |
| 2 | **OG share image** | `<meta property="og:image" content="https://lyniago.com/assets/og-image.png">` | Create `site/assets/og-image.png` at 1200×630 (green #00B14F background, LyniaGo mark and wordmark, the line "Stay home. We'll bring it."). Until then, remove that meta tag. |
| 3 | **About us page** | Footer link `href="/about"` | Build `/about` (or `/about.html`) with the same header and footer, or point the link at an existing page. |
| 4 | **Terms / Privacy** | Footer links currently `href="#"` | Link them to the legal pages when they exist. |
| 5 | Analytics (optional) | none yet | If needed, add a privacy-light script such as Plausible or Cloudflare Web Analytics. Do not add heavy trackers: users pay for mobile data. |

---

## Design tokens
All tokens are defined in `:root` inside `index.html`:

| Token | Hex | Use |
|---|---|---|
| `--g` | `#00B14F` | Brand green: hero, app box, primary buttons |
| `--gd` | `#006630` | Dark green: link colour, hover |
| `--gx` | `#063B22` | Deep green: "For businesses" section background, link hover |
| `--mint` | `#E9F8EF` | Callback section background, dot halo |
| `--ink` | `#14181B` | Text, dark buttons |
| `--mut` | `#5B6670` | Secondary text |
| `--yel` | `#FFD23F` | Accent yellow: CTA buttons, "How it works" section background, highlights |
| `--coral` | `#FF6B4A` | Accent: blobs, step-1 panel, phone frame 2 |
| `--vio` | `#4B2FBF` | Accent: rider section, step-3 panel, phone frame 1 |
| `--sky` | `#3EC1F3` | Accent: step-2 panel, phone frame 3 |
| `--pink` | `#FF8AC5` | Accent: blob, phone frame 4 |

Tile tints for "We deliver for": `#FFE7E0`, `#E3F6FE`, `#FFF4CC`, `#FFE6F2`, `#ECE8FF`, `#FFE1DC`, `#E9F8EF`.
Step panel tints: `#FFE7E0` (step 1), `#E3F6FE` (step 2), `#ECE8FF` (step 3).
Other fixed values:
- borders: `#EEF0F2`
- rider perk background: `#F4F1FF`
- business-section text: lead `#D9EFE1`, phone-number line `#D9EFE1`

**Type**
- **Inter** (self-hosted, weights 400, 600 and 700) for everything.
- **Fredoka 600** for the "LyniaGo" wordmark only.
- Fallback stack: `Inter, system-ui, sans-serif`. Every face uses `font-display: swap`.
- Headings (h1, h2, h3): weight 700, line-height 1, letter-spacing −0.035em, `text-wrap: balance`. Paragraphs use `text-wrap: pretty`.
- Eyebrow labels: 700, 13px, letter-spacing 0.12em, uppercase.

**Radii**
- 999px: buttons and pills
- 48px: big section boxes ("How it works", callback, app box)
- 40px: hero and rider illustration frames
- 32–34px: map card, business illustration, phones
- 28px: step cards
- 24px: tiles and trust cards
- 22px: step panels and perks
- 18px: chips

**Shadows (exact)**
- Hero illustration: `0 30px 60px -20px rgba(0,40,20,.45)`
- Chips: `0 18px 40px -12px rgba(0,0,0,.28)`
- Phones: `0 30px 50px -18px rgba(0,0,0,.45)` plus `inset 0 0 0 2px rgba(255,255,255,.28)`
- Step close-up cards: `0 22px 40px -12px rgba(20,24,27,.45)`
- Callback form: `0 10px 30px -12px rgba(0,80,40,.25)`

**Layout**
- Container `.wrap`: max-width 1240px (1160px at ≥961px), padding 0 32px (0 20px at ≤600px).

## Breakpoints (three tiers, all in index.html)
1. **Base** (styles written for large screens). This is also the style tablets see at 601–960px, together with the ≤960 overrides below.
2. **`@media (min-width:961px)`: desktop "fit each section in one window".**
   - Tighter type and padding.
   - Illustrations cap to the viewport height: `max-width: min(460px, calc(100vh - 200px))`.
   - The scooter illustration uses `min(520px, calc(100vh - 160px))`.
   - This is deliberate: **each section should fit in one laptop screen.**
3. **`@media (max-width:960px)`**
   - Nav text links are hidden.
   - Every two-column grid becomes one column.
   - Steps are stacked; trust becomes 2 columns.
   - Phones shrink to 150×286.
4. **`@media (max-width:600px)`**
   - Business tiles: 3 columns.
   - Trust: 1 column, with each card's illustration on the left.
   - Phones: 118×224.
   - The callback form stacks vertically.
   - Hero buttons stretch to full width.

**QA widths:** 360, 390, 768, 1024, 1280, 1440, 1920. At every width, compare with the reference file.

---

## Sections (top to bottom)
**1. Sticky header** (`.nav`)
- Style: white at 94% opacity with a 10px backdrop blur and a 1px bottom border `#EEF0F2`. Height 76px (64px on desktop tier).
- Left: logo, 36px mark + "LyniaGo" in Fredoka 600 26px.
- Centre-right: links "Send a parcel" (goes to #send), "For businesses" (#business), "Become a rider" (#riders).
- Right: green pill button "Download the app" with a play icon.

**2. Hero** (`#top`, green)
- Headline: "Stay home." then, in yellow, "We'll bring it."
- Subline: "Parcels and deliveries across Harare, tracked to your door."
- Buttons: yellow "Send a parcel" (play icon) and white-outline "Deliver for my business" (#business).
- Right side: `hero-rider.svg` in a 40px-radius frame, over a yellow blob, a coral blob and a small pink dot.
- Floating chips: "Rider 4 min away / Tendai · Honda Ace" (white, green live dot) and a rotated dark "Delivered" chip with a yellow check.
- Bottom: a white 56px rounded "wave" lip.

**3. "We deliver for"**
- Grid of 9 tiles, `auto-fill minmax(200px,1fr)` (160px on desktop, 3 columns on mobile). Each tile has a tinted background, an illustration panel at 6:5 ratio and a label.
- Order: Restaurants, Pharmacies, Retailers, Boutiques, Auto shops, Butcheries, Grocers, Online stores, Small businesses.
- Hover: `translateY(-4px) rotate(-1deg)`. Every tile links to #business.

**4. "Send in three steps"** (`#send`)
- Yellow rounded box with 16px side margins. Title plus a dark "Download the app" button.
- Three white cards, each with a big green number, a title and a `.shot` panel. The panel has a tinted background, an accent circle in the top-right corner, a phone crop (`step-N-phone.png`) and a floating close-up card (`step-N-hl.png`) with a 3px accent border and a slight rotation.

| Step | Title | Accent | Rotation |
|---|---|---|---|
| 1 | "Set pickup and drop-off" | coral | −2° |
| 2 | "Name your price, pick a rider" | sky | +1.5° |
| 3 | "Track live, share the code at hand-off" | violet | −1.5° |

**5. For businesses** (`#business`, deep-green `#063B22`)
- Eyebrow "For businesses" in yellow.
- H2: "Your delivery team —" then, in yellow, "without the fleet."
- Lead: "Restaurants, pharmacies, grocers, auto shops, boutiques and online sellers."
- Three one-line points, each with a 22px yellow line icon:
  - cash icon: "Pay per delivery, not for a fleet"
  - navigation icon: "Customers track every order live"
  - shield icon: "Code-confirmed proof on every drop"
- Yellow "Onboard on WhatsApp" button (goes to `https://wa.me/263778831938?text=Hi%20LyniaGo%2C%20I%27d%20like%20to%20onboard%20my%20business.`, new tab), followed by "or call **077 883 1938**". The number is an underlined `tel:+263778831938` link that turns yellow on hover.
- Right: `biz-scooter-rider.svg` (coral card with a rider on a scooter).

**6. Riders** (`#riders`)
- Left: `rider-night.svg` over a violet blob and a sky blob, with a rotated yellow chip "+ $10.00 / Job done".
- Eyebrow: bike icon + "For riders" in violet.
- H2: "Ride with LyniaGo." then, in violet, "Earn on your terms."
- Lead: "Got a bike? Turn your hours into income."
- Perks on a `#F4F1FF` background: "Your hours / Go online when it suits you." (hours.svg) and "Your price / Accept the fare or counter it." (price.svg).
- Buttons: violet "Become a rider" and violet-outline "How it works".

**7. Trust** — "Safe from pickup to door"
- Four bordered cards: Verified riders, Live tracking, Delivery code, Cash or any mobile money (the `trust-*.svg` files).

**8. Callback** (mint box) — H2: coral pin icon + "Live in Harare".
- Lead: "Need help getting started? Leave your number — we'll call you."
- Pill form: tel input "Your phone number" and a green "Call me back" button.
- Below: "Or WhatsApp us on 077 883 1938" (link).
- Right: a white card with a **dotted Zimbabwe map**. It is generated by inline JS from a lat/long outline polygon, with dots in 4 horizontal bands (ink, yellow, coral, green), a pulsing green Harare dot and a dark "Harare" chip.

**9. App download** (`#app`, green rounded box)
- H2: "Everything you send, in your pocket".
- P: "Book, track and pay in a few taps."
- Yellow "Download the app" button.
- Right: a yellow blob, a coral blob and **4 scattered phones**. Each frame is 200×382 with 9px padding and a 34px radius, and each has its own colour.

| Phone | Frame colour | Screen | Position |
|---|---|---|---|
| p1 | violet | Splash | left 6%, top 120px, rotate −9° |
| p2 | coral | Send a parcel (Harare map A→B) | left 28%, top 40px, rotate 3°, on top |
| p3 | sky | Live tracking | left 51%, top 150px, rotate −4° |
| p4 | pink | Rider: open orders | left 72%, top 70px, rotate 8° |

- Screens are exactly 1:2 (265×530 WebP) and fill the inner frame with `object-fit: contain`. **Do not change frame sizes unless you keep the inner area at exactly 1:2.**

**10. Footer**
- Logo + "On-demand delivery for local businesses."
- Links: Become a rider (#riders), For businesses (#business), About us (/about), Help (WhatsApp), Terms (#), Privacy (#).
- Bottom row: "© 2026 LyniaGo" and "Operated by FortyoneX Studio (Private) Limited."

---

## Interactions and behaviour (all in the inline `<script>`)
1. **Icons:** every `<i data-i="name">` is replaced with an inline 24×24 SVG line icon (stroke 2, round caps, `currentColor`). The paths are in the `P` object: play, check, msg, bike, cash, nav, shield, pin, phone, arrow and others. Keep this, or swap it for identical inline SVGs.
2. **Callback form** (`#cb`): on submit, `preventDefault`, then open `https://wa.me/263778831938?text=Hi LyniaGo, please call me back on <number>` in a new tab. The `required` attribute is the only validation. *(If a backend becomes available later, POST the number instead and show "Thanks — we'll call you shortly.")*
3. **Zimbabwe map:** built with JS at load time. The Harare dot pulses via the CSS `@keyframes zpulse` (2s, ease-out, infinite).
4. **Hover states:**
   - buttons: `translateY(-2px)`
   - yellow buttons: `box-shadow 0 6px 0 rgba(0,0,0,.18)`
   - green buttons: `#009D3B`
   - violet buttons: `#3B22A3`
   - links: `--gd`
   - tiles: lift and tilt
5. **Anchors:** smooth scroll (`html{scroll-behavior:smooth}`). Section ids: `#top`, `#send`, `#business`, `#riders`, `#app`.
6. There are no other dependencies, no cookies and no tracking.

## Contact constants
- WhatsApp / phone: **+263 77 883 1938** (`wa.me/263778831938`, `tel:+263778831938`), shown as "077 883 1938".
- Legal entity: FortyoneX Studio (Private) Limited.

## Assets (all original, owned by LyniaGo)
| File | Used in |
|---|---|
| `brand/lyniago-mark.svg` | Header and footer logo, favicon |
| `fonts/inter-400/600/700.woff2`, `fonts/fredoka-600.woff2` | All text / wordmark (~150 KB total) |
| `illustrations/hero-rider.svg` | Hero |
| `illustrations/biz-*.svg` (9 files) | "We deliver for" tiles |
| `illustrations/biz-scooter-rider.svg` | For businesses |
| `illustrations/rider-night.svg` | Riders |
| `illustrations/hours.svg`, `price.svg` | Rider perks |
| `illustrations/trust-verified/tracking/code/payment.svg` | Trust row |
| `screens/step-1..3-phone.webp` (500px wide) + `step-1..3-hl.webp` (600px wide) | "Send in three steps" panels, 2× the display size |
| `screens/app-splash/send/tracking/rider.webp` (265×530) | App section phones |

## Accessibility and performance
- Decorative images use `alt=""`. Content images have descriptive alt text. Keep both as they are.
- Contrast: body text is ink on white or white on green. Yellow is used only on ink or dark green, never as small text on white.
- Target Lighthouse: Performance ≥ 90 on mobile, Accessibility ≥ 95.
- **Page weight (done):** about 450 KB uncompressed and about 330 KB over the wire with gzip/brotli. This is under the 400 KB budget. Here is what was done:
  - Screenshots were converted to WebP at quality 0.92 and sized to 2× their display size. This took them from 691 KB to 152 KB with no visible loss.
  - Every image below the hero has `loading="lazy"` and `decoding="async"`.
  - The hero illustration has `fetchpriority="high"`.
  - Screenshots carry `width`/`height` attributes to stop layout shift, and `.shot img{height:auto}` keeps their proportions. **Do not remove that rule.**
  - Fonts are preloaded (Inter 600/700).
  - First paint loads only the HTML, the fonts, the logo and the hero SVG, about 110 KB. The rest arrives as the visitor scrolls.
- Don't re-encode the WebP files, and don't add image CDNs that recompress them.

## Launch QA checklist
- [ ] Deployed page matches `reference/LandingPage-reference-offline.html` at 360 / 390 / 768 / 1280 / 1440px.
- [ ] Fonts load: headings are Inter 700 and the wordmark is Fredoka.
- [ ] All 30 image paths load (WebP served as `image/webp`), with no 404s in the network tab.
- [ ] WhatsApp onboarding, the callback form and the tel link all work on a real Android phone.
- [ ] Play Store links are live (TODO 1). The OG image exists or its tag is removed (TODO 2).
- [ ] `/about` resolves (TODO 3).
- [ ] HTTPS works and the www redirect works.
