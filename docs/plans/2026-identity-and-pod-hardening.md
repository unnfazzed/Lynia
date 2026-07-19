# Identity-binding & proof-of-delivery hardening — execution plan

**Status:** identity L2 (`IR16-09`), L1 + L0-detection (`IR16-10`), and POD Phase A + B (`IR16-11`/`IR16-12`,
`KB-POD-DISPUTE` CLOSED) shipped. Remaining: identity L0 destructive rebind (deferred) + L3 attestation (gated).
**Origin:** the two product-scope items triaged out of the 2026-07-16 interactive review —
`KB-IDENTITY-BINDING` (FRAUD P2-5/P2-8) and `KB-POD-DISPUTE` (FRAUD P2-6). See `docs/KNOWN_BUGS.md`.

This plan exists because both items are **layered** — the cheapest layers deliver most of the value,
and only the last layers need vendor/native work or product decisions. Ship in order; each layer is
independently useful.

---

## 1. Identity binding — phone-only identity → Sybil / ban-evasion

**Unbundle first.** Three sub-problems with very different cost/benefit:

| Sub-problem | State | Residual |
|---|---|---|
| **Rider** ban-evasion | Mitigated: KYC national-ID + `idNumberHash` dedup + `duplicateIdFlag` holds re-registrants | Low (only a genuinely different real ID — unsolvable by tech) |
| **Customer** Sybil (reputation/spam) | L2 weaponisation half DE-FANGED (IR16-09); identity-cost half open | Medium |
| **Phone recycling** (P2-8) | Unmitigated — recycled SIM inherits old account's PII/history | Medium (privacy/takeover) |

### Layers (cheapest → most expensive)

- **L2 — customer rating trust tier. ✅ DONE (IR16-09).** A customer's rating only moves a rider's
  public aggregate + reliability once the customer is *established* (`CUSTOMER_TRUST.minCompletedOrders`
  = 3 completed orders). Below that, the rating is recorded but zero-weight in **both** directions
  (kills up-farm AND the mirror Sybil-downvote). Pure `packages/shared` policy + a gate in
  `OrderLifecycleService.rate()`. Combined with the P1-6 per-pair cap, farming a rider's reputation now
  needs many DISTINCT **and** established customers — each sock-puppet must first complete real
  deliveries, which is the friction that makes it uneconomic.
- **L1 — soft device-id + per-device signup throttle. ✅ DONE (IR16-10).** The mobile client sends a
  stable per-install `x-device-id` (keychain-persisted UUID); `verifyOtp` throttles NEW-account creation
  per device (`RL.deviceSignup` = 3/day) and stamps `Session.deviceId` (migration `0033`). Not
  spoof-proof (reinstall resets the id) but raises Sybil cost and records the device↔account history.
- **L0 — recycle handling.** *Detection ✅ DONE (IR16-10); destructive rebind DEFERRED.* An existing
  account verifying from a never-seen device after >90d dormancy logs a `POSSIBLE SIM RECYCLE (P2-8)`
  signal. The **destructive** rebind (mint a fresh profile so a recycled SIM can't inherit the old
  owner's PII/history) is deliberately deferred: auto-detaching on a device change would lock out a legit
  user who reinstalled or changed phones. Needs a product decision on the false-positive/lockout
  trade-off (e.g. a step-up re-confirmation rather than a silent detach).
- **L3 — hardware attestation. Founder/vendor-gated.** Play Integrity (Android) / App Attest (iOS) —
  the real anti-Sybil control. Needs a native config plugin (**not OTA**), Google/Apple vendor setup,
  and server-side attestation verification. Defer until L0–L2 data shows it's warranted.

### Open product decisions
- Is customer Sybil an *actual* pilot problem yet, or theoretical? (Drives whether L1/L0 are needed pre-launch.)
- Trust-tier threshold (currently 3 completed orders) — a trust-and-safety call; tune from real data.
- Appetite for native/vendor work (L3) during the pilot vs. staying OTA-friendly.

---

## 2. Proof-of-delivery dispute — recipient takes goods, withholds the code

**The trap:** delivery is proven ONLY by the recipient's OTP, so a dishonest recipient strands the rider
(`undelivered`, penalty-free, no positive resolution). **But the mirror risk is real** — a dishonest
*rider* could claim "delivered, code withheld" to get paid — so any force-complete must be
**adjudicated, not self-served.**

### Phases

- **Phase A — proof-of-drop capture. ✅ DONE (IR16-11).** The rider attaches an optional **drop photo +
  live GPS + server timestamp** on the undelivered flow (`Order.deliveryProof{Key,Lat,Lng,At}`, migration
  `0034`; party-gated, window `en_route_dropoff`/`undelivered`, namespaced key, idempotent; mirrors the
  pickup-photo flow). The admin order-detail surfaces it (read URL + GPS + time) as adjudication evidence.
  Changes no completion logic; no new abuse surface.
- **Phase B — adjudicated resolution. ✅ DONE (IR16-12).** `POST /admin/orders/:id/adjudicate-delivered`
  (ops-only, reason-coded) force-completes a rider-raised `undelivered` order under a `$transaction` with a
  **CAS** guard against a double-adjudicate race. It credits the rider a clean trip (`tripsCount++`),
  recovers reliability (`FOR UPDATE` on the rider row), charges commission (no-op at the 0% launch rate),
  writes an `OrderEvent` + a reserved-action `AuditLog` row (`order.adjudicate_delivered`), and post-commit
  notifies the customer (via the existing issue-raise flow, which has no time-bound window — see UX19-02,
  `docs/KNOWN_BUGS.md`) and the rider. The admin
  order-detail renders the "Mark delivered (code bypass)…" control on an `undelivered` order with a rider,
  directly below the Phase-A evidence panel.

### Product decisions taken (Phase B)
- **Adjudication bar:** ops discretion over the Phase-A evidence (reason radio includes photo+GPS,
  follow-up-call confirmation, and technical code-entry failure); no forced customer callback for the pilot.
- **Default posture:** ops-in-the-loop force-complete (safer and simpler for a low-volume pilot) — not a
  rider-favourable auto-provisional state.
- **Commission:** an adjudicated delivery IS commissionable (charged in-tx; no-op at the 0% launch rate).
- **Customer reversal window:** no fixed deadline — the customer can report a problem via the existing
  issue-raise flow at any time (`IssuesService.raise` has no elapsed-time gating; the earlier 48-hour figure
  in the customer notification was fabricated copy, corrected by UX19-02).

---

## Recommended sequencing

1. **L2 customer trust tier** — ✅ done (IR16-09).
2. **L1 soft device-id + throttle** and **L0 recycle detection** — ✅ done (IR16-10).
3. **POD Phase-A proof-of-drop capture** — ✅ done (IR16-11).
4. **POD Phase-B adjudication** — ✅ done (IR16-12); closes `KB-POD-DISPUTE`.
5. **L0 destructive rebind** and **L3 hardware attestation** — gated on the product/vendor decisions above.
