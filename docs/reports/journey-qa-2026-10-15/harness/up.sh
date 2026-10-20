#!/usr/bin/env bash
# Journey QA harness: idempotent bring-up of a vendor-free Lynia stack (native PG, or Docker PG if one is up). Run from repo root.
# Usage: . docs/reports/journey-qa-2026-10-15/harness/up.sh   (sources env + starts services)
#   KYC_MODE=manual . .../up.sh   to restart the API in manual KYC mode.
set -u
cd "$(git rev-parse --show-toplevel)"
export NODE_ENV=development DATABASE_URL='postgresql://lynia:lynia@localhost:5432/lynia?schema=public' \
  REDIS_URL=redis://localhost:6379 OTP_CHANNEL=console KYC_PROVIDER=stub KYC_MODE="${KYC_MODE:-auto}" \
  PAYMENT_RAIL=stub PUSH_PROVIDER=noop
# QA-S02: the API defaults every vertical OFF (env.ts) while the app fails them OPEN; production runs them ON.
# Match production, so Home/browse aren't a wall of 503s. Override with e.g. RESTAURANTS_ENABLED=false to test a switch.
export RESTAURANTS_ENABLED="${RESTAURANTS_ENABLED:-true}" SHOPS_ENABLED="${SHOPS_ENABLED:-true}" PHARMACY_ENABLED="${PHARMACY_ENABLED:-true}"
# QA-S02: browser surfaces need their origins allowed (empty = every browser origin refused): customer web
# build (:8081/:8082), merchant (:3100), admin (:3200).
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:8081,http://localhost:8082,http://localhost:3100,http://localhost:3200}"
export API=http://localhost:3000
# JQ-R4-01: libpq rejects Prisma's `?schema=` query, so psql gets the URL without it.
PSQL_URL="${DATABASE_URL%%\?*}"
t0=$SECONDS
step() { echo "[up] $1 (+$((SECONDS-t0))s)"; }
[ -d node_modules ] || pnpm install --frozen-lockfile >/dev/null 2>&1
[ -f packages/shared/dist/index.js ] || pnpm --filter @lynia/shared build >/dev/null 2>&1
# JQ-R2-02: drive.mjs is ESM, which ignores NODE_PATH — give it the mobile app's node_modules (socket.io-client).
[ -e docs/reports/journey-qa-2026-10-15/harness/node_modules ] || ln -s ../../../../apps/mobile/node_modules docs/reports/journey-qa-2026-10-15/harness/node_modules
step "deps+shared"
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null
# PostGIS: no docker daemon in the cloud container -> native PG16. apt-get update is REQUIRED first (no package lists on a fresh box).
# QA-S02: a Docker postgis container already on :5432 (docker compose up -d postgres, lynia/lynia) is used as is.
if docker ps --filter publish=5432 -q 2>/dev/null | grep -q .; then
  until PGPASSWORD=lynia psql -h localhost -U lynia -d lynia -qtAc "select 1" >/dev/null 2>&1; do sleep 1; done
elif ! pg_lsclusters | grep -q online; then
  dpkg -s postgresql-16-postgis-3 >/dev/null 2>&1 || { sudo apt-get update >/dev/null 2>&1; sudo apt-get install -y postgresql-16-postgis-3 >/dev/null 2>&1; }
  sudo pg_ctlcluster 16 main start; sleep 3
fi
if ! docker ps --filter publish=5432 -q 2>/dev/null | grep -q .; then
  sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='lynia'" | grep -q 1 || sudo -u postgres psql -qc "create role lynia login superuser createdb password 'lynia'"
  sudo -u postgres psql -tAc "select 1 from pg_database where datname='lynia'" | grep -q 1 || sudo -u postgres psql -qc "create database lynia owner lynia"
fi
PGPASSWORD=lynia psql -h localhost -U lynia -d lynia -qc "create extension if not exists postgis"
step "postgres+postgis+redis"
pnpm --filter @lynia/api prisma:generate >/dev/null 2>&1 && pnpm db:migrate >/dev/null 2>&1
step "migrate"
# Int specs delete profiles/riders/orders: run them BEFORE seeding (SKIP_INT=1 to skip).
# JQ-R4-02: run them only when psql SUCCEEDS and finds no profiles — a psql error must never read as "empty".
if [ -z "${SKIP_INT:-}" ] && seeded=$(psql "$PSQL_URL" -tAc "select 1 from profiles limit 1") && [ -z "$seeded" ]; then
  for s in matching/offer-loop orders/order-lifecycle orders/orders-idempotency tracking/tracking riders/rider-onboarding auth/refresh-rotation; do
    pnpm --filter @lynia/api test:int src/$s.int.spec.ts 2>&1 | grep -E "Tests " | sed "s|^|[int $s] |"
  done
  step "int specs"
fi
[ -n "$(psql "$PSQL_URL" -tAc "select 1 from profiles where phone='+263770000000'")" ] || pnpm db:seed >/dev/null 2>&1
step "seed"
pkill -f "node dist/main.js" 2>/dev/null; sleep 1
[ -f apps/api/dist/main.js ] && [ -z "${REBUILD:-}" ] || pnpm --filter @lynia/api build >/dev/null 2>&1
(cd apps/api && nohup node dist/main.js > /tmp/api.log 2>&1 &)
until curl -sf localhost:3000/healthz >/dev/null; do sleep 2; done
step "api up (KYC_MODE=$KYC_MODE)"
ADMIN_ID=$(psql "$PSQL_URL" -tAc "select id from profiles where phone='+263770000000'")
[ -n "$ADMIN_ID" ] || echo "[up] WARNING: no admin profile — ADMIN_JWT would have an empty subject" >&2
export ADMIN_JWT=$(cd apps/api && node -e 'console.log(require("jsonwebtoken").sign({role:"admin"},"dev-insecure-secret-change-me-please",{subject:process.argv[1],expiresIn:"2h",algorithm:"HS256"}))' "$ADMIN_ID")
