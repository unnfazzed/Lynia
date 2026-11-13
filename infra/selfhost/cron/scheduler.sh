#!/bin/sh
# POST one scheduler route on the API with the shared secret (SCHEDULER_AUTH=secret). Any non-2xx is a
# failure, logged, so it shows in `docker compose logs cron`.
set -eu
. /etc/cron.env
path="$1"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 840 -X POST \
  -H "Authorization: Bearer ${SCHEDULER_SECRET}" -H "Content-Length: 0" "http://api:3000${path}")"
echo "$(date -u +%FT%TZ) POST ${path} -> HTTP ${code}"
case "$code" in 2??) ;; *) exit 1 ;; esac
