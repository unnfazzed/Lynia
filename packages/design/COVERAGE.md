# LyniaGo — Design Coverage Map

Screen-by-screen record of what the design system covers, so engineering and product can tell at a
glance what's **designed** vs. **deliberately out of scope**. ✅ designed & interactive · ⛔ out of
scope for this phase.

## Customer app (`ui_kits/mobile/`)
| Screen / state | Status |
|---|---|
| Splash (dove lift-in) | ✅ |
| Phone login | ✅ |
| WhatsApp OTP verify | ✅ |
| Map home — tap-to-pin, use-my-location | ✅ |
| Multi line-items (description + quantity, add/remove) | ✅ |
| Sender's note | ✅ |
| Both contact phones (required) + declared value | ✅ |
| Bottom sheet peek / expand | ✅ |
| Auction — offers stream, sort (best/cheapest/fastest/rated) | ✅ |
| Best-match ranking + RECOMMENDED marker | ✅ |
| Price-anchor hint | ✅ |
| Select-race ("rider just taken") | ✅ |
| Auction expired ("nudge & re-broadcast") | ✅ |
| No riders online ("notify me") | ✅ |
| Tracking — delivery code + re-issue | ✅ |
| 7-step journey timeline | ✅ |
| Call the rider (reveal window) | ✅ |
| Reconnecting / "live paused" map | ✅ |
| Cancel with reason + cancelled terminal | ✅ |
| Rate rider · completed | ✅ |
| Trip history · earnings · profile | ✅ |
| 320px small-screen mode | ✅ |

## Rider app (`ui_kits/mobile/`)
| Screen / state | Status |
|---|---|
| KYC gate (set-up → form + consent → pending → verified/failed) | ✅ |
| Go online / offline + reconnecting chip | ✅ |
| Order board (one-round, empty state) | ✅ |
| Make an offer (fare + ETA) | ✅ |
| "A customer picked you" → open job | ✅ |
| Active job — items, note, call both parties, map, timeline | ✅ |
| Delivery-OTP hand-off (wrong-code, 5-attempt lockout) | ✅ |
| Delivered | ✅ |

## Admin ops console (`ui_kits/admin/`)
| Screen | Status |
|---|---|
| Dashboard KPIs | ✅ |
| Rider KYC review queue (approve/decline, filters) | ✅ |
| Orders table | ✅ |

## Support / onboarding / edge (`ui_kits/support/`)
| Screen | Status |
|---|---|
| Onboarding carousel (3-slide, skip, dots) | ✅ |
| Permission priming — location | ✅ |
| Permission priming — notifications | ✅ |
| Notifications centre + empty state | ✅ |
| Help & support (topics + WhatsApp) | ✅ |
| Settings (profile, notifications, language, privacy, payment, sign-out) | ✅ |
| Edge — account on hold | ✅ |
| Edge — force update | ✅ |
| Edge — location off / no GPS | ✅ |
| Edge — generic error | ✅ |

## Foundations & brand
| Item | Status |
|---|---|
| Tokens (colors, type, spacing, radii, shadows, icons) | ✅ |
| 12 reusable components (+ specimen cards) | ✅ |
| Logo (Paper Dove) — mark, mono, icon, favicon/PNG set, one-pager | ✅ |
| Splash & loader animation | ✅ |
| `templates/app-screen` starter | ✅ |

## ⛔ Out of scope (this phase — by decision)
| Area | Note |
|---|---|
| Financial / superapp: wallet, credit offer, repayment, bike leasing | Roadmap phase — not designed |
| Localisation (Shona / Ndebele) | Copy is English-only |
| Marketing website | Not started |
| In-app chat / live-agent support | Help routes to WhatsApp for now |

## Known follow-ups (see `HANDOFF.md`)
- Repo-side engineering tickets (contact-phone guard, timeouts, race/OTP/board wiring, heartbeat).
- Outline the Fredoka wordmark to vector for final production.
- On-device checks: CTA sunlight contrast, skeleton reflow, sheet drag physics.
