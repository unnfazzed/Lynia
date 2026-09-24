#!/usr/bin/env bash
# Lynia on Azure: one-time (and safely re-runnable) bootstrap for Azure Cloud Shell (Bash).
#
#   curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/infra/azure/bootstrap.sh | bash
#   (or: git clone … && bash infra/azure/bootstrap.sh)
#
# Plan: docs/plans/2026-09-24-gcp-to-azure-migration.md, X2 (bootstrap < 5 min, Terraform only in
# CI), E14 (per-environment OIDC identities), S1 (no app secrets in Terraform state), S5 (branch
# policies, least-privilege CI roles). README: infra/azure/README.md.
#
# It creates ONLY the trust root, all in rg-lynia-tfstate:
#   1. the Terraform state account (versioned, Entra-only data plane, shared key off, private);
#   2. the Key Vault (RBAC mode, purge protection), shared by staging (-STAGING names) and prod;
#   3. three CI identities with GitHub federated credentials:
#        id-lynia-infra              ← repo:<repo>:environment:infra
#        id-lynia-deploy-staging     ← repo:<repo>:environment:staging
#        id-lynia-deploy-production  ← repo:<repo>:environment:production
#   4. the infra identity's roles (Contributor + a CONSTRAINED role-assignment right; never Owner
#      or User Access Administrator) and Graph Application.ReadWrite.OwnedBy;
#   5. the four app secrets per environment, generated straight into Key Vault ONLY IF ABSENT:
#        JWT-SIGNING-SECRET, PII-ENCRYPTION-KEY, TOKEN-HASH-SECRET, ADMIN-API-TOKEN (+ -STAGING);
#   6. after Terraform's first apply of an environment: the one Scheduler.Invoke app-role
#      assignment (it needs tenant-admin rights the CI identity deliberately lacks);
#   7. prints the GitHub Variables block, and sets them (plus environment branch policies) with
#      `gh` if gh is installed and authenticated.
#
# WHY THE VAULT IS CREATED HERE (not by Terraform, and not by a separate seed script):
# the container apps reference these secrets at creation, so they must exist before Terraform's
# first apply, and S1 forbids Terraform from generating them. Creating the vault here lets one
# idempotent script seed them in the same sitting; Terraform reads the vault and asserts its
# hardening (infra/azure/keyvault.tf). It also keeps root secrets outside every environment's
# destroy blast radius.
#
# Secret values are never printed, never passed on a command line, and never written anywhere
# but a 0600 temp file in a 0700 temp dir that is removed on exit.

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-unnfazzed/Lynia}"
LOCATION="${LOCATION:-southafricanorth}"
RG="rg-lynia-tfstate"
STATE_CONTAINER="tfstate"
OIDC_ISSUER="https://token.actions.githubusercontent.com"
OIDC_AUDIENCE="api://AzureADTokenExchange"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
# Must match infra/azure/entra.tf local.scheduler_app_role_id.
SCHEDULER_APP_ROLE_ID="5d0b2f3c-8a41-4c6e-9b7a-2f1e6c9d4a10"

say()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ok: %s\n' "$*"; }
warn() { printf '    WARN: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

WORK="$(umask 077 && mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------------------------------------
say "0/7 Who and where"
command -v az >/dev/null 2>&1 || die "az not found. Run this in Azure Cloud Shell (Bash)."
command -v openssl >/dev/null 2>&1 || die "openssl not found."
command -v python3 >/dev/null 2>&1 || die "python3 not found (Cloud Shell ships it)."
az account show >/dev/null 2>&1 || die "Not signed in. Run: az login"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
SUB_NAME="$(az account show --query name -o tsv)"
ME_OID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)"
[ -n "$ME_OID" ] || die "Could not read your Entra user. Cloud Shell must run as a user, not a service principal."

# Deterministic suffix. MUST match infra/azure/locals.tf: substr(sha1(subscription_id), 0, 6).
SUFFIX="$(printf '%s' "$SUBSCRIPTION_ID" | sha1sum | cut -c1-6)"
STATE_ACCOUNT="stlyniatf${SUFFIX}"
KV_NAME="kv-lynia-${SUFFIX}"

ok "subscription: $SUB_NAME ($SUBSCRIPTION_ID)"
ok "tenant:       $TENANT_ID"
ok "repo:         $GITHUB_REPO   region: $LOCATION"

for p in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.Cache \
         Microsoft.KeyVault Microsoft.Storage Microsoft.Network Microsoft.OperationalInsights \
         Microsoft.ManagedIdentity Microsoft.Insights Microsoft.Consumption; do
  state="$(az provider show -n "$p" --query registrationState -o tsv 2>/dev/null || echo NotRegistered)"
  if [ "$state" != "Registered" ]; then
    az provider register -n "$p" >/dev/null
    ok "registering provider $p (finishes in the background)"
  fi
done

# ---------------------------------------------------------------------------------------------
say "1/7 Resource group + Terraform state account"
az group create -n "$RG" -l "$LOCATION" --tags app=lynia managed_by=bootstrap >/dev/null
ok "$RG"

if az storage account show -g "$RG" -n "$STATE_ACCOUNT" >/dev/null 2>&1; then
  ok "$STATE_ACCOUNT exists"
else
  az storage account create -g "$RG" -n "$STATE_ACCOUNT" -l "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 --https-only true --min-tls-version TLS1_2 \
    --allow-blob-public-access false --allow-shared-key-access false \
    --default-action Allow --tags app=lynia managed_by=bootstrap >/dev/null
  ok "$STATE_ACCOUNT created"
fi
# Re-assert the hardening every run (S1): Entra-only data plane, no public blobs.
az storage account update -g "$RG" -n "$STATE_ACCOUNT" \
  --allow-shared-key-access false --allow-blob-public-access false --min-tls-version TLS1_2 >/dev/null
az storage account blob-service-properties update -g "$RG" --account-name "$STATE_ACCOUNT" \
  --enable-versioning true --enable-delete-retention true --delete-retention-days 30 \
  --enable-container-delete-retention true --container-delete-retention-days 30 >/dev/null
# ARM-plane create: works before any data-plane role has propagated. Blob leases do the locking.
az storage container-rm create -g "$RG" --storage-account "$STATE_ACCOUNT" -n "$STATE_CONTAINER" \
  --public-access off >/dev/null
ok "container $STATE_CONTAINER (versioning + 30-day soft delete)"
STATE_ACCOUNT_ID="$(az storage account show -g "$RG" -n "$STATE_ACCOUNT" --query id -o tsv)"

# ---------------------------------------------------------------------------------------------
say "2/7 Key Vault"
if az keyvault show -n "$KV_NAME" >/dev/null 2>&1; then
  ok "$KV_NAME exists"
elif [ -n "$(az keyvault list-deleted --query "[?name=='$KV_NAME'].name" -o tsv 2>/dev/null)" ]; then
  az keyvault recover -n "$KV_NAME" >/dev/null
  ok "$KV_NAME recovered from soft delete"
else
  az keyvault create -g "$RG" -n "$KV_NAME" -l "$LOCATION" \
    --enable-rbac-authorization true --enable-purge-protection true --retention-days 90 \
    --tags app=lynia managed_by=bootstrap >/dev/null
  ok "$KV_NAME created (RBAC, purge protection)"
fi
az keyvault update -n "$KV_NAME" --enable-rbac-authorization true >/dev/null
if [ "$(az keyvault show -n "$KV_NAME" --query properties.enablePurgeProtection -o tsv)" != "true" ]; then
  az keyvault update -n "$KV_NAME" --enable-purge-protection true >/dev/null
fi
KV_ID="$(az keyvault show -n "$KV_NAME" --query id -o tsv)"

# ---------------------------------------------------------------------------------------------
say "3/7 CI identities + GitHub federated credentials"
declare -A IDENT_FOR=(
  [infra]="id-lynia-infra"
  [staging]="id-lynia-deploy-staging"
  [production]="id-lynia-deploy-production"
)
declare -A CLIENT_ID PRINCIPAL_ID
for env in infra staging production; do
  name="${IDENT_FOR[$env]}"
  if ! az identity show -g "$RG" -n "$name" >/dev/null 2>&1; then
    az identity create -g "$RG" -n "$name" -l "$LOCATION" --tags app=lynia managed_by=bootstrap >/dev/null
  fi
  CLIENT_ID[$env]="$(az identity show -g "$RG" -n "$name" --query clientId -o tsv)"
  PRINCIPAL_ID[$env]="$(az identity show -g "$RG" -n "$name" --query principalId -o tsv)"
  subject="repo:${GITHUB_REPO}:environment:${env}"
  if az identity federated-credential show -g "$RG" --identity-name "$name" -n "github-${env}" >/dev/null 2>&1; then
    current="$(az identity federated-credential show -g "$RG" --identity-name "$name" -n "github-${env}" --query subject -o tsv)"
    [ "$current" = "$subject" ] || die "$name/github-${env} trusts '$current', expected '$subject'. Delete it and re-run."
  else
    az identity federated-credential create -g "$RG" --identity-name "$name" -n "github-${env}" \
      --issuer "$OIDC_ISSUER" --subject "$subject" --audiences "$OIDC_AUDIENCE" >/dev/null
  fi
  ok "$name  ← $subject"
done

# ---------------------------------------------------------------------------------------------
say "4/7 Roles (least privilege; never Owner / User Access Administrator for CI)"

# ensure_role <principal-object-id> <principal-type> <role name> <scope>
ensure_role() {
  local pid="$1" ptype="$2" role="$3" scope="$4" n
  n="$(az role assignment list --assignee-object-id "$pid" --role "$role" --scope "$scope" \
        --query "length([?condition==null])" -o tsv 2>/dev/null || echo 0)"
  if [ "${n:-0}" = "0" ]; then
    az role assignment create --assignee-object-id "$pid" --assignee-principal-type "$ptype" \
      --role "$role" --scope "$scope" >/dev/null
  fi
  ok "$role @ ${scope##*/}"
}

SUB_SCOPE="/subscriptions/$SUBSCRIPTION_ID"
INFRA_PID="${PRINCIPAL_ID[infra]}"

# Terraform creates resources in the environment groups.
ensure_role "$INFRA_PID" ServicePrincipal "Contributor" "$SUB_SCOPE"
# Terraform state (Entra data plane).
ensure_role "$INFRA_PID" ServicePrincipal "Storage Blob Data Contributor" "$STATE_ACCOUNT_ID"
# Terraform writes DATABASE-URL / REDIS-URL (the two accepted S1 exceptions).
ensure_role "$INFRA_PID" ServicePrincipal "Key Vault Secrets Officer" "$KV_ID"
# You: seed the app secrets below.
ensure_role "$ME_OID" User "Key Vault Secrets Officer" "$KV_ID"

# Terraform also has to CREATE role assignments (runtime + deploy identities). Grant that with
# "Role Based Access Control Administrator" under an ABAC condition that only permits assigning
# (or removing) exactly the roles infra/azure uses. It cannot grant Owner, User Access
# Administrator, Contributor, or itself anything new.
ALLOWED_ROLES=(
  "AcrPull" "AcrPush" "Storage Blob Data Contributor" "Storage Blob Delegator"
  "Key Vault Secrets User" "Container Apps Contributor" "Monitoring Reader"
  "Log Analytics Reader" "Managed Identity Operator"
)
guids=()
for r in "${ALLOWED_ROLES[@]}"; do
  g="$(az role definition list --name "$r" --query "[0].name" -o tsv)"
  [ -n "$g" ] || die "Built-in role '$r' not found in this tenant."
  guids+=("$g")
done
GUID_SET="$(IFS=,; printf '%s' "${guids[*]}" | sed 's/,/, /g')"
CONDITION="((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${GUID_SET}})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${GUID_SET}}))"
RBAC_ADMIN="Role Based Access Control Administrator"
existing_id="$(az role assignment list --assignee-object-id "$INFRA_PID" --role "$RBAC_ADMIN" \
  --scope "$SUB_SCOPE" --query "[0].id" -o tsv 2>/dev/null || true)"
if [ -n "$existing_id" ]; then
  current_cond="$(az role assignment list --assignee-object-id "$INFRA_PID" --role "$RBAC_ADMIN" --scope "$SUB_SCOPE" --query "[0].condition" -o tsv)"
  if [ "$current_cond" != "$CONDITION" ]; then
    az role assignment delete --ids "$existing_id" >/dev/null
    existing_id=""
  fi
fi
if [ -z "$existing_id" ]; then
  az role assignment create --assignee-object-id "$INFRA_PID" --assignee-principal-type ServicePrincipal \
    --role "$RBAC_ADMIN" --scope "$SUB_SCOPE" \
    --condition "$CONDITION" --condition-version "2.0" >/dev/null
fi
ok "$RBAC_ADMIN @ subscription, constrained to ${#ALLOWED_ROLES[@]} roles"

# Graph: let Terraform create (and own) the scheduler app registration. OwnedBy = it can only
# touch applications it created.
GRAPH_SP="$(az ad sp show --id "$GRAPH_APP_ID" --query id -o tsv)"
OWNEDBY_ROLE="$(az ad sp show --id "$GRAPH_APP_ID" --query "appRoles[?value=='Application.ReadWrite.OwnedBy'].id | [0]" -o tsv)"
have="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/${INFRA_PID}/appRoleAssignments" \
  --query "length(value[?appRoleId=='${OWNEDBY_ROLE}'])" -o tsv)"
if [ "${have:-0}" = "0" ]; then
  printf '{"principalId":"%s","resourceId":"%s","appRoleId":"%s"}' "$INFRA_PID" "$GRAPH_SP" "$OWNEDBY_ROLE" > "$WORK/body.json"
  az rest --method POST \
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/${INFRA_PID}/appRoleAssignments" \
    --headers "Content-Type=application/json" --body "@$WORK/body.json" >/dev/null
fi
ok "Graph Application.ReadWrite.OwnedBy → id-lynia-infra"

# ---------------------------------------------------------------------------------------------
say "5/7 App secrets (generated only if absent; values never shown)"

# Existing names, read ONCE with retries. A permission error (your new role still propagating)
# must never be mistaken for "absent": that would overwrite a live PII key.
EXISTING=""
for i in $(seq 1 12); do
  if EXISTING="$(az keyvault secret list --vault-name "$KV_NAME" --query "[].name" -o tsv 2>/dev/null)"; then
    break
  fi
  [ "$i" = "12" ] && die "Cannot list secrets in $KV_NAME. Check you hold 'Key Vault Secrets Officer' on it, then re-run."
  [ "$i" = "1" ] && printf '    waiting for Key Vault permission to propagate'
  printf '.'
  sleep 10
done
printf '\n'
secret_exists() { printf '%s\n' "$EXISTING" | grep -qx -- "$1"; }

# put_secret <name> <file>. Retries while your new Key Vault role propagates (can take ~2 min).
put_secret() {
  local name="$1" file="$2" i
  for i in $(seq 1 12); do
    if az keyvault secret set --vault-name "$KV_NAME" -n "$name" --file "$file" --encoding utf-8 \
         --query id -o none 2>/dev/null; then
      return 0
    fi
    [ "$i" = "1" ] && printf '    waiting for Key Vault permission to propagate'
    printf '.'
    sleep 10
  done
  printf '\n'
  die "Could not write $name. Check you hold 'Key Vault Secrets Officer' on $KV_NAME, then re-run."
}

for suffix in "" "-STAGING"; do
  label="${suffix:+staging}"; label="${label:-production}"
  for base in JWT-SIGNING-SECRET PII-ENCRYPTION-KEY TOKEN-HASH-SECRET; do
    name="${base}${suffix}"
    if secret_exists "$name"; then
      ok "$name exists (left untouched)"
      continue
    fi
    ( umask 077; openssl rand -hex 48 | tr -d '\n' > "$WORK/v" )
    put_secret "$name" "$WORK/v"
    rm -f "$WORK/v"
    ok "$name generated ($label)"
  done

  # ADMIN-API-TOKEN: a long-lived admin JWT, HS256 over this environment's JWT secret, the
  # same claim shape infra/scripts/arm-admin.sh mints: {role:"admin", sub:"admin-console"}.
  name="ADMIN-API-TOKEN${suffix}"
  if secret_exists "$name"; then
    ok "$name exists (left untouched)"
  else
    ( umask 077
      az keyvault secret show --vault-name "$KV_NAME" -n "JWT-SIGNING-SECRET${suffix}" \
        --query value -o tsv | tr -d '\n' > "$WORK/k" )
    [ -s "$WORK/k" ] || die "Could not read JWT-SIGNING-SECRET${suffix} to mint $name."
    # Minted in python so the signing key is read from the file, never placed on a command line.
    ( umask 077; python3 - "$WORK/k" "$WORK/v" <<'PY'
import base64, hashlib, hmac, json, sys, time
key = open(sys.argv[1], "rb").read()
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
now = int(time.time())
head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
body = b64(json.dumps({"role": "admin", "sub": "admin-console", "iat": now,
                       "exp": now + 365 * 24 * 3600}, separators=(",", ":")).encode())
sig = b64(hmac.new(key, head + b"." + body, hashlib.sha256).digest())
open(sys.argv[2], "wb").write(head + b"." + body + b"." + sig)
PY
    )
    put_secret "$name" "$WORK/v"
    rm -f "$WORK/v" "$WORK/k"
    ok "$name minted ($label, expires in 365 days)"
  fi
done

# ---------------------------------------------------------------------------------------------
say "6/7 Scheduler.Invoke link (only once Terraform has applied an environment)"
for env in staging production; do
  short="$([ "$env" = production ] && echo prod || echo staging)"
  jobs_pid="$(az identity show -g "rg-lynia-${short}-san" -n "id-lynia-jobs-${short}" --query principalId -o tsv 2>/dev/null || true)"
  res_sp="$(az ad sp list --display-name "lynia-scheduler-${env}" --query "[0].id" -o tsv 2>/dev/null || true)"
  if [ -z "$jobs_pid" ] || [ -z "$res_sp" ]; then
    ok "$env: not applied yet — re-run this script after its first terraform apply"
    continue
  fi
  have="$(az rest --method GET \
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/${res_sp}/appRoleAssignedTo" \
    --query "length(value[?principalId=='${jobs_pid}' && appRoleId=='${SCHEDULER_APP_ROLE_ID}'])" -o tsv)"
  if [ "${have:-0}" = "0" ]; then
    printf '{"principalId":"%s","resourceId":"%s","appRoleId":"%s"}' "$jobs_pid" "$res_sp" "$SCHEDULER_APP_ROLE_ID" > "$WORK/body.json"
    az rest --method POST \
      --url "https://graph.microsoft.com/v1.0/servicePrincipals/${res_sp}/appRoleAssignedTo" \
      --headers "Content-Type=application/json" --body "@$WORK/body.json" >/dev/null
  fi
  ok "$env: Scheduler.Invoke → id-lynia-jobs-${short}"
done

# ---------------------------------------------------------------------------------------------
say "7/7 GitHub Variables"
declare -A VARS=(
  [AZURE_TENANT_ID]="$TENANT_ID"
  [AZURE_SUBSCRIPTION_ID]="$SUBSCRIPTION_ID"
  [AZURE_CLIENT_ID_INFRA]="${CLIENT_ID[infra]}"
  [AZURE_CLIENT_ID_STAGING]="${CLIENT_ID[staging]}"
  [AZURE_CLIENT_ID_PRODUCTION]="${CLIENT_ID[production]}"
  [AZ_TFSTATE_RESOURCE_GROUP]="$RG"
  [AZ_TFSTATE_STORAGE_ACCOUNT]="$STATE_ACCOUNT"
  [AZ_TFSTATE_CONTAINER]="$STATE_CONTAINER"
  [AZ_KEY_VAULT_NAME]="$KV_NAME"
)
ORDER=(AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID AZURE_CLIENT_ID_INFRA AZURE_CLIENT_ID_STAGING
       AZURE_CLIENT_ID_PRODUCTION AZ_TFSTATE_RESOURCE_GROUP AZ_TFSTATE_STORAGE_ACCOUNT
       AZ_TFSTATE_CONTAINER AZ_KEY_VAULT_NAME)

echo "    Repo → Settings → Secrets and variables → Actions → Variables (none of these is secret):"
for k in "${ORDER[@]}"; do printf '      %-28s = %s\n' "$k" "${VARS[$k]}"; done

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  for k in "${ORDER[@]}"; do
    gh variable set "$k" --repo "$GITHUB_REPO" --body "${VARS[$k]}" >/dev/null
  done
  ok "set with gh"

  # S5: every OIDC environment deploys from main only; infra also needs your approval (E14).
  me_id="$(gh api user --jq .id)"
  for env in staging production infra; do
    if [ "$env" = infra ]; then
      printf '{"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$me_id" > "$WORK/env.json"
    else
      printf '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' > "$WORK/env.json"
    fi
    gh api -X PUT "repos/${GITHUB_REPO}/environments/${env}" --input "$WORK/env.json" >/dev/null
    if [ "$(gh api "repos/${GITHUB_REPO}/environments/${env}/deployment-branch-policies" \
            --jq '[.branch_policies[] | select(.name=="main" and .type=="branch")] | length')" = "0" ]; then
      gh api -X POST "repos/${GITHUB_REPO}/environments/${env}/deployment-branch-policies" \
        -f name=main -f type=branch >/dev/null
    fi
    if [ "$env" = infra ]; then ok "environment infra: main only + your approval"; else ok "environment $env: main only"; fi
  done
else
  warn "gh is not installed or not signed in: set the Variables above by hand, and in"
  warn "Settings → Environments give staging, production and infra a 'Selected branches: main'"
  warn "deployment policy (infra also: Required reviewers = you)."
fi

say "Done. Next: dispatch 'Terraform apply (Azure)' for staging from GitHub, then re-run this script once."
