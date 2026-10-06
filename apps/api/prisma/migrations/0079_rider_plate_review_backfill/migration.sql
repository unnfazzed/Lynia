-- First Run v2 E4 (docs/DESIGN-DEVIATIONS.md D-80 §4, owner 2026-10-06: "existing plates → send to ops review").
-- Every plate already on file when 0078 added `plate_status` was never checked by ops, so it goes into the
-- review queue (`checking`) instead of sitting as `none`: Bike & documents shows "Checking" on it, and the
-- admin console lists it under plates waiting on review until ops confirm it (POST
-- /admin/riders/:id/plate-verify).
--
-- Data-only, idempotent (the 0064 precedent): one pass over the small riders table, touching only rows still
-- at the default `none` with a real plate. Erased riders keep `bike_reg = ''` (privacy.service), so blank
-- plates are skipped. A re-run, or a rider who already changed or had the plate confirmed, is left alone.
UPDATE "riders" SET "plate_status" = 'checking' WHERE "plate_status" = 'none' AND "bike_reg" IS NOT NULL AND btrim("bike_reg") <> '';
