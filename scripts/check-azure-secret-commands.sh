#!/usr/bin/env bash
# S8 guardrail (docs/plans/2026-09-24-gcp-to-azure-migration.md, /cso review): no secret VALUE may
# reach a public Actions log from the Azure workflows. Fails if any .github/workflows/*azure*.yml — or
# a scripts/azure-*.sh helper those workflows run — contains an az subcommand whose output is a secret:
#   list-keys (storage / Redis / ACR / Cognitive keys), show-connection-string (a connection string
#   embeds the key), keyvault secret show (prints the secret value).
# Comments count too: the check is deliberately dumb so there is nothing to argue with. Name these
# commands in prose elsewhere (this script, the plan), never inside the files it scans.
# Run from the repo root: bash scripts/check-azure-secret-commands.sh
set -euo pipefail

shopt -s nullglob
files=(.github/workflows/*azure*.yml .github/workflows/*azure*.yaml scripts/azure-*.sh)
if [ ${#files[@]} -eq 0 ]; then
  echo "S8: no Azure workflow files found — nothing to check."
  exit 0
fi

pattern='list-keys|show-connection-string|keyvault[[:space:]]+secret[[:space:]]+show'
if hits="$(grep -nE "$pattern" "${files[@]}")"; then
  printf '%s\n' "$hits" | while IFS= read -r line; do
    echo "::error file=${line%%:*}::S8 — secret-reading az subcommand in an Azure workflow: ${line#*:}"
  done
  echo "S8 failed: these subcommands print secret values into public Actions logs. Reference the secret through a Key Vault reference / managed identity instead, and select only non-secret fields with jq." >&2
  exit 1
fi
echo "S8: ${#files[@]} Azure workflow/helper files checked — no secret-reading az subcommands."
