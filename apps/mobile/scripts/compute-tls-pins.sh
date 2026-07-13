#!/usr/bin/env bash
#
# compute-tls-pins.sh — KB-MOBILE-PIN arming helper (SECURITY §P3-1).
#
# Computes the base64 SHA-256 SPKI hashes that `plugins/with-certificate-pinning.js` expects in
# LYNIA_TLS_PINS, straight from the live certificate chain of the API/WS host. It prints one pin per
# certificate in the chain (leaf → intermediate → root) and tells you WHICH to pin.
#
# ⚠️  Read docs/MOBILE-CERT-PINNING.md first. The API sits behind a Google-managed cert that
#     AUTO-ROTATES, so you must pin an INTERMEDIATE/ROOT SPKI (Google Trust Services), NOT the leaf,
#     and ALWAYS include a backup. A leaf pin — or a single pin with no backup — bricks every installed
#     app's connectivity on the next rotation, unrecoverable without a forced store update.
#
# Run this from a machine with DIRECT network egress to the host (not through an HTTP proxy).
#
# Usage:
#   ./apps/mobile/scripts/compute-tls-pins.sh [host[:port]]
#   ./apps/mobile/scripts/compute-tls-pins.sh lyniago.lyniafinance.com:443
#
# Then arm (see docs/MOBILE-CERT-PINNING.md) with the intermediate + root pins:
#   LYNIA_TLS_PINS="sha256/<intermediate>=,sha256/<root>="
#   LYNIA_TLS_PIN_EXPIRATION="YYYY-MM-DD"   # keep ahead of the CA's rotation cadence
# and produce a fresh NATIVE build (pinning is not OTA-able), then validate on a physical device.

set -euo pipefail

HOSTPORT="${1:-lyniago.lyniafinance.com:443}"
HOST="${HOSTPORT%%:*}"
PORT="${HOSTPORT##*:}"
[ "$PORT" = "$HOST" ] && PORT=443

command -v openssl >/dev/null 2>&1 || { echo "error: openssl not found on PATH" >&2; exit 1; }

# SPKI SHA-256 base64 for one PEM cert on stdin — the exact value Android <pin> and iOS
# SPKI-SHA256-BASE64 compare against.
spki_pin() {
  openssl x509 -pubkey -noout \
    | openssl pkey -pubin -outform der 2>/dev/null \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
}

echo "Fetching certificate chain for ${HOST}:${PORT} ..." >&2
CHAIN="$(echo | openssl s_client -servername "$HOST" -connect "${HOST}:${PORT}" -showcerts 2>/dev/null)" \
  || { echo "error: could not reach ${HOST}:${PORT} (need direct egress, not a proxy)" >&2; exit 1; }

# Split the -showcerts output into individual PEM blocks; index 0 = leaf, last = root-most presented.
mapfile -t STARTS < <(grep -n -- "-----BEGIN CERTIFICATE-----" <<<"$CHAIN" | cut -d: -f1)
[ "${#STARTS[@]}" -ge 1 ] || { echo "error: no certificates in the chain output" >&2; exit 1; }
mapfile -t ENDS < <(grep -n -- "-----END CERTIFICATE-----" <<<"$CHAIN" | cut -d: -f1)

echo
echo "Certificate chain for ${HOST} (pin the INTERMEDIATE and/or ROOT, never the leaf):"
echo
LAST=$(( ${#STARTS[@]} - 1 ))
for i in "${!STARTS[@]}"; do
  pem="$(sed -n "${STARTS[$i]},${ENDS[$i]}p" <<<"$CHAIN")"
  subject="$(openssl x509 -noout -subject <<<"$pem" 2>/dev/null | sed 's/^subject=//')"
  pin="$(spki_pin <<<"$pem")"
  if   [ "$i" -eq 0 ];    then role="leaf        (DO NOT PIN — auto-rotates)"
  elif [ "$i" -eq "$LAST" ]; then role="root/backup (pin this as the backup)"
  else                        role="intermediate (pin this as the primary)"
  fi
  printf '  [%d] %-40s %s\n' "$i" "$role" "$subject"
  printf '      sha256/%s\n\n' "$pin"
done

echo "LYNIA_TLS_PINS should list at least two of the above (primary + backup), e.g. the intermediate"
echo "and the root, as: sha256/<b64>=,sha256/<b64>=  — see docs/MOBILE-CERT-PINNING.md before arming."
