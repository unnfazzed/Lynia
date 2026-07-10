#!/usr/bin/env bash
# gcp-provisioning-verify.sh — read-only audit of the Lynia GCP project against
# everything the code, Terraform, and CI workflows expect to exist.
#
# Companion to docs/GCP-PROVISIONING-REVIEW.md. Prints PASS/FAIL/WARN per check and
# a fix hint for every failure; exits non-zero if anything required is missing.
# Needs: gcloud authenticated with at least roles/viewer on the project (plus
# secretmanager.viewer to list secret versions). Makes NO changes.
#
# Usage: scripts/gcp-provisioning-verify.sh [PROJECT_ID] [REGION]

set -uo pipefail

PROJECT="${1:-lynia-500911}"
REGION="${2:-africa-south1}"
SCHEDULER_REGION="europe-west1" # africa-south1 has no Cloud Scheduler
API_DOMAIN="lyniago.lyniafinance.com"
STAGING_DOMAIN="staging.lyniafinance.com"

PASS=0 FAIL=0 WARN=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       fix: %s\n' "$2"; }
warn() { WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       note: %s\n' "$2"; }
hdr()  { printf '\n== %s\n' "$1"; }

g() { gcloud --project "$PROJECT" "$@" 2>/dev/null; }

hdr "Project & APIs ($PROJECT)"
if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  bad "project $PROJECT not accessible" "gcloud auth login / check IAM"
  echo "Aborting — nothing else can be checked."; exit 1
fi
ok "project reachable"
ENABLED="$(g services list --enabled --format='value(config.name)')"
for api in run.googleapis.com sqladmin.googleapis.com redis.googleapis.com \
           storage.googleapis.com secretmanager.googleapis.com \
           artifactregistry.googleapis.com vpcaccess.googleapis.com \
           servicenetworking.googleapis.com iamcredentials.googleapis.com \
           monitoring.googleapis.com cloudtrace.googleapis.com \
           firebase.googleapis.com fcm.googleapis.com; do
  if grep -q "^$api$" <<<"$ENABLED"; then ok "API $api"; else
    bad "API $api not enabled" "terraform apply (project.tf) or: gcloud services enable $api"
  fi
done
# Cloud Scheduler API is only needed once the purge jobs exist (see below).
grep -q "^cloudscheduler.googleapis.com$" <<<"$ENABLED" \
  && ok "API cloudscheduler.googleapis.com" \
  || warn "API cloudscheduler.googleapis.com not enabled" "needed for the retention-purge job (runbook §2)"

hdr "Core prod infrastructure"
g compute networks describe lynia-vpc --format='value(name)' >/dev/null \
  && ok "VPC lynia-vpc" || bad "VPC lynia-vpc missing" "terraform apply (network.tf)"
g compute networks vpc-access connectors describe lynia-connector --region "$REGION" \
  --format='value(state)' | grep -q READY \
  && ok "VPC connector lynia-connector READY" \
  || bad "VPC connector lynia-connector missing/not READY" "terraform apply (network.tf)"
SQL_STATE="$(g sql instances describe lynia-pg --format='value(state)')"
[ "$SQL_STATE" = "RUNNABLE" ] && ok "Cloud SQL lynia-pg RUNNABLE" \
  || bad "Cloud SQL lynia-pg state=${SQL_STATE:-absent}" "terraform apply (sql.tf)"
SQL_PUBIP="$(g sql instances describe lynia-pg --format='value(settings.ipConfiguration.ipv4Enabled)')"
[ "$SQL_PUBIP" = "True" ] \
  && warn "Cloud SQL public IP is ON (pilot-accepted)" "pre-launch: DB_PRIVATE_ONLY=true migration path, then ipv4_enabled=false (LR7)" \
  || ok "Cloud SQL public IP off"
REDIS_STATE="$(g redis instances describe lynia-redis --region "$REGION" --format='value(state)')"
[ "$REDIS_STATE" = "READY" ] && ok "Memorystore lynia-redis READY" \
  || bad "Memorystore lynia-redis state=${REDIS_STATE:-absent}" "terraform apply (redis.tf)"
g storage buckets describe "gs://lynia-media" --format='value(name)' >/dev/null \
  && ok "GCS bucket lynia-media" || bad "GCS bucket lynia-media missing" "terraform apply (storage.tf)"
g artifacts repositories describe lynia --location "$REGION" --format='value(name)' >/dev/null \
  && ok "Artifact Registry repo lynia" || bad "Artifact Registry repo lynia missing" "terraform apply (artifact-registry.tf)"

hdr "Service accounts & WIF"
for sa in "lynia-run@$PROJECT.iam.gserviceaccount.com" "lynia-deployer@$PROJECT.iam.gserviceaccount.com"; do
  g iam service-accounts describe "$sa" --format='value(email)' >/dev/null \
    && ok "SA $sa" || bad "SA $sa missing" "terraform apply (iam.tf)"
done
g iam workload-identity-pools providers describe github-provider \
    --workload-identity-pool=github-pool --location=global --format='value(state)' | grep -q ACTIVE \
  && ok "WIF github-pool/github-provider ACTIVE" \
  || bad "WIF provider missing" "terraform apply (wif.tf)"

hdr "Secret Manager — runtime secrets (+ freshness vs last green deploy 2026-07-08T14:23Z)"
LAST_GREEN="2026-07-08T14:23:00Z"
for s in DATABASE_URL REDIS_URL JWT_SIGNING_SECRET PII_ENCRYPTION_KEY DIDIT_API_KEY DIDIT_WEBHOOK_SECRET; do
  LATEST="$(g secrets versions list "$s" --filter='state=ENABLED' --sort-by=~createTime \
            --limit=1 --format='value(name,createTime)')"
  if [ -z "$LATEST" ]; then
    bad "secret $s has no enabled version" "terraform apply (secrets.tf) / create it per docs"
    continue
  fi
  ok "secret $s (latest enabled: $LATEST)"
  CT="$(awk '{print $2}' <<<"$LATEST")"
  if [[ "$CT" > "$LAST_GREEN" ]]; then
    warn "secret $s :latest was created AFTER the last green prod deploy" \
         "prime suspect for the boot crash-loop — see docs/GCP-PROVISIONING-REVIEW.md §3"
  fi
done
for s in WHATSAPP_ACCESS_TOKEN; do
  g secrets describe "$s" --format='value(name)' >/dev/null \
    && ok "secret $s (WhatsApp armed at secret level)" \
    || bad "secret $s missing — prod OTP sends 503 while OTP_CHANNEL=whatsapp" \
           "arm Meta BSP, create secret, set WHATSAPP_* repo vars, flip WHATSAPP_ENABLED=true (review §4)"
done
for s in DATABASE_URL_STAGING REDIS_URL_STAGING JWT_SIGNING_SECRET_STAGING PII_ENCRYPTION_KEY_STAGING; do
  g secrets describe "$s" --format='value(name)' >/dev/null \
    && ok "staging secret $s" || bad "staging secret $s missing" "terraform apply with staging_enabled=true (staging.tf)"
done

hdr "Cloud Run services"
for svc in lynia-api lynia-api-staging; do
  READY="$(g run services describe "$svc" --region "$REGION" \
           --format='value(status.conditions[0].status)')"
  if [ "$READY" = "True" ]; then
    REV="$(g run services describe "$svc" --region "$REGION" \
           --format='value(status.traffic[0].revisionName,status.traffic[0].percent)')"
    ok "Cloud Run $svc Ready (serving: $REV)"
  else
    bad "Cloud Run $svc missing or not Ready" "first deploy via the matching workflow (release.yml / deploy-staging.yml)"
  fi
done
# Failed-revision detector: latest created != latest serving ⇒ a deploy crash-looped.
LC="$(g run services describe lynia-api --region "$REGION" --format='value(status.latestCreatedRevisionName)')"
LR="$(g run services describe lynia-api --region "$REGION" --format='value(status.latestReadyRevisionName)')"
if [ -n "$LC" ] && [ "$LC" != "$LR" ]; then
  bad "lynia-api latest created revision ($LC) never became Ready (serving $LR)" \
      "crash log: gcloud logging read 'resource.type=\"cloud_run_revision\" resource.labels.revision_name=\"'$LC'\"' --project $PROJECT --limit 100"
else
  [ -n "$LC" ] && ok "lynia-api latest created revision is the serving one"
fi
g run services describe otel-collector --region "$REGION" --format='value(status.url)' >/dev/null \
  && ok "otel-collector service" \
  || warn "otel-collector service not deployed (CEO-deferred, LR9)" "gcloud run services replace infra/otel-collector/service.yaml (runbook §3) + otel-collector-config secret"
g secrets describe otel-collector-config --format='value(name)' >/dev/null \
  && ok "secret otel-collector-config" \
  || warn "secret otel-collector-config missing (needed by the collector sidecar)"

hdr "Load balancer / edge"
g compute addresses describe lynia-api-ip --global --format='value(address)' >/dev/null \
  && ok "global IP lynia-api-ip" || bad "global IP missing" "terraform apply (lb.tf)"
CERTSTATUS="$(g compute ssl-certificates describe lynia-api-cert --global --format='value(managed.status)')"
[ "$CERTSTATUS" = "ACTIVE" ] && ok "managed cert $API_DOMAIN ACTIVE" \
  || bad "managed cert lynia-api-cert status=${CERTSTATUS:-absent}" "terraform apply (lb.tf) + DNS A record to the global IP"
g compute security-policies describe lynia-api-armor --format='value(name)' >/dev/null \
  && ok "Cloud Armor policy lynia-api-armor" || bad "Cloud Armor policy missing" "terraform apply (armor.tf)"
if command -v curl >/dev/null; then
  BODY="$(curl -fsS --max-time 10 "https://$API_DOMAIN/healthz" 2>/dev/null)"
  grep -q '"status":"ok"' <<<"$BODY" \
    && ok "live /healthz: $BODY" \
    || bad "live /healthz unreachable or degraded: ${BODY:-<no response>}" "check LB + serving revision"
  SBODY="$(curl -fsS --max-time 10 "https://$STAGING_DOMAIN/healthz" 2>/dev/null)"
  grep -q '"status":"ok"' <<<"$SBODY" \
    && ok "staging /healthz: $SBODY" \
    || warn "staging /healthz unreachable: ${SBODY:-<no response>}" "check staging DNS/cert (staging.tf)"
fi

hdr "Cloud Scheduler (retention purge — runbook §2, NOT in Terraform)"
JOBS="$(g scheduler jobs list --location "$SCHEDULER_REGION" --format='value(name)')"
grep -q "lynia-retention-purge" <<<"$JOBS" \
  && ok "job lynia-retention-purge exists" \
  || bad "job lynia-retention-purge missing — retention purge NEVER runs" \
         "create per runbook §2 in $SCHEDULER_REGION: OIDC SA lynia-run@$PROJECT.iam.gserviceaccount.com, audience https://$API_DOMAIN/admin/retention/purge (or terraform-ize: google_cloud_scheduler_job)"
grep -q "lynia-settlement-autopause" <<<"$JOBS" \
  && ok "job lynia-settlement-autopause exists" \
  || warn "job lynia-settlement-autopause missing" "create per runbook §2"

hdr "Monitoring"
DASH="$(g monitoring dashboards list --format='value(displayName)' | grep -ci lynia)"
[ "${DASH:-0}" -ge 1 ] && ok "monitoring dashboard present" \
  || warn "no Lynia dashboard imported" "gcloud monitoring dashboards create --config-from-file=infra/otel-collector/dashboard.json"
POLICIES="$(g alpha monitoring policies list --format='value(displayName)' 2>/dev/null | grep -c 'SLO\|match_select' )"
[ "${POLICIES:-0}" -ge 1 ] && ok "SLO alert policies present" \
  || warn "no SLO alert policies (slo_alerts_enabled=false)" "flip after the OTel collector is live (monitoring.tf)"

printf '\n%d passed, %d failed, %d warnings\n' "$PASS" "$FAIL" "$WARN"
[ "$FAIL" -eq 0 ] || exit 1
