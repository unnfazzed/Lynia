#!/usr/bin/env bash
# Post-deploy smoke for lyniago.com (docs/WEBSITE.md): checks what a visitor actually gets.
# Run by .github/workflows/deploy-website.yml after every deploy; safe to run by hand:
#   bash apps/website/smoke.sh                       # https://lyniago.com
#   SMOKE_WAIT=0 bash apps/website/smoke.sh <origin> # skip the first-deploy wait
#
#  1. waits (up to ~10 min) for the Custom Domain's DNS + certificate on a first deploy
#  2. the home page, fetched as a browser would, is byte-identical to apps/website/site/index.html
#     (nothing on the edge rewrote it)
#  3. every file under site/assets/ loads, with the right type and the immutable cache header; a 404
#     is re-fetched with a cache-busting query to tell an edge-cached 404 (purge it) from a missing file
#  4. an unknown path (/about, no longer linked) serves the 404 page with a 404 status, and a missing
#     path under /assets/ is not cached as immutable; www and plain http redirect to https://lyniago.com
#  5. /download (the app buttons) sends Android to Play, iPhone to the web app and desktop to /#app, uncached
set -euo pipefail

ORIGIN="${1:-https://lyniago.com}"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/site" && pwd)"
WAIT="${SMOKE_WAIT:-600}"
fails=0
err() { echo "::error::smoke: $*"; fails=$((fails + 1)); }
ok() { echo "ok  $*"; }
# Every probe retries transient network errors; the two slow-to-settle checks below also poll.
# --suppress-connect-headers: behind an HTTPS proxy (a Claude session, an office network) `-D` would
# start with the proxy's "200 Connection Established", and the status checks below read that line.
curl() { command curl --retry 3 --retry-all-errors --retry-delay 2 --max-time 20 --suppress-connect-headers "$@"; }
# poll SECONDS CMD... : re-run CMD every 15s until it succeeds or SECONDS pass (first deploy: the www
# certificate can land a minute or two after the apex's).
poll() {
  local until=$((SECONDS + $1)); shift
  until "$@"; do [ "$SECONDS" -lt "$until" ] || return 1; sleep 15; done
}
header() { printf '%s' "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2- || true; }
# Ask for pages the way a phone browser does. Cloudflare decides per request whether to rewrite HTML:
# Web Analytics' automatic setup injects its beacon only when the request accepts text/html, never for
# curl's default `Accept: */*`. So every probe that hashes or inspects a page sends these headers.
BROWSER=(-H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  -A 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')

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
h=$(curl -sS -D - -o /dev/null "${BROWSER[@]}" "$ORIGIN/")
case "$(header "$h" content-type)" in text/html*) ok "/ is text/html" ;; *) err "/ content-type: $(header "$h" content-type)" ;; esac
[[ "$(header "$h" cache-control)" == *no-cache* ]] && ok "/ is no-cache" || err "/ cache-control: $(header "$h" cache-control)"
[ -n "$(header "$h" content-security-policy)" ] && ok "/ has a CSP" || err "/ has no Content-Security-Policy"
page=$(mktemp)
curl -sS --compressed "${BROWSER[@]}" -o "$page" "$ORIGIN/"
live=$(sha256sum "$page" | cut -d' ' -f1)
repo=$(sha256sum "$SITE_DIR/index.html" | cut -d' ' -f1)
if [ "$live" = "$repo" ]; then
  ok "/ is byte-identical to apps/website/site/index.html"
else
  err "/ differs from apps/website/site/index.html — something on the edge (a zone feature that rewrites HTML?) changed the page."
  if grep -q 'static\.cloudflareinsights\.com' "$page"; then
    echo "    It carries Cloudflare's Web Analytics beacon. Turn it off: Cloudflare → Analytics & Logs → Web Analytics → lyniago.com → Manage site → Disable (docs/WEBSITE.md, one-time setup step 5)."
  fi
fi
enc=$(header "$(curl -sS -D - -o /dev/null "${BROWSER[@]}" -H 'Accept-Encoding: br, gzip' "$ORIGIN/")" content-encoding)
[ -n "$enc" ] && ok "/ is compressed ($enc)" || err "/ is served uncompressed"

# 3. Every file under site/assets/ (the launch checklist's "no 404s"). This probes one edge location,
# the runner's, so it cannot see a 404 another location cached; _headers keeps such a 404 out of the
# cache (docs/WEBSITE.md § Hosting). When this location does serve one, say which kind it is.
refs=$(cd "$SITE_DIR" && find assets -type f | sort)
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
  if [ "$status" != 200 ]; then
    edge="cf-cache-status $(header "$h" cf-cache-status), cf-ray $(header "$h" cf-ray), cache-control '$cache'"
    fresh=$(curl -sS -o /dev/null -w '%{http_code}' "$ORIGIN/$ref?smoke=$(date +%s)")
    if [ "$status" = 404 ] && [ "$fresh" = 200 ]; then
      err "$ref → a CACHED 404 at this edge location ($edge); with a cache-busting query it is 200. Purge the URL: docs/WEBSITE.md § Deploying, verifying, rolling back."
    else
      err "$ref → HTTP $status ($edge; with a cache-busting query: HTTP $fresh)"
    fi
    continue
  fi
  [ -z "$want" ] || [[ "$type" == "$want"* ]] || err "$ref content-type $type (want $want)"
  [[ "$cache" == *immutable* ]] || err "$ref cache-control '$cache' (want immutable)"
done <<< "$refs"
ok "$count assets checked"

# 3b. The email-signature image: mail clients hotlink it at this exact URL (no redirect, image/png).
h=$(curl -sS -D - -o /dev/null "$ORIGIN/email/lyniago-signature-logo-tile.png")
status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
type=$(header "$h" content-type)
cache=$(header "$h" cache-control)
if [ "$status" = 200 ] && [[ "$type" == image/png* ]] && [[ "$cache" == "public, max-age=31536000"* ]]; then
  ok "/email/lyniago-signature-logo-tile.png is 200 image/png, cached a year"
else
  err "/email/lyniago-signature-logo-tile.png: HTTP $status, type '$type', cache-control '$cache'"
fi

# 4. Routing.
page404=$(mktemp)
h=$(curl -sS -D - -o "$page404" "${BROWSER[@]}" "$ORIGIN/about")
status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
[ "$status" = 404 ] && grep -q "Back home" "$page404" && ok "/about serves the 404 page" \
  || err "/about: HTTP $status (want 404 with the site's 404 page)"

# A missing asset must not be cached: an edge that 404s a just-deployed file would otherwise keep
# serving that 404 for a year (2026-10-15). A fresh name each run, so no earlier probe is cached.
missing="assets/smoke-missing-$(date +%s)-$RANDOM.svg"
h=$(curl -sS -D - -o /dev/null "$ORIGIN/$missing")
status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
cache=$(header "$h" cache-control)
maxage=$(printf '%s' "$cache" | grep -oiE 'max-age=[0-9]+' | cut -d= -f2 || true)
if [ "$status" = 404 ] && [[ "$cache" != *immutable* ]] && [ "${maxage:-0}" -le 300 ]; then
  ok "a missing /assets/ path is a 404 that is not cached ('$cache')"
else
  err "/$missing: HTTP $status, cache-control '$cache' (want 404 with no immutable and max-age <= 300). A _headers rule with a wildcard under /assets/ sets Cache-Control (docs/WEBSITE.md § Hosting)."
fi

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

# 5. The smart download link (apps/website/worker.js).
download_to() { # UA WANT LABEL
  h=$(curl -sS -D - -o /dev/null -A "$1" "$ORIGIN/download")
  status=$(printf '%s' "$h" | head -1 | awk '{print $2}')
  loc=$(header "$h" location)
  cache=$(header "$h" cache-control)
  if [ "$status" = 302 ] && [[ "$loc" == "$2"* ]] && [[ "$cache" == *no-store* ]]; then
    ok "/download sends $3 to $loc"
  else
    err "/download for $3: HTTP $status, location '$loc', cache-control '$cache' (want 302 to $2…, no-store)"
  fi
}
download_to 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' \
  'https://play.google.com/store/apps/details?id=zw.co.lynia&' Android
download_to 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' \
  'https://app.lyniago.com/?install=1' iPhone
download_to 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' \
  "$ORIGIN/#app" desktop

[ "$fails" -eq 0 ] || { echo "smoke: $fails problem(s)"; exit 1; }
echo "smoke: $ORIGIN is serving the site correctly."
