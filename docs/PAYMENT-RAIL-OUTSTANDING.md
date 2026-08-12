# Payment rails — what shipped, and what is still outstanding

**Status: 2026-08-12.** The two mobile-money **previews** now ship to real users behind a server kill
switch (owner instruction: *"deploy food payment rail simulation and top up simulation to the final
EXPO … we are shipping as much as we can ahead of launch"*). This document is the honest inventory of
what those previews are not.

> **One sentence, if you read nothing else:** LyniaGo still has **no payment-rail integration of any
> kind**. Nothing in this change moves money, and no screen it ships claims to. What shipped is the
> *drawing* of a flow whose plumbing does not exist.

---

## 1. What actually shipped

| Flow | Screens | Entry | Reachable when |
|---|---|---|---|
| Rider top-up | `RJ.topup_amount` → `topup_wait` → `topup_success` / `topup_declined` | Money tab → **Top up** | preview gate open |
| Food checkout | `R5·4` prompt wait → `R5·b2` declined | Checkout → *"Preview: paying by prompt (not connected yet)"*, below the real reference form | preview gate open |

The gate is `usePaymentSimulation()` — `isTestBuild()` **OR** the `paymentSimulationEnabled` server
flag (`GET /app/preview-flags`, env `PAYMENT_SIMULATION_ENABLED`, **default `true`**).

**Properties that hold in every build and every flag state** — these are what make the previews
shippable, and each is pinned by a test in `apps/mobile/src/ui/__tests__/payment-simulation.test.tsx`:

- no network call, no `TopUp` row, no `PendingTopup` marker, no ledger write, nothing persisted;
- a **PREVIEW** notice above the hero of every simulated screen, **unconditionally** — the warnings no
  longer sit behind `isTestBuild()`, so there is no state in which a fabricated screen renders without
  its warning. *The gate is on the door, not on the sign;*
- **no simulated success on the food lane at all**, and the top-up "approved" step is phrased in the
  conditional ("would have been added — simulated") next to the rider's real, unchanged balance;
- nothing auto-resolves — every terminal requires an explicit tap;
- the top-up preview **keeps the real support-call action** on its amount step, because that is still
  the only way a balance actually moves.

---

## 2. Outstanding — the plumbing

### 2.1 There is no rail client (this is the whole job)

`apps/api/src/adapters/payments/` contains an interface and an inert stub. Nothing consumes them.

- [ ] **A live EcoCash client** implementing `PaymentRail` (`initiate` / `confirm`), with the
      per-call timeout the contract documents (`PAYMENT_RAIL_DEFAULT_TIMEOUT_MS`) actually enforced —
      the stub does not enforce it.
- [ ] **Raw vendor-payload retention** alongside the mapped `PaymentRailResult`, per the seam's own
      requirement: mapped fields move money, the raw payload is the audit trail.
- [ ] **A circuit breaker / kill-switch on live rail calls** — explicitly out of scope of the seam,
      deferred to the live client under the 3.1 flag pattern.
- [ ] InnBucks and O'mari clients, or a decision that they stay manual-only at launch. The contract's
      own doc calls `manual` *"the launch rail for InnBucks/O'mari and the fallback for EcoCash"*.

### 2.2 Nothing can confirm a top-up

- [ ] **`WalletService.creditFromTopup` still has zero production callers.** It is the only code path
      that can transition a `TopUp` and credit a balance. It is fully implemented and fault-tested
      (`wallet-topup-faults.spec.ts` covers duplicate delivery, mid-credit process death, CAS races) —
      it is simply never invoked. Wiring a poller or webhook to call it is the single change that turns
      the top-up preview into the real screen.
- [ ] **`POST /wallet/topups` creates intents that can only ever expire.** It writes a `pending` row
      with a 90s window and no one sends a prompt. The preview deliberately does **not** call it. Until
      a rail confirms, this endpoint should be considered unusable by clients.

### 2.3 Food checkout has no prompt path

- [ ] **No prompt-send endpoint** and **no decline callback** exist. The real, working customer path is
      unchanged and stays: dial the USSD → submit the transaction reference → the merchant matches it
      against their own statement.
- [ ] There is deliberately **no success preview** on this lane, and there must not be one until a rail
      can produce a real success.

### 2.4 The only real money-in path today

- [ ] Admin manual credit — `POST /admin/riders/:id/wallet-credit` → `WalletService.creditManual`,
      driven from the admin Riders UI, capped by `WALLET_MANUAL_CREDIT_CAP_USD` ($50). Riders reach it
      by calling support. This is what the top-up preview's "TO TOP UP FOR REAL" card routes to, and it
      must stay on that screen until a rail lands.

---

## 3. Outstanding — deployment and operations

- [ ] **Order of operations matters.** The flag fails **safe-off**: if the mobile build reaches devices
      before the API serving `GET /app/preview-flags` is deployed, the endpoint 404s and both previews
      stay hidden. **Deploy the API first**, then cut the mobile build. (The QA APK is unaffected —
      `isTestBuild()` opens the gate without any server.)
- [ ] **Set `PAYMENT_SIMULATION_ENABLED` explicitly in the Cloud Run env** rather than relying on the
      `true` default, so retracting it is a visible one-word edit to a value that is already there.
- [ ] **Nothing auto-ships.** Merging reaches no device. This needs a `mobile-release.yml` dispatch with
      `profile: preview` (the workflow default is `production`, which builds fine and then fails at
      submission — see `CLAUDE.md` and `docs/PLAY-STORE-SUBMISSION.md`).
- [ ] **The previews are JS-only**, so they are OTA-able onto any binary whose fingerprint
      runtimeVersion matches. No native surface changed in this work.

### Retracting the previews

Set `PAYMENT_SIMULATION_ENABLED=false` and redeploy the API. Within ~60 seconds (the endpoint's
`max-age`) plus one cold start, every install falls back to the honest screens — call-support for
top-up, manual reference-entry for checkout. No app update, no store review. That is the entire reason
the flag exists; a preview that starts confusing real users at launch must be retractable in a minute.

---

## 4. Outstanding — design parity

- `RJ.topup_amount` is wired to `app/wallet/top-up.tsx` in `tools/parity/app-targets.mjs`.
- `RJ.topup_wait`, `RJ.topup_success`, `RJ.topup_declined` remain **`PENDING`** in
  `tools/parity/parity-status.mjs` — they are built and now shippable, but not yet wired to parity app
  targets, so no screenshot-lane evidence is produced for them. Wiring them is a follow-up.
- The rail rows carry a **neutral wallet mark, not rail logos**. The kit draws each rail's own brand;
  no rail brand assets ship in the app, and inventing lookalikes was rejected. Real logos need a
  licensing decision before the rail goes live.

## 5. Known cleanup

- `SimulatedPathNotice` (food) and `TopUpSimulator`'s `SimulatedStrip` are near-duplicates that differ
  only in their second sentence — the checkout one points at the manual rail below, the top-up one
  points at support. Fold into one component with a `detail` slot.
- **Delete both previews the day a rail lands.** The top-up screens are the kit's layout, so the real
  screen is the preview minus the strips, plus `createTopup` / `getTopup`. Deleting them is the
  definition of done for wallet PR2, not an optional tidy-up.

---

## Related

- `docs/KNOWN_BUGS.md` → `DOC-16-02` (the broken self-serve flow this replaced)
- `docs/plans/2026-rider-wallet-design.md` — the wallet design brief
- `apps/api/src/adapters/payments/payment-rail.interface.ts` — the seam, and its scope guardrails
- `docs/PLAY-STORE-SUBMISSION.md` — build/submit mechanics and the current internal-testing phase
