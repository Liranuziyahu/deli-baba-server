/* eslint-disable no-console */
// apps/api/prisma/seed.ts
import { PrismaClient, UserRole, OrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function createRouteWithStopsFlexible(params: {
  driverId: number;
  adminId?: number;
  orders: { id: number }[];
  distanceKm: number;
  durationMin: number;
}) {
  const baseData: any = {
    serviceDate: new Date(),
    distanceKm: params.distanceKm,
    durationMin: params.durationMin,
    driver: { connect: { id: params.driverId } },
    stops: {
      // ננסה קודם עם seq
      create: params.orders.map((o, idx) => ({
        order: { connect: { id: o.id } },
        seq: idx + 1,
      })),
    },
  };

  // אם יש createdBy בסכמה שלך (כ־relation), נוסיף connect
  if (typeof params.adminId === "number") {
    baseData.createdBy = { connect: { id: params.adminId } };
  }

  try {
    return await prisma.route.create({
      data: baseData,
      include: { stops: true },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    // אם השדה seq לא קיים בסכמה — ננסה שוב עם position
    if (msg.includes("Unknown argument `seq`") || msg.includes("Argument seq")) {
      const dataRetry: any = {
        ...baseData,
        stops: {
          create: params.orders.map((o, idx) => ({
            order: { connect: { id: o.id } },
            position: idx + 1,
          })),
        },
      };
      try {
        return await prisma.route.create({
          data: dataRetry,
          include: { stops: true },
        });
      } catch (e2) {
        // אם גם זה נפל — נזרוק קדימה עם הודעה ברורה
        console.error("Failed creating route with stops using both seq and position.");
        throw e2;
      }
    }

    // אם נפל על createdBy כארגומנט לא קיים—נוריד אותו וננסה שוב
    if (msg.includes("Unknown argument `createdBy`")) {
      const { createdBy, ...rest } = baseData;
      return await prisma.route.create({
        data: rest,
        include: { stops: true },
      });
    }

    throw e;
  }
}

async function main() {
  console.log("🌱 Starting seed...");

  // ---------- Admins ----------
  const [admin1, admin2] = await Promise.all([
    prisma.user.upsert({
      where: { email: "alice@deli.local" },
      update: {},
      create: {
        email: "alice@deli.local",
        passwordHash: "dev-only",
        fullName: "Alice Dispatcher",
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.upsert({
      where: { email: "bob@deli.local" },
      update: {},
      create: {
        email: "bob@deli.local",
        passwordHash: "dev-only",
        fullName: "Bob Dispatcher",
        role: UserRole.ADMIN,
      },
    }),
  ]);

  // ---------- Drivers ----------
  const [driverUser1, driverUser2] = await Promise.all([
    prisma.user.upsert({
      where: { email: "driver1@deli.local" },
      update: {},
      create: {
        email: "driver1@deli.local",
        passwordHash: "dev-only",
        fullName: "Driver One",
        role: UserRole.DRIVER,
      },
    }),
    prisma.user.upsert({
      where: { email: "driver2@deli.local" },
      update: {},
      create: {
        email: "driver2@deli.local",
        passwordHash: "dev-only",
        fullName: "Driver Two",
        role: UserRole.DRIVER,
      },
    }),
  ]);

  const [driver1, driver2] = await Promise.all([
    prisma.driver.upsert({
      where: { userId: driverUser1.id },
      update: {},
      create: {
        userId: driverUser1.id,
        phone: "050-1111111",
        vehicle: "Van",
        capacity: 50,
        active: true,
      },
    }),
    prisma.driver.upsert({
      where: { userId: driverUser2.id },
      update: {},
      create: {
        userId: driverUser2.id,
        phone: "050-2222222",
        vehicle: "Motorbike",
        capacity: 20,
        active: true,
      },
    }),
  ]);

  // ---------- Orders ----------
  const ordersSet1 = await prisma.$transaction(
    Array.from({ length: 4 }).map((_, i) =>
      prisma.order.create({
        data: {
          externalRef: `ORD-A-${1000 + i}`,
        customerName: `Customer A${i + 1}`,
          phone: "050-1234567",
          addressLine: `Herzl ${10 + i}`,
          city: "Tel Aviv",
          lat: 32.0809 + i * 0.002,
          lng: 34.7806 + i * 0.002,
          status: OrderStatus.PENDING,
        },
      })
    )
  );

  const ordersSet2 = await prisma.$transaction(
    Array.from({ length: 3 }).map((_, i) =>
      prisma.order.create({
        data: {
          externalRef: `ORD-B-${2000 + i}`,
          customerName: `Customer B${i + 1}`,
          phone: "050-7654321",
          addressLine: `Dizengoff ${20 + i}`,
          city: "Tel Aviv",
          lat: 32.075 + i * 0.002,
          lng: 34.78 + i * 0.002,
          status: OrderStatus.PENDING,
        },
      })
    )
  );

  // ---------- Routes (2) ----------
  const route1 = await createRouteWithStopsFlexible({
    driverId: driver1.id,
    adminId: admin1.id,
    orders: ordersSet1.map((o) => ({ id: o.id })),
    distanceKm: 18.3,
    durationMin: 60,
  });

  const route2 = await createRouteWithStopsFlexible({
    driverId: driver2.id,
    adminId: admin2.id,
    orders: ordersSet2.map((o) => ({ id: o.id })),
    distanceKm: 9.7,
    durationMin: 35,
  });

  console.log("✅ Seed complete!", {
    admins: [admin1.email, admin2.email],
    drivers: [driverUser1.email, driverUser2.email],
    routes: [route1.id, route2.id],
    totalStops: route1.stops.length + route2.stops.length,
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
