// apps/api/src/routes/routeStops.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function routeStopsRoutes(app: FastifyInstance) {
  // עדכון סטטוס תחנה
  app.patch("/routes/:routeId/stops/:stopId/status", async (req, reply) => {
    const { routeId, stopId } = z.object({
      routeId: z.coerce.number().int().positive(),
      stopId: z.coerce.number().int().positive(),
    }).parse(req.params as any);

    const { status } = z.object({
      status: z.enum(["PENDING","ARRIVED","COMPLETED","SKIPPED"])
    }).parse(req.body);

    const stamp: any = {};
    if (status === "ARRIVED")   stamp.arrivedAt = new Date();
    if (status === "COMPLETED") stamp.completedAt = new Date();

    const stop = await app.prisma.routeStop.update({
      where: { id: stopId },
      data: { status, ...stamp }
    });

    // אופציה: אם כל התחנות הושלמו – סיים מסלול
    if (status === "COMPLETED") {
      const remaining = await app.prisma.routeStop.count({ where: { routeId, status: { notIn: ["COMPLETED","SKIPPED"] } } });
      if (remaining === 0) {
        await app.prisma.route.update({ where: { id: routeId }, data: { status: "COMPLETED", completedAt: new Date() } });
      }
    }

    return { ok: true, stopId: stop.id, status: stop.status };
  });

  // סידור מחדש של תחנות (resequencing)
  app.post("/routes/:routeId/stops/resequence", async (req, reply) => {
    const { routeId } = z.object({ routeId: z.coerce.number().int().positive() }).parse(req.params as any);
    const { sequence } = z.object({
      sequence: z.array(z.object({ stopId: z.number().int().positive(), seq: z.number().int().min(1) })).min(1)
    }).parse(req.body);

    await app.prisma.$transaction(
      sequence.map(s => app.prisma.routeStop.update({ where: { id: s.stopId }, data: { seq: s.seq } }))
    );

    const stops = await app.prisma.routeStop.findMany({ where: { routeId }, orderBy: { seq: "asc" } });
    return { ok: true, routeId, stops };
  });
}
