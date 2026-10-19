-- Own bikers E2: the owner's roster and every fleet round read riders by fleet owner. Expand-only, built
-- CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction). Mirrors 0102.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "riders_fleet_owner_profile_id_idx"
  ON "riders" ("fleet_owner_profile_id");
