#!/usr/bin/env bash
# What a visitor to merchant.lyniago.com gets (docs/MERCHANT-WEB.md). Usage: smoke.sh https://merchant.lyniago.com
set -euo pipefail
BASE="${1:?usage: smoke.sh <base url>}"
fail() { echo "::error::$1"; exit 1; }

# The first deploy waits for DNS and the certificate: retry for up to ~10 minutes.
page=""
for i in $(seq 1 40); do
  if page="$(curl -fsS --max-time 20 "$BASE/login")"; then break; fi
  page=""
  echo "waiting for $BASE ($i/40)…"
  sleep 15
done
[ -n "$page" ] || fail "$BASE/login did not answer 200"
grep -q '<title>LyniaGo Merchant</title>' <<<"$page" || fail "the sign-in page title is not LyniaGo Merchant"
grep -q '/_next/static/' <<<"$page" || fail "the app bundle is not referenced"
grep -q 'Sign in' <<<"$page" || fail "the sign-in page was not prerendered"

# Every page is a static file; the sign-in gate and the ids run in the browser.
for path in / /queue /queue/order /deliveries/booking /menu /h; do
  curl -fsS --max-time 20 -o /dev/null "$BASE$path" || fail "$BASE$path did not answer 200"
done

# The Worker, not the old container, is answering: Next's build output is cached for a year.
chunk="$(grep -o '/_next/static/[^"]*\.js' <<<"$page" | head -1)"
[ -n "$chunk" ] || fail "no script found on the sign-in page"
chunk_headers="$(curl -fsS --max-time 20 -o /dev/null -D - "$BASE$chunk")"
grep -qi '^cache-control: public, max-age=31536000, immutable' <<<"$chunk_headers" || fail "$chunk is not served with the immutable cache header (_headers not applied?)"

# An old path-style link gets the 404 page, which forwards it in the browser.
code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$BASE/queue/legacy-smoke-id")"
[ "$code" = "404" ] || fail "an unknown path answered $code, not the 404 page"

headers="$(curl -fsS --max-time 20 -o /dev/null -D - "$BASE/login")"
grep -qi '^x-frame-options: DENY' <<<"$headers" || fail "no X-Frame-Options header"

echo "smoke: $BASE OK"
