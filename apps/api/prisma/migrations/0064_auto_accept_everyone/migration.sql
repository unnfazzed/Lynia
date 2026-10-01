-- Restaurant auto-accept for everyone (owner decision 2026-10-01: "Auto accept everyone").
-- docs/plans/2026-09-30-restaurant-auto-accept.md.
--
-- Every restaurant, existing and new, takes cash orders automatically; the kitchen (in the app) or
-- LyniaGo ops (by phone) confirms each one before a rider is sent. A restaurant that wants the 3:00
-- accept window back turns it off itself (Account → Taking orders), or ops do it from the admin console.
--
-- Online-safe: the default change is catalog-only; the backfill is one pass over the small merchants table.
ALTER TABLE "merchants" ALTER COLUMN "auto_accept" SET DEFAULT true;
UPDATE "merchants" SET "auto_accept" = true WHERE "auto_accept" = false;
