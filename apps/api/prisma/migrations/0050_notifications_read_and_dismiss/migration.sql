-- STREAMLINE-01 (owner decision 2026-08-17): give the in-app notifications centre real READ state and
-- real DISMISSAL, so its one-day retention window is the only thing that makes a row disappear on its
-- own.
--
-- The centre is a DERIVED read model (notifications-feed.service.ts) over orders / order events /
-- offers / audit logs / issues / SOS events — there is no Notification table, so before this migration
-- there was nowhere to record that a row had been seen or swiped away. "Unread" was a recency proxy
-- (`event younger than 24h`), which could neither be cleared by reading nor preserved for something
-- never seen, and dismissal did not exist at all: a row left the list only when newer rows evicted it.
--
--   * profiles.notifications_read_at  — when this profile last OPENED the centre. `unread` becomes
--                                       "row is newer than this watermark"; NULL = never opened.
--                                       ONE column, not per-row read state: the centre is a single
--                                       chronological list read top-down, so "seen up to here" is the
--                                       only distinction the screen can honestly make.
--   * notification_dismissals         — one row per swiped-away feed row, keyed by the feed's stable
--                                       synthetic row id (`<orderId>:<status>:<at>`, `offers:<id>`,
--                                       `account:<id>`, …). `row_id` is opaque TEXT, not a foreign key:
--                                       the row it names is synthesized on read and may already have
--                                       aged out of the retention window.
--
-- Additive only. One NULLABLE column on an existing table (no default, no backfill — catalog-only in
-- Postgres) plus one new table; no existing column is touched, and a deployed client that knows nothing
-- about either keeps working exactly as before.
--
-- The dismissals table is SELF-PRUNING, not swept: nothing in the feed outlives the one-day window, so
-- a dismissal older than that can never match a row again and is deleted on the next dismissal write
-- (NotificationsFeedService.dismiss). That is why there is no scheduled cleanup job to own here.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "notifications_read_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_dismissals" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "row_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_dismissals_pkey" PRIMARY KEY ("id")
);

-- A double-swipe (two devices, or a retry over a flaky link) must be a no-op upsert, not a 500.
-- CreateIndex
CREATE UNIQUE INDEX "notification_dismissals_profile_id_row_id_key" ON "notification_dismissals"("profile_id", "row_id");

-- The feed read loads one profile's in-window dismissals; the prune deletes one profile's stale ones.
-- CreateIndex
CREATE INDEX "notification_dismissals_profile_id_created_at_idx" ON "notification_dismissals"("profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification_dismissals" ADD CONSTRAINT "notification_dismissals_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
