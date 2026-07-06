/**
 * One-off backfill: canonicalize every existing profiles.phone to E.164 (the same normalizePhone the
 * auth layer now applies to new writes). Idempotent — a second run on an already-canonical DB is a
 * no-op. The decision logic lives in src/auth/phone-backfill.ts (unit-tested); this file is the thin
 * Prisma shell that loads rows, prints the plan, and (with --apply) executes it.
 *
 *   pnpm --filter @lynia/api phones:normalize            # DRY RUN (default) — reports, changes nothing
 *   pnpm --filter @lynia/api phones:normalize -- --apply # APPLY — runs the changes in transactions
 *
 * Why this isn't a plain UPDATE: profiles.phone is UNIQUE and other tables key off profileId, so when
 * two rows canonicalize to the SAME number (one person, two signups) a blind update collides. The plan
 * renames every row whose canonical form is free; for a collision it keeps one survivor and folds in a
 * loser ONLY when the loser is empty (no rider record, no orders, no ratings) — moving its saved
 * addresses first, then deleting it (which cascades its device tokens + sessions). A collision with
 * real data on both sides, and any unparseable phone, are reported and left untouched for a human.
 *
 * Take a DB backup before --apply.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { plan, type ProfileForBackfill } from "../src/auth/phone-backfill";

// Prisma 7: the client needs a driver adapter; the pool is lazy so a missing DATABASE_URL
// still fails at first query (with a clear pg error), not at import time.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  console.log(`\nPhone normalization — ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const rows = await prisma.profile.findMany({
    select: {
      id: true,
      phone: true,
      createdAt: true,
      rider: { select: { profileId: true } },
      _count: { select: { customerOrders: true, ratingsGiven: true } },
    },
  });

  const forPlan: ProfileForBackfill[] = rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    createdAt: r.createdAt,
    hasRider: r.rider !== null,
    ordersAsCustomer: r._count.customerOrders,
    ratingsGiven: r._count.ratingsGiven,
  }));

  const p = plan(forPlan);

  if (APPLY) {
    for (const m of p.merges) {
      await prisma.$transaction(async (tx) => {
        for (const loserId of m.loserIds) {
          await tx.address.updateMany({ where: { profileId: loserId }, data: { profileId: m.survivorId } });
          await tx.profile.delete({ where: { id: loserId } }); // cascades device tokens + sessions
        }
        if (m.survivorPhone !== m.target) {
          await tx.profile.update({ where: { id: m.survivorId }, data: { phone: m.target } });
        }
      });
    }
    for (const r of p.renames) {
      await prisma.profile.update({ where: { id: r.id }, data: { phone: r.to } });
    }
  }

  const verb = APPLY ? "(applied)" : "(would apply)";
  console.log(`Scanned:            ${rows.length} profiles`);
  console.log(`Already canonical:  ${p.unchanged}`);
  console.log(`Renamed:            ${p.renames.length} ${verb}`);
  for (const r of p.renames) console.log(`   ${r.from}  ->  ${r.to}   (${r.id})`);
  console.log(`Merged collisions:  ${p.merges.length} ${verb}`);
  for (const m of p.merges) console.log(`   ${m.target}: kept ${m.survivorId}, folded ${m.loserIds.length} empty [${m.loserIds.join(", ")}]`);
  console.log(`MANUAL REVIEW:      ${p.manual.length} collision group(s) left untouched (real data on both sides)`);
  for (const m of p.manual) {
    console.log(`   ${m.target}:`);
    for (const row of m.rows) console.log(`      ${row.phone} (${row.id}) — ${row.reason}`);
  }
  console.log(`QUARANTINE:         ${p.invalid.length} unparseable phone(s) left untouched`);
  for (const r of p.invalid) console.log(`   ${r.phone} (${r.id})`);

  const needsHuman = p.manual.length + p.invalid.length;
  console.log(
    `\n${APPLY ? "Applied." : "Dry run — re-run with --apply to execute."}` +
      (needsHuman ? ` ${needsHuman} item(s) need manual resolution.` : " Nothing needs manual resolution."),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
