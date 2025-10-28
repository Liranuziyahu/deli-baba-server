// apps/api/src/routes/drivers.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";

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

  // ========= Create (מחייב userId קיים ושהוא פנוי) =========
  const createB = z.object({
    userId: z.coerce.number().int().positive(),
    phone: z.string().trim().optional(),
    vehicle: z.string().trim().optional(),
    capacity: z.coerce.number().int().positive().optional(),
  });

  app.post("/drivers", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { userId, phone, vehicle, capacity } = createB.parse(req.body);

      // ודא שהמשתמש קיים
      const exists = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) return reply.code(400).send({ error: "UserNotFound", message: "userId does not exist" });

      // יצירה (userId הוא unique במודל Driver, אז Prisma יזרוק P2002 אם כבר קיים Driver עבורו)
      const driver = await app.prisma.driver.create({
        data: { userId, phone, vehicle, capacity },
        select: { id: true },
      });

      return reply.code(201).send({ id: driver.id });
    } catch (err: any) {
      if (err?.code === "P2002") {
        // userId unique violation
        return reply.code(409).send({ error: "DriverAlreadyExistsForUser" });
      }
      app.log.error({ err }, "POST /drivers failed");
      return reply.code(500).send({ error: "CreateDriverFailed" });
    }
  });

  // ========= Update =========
  const patchB = z
    .object({
      phone: z.string().trim().optional(),
      vehicle: z.string().trim().optional(),
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
      if (err?.code === "P2025") {
        return reply.code(404).send({ error: "DriverNotFound" });
      }
      app.log.error({ err }, "DELETE /drivers/:id failed");
      return reply.code(500).send({ error: "DeleteDriverFailed" });
    }
  });
}
