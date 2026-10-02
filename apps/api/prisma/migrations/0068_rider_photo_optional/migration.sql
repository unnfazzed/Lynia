-- Owner 2026-10-02: the rider photo is no longer a sign-up step (it can be added later from
-- Settings → Bike & documents). Expand-only: dropping NOT NULL is a metadata change, no rewrite, and
-- every existing row already satisfies it.
ALTER TABLE "riders" ALTER COLUMN "photo_url" DROP NOT NULL;
