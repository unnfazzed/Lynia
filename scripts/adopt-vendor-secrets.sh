#!/usr/bin/env bash
# adopt-vendor-secrets.sh — one-command execution of docs/LAUNCH-EXECUTION-RUNBOOK.md §9:
# import the hand-created vendor secret containers (DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET,
# WHATSAPP_ACCESS_TOKEN, BIRD_ACCESS_KEY, BIRD_WEBHOOK_SECRET, BIRD_VERIFY_API_KEY) plus their runtime-SA accessor bindings into Terraform state, then
# prove the adoption is clean. Idempotent — anything already in state is skipped, so
# re-running (including after extending the list in secrets.tf) is always safe.
#
# Must run with FOUNDER credentials: writing Terraform state needs write access to
# gs://lynia-tfstate, which CI's deployer SA deliberately does not have (iam.tf — the drift
# audit is read-only by doctrine). Needs: terraform >= 1.5, gcloud authenticated, and the
# applied terraform.tfvars present in infra/terraform/ (gitignored — same file the drift
# probe's TF_PROD_TFVARS secret mirrors; planning with variables.tf defaults would
# spurious-diff every live-armed flag).
#
# SAFETY: this script NEVER applies. If the post-import plan wants to change a vendor secret
# CONTAINER — worst case a replace, which would DELETE the live credential versions — it exits
# red: reconcile secrets.tf to live reality instead of applying. Accessor-binding creates are
# the one tolerated diff (additive; the next real apply lands them).
#
# Usage: scripts/adopt-vendor-secrets.sh [PROJECT_ID]

set -uo pipefail

PROJECT="${1:-lynia-500911}"
RUNTIME_SA="lynia-run@${PROJECT}.iam.gserviceaccount.com"
# Keep in lockstep with google_secret_manager_secret.vendor in infra/terraform/secrets.tf.
# Names that don't exist live yet (e.g. BIRD_ACCESS_KEY before Bird arming) are fine: they are
# skipped at import and their pending CREATE is tolerated in the plan check below.
SECRETS=(DIDIT_API_KEY DIDIT_WEBHOOK_SECRET WHATSAPP_ACCESS_TOKEN BIRD_ACCESS_KEY BIRD_WEBHOOK_SECRET BIRD_VERIFY_API_KEY)
LIVE=()

PASS=0 FAIL=0 WARN=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       fix: %s\n' "$2"; }
warn() { WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       note: %s\n' "$2"; }
hdr()  { printf '\n== %s\n' "$1"; }

cd "$(dirname "$0")/../infra/terraform" || exit 1

hdr "Preflight ($PROJECT)"
command -v terraform >/dev/null 2>&1 || { bad "terraform not on PATH" "install terraform >= 1.5"; exit 1; }
command -v gcloud >/dev/null 2>&1 || { bad "gcloud not on PATH" "install the Google Cloud SDK"; exit 1; }
if [ ! -f terraform.tfvars ]; then
  bad "infra/terraform/terraform.tfvars missing" "copy the APPLIED tfvars here (gitignored) — defaults would spurious-diff live-armed flags"
  exit 1
fi
ok "terraform + gcloud + terraform.tfvars present"

if ! terraform init -input=false >/dev/null 2>&1; then
  bad "terraform init failed" "check credentials for gs://lynia-tfstate (state backend, versions.tf)"
  exit 1
fi
ok "terraform init (backend: gs://lynia-tfstate)"

hdr "Import vendor secret containers + accessor bindings"
for s in "${SECRETS[@]}"; do
  if ! gcloud secrets describe "$s" --project "$PROJECT" >/dev/null 2>&1; then
    warn "secret $s does not exist live — nothing to import" "OK pre-arming: the next terraform apply creates the container (add its value as a version BEFORE flipping the vendor's ENABLED flag), or hand-create it while arming and re-run this script"
    continue
  fi
  LIVE+=("$s")

  addr="google_secret_manager_secret.vendor[\"$s\"]"
  if terraform state list "$addr" 2>/dev/null | grep -q .; then
    ok "$s container already in state"
  elif terraform import -input=false "$addr" "projects/$PROJECT/secrets/$s" >/dev/null 2>&1; then
    ok "$s container imported"
  else
    bad "$s container import failed" "run manually: terraform import '$addr' projects/$PROJECT/secrets/$s"
    continue
  fi

  iam_addr="google_secret_manager_secret_iam_member.vendor_runtime[\"$s\"]"
  iam_id="projects/$PROJECT/secrets/$s roles/secretmanager.secretAccessor serviceAccount:$RUNTIME_SA"
  if terraform state list "$iam_addr" 2>/dev/null | grep -q .; then
    ok "$s accessor binding already in state"
  elif terraform import -input=false "$iam_addr" "$iam_id" >/dev/null 2>&1; then
    ok "$s accessor binding imported"
  else
    warn "$s accessor binding not importable (likely never granted by hand)" "safe — the next terraform apply CREATES it (additive)"
  fi
done

hdr "Prove the adoption is clean (plan, never apply)"
plan_log="$(mktemp)"
terraform plan -input=false -lock=false -refresh=false -no-color -detailed-exitcode \
  -target=google_secret_manager_secret.vendor \
  -target=google_secret_manager_secret_iam_member.vendor_runtime \
  >"$plan_log" 2>&1
code=$?

if [ "$code" -eq 0 ]; then
  ok "plan clean — containers + bindings fully adopted (runbook §9 done)"
elif [ "$code" -eq 2 ]; then
  # Only plan actions on containers that EXIST live are dangerous (worst case a replace, which
  # deletes live credential versions). Pending CREATEs for pre-listed, not-yet-armed names
  # (e.g. BIRD_ACCESS_KEY) and accessor-binding creates are additive and tolerated.
  danger=false
  if [ "${#LIVE[@]}" -gt 0 ]; then
    for s in "${LIVE[@]}"; do
      if grep -Eq "# google_secret_manager_secret\.vendor\[\"$s\"\]" "$plan_log"; then
        bad "plan wants to CHANGE the live vendor secret container $s — DO NOT APPLY" \
            "a replace would delete live credential versions; reconcile secrets.tf to live reality (see plan below)"
        danger=true
      fi
    done
  fi
  if [ "$danger" = "true" ]; then
    grep -E '^ *([#~+-]|will be|must be)' "$plan_log" | head -40
    exit 1
  fi
  warn "plan pending only for additive resources (pre-arming containers and/or accessor bindings)" \
       "the next real terraform apply lands them; for a new container, add its value as a version before flipping the vendor's ENABLED flag"
  grep -E '# google_secret_manager_secret(_iam_member)?\.' "$plan_log" | head -10
else
  bad "terraform plan errored" "read the log: $plan_log"
  exit 1
fi

hdr "Summary"
printf '  PASS=%d WARN=%d FAIL=%d\n' "$PASS" "$WARN" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
