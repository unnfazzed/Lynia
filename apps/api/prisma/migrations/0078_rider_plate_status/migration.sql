-- First Run v2 E4 (docs/DESIGN-DEVIATIONS.md D-80): whether ops have confirmed the rider's bike plate.
-- A self-service plate change saves instantly and reads "Checking" until ops confirm it.
-- Expand-only: a new enum type and one NOT NULL column with a constant default — on PostgreSQL 11+ that
-- is a catalog-only change (no table rewrite, no long lock); existing rows read 'none' (never checked),
-- and the still-live old revision neither reads nor writes the column.
CREATE TYPE "PlateStatus" AS ENUM ('none', 'checking', 'verified');
ALTER TABLE "riders" ADD COLUMN "plate_status" "PlateStatus" NOT NULL DEFAULT 'none';
