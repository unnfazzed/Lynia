# Payment rails — what is wired, and what is still outstanding

**Status: 2026-08-13.** The rider top-up screen is now a **real client** of the wallet API. The
customer food-checkout prompt screens are **not built**, deliberately. This document is the inventory
of what is still missing underneath.

> **One sentence, if you read nothing else:** LyniaGo still has **no payment-rail integration**. The
> app side of top-up is complete and correct; the server side cannot yet confirm anything, so every
> real attempt today ends in `expired`. Nothing pretends otherwise.

---

## 1. What is wired

### 1.1 Rider top-up — real, end to end on the app side

`app/wallet/top-up.tsx` → `src/ui/rider/TopUpFlow.tsx` is a genuine client:

| Step | What actually happens |
|---|---|
| Amount / rail / phone | `POST /wallet/topups` with a per-attempt `idempotencyKey` (BH-09: a timeout+retry replays the key and the server returns the *same* pending intent) |
| Wait | polls `GET /wallet/topups/:id` every 2.5s while `pending`, countdown driven by the server's own `expiresAt` |
| Success | rendered **only** on a server-reported `succeeded`; invalidates the balance and ledger queries |
| Declined / timed out | rendered on `declined` / `expired`, each labelled for what it is |
| App killed mid-wait | a durable `PendingTopup` marker is written at creation; the Money tab reconciles it on next open (`reconcilePendingTopup`) and clears it |

**The outcome is the server's to decide, never the client's.** That is the invariant pinned by
`src/ui/rider/__tests__/top-up-flow.test.tsx`, and it is what makes this shippable while the rail is
missing: no sequence of taps produces a success the server did not report.

### 1.2 Customer food checkout — the manual rail, which genuinely works

Dial the USSD → submit the transaction reference (`POST orders/:orderId/payment-reference`) → the
merchant matches it against their own statement. This path is complete and needs nothing.

---

## 2. Outstanding — the plumbing

### 2.1 There is no rail client (this is the whole job)

`apps/api/src/adapters/payments/` contains an interface and an inert stub. Nothing consumes them.

- [ ] **A live EcoCash client** implementing `PaymentRail` (`initiate` / `confirm`), with the per-call
      timeout the contract documents (`PAYMENT_RAIL_DEFAULT_TIMEOUT_MS`) actually enforced — the stub
      does not enforce it.
- [ ] **Raw vendor-payload retention** alongside the mapped `PaymentRailResult`, per the seam's own
      requirement: mapped fields move money, the raw payload is the audit trail.
- [ ] **A circuit breaker / kill-switch on live rail calls** — explicitly out of scope of the seam,
      deferred to the live client under the 3.1 flag pattern.
- [ ] InnBucks and O'mari clients, or a decision that they stay manual-only at launch. The contract's
      own doc calls `manual` *"the launch rail for InnBucks/O'mari and the fallback for EcoCash"*.

### 2.2 Nothing can confirm a top-up — so everything expires

- [ ] **`WalletService.creditFromTopup` still has zero production callers.** It is the only code path
      that can transition a `TopUp` and credit a balance. It is fully implemented and fault-tested
      (`wallet-topup-faults.spec.ts` covers duplicate delivery, mid-credit process death, CAS races) —
      it is simply never invoked.
- [ ] **Nothing pushes a prompt to the rider's phone.** `POST /wallet/topups` opens the intent and
      that is all; no USSD/app prompt is sent by anything.

**What this means for a rider today:** they fill in the form, get "Check your phone", no prompt ever
arrives, the 90-second window runs down, and they see *"The request timed out"*. That is the honest
rendering of the real system state — it is not a defect in the screen. `DOC-16-02` (the original
version of this dead end) is still closed, because the difference is everything that surrounds it: the
outcome is truthful, the intent is idempotent, the marker is recoverable, and the support-call route
that **does** credit a balance is on the screen throughout.

**Wiring a poller or webhook that calls `creditFromTopup` is the single change that makes the rider
top-up screen work.** No app change is required for it — `succeeded` is already handled.

### 2.3 Food checkout has no prompt path, and no endpoint to be a client of

- [ ] **No prompt-send endpoint and no decline callback exist.** `food-order.controller.ts` exposes
      `POST orders/:orderId/payment-reference` and nothing that could ask a rail for money.
- [ ] The kit's `R5·4` ("check your phone") and `R5·b2` ("declined") are therefore **not built**. They
      briefly shipped as a mock behind a fake button; that was removed on 2026-08-13 when the top-up
      lane was wired for real. The asymmetry is deliberate: top-up has a complete server API waiting on
      a rail, so it could be wired honestly; this lane has no API at all, and wiring it would have
      meant inventing the contract for a rail nobody has built — a guess needing a rewrite the day a
      real one lands. They are recoverable from git history at the commit that removed them.
- [ ] When a prompt-send endpoint exists, build it **server-first**, then rebuild those two screens
      against it — same shape as the top-up lane.

### 2.4 The only real money-in path today

- [ ] Admin manual credit — `POST /admin/riders/:id/wallet-credit` → `WalletService.creditManual`,
      driven from the admin Riders UI, capped by `WALLET_MANUAL_CREDIT_CAP_USD` ($50). Riders reach it
      by calling support. This is what the "TOP UP BY PHONE" card on the amount step routes to, and it
      must stay on that screen until a rail lands.

---

## 3. Outstanding — deployment and operations

- [ ] **Nothing auto-ships.** Merging reaches no device. This needs a `mobile-release.yml` dispatch
      with `profile: preview` (the workflow default is `production`, which builds fine and then fails
      at submission — see `CLAUDE.md` and `docs/PLAY-STORE-SUBMISSION.md`).
- [ ] **The change is JS-only**, so it is OTA-able onto any binary whose fingerprint runtimeVersion
      matches. No native surface changed.
- [ ] **There is no longer a kill switch on this.** `PAYMENT_SIMULATION_ENABLED` and
      `GET /app/preview-flags` were removed on 2026-08-13 (owner instruction: *"i dont want the flag or
      money control"*). Retracting the top-up screen now needs a code change and a build/OTA, not a
      config flip. That is an accepted trade: what shipped is a truthful client rather than a mock, so
      the thing the switch existed to retract no longer exists.
- [ ] **Rate limiting is already in place** on the create path (`@Throttle 10/hour`, keyed `topup`), so
      a rider retrying against a rail that never answers cannot spin up unbounded intents.

## 4. Outstanding — design parity

- `RJ.topup_amount` is wired to `app/wallet/top-up.tsx` in `tools/parity/app-targets.mjs`.
- `RJ.topup_wait`, `RJ.topup_success`, `RJ.topup_declined` remain **`PENDING`** in
  `tools/parity/parity-status.mjs` — all three are now built and server-driven, but not yet wired to
  parity app targets, so no screenshot-lane evidence is produced for them. Wiring them is a follow-up.
- There is **no mock for the `expired` terminal**; it reuses the declined screen's structure with
  timeout copy. If the kit gains one, align to it.
- The rail rows carry a **neutral wallet mark, not rail logos**. The kit draws each rail's own brand;
  no rail brand assets ship in the app, and inventing lookalikes was rejected. Real logos need a
  licensing decision before the rail goes live.

## 5. Known gaps in the wired flow

- **The phone field starts empty.** The contract intends it pre-filled with the rider's registered
  line ("editable"); there is no profile hook exposing that phone to this screen yet.
- **Polling, not push.** The wait state polls every 2.5s. A rail that can call back would be better
  served by a push/socket nudge, but polling is correct and cheap for a 90-second window.
- **Leaving the wait screen is safe but silent.** The intent stays open and the Money tab reconciles
  it, which the copy says — but there is no push notification when a top-up confirms while the rider is
  elsewhere in the app.

---

## Related

- `docs/KNOWN_BUGS.md` → `DOC-16-02` (the original always-expires flow, and why this is not a return to it)
- `docs/plans/2026-rider-wallet-design.md` — the wallet design brief
- `apps/api/src/adapters/payments/payment-rail.interface.ts` — the seam, and its scope guardrails
- `docs/PLAY-STORE-SUBMISSION.md` — build/submit mechanics and the current internal-testing phase
