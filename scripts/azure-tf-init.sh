#!/usr/bin/env bash
# `terraform init` for infra/azure, shared by terraform-apply-azure.yml and azure-drift-detect.yml
# (docs/plans/2026-09-24-gcp-to-azure-migration.md D11/§6; infra/azure/versions.tf).
#
# Usage: bash scripts/azure-tf-init.sh <staging|production>
# Env:   AZ_TFSTATE_STORAGE_ACCOUNT (required), AZ_TFSTATE_RESOURCE_GROUP / AZ_TFSTATE_CONTAINER
#        (optional: versions.tf already pins rg-lynia-tfstate / tfstate; passed only when set),
#        ARM_USE_OIDC / ARM_CLIENT_ID / ARM_TENANT_ID / ARM_SUBSCRIPTION_ID for auth.
#
# One module, two states: <env>.tfstate in the bootstrap-created account, read over Entra ID (the
# state account has shared-key auth off — S1 — so no storage key is ever fetched). Callers then run
# plan/apply with `-var environment=<env>`. Exit 3 = infra/azure does not exist on this ref.
set -euo pipefail

tier="${1:-}"
case "$tier" in staging|production) ;; *) echo "::error::usage: azure-tf-init.sh <staging|production>" >&2; exit 1 ;; esac
if [ ! -d infra/azure ]; then
  echo "::warning::infra/azure does not exist on this ref — nothing to plan."
  exit 3
fi
missing=()
for v in AZ_TFSTATE_STORAGE_ACCOUNT ARM_CLIENT_ID ARM_TENANT_ID ARM_SUBSCRIPTION_ID; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Terraform backend/auth config unset: ${missing[*]} (ARM_* come from the AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID and AZURE_CLIENT_ID_INFRA Variables; infra/azure/bootstrap.sh prints all of them)." >&2
  exit 1
fi

args=(-input=false -no-color
  "-backend-config=storage_account_name=${AZ_TFSTATE_STORAGE_ACCOUNT}"
  "-backend-config=key=${tier}.tfstate")
[ -z "${AZ_TFSTATE_RESOURCE_GROUP:-}" ] || args+=("-backend-config=resource_group_name=${AZ_TFSTATE_RESOURCE_GROUP}")
[ -z "${AZ_TFSTATE_CONTAINER:-}" ] || args+=("-backend-config=container_name=${AZ_TFSTATE_CONTAINER}")
terraform -chdir=infra/azure init "${args[@]}"
