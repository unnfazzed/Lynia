#!/usr/bin/env bash
# Lynia on Azure: put the PRODUCTION vendor secrets into Key Vault and arm them for Terraform.
#
#   bash infra/azure/vendor-secrets.sh           (Azure Cloud Shell, Bash; gh logged in)
#
# Why: release-azure.yml refuses to deploy when a vendor flag (BIRD_ENABLED, DIDIT_ENABLED, …) is on
# but the API has no container-app secret for it (first prod release, 2026-09-25). The values lived in
# GCP Secret Manager, which is unreachable, so they are re-entered here from each vendor's dashboard.
#
# For every vendor flag that is "true" in the repo Variables, it asks for each secret it needs:
#   - input is SILENT and never echoed, logged, or passed on a command line (written via a 0600 temp
#     file that is removed at once);
#   - Enter on a secret the vault already has keeps it;
#   - Enter on a missing one skips it, and then that whole feature's flag is set to false so the
#     release doesn't block on it (turn it back on later by re-running this script).
# Finally it writes the AZ_VENDOR_SECRETS Variable (ENV_VAR → vault name), which
# terraform-apply-azure.yml passes as var.vendor_secrets. Run a production Terraform apply after.
set -euo pipefail

REPO="${GITHUB_REPO:-unnfazzed/Lynia}"
VAULT="${AZ_KEY_VAULT_NAME:-}"
[ -n "$VAULT" ] || VAULT="$(gh variable get AZ_KEY_VAULT_NAME -R "$REPO" 2>/dev/null || true)"
[ -n "$VAULT" ] || { echo "ERROR: set AZ_KEY_VAULT_NAME (e.g. kv-lynia-37420b)"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: run gh auth login first"; exit 1; }

# flag | ENV_VAR:VAULT-NAME ... | what to paste
VENDOR_GROUPS=(
  "BIRD_ENABLED|BIRD_ACCESS_KEY:BIRD-ACCESS-KEY|Bird → Settings → API access key (OTP SMS/WhatsApp)"
  "BIRD_WEBHOOK_ENABLED|BIRD_WEBHOOK_SECRET:BIRD-WEBHOOK-SECRET|Bird → webhook signing secret"
  "BIRD_VERIFY_ENABLED|BIRD_VERIFY_API_KEY:BIRD-VERIFY-API-KEY|Bird Verify API key"
  "DIDIT_ENABLED|DIDIT_API_KEY:DIDIT-API-KEY DIDIT_WEBHOOK_SECRET:DIDIT-WEBHOOK-SECRET|Didit console → API key + webhook secret"
  "WHATSAPP_ENABLED|WHATSAPP_ACCESS_TOKEN:WHATSAPP-ACCESS-TOKEN|Meta WhatsApp Cloud API access token"
  "LOCAL_SMS_ENABLED|LOCAL_SMS_API_KEY:LOCAL-SMS-API-KEY|local SMS gateway API key"
  "SENTRY_ENABLED|SENTRY_DSN:SENTRY-DSN|Sentry → lynia-api → Client Keys (DSN)"
  "DEMO_ACCOUNT_ENABLED|DEMO_OTP_PHONE:DEMO-OTP-PHONE DEMO_OTP_CODE:DEMO-OTP-CODE|Play review demo login: phone (E.164) + fixed code"
)

TMP="$(mktemp -d)"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
declare -A MAP=()

for g in "${VENDOR_GROUPS[@]}"; do
  IFS='|' read -r FLAG PAIRS HINT <<<"$g"
  [ "$(gh variable get "$FLAG" -R "$REPO" 2>/dev/null || true)" = "true" ] || continue
  echo ""
  echo "== $FLAG is on — $HINT"
  ok=1
  declare -A GOT=()
  for p in $PAIRS; do
    ENV="${p%%:*}"; NAME="${p#*:}"
    if az keyvault secret show --vault-name "$VAULT" -n "$NAME" --query id -o tsv >/dev/null 2>&1; then
      prompt="  $NAME (already in vault; Enter keeps it): "; have=1
    else
      prompt="  $NAME (paste, then Enter; Enter alone skips this feature): "; have=0
    fi
    read -r -s -p "$prompt" VAL; echo ""
    if [ -n "$VAL" ]; then
      ( umask 077; printf '%s' "$VAL" >"$TMP/v" )
      az keyvault secret set --vault-name "$VAULT" -n "$NAME" --file "$TMP/v" --encoding utf-8 -o none
      rm -f "$TMP/v"; unset VAL
      echo "    stored $NAME"
      GOT[$ENV]="$NAME"
    elif [ "$have" = 1 ]; then
      echo "    kept $NAME"
      GOT[$ENV]="$NAME"
    else
      ok=0
    fi
  done
  if [ "$ok" = 1 ]; then
    for k in "${!GOT[@]}"; do MAP[$k]="${GOT[$k]}"; done
  else
    gh variable set "$FLAG" -R "$REPO" -b false >/dev/null
    echo "    skipped — set $FLAG=false (re-run this script to turn it back on)"
  fi
  unset GOT
done

JSON="{}"
for k in "${!MAP[@]}"; do JSON="$(jq -c --arg k "$k" --arg v "${MAP[$k]}" '. + {($k): $v}' <<<"$JSON")"; done
gh variable set AZ_VENDOR_SECRETS -R "$REPO" -b "$JSON" >/dev/null
echo ""
echo "AZ_VENDOR_SECRETS = $JSON"
echo "Next: tell Claude — it runs the production Terraform apply (two approvals), then the release."
