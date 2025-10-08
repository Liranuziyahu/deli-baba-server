import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function driversRoutes(app: FastifyInstance) {

  // ממיר "true/false/1/0/on/off/yes/no" => boolean
const booleanFromQuery = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  // לא נזהה? נחזיר undefined כדי שיישאר optional
  return undefined;
}, z.boolean().optional());

  // ========= List =========
   const listQ = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    active: booleanFromQuery,
    search: z.string().optional(),
  });
  

  app.get("/drivers", async (req) => {
    const { page, pageSize, active, search } = listQ.parse(req.query);
    const where: any = {};
    if (active !== undefined) where.active = active;
    console.log(req.query);

    const [items, total] = await Promise.all([
      app.prisma.driver.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
        include: {
          user: {
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
      }),
      app.prisma.driver.count({ where }),
    ]);

    // חיפוש פשוט בצד השרת (על התוצאות) – אם תרצה שזה יהיה DB-side, נדרש relation filter מתקדם
    const filtered = search
      ? items.filter(d =>
          (d.user.fullName ?? "").includes(search) ||
          (d.user.email ?? "").includes(search)
        )
      : items;

    return { page, pageSize, total: search ? filtered.length : total, items: filtered };
  });

  // ========= Get by id =========
  app.get("/drivers/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const driver = await app.prisma.driver.findUnique({
      where: { id },
      include: {
        user: { select: { id:true, email:true, fullName:true, role:true } },
        routes: { select: { id:true, serviceDate:true, status:true }, orderBy: { id: "desc" }, take: 5 }
      },
    });
    if (!driver) return reply.code(404).send({ error: "Driver not found" });
    return driver;
  });

  // ========= Create (מחייב userId קיים) =========
  const createB = z.object({
    userId: z.number().int().positive(),
    phone: z.string().optional(),
    vehicle: z.string().optional(),
    capacity: z.number().int().positive().optional(),
  });

  app.post("/drivers", async (req, reply) => {
    const { userId, phone, vehicle, capacity } = createB.parse(req.body);
    const exists = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) return reply.code(400).send({ error: "User not found" });

    const driver = await app.prisma.driver.create({ data: { userId, phone, vehicle, capacity } });
    return reply.code(201).send({ id: driver.id });
  });

  // ========= Update =========
  const patchB = z.object({
    phone: z.string().optional(),
    vehicle: z.string().optional(),
    capacity: z.number().int().positive().optional(),
    active: z.boolean().optional(),
  });

  app.patch("/drivers/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    const data = patchB.parse(req.body);
    try {
      const driver = await app.prisma.driver.update({
        where: { id },
        data,
        select: { id: true },
      });
      return { ok: true, id: driver.id };
    } catch (e: any) {
      if (e.code === "P2025") return reply.code(404).send({ error: "Driver not found" });
      throw e;
    }
  });

  // ========= Delete =========
  app.delete("/drivers/:id", async (req, reply) => {
    const id = z.coerce.number().int().parse((req.params as any).id);
    try {
      await app.prisma.driver.delete({ where: { id } });
      return reply.code(204).send();
    } catch (e: any) {
      if (e.code === "P2025") return reply.code(404).send({ error: "Driver not found" });
      throw e;
    }
  });
}
