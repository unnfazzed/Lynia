# Home components — BrandHeader · LiveOrderCard · ReorderRail · RestaurantCard

The 2a customer-home language, promoted from `explorations/restaurants/Home Explorations.html` (option 2a).

**BrandHeader** — the ONE accent-filled surface in the app, root home only. Green block with DELIVER-TO address + bell/profile circles (`--accent-700` fills), white search bar floating -22px over the seam. The screen must render a light status bar on green above it and a white body below. Never use it on inner screens — they keep white app bars.

**LiveOrderCard** — always the topmost card on home while an order runs, for every service (Express parcel or Food). `step` is the 0-based tracker index (7 steps by default). Title = who/where + minutes; meta = payment + total.

**ReorderRail** — order-again circles (accent ring, green tabular price). `size={58}` default; use `44` on dense 300×600 gallery phones. Hidden while a live order shows (the card takes its slot).

**RestaurantCard** — photo-led venue card. `photo` is a node (an `<image-slot>` wrapper in mockups, `<img loading="lazy">` in product) ~84–104px tall; omit it for the tinted-initial fallback — photos are an upgrade, never a dependency (~15–25KB, lazy-loaded). ETA pill floats bottom-right on the photo (bottom-left stays clear for image credits). Closed cards dim, swap fee for "Closed", and may carry a `note` pill ("Opens 11:00").

Composition order on home: BrandHeader → service tiles (D-01, unchanged) → LiveOrderCard *or* ReorderRail → "Restaurants near you" rail of RestaurantCards.
