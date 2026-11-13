#!/bin/sh
# Nightly encrypted database backup to Cloudflare R2, kept 14 days. Same encryption as the Azure export
# (AES-256, PBKDF2 600k) so one decrypt command covers both: see docs/AZURE-EXIT.md.
set -eu
. /etc/cron.env
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="/tmp/lynia-db-${stamp}.dump.enc"
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --dbname="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
rclone copyto "$out" "r2:${BACKUP_BUCKET}/db/$(basename "$out")"
rclone delete --min-age 14d "r2:${BACKUP_BUCKET}/db/"
echo "$(date -u +%FT%TZ) backup $(basename "$out") ($(wc -c < "$out") bytes) uploaded; older than 14 days pruned"
rm -f "$out"
