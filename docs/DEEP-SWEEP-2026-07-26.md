# Deep sweep 2026-07-26 (deep-sweep routine)

Fresh session, branch `claude/deep-sweep-2026-07-26` based on latest `main`. **Clean run — zero new
CRITICAL/HIGH/MEDIUM/LOW findings.** Phase 1 (`lane-bug-hunt` agentic loop, 5 finder lenses) returned 0
candidates from all 5 lenses. Phase 1.5 (the deep-sweep-owned cross-lane seams pass, rotated to **PII
across representations**) traced every writer/reader and found the invariant intact — no gap. Phase 3
(adversarial direct-API pass) traced 6 attack classes across the whole money/authz surface and confirmed
every candidate resolves to an existing control. Phase 0.5 re-verified 3 "→ FIXED" cluster headers, all
intact. Per the routine's stopping rule, this report documents the clean sweep rather than padding with
LOW-severity noise. No code changes this run — a docs-only PR (report + ledger status update).

**Model note:** per the routine's Fable/Opus split instruction, Phase 1 (`lane-bug-hunt`) was first
launched with every finder/verify/sweep agent pinned to `model: 'fable'`. All 5 finder agents failed
immediately with `"You've reached your Fable 5 limit"` — Fable-5 was fully unavailable for the whole
run (confirmed by re-attempting; the failure was not transient). Per the routine's explicit fallback
("If the Agent/Task tool or a model override is unavailable, proceed on the session model and note it
in the report — never abort over model availability"), Phase 1, Phase 0.5, and Phase 3 all ran on the
session model (Sonnet 5) instead. This is logged here so a future run knows to retry the Fable split
rather than assume this run's clean result came from a lighter-weight pass — the hunt itself was full
depth (5 lenses × up to 3-skeptic adversarial verify × sibling-sweep, 247 tool calls / ~650k subagent
tokens across Phase 1 alone).

## Phase 0 — inherit history

`docs/KNOWN_BUGS.md` read in full (OPEN table, FIXED/MOOT cluster summaries, coverage map, and every
dated section back through the 2026-07-25 bug-hunt entry). **One open `claude/*` sibling PR at session
start:** #392 (`claude/festive-ptolemy-9f0tfc`, tonight's 01:00 UX-improvements run, UX26-01/02/03 —
mobile `getDeviceId()` keystore-failure fallback, an admin `adminPost` error-message classifier, and an
`adjustFare`/`notifyIssueResolved` rider push `status` field). Read its full diff; none of its territory
overlaps the backend-correctness/concurrency/security lane, so nothing to dedupe against beyond noting it
in every finder/verify prompt's context so a lens couldn't accidentally re-surface it.

Also noted: two commits already merged to `main` earlier tonight (interactive session, not this routine)
— `65350ff` (closed the per-device signup-cap bypass: `x-device-id` is now required for account
*creation*) and `e2d8d36` (closed the SIM-recycle-detection bypass on a blank/absent `x-device-id`, plus
normalised blank→absent). Both are in `apps/api/src/auth/auth.service.ts`, squarely in this lane's
territory — carried into every finder's dedup context so the hunt didn't re-derive them.

## Phase 0.5 — cluster-claim re-verification

Rotated to the three "→ FIXED" cluster headers least-recently re-checked — **Notifications/FCM** and
**Edge/abuse** (not re-checked by any of the last several routine runs) and **Auth/identity** (worth a
fresh look given tonight's two device-id commits landed in the exact file this cluster covers).
**All 3 INTACT, 0 stale claims:**

- **Notifications/FCM** — dead-token pruning still fires on an explicit `invalidToken` result, never a
  transient throw (`notifications.service.ts:389` filters `results[i]?.invalidToken`; `fcm.push.ts:99-146`
  sets it only from `DEAD_TOKEN_CODES`); the multicast send is still batched/chunked at `sendEach ≤ 500`
  per provider call (`fcm.push.ts:13-14,125-131`). **INTACT.**
- **Edge/abuse** — the global `ThrottleGuard` is still module-wide (`app.module.ts:87`,
  `{ provide: APP_GUARD, useClass: ThrottleGuard }`); the Helmet-equivalent security-response-headers
  middleware is still wired on every response (`main.ts:102`,
  `common/security-headers.middleware.ts`, kept dependency-free by design). **INTACT.**
- **Auth/identity** — JWT is still `HS256`-pinned on both sign and verify (`token.service.ts:50,53`,
  `algorithms: ["HS256"]`), and the production JWT-secret boot guard still rejects the public repo
  default / a short secret (`config/env.ts:320-327`, `MIN_PROD_SECRET_LEN`, covered by
  `config/env.spec.ts:98-143`). The `x-user-id` dev-only fallback is still gated to the dev/test
  `NODE_ENV` allowlist and always loses to a real JWT subject (`common/current-user.decorator.ts:12-20`,
  covered by `current-user.decorator.spec.ts:15-29`). Tonight's two device-id commits sit in the SAME
  file (`auth.service.ts`) and don't touch any of these three guards. **INTACT.**

**0 stale claims, 0 fresh findings from Phase 0.5.**

## Phase 1 — orthogonal sweep (`lane-bug-hunt`, deep-sweep lane)

5 finder lenses fanned out over the deep-sweep lane (tx-rollback, concurrency-idempotency, authz-IDOR,
timer-expiry, adversarial-API), each independently reading `KNOWN_BUGS.md` first and reporting only what
prior runs missed. **0 candidates from all 5 lenses** — no finder raised anything worth adversarial
verification. Consistent with the repeatedly-hunted state of this lane (a dozen+ prior deep-sweep/
bug-hunt/wallet-audit runs have concentrated here) and with Phase 3's independent clean result below.

## Phase 1.5 — cross-lane seams pass (deep-sweep-owned)

**Seam picked (rotation — the one unused seam in the standing menu; prior picks were rider-standing
2026-07-19, single-DB-column-two-writers 2026-07-20, notification/feed/push-value-trust-boundary
2026-07-21):** **PII across representations** — every personal-data field vs.
`apps/api/src/privacy/pii-manifest.ts`, specifically checking the *storage-object* and *JSON-embedded*
siblings the manifest's own automated schema-coverage test (`pii-manifest.spec.ts`) cannot catch (it only
scans Prisma column names, not JSON-nested keys or Redis-resident data).

**Traced:**

1. **Automated schema-coverage guard** — ran `pii-manifest.spec.ts` directly: **38/38 tests pass**,
   confirming every PII-pattern-matching `schema.prisma` column is either in `PII_MANIFEST` or explicitly
   justified in `NON_PII_COLUMNS`, and every manifest scrub disposition is actually referenced by
   `privacy.service.ts`. No schema drift.
2. **JSON-embedded siblings** — enumerated every `Json`/`Json?` column in `schema.prisma`:
   `Order.pickup`/`Order.dropoff` (dialable `contactPhone` inside the waypoint — manifest `scrub-json`
   entries, and `privacy.service.ts:66-71,356-367` `stripWaypointPhone` actually performs the
   read-modify-write on every order the erasing customer placed); `Order.items`/`Order.itemsCollected`
   (line-item descriptions/quantities/collection flags — product data, not personal data, correctly
   absent from the manifest); `Address.point` (lat/lng of a saved address — but the whole `Address` row is
   `delete-row` on erasure, so the embedded point never survives independently). No JSON-embedded PII
   escapes the scrub.
3. **Storage-object siblings** — cross-checked every `disposition: "delete-object"`/photo-key manifest
   entry against `privacy.service.ts`'s `postCommitPurge`: `kyc-object` (profile/rider `photoUrl`),
   `item_photo_url`, `pickup_photo_key`, `delivery_proof_key` are all collected into `itemPhotoKeys`
   inside the erasure transaction and deleted post-commit via `storage.deleteObject`
   (`privacy.service.ts:286-316,361-392,412-423`) — DB-pointer-null and GCS-object-delete stay in lockstep
   for all four. `riders.kyc_ref` is correctly `disposition: "null"` (a vendor session reference, not a
   storage key) rather than `delete-object`.
4. **Non-Postgres PII residue** — checked Redis-resident PII the schema-scan structurally can't see:
   `otp:<phone>` / `otp:grace:<phone>` (`auth/otp-store.ts`) key on the raw phone number, but every key
   carries its own short TTL (the OTP/grace window, minutes) via the same atomic hset+expire /
   set-with-EX pattern the file uses everywhere else to avoid stranding a record with no TTL — so this is
   self-expiring, not a durable-erasure gap. The rider live-position Redis geo index and board-room
   membership are evicted on erasure via the existing `evictRiderFromSupply` funnel
   (`privacy.service.ts:406-409`, DS15-05/DS19-02), not a fresh finding.

**Disposition: seam INTACT, no fresh finding.** The privacy module has absorbed roughly half a dozen
prior sweep findings (DS-01, DS15-02/03/05/07, DS18-01/02/04, DOC-16-01, KB-POD-DISPUTE Phase A cleanup)
into the declarative manifest + funnel pattern this class of bug used to recur through; this run confirms
that hardening is still holding, including for JSON-embedded and storage-object representations a bare
column scan would miss.

## Phase 3 — adversarial API pass

Acted as an authenticated attacker with raw API access across
orders/offers/matching/wallet/admin/issues/sos/uploads/privacy/auth/kyc/riders/reports plus the Bird SMS,
WhatsApp, and Didit KYC webhook controllers, tracing (not skimming) the code path for seven angles: IDOR /
identity cross-check, CAS / row-lock discipline, idempotency, KYC / standing gates, fare/price
manipulation, wallet/commission abuse, and forgeable-header / reserved-string / oversized-numeric
payloads. **Zero new gaps** — every candidate traced to an existing, correctly-implemented control
(ownership gates read from the DB row not the request, `FOR UPDATE`/CAS on every lifecycle transition,
idempotency-keyed money paths, server-derived commission basis with post-lock re-reads, admin-only
class-level guards, fail-closed webhook signature checks, capped/validated money contracts). Consistent
with the 2026-07-21 sweep's independent "Zero new gaps" Phase 3 result — this lane is at a very high
hardening bar after a dozen+ prior passes.

## Findings — this sweep

None. Zero new CRITICAL/HIGH/MEDIUM/LOW findings from Phase 1, Phase 1.5, or Phase 3.

## Sibling-sweep

N/A — no findings this run to sweep for siblings.

## Verification

`pnpm typecheck && pnpm test` (+ `pnpm build` for `@lynia/api`) run locally before push — see the PR for
the exact pass counts. No source files changed this run (docs-only), so no regression risk.
