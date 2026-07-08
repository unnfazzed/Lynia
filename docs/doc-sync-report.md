# Doc-sync report

Run date: 2026-07-08 · Commit scanned: `5a45496ce00df043e5aefe57be6d3495f547464c` (full scan — no prior
`docs/.last-doc-sync` marker existed).

## Summary

| Class | Count | Action |
|---|---|---|
| STALE_DOC | 21 | Fixed in this run (see below) |
| CODE_BUG | 0 | none found |
| ORPHAN | 1 | flagged, not edited |
| AMBIGUOUS | 2 | flagged, not edited |

Scope: every root/`docs/*.md` doc claiming to describe current behavior, config, or API surface,
checked against the actual NestJS/Prisma code, Terraform, CI workflows, and `packages/shared`.
Point-in-time review logs (`CEO-REVIEW.md`, `ENG-REVIEW.md`, `DESIGN-REVIEW.md`,
`COMPETITOR-REVIEW.md`, `INDRIVE-UX-REVIEW.md`, `BUG-HUNT.md`, `JOURNEY-BUGS.md`,
`MOCKUP-ALIGNMENT-REVIEW.md`, `FRAUD-REVIEW.md`, `LAUNCH-*`, `IR-RUNBOOK.md`,
`QA-DEVICE-CHECKLIST.md`, `docs/plans/*`) were treated as decision history, not live specs, and were
out of scope for claim-by-claim verification.

## STALE_DOC — fixed this run

**docs/ARCHITECTURE.md**
- §7 lifecycle: the customer/rider cancellation windows were reversed. Code
  (`packages/shared/src/enums.ts:83-100`) has the *customer* cancellable through `picked_up` and
  `en_route_dropoff`, and the *rider* blocked from `picked_up` onward — the doc's mermaid edges and
  prose said the opposite. Fixed.
- §7: the `assigned → confirmed` edge was labeled "rider confirms items"; item confirmation is
  actually a separate, later action (`POST /orders/:id/items/confirm`) gated on `en_route_pickup`
  that doesn't change order status. Relabeled to "rider advances".
- §10 tracking: doc said position is persisted then re-emitted; code emits first
  (`coalescePositionEmit()` before `recordFix()`, commented "emit-before-persist (P1-1a)") and
  throttles the `geog` write to ~once/10s per rider rather than on every fix. Fixed.
- §12 adapter seam: `CLOUD_PROVIDER` was documented as the storage-adapter selector; `storage.module.ts`
  never reads it — `GcsStorage` is wired unconditionally, and only `PUSH_PROVIDER` actually switches
  an adapter. Fixed.
- §5 ERD / §13 concurrency table: `Rating` was documented as one-per-order
  (`Order ||--o| Rating`, `orderId UK`); the schema's real constraint is
  `@@unique([orderId, byProfileId])`, deliberately allowing one rating each from customer and rider.
  Fixed the relationship cardinality, field annotation, and the concurrency-table row.
- §4 module map / §5 ERD / §16 REST+WS surface: eight feature lanes shipped after the doc was last
  updated were entirely missing — `PiiCryptoModule`, `ObservabilityModule`, `ClientMetricsModule`,
  `SettlementsModule`, `IssuesModule`, `ReportsModule`, `SosModule`, `PrivacyModule` — along with their
  Prisma models (`Settlement`, `Issue`, `Report`, `Block`, `SosEvent`, `Refund`, `AuditLog`), ~29 REST
  routes (admin rider/customer moderation, disputes, report/block, SOS, prepaid-commission overview,
  retention/erasure, RUM ingest, `PATCH`/`DELETE /auth/me`, `orders/disclaimer`, `orders/notify-me`,
  three Lifecycle routes), and 5 WS events (`bid:expired`, `order:taken`, `job:cancelled`,
  `presence:stale`, `order:rebroadcast`). Added all of it, verified against the live controllers,
  services, module wiring, and migrations `0012`–`0014`.
- §15 CI diagram: missing the `security` job (`pnpm audit` + gitleaks) that runs alongside `build`/
  `schema`. Added.

**README.md**
- Line 10: `/health` → the real liveness route is `/healthz`
  (`apps/api/src/health/health.controller.ts:8`). Fixed.

**CONTRIBUTING.md**
- §5 "What CI checks" table only listed two jobs; a third (`security`: `pnpm audit --audit-level=high`
  + gitleaks, `.github/workflows/ci.yml:13-37`) also runs on every PR/push. Added the row.
- The `build` job description omitted the `pnpm run lint` step that runs between `typecheck` and
  `build` (`ci.yml:52-53`). Added.

**docs/OBSERVABILITY.md**
- The four `client_*_latency_ms` histograms are recorded with both `role` and `version` labels
  (`metrics.service.ts:168-172`, a deliberately cardinality-bounded `version` bucket); the doc's label
  vocabulary only listed `role`. Added `version` to all four rows.

**docs/SECURITY.md**
- Six roadmap `file:line` citations had drifted as the cited code moved since the doc's last review
  pass (all six features are real and already ✅/🟨 per the status table above them — only the pointer
  was stale): `env.ts:33,67` → `env.ts:57` (default) / `env.ts:137-144` (superRefine guard);
  `lb.tf:46` → `lb.tf:60`; `tracking.gateway.ts:64` → `:79`; `otp-sender.ts:94,105` → `:96,109`;
  `sql.tf:32` → `:34`; `token.service.ts:28` → `:50,53`; `env.ts:39,45` →
  `:160-162,166-168,171-176`.

**docs/DESIGN-SYSTEM.md**
- The "Repo-side product tickets" paragraph (from `packages/design/ALIGNMENT-REVIEW.md`) listed six
  app-logic items as an open punch list; all six (contact-phone enforcement, timeouts/error states,
  409 rollback copy, OTP lockout/re-issue, board hiding, phone-reveal gating) are already implemented
  in `apps/mobile`/`apps/api`. Reworded to past tense.

**docs/PILOT-READINESS.md**
- Line 193 described a "profile-update endpoint — genuinely absent"; `PATCH /auth/me` exists
  (`auth.controller.ts:52-60`) but is only wired into one-time onboarding, not a post-signup edit
  flow. Reworded to describe the actual gap (missing UI, not a missing endpoint).

## ORPHAN — flagged, not edited

- **docs/ARCHITECTURE.md §7**, the `[*] --> requested --> open_for_offers` mermaid edge. `OrderStatus.
  REQUESTED` still exists in the enum (`packages/shared/src/enums.ts:27`) and in an admin display
  grouping, but no code path ever creates an order in that status —
  `OrdersService.create()` inserts directly as `open_for_offers`
  (`apps/api/src/orders/orders.service.ts:148-149`). Left the diagram as-is since the enum value may
  be intentionally reserved for a future flow (e.g. a draft/pending-broadcast state) — a human should
  decide whether to delete the dead state from the enum or wire it up.

## AMBIGUOUS — flagged for a human

- **README.md / docs/README.md / docs/PILOT-READINESS.md**: the "API is live and CI-deployed on GCP at
  `https://lyniago.lyniafinance.com`, CI deploy is armed" claims. `release.yml` is code-consistent with
  this (gated on the `GCP_DEPLOY_ENABLED` repo variable, which the workflow's own header comment calls
  "DORMANT UNTIL GCP IS PROVISIONED"), and Terraform/LB config are real — but whether the GitHub repo
  variable is actually set to `'true'` and whether the GCP project is live cannot be verified from the
  checked-out repository. Needs a human check against the GitHub repo Variables / GCP console.

## Not independently re-verified this run

`docs/PRICING.md` and the SECURITY-OPS/SECRET-ROTATION/DATA-RETENTION runbooks were checked in full and
came back as exact matches (formulas, constants, worked examples, rotation mechanics, retention
sweep) — no changes needed. `docs/DESIGN-SYSTEM.md`'s "wired into the apps" claims and
`docs/PILOT-READINESS.md`'s T0–T13 scorecard were both spot-checked and found accurate aside from the
two items above.
