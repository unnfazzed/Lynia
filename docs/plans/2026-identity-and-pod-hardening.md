# Identity-binding & proof-of-delivery hardening — execution plan

**Status:** L2 (customer trust tier) shipped as `IR16-09`; everything else is scoped-but-not-built.
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
- **L1 — soft device-id + per-device signup throttle.** *Next, code-only + an OTA-able mobile field.*
  Capture a stable per-install id (`expo-application`), store it per account, throttle account creation
  per device, and give ops a "many accounts on one device / one account hopping devices" signal. Not
  spoof-proof, but raises Sybil cost and surfaces rings. Touches the login path (`verifyOtp`) — keep
  conservative + well-tested.
- **L0 — recycle-aware rebind (closes P2-8).** On OTP re-verify of a long-dormant account from a **new**
  device, mint a fresh profile rather than handing the new SIM the old owner's history/PII (old profile
  retained but detached). Depends on L1's device-id. Worst case a returning legit user re-enters their
  name (recoverable via support).
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
2. **L1 soft device-id + throttle** and **POD Phase-A proof-of-drop capture** — the next conservative,
   code-first slice (each is independently shippable; POD-A needs a small mobile capture UI).
3. **L0 recycle rebind** — after L1 lands (depends on device-id).
4. **POD Phase-B adjudication** and **L3 hardware attestation** — gated on the product/vendor decisions above.
