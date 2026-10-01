-- Calm Mint v2 rider onboarding (docs/DESIGN-DEVIATIONS.md D-55, owner decision 2026-10-01): a rider
-- needs only the national ID check to start; the bike registration is optional and added later.
--
-- Online-safe: DROP NOT NULL is a catalog-only change (no table rewrite, no long lock), and every
-- existing row keeps its plate.
ALTER TABLE "riders" ALTER COLUMN "bike_reg" DROP NOT NULL;
