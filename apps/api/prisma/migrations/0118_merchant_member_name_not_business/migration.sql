-- D-124 (owner 2026-11-05): "the business name and the personal name of the owner must always be separated."
-- Migration 0053, the legacy-owner backfill and support's owner handover all fell back to the BUSINESS name when
-- the person's profile had no name, so some team rows carry the shop's name as a person's name. One idempotent,
-- data-only UPDATE: a team row whose name is its business's name takes the person's own profile name, where the
-- profile has one (erased accounts are skipped). A row whose person has no name yet is left for the app to fix.
UPDATE "merchant_members" AS mm SET "display_name" = left(btrim(p."first_name" || ' ' || p."last_name"), 60) FROM "profiles" AS p, "merchants" AS m WHERE mm."profile_id" = p."id" AND mm."merchant_id" = m."id" AND lower(btrim(mm."display_name")) = lower(btrim(m."name")) AND p."phone" NOT LIKE 'erased:%' AND btrim(p."first_name" || ' ' || p."last_name") <> '' AND lower(btrim(p."first_name" || ' ' || p."last_name")) <> lower(btrim(m."name"));
