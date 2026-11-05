-- D-124 (owner 2026-11-05): a staff member's name on the team is the one they registered with, not the one the
-- owner typed on the invite. Join used to start its name box from the invite's name, so many staff are on record
-- under the owner's typing. One idempotent, data-only UPDATE: each staff row takes its own account's name
-- (first + last, at most 60 letters like Join), where the account has one. Owners typed their own name at sign-up
-- and are left alone; erased accounts (phone 'erased:…', name "Deleted User") are skipped; a re-run changes nothing.
UPDATE "merchant_members" AS mm SET "display_name" = left(btrim(p."first_name" || ' ' || p."last_name"), 60) FROM "profiles" AS p WHERE mm."profile_id" = p."id" AND mm."role" = 'staff' AND p."phone" NOT LIKE 'erased:%' AND btrim(p."first_name" || ' ' || p."last_name") <> '' AND mm."display_name" IS DISTINCT FROM left(btrim(p."first_name" || ' ' || p."last_name"), 60);
