# Lynia — Design ↔ Functionality Alignment Review

> A review calibrated against the GitHub repo (`unnfazzed/Lynia`): the product
> spec (`docs/CONCEPT.md`, `docs/DESIGN.md`), the shared API contracts (`packages/shared/src/*`), and
> the as-built screens (`apps/mobile/app/*`, `apps/admin/*`), compared to **this design system**
> (tokens, components, the mobile/admin UI kits, the template). Run as two gstack lenses — **Design**
> and **Engineering** — so every possible workflow was thought out before build.
>
> Severity: **P0** = a real contract/functional breach (would fail validation or a live flow) ·
> **P1** = a spec/design mismatch a user would feel · **P2** = fidelity / polish / deferred-by-spec.

---

## Verdict at a glance

The **visual system is sound** — tokens, type, components and the two kits match the brand direction
and the review-hardened `docs/DESIGN.md`. The gaps this review surfaced were **workflow completeness**
and **contract fidelity in the demo kit** — races, timeouts, lockouts, the second high-leverage empty
state, and one hard contract rule (both contact phones required). None were visual-design defects;
all were "the flow isn't fully thought out yet" items, which is exactly what this review existed to
surface. **All of them were resolved on 2026-07-02.**

| Lens | P0 | P1 | P2 |
|------|----|----|----|
| Design | 0 | 0 | 0 |
| Engineering | 0 | 0 | 0 |

---

## Resolved 2026-07-02 (changelog)

Every finding from the two lenses was closed. Kept here as a record of *why* each landed the way it did.

**Design lens (calibrated against `docs/DESIGN.md` + `docs/CONCEPT.md`):**

- **D1 — Auction timer.** Counts down from **1:30** (`OFFER_WINDOW_MS = 90s`), tabular, ticking each
  second, muted → bold danger over the last 20s, recovery "Nudge price & re-broadcast" surfaced early;
  at zero → the **expired** empty state. (`contracts.ts`, `order/[id].tsx`.)
- **D2 — Suggested fare.** Computed base $1.50 + $0.60/km (3.1 km ⇒ $3.36); anchor hint derived from it. (`pricing.ts`.)
- **D3 — No-riders-online state** at broadcast, distinct from expired: *"No riders online right now…"*
  with **"Notify me when one's available."** Reachable via the demo "Riders: none" chip.
- **D4 — Real `rankOffers`** ported into the kit (price 0.45 / rating 0.35 / ETA 0.20, new-rider
  baseline, stable tie-break); RECOMMENDED marks the top only with ≥2 offers. (`offer-ranking.ts`.)
- **D5 — Profile / trip-history / earnings** screens added, reached from the home account button. (`app/history`, `app/earnings`, `app/profile`.)
- **D6 — "Live paused — reconnecting…"** overlay on the tracking + job maps (rider marker dims) when the Network chip reconnects. (`order/[id].tsx`.)
- **D7 — Surface `note`, defer `itemPhotoUrl`.** The home has a **"Note for the rider (optional)"**
  multiline `Field` capped at **280 chars** (matching `CreateOrderRequest.note.max(280)`) with a live
  counter; the rider reviews item + note on the job card, making the §5c "Items & note confirmed" step
  real. `itemPhotoUrl` consciously deferred — photo capture adds data cost/friction, and the rider's
  pickup photo already covers the dispute record. (`contracts.ts`.)

**Engineering lens (calibrated against `contracts.ts`, `enums.ts` + the realtime/API client):**

- **E1 (P0) — Both phones required.** Sender + recipient phones are on the DT5 home's required path,
  both validated (≥6 digits) before Broadcast enables; the rider sees both numbers with a call button,
  the customer sees the rider's, matching `PHONE_REVEAL_STATUSES` (`assigned`→`completed`). Founder
  decision (2026-07-02): *phones required; rider can call either party once the contract is active.* (`contracts.ts` `Waypoint`.)
- **E2 — `declaredValue` defaults to 0** when blank for the pilot (the cap policy is the guard, not a mandatory value). Optional field in the expanded sheet; the "max 150" copy stays. (`contracts.ts`.)
- **E3 — Bounded error outcomes.** `OfflineBanner` mounted in the frame, driven by a demo Network chip (online / offline / reconnecting); async paths now have designed error outcomes (wrong-OTP + lockout, select-race, KYC failed, board empty/error). (`client.ts`.)
- **E4 — Select-offer race.** Choosing a rider can hit a muted *"That rider was just taken — choose another."* (not error-red); the rider drops, the retry assigns. (`order/[id].tsx`.)
- **E5 — Delivery-OTP.** Validates the shared code; wrong → *"Wrong code — N tries left"*; **5 wrong → lockout**; the customer's tracking card has **Re-issue delivery code** (regenerates + clears the lockout). (`job.tsx`, `order/[id].tsx`.)
- **E6 — One round per rider.** After **Send offer** the order is hidden from the board with *"Offer sent — you'll be notified…"*; a job starts only when the customer selects. Empty board → *"you're first in line."* (`rider/index.tsx`.)
- **E9 — Bidirectional phone reveal** during the active window (rider sees sender + recipient; customer sees rider), each with a call affordance, absent outside tracking. (`enums.ts` `PHONE_REVEAL_STATUSES`.)
- **E10 — Cancelled terminal card** with the optional **reason**, plus a customer cancel-with-reason flow during cancellable statuses. (`enums.ts`, `contracts.ts` `CancelRequest`.)

---

## Still open

Both are things a design kit can't close — they live in app/backend code:

- **E7 — Rider heartbeat + cooldown-403 wiring.** The glanceable **Reconnecting** chip is designed and
  shown in the kit, but the real heartbeat loop and the cooldown-403 auto-flip-to-offline are
  **device-gated** — wire them in the app build. (`rider/index.tsx` heartbeat.)
- **E8 — Backend PII-redaction rules.** Documentation-only: the kit board is already phone-free and the
  reveal rule is enforced in the kit, but the `offers:changed` signal-only payload and the
  `PublicWaypoint.strict()` redaction are **backend guarantees** — recorded here so future edits don't
  leak PII. Nothing to build in the design system. (`contracts.ts` `WS_EVENTS`, `PublicWaypoint`.)

**D8 note (support surfaces).** The notifications centre and help/settings **are** designed — in the
support kit (`ui_kits/support/`: notifications centre + empty state, help & support, settings). They
are simply not yet wired into the mobile app shell; that wiring is an app-side task, not a design gap.

---

## Repo-side engineering tickets

The single canonical list of repo-side tickets (contact-phone guard, timeouts, race/OTP/board wiring,
heartbeat/cooldown) lives in **[`HANDOFF.md`](./HANDOFF.md)** — see "Repo-side engineering tickets"
there. This doc does not keep a second copy.
