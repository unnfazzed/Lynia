# LyniaGo — Google Play Store assets

> **2026-10:** the phone screenshots were replaced by a 4-shot set drawn from the current handoffs (below). The tablet sets and feature graphic are still the earlier generation (old Home, 4-digit code) and should be regenerated before they are uploaded again.

Complete Play Console upload set. Every file is authored 1:1 (1 design px = 1 output px), flattened to opaque PNG, and verified to the **exact** dimensions Google Play requires. The six screens are the **real designed LyniaGo app screens** (from the kit — `window.RC` restaurants + `window.LJ` journey), shown **frameless** on a minimal near-white `#F6F7F8` backdrop with soft-rounded corners — no device bezel, notch, or fake status bar (the clock / signal / battery indicators are stripped). One short label sits above each screen.

Regenerate from `../../explorations/store/Play Export Lab.html` (renders every shot at exact Play size) → capture each `#ph-0N` / `#t7-0N` / `#t10-0N` / `#feature` at scale = 1 → flatten to the exact box.

## Validation gate — all PASS

| File | Dimensions | Size | Format | Cap |
|------|-----------|------|--------|-----|
| `app-icon/icon-512.png` | 512 × 512 | 19 KB | PNG opaque | ≤ 1 MB |
| `feature-graphic/feature-graphic-1024x500.png` | 1024 × 500 | 174 KB | PNG opaque | ≤ 15 MB |
| `phone-screenshots/01–04` | 1080 × 1920 (9:16) | 175–620 KB ea. | PNG opaque | ≤ 8 MB ea. |
| `tablet-7in/01–06` | 1200 × 2133 (9:16) | 423–449 KB ea. | PNG | ≤ 8 MB ea. |
| `tablet-10in/01–06` | 1620 × 2880 (9:16) | 651–686 KB ea. | PNG | ≤ 8 MB ea. |

23 files total. Icon and feature graphic contain no transparent pixels (fully opaque).

## Play Console upload map

**App content → Store listing → App icon**
- `app-icon/icon-512.png`

**Store listing → Graphics → Feature graphic**
- `feature-graphic/feature-graphic-1024x500.png`
- Keep in mind Google may overlay the app title/icon — all critical content (wordmark, tagline) is kept in the left/centre safe zone.

**Store listing → Graphics → Phone screenshots** (min 2, up to 8) — **2026-10 set, 4 shots**
| Slot | File | Caption | Screen (handoff frame) |
|------|------|---------|------------------------|
| 1 | `phone-screenshots/01-home.png` | Food, shops and parcels. **One app.** | Home H1 — `calm-mint-v2-2026-10` |
| 2 | `phone-screenshots/02-order-food.png` | Order from restaurants **in a few taps.** | Menu with cart S5 — `browse-v2` |
| 3 | `phone-screenshots/03-track-live.png` | Track every order **live, to your door.** | On the way T9 — `order-flow-v2` (v2.1) |
| 4 | `phone-screenshots/04-send-parcel.png` | Send a parcel. **Name your price.** | Step 3 Price — `send-compose-v2` |

1080 × 1920, opaque RGB PNG, 175–620 KB each. Regenerate with
`node store-assets/google-play/render-shots.mjs` (Playwright + Chromium): it captures each frame at 3×
from the handoff, crops the status bar, and places it under the caption on the mint (`#E9F8EF`) backdrop.
Home drops the design-review "NEEDS BACKEND" tag and shows the shipped tile label "Food" (ledger D-65).
Four shots at 1080 × 1920 keeps large-format promotion eligibility.

Suggested alt text:
1. LyniaGo Home with Food, Shops, Send and Pharmacy, popular restaurants, and a live order bar.
2. A restaurant menu with two dishes in the cart and the View cart bar.
3. Live tracking: the rider on the map, arriving in about 4 minutes, with the order steps.
4. Sending a parcel: the customer sets their own price, paid in cash to the rider.

**Store listing → Graphics → 7-inch tablet screenshots**
- `tablet-7in/01-home.png` … `06-payment.png` (same six screens, re-laid for tablet — larger frame, wider margins)

**Store listing → Graphics → 10-inch tablet screenshots**
- `tablet-10in/01-home.png` … `06-payment.png` (same six, higher resolution)

## Notes
- Payment method reads **cash on delivery / mobile money** — no branded wallet names, per the real checkout screen.
- No location or country names on any customer-facing surface.
- Source generator: `../../explorations/store/Play Export Lab.html` (+ `play-export.jsx`) — renders every shot at exact Play size from the live kit; re-capture at scale = 1, then flatten.
- Photos: restaurant & dish cards use real appetising food photography (copied into `../_food/`, sourced from the open **Foodish** image set — biryani, butter-chicken, rice, burger, dosa, pizza), mapped per venue; drink tiles keep a clean tinted-initial fallback.
