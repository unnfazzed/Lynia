-- Own bikers launch (owner, 2026-10-20, D-117): every business has Own bikers, with no admin switch-on and no flat
-- fee per ride. LyniaGo bills the commission rate × the ride's cost: an app order's delivery fee (as before), a phone
-- booking's suggested fare for the trip. Admin keeps Pause and Disable.
--   * enabled no longer needs a fee, and defaults to on;
--   * every existing owner gets its row (on), so a biker can link to it; owners added later get theirs on first use.
-- Rows admin already wrote (an explicit Disable included) stay as they are.

ALTER TABLE "owner_fleets" DROP CONSTRAINT IF EXISTS "owner_fleets_enabled_needs_fee";
ALTER TABLE "owner_fleets" ALTER COLUMN "enabled" SET DEFAULT true;

INSERT INTO "owner_fleets" ("owner_profile_id", "enabled", "created_at", "updated_at")
SELECT DISTINCT m."owner_profile_id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "merchants" m
WHERE m."owner_profile_id" IS NOT NULL
ON CONFLICT ("owner_profile_id") DO NOTHING;
