#!/usr/bin/env bash
# gstack Team Mode (required) gate.
# Blocks use of the Skill tool unless gstack is installed at ~/.claude/skills/gstack.
# Install (pinned; see ensure-gstack.sh GSTACK_SHA):
#   git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack \
#     && cd ~/.claude/skills/gstack && git checkout dbf400ec3f1ffb96a429f0d0b29ca932b3d6c6f0 && ./setup
set -euo pipefail

GSTACK_BIN="${HOME}/.claude/skills/gstack/bin"

if [ -d "${GSTACK_BIN}" ]; then
  # gstack present — allow the tool call.
  printf '{}\n'
  exit 0
fi

# gstack missing — deny the Skill call with an actionable message.
read -r -d '' REASON <<'MSG' || true
This project requires gstack for AI-assisted work, but it is not installed.
Install it, then retry:
  git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
  cd ~/.claude/skills/gstack && git checkout dbf400ec3f1ffb96a429f0d0b29ca932b3d6c6f0 && ./setup
MSG

# Emit a PreToolUse deny decision (escape the message into a JSON string).
ESCAPED=$(printf '%s' "${REASON}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"gstack is required but not installed. Run: git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && git checkout dbf400ec3f1ffb96a429f0d0b29ca932b3d6c6f0 && ./setup"')

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "${ESCAPED}"
exit 0
