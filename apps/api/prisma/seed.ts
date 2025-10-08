import { PrismaClient, UserRole, OrderStatus } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@deli.local" },
    update: {},
    create: {
      email: "admin@deli.local",
      passwordHash: "dev-only",
      fullName: "Admin",
      role: UserRole.ADMIN,
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: "driver@deli.local" },
    update: {},
    create: {
      email: "driver@deli.local",
      passwordHash: "dev-only",
      fullName: "Demo Driver",
      role: UserRole.DRIVER,
    },
  });

  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: { userId: driverUser.id, phone: "050-0000000", vehicle: "Scooter", capacity: 20 },
  });

  const orders = await prisma.$transaction(
    Array.from({ length: 5 }).map((_, i) =>
      prisma.order.create({
        data: {
          externalRef: `ORD-${1000 + i}`,
          customerName: `Customer ${i + 1}`,
          phone: "050-1111111",
          addressLine: `Herzl ${10 + i}`,
          city: "Tel-Aviv",
          lat: 32.0809,
          lng: 34.7806,
          status: OrderStatus.PENDING,
        },
      })
    )
  );

  const route = await prisma.route.create({
    data: {
      serviceDate: new Date(),
      driverId: driver.id,
      distanceKm: 12.5,
      durationMin: 45,
      stops: {
        create: orders.map((o, idx) => ({
          orderId: o.id,
          seq: idx + 1,
        })),
      },
    },
    include: { stops: true },
  });

  console.log({ admin, driver, routeId: route.id, stops: route.stops.length });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
