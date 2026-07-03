# LyniaGo icon set

Generated from the Paper Dove — white dove on the brand-green (#00B14F) rounded tile. The vector brand
rule shows the crease-cross from **≥32px** (`Brand.tsx` `showCrease = size >= 32`); for these
**rasterized PNG tiles** the crease is only baked in from **≥48px** — at 16/32 raster px the fine
crease lines alias and muddy, so the smaller tiles use the clean silhouette. This 48px raster threshold
is a deliberate exception to the 32px vector rule, not a different brand rule.

## Files
- `lyniago-icon-{16,32,48,64,128,180,192,256,512,1024}.png` — square app/store icons.
  - **180** = iOS `apple-touch-icon`. **192 / 512** = Android / PWA. **1024** = App Store / Play listing.
- `lyniago-icon-maskable-512.png` — Android **adaptive** icon (extra safe-zone padding, full-bleed green).
- `favicon.ico` — multi-res (16/32/48) for browser tabs.
- `site.webmanifest` — PWA manifest referencing the icons; theme + background = brand green.

## Drop-in `<head>`
```html
<link rel="icon" href="/assets/brand/icon/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/brand/icon/lyniago-icon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/brand/icon/lyniago-icon-180.png">
<link rel="manifest" href="/assets/brand/icon/site.webmanifest">
<meta name="theme-color" content="#00B14F">
```

Source of truth is `assets/brand/lyniago-icon.svg`; re-run the icon export script if the mark changes.
