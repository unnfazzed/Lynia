#!/usr/bin/env bash
# Builds the Claude Design upload bundle for the Order flow v2 brief (restaurants, shops, pharmacy:
# checkout → hand-over → completion). Run from anywhere:
#
#   bash docs/designs/order-flow-v2/bundle.sh            # → $TMPDIR/order-flow-v2-bundle.zip
#   bash docs/designs/order-flow-v2/bundle.sh /tmp/x.zip
#
# Folder names inside the zip match the paths PROMPT.md Part 3 cites, so Claude Design can follow them.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/order-flow-v2-bundle.zip}"
H="$REPO/packages/design/handoff"
STAGE="$(mktemp -d)"
B="$STAGE/order-flow-v2"
trap 'rm -rf "$STAGE"' EXIT

cp_into() { local dest="$1"; shift; mkdir -p "$B/$dest"; cp -R "$@" "$B/$dest/"; }

# 1 · the brief + today's renders (send first)
cp "$REPO/docs/designs/order-flow-v2/PROMPT.md" "$B/"
cp_into current "$REPO"/docs/designs/order-flow-v2/current/*.png

# 2 · the pattern to extend: After Send v2 (the parcel order screen)
cp_into reference/after-send-v2 "$H/after-send-v2/README.md" "$H/after-send-v2/BRIEF.md" "$H/after-send-v2/PROMPT-v2.md"
cp_into reference/after-send-v2/design "$H"/after-send-v2/design/*

# 3 · the style: Calm Mint v2 (Home) — tokens, service icons, food photos, fonts
cp_into reference/calm-mint-v2 "$H/calm-mint-v2-2026-10/README.md" "$H/calm-mint-v2-2026-10/Calm Mint v2 - all screens.html" \
  "$H/calm-mint-v2-2026-10/calm-mint-v2.js" "$H/calm-mint-v2-2026-10/mint2.js" "$H/calm-mint-v2-2026-10/shared.js" \
  "$H/calm-mint-v2-2026-10/fonts.css" "$H/calm-mint-v2-2026-10/assets"

# 4 · the other two phones in the transaction
cp_into reference/rider-v2 "$H/rider-v2/README.md" "$H/rider-v2/BRIEF.md"
cp_into reference/rider-v2/design "$H/rider-v2/design/Rider v2 (standalone).html" "$H/rider-v2/design/rv-job.jsx" "$H/rider-v2/design/rv-kit.jsx"
cp_into reference/merchant-mobile "$H/merchant-mobile/README.md" "$H/merchant-mobile/Merchant Prototype (standalone).html"

# 5 · Send a parcel v2 (the checkout-step language) + tab bar
cp_into reference/send-compose-v2 "$H/send-compose-v2/README.md" "$H/send-compose-v2/PROMPT.md" "$H/send-compose-v2/design/sc2-kit.jsx" \
  "$H/send-compose-v2/design/Send Compose v2 (standalone).html"

# 6 · sibling briefs (browse before this flow; Orders tab after it)
cp_into reference/briefs/browse-v2 "$REPO/docs/designs/browse-v2/PROMPT.md"
cp_into reference/briefs/orders-v2 "$REPO/docs/designs/orders-v2/PROMPT.md"

# 7 · tokens
cp_into tokens "$REPO"/packages/design/tokens/*.css

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" order-flow-v2)
echo "$OUT ($(du -h "$OUT" | cut -f1))"
