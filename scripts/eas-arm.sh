#!/usr/bin/env bash
# eas-arm.sh — one-shot arming of the mobile release pipeline (mobile-release.yml + mobile-ota.yml).
#
# Automates docs/LAUNCH-EXECUTION-RUNBOOK.md §8c end-to-end: sets the GitHub variables/secrets,
# walks the EAS credential + secret setup, creates the production-mobile environment, and flips
# EAS_RELEASE_ENABLED. Pauses only where a human is unavoidable (Expo login, Play Console app
# creation, token paste) — everything else is scripted and idempotent, so re-running is safe.
#
# Needs: gh CLI authenticated with admin on the repo; eas-cli (installed on the fly via npx if
# absent); run from anywhere inside the repo checkout.
#
# Usage:
#   scripts/eas-arm.sh            # interactive arming
#   scripts/eas-arm.sh --verify   # read-only: report what is armed / missing, change nothing

set -uo pipefail

REPO="unnfazzed/Lynia"
PKG="zw.co.lynia"
ENV_NAME="production-mobile"
VERIFY=0
[ "${1:-}" = "--verify" ] && VERIFY=1

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "run inside the repo checkout" >&2; exit 1; }
MOBILE="$ROOT/apps/mobile"

PASS=0 FAIL=0 WARN=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       fix: %s\n' "$2"; }
warn() { WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       note: %s\n' "$2"; }
hdr()  { printf '\n== %s\n' "$1"; }

eas_cmd() { if command -v eas >/dev/null 2>&1; then eas "$@"; else npx --yes eas-cli "$@"; fi; }
gh_var()    { gh variable list --repo "$REPO" --json name,value --jq ".[] | select(.name==\"$1\") | .value" 2>/dev/null; }
gh_secret() { gh secret list --repo "$REPO" --json name --jq ".[] | select(.name==\"$1\") | .name" 2>/dev/null; }

hdr "Prerequisites"
gh auth status >/dev/null 2>&1 && ok "gh CLI authenticated" || bad "gh CLI not authenticated" "gh auth login"
# The committed fallback in app.config.ts is the source of truth for the project id.
PROJECT_ID="$(grep -oE '"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' "$MOBILE/app.config.ts" | head -1 | tr -d '"')"
[ -n "$PROJECT_ID" ] && ok "EAS project id from app.config.ts: $PROJECT_ID" \
  || bad "no EAS project id fallback in app.config.ts" "cd apps/mobile && eas init, then commit the id"
[ $FAIL -gt 0 ] && { echo; echo "fix the failures above, then re-run."; exit 1; }

hdr "Expo account"
EXPO_USER="$(eas_cmd whoami 2>/dev/null | tail -1)"
if [ -n "$EXPO_USER" ] && [ "$EXPO_USER" != "Not logged in" ]; then
  ok "logged in to Expo as $EXPO_USER"
elif [ $VERIFY -eq 1 ]; then
  warn "not logged in to Expo locally" "eas login (verify mode can't check project access without it)"
else
  echo "  → opening Expo login (browser or credentials prompt)…"
  eas_cmd login || { bad "Expo login failed" "eas login manually, then re-run"; exit 1; }
  ok "logged in to Expo"
fi

hdr "GitHub variables"
for v in EAS_PROJECT_ID EAS_RELEASE_ENABLED; do
  CUR="$(gh_var "$v")"
  WANT="$PROJECT_ID"; [ "$v" = "EAS_RELEASE_ENABLED" ] && WANT="true"
  if [ "$CUR" = "$WANT" ]; then
    ok "$v = $CUR"
  elif [ $VERIFY -eq 1 ]; then
    bad "$v is '${CUR:-unset}' (want $WANT)" "scripts/eas-arm.sh (without --verify)"
  elif [ "$v" = "EAS_RELEASE_ENABLED" ]; then
    : # set last, after everything else is in place — see "Arming switch" below
  else
    gh variable set "$v" --repo "$REPO" --body "$WANT" && ok "$v set to $WANT" \
      || bad "could not set $v" "needs admin on $REPO"
  fi
done

hdr "Play Console (manual, one-time)"
echo "  In https://play.google.com/console you need, for package $PKG:"
echo "    1. the app created and enrolled in Play App Signing"
echo "    2. a Play Developer API service account (Play Console → API access) with its JSON key downloaded"
if [ $VERIFY -eq 0 ]; then
  read -rp "  Both done? [y/N] " YN
  [ "${YN,,}" = "y" ] || { echo "  finish the Play Console steps, then re-run."; exit 1; }
  ok "Play Console prerequisites confirmed"
else
  warn "cannot verify Play Console state from here" "confirm app + API service account exist"
fi

hdr "EAS credentials + build secrets"
if [ $VERIFY -eq 0 ]; then
  echo "  → launching 'eas credentials' (interactive). In it: Android → production →"
  echo "    let EAS generate/manage the upload keystore, and upload the Play SA JSON key."
  (cd "$MOBILE" && eas_cmd credentials) || warn "eas credentials exited non-zero" "re-run: cd apps/mobile && eas credentials"
fi
EAS_SECRETS="$(cd "$MOBILE" && eas_cmd secret:list 2>/dev/null)"
for s in GOOGLE_MAPS_API_KEY GOOGLE_SERVICES_JSON; do
  if echo "$EAS_SECRETS" | grep -q "$s"; then
    ok "EAS secret $s exists"
  elif [ $VERIFY -eq 1 ]; then
    bad "EAS secret $s missing" "scripts/eas-arm.sh (without --verify)"
  elif [ "$s" = "GOOGLE_MAPS_API_KEY" ]; then
    read -rp "  GOOGLE_MAPS_API_KEY value (blank to skip): " VAL
    [ -n "$VAL" ] && { (cd "$MOBILE" && eas_cmd secret:create --scope project --name "$s" --value "$VAL" --non-interactive) && ok "EAS secret $s created" || bad "creating $s failed"; } \
      || warn "$s skipped" "eas secret:create --scope project --name $s --value '<key>'"
  else
    read -rp "  path to google-services.json (blank to skip): " P
    [ -n "$P" ] && [ -f "$P" ] && { (cd "$MOBILE" && eas_cmd secret:create --scope project --name "$s" --type file --value "$P" --non-interactive) && ok "EAS secret $s created" || bad "creating $s failed"; } \
      || warn "$s skipped" "eas secret:create --scope project --name $s --type file --value ./google-services.json"
  fi
done

# The Places key is checked separately from the loop above because it is provisioned in two places at
# once, and both halves must agree. `mobile-release.yml` builds on EAS, so the BINARY reads the EAS
# environment variable; `mobile-ota.yml` exports the bundle on the GitHub runner, so an OTA reads the
# GitHub secret. Have one and not the other and an OTA silently changes the app's address search on or
# off relative to the binary it lands on. It stays a WARN, never a FAIL: the app runs unkeyed (the
# address field falls back to the device geocoder, src/logic/geocode.ts) — this is degradation, not a
# broken release, unlike GOOGLE_MAPS_API_KEY above, which is native and cannot be repaired by OTA.
PLACES_EAS=0; PLACES_GH=0
echo "$EAS_SECRETS" | grep -q "EXPO_PUBLIC_GOOGLE_PLACES_KEY" && PLACES_EAS=1
[ -n "$(gh_secret EXPO_PUBLIC_GOOGLE_PLACES_KEY)" ] && PLACES_GH=1
if [ $PLACES_EAS -eq 1 ] && [ $PLACES_GH -eq 1 ]; then
  ok "EXPO_PUBLIC_GOOGLE_PLACES_KEY set on both EAS (builds) and GitHub (OTA)"
elif [ $PLACES_EAS -eq 0 ] && [ $PLACES_GH -eq 0 ]; then
  warn "EXPO_PUBLIC_GOOGLE_PLACES_KEY unset — address autocomplete falls back to the device geocoder" \
    "eas env:create --scope project --environment preview --name EXPO_PUBLIC_GOOGLE_PLACES_KEY --visibility sensitive --value '<key>' (repeat for production), and gh secret set EXPO_PUBLIC_GOOGLE_PLACES_KEY"
else
  warn "EXPO_PUBLIC_GOOGLE_PLACES_KEY set on only one side (EAS=$PLACES_EAS, GitHub=$PLACES_GH)" \
    "set the SAME value on both, or an OTA flips search on/off relative to the installed binary"
fi

hdr "GitHub secret EXPO_TOKEN"
if [ -n "$(gh_secret EXPO_TOKEN)" ]; then
  ok "EXPO_TOKEN is set"
elif [ $VERIFY -eq 1 ]; then
  bad "EXPO_TOKEN not set" "scripts/eas-arm.sh (without --verify)"
else
  echo "  Create a token at https://expo.dev/settings/access-tokens (robot token recommended)."
  read -rsp "  Paste EXPO_TOKEN (input hidden): " TOK; echo
  [ -n "$TOK" ] && { gh secret set EXPO_TOKEN --repo "$REPO" --body "$TOK" && ok "EXPO_TOKEN set" || bad "could not set EXPO_TOKEN"; } \
    || bad "no token entered" "re-run after creating the token"
fi

hdr "GitHub environment $ENV_NAME"
if gh api "repos/$REPO/environments/$ENV_NAME" >/dev/null 2>&1; then
  ok "environment exists"
else
  if [ $VERIFY -eq 1 ]; then
    bad "environment missing" "scripts/eas-arm.sh (without --verify)"
  else
    # Required reviewer = the authenticated user; OTA bypasses Play review, so a human gate is policy
    # (docs/LAUNCH-DEPLOYMENT-STRATEGY.md environments table).
    ME_ID="$(gh api user --jq .id 2>/dev/null)"
    gh api -X PUT "repos/$REPO/environments/$ENV_NAME" \
      --input <(printf '{"reviewers":[{"type":"User","id":%s}]}' "${ME_ID:-null}") >/dev/null 2>&1 \
      && ok "environment created with you as required reviewer" \
      || bad "could not create environment" "Settings → Environments → New: $ENV_NAME + required reviewer"
  fi
fi

hdr "Arming switch"
if [ "$(gh_var EAS_RELEASE_ENABLED)" = "true" ]; then
  ok "EAS_RELEASE_ENABLED = true (armed)"
elif [ $VERIFY -eq 1 ]; then
  bad "EAS_RELEASE_ENABLED not true" "scripts/eas-arm.sh (without --verify)"
elif [ $FAIL -eq 0 ]; then
  gh variable set EAS_RELEASE_ENABLED --repo "$REPO" --body "true" && ok "EAS_RELEASE_ENABLED set — pipeline ARMED" \
    || bad "could not set EAS_RELEASE_ENABLED" "needs admin on $REPO"
else
  warn "leaving EAS_RELEASE_ENABLED unset — $FAIL failure(s) above" "fix them and re-run"
fi

printf '\n%d pass, %d fail, %d warn\n' "$PASS" "$FAIL" "$WARN"
if [ $FAIL -eq 0 ] && [ $VERIFY -eq 0 ]; then
  cat <<'EOF'

Armed. First release (docs/LAUNCH-EXECUTION-RUNBOOK.md §8c):
  1. Actions → "Mobile Release (Play)" → dispatch with profile `preview` (internal track)
  2. promote through closed testing in Play Console
  3. tag v0.2.0 on main → first staged production rollout (starts at 10%)
JS-only hotfixes after that: Actions → "Mobile OTA Update" (never `eas update` from a laptop).
EOF
fi
[ $FAIL -eq 0 ]
