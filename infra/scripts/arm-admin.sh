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

# ---- Set these, then run: IAP_CLIENT_ID=… IAP_CLIENT_SECRET=… IAP_MEMBERS=… bash infra/scripts/arm-admin.sh
PROJECT_ID="${PROJECT_ID:-lynia-500911}"
REGION="${REGION:-africa-south1}"
API_DOMAIN="${API_DOMAIN:-lyniago.lyniafinance.com}"       # the console calls https://<API_DOMAIN>
GITHUB_REPO="${GITHUB_REPO:-unnfazzed/Lynia}"              # owner/repo for `gh variable set`
# Operators allowed through IAP. Space-separated Google accounts, e.g. "user:you@gmail.com". This is
# the ONLY authorization boundary (External consent lets any Google account authenticate), so keep it
# an explicit allowlist — never allUsers. REQUIRED (no default: a wrong default grants access to nobody
# or, worse, the wrong person).
: "${IAP_MEMBERS:?set IAP_MEMBERS to operator account(s), e.g. user:you@gmail.com (space-separated)}"
# The custom OAuth client — created by hand ONCE in the console (see step 1). REQUIRED.
: "${IAP_CLIENT_ID:?set IAP_CLIENT_ID to the console OAuth client id, ending apps.googleusercontent.com}"
: "${IAP_CLIENT_SECRET:?set IAP_CLIENT_SECRET to the client secret, starting GOCSPX-}"
# --------------------------------------------------------------------

TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

say "1. IAP API + custom OAuth client (client is created ONCE, by hand, in the console)"
gcloud services enable iap.googleapis.com --project "$PROJECT_ID" >/dev/null
# The IAP OAuth Admin API (gcloud iap oauth-brands/oauth-clients) was permanently shut down 2026-03-19,
# so the client is NOT created here. And because this project's org has no Cloud Identity directory, the
# default Google-managed OAuth client would admit nobody — you need a CUSTOM client on an EXTERNAL,
# published consent screen. One-time console setup, BEFORE running this script:
#   1) Google Auth Platform → Audience → User type = EXTERNAL → PUBLISH APP (Production).
#   2) Google Auth Platform → Clients → Create client → Web application ("Lynia Admin"), with
#      Authorized redirect URI:  https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect
#   3) Export its id/secret as IAP_CLIENT_ID / IAP_CLIENT_SECRET (checked above).
# (The IAP service agent + its run.invoker on the Cloud Run service are handled by Terraform +
# deploy-admin.yml, not here.)
echo "Using custom IAP OAuth client: $IAP_CLIENT_ID"

say "2. terraform apply (admin tier) — review the plan, then confirm"
MEMBERS_HCL="$(printf '"%s", ' $IAP_MEMBERS)"; MEMBERS_HCL="[${MEMBERS_HCL%, }]"
# Preserve tiers already live in state. Terraform variable values come from local tfvars, but the
# founder's terraform.tfvars is gitignored — so a FRESH clone defaults every *_enabled flag OFF and
# would plan to DESTROY whatever those flags provisioned (notably the staging tier). Detect a live
# staging tier and carry staging_enabled forward so arming admin stays purely additive.
STAGING_ENABLED=false
if gcloud sql instances describe lynia-pg-staging --project "$PROJECT_ID" >/dev/null 2>&1; then
  STAGING_ENABLED=true
  echo "Detected a live staging tier (lynia-pg-staging) — carrying staging_enabled=true so it is not destroyed."
fi
cat > "$TF_DIR/admin.auto.tfvars" <<EOF
admin_enabled                 = true
admin_iap_oauth_client_id     = "$IAP_CLIENT_ID"
admin_iap_oauth_client_secret = "$IAP_CLIENT_SECRET"
admin_iap_members             = $MEMBERS_HCL
staging_enabled               = $STAGING_ENABLED
EOF
chmod 600 "$TF_DIR/admin.auto.tfvars"   # holds the client secret — keep it out of VCS (.gitignore covers *.auto.tfvars)
( cd "$TF_DIR" && terraform init -input=false >/dev/null && terraform plan -out=admin.tfplan )
# HARD SAFETY: arming admin is additive. Refuse to apply a plan that DESTROYS anything — that means a
# tier enabled via a tfvars this clone is missing (see staging note above), not an admin change.
DESTROYS="$(cd "$TF_DIR" && terraform show -json admin.tfplan \
  | jq '[.resource_changes[] | select(.change.actions | index("delete"))] | length')"
if [ "${DESTROYS:-0}" != "0" ]; then
  echo ""
  echo "REFUSING TO APPLY: this plan would DESTROY ${DESTROYS} resource(s). Arming admin must be additive."
  echo "Almost certainly a tier enabled via a tfvars this clone doesn't have. Inspect with:"
  echo "  ( cd \"$TF_DIR\" && terraform show admin.tfplan | grep -E 'will be destroyed' )"
  echo "Set the matching *_enabled flag(s) true in admin.auto.tfvars and re-run. Nothing was changed."
  exit 1
fi
read -r -p $'\nApply this plan? It adds the admin tier + appends to the SHARED ALB (0 destroys, verified). Type yes to apply: ' ok
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
