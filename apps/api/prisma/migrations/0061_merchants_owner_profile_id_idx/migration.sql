-- Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md): `merchants.owner_profile_id` stops
-- being unique (an owner has one business row per branch). This plain index keeps the owner lookups
-- (the legacy access fallback, erasure's owner check) indexed once 0062 drops the unique one.
--
-- Built CONCURRENTLY, the only statement in the file. Mirrors 0041.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "merchants_owner_profile_id_idx"
  ON "merchants" ("owner_profile_id");
