-- Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md): a person may be on more than one
-- business (an owner with a row per branch), so `merchant_members` becomes unique per (person, business)
-- instead of per person. This index is built first, and 0062 drops the old one, so the table is never
-- without a uniqueness guard. Leading on profile_id, it also serves "which businesses is this person on".
--
-- Built CONCURRENTLY, the only statement in the file (Prisma wraps a multi-statement migration in a
-- transaction, and CONCURRENTLY can't run inside one). Mirrors 0041.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "merchant_members_profile_id_merchant_id_key"
  ON "merchant_members" ("profile_id", "merchant_id");
