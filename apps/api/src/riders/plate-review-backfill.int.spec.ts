/**
 * First Run v2 E4 backfill (migration 0079, owner 2026-10-06): runs the migration's own SQL against a real
 * Postgres. Plates on file go to ops review (`none` → `checking`); blank / missing plates and plates already
 * checking or verified are left alone; a second run changes nothing. Runs in CI (needs DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();
const SQL = readFileSync(resolve(__dirname, "../../prisma/migrations/0079_rider_plate_review_backfill/migration.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

async function rider(bikeReg: string | null, plateStatus: "none" | "checking" | "verified" = "none"): Promise<string> {
  const p = await prisma.profile.create({ data: { role: "rider", firstName: "R", lastName: "R", phone: `p_${crypto.randomUUID()}` }, select: { id: true } });
  await prisma.rider.create({ data: { profileId: p.id, bikeReg, plateStatus } });
  return p.id;
}

const statusOf = async (id: string): Promise<string> => (await prisma.rider.findUniqueOrThrow({ where: { profileId: id }, select: { plateStatus: true } })).plateStatus;

beforeEach(async () => {
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("0079_rider_plate_review_backfill (real Postgres)", () => {
  it("sends every unchecked plate on file to review, and only those; idempotent", async () => {
    const plate = await rider("ABZ 4417");
    const none = await rider(null);
    const blank = await rider("");
    const checking = await rider("AFG 2231", "checking");
    const verified = await rider("AEE 4471", "verified");
    await prisma.$executeRawUnsafe(SQL);
    expect(await statusOf(plate)).toBe("checking");
    expect(await statusOf(none)).toBe("none");
    expect(await statusOf(blank)).toBe("none");
    expect(await statusOf(checking)).toBe("checking");
    expect(await statusOf(verified)).toBe("verified");
    expect(await prisma.$executeRawUnsafe(SQL)).toBe(0);
  });
});
