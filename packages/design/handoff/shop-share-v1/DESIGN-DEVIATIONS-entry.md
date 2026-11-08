# D-129 · Shop share links v1 (draft for docs/DESIGN-DEVIATIONS.md)

`2026-11-08 · Shop share v1 · handoff/shop-share-v1/ · Adds shop share links across four surfaces. No new tokens.`

**Browse v2 (store page)**
- Third 44px white disc **Share** (`share-2`) beside Search on the cover (S1), the no-cover tint band (S11) and the compact bar (S2), for restaurants, shops and pharmacies. Opens the system share sheet. Label "Share {shop}".
- Arrival from a link: S13a skeleton with only Back real (SH-A1); **no-address cell** "Set where to deliver" merging the time/fee/km cells (SH-A2); **out-of-area strip** with + discs removed (SH-A3); I3 unchanged, naming both shops (SH-A6); closed row + "Schedule for {t}" soft pill (SH-A8).
- Biker sheet "This is a shop link. Open as a customer?" and its active-job variant (SH-A7/A7b).

**Calm Mint v2 / First Run v2 (sign-in)**
- With a pending shop code, C1 is skipped and C2 opens first; C2 loses its Back.
- New **chip** "Taking you to {shop}" (or "the shop") on C2, C4, C5 and the permission asks; PC1/PC8 drawn full screen in the First Run shell when on the link path. Same on the customer web app (iPhone). Add to Home Screen tip held until after the first order from a link.
- C5 heading "riders" → "bikers" (D-101).

**Merchant v2 / Shop front v1**
- "Share your shop" row on Shop front, only while the shop is live.
- Share sheet (OB-M6 structure): preview card, Share on WhatsApp (`wa.me/?text=`), Copy link, Show QR, link text; branch picker for multi-branch owners; copied toast moved to the top.
- QR screen and A6 print / save card. New icons: `copy`, `qr-code`, `download`, `printer`.

**Empty States v2**
- Two new uses of `EmptyState`: "This shop isn't on LyniaGo right now" (info, `store`, pill "Browse restaurants") and "Can't reach LyniaGo" (error, `wifi-off`, pill "Try again"). No component change.

**Website**
- New Worker paths `/s/<CODE>` (shop-first landing, four device states + dead code) and `/s/<CODE>/card.jpg` (og:image: normal, no-photo, generic). `site/` untouched (D-42).
