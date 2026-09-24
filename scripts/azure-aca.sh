#!/usr/bin/env bash
# Azure Container Apps helpers shared by the *-azure.yml workflows
# (docs/plans/2026-09-24-gcp-to-azure-migration.md §6). One place for the revision / traffic / job
# mechanics, so release-azure.yml, deploy-staging-azure.yml, deploy-admin-azure.yml,
# deploy-merchant-azure.yml and rollback-azure.yml cannot drift apart on the parts that decide where
# production traffic goes.
#
# Usage: bash scripts/azure-aca.sh <command> [args...]   (every argument is positional; nothing here
# reads a GitHub expression, so a workflow passes inputs through env: and "$VAR" only).
#
#   serving       <app> <rg>                     revision carrying the most traffic ("" if none)
#   pin           <app> <rg>                     route 100% to the serving revision BY NAME; prints it
#   wait-ready    <app> <rg> <rev> [timeout_s]   provisioned + healthy, or fail with its state
#   label-url     <app> <rg> <label>             https URL of a revision label
#   route         <app> <rg> <rev> <pct> [<other>]  rev=pct, other=100-pct, every other revision 0
#   prune         <app> <rg> <keep>...           deactivate active 0-weight revisions not in <keep>
#   require-secrets <app> <rg> <name>...         fail unless every container-app secret NAME exists
#   env-names     <app> <rg>                     env var NAMES of the first container (never values)
#   healthz       <url>                          print status/db/redis/queues; exit 0 iff status=="ok"
#   wait-job      <job> <rg> <execution> [timeout_s]  wait for a job execution to succeed
#
# S8 (plan, /cso): nothing here reads a secret VALUE. `secret list` is called without
# --show-values (names only), env is read by name only, and /healthz output is reduced to four fields.
set -euo pipefail

az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null 2>&1 || true

die() { echo "::error::$*" >&2; exit 1; }

traffic_json() { az containerapp ingress traffic show -n "$1" -g "$2" -o json 2>/dev/null || echo '[]'; }

cmd_serving() {
  local app="$1" rg="$2" traffic latest
  traffic="$(traffic_json "$app" "$rg")"
  # A `latestRevision: true` entry is resolved to the latest READY revision's name: that is what it
  # serves, and pinning must name it before a new revision is created (otherwise the new revision
  # inherits the "latest" weight the instant it exists — the opposite of a 0% canary).
  latest="$(az containerapp show -n "$app" -g "$rg" --query properties.latestReadyRevisionName -o tsv 2>/dev/null || true)"
  printf '%s' "$traffic" | jq -r --arg latest "$latest" '
    [ .[]? | select((.weight // 0) > 0)
      | { name: (if .latestRevision == true then $latest else .revisionName end), weight } ]
    | group_by(.name) | map({ name: .[0].name, weight: (map(.weight) | add) })
    | max_by(.weight) | .name // empty'
}

cmd_pin() {
  local app="$1" rg="$2" serving leaked
  serving="$(cmd_serving "$app" "$rg")"
  if [ -z "$serving" ]; then
    echo "" # first deploy: nothing serves yet, nothing to pin
    return 0
  fi
  cmd_route "$app" "$rg" "$serving" 100 >&2
  leaked="$(traffic_json "$app" "$rg" | jq '[.[]? | select(.latestRevision == true and (.weight // 0) > 0)] | length')"
  [ "$leaked" = "0" ] || die "Traffic still routes to 'latest' after pinning $serving — a new revision would take live traffic immediately. Refusing to continue."
  echo "$serving"
}

cmd_wait_ready() {
  local app="$1" rg="$2" rev="$3" timeout="${4:-600}" deadline state prov health running
  deadline=$((SECONDS + timeout))
  while :; do
    state="$(az containerapp revision show -n "$app" -g "$rg" --revision "$rev" -o json 2>/dev/null || echo '{}')"
    prov="$(printf '%s' "$state" | jq -r '.properties.provisioningState // "Unknown"')"
    health="$(printf '%s' "$state" | jq -r '.properties.healthState // "Unknown"')"
    running="$(printf '%s' "$state" | jq -r '.properties.runningState // "Unknown"')"
    echo "revision $rev: provisioning=$prov health=$health running=$running" >&2
    if [ "$prov" = "Failed" ] || [ "$running" = "Failed" ]; then
      printf '%s' "$state" | jq -r '"provisioningError: \(.properties.provisioningError // "n/a")\nrunningStateDetails: \(.properties.runningStateDetails // "n/a")"' >&2
      die "Revision $rev failed to start (provisioning=$prov running=$running). Key Vault reference and boot-guard failures surface here — run the Azure Diagnose workflow for the Recap."
    fi
    if [ "$prov" = "Provisioned" ] && [ "$health" = "Healthy" ]; then
      case "$running" in Failed|Degraded|Stopped) ;; *) return 0 ;; esac
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      printf '%s' "$state" | jq -r '"provisioningError: \(.properties.provisioningError // "n/a")\nrunningStateDetails: \(.properties.runningStateDetails // "n/a")"' >&2
      die "Revision $rev not provisioned + healthy within ${timeout}s (provisioning=$prov health=$health running=$running)."
    fi
    sleep 10
  done
}

cmd_label_url() {
  local app="$1" rg="$2" label="$3" fqdn
  fqdn="$(az containerapp show -n "$app" -g "$rg" --query properties.configuration.ingress.fqdn -o tsv)"
  [ -n "$fqdn" ] || die "$app has no ingress FQDN — cannot build the revision-label URL."
  # <app>.<env-unique>.<region>.azurecontainerapps.io  →  <app>---<label>.<env-unique>.<region>.azurecontainerapps.io
  case "$fqdn" in
    "$app".*) echo "https://${app}---${label}.${fqdn#"$app".}" ;;
    *) die "Unexpected ingress FQDN shape for $app: $fqdn" ;;
  esac
}

cmd_route() {
  local app="$1" rg="$2" rev="$3" pct="$4" other="${5:-}" traffic
  case "$pct" in ''|*[!0-9]*) die "route: weight must be an integer 0-100 (got '$pct')" ;; esac
  [ "$pct" -le 100 ] || die "route: weight must be <= 100 (got $pct)"
  local -a weights=("${rev}=${pct}")
  if [ -n "$other" ] && [ "$other" != "$rev" ]; then
    weights+=("${other}=$((100 - pct))")
  elif [ "$pct" -ne 100 ]; then
    die "route: $rev=$pct needs a second revision to carry the remaining $((100 - pct))%"
  fi
  # Every other revision that carries weight is set to 0 EXPLICITLY, so the weights passed always sum
  # to exactly 100 and the CLI never has to rebalance anything on its own.
  traffic="$(traffic_json "$app" "$rg")"
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    [ "$n" = "$rev" ] || [ "$n" = "$other" ] || weights+=("${n}=0")
  done < <(printf '%s' "$traffic" | jq -r '.[]? | select((.weight // 0) > 0 and (.latestRevision != true)) | .revisionName' | sort -u)
  if printf '%s' "$traffic" | jq -e '[.[]? | select(.latestRevision == true and (.weight // 0) > 0)] | length > 0' >/dev/null; then
    weights+=("latest=0")
  fi
  echo "traffic: ${weights[*]}"
  az containerapp ingress traffic set -n "$app" -g "$rg" --revision-weight "${weights[@]}" -o none
}

cmd_prune() {
  local app="$1" rg="$2"; shift 2
  local keep=" $* " traffic n w
  traffic="$(traffic_json "$app" "$rg")"
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    case "$keep" in *" $n "*) continue ;; esac
    w="$(printf '%s' "$traffic" | jq -r --arg n "$n" '[.[]? | select(.revisionName == $n) | .weight // 0] | add // 0')"
    if [ "$w" != "0" ]; then echo "keep $n (still carries ${w}%)"; continue; fi
    echo "deactivate $n (0% traffic, not a rollback target)"
    az containerapp revision deactivate -n "$app" -g "$rg" --revision "$n" -o none || echo "::warning::could not deactivate $n"
  done < <(az containerapp revision list -n "$app" -g "$rg" --query "[?properties.active].name" -o tsv 2>/dev/null || true)
}

cmd_require_secrets() {
  local app="$1" rg="$2"; shift 2
  local have missing=()
  # Names only: `secret list` without --show-values never returns a value.
  have=" $(az containerapp secret list -n "$app" -g "$rg" --query "[].name" -o tsv 2>/dev/null | tr '\n' ' ') "
  for s in "$@"; do
    case "$have" in *" $s "*) ;; *) missing+=("$s") ;; esac
  done
  if [ ${#missing[@]} -gt 0 ]; then
    die "$app is missing container-app secret(s): ${missing[*]}. infra/azure must define each as a Key Vault reference (container-app secret 'database-url' → Key Vault secret 'DATABASE-URL'; plan §3 H6), then re-run."
  fi
  echo "All ${#} referenced secrets exist on $app (names checked, values never read)."
}

cmd_env_names() {
  az containerapp show -n "$1" -g "$2" --query "properties.template.containers[0].env[].name" -o tsv 2>/dev/null || true
}

cmd_healthz() {
  local url="$1" out body code
  out="$(curl -sS --max-time 10 -w $'\n%{http_code}' "$url" 2>/dev/null || true)"
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  if ! printf '%s' "$body" | jq -e 'type == "object"' >/dev/null 2>&1; then
    echo "healthz $url: HTTP ${code:-000}, no JSON body"
    return 1
  fi
  printf '%s' "$body" | jq -r --arg u "$url" --arg c "$code" \
    'def f(k): if has(k) then .[k] else "?" end;  # not `//`: it would print db=false as "?"
     "healthz \($u): HTTP \($c) status=\(f("status")) db=\(f("db")) redis=\(f("redis")) queues=\(if has("queues") then (.queues | tojson) else "n/a" end)"'
  # E6: `status == "ok"` — HTTP 200 alone also covers "degraded" (dead queues on a healthy Redis).
  printf '%s' "$body" | jq -e '.status == "ok"' >/dev/null
}

cmd_wait_job() {
  local job="$1" rg="$2" exe="$3" timeout="${4:-900}" deadline status
  deadline=$((SECONDS + timeout))
  while :; do
    status="$(az containerapp job execution show -n "$job" -g "$rg" --job-execution-name "$exe" \
      --query properties.status -o tsv 2>/dev/null || echo Unknown)"
    echo "job $job execution $exe: $status"
    case "$status" in
      Succeeded) return 0 ;;
      Failed|Stopped|Degraded) die "Job execution $exe ended $status. The previous revision keeps serving; nothing was deployed. Inspect it in the portal (Container Apps job → Execution history) or run the Azure Diagnose workflow." ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || die "Job execution $exe still $status after ${timeout}s."
    sleep 10
  done
}

command="${1:-}"; shift || true
case "$command" in
  serving) cmd_serving "$@" ;;
  pin) cmd_pin "$@" ;;
  wait-ready) cmd_wait_ready "$@" ;;
  label-url) cmd_label_url "$@" ;;
  route) cmd_route "$@" ;;
  prune) cmd_prune "$@" ;;
  require-secrets) cmd_require_secrets "$@" ;;
  env-names) cmd_env_names "$@" ;;
  healthz) cmd_healthz "$@" ;;
  wait-job) cmd_wait_job "$@" ;;
  *) die "usage: azure-aca.sh {serving|pin|wait-ready|label-url|route|prune|require-secrets|env-names|healthz|wait-job} ..." ;;
esac
