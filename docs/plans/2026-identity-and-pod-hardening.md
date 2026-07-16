# Identity-binding & proof-of-delivery hardening — execution plan

**Status:** L2 (customer trust tier) shipped as `IR16-09`; L1 soft device-id + L0 recycle *detection*
shipped as `IR16-10`. Remaining: L0 destructive rebind (deferred), L3 attestation (gated), all POD work.
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

- **Phase A — proof-of-drop capture. Conservative, additive — build first.** On the rider's
  undelivered/dispute flow, capture optional evidence: a **drop photo + the rider's live GPS at that
  moment + timestamp**, stored on the order/issue (reuses the existing GCS + `itemPhotoUrl` plumbing;
  ~one column + an upload). Changes no completion logic — it just gives ops what they need to adjudicate,
  and it's useful on its own. Carries **no new abuse surface**.
- **Phase B — adjudicated resolution. The product decision.** A new **admin** issue-resolution action
  ("delivered — code bypass (adjudicated)") that force-completes a rider-raised disputed order, gated on
  the Phase-A evidence, with mandatory reason + full `AuditLog` + a customer notification and a
  dispute/reversal window. Guardrails: ops-only (never the rider); order must be in a rider-raised
  disputed state; and — at commission go-live — an explicit decision on whether an adjudicated delivery
  is commissionable.

### Open product decisions
- Adjudication bar: is photo + geofence enough for ops to force-complete, or require a customer callback?
- Default posture: ops-in-the-loop force-complete (Phase B) vs. a rider-favourable provisional-delivered
  state a customer can reverse? (For a low-volume pilot, ops-in-the-loop is safer and simpler.)
- Commission treatment of an adjudicated delivery at go-live; the customer reversal window length.

---

## Recommended sequencing

1. **L2 customer trust tier** — ✅ done (IR16-09).
2. **L1 soft device-id + throttle** and **L0 recycle detection** — ✅ done (IR16-10).
3. **POD Phase-A proof-of-drop capture** — next conservative slice (API + a small mobile capture UI + a column).
4. **POD Phase-B adjudication**, **L0 destructive rebind**, and **L3 hardware attestation** — gated on the
   product/vendor decisions above.
