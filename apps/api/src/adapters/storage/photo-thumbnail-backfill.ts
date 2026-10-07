import type { PrismaClient } from "@prisma/client";
import { currentThumbKey, makePhotoThumbnail } from "./photo-thumbnail";
import type { StorageAdapter } from "./storage.interface";

/**
 * D7 backfill: give every menu/shop photo saved before server thumbnails existed its `<key>.thumb.jpg`.
 * Run by hand through `scripts/backfill-photo-thumbnails.ts` (see that file for the command).
 *
 * - **Idempotent.** Only a photo with no CURRENT thumb is touched (`currentThumbKey`), and the thumb key
 *   is derived from the photo key, so a second run finds nothing to do.
 * - **Resumable.** Progress is the column itself: a crash loses at most the in-flight batch. A thumb
 *   written but not yet recorded is simply made again (an object that merely exists is never trusted:
 *   it could be a truncated write), overwriting it.
 * - **Complete.** Pages are keyed on `id > last id`, not a Prisma cursor row, so a row deleted mid-run
 *   can't end the walk early.
 * - **Race-safe.** The column is set only `where` the row still holds the same photo key, so a photo the
 *   merchant replaces mid-run never gets the old photo's thumb.
 * - **Gentle.** Rows are walked by id in pages and at most `concurrency` photos are in flight.
 */

export interface BackfillOptions {
  /** false = dry run: count what would be made, write nothing. */
  apply: boolean;
  concurrency?: number;
  pageSize?: number;
  /** Per-photo cap; the backfill is not on a request path, so it can wait longer than a save. */
  timeoutMs?: number;
  log?: (line: string) => void;
}

export interface BackfillCounts {
  scanned: number;
  /** Photos that already had their current thumb. */
  skipped: number;
  /** Thumbs made (or, in a dry run, that would be). */
  made: number;
  failed: number;
}

export type BackfillPrisma = Pick<PrismaClient, "merchantDish" | "merchant">;

interface Job {
  /** For the log only. */
  label: string;
  photoKey: string;
  /** Records the thumb key, guarded on the photo key still being current. */
  record: (thumbKey: string) => Promise<void>;
}

export async function backfillPhotoThumbnails(prisma: BackfillPrisma, storage: StorageAdapter, opts: BackfillOptions): Promise<BackfillCounts> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const pageSize = Math.max(1, opts.pageSize ?? 100);
  const log = opts.log ?? (() => undefined);
  const counts: BackfillCounts = { scanned: 0, skipped: 0, made: 0, failed: 0 };

  const runJob = async (job: Job): Promise<void> => {
    if (!opts.apply) {
      counts.made++;
      return;
    }
    // No save-path gate here: `concurrency` already bounds this process.
    const made = await makePhotoThumbnail(storage, job.photoKey, { timeoutMs: opts.timeoutMs ?? 30_000, slots: null });
    if (!made) {
      counts.failed++;
      log(`  failed: ${job.label} (${job.photoKey}); the full photo keeps being served`);
      return;
    }
    await job.record(made);
    counts.made++;
  };

  const runAll = async (jobs: Job[]): Promise<void> => {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < jobs.length) {
        const job = jobs[next++]!;
        try {
          await runJob(job);
        } catch (err) {
          counts.failed++;
          log(`  failed: ${job.label}: ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  };

  // Dishes and shop items (one table).
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.merchantDish.findMany({
      where: { photoUrl: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, photoUrl: true, photoThumbKey: true },
      orderBy: { id: "asc" },
      take: pageSize,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    const jobs: Job[] = [];
    for (const r of rows) {
      counts.scanned++;
      if (!r.photoUrl || currentThumbKey(r.photoUrl, r.photoThumbKey)) {
        counts.skipped++;
        continue;
      }
      const photoKey = r.photoUrl;
      jobs.push({
        label: `dish ${r.id}`,
        photoKey,
        record: async (thumbKey) => {
          await prisma.merchantDish.updateMany({ where: { id: r.id, photoUrl: photoKey }, data: { photoThumbKey: thumbKey } });
        },
      });
    }
    await runAll(jobs);
    log(`dishes: scanned ${counts.scanned} so far (last id ${cursor})`);
  }

  // Shop covers and logos.
  let shopCursor: string | undefined;
  for (;;) {
    const rows: Array<{ id: string; coverPhotoUrl: string | null; logoUrl: string | null; coverThumbKey: string | null; logoThumbKey: string | null }> = await prisma.merchant.findMany({
      where: { OR: [{ coverPhotoUrl: { not: null } }, { logoUrl: { not: null } }], ...(shopCursor ? { id: { gt: shopCursor } } : {}) },
      select: { id: true, coverPhotoUrl: true, logoUrl: true, coverThumbKey: true, logoThumbKey: true },
      orderBy: { id: "asc" },
      take: pageSize,
    });
    if (rows.length === 0) break;
    shopCursor = rows[rows.length - 1]!.id;
    const jobs: Job[] = [];
    for (const r of rows) {
      for (const which of ["cover", "logo"] as const) {
        const photoKey = which === "cover" ? r.coverPhotoUrl : r.logoUrl;
        if (!photoKey) continue;
        counts.scanned++;
        if (currentThumbKey(photoKey, which === "cover" ? r.coverThumbKey : r.logoThumbKey)) {
          counts.skipped++;
          continue;
        }
        jobs.push({
          label: `merchant ${r.id} ${which}`,
          photoKey,
          record: async (thumbKey) => {
            await prisma.merchant.updateMany({
              where: which === "cover" ? { id: r.id, coverPhotoUrl: photoKey } : { id: r.id, logoUrl: photoKey },
              data: which === "cover" ? { coverThumbKey: thumbKey } : { logoThumbKey: thumbKey },
            });
          },
        });
      }
    }
    await runAll(jobs);
    log(`shops: scanned ${counts.scanned} photos so far (last id ${shopCursor})`);
  }

  return counts;
}
