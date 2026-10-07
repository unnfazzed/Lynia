#!/usr/bin/env bash
# What a visitor to app.lyniago.com gets (docs/CUSTOMER-WEB.md). Usage: smoke.sh https://app.lyniago.com
set -euo pipefail
BASE="${1:?usage: smoke.sh <base url>}"
fail() { echo "::error::$1"; exit 1; }

# A first deploy waits for Cloudflare to issue the certificate: retry for up to ~5 minutes.
page=""
for i in $(seq 1 20); do
  if page="$(curl -fsS --max-time 20 "$BASE/")"; then break; fi
  page=""
  echo "waiting for $BASE ($i/20)…"
  sleep 15
done
[ -n "$page" ] || fail "$BASE/ did not answer 200"
grep -q '<title>LyniaGo</title>' <<<"$page" || fail "the page title is not LyniaGo"
grep -q 'rel="manifest"' <<<"$page" || fail "the Add to Home Screen manifest link is missing"
grep -q '/_expo/static/js/web/entry-' <<<"$page" || fail "the app bundle is not referenced"
grep -q 'src="/ios-viewport.js"' <<<"$page" || fail "ios-viewport.js (no zoom on focus) is not loaded"
grep -q 'input, textarea { min-width: 0; }' <<<"$page" || fail "text fields can overflow the screen (min-width rule missing)"
grep -q 'rel="preconnect"' <<<"$page" || fail "no API preconnect (finish-build ran without EXPO_PUBLIC_API_URL)"

# One-page app: a deep link is served the same page, not a 404.
deep="$(curl -fsS --max-time 20 "$BASE/send")" || fail "$BASE/send did not answer 200"
grep -q '<title>LyniaGo</title>' <<<"$deep" || fail "$BASE/send is not the app page"

curl -fsS --max-time 20 -o /dev/null "$BASE/manifest.webmanifest" || fail "manifest.webmanifest is missing"
curl -fsS --max-time 20 -o /dev/null "$BASE/apple-touch-icon.png" || fail "apple-touch-icon.png is missing"
curl -fsS --max-time 20 -o /dev/null "$BASE/ios-viewport.js" || fail "ios-viewport.js is missing"

# Offline shell (docs/CUSTOMER-WEB.md § Offline): registered, stamped by finish-build, never cached by HTTP.
grep -q 'src="/sw-register.js"' <<<"$page" || fail "sw-register.js (offline shell) is not loaded"
sw="$(curl -fsS --max-time 20 "$BASE/sw.js")" || fail "sw.js is missing"
grep -q '__LYNIA_BUILD__\|__LYNIA_PRECACHE__' <<<"$sw" && fail "sw.js was not stamped by finish-build"
sw_headers="$(curl -fsS --max-time 20 -o /dev/null -D - "$BASE/sw.js")"
grep -qi '^cache-control: no-cache' <<<"$sw_headers" || fail "sw.js is HTTP-cached; a deploy would not reach browsers"

headers="$(curl -fsS --max-time 20 -o /dev/null -D - "$BASE/")"
grep -qi '^content-security-policy:' <<<"$headers" || fail "no Content-Security-Policy header"

echo "smoke: $BASE OK"
