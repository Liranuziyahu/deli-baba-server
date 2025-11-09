// apps/api/src/routes/users.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs"; // 🧩 נוסיף בראש הקובץ

export default async function usersRoutes(app: FastifyInstance) {
  // ========= List =========
  const listQ = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    role: z.enum(["ADMIN", "DISPATCHER", "DRIVER", "VIEWER"]).optional(),
    sort: z.enum(["id", "email", "fullName", "createdAt"]).default("id"),
    order: z.enum(["asc", "desc"]).default("desc"),
  });

  app.get("/users", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { page, pageSize, search, role, sort, order } = listQ.parse(req.query);

      const where: any = {};
      if (search) where.OR = [{ email: { contains: search } }, { fullName: { contains: search } }];
      if (role) where.role = role;

      const [items, total] = await Promise.all([
        app.prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { [sort]: order },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
          },
        }),
        app.prisma.user.count({ where }),
      ]);

      return { page, pageSize, total, items };
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "GET /users failed");
      return reply.code(500).send({ error: "ListUsersFailed" });
    }
  });

  // ========= Get by ID =========
  app.get("/users/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .parse((req.params as any).id);

      const user = await app.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, fullName: true, role: true, createdAt: true, driver: true },
      });
      if (!user) return reply.code(404).send({ error: "UserNotFound" });
      return user;
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      app.log.error({ err }, "GET /users/:id failed");
      return reply.code(500).send({ error: "GetUserFailed" });
    }
  });

  // ========= Create =========
  const createB = z.object({
    email: z.string().email(),
    fullName: z.string().min(2),
    password: z.string().min(4),
    role: z.enum(["ADMIN", "DISPATCHER", "DRIVER", "VIEWER"]).default("VIEWER"),
    createDriver: z
      .object({
        phone: z.string().optional(),
        vehicle: z.string().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .optional(),
  });

  app.post("/users", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { email, fullName, password, role, createDriver } = createB.parse(req.body);
      const hash = await bcrypt.hash(password, 10); // ✅ הצפנה אמיתית

      const user = await app.prisma.user.create({
        data: { email, fullName, role, passwordHash: hash },
      });

      if (createDriver) {
        await app.prisma.driver.create({
          data: {
            userId: user.id,
            phone: createDriver.phone,
            vehicle: createDriver.vehicle,
            capacity: createDriver.capacity,
          },
        });
      }

      return reply.code(201).send({ id: user.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      if (err.code === "P2002") return reply.code(409).send({ error: "EmailAlreadyExists" });

      app.log.error({ err }, "POST /users failed");
      return reply.code(500).send({ error: "CreateUserFailed" });
    }
  });

  // ========= Update =========
  const patchB = z.object({
    fullName: z.string().min(2).optional(),
    role: z.enum(["ADMIN", "DISPATCHER", "DRIVER", "VIEWER"]).optional(),
    password: z.string().min(4).optional(),
  });

  app.patch("/users/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
   try {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const data = patchB.parse(req.body);

    let hash: string | undefined;
    if (data.password) {
      hash = await bcrypt.hash(data.password, 10); // ✅ הצפנה גם בעדכון
    }

    const user = await app.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName,
        role: data.role,
        ...(hash ? { passwordHash: hash } : {}),
      },
      select: { id: true },
    });

    return { ok: true, id: user.id };
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return reply.code(400).send({ error: "ValidationError", issues: err.errors });

    if (err.code === "P2025")
      return reply.code(404).send({ error: "UserNotFound" });

    app.log.error({ err }, "PATCH /users/:id failed");
    return reply.code(500).send({ error: "UpdateUserFailed" });
  }
  });

  // ========= Delete =========
  app.delete("/users/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .parse((req.params as any).id);
      await app.prisma.user.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err: any) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: "ValidationError", issues: err.errors });

      if (err.code === "P2025") return reply.code(404).send({ error: "UserNotFound" });

      app.log.error({ err }, "DELETE /users/:id failed");
      return reply.code(500).send({ error: "DeleteUserFailed" });
    }
  });
}
