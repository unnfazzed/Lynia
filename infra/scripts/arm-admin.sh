#!/usr/bin/env bash
# Arm the admin console (docs/plans/2026-admin-console-arming.md) in ONE run from an authenticated
# shell (GCP Cloud Shell, or anywhere with gcloud + terraform + gh logged in to the right project/repo).
#
# It cannot be run from the Claude coding-agent session — that sandbox holds no GCP/DNS credentials by
# design. Run it yourself where your project creds live. It does everything except the DNS A record
# (the one step that lives with your DNS provider), which it prints at the end.
#
# What it does, in order:
#   1. Enable IAP + create the IAP OAuth brand/client (captures id + secret).
#   2. terraform apply the admin tier (admin.tf) — PLAN IS SHOWN AND YOU CONFIRM before apply.
#   3. Mint a LONG-LIVED admin JWT and store it as the ADMIN_API_TOKEN secret version.
#   4. Set the repo Actions Variables from the terraform outputs (via gh).
#   5. Print the DNS record + next steps (the agent triggers the deploy from GitHub after DNS).
#
# It is re-runnable: existing brand/client/secret are detected and reused, not duplicated.
set -euo pipefail

# ---- Edit these four, then run: bash infra/scripts/arm-admin.sh ----
PROJECT_ID="${PROJECT_ID:-lynia-500911}"
REGION="${REGION:-africa-south1}"
API_DOMAIN="${API_DOMAIN:-lyniago.lyniafinance.com}"       # the console calls https://<API_DOMAIN>
GITHUB_REPO="${GITHUB_REPO:-unnfazzed/Lynia}"              # owner/repo for `gh variable set`
# Operators allowed through IAP (Workspace identities). Space-separated. MFA is enforced in Workspace.
IAP_MEMBERS="${IAP_MEMBERS:-group:ops@lyniafinance.com}"
SUPPORT_EMAIL="${SUPPORT_EMAIL:-$(gcloud config get-value account 2>/dev/null)}"
# --------------------------------------------------------------------

TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

say "1. IAP OAuth brand + client"
gcloud services enable iap.googleapis.com --project "$PROJECT_ID" >/dev/null
BRAND="$(gcloud iap oauth-brands list --project "$PROJECT_ID" --format='value(name)' | head -1 || true)"
if [ -z "$BRAND" ]; then
  gcloud iap oauth-brands create --application_title="Lynia Admin" --support_email="$SUPPORT_EMAIL" \
    --project "$PROJECT_ID" >/dev/null
  BRAND="$(gcloud iap oauth-brands list --project "$PROJECT_ID" --format='value(name)' | head -1)"
fi
CLIENT="$(gcloud iap oauth-clients list "$BRAND" --project "$PROJECT_ID" \
  --format='value(name)' --filter='displayName=lynia-admin-iap' | head -1 || true)"
if [ -z "$CLIENT" ]; then
  gcloud iap oauth-clients create "$BRAND" --display_name=lynia-admin-iap --project "$PROJECT_ID" >/dev/null
  CLIENT="$(gcloud iap oauth-clients list "$BRAND" --project "$PROJECT_ID" \
    --format='value(name)' --filter='displayName=lynia-admin-iap' | head -1)"
fi
IAP_CLIENT_ID="${CLIENT##*/}"
IAP_CLIENT_SECRET="$(gcloud iap oauth-clients describe "$CLIENT" --project "$PROJECT_ID" \
  --format='value(secret)')"
echo "IAP client: $IAP_CLIENT_ID"

say "2. terraform apply (admin tier) — review the plan, then confirm"
MEMBERS_HCL="$(printf '"%s", ' $IAP_MEMBERS)"; MEMBERS_HCL="[${MEMBERS_HCL%, }]"
cat > "$TF_DIR/admin.auto.tfvars" <<EOF
admin_enabled                 = true
admin_iap_oauth_client_id     = "$IAP_CLIENT_ID"
admin_iap_oauth_client_secret = "$IAP_CLIENT_SECRET"
admin_iap_members             = $MEMBERS_HCL
EOF
chmod 600 "$TF_DIR/admin.auto.tfvars"   # holds the client secret — keep it out of VCS (.gitignore covers *.auto.tfvars)
( cd "$TF_DIR" && terraform init -input=false >/dev/null && terraform plan -out=admin.tfplan )
read -r -p $'\nApply this plan? It touches the SHARED ALB (additions only). Type yes to apply: ' ok
[ "$ok" = "yes" ] || { echo "Aborted before apply. Nothing changed."; exit 1; }
( cd "$TF_DIR" && terraform apply admin.tfplan )

say "3. Mint the long-lived admin token → ADMIN_API_TOKEN"
# AdminGuard checks role:"admin"; JwtAuthGuard verifies HS256 over JWT_SIGNING_SECRET. NOT signAccess
# (that stamps a 15-min expiry) — a directly-signed long-lived token is what a static console needs.
SECRET="$(gcloud secrets versions access latest --secret=JWT_SIGNING_SECRET --project "$PROJECT_ID")"
if [ ! -d node_modules/jsonwebtoken ] && [ ! -d "$TF_DIR/../../node_modules/jsonwebtoken" ]; then
  echo "(installing jsonwebtoken locally for the mint step)"; npm i --no-save jsonwebtoken >/dev/null 2>&1 || true
fi
ADMIN_TOKEN="$(SECRET="$SECRET" node -e '
  const jwt=require("jsonwebtoken");
  process.stdout.write(jwt.sign({role:"admin"}, process.env.SECRET,
    {subject:"admin-console", algorithm:"HS256", expiresIn:"365d"}));
')"
printf '%s' "$ADMIN_TOKEN" | gcloud secrets versions add ADMIN_API_TOKEN --data-file=- --project "$PROJECT_ID"
unset SECRET ADMIN_TOKEN

say "4. Set repo Actions Variables (via gh)"
AUD="$(cd "$TF_DIR" && terraform output -raw ADMIN_CONSOLE_IAP_AUDIENCE)"
ADMIN_SA="$(cd "$TF_DIR" && terraform output -raw ADMIN_CLOUD_RUN_SERVICE_ACCOUNT)"
LB_IP="$(cd "$TF_DIR" && terraform output -raw load_balancer_ip)"
if command -v gh >/dev/null 2>&1; then
  gh variable set ADMIN_CLOUD_RUN_SERVICE        --repo "$GITHUB_REPO" --body "lynia-admin"
  gh variable set ADMIN_CLOUD_RUN_SERVICE_ACCOUNT --repo "$GITHUB_REPO" --body "$ADMIN_SA"
  gh variable set ADMIN_CONSOLE_IAP_AUDIENCE     --repo "$GITHUB_REPO" --body "$AUD"
  gh variable set ADMIN_API_BASE_URL             --repo "$GITHUB_REPO" --body "https://$API_DOMAIN"
  gh variable set GCP_ADMIN_ENABLED              --repo "$GITHUB_REPO" --body "true"   # arms deploy-admin.yml
else
  echo "gh not found — set these repo Variables by hand:"
  echo "  ADMIN_CLOUD_RUN_SERVICE=lynia-admin"
  echo "  ADMIN_CLOUD_RUN_SERVICE_ACCOUNT=$ADMIN_SA"
  echo "  ADMIN_CONSOLE_IAP_AUDIENCE=$AUD"
  echo "  ADMIN_API_BASE_URL=https://$API_DOMAIN"
  echo "  GCP_ADMIN_ENABLED=true"
fi

say "5. LAST STEP (you): DNS"
echo "Create an A record:  lyniagoadmin.lyniafinance.com  ->  $LB_IP"
echo "Then push any apps/admin change (or run the Deploy Admin Console workflow) — the agent can"
echo "trigger + babysit it. Managed cert goes ACTIVE within ~30 min; first request may 503 until then."
