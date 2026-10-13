#!/usr/bin/env bash
# gstack (required) — self-healing installer.
# Runs at SessionStart: if gstack is missing, try to install it so the
# required gate (.claude/hooks/check-gstack.sh) doesn't block work.
# Non-fatal: never aborts session start; prints guidance if it can't install.
#
# gstack is pinned to a reviewed commit (GSTACK_SHA) rather than tracking the
# default branch, and setup runs WITHOUT --team: in gstack, --team only turns on
# `auto_upgrade` and registers a SessionStart self-update hook. Upgrades happen
# by bumping GSTACK_SHA here (and in CLAUDE.md / check-gstack.sh) in a PR.
set -uo pipefail

GSTACK_DIR="${HOME}/.claude/skills/gstack"
GSTACK_REPO="https://github.com/garrytan/gstack.git"
GSTACK_SHA="dbf400ec3f1ffb96a429f0d0b29ca932b3d6c6f0"
INSTALL_HINT="git clone ${GSTACK_REPO} ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && git checkout ${GSTACK_SHA} && ./setup"

if [ -d "${GSTACK_DIR}/bin" ]; then
  exit 0
fi

PREEXISTING=0
[ -e "${GSTACK_DIR}" ] && PREEXISTING=1

echo "gstack (required by this repo) not found — attempting auto-install of pinned ${GSTACK_SHA}..." >&2

# Shallow-fetch exactly the pinned commit (GitHub serves reachable SHAs).
if git init -q "${GSTACK_DIR}" >/dev/null 2>&1 \
  && git -C "${GSTACK_DIR}" remote add origin "${GSTACK_REPO}" >/dev/null 2>&1 \
  && git -C "${GSTACK_DIR}" fetch -q --depth 1 origin "${GSTACK_SHA}" >/dev/null 2>&1 \
  && git -C "${GSTACK_DIR}" checkout -q --detach FETCH_HEAD >/dev/null 2>&1; then
  ACTUAL_SHA="$(git -C "${GSTACK_DIR}" rev-parse HEAD 2>/dev/null || true)"
  if [ "${ACTUAL_SHA}" != "${GSTACK_SHA}" ]; then
    echo "gstack checkout is ${ACTUAL_SHA:-unknown}, expected pinned ${GSTACK_SHA} — not running setup." >&2
    echo "Remove ${GSTACK_DIR} and install manually: ${INSTALL_HINT}" >&2
    exit 0
  fi
  if ( cd "${GSTACK_DIR}" && ./setup >/dev/null 2>&1 ); then
    # Belt and braces: keep self-upgrade off so the pin holds.
    "${GSTACK_DIR}/bin/gstack-config" set auto_upgrade false >/dev/null 2>&1 || true
    echo "gstack installed. Skills (/office-hours, /review, /ship, ...) are now available." >&2
  else
    echo "gstack fetched but setup failed. Finish manually: (cd ~/.claude/skills/gstack && ./setup)" >&2
  fi
else
  echo "Could not auto-install gstack (network may be restricted in this session)." >&2
  # Leave no half-initialised tree behind (only if this run created it).
  [ "${PREEXISTING}" -eq 0 ] && rm -rf "${GSTACK_DIR}"
  echo "Install manually once GitHub is reachable: ${INSTALL_HINT}" >&2
fi

exit 0
