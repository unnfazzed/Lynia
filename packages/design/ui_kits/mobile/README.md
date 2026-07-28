# Mobile app — UI kit

An interactive, mainly-cosmetic recreation of the **Lynia** Expo app (Android-first, 360px). Both roles live in one app behind a role toggle (top-right chip).

**Files**
- `index.html` — mounts the app in a phone frame. Open it to click through the flow.
- `app.js` — the screen state machine (login → WhatsApp OTP → 2a launcher home → DT5 map send composer → auction → tracking → rate; rider: online → board → offer → job).
- `kit-parts.js` — kit-only composites: `FauxMap` (stylised tap-to-pin map placeholder, not real tiles), `MapSheet` (peek/expanded bottom sheet), `PinToggle`, `OfferCard`, `SortChips`, phone chrome.

**Composes** the design-system primitives from `_ds_bundle.js`: `Button`, `Card`, `Field`, `StatusPill`, `Stepper`, `EmptyState`, `Heading`, `Sub`, `Label`, `SkeletonList`, plus the 2a home set: `BrandHeader`, `LiveOrderCard`, `ReorderRail`, `RestaurantCard`.

**Flow to demo**
1. Enter any phone (6+ digits) → Send code → any 6 digits → Verify (WhatsApp OTP copy).
2. **Launcher home (2a):** green brand header + floating search, Send / Food / Pharmacy tiles, the live-order card while an order runs, "Restaurants near you" cards. Tap **Send** → the map composer.
3. **Map send composer (DT5):** tap the map to drop the pickup pin (auto-advances to drop-off), or "Use my location"; the sheet's Pickup | Drop-off toggle switches the active pin; expand the sheet for landmarks / recipient phone / declared value. Set item + price → **Broadcast request**.
4. Auction: offers stream in over a few seconds; price-anchor hint; re-sort; **Choose this rider**.
5. Tracking: delivery code + live map (your actual pins) + 7-step stepper; **Simulate next step**; rate at delivered. The launcher shows the live-order progress card meanwhile.
6. Tap **Rider →** to switch roles: go online, pick a board order, make an offer, then advance the job and enter the delivery code.
7. The **320 · entry phone** toggle above the frame proves every screen at cheap-Android width.

The map is a cosmetic placeholder — the real app uses Google Maps Platform (native map + tap-to-pin + live tracking).
