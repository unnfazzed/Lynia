#!/usr/bin/env bash
# `terraform init` for infra/azure against the azurerm backend, shared by terraform-apply-azure.yml and
# azure-drift-detect.yml (docs/plans/2026-09-24-gcp-to-azure-migration.md D11/§6).
#
# Usage: bash scripts/azure-tf-init.sh <staging|production>
# Env:   AZURE_TFSTATE_RG, AZURE_TFSTATE_ACCOUNT (repo Variables), optional AZURE_TFSTATE_CONTAINER
#        (default "tfstate"); ARM_USE_OIDC / ARM_CLIENT_ID / ARM_TENANT_ID / ARM_SUBSCRIPTION_ID for auth.
#
# State is one blob per environment: <container>/lynia-<env>.tfstate, read over Entra ID (OIDC) — the
# state account has shared-key auth off (S1), so no storage key is ever fetched. When
# infra/azure/environments/<env>.tfvars exists it is copied to ci-<env>.auto.tfvars, so every later
# plan/apply picks it up without extra flags. Exit 3 = infra/azure does not exist yet (callers treat
# that as "not armed", not as a failure).
set -euo pipefail

tier="${1:-}"
case "$tier" in staging|production) ;; *) echo "::error::usage: azure-tf-init.sh <staging|production>" >&2; exit 1 ;; esac
dir="infra/azure"
if [ ! -d "$dir" ]; then
  echo "::warning::$dir does not exist yet — nothing to plan."
  exit 3
fi
missing=()
for v in AZURE_TFSTATE_RG AZURE_TFSTATE_ACCOUNT ARM_CLIENT_ID ARM_TENANT_ID ARM_SUBSCRIPTION_ID; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Terraform state/auth config unset: ${missing[*]} (repo Variables AZURE_TFSTATE_RG, AZURE_TFSTATE_ACCOUNT, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID and the identity's client id)." >&2
  exit 1
fi

cd "$dir"
if [ -f "environments/${tier}.tfvars" ]; then
  cp "environments/${tier}.tfvars" "ci-${tier}.auto.tfvars"
  echo "Using environments/${tier}.tfvars"
fi
terraform init -input=false -no-color \
  -backend-config="resource_group_name=${AZURE_TFSTATE_RG}" \
  -backend-config="storage_account_name=${AZURE_TFSTATE_ACCOUNT}" \
  -backend-config="container_name=${AZURE_TFSTATE_CONTAINER:-tfstate}" \
  -backend-config="key=lynia-${tier}.tfstate" \
  -backend-config="use_oidc=true" \
  -backend-config="use_azuread_auth=true"
