#!/usr/bin/env bash
# Post-deploy smoke for lyniago.com (docs/WEBSITE.md): checks what a visitor actually gets.
# Run by .github/workflows/deploy-website.yml after every deploy; safe to run by hand:
#   bash apps/website/smoke.sh                       # https://lyniago.com
#   SMOKE_WAIT=0 bash apps/website/smoke.sh <origin> # skip the first-deploy wait
#
#  1. waits (up to ~10 min) for the Custom Domain's DNS + certificate on a first deploy
#  2. the home page is byte-identical to apps/website/site/index.html (nothing on the edge rewrote it)
#  3. every asset the home page references loads, with the right type and the immutable cache header
#  4. /about serves the 404 page with a 404 status; www and plain http redirect to https://lyniago.com
set -euo pipefail

ORIGIN="${1:-https://lyniago.com}"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/site" && pwd)"
WAIT="${SMOKE_WAIT:-600}"
fails=0
err() { echo "::error::smoke: $*"; fails=$((fails + 1)); }
ok() { echo "ok  $*"; }
# Every probe retries transient network errors; the two slow-to-settle checks below also poll.
curl() { command curl --retry 3 --retry-all-errors --retry-delay 2 --max-time 20 "$@"; }
# poll SECONDS CMD... : re-run CMD every 15s until it succeeds or SECONDS pass (first deploy: the www
# certificate can land a minute or two after the apex's).
poll() {
  local until=$((SECONDS + $1)); shift
  until "$@"; do [ "$SECONDS" -lt "$until" ] || return 1; sleep 15; done
}
header() { printf '%s' "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2- || true; }

# 1. First deploy: Cloudflare creates the DNS record and edge certificate; give it time.
deadline=$((SECONDS + WAIT))
until code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$ORIGIN/") && [ "$code" = 200 ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::error::smoke: $ORIGIN/ never returned 200 (last: ${code:-no response})."
    exit 1
  fi
  echo "waiting for $ORIGIN/ (got ${code:-no response}) …"
  sleep 20
done

# 2. The page itself: served as-is, never cached stale, with the security headers.
h=$(curl -sS -D - -o /dev/null "$ORIGIN/")
case "$(header "$h" content-type)" in text/html*) ok "/ is text/html" ;; *) err "/ content-type: $(header "$h" content-type)" ;; esac
[[ "$(header "$h" cache-control)" == *no-cache* ]] && ok "/ is no-cache" || err "/ cache-control: $(header "$h" cache-control)"
[ -n "$(header "$h" content-security-policy)" ] && ok "/ has a CSP" || err "/ has no Content-Security-Policy"
live=$(curl -sS --compressed "$ORIGIN/" | sha256sum | cut -d' ' -f1)
repo=$(sha256sum "$SITE_DIR/index.html" | cut -d' ' -f1)
[ "$live" = "$repo" ] && ok "/ is byte-identical to apps/website/site/index.html" \
  || err "/ differs from apps/website/site/index.html — something on the edge (a zone feature that rewrites HTML?) changed the page."
enc=$(header "$(curl -sS -D - -o /dev/null -H 'Accept-Encoding: br, gzip' "$ORIGIN/")" content-encoding)
[ -n "$enc" ] && ok "/ is compressed ($enc)" || err "/ is served uncompressed"

# 3. Every asset the page references (the launch checklist's "no 404s").
refs=$(grep -oE '(src|href)="assets/[^"]+"|url\("assets/[^"]+"\)' "$SITE_DIR/index.html" | grep -oE 'assets/[^"]+' | sort -u)
refs="$refs"$'\n'"assets/og-image.png"
count=0
while read -r ref; do
  [ -n "$ref" ] || continue
  count=$((count + 1))
  h=$(curl -sS -D - -o /dev/null "$ORIGIN/$ref")
  status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
  type=$(header "$h" content-type)
  cache=$(header "$h" cache-control)
  case "$ref" in
    *.woff2) want=font/woff2 ;;
    *.webp) want=image/webp ;;
    *.svg) want=image/svg+xml ;;
    *.png) want=image/png ;;
    *) want="" ;;
  esac
  [ "$status" = 200 ] || { err "$ref → HTTP $status"; continue; }
  [ -z "$want" ] || [[ "$type" == "$want"* ]] || err "$ref content-type $type (want $want)"
  [[ "$cache" == *immutable* ]] || err "$ref cache-control '$cache' (want immutable)"
done <<< "$refs"
ok "$count referenced assets checked"

# 4. Routing.
page404=$(mktemp)
h=$(curl -sS -D - -o "$page404" "$ORIGIN/about")
status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
[ "$status" = 404 ] && grep -q "Back home" "$page404" && ok "/about serves the 404 page" \
  || err "/about: HTTP $status (want 404 with the site's 404 page)"

if [ "$ORIGIN" = "https://lyniago.com" ]; then
  www_ok() {
    loc=$(header "$(curl -sS -D - -o /dev/null 'https://www.lyniago.com/about?from=smoke' 2>/dev/null)" location)
    [ "$loc" = "https://lyniago.com/about?from=smoke" ]
  }
  poll "$((WAIT < 300 ? 300 : WAIT))" www_ok && ok "www redirects to https://lyniago.com" \
    || err "www.lyniago.com does not redirect to https://lyniago.com (location '${loc:-none}')."
  http_ok() {
    h=$(curl -sS -D - -o /dev/null "http://lyniago.com/" 2>/dev/null)
    code=$(printf '%s' "$h" | head -1 | awk '{print $2}')
    loc=$(header "$h" location)
    [[ "$code" =~ ^30[178]$ ]] && [ "$loc" = "https://lyniago.com/" ]
  }
  poll 120 http_ok && ok "http redirects to https" \
    || err "http://lyniago.com/ is served over plain HTTP (HTTP ${code:-none}). Turn on Cloudflare → lyniago.com → SSL/TLS → Edge Certificates → Always Use HTTPS (docs/WEBSITE.md)."
fi

[ "$fails" -eq 0 ] || { echo "smoke: $fails problem(s)"; exit 1; }
echo "smoke: $ORIGIN is serving the site correctly."
