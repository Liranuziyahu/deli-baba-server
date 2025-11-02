// apps/api/src/routes/routes.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { optimizeInput, optimizeRoute } from "../services/routeOptimizer";

export default async function routesRoutes(app: FastifyInstance) {
  // ========= Create route =========
  const createB = z.object({
    driverId: z.number().int().positive(),
    serviceDate: z.coerce.date().default(() => new Date()),
    orderIds: z.array(z.number().int().positive()).min(1),
    distanceKm: z.number().nonnegative().optional(),
    durationMin: z.number().int().nonnegative().optional(),
  });

  app.post("/routes/optimize", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { points, startId } = optimizeInput.parse(req.body);
      
      // ✅ בדיקה אם startId קיים בתוך רשימת הנקודות
      if (startId && !points.some((p) => p.id === startId)) {
        return reply.code(400).send({
          error: "InvalidStartId",
          message: "startId must match one of the provided points' IDs",
        });
      }

      const result = await optimizeRoute(points, startId);
      console.log("result",result);
      
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "POST /routes/optimize failed");
      return reply.status(500).send({ error: "OptimizeRouteFailed" });
    }
  });

  app.post("/routes/create", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { driverId, serviceDate, orderIds, distanceKm, durationMin } = createB.parse(req.body);

      const driver = await app.prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver) return reply.code(400).send({ error: "DriverNotFound" });

      const orders = await app.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, routeStop: true },
      });

      if (orders.length !== orderIds.length) return reply.code(400).send({ error: "SomeOrdersNotFound" });

      const assigned = orders.filter((o) => o.routeStop);
      if (assigned.length) return reply.code(400).send({ error: "AlreadyAssigned", ids: assigned.map((o) => o.id) });

      const route = await app.prisma.route.create({
        data: {
          driverId,
          serviceDate,
          distanceKm,
          durationMin,
          status: "PLANNED",
          stops: { create: orderIds.map((orderId, i) => ({ orderId, seq: i + 1, status: "PENDING" })) },
        },
        include: { stops: { orderBy: { seq: "asc" }, include: { order: true } }, driver: { include: { user: true } } },
      });

      await app.prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { status: "ASSIGNED" } });
      return reply.code(201).send({ id: route.id, stops: route.stops.length, route });
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "POST /routes/create failed");
      return reply.code(500).send({ error: "CreateRouteFailed" });
    }
  });

  // ========= Assign orders to existing route =========
  app.post("/routes/:id/assign", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const routeId = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as any).id);
      const { orderIds } = z
        .object({
          orderIds: z.array(z.number().int().positive()).min(1).max(1000),
        })
        .parse(req.body);

      const route = await app.prisma.route.findUnique({
        where: { id: routeId },
        select: { id: true, status: true },
      });
      if (!route) return reply.code(404).send({ error: "RouteNotFound" });
      if (route.status === "COMPLETED") return reply.code(400).send({ error: "RouteCompleted" });

      const orders = await app.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, routeStop: { select: { id: true } } },
      });

      if (orders.length !== orderIds.length) {
        const foundIds = new Set(orders.map((o) => o.id));
        const missing = orderIds.filter((id) => !foundIds.has(id));
        return reply.code(400).send({ error: "OrdersNotFound", ids: missing });
      }

      const alreadyAssigned = orders.filter((o) => o.routeStop);
      if (alreadyAssigned.length)
        return reply.code(409).send({ error: "OrdersAlreadyAssigned", ids: alreadyAssigned.map((o) => o.id) });

      const last = await app.prisma.routeStop.findFirst({
        where: { routeId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });

      let nextSeq = (last?.seq ?? 0) + 1;

      const result = await app.prisma.$transaction(async (tx) => {
        const createdStops = await tx.routeStop.createMany({
          data: orderIds.map((orderId, idx) => ({
            routeId,
            orderId,
            seq: nextSeq + idx,
            status: "PENDING",
          })),
        });

        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: "ASSIGNED" },
        });

        const stops = await tx.routeStop.findMany({
          where: { routeId, orderId: { in: orderIds } },
          orderBy: { seq: "asc" },
          select: { id: true, orderId: true, seq: true, status: true },
        });

        return { createdCount: createdStops.count, stops };
      });

      return reply.code(201).send({
        ok: true,
        routeId,
        inserted: result.createdCount,
        stops: result.stops,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      if (err?.code === "P2002") return reply.code(409).send({ error: "OrderAlreadyAssigned" });

      app.log.error({ err }, "POST /routes/:id/assign failed");
      return reply.code(500).send({ error: "AssignOrdersToRouteFailed" });
    }
  });

  // ========= List routes =========
  const listQ = z.object({
    date: z.coerce.date().optional(),
    driverId: z.coerce.number().int().optional(),
  });

  app.get("/routes", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { date, driverId } = listQ.parse(req.query);
      const where: any = {};
      if (date) {
        const d0 = new Date(date);
        d0.setHours(0, 0, 0, 0);
        const d1 = new Date(date);
        d1.setHours(23, 59, 59, 999);
        where.serviceDate = { gte: d0, lte: d1 };
      }
      if (driverId) where.driverId = driverId;

      const items = await app.prisma.route.findMany({
        where,
        orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
        include: { driver: { include: { user: true } }, stops: { orderBy: { seq: "asc" } } },
      });
      return { items };
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "GET /routes failed");
      return reply.code(500).send({ error: "ListRoutesFailed" });
    }
  });

  // ========= Get route by ID =========
  app.get("/routes/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .parse((req.params as any).id);
      const route = await app.prisma.route.findUnique({
        where: { id },
        include: {
          driver: { include: { user: true } },
          stops: { orderBy: { seq: "asc" }, include: { order: true } },
        },
      });
      if (!route) return reply.code(404).send({ error: "RouteNotFound" });
      return route;
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "GET /routes/:id failed");
      return reply.code(500).send({ error: "GetRouteFailed" });
    }
  });

  // ========= Update route status =========
  app.patch("/routes/:id/status", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .parse((req.params as any).id);
      const body = z
        .object({
          status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]),
        })
        .parse(req.body);

      const data: any = { status: body.status };
      if (body.status === "IN_PROGRESS") data.startedAt = new Date();
      if (body.status === "COMPLETED") data.completedAt = new Date();

      const route = await app.prisma.route.update({ where: { id }, data });
      return { ok: true, id: route.id, status: route.status };
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "PATCH /routes/:id/status failed");
      return reply.code(500).send({ error: "UpdateRouteStatusFailed" });
    }
  });
}
