# GCP Provisioning Review — code & functionality vs live state (2026-07-10)

Scope: everything the app + CI/CD requires on GCP, compared against what Terraform
provisions and what the GitHub Actions history proves is actually live. Evidence is
cited from `infra/terraform/*`, `.github/workflows/*`, `apps/api/src/**`, docs, and
the Actions run history of `release.yml` / `deploy-staging.yml`.

**Companion tool:** `scripts/gcp-provisioning-verify.sh` — a read-only `gcloud`
audit that checks every item below against the live project and prints the fix
command for anything missing. Run it authenticated against `lynia-500911`.

---

## 1. Verdict in one paragraph

The core production stack **is provisioned and serving** (Cloud Run + Cloud SQL +
Memorystore + GCS + Secret Manager + ALB + WIF, project `lynia-500911`,
`africa-south1`), and — contrary to the docs — the **staging stack is also
provisioned and armed** (staging deploys have run green on every `main` push since
2026-07-08). But GCP is **not fully functional** today, on three counts:

1. 🔴 **Production deploys have been failing since 2026-07-08 15:52** — every new
   revision crash-loops at container start. Live traffic is pinned to the last
   green revision (`lynia-api-00101-hit`, run #103). Two days of merged fixes
   (#164, #165, #166) are NOT live.
2. 🔴 **Production OTP is un-armed while pointed at WhatsApp** — the serving
   revision runs `OTP_CHANNEL=whatsapp` with `WHATSAPP_ENABLED` unset, so no
   WhatsApp credentials are injected and `WhatsAppOtpSender.send()` throws 503 for
   every OTP request (`apps/api/src/auth/otp-sender.ts:59-64`). New sign-ins on
   production cannot complete.
3. 🟡 **Deliberately deferred pieces remain unprovisioned**: Cloud Scheduler jobs
   (retention purge never runs), the OTel collector (+ its config secret + SLO
   alerts), push (`PUSH_PROVIDER=noop`), mobile/EAS pipeline, and the LR7
   hardening items.

---

## 2. What is provisioned and verified working

| Component | Terraform | Live evidence |
|---|---|---|
| Project / 16 APIs / region | `project.tf` | deploys + migrations succeed against `lynia-500911` / `africa-south1` |
| VPC, peering, `lynia-connector` | `network.tf` | prod + staging deploys pass `--vpc-connector lynia-connector` |
| Cloud SQL `lynia-pg` (PG16, PostGIS, public+private IP) | `sql.tf` | CI migrations via Auth Proxy green in every run incl. failing ones (21 migrations, up to date) |
| Memorystore `lynia-redis` (BASIC, AUTH) | `redis.tf` | `/healthz` returned `redis:true` through run #103's canary window |
| GCS `lynia-media` | `storage.tf` | injected as `STORAGE_BUCKET` on the serving revision |
| Artifact Registry `lynia` | `artifact-registry.tf` | image pushes green in all runs |
| Runtime SA `lynia-run@…` (SQL client, bucket objectAdmin, self signBlob, FCM admin, metric/trace writer, per-secret accessor) | `iam.tf`, `secrets.tf` | revision `00101` boots and serves with it |
| Deployer SA + WIF `github-pool/github-provider` (keyless CI) | `iam.tf`, `wif.tf` | every workflow authenticates keylessly, incl. today |
| Secrets `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`, `PII_ENCRYPTION_KEY` (+ `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` added by hand) | `secrets.tf` (Didit: manual) | run #103 resolved all six `--set-secrets` refs and booted |
| Global HTTPS ALB + managed cert + Cloud Armor (`lyniago.lyniafinance.com`) | `lb.tf`, `armor.tf` | canary health gate polled `https://lyniago.lyniafinance.com/healthz` green for 2×120s |
| Remote TF state (`gs://lynia-tfstate`) | `versions.tf` | active backend block, migrated 2026-07-08 |
| **Staging stack**: `lynia-pg-staging`, `lynia-redis-staging`, `lynia-media-staging`, `lynia-run-staging`, `*_STAGING` secrets, `staging.lyniafinance.com` cert | `staging.tf` (`staging_enabled`) | **deploy-staging.yml runs #3–#12 green** (first success 2026-07-08 10:32; every `main` push since deploys + smoke-tests `/healthz`) — so `staging_enabled=true` was applied and `GCP_STAGING_ENABLED`, `STAGING_*` vars + `MIGRATE_DATABASE_URL_STAGING` are set |
| KYC vendor (Didit) armed | manual | `DIDIT_ENABLED=true`, `DIDIT_WORKFLOW_ID` set; both Didit secrets resolve at deploy |

**Doc drift:** `docs/LAUNCH-EXECUTION-RUNBOOK.md §8e`, `docs/LAUNCH-DEPLOYMENT-STRATEGY.md §0.5`
and `docs/LAUNCH-READINESS.md` (LR11) still describe the staging stack as an unapplied
to-do. It is live. Update these (LR11's "needs a staging stack" blocker is half-cleared —
only the OTel collector remains).

---

## 3. 🔴 P0 — production deploys broken since 2026-07-08 15:52

**Symptom.** `release.yml` runs #104…#108: build, image push, and migrations all green;
`gcloud run deploy` then fails with *"container failed to start and listen on
PORT=3000"* after ~15s (revision `lynia-api-00109-pab` in run #108). Runs #105–#107
were superseded by newer pushes (concurrency group), #104 and #108 hard-failed.

**Evidence chain (why this is GCP-side state, not code):**

- Run #103 (2026-07-08 14:03, sha `92d90d6`) deployed green — canary shifted
  10→50→100 with healthy gates.
- Run #104 (sha `e8f0055`, PR #160) has an **empty `apps/api` diff vs #103**
  (PostHog was mobile-only) — yet it failed, both on Jul 8 and when re-run on Jul 10.
- The failing deploys use a **byte-identical `--set-env-vars` string and identical
  `--set-secrets` references** to run #103 (verified from both job logs).
- Dependency drift is ruled out: reproducing the Dockerfile's exact partial-workspace
  `pnpm install --frozen-lockfile=false` today resolves to the lockfile's versions
  (NestJS 11.1.27, Prisma 7.8.0).

So: same code, same config, boots at 14:18, crashes at 15:52 → **something in the
project's runtime state changed in that window**. The only inputs that can change
without a code/config diff are the Secret-Manager-injected values (all referenced as
`:latest`) and the reachability of the private services.

**Prime suspect: the runtime `DATABASE_URL` (or `REDIS_URL`) secret got a bad new
version on Jul 8 afternoon.** Supporting facts:

- Boot awaits `PrismaService.$connect()` (`apps/api/src/prisma/prisma.service.ts:56`)
  with a 10s pool-acquire timeout — a wrong password/host fails bootstrap in ~10–15s,
  exactly the observed crash timing. A malformed URL would also make `loadEnv()`
  throw instantly (`apps/api/src/config/env.ts:219`).
- **CI migrations still pass** because they use `MIGRATE_DATABASE_URL` — a separate
  copy stored as a GitHub secret — so the database itself is up and its *original*
  password works. Only the Secret Manager copy would be broken.
- Jul 8 afternoon is precisely when infra activity happened: the TF state was
  migrated to GCS that day and the staging stack was applied that morning. A
  re-apply from a stale/fresh state, or a manual rotation per
  `docs/SECRET-ROTATION.md`, would mint new `:latest` versions.

**Resolve it (10 minutes, two commands):**

```bash
# 1. The actual crash reason — stack trace of the failed revision:
gcloud logging read 'resource.type="cloud_run_revision"
  resource.labels.service_name="lynia-api"
  resource.labels.revision_name="lynia-api-00109-pab"' \
  --project lynia-500911 --limit 100 --format 'value(textPayload)'

# 2. Did any runtime secret get a new version after the last green deploy (Jul 8 14:23)?
for s in DATABASE_URL REDIS_URL JWT_SIGNING_SECRET PII_ENCRYPTION_KEY DIDIT_API_KEY DIDIT_WEBHOOK_SECRET; do
  echo "== $s"; gcloud secrets versions list "$s" --project lynia-500911 \
    --format 'table(name,state,createTime)' | head -4
done
```

If a secret version dated Jul 8 ~14:30–15:50 exists and the crash log shows a
connect/validation error: either fix the value (`terraform apply` re-asserts the
TF-managed ones from state) or `gcloud secrets versions destroy` the bad version so
`:latest` falls back — then re-run **Release (Cloud Run)** (`workflow_dispatch`).

**Hardening follow-ups so this can't silently recur (automatable, in-repo):**

1. Pin secret versions at deploy time (e.g. resolve the current version number in
   release.yml instead of `:latest`), or at minimum log `createTime` of each secret
   version in the deploy step.
2. Make the API image build reproducible: `apps/api/Dockerfile:19` uses
   `--frozen-lockfile=false` (needed because only 3 of 6 workspace `package.json`s
   are copied). Copy all workspace manifests and use `--frozen-lockfile` so an image
   rebuild of the same sha is bit-for-bit equivalent.
3. The canary machinery worked as designed (bad revision got 0% traffic; users were
   never impacted) — but nothing *alerts* on a failed release. Add a failure
   notification, or the gap between "merged" and "live" grows unnoticed (it is
   currently 2 days / 3 releases wide).

---

## 4. 🔴 P0 — production OTP cannot send (WhatsApp un-armed while selected)

The serving revision (and every deploy since) sets `OTP_CHANNEL=whatsapp` but
`WHATSAPP_ENABLED` is not `true`, so release.yml injects **no**
`WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_ACCESS_TOKEN`.
Result: every `requestOtp` on production throws `ServiceUnavailableException`
(`apps/api/src/auth/otp-sender.ts:59-64`). Boot-guards forbid falling back to the
console channel in prod (`env.ts:192`), so **the only way forward is arming Meta**:

1. Meta Business → WhatsApp Cloud API: phone number ID + permanent token + approved
   authentication-category template (founder action, not codeable).
2. `gcloud secrets create WHATSAPP_ACCESS_TOKEN … && gcloud secrets versions add …`
   and grant `lynia-run@` accessor (mirror what `secrets.tf` does for the others).
3. Set repo Variables `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`
   (+ optional `WHATSAPP_TEMPLATE_LANG`), then flip `WHATSAPP_ENABLED=true`.
4. Redeploy.

**Automatable guard (recommended):** release.yml's "Validate production
launch-hygiene config" step currently passes this configuration. Add a check —
`OTP_CHANNEL=whatsapp` (the default) with `WHATSAPP_ENABLED != true` should fail (or
at least `::warning::`) the deploy, because it ships a service whose sign-in path
500s. The existing validation only catches the QA-values-in-prod direction.

---

## 5. 🟡 P1 — assumed by code but not provisioned

| Gap | Impact | Fix — automatable? |
|---|---|---|
| **Cloud Scheduler jobs** (`lynia-retention-purge` daily → `POST /admin/retention/purge`, settlement autopause) | GDPR-ish retention purge **never runs**; `SCHEDULER_SERVICE_ACCOUNT` is injected but nothing calls the endpoint | **Yes — add `google_cloud_scheduler_job` to Terraform** (must live in `europe-west1`; africa-south1 has no Scheduler). OIDC: service account `lynia-run@…`, audience = exact endpoint URL (`admin-or-scheduler.guard.ts` pins origin+path). Currently a manual runbook step (§2) that hasn't been done |
| **OTel collector** Cloud Run service + `otel-collector-config` secret | No traces/metrics; SLO alert policies can't be enabled (`slo_alerts_enabled=false` or apply fails); LR9/LR11 blocked | **Yes — terraform-able** (`google_cloud_run_v2_service` from `infra/otel-collector/service.yaml.template` + a `google_secret_manager_secret` from `config.yaml`), or keep the documented manual `gcloud run services replace`. Note the runbook's own warning: a normal release deploy **drops the sidecar** — folding it into release.yml is the durable fix |
| **Monitoring dashboard + SLO alerts** | No alerting; canary 5xx gate is the only automated signal | Dashboard: one `gcloud monitoring dashboards create -f infra/otel-collector/dashboard.json`. Alerts: flip `slo_alerts_enabled=true` + `alert_notification_channels` **after** the collector is live |
| **Push notifications**: `PUSH_PROVIDER=noop` repo Variable overrides the launch-safe `fcm` default | No push in prod despite FCM IAM + APIs being ready | Repo-var flip (`PUSH_PROVIDER` → unset/`fcm`) + Firebase app for `zw.co.lynia` + `google-services.json` into EAS (founder) |
| **Mobile pipeline dormant**: `EAS_RELEASE_ENABLED` unset | No Play builds / OTA from CI | Founder: `eas init`, `EXPO_TOKEN`, `EAS_PROJECT_ID`, Play service account — not codeable |

## 6. 🟡 P2 — deliberate deferrals (tracked, decide before launch)

All flagged in `infra/terraform/README.md` / `PILOT-READINESS.md` as pilot-scoped:

- Cloud SQL **public IP still on** (only for CI Auth-Proxy migrations). Fix path exists
  in release.yml already: set `DB_PRIVATE_ONLY=true` (uses the in-VPC `lynia-migrate`
  Cloud Run Job) then `ipv4_enabled=false` in TF. Automatable now.
- Redis **BASIC** → `STANDARD_HA`, Cloud SQL **ZONAL** → `REGIONAL`, TLS to Redis
  (`redis_tls_enabled`) — tfvars flips + apply (cost decisions).
- Cloud Armor OWASP rules in **preview (log-only)** (`armor_waf_preview=true`) — flip
  after reviewing preview logs.
- `bucket_cors_origins` tighten to the real admin origin; CMEK (`kyc_cmek_enabled`)
  once real KYC data lands; KMS `prevent_destroy`.
- Branch protection / environment reviewers (LR4) — GitHub settings, founder.

## 7. Can it be fixed automatically? — summary

**Automatable in this repo (agent-executable):**
- The P0 deploy-breakage *diagnosis commands* and the verify script (added:
  `scripts/gcp-provisioning-verify.sh`).
- Terraform for Cloud Scheduler jobs, OTel collector service + config secret,
  dashboard import; `DB_PRIVATE_ONLY` migration path; tfvars flips for HA/TLS/WAF.
- release.yml guards: WhatsApp-armed check (§4), secret-version pinning/logging,
  frozen-lockfile Docker build, deploy-failure notification (§3).
- Doc-sync for the stale staging status (§2).

**Founder-only (accounts, money, external consoles — not codeable):**
- Meta WhatsApp BSP (token/template) — blocks §4.
- Inspecting/repairing the broken Secret Manager version — needs project IAM
  (2 commands, §3); any agent runs read-only `scripts/gcp-provisioning-verify.sh`
  once given `roles/viewer`.
- Firebase/Play/EAS arming, GitHub repo Variables & branch protection, DNS.

**Suggested order:** §3 secret fix + redeploy (restores the release train, ships two
days of fixes) → §4 WhatsApp arming (restores sign-in) → Scheduler jobs (compliance)
→ collector/alerts → hardening flips.
