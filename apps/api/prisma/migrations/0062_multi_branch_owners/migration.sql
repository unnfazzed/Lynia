-- Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md). An owner with shops in several
-- places runs one business row per branch and switches between them.
--
-- 1. `merchant_members.active_at`: when the person last switched to that business. The business they're
--    working on is their row with the latest value. Nullable, no default: metadata-only, no rewrite.
-- 2. The one-business-per-person and one-business-per-owner unique indexes go. 0060 and 0061 built their
--    replacements first, so nothing is left unguarded or unindexed. `merchant_members_one_owner` (one
--    owner per business) is untouched.
ALTER TABLE "merchant_members" ADD COLUMN IF NOT EXISTS "active_at" TIMESTAMP(3);
DROP INDEX IF EXISTS "merchant_members_profile_id_key";
DROP INDEX IF EXISTS "merchants_owner_profile_id_key";
