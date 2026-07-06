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

---
**Where each of these came from:** `docs/DATA-RETENTION.md` (§1–2), `docs/OBSERVABILITY.md` (§3),
`docs/LOAD-MODEL.md` + `apps/api/load/` (§4), `docs/QA-DEVICE-CHECKLIST.md` (§5), `docs/LAUNCH-READINESS.md`
scorecard (all). Nothing here changes app code — it's the founder-gated execution the agent work prepared.
