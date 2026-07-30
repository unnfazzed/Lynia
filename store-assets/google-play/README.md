# LyniaGo — Google Play Store assets

Complete Play Console upload set. Every file is authored 1:1 (1 design px = 1 output px), flattened to opaque PNG, and verified to the **exact** dimensions Google Play requires. The six screens are the **real designed LyniaGo app screens** (from the kit — `window.RC` restaurants + `window.LJ` journey), shown **frameless** on a minimal near-white `#F6F7F8` backdrop with soft-rounded corners — no device bezel, notch, or fake status bar (the clock / signal / battery indicators are stripped). One short label sits above each screen.

Regenerate from `../../explorations/store/Play Export Lab.html` (renders every shot at exact Play size) → capture each `#ph-0N` / `#t7-0N` / `#t10-0N` / `#feature` at scale = 1 → flatten to the exact box.

## Validation gate — all PASS

| File | Dimensions | Size | Format | Cap |
|------|-----------|------|--------|-----|
| `app-icon/icon-512.png` | 512 × 512 | 19 KB | PNG opaque | ≤ 1 MB |
| `feature-graphic/feature-graphic-1024x500.png` | 1024 × 500 | 174 KB | PNG opaque | ≤ 15 MB |
| `phone-screenshots/01–06` | 1080 × 1920 (9:16) | 367–389 KB ea. | PNG | ≤ 8 MB ea. |
| `tablet-7in/01–06` | 1200 × 2133 (9:16) | 423–449 KB ea. | PNG | ≤ 8 MB ea. |
| `tablet-10in/01–06` | 1620 × 2880 (9:16) | 651–686 KB ea. | PNG | ≤ 8 MB ea. |

25 files total. Icon and feature graphic contain no transparent pixels (fully opaque).

## Play Console upload map

**App content → Store listing → App icon**
- `app-icon/icon-512.png`

**Store listing → Graphics → Feature graphic**
- `feature-graphic/feature-graphic-1024x500.png`
- Keep in mind Google may overlay the app title/icon — all critical content (wordmark, tagline) is kept in the left/centre safe zone.

**Store listing → Graphics → Phone screenshots** (min 2, up to 8)
| Slot | File | Label |
|------|------|-------|
| 1 | `phone-screenshots/01-home.png` | One **app** |
| 2 | `phone-screenshots/02-restaurants.png` | Order **food** |
| 3 | `phone-screenshots/03-menu-cart.png` | Your **cart** |
| 4 | `phone-screenshots/04-tracking.png` | Track **live** |
| 5 | `phone-screenshots/05-send-parcel.png` | Send **parcels** |
| 6 | `phone-screenshots/06-payment.png` | Pay your **way** |

**Store listing → Graphics → 7-inch tablet screenshots**
- `tablet-7in/01-home.png` … `06-payment.png` (same six screens, re-laid for tablet — larger frame, wider margins)

**Store listing → Graphics → 10-inch tablet screenshots**
- `tablet-10in/01-home.png` … `06-payment.png` (same six, higher resolution)

## Notes
- Payment method reads **cash on delivery / mobile money** — no branded wallet names, per the real checkout screen.
- No location or country names on any customer-facing surface.
- Source generator: `../../explorations/store/Play Export Lab.html` (+ `play-export.jsx`) — renders every shot at exact Play size from the live kit; re-capture at scale = 1, then flatten.
- Photos: restaurant & dish cards use real appetising food photography (copied into `../_food/`, sourced from the open **Foodish** image set — biryani, butter-chicken, rice, burger, dosa, pizza), mapped per venue; drink tiles keep a clean tinted-initial fallback.
