// apps/api/src/routes/orders.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { geocodeAddress } from "../services/geodata/geocode.service"; // ✅ נוספה שורה זו

export default async function ordersRoutes(app: FastifyInstance) {
  // ========= List =========
  const listQ = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    city: z.string().optional(),
    search: z.string().optional(),
  });

  app.get("/orders", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { page, pageSize, status, city, search } = listQ.parse(req.query);

      const where: any = {};
      if (status) where.status = status;
      if (city) where.city = city;
      if (search)
        where.OR = [
          { customerName: { contains: search } },
          { externalRef: { contains: search } },
          { phone: { contains: search } },
        ];

      const [items, total] = await Promise.all([
        app.prisma.order.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { id: "desc" },
          select: {
            id: true,
            externalRef: true,
            customerName: true,
            phone: true,
            city: true,
            status: true,
            lat: true,
            lng: true,
            windowStart: true,
            windowEnd: true,
            createdAt: true,
          },
        }),
        app.prisma.order.count({ where }),
      ]);
      return { page, pageSize, total, items };
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "GET /orders failed");
      return reply.code(500).send({ error: "ListOrdersFailed" });
    }
  });

  // ========= Create =========
  const createB = z.object({
    externalRef: z.string().optional(),
    customerName: z.string().min(2),
    phone: z.string().optional(),
    addressLine: z.string().min(2),
    city: z.string().min(2),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    windowStart: z.coerce.date().optional(),
    windowEnd: z.coerce.date().optional(),
    notes: z.string().optional(),
  });

  app.post("/orders", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const body = createB.parse(req.body);

      // ✅ נוספה בדיקת geocoding להזמנה בודדת
      if ((!body.lat || !body.lng) && body.addressLine && body.city) {
        const fullAddress = `${body.addressLine}, ${body.city}`;
        const coords = await geocodeAddress(fullAddress);
        if (coords) {
          body.lat = coords.lat;
          body.lng = coords.lng;
          app.log.info(`📍 Geocoded ${fullAddress} → (${coords.lat}, ${coords.lng})`);
        } else {
          app.log.warn(`⚠️ Could not geocode address: ${fullAddress}`);
        }
      }

      const order = await app.prisma.order.create({ data: body });
      return reply.code(201).send({ id: order.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "POST /orders failed");
      return reply.code(500).send({ error: "CreateOrderFailed" });
    }
  });
  
  // ========= Bulk create =========
  app.post("/orders/bulk", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const items = z.array(createB).min(1).max(1000).parse(req.body);

      // ✅ נוספה לולאה המבצעת geocoding לכל הזמנה
      const enrichedItems = [];
      for (const item of items) {
        if ((!item.lat || !item.lng) && item.addressLine && item.city) {
          const fullAddress = `${item.addressLine}, ${item.city}`;
          const coords = await geocodeAddress(fullAddress);
          if (coords) {
            item.lat = coords.lat;
            item.lng = coords.lng;
            app.log.info(`📍 Geocoded ${fullAddress} → (${coords.lat}, ${coords.lng})`);
          } else {
            app.log.warn(`⚠️ Could not geocode address: ${fullAddress}`);
          }
        }
        enrichedItems.push(item);
      }

      const created = await app.prisma.$transaction(enrichedItems.map((d) => app.prisma.order.create({ data: d })));

      const insertedIds = created.map((o) => o.id);

      return reply.code(201).send({ inserted: created.length, ids: insertedIds });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "POST /orders/bulk failed");
      return reply.code(500).send({ error: "BulkCreateOrdersFailed" });
    }
  });

  // ========= Update =========
  const patchB = createB.partial().extend({
    status: z.enum(["PENDING", "ASSIGNED", "IN_ROUTE", "DELIVERED", "FAILED", "CANCELED"]).optional(),
  });

  app.patch("/orders/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const id = z.coerce
        .number()
        .int()
        .parse((req.params as any).id);
      const data = patchB.parse(req.body);
      const order = await app.prisma.order.update({ where: { id }, data });
      return { ok: true, id: order.id };
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "PATCH /orders/:id failed");
      return reply.code(500).send({ error: "UpdateOrderFailed" });
    }
  });
}
