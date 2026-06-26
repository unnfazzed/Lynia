/**
 * Local dev seed: an admin, a customer, 5 verified online riders around a Harare corridor, and a
 * sample open order — so the offer loop, nearby-rider query, and admin dashboard have data.
 *   pnpm db:seed   (after db:up + db:migrate)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CORRIDOR = { lat: -17.8292, lng: 31.0522 }; // Harare CBD

async function main(): Promise<void> {
  await prisma.profile.upsert({
    where: { phone: "+263770000000" },
    update: { role: "admin" },
    create: { phone: "+263770000000", firstName: "Ops", lastName: "Admin", role: "admin", phoneVerifiedAt: new Date() },
  });

  const customer = await prisma.profile.upsert({
    where: { phone: "+263771111111" },
    update: {},
    create: { phone: "+263771111111", firstName: "Tariro", lastName: "C", role: "customer", phoneVerifiedAt: new Date() },
    select: { id: true },
  });

  const riders: ReadonlyArray<readonly [string, string]> = [
    ["Tendai", "M"],
    ["Rugare", "C"],
    ["Blessing", "N"],
    ["Farai", "K"],
    ["Kuda", "S"],
  ];

  for (let i = 0; i < riders.length; i++) {
    const [firstName, lastName] = riders[i]!;
    const phone = `+26378${String(2000000 + i).padStart(7, "0")}`;
    const p = await prisma.profile.upsert({
      where: { phone },
      update: { role: "rider" },
      create: { phone, firstName, lastName, role: "rider", phoneVerifiedAt: new Date() },
      select: { id: true },
    });
    await prisma.rider.upsert({
      where: { profileId: p.id },
      update: { kycStatus: "verified", idVerified: true, isOnline: true, lastHeartbeatAt: new Date() },
      create: {
        profileId: p.id,
        bikeReg: `ABZ ${1000 + i}`,
        photoUrl: "https://example.test/rider.jpg",
        kycStatus: "verified",
        idVerified: true,
        isOnline: true,
        lastHeartbeatAt: new Date(),
        ratingAvg: 4.5 + i * 0.05,
        ratingCount: 20 + i * 7,
        tripsCount: 30 + i * 10,
      },
    });
    const lat = CORRIDOR.lat + (Math.random() - 0.5) * 0.02;
    const lng = CORRIDOR.lng + (Math.random() - 0.5) * 0.02;
    await prisma.$executeRaw`
      UPDATE riders
      SET geog = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          current_lat = ${lat}, current_lng = ${lng}
      WHERE profile_id = ${p.id}::uuid`;
  }

  await prisma.order.create({
    data: {
      customerId: customer.id,
      orderType: "parcel",
      pickup: { lat: CORRIDOR.lat, lng: CORRIDOR.lng, landmark: "Eastgate Mall, CBD", contactPhone: "+263771111111" },
      dropoff: { lat: CORRIDOR.lat + 0.01, lng: CORRIDOR.lng + 0.01, landmark: "14 Glenara Ave, Avenues", contactPhone: "+263772222222" },
      itemDesc: "Documents envelope",
      declaredValue: 10,
      suggestedFare: 2.5,
      proposedFare: 2.5,
      status: "open_for_offers",
      events: { create: { status: "open_for_offers" } },
    },
  });

  console.log(`Seeded: 1 admin, 1 customer, ${riders.length} verified online riders, 1 open order.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
