import { FastifyInstance } from "fastify";
import { z } from "zod";

// ✅ מאפשר ל-Fastify להחזיק חיבורי SSE פתוחים בזיכרון
declare module "fastify" {
  interface FastifyInstance {
    sseClients?: Map<number, Set<any>>;
  }
}

// ממיר "true/false/1/0/on/off/yes/no" => boolean | undefined
const booleanFromQuery = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return undefined;
}, z.boolean().optional());

export default async function driversRoutes(app: FastifyInstance) {
  // ========= Live location stream (SSE) =========
  app.get("/drivers/:driverId/stream", { preHandler: [app.authenticate] }, async (req, reply) => {
    const driverId = Number(req.params.driverId);

    // ---- 1. Validate driverId format ----
    if (!Number.isFinite(driverId) || driverId <= 0) {
      return reply.code(400).send({ error: "InvalidDriverId" });
    }

    // ---- 2. Make sure driver exists ----
    const driver = await app.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true },
    });

    if (!driver) {
      return reply.code(404).send({ error: "DriverNotFound" });
    }

    // ---- 3. Setup SSE ----
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    if (!app.sseClients) app.sseClients = new Map();
    if (!app.sseClients.has(driverId)) app.sseClients.set(driverId, new Set());
    app.sseClients.get(driverId)!.add(reply.raw);

    console.log(`📡 New SSE connection for driver ${driverId}`);

    reply.raw.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

    req.raw.on("close", () => {
      console.log(`❌ SSE connection closed for driver ${driverId}`);
      app.sseClients.get(driverId)?.delete(reply.raw);
    });
  });

  // ✅ HEARTBEAT - שולח ping כל 30 שניות לכל חיבור פתוח
  setInterval(() => {
    if (!app.sseClients) return;
    for (const [, clients] of app.sseClients.entries()) {
      for (const res of clients) {
        try {
          res.write(`event: ping\ndata: {}\n\n`);
        } catch {
          // אם יש שגיאה - נסיר את החיבור
          clients.delete(res);
        }
      }
    }
  }, 30_000);

  // ✅ CLEANUP - מסיר קבוצות ריקות כל 10 דקות
  setInterval(() => {
    if (!app.sseClients) return;
    for (const [id, clients] of app.sseClients.entries()) {
      if (clients.size === 0) {
        app.sseClients.delete(id);
      }
    }
  }, 10 * 60_000);

  // ========= List =========
  const listQ = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    active: booleanFromQuery,
    search: z.string().trim().optional(),
  });

  app.get("/drivers", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { page, pageSize, active, search } = listQ.parse(req.query);

      // לבנות where DB-side (כולל שדות מה-user)
      const where: any = {};
      if (active !== undefined) where.active = active;
      if (search && search.length > 0) {
        where.user = {
          OR: [{ fullName: { contains: search } }, { email: { contains: search } }],
        };
      }

      const [items, total] = await Promise.all([
        app.prisma.driver.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { id: "desc" },
          include: {
            user: { select: { id: true, email: true, fullName: true, role: true } },
          },
        }),
        app.prisma.driver.count({ where }),
      ]);

      return { page, pageSize, total, items };
    } catch (err) {
      app.log.error({ err }, "GET /drivers failed");
      return reply.code(500).send({ error: "ListDriversFailed" });
    }
  });

  // ========= Get by id =========
  app.get("/drivers/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as any).id);

      const driver = await app.prisma.driver.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, fullName: true, role: true } },
          routes: {
            select: { id: true, serviceDate: true, status: true },
            orderBy: { id: "desc" },
            take: 5,
          },
        },
      });

      if (!driver) return reply.code(404).send({ error: "DriverNotFound" });
      return driver;
    } catch (err) {
      app.log.error({ err }, "GET /drivers/:id failed");
      return reply.code(500).send({ error: "GetDriverFailed" });
    }
  });

  // ========= Create =========

  const vehicleEnum = z
    .string()
    .transform((val) => val.trim().toUpperCase())
    .refine((val) => ["MOTORCYCLE", "CAR", "VAN"].includes(val), {
      message: "Vehicle must be one of: MOTORCYCLE, CAR, VAN",
    })
    .optional();

  const createB = z.object({
    userId: z.coerce.number().int().positive(),
    phone: z.string().trim().optional(),
    vehicle: vehicleEnum,
    capacity: z.coerce.number().int().positive().optional(),
  });

  app.post("/drivers", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { userId, phone, vehicle, capacity } = createB.parse(req.body);

      // ודא שהמשתמש קיים
      const exists = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) return reply.code(400).send({ error: "UserNotFound", message: "userId does not exist" });

      const driver = await app.prisma.driver.create({
        data: { userId, phone, vehicle, capacity },
        select: { id: true },
      });

      return reply.code(201).send({ id: driver.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      if (err?.code === "P2002") {
        // userId unique violation
        return reply.code(409).send({ error: "DriverAlreadyExistsForUser" });
      }
      app.log.error({ err }, "POST /drivers failed");
      return reply.code(500).send({ error: "CreateDriverFailed" });
    }
  });

  // ========= Update Location =========
  app.patch("/drivers/:driverId/location", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const driverId = Number(req.params.driverId);

      if (!Number.isFinite(driverId) || driverId <= 0) {
        return reply.code(400).send({ error: "InvalidDriverId" });
      }

      const body = z
        .object({
          lat: z.coerce.number(),
          lng: z.coerce.number(),
        })
        .parse(req.body);

      // ------ Step 1: update location using driverId -------
      const updated = await app.prisma.driver.update({
        where: { id: driverId },
        data: { currentLat: body.lat, currentLng: body.lng },
        select: { id: true, currentLat: true, currentLng: true },
      });

      // ------ Step 2: SSE broadcast using driverId -------
      const clients = app.sseClients?.get(driverId);
      if (clients) {
        for (const res of clients) {
          res.write(`data: ${JSON.stringify(updated)}\n\n`);
        }
      }

      return reply.send({ success: true, driver: updated });
    } catch (err) {
      return reply.code(500).send({ error: "UpdateDriverLocationFailed" });
    }
  });

  // ========= Update =========
  const patchB = z
    .object({
      phone: z.string().trim().optional(),
      vehicle: vehicleEnum,
      capacity: z.coerce.number().int().positive().optional(),
      active: z.boolean().optional(),
    })
    .refine((d) => Object.values(d).some((v) => v !== undefined), {
      message: "No fields to update",
    });

  app.patch("/drivers/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as any).id);
      const data = patchB.parse(req.body);

      const driver = await app.prisma.driver.update({
        where: { id },
        data,
        select: { id: true },
      });

      return { ok: true, id: driver.id };
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      if (err?.code === "P2025") {
        return reply.code(404).send({ error: "DriverNotFound" });
      }
      app.log.error({ err }, "PATCH /drivers/:id failed");
      return reply.code(500).send({ error: "UpdateDriverFailed" });
    }
  });

  // ========= Delete =========
  app.delete("/drivers/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as any).id);
      await app.prisma.driver.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      if (err?.code === "P2025") {
        return reply.code(404).send({ error: "DriverNotFound" });
      }
      app.log.error({ err }, "DELETE /drivers/:id failed");
      return reply.code(500).send({ error: "DeleteDriverFailed" });
    }
  });
}
