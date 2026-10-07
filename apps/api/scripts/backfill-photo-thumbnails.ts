/**
 * One-off backfill (D7, owner 2026-10-07): make the `<key>.thumb.jpg` thumbnail for every menu dish / shop
 * item / shop cover / logo photo saved before the API made thumbnails on save. Until a photo has one, the
 * API keeps serving the full photo (no `thumbUrl`), so running this is never urgent and never risky.
 *
 *   pnpm --filter @lynia/api thumbs:backfill                       # DRY RUN (default) — counts, writes nothing
 *   pnpm --filter @lynia/api thumbs:backfill -- --apply            # APPLY — writes thumbs + records them
 *   pnpm --filter @lynia/api thumbs:backfill -- --apply --concurrency=2
 *
 * Run it with the SAME environment as the API service (DATABASE_URL, CLOUD_PROVIDER and the bucket /
 * container vars, plus whatever `loadEnv` requires) — from a Cloud Run job or a shell holding the runtime
 * service account. Order: migrate (0082) → deploy the API → run this with --apply. Idempotent and
 * resumable: re-run it after an interruption and it picks up where it stopped (see
 * src/adapters/storage/photo-thumbnail-backfill.ts).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../src/config/env";
import { backfillPhotoThumbnails } from "../src/adapters/storage/photo-thumbnail-backfill";
import { selectStorage } from "../src/adapters/storage/storage.module";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? Number(concurrencyArg.split("=")[1]) || 3 : 3;

async function main(): Promise<void> {
  console.log(`\nPhoto thumbnail backfill — ${APPLY ? "APPLY" : "DRY RUN"} (concurrency ${CONCURRENCY})\n`);
  const storage = selectStorage(loadEnv());
  const counts = await backfillPhotoThumbnails(prisma, storage, { apply: APPLY, concurrency: CONCURRENCY, log: (l) => console.log(l) });
  const verb = APPLY ? "made" : "would make";
  console.log(`\nPhotos scanned:            ${counts.scanned}`);
  console.log(`Already had a thumbnail:   ${counts.skipped}`);
  console.log(`Thumbnails ${verb}:${" ".repeat(Math.max(1, 16 - verb.length))}${counts.made}`);
  if (APPLY) console.log(`Found in storage, recorded: ${counts.recorded}`);
  if (counts.failed > 0) console.log(`Failed (re-run to retry):  ${counts.failed}`);
  console.log(`\n${APPLY ? "Applied." : "Dry run — re-run with -- --apply to execute."}`);
  if (counts.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
