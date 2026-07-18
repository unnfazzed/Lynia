# Deep sweep 2026-07-18 (deep-sweep routine)

Fresh session, `main` at `3cee370`. Model split per routine spec: Fable-5 (`claude-fable-5`) ran all of
Phase 0/0.5, Phase 1 (via `Workflow({name:'lane-bug-hunt'}, args:'deep-sweep')`), Phase 1.5, and Phase 3;
Opus (`claude-opus-4-8`) ran all Phase 2 fix implementation.

## Phase 0 — inherit history

`docs/KNOWN_BUGS.md` read in full. `mcp__github__list_pull_requests` (state=open, this repo) returned
**zero** open PRs — no `claude/*` sibling work to inherit; nothing to dedupe against beyond the ledger
itself.

## Phase 0.5 — cluster-claim re-verification

Rotated to three headers not re-checked by the last few runs (07-17 deep-sweep checked Auth/identity,
Data-integrity, Money-fraud; 07-17 night bug-hunt checked Notifications/FCM, Edge/abuse, Mobile-journey
dead-ends; 07-16/07-17 WD-audit checked KYC and Object-authz/IDOR two days ago):

- **Phase 0 spot-check (6 findings):** WD-021, WD-023, DS17-01, DS17-02, BH-15, UX18-05 — all 6 **INTACT**,
  each verified against the live file:line (e.g. WD-021's post-CAS fare re-read at
  `admin-orders.service.ts:244`, DS17-02's `evictRiderFromSupply` calls in `order-lifecycle.service.ts:779`
  and `issues.service.ts:300`, BH-15's `bootDestination`/`needsProfile` gate in `boot-route.ts:20` +
  `index.tsx:38`).
- **KYC cluster** (5 members: unsigned-webhook fail-closed, unique `kyc_ref` CAS, monotonic
  `kyc_resolved_at` guard, vendor-outage 503 mapping, F-13 retry cap) — all **INTACT**.
- **Object-authz / IDOR cluster** (5 members: self-dealing wash-trade guard, banned-rider standing gate,
  offer TOCTOU `FOR UPDATE`, `listForOrder` ownership gate, `getSnapshot` party gate) — all **INTACT**.
- **Edge/abuse cluster** (7 members: global `ThrottleGuard`, global exception filter, security-header
  middleware, CORS allow-list, Socket.IO CORS, 1MB body cap, outbound fetch timeouts) — all **INTACT**.

**17/17 cluster members + 6/6 spot-checked fixes confirmed present and wired. 0 stale claims, 0 regressions.**

## Phase 1 — orthogonal sweep (`Workflow({name:'lane-bug-hunt'}, args:'deep-sweep')`)

5 finder lenses (tx-rollback, concurrency-idempotency, authz-idor, timer-expiry, adversarial-api) → 2
candidates found (3 of 5 lenses returned zero) → both survived a 3-skeptic adversarial panel (6/6 "real"
votes, one dissent on severity only) → sibling-sweep per survivor. Findings **DS18-04** and **DS18-05**
below.

## Phase 1.5 — cross-lane seams pass (deep-sweep-owned)

**Seam picked:** PII across representations (rotated from 07-17's "single DB column with two writers").
Traced `apps/api/src/privacy/pii-manifest.ts` against `apps/api/prisma/schema.prisma` and every
writer/reader of each personal-data field, including JSON-embedded siblings and GCS-object siblings a bare
column scan misses. Findings **DS18-01**, **DS18-02**, **DS18-03** below — the manifest's own coverage test
matches by bare column name, which is itself what let `orders.note`'s entry falsely "cover" `reports.note`
(and the two legitimately-retained `audit_logs.note`/`commission_ledger.note`).

## Phase 3 — adversarial API pass

Acted as an authenticated attacker with raw API access (curl, no client-side validation) across
issues/reports/sos/notifications/uploads/wallet/privacy/health — the areas that get less repeat scrutiny
than orders/offers/admin. Every ownership check, money-input bound, webhook signature, and standing gate
held. **Zero new gaps** — every candidate traced back to an existing, correctly-wired control already in
`docs/KNOWN_BUGS.md`.

## Findings — this sweep

| ID | Description | Area | Sev | Confidence | Why past sweeps missed it |
|---|---|---|---|---|---|
| DS18-01 | `orders.pickupPhotoKey` (the rider-captured proof-of-pickup photo, both a DB pointer and a GCS object under `pickup/<riderId>/…`) was entirely absent from `pii-manifest.ts` and never touched by `eraseAccount` — a rider's captured photo of a customer's parcel (same address-label-bearing class as `itemPhotoUrl`/`deliveryProofKey`, both already scrubbed) survived a rider's own account erasure forever, and `orders.service.ts getSnapshot` kept minting fresh signed read URLs for it to the surviving counterparty indefinitely. | `apps/api/src/privacy/privacy.service.ts`, `apps/api/src/privacy/pii-manifest.ts`, `apps/api/src/orders/order-lifecycle.service.ts` (`attachPickupPhoto`) | HIGH | High | It's the DS15-03 fix's exact failure mode (DB pointer nulled but GCS object never deleted), but on a column named `pickup_photo_key` — the coverage-scan regex only matched `_url$`-suffixed photo columns, so a `_key`-suffixed sibling silently dodged the same guard DS15-03 built specifically to catch this class. Every prior sweep's photo/PII pass checked `photoUrl`/`itemPhotoUrl`/`deliveryProofKey` by name; none re-derived the pattern and grepped for every media reference. |
| DS18-02 | Four user-authored free-text PII columns — `ratings.comment`, `issues.description`, `orders.cancelReason`, `reports.note` — were unscrubbed on the author's erasure (the same dialable/address-PII class DS15-07 already fixed for `orders.note`). Worse, the manifest's own coverage-guard test matched by **bare column name**, so the `orders.note` entry was silently "covering" `reports.note` (a different table, same name) as well as the two legitimately-retained ops-authored siblings `audit_logs.note`/`commission_ledger.note` — a false-positive in the write-time guard that exists specifically to prevent this class of silent omission. | `apps/api/src/privacy/privacy.service.ts`, `apps/api/src/privacy/pii-manifest.ts`, `apps/api/src/privacy/pii-manifest.spec.ts` | MEDIUM | High | DS15-07 fixed the one instance found at the time (`orders.note`) but the sibling-sweep then didn't have the table-qualification concept — a bare-name coverage guard reads as "done" for any same-named column, so three siblings of the identical author-free-text pattern (plus a false-positive test) sat invisible to every later pass that trusted the manifest's own "covered" claim instead of re-deriving it from the schema. |
| DS18-03 | `attachPickupPhoto`/`attachDeliveryProof` (`order-lifecycle.service.ts`) allow a retake that overwrites the DB pointer without deleting the *previous* GCS object — so a replaced pickup/delivery-proof photo becomes permanently unreachable by the DS15-03 erasure purge (no DB pointer left pointing at it), a residual leak that survives even a correctly-executed erasure of the current photo. | `apps/api/src/orders/order-lifecycle.service.ts` | LOW-MEDIUM | Medium | DS15-03's purge logic is correct for what it can see (current pointers); this is an upstream gap in the *write* path (no delete-on-replace), a different code location than the erasure path every prior PII sweep concentrated on. Confirmed rider `photoUrl` (KYC selfie/ID) is NOT a sibling — `becomeRider` writes it exactly once via `rider.create` (primary-key-guarded against re-creation) and `retryKyc` never touches it, so no retake path exists there. |
| DS18-04 | `applyKycResult`'s automated-webhook `expired` handler reads `kycAttempts` via a plain unlocked `findFirst` (no `FOR UPDATE`) and bakes that value into a later CAS `updateMany`'s `data` payload — the CAS `WHERE` only re-verifies `kycRef`/`kycResolvedAt` monotonicity, never `kycAttempts` itself, reopening the exact DS17-03 race (a concurrent admin second-decline committing the two-decline lock in the gap between this read and this transaction's write gets silently undone by a later-timestamped `expired` webhook). The identical unlocked-read-then-blind-write shape exists in `privacy.service.ts eraseAccount`: a `findUnique` standing check feeds a JS throw/allow decision, but the scrub writes that follow carried no CAS re-assertion of that same standing — a concurrent ban/suspend/hold/KYC-lock landing in the gap was neither blocked nor detected. | `apps/api/src/riders/rider.service.ts` (`applyKycResult`), `apps/api/src/privacy/privacy.service.ts` (`eraseAccount`) | MEDIUM | High | DS17-03 (07-17) closed the *replay/reorder* half of this race (monotonic `kycResolvedAt`) but not the *concurrent-decline* half — the fix added a second reader (`kycAttempts`) to the same function without giving it the same row-lock treatment `adminSetKyc` already uses one function away in the same file. The `eraseAccount` sibling is the identical shape one module over; DS15-02's own report language ("TOCTOU-safe... re-asserted inside the transaction") described the *intent* without the code actually doing a write-time CAS, and no later spot-check re-derived the claim from the SQL rather than the comment until this run's Phase 0.5. |
| DS18-05 | `GET /wallet/topups/:id` was the sole `:id`-style route in the entire API missing `ParseUUIDPipe` — every one of the other 36 `@Param(` sites across all controllers has it. `TopUp.id` is a Postgres `@db.Uuid` column; a non-UUID path value throws an unhandled `PrismaClientKnownRequestError` (22P02) that `AllExceptionsFilter` coerces into a generic 500 instead of a clean 400, and the existing unit tests mock Prisma with fake string ids (`"t1"`) so the real `::uuid` cast was never exercised. | `apps/api/src/wallet/wallet.controller.ts` | MEDIUM (robustness/log-noise, no data risk) | High | The wallet module is one of the more recently-added surfaces (post-launch prepaid-wallet build) and got its own dedicated WD-lane scrutiny for money-correctness, but this specific "does every `:id` sibling carry the same pipe" cross-controller consistency check hadn't been run as its own lens before — Phase 1's adversarial-api finder lens diffed every controller's `@Param(` decorators against each other rather than reasoning about wallet in isolation. |

**Stopping rule:** 1 HIGH + 3 MEDIUM + 1 LOW-MEDIUM this run — does not qualify for the stopping rule (zero
new CRITICAL/HIGH). Reported and fixed in full.

## Sibling-sweep

**DS18-01 (media/GCS object-key columns):** `grep -niE "photo|proof|image" apps/api/prisma/schema.prisma`
+ a `_key$` audit — 5 real object-reference hits: `profiles.photo_url`, `riders.photo_url`,
`orders.item_photo_url`, `orders.delivery_proof_key` (all three already handled pre-sweep),
`orders.pickup_photo_key` (**fixed this run**). Non-media `_key` columns (`idem_key`, `idempotency_key`×2)
correctly excluded by the broadened `(photo|proof|image)` pattern (was `_url$`-only).

**DS18-02 (free-text PII columns):** `grep -nE "^\s+\w+\s+String" apps/api/prisma/schema.prisma` filtered
for user-authored text — 13 raw hits. Disposition: `orders.note` already fixed (DS15-07); `ratings.comment`,
`issues.description`, `reports.note`, `orders.cancelReason` — **fixed this run**; `commission_ledger.note`,
`audit_logs.note`, `issues.resolutionNote` — ops/system-authored, added to `NON_PII_COLUMNS` with rationale
(mirrors the existing `resolution_note` disposition); `settlements.method` — a payment-channel identifier,
not free text, out of scope; `orders.size` — a parcel-size field, not PII; `addresses.label`,
`sessions.userAgent` — already covered (whole-row `deleteMany` on erasure); `profiles.idNumber`,
`riders.vehicleInfo` — already in the manifest.

**DS18-03 (retake/overwrite orphan paths):**
`grep -rnE "(pickupPhotoKey|deliveryProofKey|itemPhotoUrl|photoUrl):" apps/api/src --include=*.ts | grep -v spec`
— hits reviewed: `order-lifecycle.attachPickupPhoto`/`attachDeliveryProof` — **fixed this run** (delete
superseded GCS object on retake); `order-lifecycle.cloneForRebroadcast` (`itemPhotoUrl: src.itemPhotoUrl`)
— copies a pointer to a same-customer clone, both nulled/deleted under the same customerId scope, not an
orphan; `admin-orders.service.ts` (`createReadUrl` mint) — a read, not a write; `auth.service.ts` — response
DTO, not a write; `rider.service.ts becomeRider` (`photoUrl: data.photoUrl`) — **checked, confirmed NOT a
sibling**: written exactly once via `rider.create` (profileId-primary-key-guarded against re-creation,
DS13-06), and `retryKyc` never re-supplies a photo, so no retake path exists on this field.

**DS18-04 (unlocked-read-feeds-later-write class):**
`grep -n "findFirst\|findUnique\|\$executeRaw\|updateMany\|\.update(" apps/api/src/riders/rider.service.ts`
— every read→write pair in the file reviewed: `applyKycResult` — **fixed this run** (added `FOR UPDATE` row
lock before the `current` read, mirroring `adminSetKyc`'s existing lock); `retryKyc` — already-fine (its
`updateMany` WHERE re-asserts the exact read values as a CAS); `completeProfile` — already-fine (CAS
re-asserts the ID freeze in its WHERE); `setOnline` — already-fine (`$executeRaw` CAS with affected-row
count); `becomeRider` — already-fine (unique-constraint-guarded); `adminSetKyc` — already-fine (the pattern
copied). The `privacy.service.ts eraseAccount` sibling — **fixed this run** (both the profile-anonymise and
rider-scrub writes converted to CAS `updateMany`s re-asserting the standing predicate, 409 on 0 rows).

**DS18-05 (missing `ParseUUIDPipe`):** `grep -rn "@Param(" --include="*.controller.ts" apps/api/src` — 37
raw hits, 36 already carried `ParseUUIDPipe`; `wallet.controller.ts:47` was the sole omission — **fixed this
run**.

## Fixes (Opus)

All 5 findings fixed this run, each with a regression test:

- **DS18-01** — `pickup_photo_key` added to `PII_MANIFEST` (rider-scoped, `null` + GCS delete, matching
  `delivery_proof_key`); `eraseAccount`'s rider-proof block extended to also null `pickupPhotoKey` and queue
  its GCS object for post-commit deletion. Coverage-scan pattern widened from `_url$`-only to
  `(photo|proof|image)` so a `_key`-suffixed media column can't dodge the guard again. Test in
  `privacy.service.spec.ts`.
- **DS18-02** — `PiiEntry` gained a `tables: readonly string[]` field; coverage is now checked per
  `table.column` pair (not bare column name) via a new `manifestPairs()`/table-qualified `schemaColumns()`,
  closing the false-positive class permanently, not just for this instance. `ratings.comment`,
  `issues.description`, `orders.cancelReason`, `reports.note` scrubbed in `eraseAccount` on the author's
  erasure (rating score, issue row, and order row all retained — only the free text is cleared).
  `audit_logs.note`/`commission_ledger.note` recorded as `NON_PII` with rationale. 5 new tests across
  `privacy.service.spec.ts` + a manifest-coverage regression in `pii-manifest.spec.ts`.
- **DS18-03** — `order-lifecycle.service.ts` now deletes the previous GCS object (best-effort, non-blocking)
  whenever `attachPickupPhoto`/`attachDeliveryProof` overwrite an existing key with a different one. Tests
  in `order-lifecycle.service.spec.ts` for both functions.
- **DS18-04** — `applyKycResult` takes a `SELECT ... FOR UPDATE` row lock (by `kycRef`) before its `current`
  read, serializing against `adminSetKyc`'s existing lock on the same row. `eraseAccount`'s profile-anonymise
  and rider-scrub writes converted to CAS `updateMany`s re-asserting `onHold`/`accountStatus`/`kycAttempts`/
  `cooldownUntil` in the `WHERE`, throwing a structured 409 (`account_on_hold` / `standing_changed`) on a
  0-row match instead of silently proceeding. Tests in `rider.service.spec.ts` (call-order assertion) and
  `privacy.service.spec.ts` (simulated race → 409).
- **DS18-05** — `ParseUUIDPipe` added to `wallet.controller.ts`'s `topup` route, matching every sibling.
  New `wallet.controller.spec.ts` (didn't exist before) boots a real Nest app via the existing
  `buildAuthzApp` e2e harness and asserts a malformed id now 400s (was 500) with the service never called.

`pnpm typecheck` (5 packages) + `pnpm test` (1041 API tests + 426 mobile tests) + `pnpm --filter @lynia/api
build` all green, zero regressions.
