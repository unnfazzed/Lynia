# Launch execution runbook (founder steps)

> Every step the launch-readiness work handed to the founder, as copy-paste commands. These are the
> `terraform` / `gcloud` / `gh` actions an agent deliberately does **not** run against the live project
> (`lynia-500911`, `africa-south1`). Run them in order per section. Prereqs: `gcloud` authed as an owner
> of the project, `terraform >= 1.5` in `infra/terraform/`, `gh` authed to the repo.

```bash
export PROJECT=lynia-500911
export REGION=africa-south1
export RUNTIME_SA=lynia-run@lynia-500911.iam.gserviceaccount.com
export API_URL=https://lyniago.lyniafinance.com
```

## 1. LR8 — national-ID encryption: mint the key + backfill  🔴 do before the next deploy

The API now **refuses to boot in production without `PII_ENCRYPTION_KEY`** (boot-guard). Terraform
generates it (`infra/terraform/secrets.tf`); `terraform apply` provisions it into Secret Manager.

```bash
cd infra/terraform
terraform plan      # review: random_password.pii + the PII_ENCRYPTION_KEY secret + IAM binding
terraform apply     # mints the key, grants the runtime SA access

# Deploy so the running service picks up the new --set-secrets entry (release.yml already lists it):
gh workflow run release.yml --ref main

# One-time backfill: encrypt existing plaintext national IDs + fill the dedup hash. Idempotent.
# Run with the SAME key the service uses (pull it from Secret Manager):
export PII_ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=PII_ENCRYPTION_KEY --project=$PROJECT)
export DATABASE_URL='<the prod DATABASE_URL>'   # from Secret Manager; run from a VPC-internal shell
pnpm --filter @lynia/api encrypt-ids            # DRY RUN — reports counts
pnpm --filter @lynia/api encrypt-ids -- --apply # APPLY
```

## 2. LR8 — data-retention: schedule the daily purge + enable KYC-media lifecycle

```bash
# a) Daily retention sweep (GPS scrub + expired-session purge) → POST /admin/retention/purge.
#    Cloud Scheduler with an OIDC token so the admin route accepts it.
gcloud scheduler jobs create http lynia-retention-purge \
  --project=$PROJECT --location=$REGION --schedule="0 3 * * *" \
  --uri="$API_URL/admin/retention/purge" --http-method=POST \
  --oidc-service-account-email=$RUNTIME_SA

# b) Settlement auto-pause (LR5) — same pattern, once monetization is on:
gcloud scheduler jobs create http lynia-settlement-autopause \
  --project=$PROJECT --location=$REGION --schedule="0 2 * * *" \
  --uri="$API_URL/admin/cash/settlements/auto-pause" --http-method=POST \
  --oidc-service-account-email=$RUNTIME_SA

# c) KYC-media bucket lifecycle — flip the gated var + apply (deletes KYC photos on the legal minimum).
#    Set kyc_retention_days in terraform.tfvars (e.g. 365), then:
cd infra/terraform && terraform apply
```
> Ratify the windows first: `GPS_RETENTION_DAYS` (90) / `SESSION_RETENTION_DAYS` (30) / `kyc_retention_days`
> — set the repo Variables / tfvars if legal advises different (`docs/DATA-RETENTION.md`).

## 3. LR9 — observability live (unblocks the whole performance track)

Follow `docs/OBSERVABILITY.md` §Production activation:
```bash
cd infra/terraform && terraform apply     # enables monitoring/cloudtrace APIs + alert policies + SA roles
gcloud secrets create otel-collector-config \
  --project=$PROJECT --data-file=infra/otel-collector/config.yaml
gcloud secrets add-iam-policy-binding otel-collector-config --project=$PROJECT \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
# Fill the <PLACEHOLDERS> in infra/otel-collector/service.yaml.template, then:
gcloud run services replace infra/otel-collector/service.yaml --region $REGION --project $PROJECT
# Verify series arrive in Metrics Explorer's PromQL tab (e.g. offer_received_latency_ms_bucket).
```
> After this, a normal `/ship` deploy drops the sidecar — fold it into `release.yml` once battle-tested
> (the doc's operational-drift note).

## 4. LR11 — staging stack + run the k6 load harness

```bash
# Stand up a staging Cloud Run service (NOT the live pilot) in QA mode so the harness can auth vendor-free:
gcloud run services update lynia-api-staging --region $REGION --project $PROJECT \
  --update-env-vars '^@^OTP_CHANNEL=console@KYC_PROVIDER=stub@PUSH_PROVIDER=noop@OTP_TEST_PHONES=+263771234567,+263770000002'
# (or deploy a second service from the same image; see infra/terraform for a staging workspace.)

# Then run the harness (docs/LOAD-MODEL.md, apps/api/load/README.md):
BASE_URL=https://<staging-host> k6 run apps/api/load/smoke.js
BASE_URL=https://<staging-host> k6 run apps/api/load/offer-loop.js
BASE_URL=https://<staging-host> STRESS=5 k6 run apps/api/load/offer-loop.js
BASE_URL=https://<staging-host> k6 run apps/api/load/abuse.js
```

## 5. LR20 — Sentry crash telemetry (on the dev build)

```bash
cd apps/mobile && npx @sentry/wizard@latest -i reactNative   # adds @sentry/react-native + config
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value '<dsn>'
# Wire Sentry.init behind the DSN + Sentry.wrap the router root (docs/QA-DEVICE-CHECKLIST.md §LR20),
# then a release build → force a test crash → confirm it lands in the Sentry dashboard symbolicated.
```

## 6. LR4 — branch protection (GitHub setting)

```bash
gh api -X PUT repos/unnfazzed/Lynia/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=typecheck · build · test' \
  -f 'required_status_checks[contexts][]=prisma migrate · constraint proof (PostGIS)' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null'
```

## 7. Dependency-maintenance (the two stuck Dependabot PRs)

After PR #127 (moduleResolution → node16) is on `main`:
```bash
gh pr comment 113 --body "@dependabot rebase"   # pnpm/action-setup 4→6 — should go green post-rebase
# #116 (34 prod-dep bulk bump): rebase then REVIEW — big jump; or `@dependabot recreate` for smaller groups.
```

## 8. Deployment pipeline arming (docs/LAUNCH-DEPLOYMENT-STRATEGY.md — landed 2026-07-08)

The canary/rollback/mobile pipelines are code now; these are the founder steps that arm them.

### a) GitHub Environments — the human gate before prod

The deploy jobs reference environments `production` (API) and `production-mobile` (Play/OTA); the
environments auto-create on first run but carry **no protection until you add a reviewer**:
Repo **Settings → Environments → production → Required reviewers** → add yourself; repeat for
`production-mobile`. Also restrict `production` to the `main` branch. From then on every prod
deploy pauses for an approval click.

### b) Canary rollout — nothing to arm, tunables optional

Graduated canary (default 10% → 50% → 100%, each step gated on the LB `/healthz` poll, revision
readiness, AND the candidate's 5xx rate from Cloud Run's built-in metrics) is on by default
whenever `GCP_DEPLOY_ENABLED=true`. The metric gate needs the deployer SA to hold
`roles/monitoring.viewer` — covered by `terraform apply` (`iam.tf`); until then it warns and the
health/readiness gates still hard-gate. Optional repo Variables: `CANARY_STEPS` (default
`"10 50"`), `CANARY_OBSERVE_SECONDS` (per step, default 120), `CANARY_MIN_SAMPLE` (default 20),
`CANARY_MAX_5XX_PCT` (default 5), `PUBLIC_HEALTH_URL` (default the live `/healthz`),
`CANARY_DISABLED=true` (escape hatch — old immediate-100% behavior). Manual rollback:
**Actions → "Rollback (Cloud Run)"** — run empty to list revisions, re-run with a revision name
to route 100% back. **Exercise it once** (LR21).

### c) EAS + Google Play — arms mobile-release.yml and mobile-ota.yml

```bash
npm i -g eas-cli && eas login                       # or use npx eas-cli
cd apps/mobile
eas init                                            # creates the EAS project, prints the project id
# → commit the id as the fallback in app.config.ts (const easProjectId — it is NOT a secret)
gh variable set EAS_PROJECT_ID --body "<the-id>"    # CI config evaluation

# Play Console (one-time): create the app (zw.co.lynia), enrol in Play App Signing, create a
# Play Developer API service account (Play Console → API access) and download its JSON key.
eas credentials                                     # Android → production: let EAS manage the
                                                    # upload keystore + upload the Play SA key
# Build-time secrets live in EAS (not GitHub): GOOGLE_MAPS_API_KEY, GOOGLE_SERVICES_JSON (file).

gh secret set EXPO_TOKEN --body "<token from expo.dev/settings/access-tokens>"
gh variable set EAS_RELEASE_ENABLED --body "true"   # the arming switch
```

First release: **Actions → "Mobile Release (Play)"** with profile `preview` (internal track) →
promote through closed testing in Play Console → then tag `v0.2.0` on `main` for the first staged
production rollout (starts at 10%; advance/halt in Play Console → Releases). JS-only hotfixes:
**Actions → "Mobile OTA Update"** (goes to installed apps on next launch, no review).

### d) Branch protection — §6 above, plus Code Owners

Run the §6 command, and additionally tick **"Require review from Code Owners"** in the branch
protection UI so the `.github/CODEOWNERS` routing is enforced on money/auth/infra/pipeline paths.

### e) Staging stack — arms deploy-staging.yml (and unblocks LR11 load runs)

```bash
# 1. Provision (infra/terraform/staging.tf — its own SQL/Redis/secrets/SA/bucket, ~zero prod risk):
cd infra/terraform
echo 'staging_enabled = true' >> terraform.tfvars
terraform apply       # review: everything is new + gated; prod's only diff is the LB host rule/cert

# 2. DNS: add an A record for staging.lyniafinance.com → the SAME load_balancer_ip output as prod.
#    The staging managed cert goes ACTIVE after DNS propagates (can take ~30 min).

# 3. Arm the workflow from the Terraform outputs:
gh variable set GCP_STAGING_ENABLED --body "true"
gh variable set STAGING_CLOUD_SQL_INSTANCE --body "$(terraform output -raw STAGING_CLOUD_SQL_INSTANCE)"
gh variable set STAGING_CLOUD_RUN_SERVICE_ACCOUNT --body "$(terraform output -raw STAGING_CLOUD_RUN_SERVICE_ACCOUNT)"
gh secret set MIGRATE_DATABASE_URL_STAGING --body "$(terraform output -raw MIGRATE_DATABASE_URL_STAGING)"
gh variable set STAGING_OTP_TEST_PHONES --body "+263771234567,+263770000002"   # QA numbers

# 4. First deploy: Actions → "Deploy Staging (Cloud Run)" (or push to main). The first run's smoke
#    can fail while DNS/cert propagate — re-run once https://staging.lyniafinance.com/healthz answers.
# 5. Point the k6 harness at it (LR11): BASE_URL=https://staging.lyniafinance.com k6 run apps/api/load/smoke.js
```

Staging runs `APP_ENV=staging`: prod-shaped (real secret-strength guards, NODE_ENV=production)
with ONLY the launch-hygiene guards relaxed, so console OTP / stub KYC / noop push boot there for
vendor-free QA. The prod deploy hardcodes `APP_ENV=production`, so no variable can ever relax
prod. This replaces the old §4 advice of running QA mode on a second copy of the prod service.

### f) Release train + force-update gate

**Release train:** `release-please.yml` maintains a rolling release PR from Conventional Commits;
merging it tags `vX.Y.Z` (which triggers the Play release) and writes `apps/mobile/CHANGELOG.md`.
One-time: `gh secret set RELEASE_PLEASE_TOKEN` with a fine-grained PAT (contents: write) so the
tag it pushes can trigger mobile-release.yml — with the default token, start the Play release
manually from Actions after merging the release PR.

**Force-update gate (server-driven):** when a breaking change must walk old installs to the Play
Store, set the minimum and redeploy — installed apps below it get the blocking update screen at
next cold start (fail-open: an unreachable API never blocks anyone):
```bash
gh variable set MIN_SUPPORTED_APP_VERSION --body "0.2.0"   # dotted version, matches app.config.ts
gh workflow run release.yml --ref main
# verify: curl https://lyniago.lyniafinance.com/app/version-gate → {"minSupportedVersion":"0.2.0"}
```
Prefer keeping API contracts backward-compatible; this gate is the escape hatch, not the routine.

---
**Where each of these came from:** `docs/DATA-RETENTION.md` (§1–2), `docs/OBSERVABILITY.md` (§3),
`docs/LOAD-MODEL.md` + `apps/api/load/` (§4), `docs/QA-DEVICE-CHECKLIST.md` (§5), `docs/LAUNCH-READINESS.md`
scorecard (all), `docs/LAUNCH-DEPLOYMENT-STRATEGY.md` (§8). Nothing here changes app code — it's the
founder-gated execution the agent work prepared.
