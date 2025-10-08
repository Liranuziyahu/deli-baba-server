import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function usersRoutes(app: FastifyInstance) {
  // ========= List (עם חיפוש/עימוד/סינון לפי role) =========
  const listQ = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    role: z.enum(["ADMIN","DISPATCHER","DRIVER","VIEWER"]).optional(),
    sort: z.enum(["id","email","fullName","createdAt"]).default("id"),
    order: z.enum(["asc","desc"]).default("desc"),
  });

  app.get("/users", async (req) => {
    const { page, pageSize, search, role, sort, order } = listQ.parse(req.query);

    const where: any = {};
    if (search) where.OR = [
      { email: { contains: search } },
      { fullName: { contains: search } },
    ];
    if (role) where.role = role;

    const [items, total] = await Promise.all([
      app.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sort]: order },
        select: { id:true, email:true, fullName:true, role:true, createdAt:true },
      }),
      app.prisma.user.count({ where }),
    ]);

    return { page, pageSize, total, items };
  });

  // ========= Get by id =========
  app.get("/users/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const user = await app.prisma.user.findUnique({
      where: { id },
      select: { id:true, email:true, fullName:true, role:true, createdAt:true, driver:true },
    });
    if (!user) return reply.code(404).send({ error: "User not found" });
    return user;
  });

  // ========= Create =========
  const createB = z.object({
    email: z.string().email(),
    fullName: z.string().min(2),
    password: z.string().min(4), // dev only; החלף ב-hash בפרודקשן
    role: z.enum(["ADMIN","DISPATCHER","DRIVER","VIEWER"]).default("VIEWER"),
    // אופציונלי: יצירת Driver צמוד לאותו User
    createDriver: z
      .object({
        phone: z.string().optional(),
        vehicle: z.string().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .optional(),
  });

  app.post("/users", async (req, reply) => {
    const { email, fullName, password, role, createDriver } = createB.parse(req.body);
    try {
      const user = await app.prisma.user.create({
        data: { email, fullName, role, passwordHash: password },
      });

      // אופציונלי: ליצור Driver שמקושר ל-User
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
    } catch (e: any) {
      if (e.code === "P2002") {
        return reply.code(409).send({ error: "Email already exists" });
      }
      throw e;
    }
  });

  // ========= Update (partial) =========
  const patchB = z.object({
    fullName: z.string().min(2).optional(),
    role: z.enum(["ADMIN","DISPATCHER","DRIVER","VIEWER"]).optional(),
    password: z.string().min(4).optional(),
  });

  app.patch("/users/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const data = patchB.parse(req.body);

    try {
      const user = await app.prisma.user.update({
        where: { id },
        data: {
          fullName: data.fullName,
          role: data.role,
          ...(data.password ? { passwordHash: data.password } : {}),
        },
        select: { id:true },
      });
      return { ok: true, id: user.id };
    } catch (e: any) {
      if (e.code === "P2025") return reply.code(404).send({ error: "User not found" });
      throw e;
    }
  });

  // ========= Delete =========
  app.delete("/users/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    try {
      await app.prisma.user.delete({ where: { id } });
      return reply.code(204).send();
    } catch (e: any) {
      if (e.code === "P2025") return reply.code(404).send({ error: "User not found" });
      throw e;
    }
  });
}
