# Lynia — Design ↔ Functionality Alignment Review

> A pre-implementation review calibrated against the GitHub repo (`unnfazzed/Lynia`): the product
> spec (`docs/CONCEPT.md`, `docs/DESIGN.md`), the shared API contracts (`packages/shared/src/*`), and
> the as-built screens (`apps/mobile/app/*`, `apps/admin/*`). It compares those to **this design
> system** (tokens, components, the mobile/admin UI kits, the template). Run as two gstack lenses —
> **Design** and **Engineering** — so possible workflows are thought out. **Nothing here is
> implemented yet**; this is the checklist to agree before we build.
>
> Severity: **P0** = a real contract/functional breach (would fail validation or a live flow) ·
> **P1** = a spec/design mismatch a user would feel · **P2** = fidelity / polish / deferred-by-spec.

---

## Verdict at a glance

The **visual system is sound** — tokens, type, components and the two kits match the brand direction
and the review-hardened `docs/DESIGN.md`. The gaps are almost entirely **workflow completeness** and
**contract fidelity in the demo kit**: the kit was built as a happy-path click-through and skips
several states the real app must handle (races, timeouts, lockouts, the second high-leverage empty
state) and one hard contract rule (both contact phones required). None are visual-design defects;
all are "the flow isn't fully thought out yet" items — exactly what this review exists to surface.

| Lens | P0 | P1 | P2 |
|------|----|----|----|
| Design | 0 | 0 | 0 |
| Engineering | 0 | 0 | 1 |

**Resolved (2026-07-02):** all P0/P1 (E1, D1, D2, D3, D7, E4, E5, E6, E9) plus E3; and the P2 fidelity batch — **D4** (real `rankOffers`), **D5** (history/earnings/profile screens), **D6** (reconnecting "Live paused" map), **E7** (rider reconnecting chip), **E10** (cancelled state + reason). **E2** decided (declaredValue defaults to 0 for the pilot — intended). **E8** is documentation-only (see below). This design system is now aligned with the repo contracts + spec.

---

## 1. Design lens

Calibrated against `docs/DESIGN.md` (tokens, components, IA, interaction-state matrix, empty-states)
and `docs/CONCEPT.md` (§5c stepper, §5d privacy, §1 offer loop).

| # | Sev | Finding | Evidence | Proposed resolution |
|---|-----|---------|----------|--------------------|
| **D1** | ✅ | **RESOLVED (2026-07-02).** Auction timer now counts down from **1:30** (`OFFER_WINDOW_MS = 90s`), ticking each second, tabular; **muted → bold danger over the last 20s** with the recovery "Nudge price & re-broadcast" surfaced early; at zero → the **expired** empty state. | `contracts.ts`; `order/[id].tsx`. | Done. (Kit uses the real 90s window; socket-freeze/paused-dot is device-gated.) |
| **D2** | ✅ | **Suggested-fare number fixed.** Now computed as base $1.50 + $0.60/km (3.1 km ⇒ $3.36) with the anchor hint derived from it. | `pricing.ts`. | Done. |
| **D3** | ✅ | **RESOLVED (2026-07-02).** New **no-riders-online** state at broadcast (distinct from expired): *"No riders online right now… a higher price won't help until one comes online. Busiest 7–9am & 5–7pm."* Primary **"Notify me when one's available"** (arms a confirmation). Reachable via the demo "Riders: none" chip. | DESIGN.md empty-states. | Done. |
| **D4** | ✅ | **RESOLVED.** Ported `rankOffers` (price 0.45 / rating 0.35 / ETA 0.20, new-rider baseline, stable tie-break) into the kit; "Best match" now truly ranks and RECOMMENDED marks the top only with ≥2 offers. | `offer-ranking.ts`. | Done. |
| **D5** | ✅ | **RESOLVED.** Added **profile / trip-history / earnings** screens (account button on the home). History reuses row layout + StatusPill; earnings keeps the accent summary + "record of work done, not a payout balance" framing. | `app/history`, `app/earnings`, `app/profile`. | Done. |
| **D6** | ✅ | **RESOLVED.** The tracking + job maps show a **"Live paused — reconnecting…"** overlay (rider marker dims) when the Network chip is reconnecting. | `order/[id].tsx` `connectionState`. | Done. |
| **D7** | ✅ | **RESOLVED (2026-07-02).** Decision: **surface `note`, defer `itemPhotoUrl`.** The home now has a paragraph **"Note for the rider (optional)"** — a multiline `Field` (new `multiline`/`rows` support) capped at **280 chars** (matching `CreateOrderRequest.note.max(280)`, in line with delivery-app note fields) with a live counter. The rider reviews the **item + sender's note** on the job card, making the §5c **"Items & note confirmed"** step real. `itemPhotoUrl` is **consciously deferred** — photo capture adds data cost/friction on cheap phones, and the rider's pickup photo already covers the dispute record. | `contracts.ts` (`note`, `itemPhotoUrl`); DESIGN.md "Drift". | Done. Item-photo capture stays deferred and documented. |
| **D8** | P2 | **Notifications centre + support/help absent.** Designed (DT10) but not built in the app and not in the kit. | DESIGN.md cross-cutting flows (DT10 partial). | Deferred-by-spec — list explicitly as out of scope for this pass so it's a decision, not an omission. |

---

## 2. Engineering lens

Calibrated against the **wire contracts** (`contracts.ts`, `enums.ts`) and the as-built realtime /
API client behaviour. These are the workflow rules the design must respect so the UI can't ask for
something the backend rejects, and so every async path has a designed outcome.

| # | Sev | Finding | Evidence | Proposed resolution |
|---|-----|---------|----------|--------------------|
| **E1** | **P0** | ✅ **RESOLVED (2026-07-02).** Both sender and recipient phones are now on the **required path** of the DT5 home (not hidden), both validated (≥6 digits) before Broadcast enables. When the ride is active, the **rider sees both numbers with a call button** on the job screen, and the **customer sees the rider's number** on tracking — matching `PHONE_REVEAL_STATUSES` (`assigned`→`completed`). Decision (founder, 2026-07-02): *phones required; rider can call either party for anything once the contract is active.* No contract change needed — the design now satisfies `Waypoint.contactPhone`. | `contracts.ts` (`Waypoint`); kit `app.js` home + job + tracking. | Done. Backend note: ensure `home.tsx` blocks submit on empty phones too (same rule) so the client can't send `contactPhone: ""`. |
| **E2** | ✅ | **DECIDED (2026-07-02).** `declaredValue` **defaults to 0** when blank for the pilot — intended (the cap policy is the guard, not a mandatory value). The "max 150" copy stays. Optional field lives in the expanded sheet. | `contracts.ts`. | Done — no change needed. |
| **E3** | ✅ | **RESOLVED (demonstrated).** `OfflineBanner` is mounted in the frame and driven by a demo Network chip (online / offline / reconnecting); async paths now have designed error outcomes — wrong-OTP + lockout (E5), select-race notice (E4), KYC failed state, board empty/error. | DESIGN-REVIEW §3b; `client.ts`. | Pattern established; wire every real request to a timeout + friendly error in the build. |
| **E4** | ✅ | **RESOLVED (2026-07-02).** Choosing the recommended rider simulates a race: a **muted** *"That rider was just taken — choose another."* (not error-red), the rider drops from the list, the retry assigns. | `order/[id].tsx` `selectM`. | Done. |
| **E5** | ✅ | **RESOLVED (2026-07-02).** OTP validates against the shared code; wrong → *"Wrong code — N tries left"*; **5 wrong → lockout** *"ask the customer to re-issue"*; the customer's tracking card has **Re-issue delivery code** (regenerates + clears the rider's lockout). | `job.tsx` (403); `order/[id].tsx` `rotateM`. | Done. |
| **E6** | ✅ | **RESOLVED (2026-07-02).** After **Send offer** the rider does NOT jump into a job: the order is **hidden from the board** (one round), a muted *"Offer sent — you'll be notified if the customer picks you"* shows, and a job only starts when the customer **selects** them (simulated as an *"A customer picked you!"* banner → Open job). Empty board → *"you're first in line"*. | `rider/index.tsx` (`bidIds`, `makeOffer`). | Done. |
| **E7** | ✅ | **RESOLVED (visibility).** The rider online card shows a **Reconnecting** pill + "reconnecting to the live board…" when the connection drops. Full cooldown-403 auto-offline flip stays device-gated. | `rider/index.tsx` heartbeat. | Done for the glanceable state; wire the real cooldown 403 in the build. |
| **E8** | ✅ | **DOCUMENTED.** No change needed — the kit board is already phone-free; the reveal rule (phone only `assigned`→`completed`) is now enforced in the kit (E1/E9). The `offers:changed` signal-only + `PublicWaypoint.strict()` redaction are backend guarantees captured here so future edits don't leak PII. | `contracts.ts` (WS_EVENTS, `PublicWaypoint`). | Design rule recorded; nothing to build. |
| **E9** | P1 | ✅ **RESOLVED with E1.** Counterparty phone now shows on **both** sides during the active window (rider sees sender + recipient; customer sees rider), each with a call affordance, and is absent outside tracking. | `enums.ts` (`PHONE_REVEAL_STATUSES`). | Done in the kit; hide again at `completed`+ in the real build. |
| **E10** | ✅ | **RESOLVED.** Added the **cancelled** terminal card (with the optional **reason**) and a customer cancel-with-reason flow during cancellable statuses. | `enums.ts`; `contracts.ts` (`CancelRequest`). | Done. |

---

## 3. Workflow coverage matrix (what still needs a designed state)

Per `docs/DESIGN.md`'s interaction-state matrix — ✅ present in the kit, ◐ partial, ⬜ missing.

| Feature | Loading | Empty | Error | Success | Partial (degraded) |
|---|---|---|---|---|---|
| Signup / OTP | ⬜ (no "sending…") | n/a | ⬜ (no send-failed) | ✅ | n/a |
| Broadcast / offers | ✅ skeleton | ◐ expired only (no *no-riders*) | ⬜ (no network/GPS-off) | ✅ | ⬜ (no reconnecting timer freeze) |
| Offer select | ⬜ per-row | n/a | ⬜ (no "rider just taken") | ✅ | n/a |
| Tracking (§5c) | ✅ (stepper skeleton exists) | n/a | ⬜ (no GPS-drop "paused") | ✅ | ⬜ ("Live paused") |
| Delivery OTP | ⬜ verify | n/a | ⬜ (no wrong-code / lockout) | ✅ | n/a |
| Go online | ⬜ | ◐ (offline state) | ⬜ (no cooldown 403) | ✅ | ⬜ (heartbeat retry) |
| Rider board | ✅ | ✅ (no-orders / not-verified) | ⬜ (no load error) | ✅ | ⬜ (stream-in) |
| KYC | ✅ | ✅ gate | ✅ failed | ✅ | ✅ pending poll (copy only) |

**Reading:** the **success** column is solid everywhere; **error** and **partial/degraded** columns
are the systematic gap. That's the workflow-thinking this pass is meant to force before build.

---

## 4. Recommended sequencing (if we proceed)

1. **Resolve E1 first (P0, cross-cutting):** decide required-vs-optional contact phones — it changes
   both the contract and the DT5 home layout. Everything else is additive.
2. **Design P1 batch:** D1 (90 s timer + urgency), D2 (real fare math), D3 (no-riders "Notify me"),
   D7 (item photo + note decision).
3. **Engineering P1 batch (state coverage):** E3 (bounded error paths on every async action), E4
   (select race), E5 (OTP lockout + re-issue), E6 (one-round board), E9 (bidirectional phone reveal).
4. **Fidelity / P2:** D4 (`rankOffers`), D5 (history/earnings/profile screens), D6 (reconnecting
   states), E7/E8/E10.
5. **Deferred-by-spec (document, don't build):** D8 notifications/support; cancel `reason`.

No changes made yet — awaiting your go-ahead on E1 and the D7 photo/note decision, since those shape
the layout everything else hangs off.
