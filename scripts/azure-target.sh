#!/usr/bin/env bash
# Resolve an Azure workflow's per-environment Variables for ONE tier, in bash rather than with a
# GitHub expression. `cond && vars.PROD || vars.STAGING` silently falls through to the STAGING value
# when the production Variable is empty — a production job must never pick up a staging resource
# group or identity because a Variable was missing.
#
# Usage: bash scripts/azure-target.sh <staging|production> NAME...
# For each NAME it reads P_<NAME> (production value) or S_<NAME> (staging value) from the
# environment, fails if the chosen one is empty (unless NAME is listed in $OPTIONAL), validates it
# as a plain identifier/URL, and appends NAME=value to $GITHUB_ENV and name=value to $GITHUB_OUTPUT.
# The values are resource names and client ids — none is secret (bootstrap.sh / Terraform outputs).
set -euo pipefail

tier="${1:-}"; shift || true
case "$tier" in production) side=P ;; staging) side=S ;; *) echo "::error::usage: azure-target.sh <staging|production> NAME..." >&2; exit 1 ;; esac
optional=" ${OPTIONAL:-} "
missing=()
for name in "$@"; do
  src="${side}_${name}"
  val="${!src:-}"
  if [ -z "$val" ]; then
    case "$optional" in *" $name "*) ;; *) missing+=("$src") ;; esac
    continue
  fi
  # No newlines/whitespace/quotes: these values are written to GITHUB_ENV and used as argv.
  # [[ =~ ]] anchors the WHOLE value (grep would accept any one matching line of a multi-line value).
  if ! [[ "$val" =~ ^[A-Za-z0-9._:/@,-]+$ ]]; then
    echo "::error::${src} has an unexpected character (allowed: letters, digits . _ : / @ , -)." >&2
    exit 1
  fi
  echo "${name}=${val}" >> "${GITHUB_ENV:-/dev/null}"
  echo "$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')=${val}" >> "${GITHUB_OUTPUT:-/dev/null}"
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::${tier} is armed but these are unset: ${missing[*]} (the 'Resolve target' step's env block maps each P_/S_ name to its repo Variable: production has no suffix, staging ends in _STAGING; values come from bootstrap.sh and infra/azure's arming_guide output)." >&2
  exit 1
fi
echo "Resolved ${tier}: $*"
