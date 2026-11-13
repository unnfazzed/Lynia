# Postgres 16 + PostGIS 3 on the official Debian image (multi-arch: runs on the ARM server).
# The postgis/postgis images are amd64-only, so the extension comes from Debian's packages instead.
FROM postgres:16-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 \
 && rm -rf /var/lib/apt/lists/*
