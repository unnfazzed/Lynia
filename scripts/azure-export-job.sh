#!/bin/sh
# Runs INSIDE Azure, as a one-off execution of the migrate job (caj-lynia-migrate), started by
# .github/workflows/azure-db-export.yml. Not for local use.
#
# Why inside Azure: Postgres has no public endpoint (infra/azure/data.tf), so only something in the VNet
# can dump it. The migrate job is already in the VNet and already holds DATABASE_URL (a Key Vault
# reference) and the API identity, which can read the lynia-media blob container.
#
# What it does:
#   1. pg_dump (custom format) of the whole database, encrypted with EXPORT_PASSPHRASE;
#   2. optional: a tarball of every blob in the media container, encrypted the same way, split into
#      parts under GitHub's 2 GiB per-asset limit;
#   3. uploads both, plus a plaintext manifest (sizes, sha256, counts — no data), as assets of a DRAFT
#      GitHub release. Draft releases are visible only to people with push access to the repo, and the
#      files are AES-256 encrypted on top of that, because the repo is public.
#
# Inputs (env, set on the job by the workflow and removed again afterwards):
#   DATABASE_URL            secretref:database-url (already on the job)
#   EXPORT_PASSPHRASE       repo secret DB_EXPORT_PASSPHRASE
#   GH_TOKEN, GH_REPO, GH_RELEASE_ID   where to upload
#   EXPORT_MEDIA            true|false
#   MEDIA_ACCOUNT, MEDIA_CONTAINER, MEDIA_CLIENT_ID   blob source and the identity that can read it
#   MEDIA_MAX_BYTES         skip the media tarball (and say so) above this size
#
# It never prints DATABASE_URL, the passphrase or the token.
set -eu

log() { echo "[export] $*"; }
fail() { echo "[export] ERROR: $*" >&2; exit 1; }

for v in DATABASE_URL EXPORT_PASSPHRASE GH_TOKEN GH_REPO GH_RELEASE_ID; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || fail "$v is not set"
done

log "installing tools"
apk add --no-cache postgresql16-client openssl curl rclone tar >/dev/null

OUT=/tmp/export
mkdir -p "$OUT"
cd "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

enc() { # enc <in> <out>  — AES-256-CBC, PBKDF2 600k iterations, random salt
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:EXPORT_PASSPHRASE -in "$1" -out "$2"
}

upload() { # upload <file>
  name="$(basename "$1")"
  log "uploading $name ($(wc -c < "$1") bytes)"
  curl -fsS --retry 4 --retry-delay 5 -X POST -T "$1" \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Content-Type: application/octet-stream" \
    -H "Accept: application/vnd.github+json" \
    "https://uploads.github.com/repos/${GH_REPO}/releases/${GH_RELEASE_ID}/assets?name=${name}" >/dev/null
}

# ---- 1. Database -------------------------------------------------------------------------------
# Prisma's URL can carry options libpq rejects (schema=, connection_limit=, pgbouncer=): keep only the
# base URI and require TLS, which Azure Flexible Server enforces anyway.
PGURI="${DATABASE_URL%%\?*}?sslmode=require"
log "dumping database"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname="$PGURI" --file=db.dump
DB_TABLES="$(pg_restore --list db.dump | grep -c ' TABLE DATA ' || true)"
DB_SHA="$(sha256sum db.dump | cut -d' ' -f1)"
DB_BYTES="$(wc -c < db.dump)"
log "database dump: ${DB_BYTES} bytes, ${DB_TABLES} tables with data"
enc db.dump "lynia-db-${STAMP}.dump.enc"
rm -f db.dump
upload "lynia-db-${STAMP}.dump.enc"

# ---- 2. Media (blob storage) -------------------------------------------------------------------
MEDIA_STATUS="not requested"
MEDIA_OBJECTS=0
MEDIA_BYTES=0
MEDIA_PARTS=0
if [ "${EXPORT_MEDIA:-false}" = "true" ]; then
  [ -n "${MEDIA_ACCOUNT:-}" ] && [ -n "${MEDIA_CONTAINER:-}" ] && [ -n "${MEDIA_CLIENT_ID:-}" ] \
    || fail "EXPORT_MEDIA=true but MEDIA_ACCOUNT / MEDIA_CONTAINER / MEDIA_CLIENT_ID is missing"
  # rclone's env_auth uses the Azure SDK's credential chain, which picks up the Container Apps managed
  # identity endpoint (IDENTITY_ENDPOINT) for the user-assigned identity named by AZURE_CLIENT_ID.
  export AZURE_CLIENT_ID="$MEDIA_CLIENT_ID"
  export RCLONE_CONFIG_AZ_TYPE=azureblob
  export RCLONE_CONFIG_AZ_ACCOUNT="$MEDIA_ACCOUNT"
  export RCLONE_CONFIG_AZ_ENV_AUTH=true
  SIZE_JSON="$(rclone size "az:${MEDIA_CONTAINER}" --json)"
  MEDIA_OBJECTS="$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
  MEDIA_BYTES="$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
  log "media: ${MEDIA_OBJECTS} objects, ${MEDIA_BYTES} bytes"
  if [ "${MEDIA_BYTES:-0}" -gt "${MEDIA_MAX_BYTES:-5368709120}" ]; then
    MEDIA_STATUS="SKIPPED: ${MEDIA_BYTES} bytes is over the ${MEDIA_MAX_BYTES} limit for this job's disk; copy it straight to the new storage with rclone instead"
    log "$MEDIA_STATUS"
  else
    rclone copy "az:${MEDIA_CONTAINER}" media --transfers 8 --checkers 16
    tar -C media -cf - . \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:EXPORT_PASSPHRASE \
      | split -b 1900m -a 3 - "lynia-media-${STAMP}.tar.enc.part"
    rm -rf media
    for part in lynia-media-"${STAMP}".tar.enc.part*; do
      upload "$part"
      rm -f "$part"
      MEDIA_PARTS=$((MEDIA_PARTS + 1))
    done
    MEDIA_STATUS="exported in ${MEDIA_PARTS} part(s)"
  fi
fi

# ---- 3. Manifest (plaintext: sizes and checksums only, no data) ----------------------------------
cat > "lynia-export-${STAMP}.manifest.txt" <<EOF
Lynia data export ${STAMP} (UTC)

database
  file            lynia-db-${STAMP}.dump.enc
  plain bytes     ${DB_BYTES}
  plain sha256    ${DB_SHA}
  tables w/ data  ${DB_TABLES}
  format          pg_dump custom (PostgreSQL 16, PostGIS), --no-owner --no-privileges

media (blob container ${MEDIA_CONTAINER:-n/a})
  status          ${MEDIA_STATUS}
  objects         ${MEDIA_OBJECTS}
  plain bytes     ${MEDIA_BYTES}
  parts           ${MEDIA_PARTS}

Decrypt (see docs/AZURE-EXIT.md):
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in lynia-db-${STAMP}.dump.enc -out lynia-db.dump
  cat lynia-media-${STAMP}.tar.enc.part* | openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 | tar -xf - -C media/
EOF
upload "lynia-export-${STAMP}.manifest.txt"
cat "lynia-export-${STAMP}.manifest.txt"
log "done"
