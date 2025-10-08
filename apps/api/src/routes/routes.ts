// apps/api/src/routes/routes.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function routesRoutes(app: FastifyInstance) {
  // יצירה
  const createB = z.object({
    driverId: z.number().int().positive(),
    serviceDate: z.coerce.date().default(() => new Date()),
    orderIds: z.array(z.number().int().positive()).min(1),
    distanceKm: z.number().nonnegative().optional(),
    durationMin: z.number().int().nonnegative().optional(),
  });

  app.post("/routes/create", async (req, reply) => {
    const { driverId, serviceDate, orderIds, distanceKm, durationMin } = createB.parse(req.body);

    const driver = await app.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return reply.code(400).send({ error: "Driver not found" });

    const orders = await app.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id:true, routeStop:true }});
    if (orders.length !== orderIds.length) return reply.code(400).send({ error: "Some orders not found" });
    const assigned = orders.filter(o => o.routeStop);
    if (assigned.length) return reply.code(400).send({ error: "Already assigned", ids: assigned.map(o=>o.id) });

    const route = await app.prisma.route.create({
      data: {
        driverId, serviceDate, distanceKm, durationMin, status: "PLANNED",
        stops: { create: orderIds.map((orderId, i) => ({ orderId, seq: i+1, status: "PENDING" })) }
      },
      include: { stops: { orderBy: { seq: "asc" }, include: { order: true } }, driver: { include: { user: true } } }
    });

    await app.prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { status: "ASSIGNED" } });
    return reply.code(201).send({ id: route.id, stops: route.stops.length, route });
  });

  // שליפה עם סינון
  const listQ = z.object({
    date: z.coerce.date().optional(),
    driverId: z.coerce.number().int().optional()
  });

  app.get("/routes", async (req) => {
    const { date, driverId } = listQ.parse(req.query);
    const where: any = {};
    if (date) {
      const d0 = new Date(date); d0.setHours(0,0,0,0);
      const d1 = new Date(date); d1.setHours(23,59,59,999);
      where.serviceDate = { gte: d0, lte: d1 };
    }
    if (driverId) where.driverId = driverId;

    const items = await app.prisma.route.findMany({
      where,
      orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
      include: { driver: { include: { user: true } }, stops: { orderBy: { seq: "asc" } } }
    });
    return { items };
  });

  app.get("/routes/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const route = await app.prisma.route.findUnique({
      where: { id },
      include: { driver: { include: { user: true } }, stops: { orderBy: { seq: "asc" }, include: { order: true } } }
    });
    if (!route) return reply.code(404).send({ error: "Not found" });
    return route;
  });

  // שינוי סטטוס מסלול (התחלה/סיום)
  app.patch("/routes/:id/status", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const body = z.object({
      status: z.enum(["PLANNED","IN_PROGRESS","COMPLETED"])
    }).parse(req.body);

    const data: any = { status: body.status };
    if (body.status === "IN_PROGRESS") data.startedAt = new Date();
    if (body.status === "COMPLETED")  data.completedAt = new Date();

    const route = await app.prisma.route.update({ where: { id }, data });
    return { ok: true, id: route.id, status: route.status };
  });
}
