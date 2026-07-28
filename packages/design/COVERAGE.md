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

### 2026 journey-review additions (`ui_kits/mobile/new-flows.html` · design; wire in app)
| Screen / state | Status |
|---|---|
| Search-first addressing — address search (Google Places, saved Home/Work, current location) | ✅ design |
| Profile registration — full name + national ID, stored only (no KYC); phone verified via OTP | ✅ design |
| Choose your role — send parcels / earn as a rider (one account; rider exits to rider journey) | ✅ design |
| Confirm pin on map — draggable pin, stores lat/lng + place_id, deep-links Google Maps | ✅ design |
| Live tracking — “Follow route in Google Maps” route-sync row | ✅ design |
| Pre-broadcast liability disclaimer (accept-to-continue, consent recorded) — A1-8 | ✅ design |
| Auction counter-offer — accept/decline a rider's higher price (never auto-charge) — F-07 | ✅ design |
| Rider cancelled → auto re-broadcast at same price — F-01 | ✅ design |
| Not delivered / undeliverable terminal (rider-recorded reason + attempts shown) — F-02 / S6 | ✅ design |
| Cancel-anytime — live-tracking cancel edge + post-pickup hand-back warning — S5 | ✅ design |
| Live paused — covers either side's outage, ~2-min escalation — S8 | ✅ design |

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

### 2026 rider journey-review (`explorations/journey/LyniaGo Rider Journey Map.html` · full flow map)
| Screen / state | Status |
|---|---|
| Rider-framed onboarding + location/notification priming | ✅ design |
| Role selection — "send a parcel" vs "earn as a rider" (one account) — R0-4 | ✅ design |
| KYC — become a rider (form + consent → pending → verified) | ✅ |
| KYC branches — verification failed, ID expired / re-verify | ✅ design |
| Board race — order taken by another rider first | ✅ design |
| Make an offer — **accept price _or_ counter** (fare + ETA) | ✅ design |
| Offer sent / picked / not-chosen | ✅ design |
| Pickup item verification — tick each item to confirm collection | ✅ design |
| Job failures — wrong-code lockout (+ "ask customer to re-send"), undeliverable terminal (incl. breakdown reason), rider bail (pre-pickup only), mid-job connection loss | ✅ design |
| **Customer cancelled** terminal — rider-side mirror of cancel-anytime (pre/post-pickup) — S5 | ✅ design |
| **Auction expired · no pick** — distinct from not-chosen; live window countdown on offer-sent — S1 | ✅ design |
| Rate the sender (optional, at delivered) — S10 | ✅ design |
| Earnings — lean total + trip list; new-rider empty state | ✅ |
| Account — profile, bike & documents, trip history, settings, help | ✅ design |
| System/edge — offline, on-hold, force-update, no-GPS, generic error | ✅ |

## Admin ops console (`ui_kits/admin/`)
| Screen | Status |
|---|---|
| Overview dashboard — KPIs, funnel strip, needs-attention, recent orders | ✅ |
| Orders monitor + order detail (timeline, parcel, fare) | ✅ |
| Edge — stuck order (no GPS → call / nudge / cancel) | ✅ |
| Fare adjust / refund + cancel (reason-code modals) | ✅ |
| KYC queue + full review (Didit checks, doc viewer, approve/decline) | ✅ |
| Edge — KYC resubmission (attempt 2, lock warning) | ✅ |
| Riders directory + profile (strikes, cooldown, cash owed) | ✅ |
| Edge — suspend / lift / permanent ban | ✅ |
| Customers directory + profile (masked phone, spend, reports) | ✅ |
| Edge — cancel-pattern flag / clear / ban | ✅ |
| Issues queue + investigation (OTP evidence, statements, resolve) | ✅ |
| Cash & settlements (weekly commission, overdue, record payment) | ✅ |
| States on every page — live / empty / loading / offline | ✅ |

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

## Restaurants vertical (`explorations/restaurants/`) — 2026 design, ships with Send in one release
| Screen / state | Status |
|---|---|
| **Customer** — home · service tiles (Send + Food from day one) | ✅ design |
| Restaurant list (default / loading / nothing open / offline) · search | ✅ design |
| Menu · item sheet · closed restaurant · closes-while-browsing | ✅ design |
| Cart (default / sold out / price changed / empty) | ✅ design |
| Checkout CASH · checkout WALLET with first-order cap steering · offline · placing | ✅ design |
| Pay-after-accept: waiting · push · pay screen · prompt sent · expired · declined | ✅ design |
| Tracking: prep countdown · rider secured · on the way (real Harare map) · live paused | ✅ design |
| NO_RIDER · rejected → refund pending → refunded (with reference) · cancel pre-pickup | ✅ design |
| Code + cash hand-off · delivered & rate · no-show failure · resume mid-order | ✅ design |
| **Merchant** (new Next.js tablet dashboard) — OTP login + alarm unlock · setup · reboot resume | ✅ design |
| Queue: empty · loading · NEW ORDER alarm · two at once · connection lost · arrived-offline | ✅ design |
| Accept + prep time · reject reason · do-not-cook-yet · rider secured · mark ready · NO_RIDER | ✅ design |
| Pickup confirm CASH · WALLET reference · short-payment blocked · handed over · rider no-show · refund execution | ✅ design |
| Menu editor · edit item · out-of-stock sheet · hours · weekly statement (0%) · end of day | ✅ design |
| **Rider** — auto offer CASH / WALLET · float-blocked · expired · headroom | ✅ design |
| Navigate to restaurant · pay the merchant · collect · navigate to customer | ✅ design |
| Code capture + cash collection · wrong code · delivered & earnings | ✅ design |
| Customer unreachable (timer + call log) · return leg · hand-back confirm · resume | ✅ design |
| Journey maps for all three actors (happy path + exceptions) | ✅ `Restaurants Journey Maps.html` |
| Decisions, numbers, interaction notes, screen inventory | ✅ `RESTAURANTS-DECISIONS.md` |
| Pharmacies vertical | ⛔ tab slot reserved, not designed |
| Order batching · photo/signature POD · scheduled orders · tipping · promos | ⛔ out of scope |

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
| Payment handling / reconciliation / refunds | **Off-platform by decision** — cash is settled directly between customer & rider; Lynia is not a party to payment or money disputes (surfaced via the pre-broadcast disclaimer). |
| Financial / superapp: wallet, credit offer, repayment, bike leasing | Roadmap phase — not designed. EcoCash / mobile money noted as a strategic rec in the audit. |
| Localisation (Shona / Ndebele) | Copy is English-only |
| Marketing website | Not started |
| In-app chat / live-agent support | Help routes to WhatsApp for now |

## Known follow-ups (see `HANDOFF.md`)
- **2026 seam resolution** (`INTERFACE-AUDIT.md`): customer ⇄ rider interface contracts C1–C9 in `HANDOFF.md` — each is one server-side transition pushed to both apps (counter round rules, cancellation matrix, code re-issue loop, presence escalation, undelivered reason flow).
- **Backlog execution:** sequenced in `BACKLOG-PLAN.md` (7 waves; Waves 1–2 pre-launch).
- **2026 customer journey-review flows** (`ui_kits/mobile/new-flows.html`) still need wiring into the interactive kit + app: counter-offer accept/decline, rider-cancel → auto re-broadcast, undeliverable terminal, disclaimer consent record, Google Places + Maps deep-link. Full gap list & severities in `CUSTOMER-JOURNEY-AUDIT.md`.
- **2026 rider journey-review** (`explorations/journey/LyniaGo Rider Journey Map.html`): two net-new screens to wire (role selection, pickup item verification) + rider tickets (reliability-score/bail maths, rider SOS, counter re-counter rules, hand-off lockout recovery, mid-job connection guards, order-level support). Full gap list & severities in `RIDER-JOURNEY-AUDIT.md`.
- Repo-side engineering tickets (contact-phone guard, timeouts, race/OTP/board wiring, heartbeat).
- Outline the Fredoka wordmark to vector for final production.
- On-device checks: CTA sunlight contrast, skeleton reflow, sheet drag physics.
