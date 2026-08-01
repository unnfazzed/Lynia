# GCP Pending Review — 2026-07-13

Follow-up to the 2026-07-10 provisioning review (retired to git history; its verified-inventory
table is in the Appendix below). Scope: everything currently
pending, failing, or drifted between the codebase/requirements and the live GCP project
(`lynia-500911`, `africa-south1`). Evidence: Actions run history of `release.yml` /
`deploy-staging.yml` / `deploy-autoheal.yml` (including the rendered deploy script of
today's green run #147), `infra/terraform/*`, `apps/api/src/**`, and the infra docs.
All timestamps UTC; review executed 2026-07-13 ~11:10Z.

---

## 1. Verdict in one paragraph

The two P0s from the 07-10 review are **half-resolved**. The release train is fully
healthy again — production deploys promote through the canary gates (run #147 shipped
`lynia-api-00175-quv` to 100% at 08:39Z today), staging is green on every `main` push
(runs #36–#50), autoheal runs clean, and Didit KYC + FCM push are now armed. But
**production OTP is still dead**: WhatsApp was only half-armed — `WHATSAPP_ENABLED=true`
and the token secret exist, yet the `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TEMPLATE_NAME`
repo Variables are **empty strings** in the rendered deploy of run #147, so every
`requestOtp` still throws 503 (`apps/api/src/auth/otp-sender.ts:59-64`). New sign-ins
cannot complete, and no guard or alert catches it because the revision boots and
`/healthz` is green. Beyond that, the pending set is: release #148 (deep-sweep fixes)
waiting on manual production approval, Cloud Scheduler jobs still absent (retention purge
has never run), the OTel collector / SLO alerts still down, a missing
`roles/logging.viewer` grant that `release.yml` assumes exists, and the deliberate
hardening deferrals (public SQL IP, Redis BASIC/no-TLS, WAF preview, ZONAL SQL).

---

## 2. Resolved since the 2026-07-10 review ✅

| 07-10 item | Status today | Evidence |
|---|---|---|
| 🔴 Prod deploys crash-looping since 07-08 | **Fixed.** Releases #143, #145 (impl.), #147 promoted green through 10→50→100 canary; serving revision `lynia-api-00175-quv` (100%) as of 08:39Z | release.yml run #147 job log: "All canary steps healthy — promoting …-00175-quv to 100%" |
| Two days of merged fixes not live | **Cleared** — everything through PR #210 (broadcast widening) is serving | run #147 head `201db14` |
| `PUSH_PROVIDER=noop` override | **Cleared** — prod deploys with `PUSH_PROVIDER=fcm` | run #147 rendered `--set-env-vars` |
| Didit KYC arming | **Armed** — `DIDIT_ENABLED=true`, `DIDIT_WORKFLOW_ID` injected, both secrets resolve | run #147 rendered deploy |
| Staging stack question | **Armed and green** — deploy-staging #36–#50 all success (latest 10:57Z today), incl. smoke test | deploy-staging run history |
| Autoheal pipeline | **Active and clean** — 65 runs, all success/skipped, no open escalation issues | deploy-autoheal history; 0 open issues |

The staging→production ordering gate also works as designed: release's `staging-gate`
job waited for the green staging run of the same sha before proceeding (runs #147, #148).

---

## 3. 🔴 P0 — production OTP still broken: WhatsApp half-armed

**Live state (run #147 rendered deploy script, 08:34Z today):**

```
WHATSAPP_ENABLED = true          → branch taken, so:
ENV_VARS  ...;WHATSAPP_PHONE_NUMBER_ID=;WHATSAPP_TEMPLATE_NAME=     ← BOTH EMPTY
SECRETS   ...,WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest    ← secret exists, deploy resolved it
WHATSAPP_TEMPLATE_LANG           ← unset (defaults to "en", fine)
```

The env schema keeps these `.optional()` so boot succeeds and the canary health gate
passes (`apps/api/src/config/env.ts:89-91`) — but `WhatsAppOtpSender.send()` requires all
three of phone-number-id / token / template and throws `ServiceUnavailableException` when
any is falsy (`apps/api/src/auth/otp-sender.ts:56-64`). So the arming attempt after the
07-10 review completed step 2 (token secret + accessor) but **not step 3 (the two repo
Variables)** — production sign-in fails exactly as before, now silently "green".

**Fix (founder, GitHub repo Settings → Variables, ~2 minutes + redeploy):**

1. Set `WHATSAPP_PHONE_NUMBER_ID` (Meta Business → WhatsApp → API setup) and
   `WHATSAPP_TEMPLATE_NAME` (the approved authentication-category template; optional
   `WHATSAPP_TEMPLATE_LANG` if not `en`).
2. Re-run **Release (Cloud Run)** (or approve #148, which will pick the vars up).
3. Verify with one real `requestOtp` against production.

**Fix (agent-codeable, prevents recurrence):** extend release.yml's "Validate production
launch-hygiene config" step (`release.yml:195-215`) — it currently only rejects
`OTP_CHANNEL=console` / non-empty `OTP_TEST_PHONES`. Add hard failures for:
- `WHATSAPP_ENABLED=true` with empty `WHATSAPP_PHONE_NUMBER_ID` or
  `WHATSAPP_TEMPLATE_NAME` (today's exact miss);
- `OTP_CHANNEL=whatsapp` with `WHATSAPP_ENABLED != true` (the 07-10 miss, still unguarded).

This was recommended in the 07-10 review (§4) and has not been implemented — it would
have caught both incarnations of this outage.

### 3a. Pre-launch exception (added same day, after §8a)

The hard-fail guards in §8a are correct but total: once merged, they blocked *every*
production deploy — including unrelated bug fixes and UX polish — until WhatsApp is fully
armed, which the founder expects to take about two more weeks. Since Lynia has no live
pilot users yet, an already-known-broken OTP channel is an acceptable, explicit, time-boxed
tradeoff against not shipping anything else for two weeks — but only if it stays *loud*,
never silently green again.

`release.yml`'s launch-hygiene step now reads two repo Variables:

- `OTP_WHATSAPP_UNARMED_ACK=true`
- `OTP_WHATSAPP_UNARMED_ACK_EXPIRES=YYYY-MM-DD`

When set and not yet expired, an unarmed-WhatsApp finding is downgraded from `::error::`
(blocks the deploy) to `::warning::` (prints on every deploy, but proceeds). Once
`OTP_WHATSAPP_UNARMED_ACK_EXPIRES` passes, or if the ack is on but the expiry is missing/
unparseable, it reverts to a hard failure automatically — the exception cannot be forgotten
and left on indefinitely. `OTP_CHANNEL=console`, non-empty `OTP_TEST_PHONES`, and
`KYC_PROVIDER=stub` are unaffected and always hard-fail.

To use it: set both repo Variables (GitHub → Settings → Variables → Actions) with an expiry
matching the real WhatsApp-arming ETA. When WhatsApp is armed, clear
`OTP_WHATSAPP_UNARMED_ACK` (or let it expire) so the guard goes back to unconditional.

---

## 4. 🟡 Pending right now in the pipeline

- **Release run #148 (sha `8221045`, PR #212 deep-sweep fixes) is `waiting` on the
  `production` environment approval** (since 11:00Z; normal — today's #147 approval took
  ~65 min). Until approved, the DS13-01..07 fixes are not live. Note the approval gate is
  now the release train's main latency: run #142 sat waiting ~6 h (20:43→02:32) before
  being rejected as superseded. If that latency is unwanted, either trim the reviewer
  list, or add a notification when a deploy has waited > N minutes.
- **PR #213 / #211 tails:** docs-only (`paths-ignore` correctly skipped them); no code
  is stranded behind #148.
- **`gcp-diagnose.yml` has zero retained runs** — dispatch-only and unused since the
  07-10 incident window. Fine, but know that it exists as the read-only live-state probe
  (the provisioning-verify script's CI twin) when the next incident hits.

---

## 5. 🟡 Assumed by code but still not provisioned (unchanged from 07-10)

| Gap | Impact | State check (2026-07-13) |
|---|---|---|
| **Cloud Scheduler jobs** (retention purge daily; settlement auto-pause later) | Retention purge **has never run** — GDPR-ish exposure grows daily; `SCHEDULER_SERVICE_ACCOUNT` is injected (run #147) and `AdminOrSchedulerGuard` is live, but nothing calls the endpoint | **Fixed alongside this review, see §8a** — `infra/terraform/scheduler.tf` + `cloudscheduler.googleapis.com` now in `project.tf`; `lynia-retention-purge` created by default on the next `terraform apply` (still a founder step) |
| **OTel collector** (+ `otel-collector-config` secret, sidecar fold-in) | No traces/metrics; SLO histograms dormant; monitoring blind — the canary 5xx gate is the only automated production signal | Terraformed and code-complete: `infra/terraform/otel.tf` now owns the `otel-collector-config` secret + runtime-SA `secretAccessor` grant, and `release.yml` deploys the sidecar explicitly behind the `OTEL_SIDECAR_ENABLED` repo Variable (`.github/workflows/release.yml:469-509`). What remains is flipping that flag + a `terraform apply` + the dashboard import (§8, item 5) — not building the wiring |
| **SLO alert policies + dashboard** | Nobody is paged on SLO breach | `slo_alerts_enabled` default `false` (`variables.tf:223-227`), correctly gated until the collector exists; `alert_notification_channels = []`; dashboard.json never imported |
| **`roles/logging.viewer` for the deployer SA** | The release "Dump failed revision diagnostics" step **silently prints nothing** on every failed deploy (confirmed blind during the 07-08→07-10 incident) | **Fixed alongside this review, see §8a** — added to `iam.tf`'s `deployer_roles`; takes effect on the next `terraform apply` |
| **Mobile/EAS pipeline** | No Play builds / OTA from CI | `EAS_RELEASE_ENABLED` still unset; founder-only (Expo/Play accounts) |

## 6. 🟡 Deliberate hardening deferrals (founder `terraform apply` decisions)

Unchanged, all coded behind flags per `docs/INFRA-HARDENING-ROLLOUT.md`; live posture:

- Cloud SQL **public IP on** (`db_public_ip_enabled=true`; path to private-only exists:
  `DB_PRIVATE_ONLY=true` repo var → in-VPC migrate job, then flip the TF flag — the
  in-VPC migration step exists and was *skipped* in run #147, i.e. still Auth-Proxy mode).
- Redis **BASIC**, **no TLS** (`redis_tier`, `redis_tls_enabled` — both recreate/disrupt).
- Cloud SQL **ZONAL** (hardcoded `sql.tf:21`).
- Cloud Armor OWASP rules **preview/log-only** (`armor_waf_preview=true`; rate-limit is enforced).
- CMEK (`kyc_cmek_enabled=false`), KYC retention (`kyc_retention_days=0`).
- GitHub-side: branch protection on `main`, `production` environment reviewer set (it IS
  gating — someone approves — but the runbook's reviewer-configuration step LR4 remains
  formally founder-pending).

## 7. Doc drift found (fix in the next docs pass)

1. **`docs/PILOT-READINESS.md` is the most stale** (07-01): still claims WhatsApp/Didit
   entirely un-armed, `PUSH_PROVIDER=noop`, and lists only 3 hardening deferrals with the
   old `*`-CORS framing. Live: Didit armed, push=fcm, WhatsApp *half*-armed, CORS default
   is `[]` (deny-all), and there are 8 hardening flags.
2. **`infra/terraform/README.md:75-82`** hardening list omits the CMEK / retention /
   Redis-TLS / WAF flags and repeats the outdated CORS-`*` framing.
3. **`docs/LAUNCH-READINESS.md` LR11 "staging applied and armed" is CORRECT** (proven by
   deploy-staging green history) even though `staging_enabled` *defaults* to `false` in
   `variables.tf` — the applied tfvars differ from repo defaults. Don't "fix" LR11;
   do note in the terraform README that live tfvars ≠ committed defaults, and that
   `scripts/gcp-provisioning-verify.sh` is the source of truth for live state.
4. The 2026-07-10 provisioning review's §3 (deploy breakage) and §2 staging-drift notes are
   now historical — superseded by this doc (the review itself is retired to git history).

## 8a. Execution update (same day, this branch)

The agent-codeable items were implemented alongside this review:

- **release.yml launch-hygiene guards (§3)** — a deploy now hard-fails when
  `OTP_CHANNEL=whatsapp` with `WHATSAPP_ENABLED != true`, or `WHATSAPP_ENABLED=true` with
  empty `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_TEMPLATE_NAME`. NOTE: once this merges,
  production releases are BLOCKED until the founder sets those two repo Variables —
  that is intentional (the alternative is silently shipping a service whose sign-in 503s).
- **`roles/logging.viewer` for the deployer SA (§5)** — added to `iam.tf` `deployer_roles`;
  takes effect on the next `terraform apply`.
- **Cloud Scheduler jobs (§5)** — `infra/terraform/scheduler.tf` + the
  `cloudscheduler.googleapis.com` API enable: `lynia-retention-purge` (daily 03:00 Harare,
  `europe-west1`, OIDC as the runtime SA, audience pinned to the route URL, created by
  default on next apply) and `lynia-settlement-autopause` (gated off until monetization).
- **Doc drift (§7)** — terraform README hardening list + CORS framing + live-state note,
  PILOT-READINESS staleness banner, runbook §2 terraform pointer.

Still founder-only: the two WhatsApp repo Variables + redeploy, approving release #148,
`terraform apply` (picks up the IAM grant + scheduler job), and the OTel/alerts/hardening
sequence below.

## 8. Recommended order

1. **Founder:** set `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_TEMPLATE_NAME` repo Variables,
   then approve/re-run release → restores production sign-in (§3).
2. **Founder:** approve release run #148 (ships the deep-sweep fixes) — independent of 1,
   but doing 1 first makes it one deploy.
3. **Agent:** release.yml WhatsApp launch-hygiene guards (§3) + `roles/logging.viewer`
   in `iam.tf` (§5) — two small PRs, both prevent silent failure modes already observed.
4. **Founder:** `terraform apply` to pick up the already-written Cloud Scheduler
   retention-purge job (`scheduler.tf`, §8a) → closes the never-run purge (§5).
5. **Founder:** flip `OTEL_SIDECAR_ENABLED=true` (collector terraform + release.yml
   wiring already land, §5) → dashboard import → `slo_alerts_enabled=true` +
   notification channel — removes the monitoring blind spot.
6. Hardening flips per `INFRA-HARDENING-ROLLOUT.md` sequencing; docs pass for §7.

---

## Appendix — provisioned-and-verified inventory (absorbed from the retired GCP-PROVISIONING-REVIEW, 2026-07-10)

The component checklist `scripts/gcp-provisioning-verify.sh` runs against. Verified live as of
2026-07-10; re-verify with the script rather than trusting this table.

| Component | Terraform | Live evidence (2026-07-10) |
|---|---|---|
| Project / 16 APIs / region | `project.tf` | deploys + migrations succeed against `lynia-500911` / `africa-south1` |
| VPC, peering, `lynia-connector` | `network.tf` | prod + staging deploys pass `--vpc-connector lynia-connector` |
| Cloud SQL `lynia-pg` (PG16, PostGIS, public+private IP) | `sql.tf` | CI migrations via Auth Proxy green in every run (21 migrations, up to date) |
| Memorystore `lynia-redis` (BASIC, AUTH) | `redis.tf` | `/healthz` returned `redis:true` through run #103's canary window |
| GCS `lynia-media` | `storage.tf` | injected as `STORAGE_BUCKET` on the serving revision |
| Artifact Registry `lynia` | `artifact-registry.tf` | image pushes green in all runs |
| Runtime SA `lynia-run@…` (SQL client, bucket objectAdmin, self signBlob, FCM admin, metric/trace writer, per-secret accessor) | `iam.tf`, `secrets.tf` | revision `00101` boots and serves with it |
| Deployer SA + WIF `github-pool/github-provider` (keyless CI) | `iam.tf`, `wif.tf` | every workflow authenticates keylessly |
| Secrets `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`, `PII_ENCRYPTION_KEY` (+ `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` added by hand) | `secrets.tf` (Didit: manual) | run #103 resolved all six `--set-secrets` refs and booted |
| Global HTTPS ALB + managed cert + Cloud Armor (`lyniago.lyniafinance.com`) | `lb.tf`, `armor.tf` | canary health gate polled `/healthz` green for 2×120s |
| Remote TF state (`gs://lynia-tfstate`) | `versions.tf` | active backend block, migrated 2026-07-08 |
| Staging stack: `lynia-pg-staging`, `lynia-redis-staging`, `lynia-media-staging`, `lynia-run-staging`, `*_STAGING` secrets, `staging.lyniafinance.com` cert | `staging.tf` (`staging_enabled`) | `deploy-staging.yml` runs #3–#12 green (first success 2026-07-08) |
| KYC vendor (Didit) armed | manual | `DIDIT_ENABLED=true`, `DIDIT_WORKFLOW_ID` set; both Didit secrets resolve at deploy |
