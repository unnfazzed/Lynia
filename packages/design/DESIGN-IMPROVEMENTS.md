# Design improvements — response to the gstack design review

Source: [`docs/DESIGN-REVIEW.md`](https://github.com/unnfazzed/Lynia/blob/main/docs/DESIGN-REVIEW.md) (5 review passes, design score 9/10, with a trigger-tagged backlog). This pass turns the review's open items into shipped design-system pieces, aimed squarely at out-crafting inDrive and GrabBike on the details that matter in a low-trust, low-bandwidth market.

## Review findings → what shipped here

| Review item (stage) | Status in review | What shipped in this design system |
|---|---|---|
| **DT5 — map-anchored home** (Plan, locked decision D-b; deferred device-gated) | Spec only | **Built in the mobile kit**: full-bleed map, tap-to-pin with a **Pickup \| Drop-off segmented toggle** (selected colour = the pin being placed, green/red), auto-advance pickup→drop, "Use my location" pill on a solid fill, landmark auto-fill "• from map", and a **bottom MapSheet** with peek/expanded snap states (required path always visible in peek; landmarks, recipient phone, declared value in expanded). Drag/spring physics stay device-gated per the review — the sheet toggles by tap. |
| **Per-shape skeletons** (Ship §3a, P1 "5→improved", stepper + summary deferred to `/qa`) | Partly fixed | `SkeletonList` now has **`variant="stepper"`** (mirrors the §5c timeline: circles + connector + staggered labels) and **`variant="summary"`** (the tall mint earnings-total block) — no reflow when data lands. |
| **Pre-auth loading discipline / global offline banner** (Ship §3b, trigger `/qa`) | Not executed | New **`OfflineBanner`** component: calm ink bar ("You're offline — some things may be out of date."), muted "Reconnecting…" strip, renders nothing online. Never red — a dropped link is a state, not an alarm. |
| **Inline field validation + error slot on `Field`** (KYC review §4, P2) | Open | `Field` now has **`error`** (red border + specific, fix-it message, `role=alert`, `aria-invalid`) and **`hint`** props, plus a real label↔input **screen-reader association** (the §4 a11y item). |
| **OTP channel copy** (Ship §3b, trigger: BSP live) | Open | The kit's auth flow now says it: *"We'll WhatsApp a one-time code to this number"* → **"Check your WhatsApp"** screen, with a support escape hatch for numbers without WhatsApp (the review's WhatsApp-only reach risk, honestly surfaced). |
| **Lowball / no-offers pricing risk** (CONCEPT §3.7 — "surface 'riders usually accept around $X' hints once there's data") | Idea only | **Price-anchor hints** shipped as a pattern: on the price field (*"Suggested $2.50 · 3.1 km · riders here usually accept around $2.40."*) and on the live auction header. Fewer expired broadcasts, less race-to-the-bottom. |
| **Consent block strength** (KYC §4, P2) | Open | **Shipped** in the mobile kit's new Become-a-rider screen: names the partner (Didit), what's collected (ID photo + selfie liveness), why (safe deliveries, not shared with customers), a privacy link, at 14px. The KYC gate has honest pending/failed/verified states with a real retry.

## Where this beats inDrive / GrabBike

1. **The auction is a first-class screen, not a modal.** Live bid count + countdown that goes amber only in the last 20s, **best-match sort with one sparing gold RECOMMENDED marker**, re-sortable (cheapest/fastest/top-rated), price anchors against lowballing — inDrive's bidding with less decision-paralysis and no dark-pattern urgency.
2. **One timeline, two sides.** The §5c stepper shows customer and rider the *same* 7 steps with paired labels — support can read either screen. Grab shows the customer a driver dot; Lynia shows both parties the whole journey.
3. **Every dead-end is an action.** No-offers → "Nudge price & re-broadcast". Offline board → "you're first in line". Failed KYC → honest state + real retry. Competitors' empty states are mostly spinners.
4. **Cash-market trust affordances.** Delivery OTP shown as a first-class code card, phone reveal only during the active window, "record of work done — not a payout balance" honesty in earnings.
5. **Built for the actual device + network** (see readme "Device & network constraints"): 320px-first, ~150KB screens, 3 font weights with instant system fallback, 5KB icon subset, shaped skeletons, offline banner + frozen timers instead of lying clocks. Global apps assume flagship phones and LTE; Lynia doesn't.

## Open tensions (flagged, founder-level)

- **White on Grab-green #00B14F ≈ 2.9:1** vs the spec's "≥7:1 for primary actions in sunlight". **RESOLVED (2026-07-03):** `--cta-fill` set to **#00812f** (white labels ≈ 4.7:1, WCAG AA large) so CTAs stay legible on cheap phones in bright sun; the press state is `#006b27`. Kept separate from `--accent`, so the brand green stays vibrant on non-text fills (map graphics, chips, icon tiles). One-line re-tune documented in `tokens/colors.css`.
- **Sheet drag physics, map tile behaviour, real reflow** remain device-gated (`/qa`) — the kit intentionally ships tap-to-snap, not fake spring physics.
