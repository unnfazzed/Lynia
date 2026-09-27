#!/usr/bin/env bash
# Lynia on Azure: turn on Microsoft Entra sign-in (Easy Auth) for the admin console. Owner-run in
# Azure Cloud Shell (Bash); safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/infra/azure/admin-auth.sh | bash
#
#   Staging:            … | LYNIA_ENV=staging bash
#   More operators:     … | ADMIN_OPERATORS="alice@example.com,bob@example.com" bash
#   New client secret:  … | ROTATE=1 bash
#
# Why (docs/KNOWN_BUGS.md ADM-12): Terraform puts Easy Auth in front of ca-lynia-admin only once it has
# the client id of an Entra app registration (var.admin_auth_client_id) and that app's client secret is
# in Key Vault as ADMIN-ENTRA-CLIENT-SECRET[-STAGING]. Terraform must not generate the secret (S1: it
# would land in state), and assigning people to the app needs rights the CI identity deliberately lacks
# (S5). So this script does that part, with your rights:
#   1. the app registration "lynia-admin-console-<env>": single tenant, ID tokens on, and a redirect URI
#      https://<host>/.auth/login/aad/callback for the app's FQDN and every custom domain;
#   2. its service principal with "Assignment required = Yes", assigned to you (plus ADMIN_OPERATORS).
#      Nobody else in the tenant can sign in at all;
#   3. a client secret, written straight into Key Vault. It is never printed and never on a command
#      line, and it is minted only when the vault has none yet (ROTATE=1 mints a new one);
#   4. the repo Variables AZ_ADMIN_AUTH_CLIENT_ID[_STAGING] (read by terraform-apply-azure.yml) and
#      [STAGING_]ADMIN_CONSOLE_ALLOWED_OPERATORS (read by deploy-admin-azure.yml, which applies the list
#      only once Easy Auth is confirmed on the app: ADM-11).
# Then run Terraform apply (Azure) for this environment, then Deploy Admin Console (Azure). The script
# prints both steps at the end.
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-unnfazzed/Lynia}"
ENVIRONMENT="${LYNIA_ENV:-production}"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
# An app with no app roles is assigned through its "default access" role, the all-zero id.
DEFAULT_ACCESS_ROLE="00000000-0000-0000-0000-000000000000"
# Characters scripts/azure-target.sh accepts in a Variable the Azure workflows read.
ALLOWED_CHARS='^[A-Za-z0-9._:/@,+#-]+$'

say()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ok: %s\n' "$*"; }
warn() { printf '    WARN: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

case "$ENVIRONMENT" in
  production) SHORT=prod;    KV_SUFFIX="";         VAR_SUFFIX="";         ALLOW_VAR=ADMIN_CONSOLE_ALLOWED_OPERATORS;         DEFAULT_HOST=admin.lyniago.com ;;
  staging)    SHORT=staging; KV_SUFFIX="-STAGING"; VAR_SUFFIX="_STAGING"; ALLOW_VAR=STAGING_ADMIN_CONSOLE_ALLOWED_OPERATORS; DEFAULT_HOST="" ;;
  *) die "LYNIA_ENV must be production or staging (got '$ENVIRONMENT')." ;;
esac
# Names MUST match infra/azure/locals.tf and containerapps.tf.
RG="rg-lynia-${SHORT}-san"
APP="ca-lynia-admin"
APP_NAME="lynia-admin-console-${ENVIRONMENT}"
SECRET_NAME="ADMIN-ENTRA-CLIENT-SECRET${KV_SUFFIX}"
CLIENT_ID_VAR="AZ_ADMIN_AUTH_CLIENT_ID${VAR_SUFFIX}"

WORK="$(umask 077 && mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------------------------------------
say "0/4 Who and where ($ENVIRONMENT)"
command -v az >/dev/null 2>&1 || die "az not found. Run this in Azure Cloud Shell (Bash)."
command -v jq >/dev/null 2>&1 || die "jq not found (Cloud Shell ships it)."
az account show >/dev/null 2>&1 || die "Not signed in. Run: az login"
# Piped into bash, stdin is this script: an extension-install prompt would eat it.
az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null 2>&1 || true

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
ME_OID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)"
[ -n "$ME_OID" ] || die "Could not read your Entra user. Cloud Shell must run as a user, not a service principal."
# The name you type at sign-in: your email when the directory has one (a guest's UPN is the
# unreadable name_example.com#EXT#@… form), else the UPN.
ME_NAME="$(az rest --method GET --url 'https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail,otherMails' -o json 2>/dev/null \
  | jq -r '.mail // .otherMails[0] // .userPrincipalName // empty' 2>/dev/null || true)"
# MUST match infra/azure/locals.tf key_vault_name (and bootstrap.sh): substr(sha1(subscription_id), 0, 6).
KV_NAME="${AZ_KEY_VAULT_NAME:-kv-lynia-$(printf '%s' "$SUBSCRIPTION_ID" | sha1sum | cut -c1-6)}"

FQDN="$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || true)"
[ -n "$FQDN" ] || die "$APP was not found in $RG. Run the $ENVIRONMENT Terraform apply first (infra/azure/README.md)."
mapfile -t HOSTS < <(
  {
    printf '%s\n' "$FQDN" "$DEFAULT_HOST" "${ADMIN_HOSTNAME:-}"
    az containerapp show -n "$APP" -g "$RG" --query "properties.configuration.ingress.customDomains[].name" -o tsv 2>/dev/null || true
  } | awk 'NF' | sort -u
)
ok "you:       ${ME_NAME:-$ME_OID}"
ok "app:       $APP in $RG"
ok "key vault: $KV_NAME"

# ---------------------------------------------------------------------------------------------
say "1/4 App registration $APP_NAME"
REDIRECTS=()
for h in "${HOSTS[@]}"; do REDIRECTS+=("https://${h}/.auth/login/aad/callback"); done

APP_ID="$(az ad app list --filter "displayName eq '${APP_NAME}'" --query "[0].appId" -o tsv 2>/dev/null || true)"
if [ -z "$APP_ID" ]; then
  args=(ad app create --display-name "$APP_NAME" --sign-in-audience AzureADMyOrg
        --enable-id-token-issuance true --web-redirect-uris "${REDIRECTS[@]}")
  # Sign-in reads the user's basic profile (Microsoft Graph User.Read), as the portal's own flow does.
  user_read="$(az ad sp show --id "$GRAPH_APP_ID" --query "oauth2PermissionScopes[?value=='User.Read'].id | [0]" -o tsv 2>/dev/null || true)"
  if [ -n "$user_read" ]; then
    printf '[{"resourceAppId":"%s","resourceAccess":[{"id":"%s","type":"Scope"}]}]' "$GRAPH_APP_ID" "$user_read" > "$WORK/rra.json"
    args+=(--required-resource-accesses "@$WORK/rra.json")
  fi
  APP_ID="$(az "${args[@]}" --query appId -o tsv)"
  [ -n "$APP_ID" ] || die "Could not create the app registration $APP_NAME."
  ok "created (client id $APP_ID)"
else
  # Keep every redirect URI already registered; add the app's current hosts.
  mapfile -t URIS < <(
    { az ad app show --id "$APP_ID" --query "web.redirectUris[]" -o tsv 2>/dev/null || true
      printf '%s\n' "${REDIRECTS[@]}"; } | awk 'NF' | sort -u
  )
  az ad app update --id "$APP_ID" --enable-id-token-issuance true --web-redirect-uris "${URIS[@]}"
  ok "exists (client id $APP_ID): ID tokens and redirect URIs re-asserted"
fi
for u in "${REDIRECTS[@]}"; do ok "redirect URI $u"; done

# ---------------------------------------------------------------------------------------------
say "2/4 Service principal: assignment required, operators assigned"
SP_ID=""
for _ in $(seq 1 12); do
  SP_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || true)"
  [ -n "$SP_ID" ] && break
  # A brand-new app registration can take a few seconds to replicate.
  az ad sp create --id "$APP_ID" -o none >/dev/null 2>&1 || true
  sleep 5
done
[ -n "$SP_ID" ] || die "Could not create the service principal for $APP_ID. Wait a minute and re-run."
az ad sp update --id "$APP_ID" --set appRoleAssignmentRequired=true >/dev/null
ok "assignment required = yes"
# Consent once for the tenant, so an operator is never stopped by "Need admin approval".
if az ad app permission admin-consent --id "$APP_ID" >/dev/null 2>&1; then
  ok "admin consent granted (sign-in + basic profile)"
else
  warn "could not grant admin consent; your first sign-in will ask for it instead"
fi

# UPN, email or object id → object id ("" when there is no such user in this tenant).
resolve_user() {
  local who="$1" oid
  oid="$(az ad user show --id "$who" --query id -o tsv 2>/dev/null || true)"
  [ -n "$oid" ] || oid="$(az ad user list --filter "mail eq '${who}'" --query "[0].id" -o tsv 2>/dev/null || true)"
  printf '%s' "$oid"
}

OIDS=("$ME_OID")
IFS=',' read -r -a EXTRA <<<"${ADMIN_OPERATORS:-}"
for who in "${EXTRA[@]}"; do
  who="$(printf '%s' "$who" | tr -d '[:space:]')"
  [ -n "$who" ] || continue
  oid="$(resolve_user "$who")"
  if [ -z "$oid" ]; then
    warn "no user '$who' in this tenant, skipped. Invite them first (Entra ID → Users → Invite external user), then re-run."
    continue
  fi
  OIDS+=("$oid")
done

ASSIGNED="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/${SP_ID}/appRoleAssignedTo" \
  --query "value[].principalId" -o tsv 2>/dev/null || true)"
: > "$WORK/names"
for oid in $(printf '%s\n' "${OIDS[@]}" | sort -u); do
  if ! printf '%s\n' "$ASSIGNED" | grep -qx -- "$oid"; then
    printf '{"principalId":"%s","resourceId":"%s","appRoleId":"%s"}' "$oid" "$SP_ID" "$DEFAULT_ACCESS_ROLE" > "$WORK/body.json"
    az rest --method POST \
      --url "https://graph.microsoft.com/v1.0/servicePrincipals/${SP_ID}/appRoleAssignedTo" \
      --headers "Content-Type=application/json" --body "@$WORK/body.json" >/dev/null
  fi
  # Easy Auth's X-MS-CLIENT-PRINCIPAL-NAME is an email or the UPN, depending on the account type, so
  # every one of them goes on the app-level allowlist. The console's 403 names the identity it saw if
  # none matches.
  az rest --method GET --url "https://graph.microsoft.com/v1.0/users/${oid}?\$select=userPrincipalName,mail,otherMails" -o json 2>/dev/null \
    | jq -r '([.userPrincipalName, .mail] + (.otherMails // []))[] | select(. != null and . != "")' >> "$WORK/names" || true
  ok "assigned: $(az ad user show --id "$oid" --query userPrincipalName -o tsv 2>/dev/null || echo "$oid")"
done

# ---------------------------------------------------------------------------------------------
say "3/4 Client secret → Key Vault $KV_NAME ($SECRET_NAME; the value is never shown)"
EXISTING="$(az keyvault secret list --vault-name "$KV_NAME" --query "[].name" -o tsv 2>/dev/null)" \
  || die "Cannot list secrets in $KV_NAME. You need 'Key Vault Secrets Officer' on it (bootstrap.sh grants it)."
if printf '%s\n' "$EXISTING" | grep -qx -- "$SECRET_NAME" && [ "${ROTATE:-0}" != "1" ]; then
  ok "$SECRET_NAME exists (left untouched; ROTATE=1 mints a new one)"
else
  for i in $(seq 1 6); do
    # --append keeps any older secret valid, so a rotation never breaks sign-in mid-way.
    if ( umask 077
         az ad app credential reset --id "$APP_ID" --append --display-name "easy-auth-${ENVIRONMENT}" --years 2 \
           --query password -o tsv 2>/dev/null | tr -d '\r\n' > "$WORK/s" ) && [ -s "$WORK/s" ]; then
      break
    fi
    [ "$i" = "6" ] && die "Could not create a client secret for $APP_ID. Wait a minute and re-run."
    sleep 10
  done
  az keyvault secret set --vault-name "$KV_NAME" -n "$SECRET_NAME" --file "$WORK/s" --encoding utf-8 \
    --content-type "Entra client secret for admin Easy Auth (infra/azure/admin-auth.sh)" -o none
  rm -f "$WORK/s"
  ok "$SECRET_NAME stored (valid 2 years; a running app picks up a rotated value within about 30 minutes)"
fi

# ---------------------------------------------------------------------------------------------
say "4/4 GitHub Variables"
HAVE_GH=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then HAVE_GH=1; fi
CURRENT=""
[ "$HAVE_GH" = 0 ] || CURRENT="$(gh variable get "$ALLOW_VAR" -R "$GITHUB_REPO" 2>/dev/null || true)"
# The existing list is kept (names added by hand survive a re-run); new names are added to it.
: > "$WORK/allow"
while IFS= read -r n; do
  n="$(printf '%s' "$n" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [ -n "$n" ] || continue
  if [[ "$n" =~ $ALLOWED_CHARS ]]; then
    printf '%s\n' "$n" >> "$WORK/allow"
  else
    warn "'$n' has a character the deploy workflow refuses; left off the allowlist."
  fi
done < <(cat "$WORK/names"; printf '%s\n' "$CURRENT" | tr ',' '\n')  # \n: read drops an unterminated last line
ALLOWLIST="$(sort -u "$WORK/allow" | paste -sd, -)"
[ -n "$ALLOWLIST" ] || die "No usable operator identity was found for the allowlist."

if [ "$HAVE_GH" = 1 ]; then
  gh variable set "$CLIENT_ID_VAR" -R "$GITHUB_REPO" -b "$APP_ID" >/dev/null
  gh variable set "$ALLOW_VAR" -R "$GITHUB_REPO" -b "$ALLOWLIST" >/dev/null
  ok "$CLIENT_ID_VAR = $APP_ID"
  ok "$ALLOW_VAR = $ALLOWLIST"
else
  warn "gh is not installed or not signed in (gh auth login). Set these two by hand:"
  warn "repo → Settings → Secrets and variables → Actions → Variables"
  warn "(if $ALLOW_VAR already has names, keep them and add these, comma-separated)"
  printf '      %s = %s\n      %s = %s\n' "$CLIENT_ID_VAR" "$APP_ID" "$ALLOW_VAR" "$ALLOWLIST"
fi

SIGN_IN_HOST="${DEFAULT_HOST:-$FQDN}"
cat <<EOF

Next, in GitHub → Actions:
  1. "Terraform apply (Azure)": environment $ENVIRONMENT, action apply, then approve it twice.
     This turns Easy Auth on in front of $APP.
  2. "Deploy Admin Console (Azure)": environment $ENVIRONMENT.
     This applies the operator allowlist now that Easy Auth is on, and checks that a forged identity is refused.
  3. Open https://${SIGN_IN_HOST} and sign in as ${ME_NAME:-yourself}.
EOF
