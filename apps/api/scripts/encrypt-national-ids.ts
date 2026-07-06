/**
 * One-off backfill (LR8): encrypt every existing plaintext `profiles.id_number` at rest and populate
 * `id_number_hash` (the HMAC used for duplicate-ID detection). Idempotent — a row already stored as
 * ciphertext (`v1:` prefix) is skipped, so a second run is a no-op.
 *
 *   pnpm --filter @lynia/api encrypt-ids            # DRY RUN (default) — reports, changes nothing
 *   pnpm --filter @lynia/api encrypt-ids -- --apply # APPLY — encrypts + hashes in place
 *
 * Rollout order: deploy the app (new writes already encrypt; reads decrypt `v1:` and pass legacy
 * plaintext through) → run this with --apply → all rows are ciphertext + hashed and dedup is fully
 * effective. Requires the SAME `PII_ENCRYPTION_KEY` the running service uses. Take a DB backup first.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../src/config/env";
import { PiiCryptoService } from "../src/common/pii-crypto.service";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const crypto = new PiiCryptoService(loadEnv());

async function main(): Promise<void> {
  console.log(`\nNational-ID encryption backfill — ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const rows = await prisma.profile.findMany({
    where: { idNumber: { not: null } },
    select: { id: true, idNumber: true, idNumberHash: true },
  });

  let already = 0;
  let toEncrypt = 0;
  for (const r of rows) {
    const stored = r.idNumber as string;
    if (crypto.isEncrypted(stored) && r.idNumberHash) {
      already++;
      continue;
    }
    toEncrypt++;
    if (APPLY) {
      // A row can be part-migrated (encrypted but no hash) if a prior run was interrupted — recover the
      // plaintext to recompute the hash only when it's still plaintext; an encrypted-but-unhashed row
      // can't be re-hashed without the plaintext, so we only encrypt genuinely-plaintext values here.
      const plaintext = crypto.decryptId(stored) ?? stored;
      await prisma.profile.update({
        where: { id: r.id },
        data: { idNumber: crypto.encryptId(plaintext), idNumberHash: crypto.hashId(plaintext) },
      });
    }
  }

  const verb = APPLY ? "(applied)" : "(would apply)";
  console.log(`Scanned:           ${rows.length} profiles with an id_number`);
  console.log(`Already encrypted: ${already}`);
  console.log(`Encrypted + hashed: ${toEncrypt} ${verb}`);
  console.log(`\n${APPLY ? "Applied." : "Dry run — re-run with -- --apply to execute."}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
