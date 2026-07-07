/**
 * One-off backfill: recompute `profiles.id_number_hash` with the current PiiCryptoService normalisation.
 *
 * WHY: the ID-hash normaliser was tightened to strip ALL non-alphanumerics before hashing (so
 * "63-123456-A-42", "63123456A42" and "63 123456 A 42" collide), closing a duplicate-account /
 * ban-evasion bypass. Rows hashed before that change carry the OLD hash (case/whitespace-normalised
 * only), so a formatting variant of an already-registered ID no longer matches them until they're
 * re-hashed. This recomputes the hash from the decrypted plaintext and updates only the rows whose hash
 * actually changed. Idempotent — a second run re-derives the same hash and reports everything unchanged.
 *
 *   pnpm --filter @lynia/api ids:rehash            # DRY RUN (default) — reports, changes nothing
 *   pnpm --filter @lynia/api ids:rehash -- --apply # APPLY — rewrites id_number_hash in place
 *
 * Order: deploy the app (new writes already use the tightened hash) → run this with --apply. Requires
 * the SAME `PII_ENCRYPTION_KEY` the running service uses (the hash is keyed HMAC). Take a DB backup
 * first. `id_number_hash` is a non-unique index, so hashes that now collide (the whole point) are fine.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../src/config/env";
import { PiiCryptoService } from "../src/common/pii-crypto.service";

// Prisma 7: the client needs a driver adapter; the pool is lazy so a missing DATABASE_URL
// still fails at first query (with a clear pg error), not at import time.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const crypto = new PiiCryptoService(loadEnv());

async function main(): Promise<void> {
  console.log(`\nNational-ID hash backfill — ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const rows = await prisma.profile.findMany({
    where: { idNumberHash: { not: null } },
    select: { id: true, idNumber: true, idNumberHash: true },
  });

  let unchanged = 0;
  let rehashed = 0;
  let skippedNoPlaintext = 0;
  for (const r of rows) {
    // Recover the plaintext to re-hash: decryptId returns the value for a `v1:` ciphertext and passes a
    // legacy plaintext through unchanged. A row with a hash but no id_number can't be recomputed — skip
    // it and report, rather than blank a hash we can't regenerate.
    const plaintext = r.idNumber ? crypto.decryptId(r.idNumber) : null;
    if (!plaintext) {
      skippedNoPlaintext++;
      continue;
    }
    const newHash = crypto.hashId(plaintext);
    if (newHash === r.idNumberHash) {
      unchanged++;
      continue;
    }
    rehashed++;
    if (APPLY) {
      await prisma.profile.update({ where: { id: r.id }, data: { idNumberHash: newHash } });
    }
  }

  const verb = APPLY ? "(applied)" : "(would apply)";
  console.log(`Scanned:            ${rows.length} profiles with an id_number_hash`);
  console.log(`Unchanged:          ${unchanged}`);
  console.log(`Re-hashed:          ${rehashed} ${verb}`);
  if (skippedNoPlaintext > 0) {
    console.log(`Skipped (no id_number to recompute from): ${skippedNoPlaintext}`);
  }
  console.log(`\n${APPLY ? "Applied." : "Dry run — re-run with -- --apply to execute."}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
