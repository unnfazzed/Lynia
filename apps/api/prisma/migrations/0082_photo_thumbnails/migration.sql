-- D7 (owner 2026-10-07, findings P04 / MJ-RL20): server-made thumbnails for menu and shop photos.
-- Each column holds the object key of the photo's small JPEG variant (`<photo key>.thumb.jpg`), set once
-- the thumb is written. Expand-only: nullable columns with no default are a catalog-only change on
-- PostgreSQL (no table rewrite, no long lock); existing rows read NULL (no thumb yet: readers fall back
-- to the full photo, and `pnpm --filter @lynia/api thumbs:backfill` fills them), and the still-live old
-- revision neither reads nor writes them.
ALTER TABLE "merchants" ADD COLUMN "cover_thumb_key" TEXT;
ALTER TABLE "merchants" ADD COLUMN "logo_thumb_key" TEXT;
ALTER TABLE "merchant_dishes" ADD COLUMN "photo_thumb_key" TEXT;
