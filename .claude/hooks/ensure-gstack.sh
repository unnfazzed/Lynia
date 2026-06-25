#!/usr/bin/env bash
# gstack Team Mode (required) — self-healing installer.
# Runs at SessionStart: if gstack is missing, try to install it so the
# required gate (.claude/hooks/check-gstack.sh) doesn't block work.
# Non-fatal: never aborts session start; prints guidance if it can't install.
set -uo pipefail

GSTACK_DIR="${HOME}/.claude/skills/gstack"
INSTALL_HINT="git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup --team"

if [ -d "${GSTACK_DIR}/bin" ]; then
  exit 0
fi

echo "gstack (required by this repo) not found — attempting auto-install..." >&2

if git clone --depth 1 https://github.com/garrytan/gstack.git "${GSTACK_DIR}" >/dev/null 2>&1; then
  if ( cd "${GSTACK_DIR}" && ./setup --team >/dev/null 2>&1 ); then
    echo "gstack installed. Skills (/office-hours, /review, /ship, ...) are now available." >&2
  else
    echo "gstack cloned but setup failed. Finish manually: (cd ~/.claude/skills/gstack && ./setup --team)" >&2
  fi
else
  echo "Could not auto-install gstack (network may be restricted in this session)." >&2
  echo "Install manually once GitHub is reachable: ${INSTALL_HINT}" >&2
fi

exit 0
