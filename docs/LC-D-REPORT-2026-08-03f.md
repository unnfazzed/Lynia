# LC loop D report — 2026-08-03f — D-T5 infra soundness II (READ-ONLY)

Territory: `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D, **D-T5** — "Infra soundness II
(READ-ONLY → report + ledger): backup/PITR/restore-drill parity, CI/deploy gaps beyond KNOWN items,
mobile release/OTA pipeline fitness." Per the program doc and `docs/ROUTINES.md`'s sensitive/infra
doctrine, this territory is explicitly read-only for the LC lanes: findings are ledgered OPEN (owner:
founder) with a report section, and neither `infra/terraform/**`, `.github/workflows/**`, nor
application code was edited this run.

**How this ran:** three parallel read-only research passes (general-purpose agents) — backup/DR
posture, CI/deploy-pipeline safety, and mobile OTA release fitness — each grounded in the actual
code/Terraform/workflow files, cross-checked against `docs/KNOWN_BUGS.md` and the program doc to avoid
re-reporting anything already ledgered (`LC-D19`–`LC-D27` from D-T4, `LC-INF1`–`4`/`LC-C01` from the
Day-0 sweep). Eleven new findings ledgered `LC-D28`–`LC-D38`; zero overlap confirmed with any existing
row.

## 1. Backup / PITR / restore-drill parity

Cloud SQL backups and PITR are correctly enabled in `infra/terraform/sql.tf` (`enabled = true`,
`point_in_time_recovery_enabled = true`, a sensible off-peak `02:00` UTC start time). That part is
genuinely done right. The gap is that **restore capability has never actually been proven**: the repo
already contains a complete, well-written runbook (`docs/RESTORE-DRILL.md`) and a verification script
(`scripts/restore-drill-verify.sh`) for exercising a PITR clone or backup restore into a scratch
instance — but the runbook's own drill-record table still reads `_pending — first drill not yet run_`,
and `docs/LAUNCH-READINESS.md` LR7 is unticked. No workflow runs this on a schedule or after a `sql.tf`
change; it's entirely founder-executed, ad hoc, and hasn't happened yet. A backup that has never been
restored is unproven, not proven — `LC-D28`, HIGH.

The runbook's own §10 already names three further backup-config risks it found while being written
(location not pinned to `africa-south1` — data-residency, `LC-D30`; retention windows on undocumented
Cloud SQL defaults, `LC-D31`; `deletion_protection` defaults false, re-severitized here as `LC-D29`
since combined with the backup chain it could mean losing the primary AND its recoverable backups in
one accidental destroy, not just live data). These were documented in the runbook but never entered the
canonical `docs/KNOWN_BUGS.md` ledger — ledgering them now so they're tracked where every other sweep
looks first, not only as a runbook aside.

Redis/Memorystore correctly has **no** persistence configured, which is right, not a gap: every value
stored in Redis (OTP codes, rate-limit counters, presence/geo/matching-claim state, MicroCache reads) is
either short-TTL and cheaply reissuable, self-healing via heartbeats, or reconstructable from Postgres —
nothing durable lives only in Redis. The KYC/photo GCS bucket has versioning on and `force_destroy =
false` (both correct), but is single-region with no cross-region replication — a low-priority
availability nuance given GCS's own high single-region durability, ledgered as `LC-D32`, LOW.

## 2. CI/deploy gaps beyond KNOWN items

Rollback, migration-before-traffic-shift ordering, canary gate logic, secrets handling, and concurrency
protection were all re-verified (not just trusted) and are genuinely sound: `release.yml` re-points 100%
of traffic to the pre-deploy revision automatically on a failed canary step, with a documented manual
`rollback.yml` path too; migrations run strictly before any traffic shift on both prod and staging; no
canary gate step is masked by `continue-on-error` or `|| true`; no secret is ever echoed or hardcoded;
every deploy-relevant workflow has a `concurrency:` group.

Two real gaps beyond what D-T4/Day-0 already found: `release.yml`'s own comment claims migrations are
safe pre-traffic-shift because the repo "enforces expand-only/online-safe migrations" via
`migration-safety.spec.ts` — but that spec only scans for three *locking* hazards (unindexed-concurrent
`CREATE INDEX`, `DROP INDEX` without `IF EXISTS`, `GENERATED … STORED` adds), not backward-incompatible
schema changes (dropped/renamed columns, new `NOT NULL`, type changes) that would break the
still-serving old revision during the canary window — an overclaim in the comment and a real
unenforced hazard class, `LC-D33`, MEDIUM-HIGH. Separately, the canary's 5xx-rate gate only judges once
`CANARY_MIN_SAMPLE` (default 20) candidate-revision requests land; at this pilot's documented traffic
(`docs/LOAD-MODEL.md`: order-create ≈0.08 rps) a 10%-of-low-traffic sample over the default 120s
observation window can plausibly never reach 20 requests, silently degrading the strongest per-deploy
safety gate to "inconclusive-pass" on many pilot-era deploys — a real, undocumented mismatch between a
deliberately-designed gate and this program's actual traffic profile, `LC-D34`, MEDIUM.

## 3. Mobile release/OTA pipeline fitness

`runtimeVersion: { policy: "fingerprint" }` and `fallbackToCacheTimeout: 0` are both correctly set —
an OTA bundle can never land on an incompatible native binary, and the update check never blocks first
paint on slow 2G. The server-driven min-version force-update gate fails open on any network error and
checks once per cold start, not mid-session. Native builds are correctly staged (`rollout: 0.1`) and
publishing is already restricted to a reviewed CI workflow, not laptop pushes.

But four real gaps surfaced, none overlapping the backend-only `LC-D19`–`LC-D27`: OTA updates publish
**all-or-nothing** (`eas update --branch`, no rollout flag) unlike the native track's staged 10%,
`LC-D35` HIGH; there is **no CI/workflow rollback path** for OTA — only an ad-hoc "`eas
update:republish` … Expo console or CLI" recipe, no `mobile-ota-rollback.yml` mirroring the backend's
reviewed `rollback.yml`, `LC-D36` HIGH; there is **no automated crash/error-rate gate** tied to OTA
rollout at all (contrast the backend's automated SLO-triggered canary rollback) — detection depends
entirely on someone noticing and manually republishing, `LC-D37` HIGH; and OTA downloads aren't gated to
WiFi/unmetered connections despite `docs/APP-SIZE.md` explicitly framing OTA bytes as "money out of a
real person's pocket" on prepaid 2G/3G, `LC-D38` MEDIUM. Combined, `LC-D35`+`LC-D37` describe the exact
"bad release reaches everyone fast, nobody notices fast, no easy way back" risk this territory was
scoped to find — currently latent since `EAS_RELEASE_ENABLED` is unset and the native app has never
actually been released (zero real installs today per `docs/GCP-PENDING-REVIEW-2026-07-13.md` /
`docs/LC-A-REPORT-2026-08-03b.md`), but these gaps apply unmodified from day one once EAS is armed.

## Ledger summary

| ID | One-line | Sev |
|---|---|---|
| LC-D28 | Restore drill fully documented but never actually run; LR7 unticked | HIGH |
| LC-D29 | Prod `deletion_protection` defaults false — could lose primary + backup chain together | MEDIUM-HIGH |
| LC-D30 | Backup storage location not pinned to `africa-south1` — data-residency | MEDIUM |
| LC-D31 | Backup/PITR retention on undocumented Cloud SQL platform defaults | MEDIUM |
| LC-D32 | KYC/photo GCS bucket single-region, no cross-region replication | LOW |
| LC-D33 | Migration-safety CI only checks lock hazards, not backward-compatibility | MEDIUM-HIGH |
| LC-D34 | Canary 5xx gate can be a no-op at this pilot's actual traffic volume | MEDIUM |
| LC-D35 | OTA updates ship all-or-nothing, no staged rollout unlike native track | HIGH |
| LC-D36 | No CI/workflow rollback path for a bad OTA push, only ad-hoc CLI/console | HIGH |
| LC-D37 | No automated crash/error-rate gate tied to OTA rollout | HIGH |
| LC-D38 | OTA downloads not gated to WiFi/unmetered despite stated data-cost concern | MEDIUM |

All eleven are OPEN, owner: founder, per this territory's read-only doctrine. No code or
`infra/terraform/**`/`.github/workflows/**` changes in this PR — docs only (this report,
`docs/KNOWN_BUGS.md`, the ticked D-T5 box in the program plan). With D-T1 through D-T5 now all swept,
Lane D's audit-territory list is complete; the next firing moves into OPTIMIZE MODE against the seeded
checklist (`D-O1`–`D-O3`).
