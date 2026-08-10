# Support / onboarding / edge — UI kit

The peripheral screens the core courier kit (`ui_kits/mobile`) doesn't cover — built from the same
design-system components so they're consistent with the product.

**Files**
- `index.html` — a gallery of all screens in phone frames (open it to browse).
- `parts.js` — shared frame, dove/wordmark, `SystemState` (the full-screen edge template).
- `screens.js` — every screen as a small function.

**Screens**
- **Onboarding carousel** — 3-slide first-run (food from kitchens near you → name your price to send → one app, one code), with skip + progress dots.
- **Permission priming** — location and notifications, each explaining *why* before the OS prompt (higher opt-in than a cold system dialog).
- **Notifications centre** — offers / delivery updates / account news, with unread dots; plus the empty state.
- **Help & support** — searchable topic list + a WhatsApp contact row (matches the WhatsApp-first product).
- **Settings** — profile, notifications, language, privacy, payment (cash), sign-out, version.
- **Edge / system states** (all on the `SystemState` template):
  - Account on hold (suspended)
  - Force update (brand-green, dove)
  - Location off / no GPS
  - Generic "something went wrong" — always reassures the order is safe and offers a retry.

**Voice** stays on-brand: second person, calm, honest, every dead-end offers an action.

**Not yet designed** (deliberately deferred — the financial/superapp phase): wallet, credit offer,
repayment, bike leasing. Localisation copy (Shona/Ndebele) is also pending — screens are English-only.
