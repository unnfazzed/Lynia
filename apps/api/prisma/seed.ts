/**
 * Local dev seed: an admin, a customer, 5 verified online riders around a Harare corridor, and a
 * sample open order — so the offer loop, nearby-rider query, and admin dashboard have data.
 *   pnpm db:seed   (after db:up + db:migrate)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7: the client needs a driver adapter; the pool is lazy so a missing DATABASE_URL
// still fails at first query (with a clear pg error), not at import time.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
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
      // Waypoints nest the coords under `point` (packages/shared Waypoint contract). The pickup_geog
      // generated column extracts pickup->'point'->>'lng'/'lat', so a flat {lat,lng} would leave
      // pickup_geog NULL and the seeded order would never surface in the ST_DWithin board query.
      pickup: {
        point: { lat: CORRIDOR.lat, lng: CORRIDOR.lng },
        landmark: "Eastgate Mall, CBD",
        contactPhone: "+263771111111",
      },
      dropoff: {
        point: { lat: CORRIDOR.lat + 0.01, lng: CORRIDOR.lng + 0.01 },
        landmark: "14 Glenara Ave, Avenues",
        contactPhone: "+263772222222",
      },
      itemDesc: "Documents envelope",
      declaredValue: 10,
      suggestedFare: 2.5,
      proposedFare: 2.5,
      status: "open_for_offers",
      events: { create: { status: "open_for_offers" } },
    },
  });

  // #674: a pilotEnabled merchant + menu + food orders across the MerchantPhase set, so a SEEDED
  // parity instance (PARITY_MERCHANT_URL / PARITY_ADMIN_URL → this API) renders POPULATED merchant-
  // tablet + food states instead of the offline "/login" / "API not connected" shells. The seed
  // shipped with only parcel data, so merchant/food routes had nothing to render like-for-like.
  const merchantOwner = await prisma.profile.upsert({
    where: { phone: "+263773333333" },
    update: { role: "merchant" },
    create: { phone: "+263773333333", firstName: "Sadza", lastName: "Republic", role: "merchant", phoneVerifiedAt: new Date() },
    select: { id: true },
  });
  const merchant = await prisma.merchant.upsert({
    where: { ownerProfileId: merchantOwner.id },
    update: { pilotEnabled: true },
    create: {
      name: "Sadza Republic",
      ownerProfileId: merchantOwner.id,
      description: "Home-style Zimbabwean plates, cooked to order.",
      cuisineTags: ["Zimbabwean", "Grills"],
      priceLevel: 2,
      pilotEnabled: true, // the per-merchant allowlist gate — required for the customer read API
      prepBaselineMinutes: 18, // #673: feeds the discovery-card ETA
      foodRatingAvg: 4.6, // #673: seeded so the card shows a real star
      foodRatingCount: 24,
      hours: { mon: { open: "08:00", close: "21:00" }, tue: { open: "08:00", close: "21:00" }, wed: { open: "08:00", close: "21:00" }, thu: { open: "08:00", close: "21:00" }, fri: { open: "08:00", close: "22:00" }, sat: { open: "09:00", close: "22:00" }, sun: { open: "10:00", close: "20:00" } },
      location: { point: CORRIDOR, landmark: "Sadza Republic, First Street, CBD", contactPhone: "+263773333333" },
    },
    select: { id: true },
  });

  // Idempotent re-run guard: menu/orders have generated uuids with no natural key to upsert on, so
  // only seed them the first time (an empty menu for this merchant ⇒ not yet seeded).
  const menuSeeded = await prisma.merchantCategory.count({ where: { merchantId: merchant.id } });
  if (menuSeeded === 0) {
    const mains = await prisma.merchantCategory.create({ data: { merchantId: merchant.id, name: "Mains", sortOrder: 0 } });
    await prisma.merchantDish.createMany({
      data: [
        { categoryId: mains.id, merchantId: merchant.id, name: "Sadza & beef stew", description: "Slow-cooked beef in rich gravy.", priceUsd: 4.5, photoUrl: "https://example.test/dish-beef.jpg", isDraft: false, sortOrder: 0 },
        { categoryId: mains.id, merchantId: merchant.id, name: "Sadza & road runner chicken", description: "Free-range chicken, tomato-onion base.", priceUsd: 5.0, photoUrl: "https://example.test/dish-chicken.jpg", isDraft: false, sortOrder: 1 },
        { categoryId: mains.id, merchantId: merchant.id, name: "Sadza & mazondo", description: "Trotters, cooked down soft.", priceUsd: 4.0, photoUrl: "https://example.test/dish-mazondo.jpg", isDraft: false, sortOrder: 2 },
      ],
    });

    // Food orders spanning the merchant queue board (E2 listQueue visible statuses) across each
    // MerchantPhase, so RM.board / RM.two_orders / queue states render with real rows.
    const phases: ReadonlyArray<readonly [phase: "awaiting_accept" | "awaiting_payment" | "preparing" | "ready_for_pickup", goods: number]> = [
      ["awaiting_accept", 9.0],
      ["awaiting_payment", 13.5],
      ["preparing", 7.5],
      ["ready_for_pickup", 11.0],
    ];
    for (const [merchantPhase, goods] of phases) {
      const grandTotal = goods + 2.5;
      await prisma.order.create({
        data: {
          customerId: customer.id,
          orderType: "merchant",
          merchantId: merchant.id,
          status: "requested", // merchant orders stay pre-dispatch (requested) through the merchant phases
          merchantPhase,
          merchantPaymentMethod: "wallet",
          merchantGoodsTotal: goods,
          deliveryFee: 2.5,
          // Order carries the parcel-shaped money fields too; food placeOrder sets suggested/proposed
          // to the grand total and declaredValue 0 (mirrored here). agreedFare is the grand total.
          itemDesc: "Sadza & beef stew ×2",
          declaredValue: 0,
          suggestedFare: grandTotal,
          proposedFare: grandTotal,
          agreedFare: grandTotal,
          pickup: { point: CORRIDOR, landmark: "Sadza Republic, First Street, CBD", contactPhone: "+263773333333" },
          dropoff: { point: { lat: CORRIDOR.lat + 0.01, lng: CORRIDOR.lng + 0.01 }, landmark: "14 Glenara Ave, Avenues", contactPhone: "+263771111111" },
          merchantItems: { create: [{ nameSnapshot: "Sadza & beef stew", priceUsd: 4.5, quantity: 2 }] },
          events: { create: { status: "requested" } },
        },
      });
    }
  }

  console.log(`Seeded: 1 admin, 1 customer, ${riders.length} verified online riders, 1 open parcel order, 1 pilot merchant (Sadza Republic) + 3 dishes + 4 food orders across merchant phases.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
