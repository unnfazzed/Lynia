/**
 * One-off (owner, 2026-10-18): turn five test accounts that signed up as bikers back into plain customers.
 * Each keeps its profile, phone and customer orders; the biker record (the `riders` row and what cascades
 * from it) goes, and they start become-biker from scratch if they ever apply again.
 *
 *   pnpm --filter @lynia/api bikers:reset-to-customer                # DRY RUN (default) — reports, writes nothing
 *   pnpm --filter @lynia/api bikers:reset-to-customer -- --apply     # APPLY
 *
 * Run with the SAME environment as the API (DATABASE_URL). Each person is matched by first + last name AND the
 * last four digits of the phone, and must match exactly one profile. Anyone with live biker activity
 * (orders, offers, a wallet balance or ledger, pending/confirmed top-ups, referrals, a ban/suspension) is SKIPPED and reported, never
 * removed. Declined/expired top-ups moved no money and don't block (they go with the row). Sessions are revoked so a stale token can't keep the biker screens open.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { auditData } from "../src/admin/admin.shared";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const TARGETS = [
  { firstName: "Benson", lastName: "Musendarudzi", last4: "4780" },
  { firstName: "Nobuhle", lastName: "Matewee", last4: "3688" },
  { firstName: "Blessed", lastName: "Mahupa", last4: "1985" },
  { firstName: "Takunda", lastName: "Tkay", last4: "0659" },
  { firstName: "givemore", lastName: "sadu", last4: "4856" },
];

const ACTION = "rider.reset_to_customer";
const ACTOR = "system:reset-bikers-script";

async function main(): Promise<void> {
  console.log(`\nReset bikers to customers — ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  let skipped = 0;

  for (const t of TARGETS) {
    const label = `${t.firstName} ${t.lastName} (…${t.last4})`;
    const matches = await prisma.profile.findMany({
      where: {
        firstName: { equals: t.firstName, mode: "insensitive" },
        lastName: { equals: t.lastName, mode: "insensitive" },
        phone: { endsWith: t.last4 },
      },
      select: { id: true, role: true, rider: { select: { kycStatus: true, isOnline: true, accountStatus: true, onHold: true } } },
    });
    if (matches.length !== 1) {
      console.log(`SKIP  ${label}: ${matches.length} profiles matched (need exactly 1)`);
      skipped++;
      continue;
    }
    const p = matches[0];
    if (!p.rider) {
      console.log(`SKIP  ${label}: no biker record (role=${p.role}) — nothing to reset`);
      if (p.role === "rider") console.log(`      ^ role is rider with no rider row; set role to customer by hand`);
      skipped++;
      continue;
    }
    if (p.role !== "rider") {
      console.log(`SKIP  ${label}: role is ${p.role}, not rider — refusing to touch`);
      skipped++;
      continue;
    }

    const [orders, dispatchOffers, offers, wallet, ledger, topUps, settlements, debts, referralsMade, referralCode, referred] = await Promise.all([
      prisma.order.count({ where: { riderId: p.id } }),
      prisma.order.count({ where: { dispatchOfferedRiderId: p.id } }),
      prisma.offer.count({ where: { riderId: p.id } }),
      prisma.commissionAccount.findUnique({ where: { riderId: p.id }, select: { balance: true } }),
      prisma.commissionLedger.count({ where: { riderId: p.id } }),
      prisma.topUp.count({ where: { riderId: p.id, status: { in: ["pending", "confirmed"] } } }),
      prisma.settlement.count({ where: { riderId: p.id } }),
      prisma.merchantDebtLedger.count({ where: { riderId: p.id } }),
      prisma.referral.count({ where: { referrerId: p.id } }),
      prisma.referralCode.count({ where: { riderId: p.id } }),
      prisma.referral.count({ where: { refereeId: p.id } }),
    ]);

    const blockers: string[] = [];
    if (orders) blockers.push(`${orders} order(s) as biker`);
    if (dispatchOffers) blockers.push(`${dispatchOffers} pending dispatch offer(s)`);
    if (offers) blockers.push(`${offers} offer(s)`);
    if (wallet && !wallet.balance.isZero()) blockers.push(`wallet balance ${wallet.balance.toString()}`);
    if (ledger) blockers.push(`${ledger} wallet ledger row(s)`);
    if (topUps) blockers.push(`${topUps} pending/confirmed top-up(s)`);
    if (settlements) blockers.push(`${settlements} settlement(s)`);
    if (debts) blockers.push(`${debts} merchant debt row(s)`);
    if (referralsMade) blockers.push(`${referralsMade} referral(s) made`);
    if (referralCode) blockers.push("has a referral code");
    if (p.rider.accountStatus !== "active") blockers.push(`account ${p.rider.accountStatus}`);
    if (blockers.length) {
      console.log(`SKIP  ${label}: ${blockers.join(", ")}`);
      skipped++;
      continue;
    }

    const state = `kyc=${p.rider.kycStatus}${p.rider.isOnline ? ", ONLINE" : ""}${referred ? ", was referred" : ""}`;
    if (!APPLY) {
      console.log(`WOULD RESET  ${label} (${state})`);
      continue;
    }

    // One transaction; the delete re-asserts "no orders/offers" so activity that landed since the check above
    // makes it fail (FK) instead of erasing history. Rider-row children cascade; Referral (as referee) goes too.
    await prisma.$transaction(async (tx) => {
      await tx.referral.deleteMany({ where: { refereeId: p.id } });
      await tx.rider.delete({ where: { profileId: p.id } });
      await tx.profile.update({ where: { id: p.id }, data: { role: "customer" } });
      await tx.session.updateMany({ where: { profileId: p.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: auditData(ACTOR, ACTION, p.id, "test_account", `was ${state}`) });
    });
    console.log(`RESET  ${label} (${state})`);
  }

  console.log(`\n${APPLY ? "Applied." : "Dry run — re-run with -- --apply to execute."}${skipped ? ` ${skipped} skipped (see above).` : ""}`);
  if (skipped > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
