#!/usr/bin/env bash
# gstack Team Mode (required) gate.
# Blocks use of the Skill tool unless gstack is installed at ~/.claude/skills/gstack.
# Install: git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack \
#          && cd ~/.claude/skills/gstack && ./setup --team
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
  git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
  cd ~/.claude/skills/gstack && ./setup --team
MSG

# Emit a PreToolUse deny decision (escape the message into a JSON string).
ESCAPED=$(printf '%s' "${REASON}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"gstack is required but not installed. Run: git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup --team"')

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "${ESCAPED}"
exit 0
