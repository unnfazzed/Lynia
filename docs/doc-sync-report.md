# Documentation sync report

Run date: 2026-07-07 · Reconciled against commit `2d189b24df0ad7e57cf6410cba8533ca03ddf344`
(branch `claude/busy-maxwell-0jrkoi`, tip of `main` at run time). First run — no prior
`docs/.last-doc-sync` marker existed, so this was a full-repo scan.

## Scope and method

Checked every doc marked **🟢 Living** in `docs/README.md`'s own classification table (these claim
to track current reality) against the real code: `ARCHITECTURE.md`, `PRICING.md`, `DESIGN.md`,
`DESIGN-SYSTEM.md`, `OBSERVABILITY.md`, `SECURITY.md`, `SECURITY-OPS.md`, `SECRET-ROTATION.md`,
`IR-RUNBOOK.md`, `PILOT-READINESS.md`, `LAUNCH-READINESS.md`, `CONCEPT.md`, plus root `README.md`,
`CONTRIBUTING.md`, and `.env.example`. Docs marked **📋 Review log** in `docs/README.md`
(`CEO-REVIEW.md`, `ENG-REVIEW.md`, `DESIGN-REVIEW.md`, `INDRIVE-UX-REVIEW.md`,
`COMPETITOR-REVIEW.md`) and `docs/plans/*` are decision history / ADR-like — out of scope by design
(never overwritten per the authority hierarchy). `MOCKUP-ALIGNMENT-REVIEW.md`, `FRAUD-REVIEW.md`,
`BUG-HUNT.md`, `JOURNEY-BUGS.md`, `QA-DEVICE-CHECKLIST.md`, `LAUNCH-EXECUTION-RUNBOOK.md`,
`DATA-RETENTION.md`, `PRICING.md`'s sibling `LOAD-MODEL.md` were spot-referenced by the agents above
but not separately deep-audited this run.

## Summary counts

| Doc | STALE_DOC (fixed) | CODE_BUG (flagged, not edited) | ORPHAN | AMBIGUOUS |
|---|---:|---:|---:|---:|
| ARCHITECTURE.md | 13 | 1 | 0 | 2 |
| PRICING.md | 0 | 0 | 0 | 0 |
| DESIGN.md | 3 | 1 | 0 | 1 |
| DESIGN-SYSTEM.md | 0 | 0 | 0 | 0 |
| OBSERVABILITY.md | 0 | 0 | 0 | 1 |
| SECURITY.md | 6 | 2 | 0 | 0 |
| SECURITY-OPS.md / SECRET-ROTATION.md / IR-RUNBOOK.md | 0 | 0 | 0 | 0 |
| PILOT-READINESS.md | 2 | 0 | 0 | 0 |
| LAUNCH-READINESS.md | 7 | 2 | 1 (dormant `Settlement` schema, code-side) | 5 |
| CONCEPT.md | 0 | 0 | 0 | 0 |
| README.md (root) | 0 | 0 | 0 | 0 |
| CONTRIBUTING.md | 3 | 0 | 0 | 0 |
| .env.example | — (not a `*.md`, not edited) | 0 | 1 (self-annotated, honest) | 14 (vars used in code, missing from example) |
| **Total** | **34** | **6** | **2** | **23** |

## ⚠️ Out-of-scope but urgent: production deploy pipeline is currently broken

Discovered while verifying `ARCHITECTURE.md`'s and `PILOT-READINESS.md`'s "CI is armed and live"
claims: **every `release.yml` run has failed since ~2026-07-06T10:00 UTC**, including the run
triggered by this session's own PR #146 merge (2026-07-07T14:34 UTC). Root cause (from the actual
job log): `Permission denied on secret: .../PII_ENCRYPTION_KEY/versions/latest for Revision service
account lynia-run@lynia-500911.iam.gserviceaccount.com`. `infra/terraform/secrets.tf:79-84` already
declares the correct `google_secret_manager_secret_iam_member` grant (added alongside the PII
national-ID encryption feature, commit `ca8314c`), but `terraform apply` was never run against the
live project, so the IAM binding doesn't exist yet. **~15+ merged PRs (#109–146) are not actually
deployed** — Cloud Run is still serving the pre-2026-07-06 09:50 revision. This was pushed to the
user directly (proactive notification) since it's a live incident, not a doc-sync item. Fix: run
`terraform apply` (or grant `roles/secretmanager.secretAccessor` on `PII_ENCRYPTION_KEY` to
`lynia-run@...` via `gcloud` directly) — this needs cloud credentials this session doesn't have.

Per this doc-sync's own rules, the doc claims about the release pipeline being "armed and live"
(`ARCHITECTURE.md` §15, `PILOT-READINESS.md`) were **not edited** — the pipeline's *design* is
correct and this is a transient ops/IAM-drift incident, not a documentation error.

## STALE_DOC fixes applied

### docs/ARCHITECTURE.md (13 fixes)
1. **Cancellation windows were backwards.** The doc said the customer could cancel only up to
   `en_route_pickup` and the rider could cancel any time before `delivered`. The code
   (`packages/shared/src/enums.ts:83-100`, enforced in `order-lifecycle.service.ts:454-455`) does the
   opposite: the customer can cancel post-pickup too; the rider is blocked from `picked_up` onward and
   must use `undelivered` instead. Fixed the state diagram and the prose, with the rationale for why
   (a rider "cancel" after pickup would strand a collected parcel).
2. Added the **`undelivered`** terminal status to the state diagram and prose — it existed in
   schema/code (`schema.prisma:46`, `order-lifecycle.service.ts:313`, `POST /orders/:id/undelivered`)
   but was completely missing from the doc.
3. Fixed the ERD's `Rating` cardinality: `Order ||--o| Rating` (one) → `Order ||--o{ Rating` (many) —
   migration `0015` widened the unique constraint to `(order_id, by_profile_id)` for two-way
   (customer↔rider) rating.
4. Fixed `AdminModule`'s "read API" / "read only" labeling (master diagram + module map) —
   `admin.controller.ts` has substantial write endpoints (suspend/lift/ban, cancel, fare-adjust,
   audit-log). Relabeled "read + write API" in both diagrams.
5. Added 5 missing WebSocket events to the event table: `bid:expired`, `order:taken`,
   `job:cancelled`, `presence:stale`, `order:rebroadcast` (all real, in
   `packages/shared/src/contracts.ts:223-259`).
6. Added ~20 missing REST endpoints to the surface table: `PATCH`/`DELETE /auth/me`,
   `POST /orders/disclaimer`, `POST /orders/:id/items/confirm`, `POST /orders/:id/undelivered`,
   `POST /orders/:id/sender-rating`, `GET /notifications/feed`, `POST /admin/retention/purge`, the
   `orders/:orderId/{issues,report,sos}` trio, and ~9 more `/admin/*` routes.
7. Added 5 missing modules to the module map: `IssuesModule`, `ReportsModule`, `SosModule`,
   `PrivacyModule`, `SettlementsModule` (plus a prose note on the global `PiiCryptoModule` and
   `ObservabilityModule`/`ClientMetricsModule`, which are cross-cutting infra rather than feature
   lanes) — `app.module.ts` wires all of these; none were in the diagram.
8. Added missing DI edges to the module map: `matching`/`offers`/`riders` → `tracking` (each injects
   `TrackingGateway`/`TrackingService`), `orders` → `matching` (real DI on `OfferExpiryService`,
   distinct from the existing dashed "schedules" edge), `admin` → `tracking` & `settlements`.
9. Expanded the ERD with the models entirely missing from it: `Issue`, `Report`, `Block`,
   `SosEvent`, `Refund`, `AuditLog`, plus the `Order`/`Rider` fields that had landed since the ERD was
   last drawn (`accountStatus`, `reliabilityScore`, `onHold`, `kycAttempts`, `kycDeclineReason`,
   `duplicateIdFlag`, `pickupGeog`, `cancelledAt/By/Reason`, `disclaimerVersion/AcceptedAt`,
   `rebroadcastOfId`, `itemsCollected`). Added a note that `Settlement` is dormant (superseded by the
   prepaid commission model but left in place, unreferenced, to avoid a destructive migration).
10. Added the `ratings` unique-constraint row to the schema-invariants table (one rating per order
    per rater).
11. Fixed the Secrets adapter interface name: the doc said `SecretsAdapter`; the real interface is
    `SecretsProvider` (`adapters/secrets/secrets.interface.ts:6`).
12. Removed/corrected the `config → SecretsProvider` edge in the adapter-seam diagram — nothing in
    `ConfigModule` actually consumes it (`config/env.ts` reads env directly via `loadEnv()`/zod); the
    module and its `EnvSecrets` impl exist but are unwired. Documented this transparently rather than
    implying a live dependency that isn't there.
13. Reworded the `matching -.->|schedules| orders` dashed edge's label to describe what it actually
    represents (the BullMQ expiry worker mutating order state), now that the real solid
    `orders → matching` DI edge is drawn separately (see #8).

**Not edited (CODE_BUG)**: the "release pipeline is armed and live" claim — see the incident above.
**Flagged, not edited (AMBIGUOUS)**: the dev/QA OTP escape hatch (`auth.service.ts:139-142`) is
broader than the doc states — in any non-production `NODE_ENV` with the console channel, the code is
echoed for *every* phone, not just `OTP_TEST_PHONES`-allowlisted ones (the allowlist gate is
prod-only). Looks deliberate but the doc's wording undersells it — human call on whether to tighten
the doc or confirm the broader dev-only exposure is intended. Also flagged: `createReadUrl` on
`StorageAdapter` is implemented but never called anywhere (no code path mints a signed read URL for a
stored photo today) — this is a CODE_BUG (design present, not wired up), not touched.

### docs/DESIGN.md (3 fixes)
1. The §5c 7-step stepper drift note said neither side was built; the **customer side is built**
   (`order/[id].tsx` renders `Stepper`) — only the rider side (`rider/job.tsx`) still isn't. Narrowed
   the claim accordingly.
2. DT5's "shipped slice" description said it still used two `MapPicker`s; `home.tsx` already uses the
   single full-bleed `ComposeMap` with the two-pin toggle — that's the doc's own *deferred* target,
   already shipped. Only the draggable-sheet half remains outstanding. Updated both the status table
   row and the "deferred full spec" intro.
3. Removed `note` from the "contract fields with no UI" list — it now has a field on `home.tsx`.
   `itemPhotoUrl`/`comment`/`reason` remain accurate as still UI-less.

**Not edited (CODE_BUG)**: DT12 marks "§5c stepper (both sides)" as done — the rider side genuinely
isn't; this is a real design/implementation gap, not a doc error. **Flagged (AMBIGUOUS)**: DT2's
"two empty states" claim only clearly matches one of the two designed no-rider states — could be a
deliberate merge or a genuine gap.

### docs/SECURITY.md (6 fixes — citations only; the controls themselves are real)
Six roadmap items (P0-1, P0-2, P0-3, P1-4, P2-3, P2-4) cited `file:line` locations that had drifted
from the actual control's location (e.g. P0-1 cited `env.ts:33,67`, an unrelated line; the real
JWT-default + boot-guard is at `:57` and `:137-144`). Fixed all six citations to point at the real
code. P0-2 and P0-3's descriptive text also still described the **pre-fix** state ("no
`middleware.ts`", "backend has no `security_policy`") even though both fixes have since landed
(`apps/admin/middleware.ts`, `lb.tf:60`'s `security_policy` wiring) — updated to describe the
current, already-improved state (P0-2 still correctly notes IAP/SSO+MFA as the remaining founder
step; P0-3 still correctly notes `terraform apply` is outstanding).

**Not edited (CODE_BUG — real, unresolved security gaps)**:
- **P1-3** is marked ✅ "implemented & test-verified" for a global `ValidationPipe` backstop
  (`whitelist`/`forbidNonWhitelisted`/`transform`) plus `.strict()` zod contracts on sensitive
  bodies. Neither exists: no `ValidationPipe`/`useGlobalPipes` anywhere in `apps/api/src`, and
  `admin.controller.ts`, `riders.controller.ts`, and `uploads.controller.ts` all bind non-`.strict()`
  bodies on sensitive mutations (fare-adjust, ban, become-rider, set-online, uploads) — they silently
  strip unknown fields instead of rejecting them. **The status table overclaims a real security
  control that isn't there.**
- **P1-1** is marked 🟨 "runs on next CI" for pinning GitHub Actions to commit SHAs — every `uses:`
  in `ci.yml`/`codeql.yml`/`release.yml`/`android-test-apk.yml` still uses a mutable version tag
  (`@v4` etc). This isn't "pending a CI run" — it's an unmade code change; the status framing is
  misleading about what's actually missing.

### docs/PILOT-READINESS.md (2 fixes)
1. T6 said "WhatsApp/SMS still stubbed (external)" — WhatsApp send is a real, fully implemented
   Meta Cloud API integration (`otp-sender.ts:45-86`, fails loud on misconfig) that directly
   contradicts the same doc's own correct text 100 lines later. Only SMS is actually a stub. Reworded
   to distinguish the two.
2. Fixed the OTP-request endpoint path in two places: doc said `POST /auth/otp`; the real route is
   `POST /auth/otp/request` (`auth.controller.ts:17,21`) — `/auth/otp/verify` was already correct.

### docs/LAUNCH-READINESS.md (7 fixes)
1. LR1's e2e suite location — doc said `apps/api/test/e2e/` (doesn't exist); real suite is colocated
   per module (`apps/api/src/{orders,offers,admin,auth}/*-authz.e2e.spec.ts` +
   `common/testing/authz-e2e.ts`). Fixed the path.
2. LR2's "Do: add `LAUNCH_MODE=true`" was superseded — that flag was never built (`grep` only hits
   this doc); the same guarantee shipped directly in `config/env.ts`'s always-on production
   `superRefine`. Rewrote the section past-tense and fixed the two downstream references to
   `LAUNCH_MODE` in the sequencing table and go/no-go checklist so they don't point at a flag that
   doesn't exist.
3. LR4's "Do: add a lint job to CI" — done (`ci.yml`'s `build` job runs `pnpm run lint` via
   commit `68f1b25`). Struck from the open items; branch protection remains open (AMBIGUOUS — a
   GitHub repo setting, not verifiable from code).
4. LR5's detail section described the **old, removed** weekly cash-settlement engine (an
   `auto-pause` endpoint that no longer exists, a "regenerates on every read" concern about an
   endpoint that's now a pure read with zero DB writes). The scorecard row itself was already
   correctly updated to the prepaid model — only the prescriptive "Do:" bullets weren't. Rewrote the
   section around the actual current engine (`commissionOverview()`), and flagged the dormant
   `Settlement` Prisma model as something a human should decide to drop or keep (ORPHAN, code-side —
   not something this pass edits).
5. LR18 — the flagged "admin dead-refund-write... needs a product decision" item was resolved by
   commit `69813bf` (chose "make the copy honest": refunds are now repaid out-of-band with netting
   explicitly deferred). Flipped the scorecard row to resolved and appended a dated resolution note
   to the Round 2 log entry (the original flagged finding is preserved verbatim; only a follow-up
   note was added, consistent with not rewriting decision history).

**Not edited (CODE_BUG — real bugs, now fixed, that existed at the time the doc declared status
"clean"/"landed")**: a `trust proxy` bug (fixed by `cbfc673`) collapsed all per-IP throttle keys
behind the LB into one shared bucket — a self-inflicted DoS — while LR3 was declared "landed"/CI
"green." A commission-rounding-divergence bug in `commissionOverview` (fixed by `e848042`) existed
while LR5's admin money-path fixes were declared done.

**Flagged, not edited (AMBIGUOUS)**:
- **Round log "CLEAN/converging" declaration** (Round 3, dated 2026-07-06): per the doc's own "two
  consecutive clean rounds" convergence rule, this declaration is now stale — real bugs were found
  and fixed *after* it, directly in the LR1/LR3/LR5/LR8 surface (the trust-proxy and commission bugs
  above, plus an admin PII leak, an ID-hash dedup-evasion bug, and a refresh-token-reuse bug, all
  fixed in commits `9dea779`/`f88e6c9`). This is dated historical log narrative, not a live status
  claim — per the authority hierarchy, decision-history text shouldn't be silently rewritten. **A
  human should add a dated Round 4 entry** rather than have this pass edit the Round 3 narrative.
- Round log test counts ("API 496 · mobile 65") are stale vs. the current 551/148 — same reasoning,
  left as a historical snapshot rather than edited.
- LR9's terraform/otel-collector prep artifacts (unapplied) aren't mentioned in the LR9 section.
- LR11's k6 harness covers 3 of ~8 scenario types the "Do" prescription lists.
- Branch protection on `main` (LR4) — unverifiable from code.

### CONTRIBUTING.md (3 fixes)
1. "CI runs in two jobs" → three (added `security`: `pnpm audit` + gitleaks).
2. Build-job step list was missing the `lint` step that runs between `typecheck` and `build`.
3. "You need no cloud account and no external vendor keys to run the full flow locally" was true only
   if you override the shipped `.env.example` default — `OTP_CHANNEL=whatsapp` ships as the active
   default, not `console`. Reworded to point at `.env.example`'s own "Local dev quickstart" comment
   block and be explicit that `OTP_CHANNEL=console` needs to be set.

## ORPHAN / AMBIGUOUS needing a human decision (not edited)

- **`.env.example`**: 14 real env vars read in code are missing from the example file —
  `ADMIN_API_TOKEN`, `REDIS_CA_CERT`, `SOS_SAFETY_LINE`, `DIDIT_AUTH_BASE_URL`,
  `DIDIT_REGISTER_EMAIL`, `DIDIT_REGISTER_PASSWORD`, `DIDIT_WEBHOOK_LABEL`, `DIDIT_WEBHOOK_URL`,
  `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_PLACES_KEY`, `EXPO_PUBLIC_MIN_APP_VERSION`,
  `EXPO_PUBLIC_STORE_URL`, `EXPO_PUBLIC_SUPPORT_URL`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`,
  `LYNIA_TEST_BUILD`. Ironic given the Didit ones — the README explicitly touts the "one-command
  founder-wiring script" that needs several of them. Not a `.md` file so out of this pass's edit
  scope, but worth a follow-up PR.
- **`SMS_GATEWAY_API_KEY`** in `.env.example` is unused in code but self-annotated "(not implemented)"
  — an honest placeholder, no action needed.
- **Dormant `Settlement` Prisma model** (`apps/api/prisma/schema.prisma:217-238`) — zero references
  in `apps/api/src`. A human should decide to drop it or repurpose it for the coming prepaid wallet.

## Determinism

Re-running this routine now (no further code changes) should produce **zero** further doc edits for
the six areas fixed above, since the citations/claims now match the code that was checked. The items
left as CODE_BUG/AMBIGUOUS above are expected to keep showing up on future runs until a human resolves
the underlying code or makes the requested decision — that's by design, not a determinism failure.
