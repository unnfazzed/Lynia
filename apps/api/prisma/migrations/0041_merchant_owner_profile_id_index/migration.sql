-- One merchant per owning profile (C1 becomeMerchant, mirrors riders.profile_id being the PK). NULLs
-- (a merchant row with no linked login yet, if that ever exists) never collide in a unique index, so
-- no WHERE clause is needed.
--
-- Built CONCURRENTLY, out-of-band from 0040's column add — this is the only statement in the file
-- (CONCURRENTLY can't run inside a transaction, and Prisma implicitly wraps multi-statement migration
-- files in one). Mirrors migration 0021/0029/0036/0038/0039.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "merchants_owner_profile_id_key"
  ON "merchants" ("owner_profile_id");
