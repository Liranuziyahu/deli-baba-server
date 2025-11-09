import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function routeStopsRoutes(app: FastifyInstance) {
  // ========= Update stop status =========
  app.patch(
    "/routes/:routeId/stops/:stopId/status",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        const { routeId, stopId } = z
          .object({
            routeId: z.coerce.number().int().positive(),
            stopId: z.coerce.number().int().positive(),
          })
          .parse(req.params as any);

        const { status } = z
          .object({
            status: z.enum(["PENDING", "ARRIVED", "COMPLETED", "SKIPPED"]),
          })
          .parse(req.body);

        const existing = await app.prisma.routeStop.findUnique({
          where: { id: stopId },
        });
        if (!existing || existing.routeId !== routeId) {
          return reply.code(404).send({ error: "StopNotFound" });
        }

        const stamp: any = {};
        if (status === "ARRIVED") stamp.arrivedAt = new Date();
        if (status === "COMPLETED") stamp.completedAt = new Date();

        const stop = await app.prisma.routeStop.update({
          where: { id: stopId },
          data: { status, ...stamp },
          select: { id: true, status: true, routeId: true },
        });

        // 🟢 אם העצירה התחילה או הושלמה - עדכן את ה-Route ל-IN_PROGRESS
        if (["ARRIVED", "COMPLETED"].includes(status)) {
          const route = await app.prisma.route.findUnique({
            where: { id: routeId },
            select: { status: true },
          });

          if (route?.status === "PLANNED") {
            await app.prisma.route.update({
              where: { id: routeId },
              data: { status: "IN_PROGRESS", startedAt: new Date() },
            });
          }
        }

        // ✅ אם העצירה הושלמה, עדכן גם את ההזמנה ואת ה-route במידת הצורך
        if (status === "COMPLETED") {
          const remaining = await app.prisma.routeStop.count({
            where: { routeId, status: { notIn: ["COMPLETED", "SKIPPED"] } },
          });

          const stopWithOrder = await app.prisma.routeStop.findUnique({
            where: { id: stopId },
            select: { orderId: true },
          });

          if (stopWithOrder?.orderId) {
            await app.prisma.order.update({
              where: { id: stopWithOrder.orderId },
              data: { status: "DELIVERED" },
            });
          }

          if (remaining === 0) {
            await app.prisma.route.update({
              where: { id: routeId },
              data: { status: "COMPLETED", completedAt: new Date() },
            });
          }
        }

        // ❌ אם העצירה סומנה כ-SKIPPED – עדכן את ההזמנה ל-FAILED
        if (status === "SKIPPED") {
          const stopWithOrder = await app.prisma.routeStop.findUnique({
            where: { id: stopId },
            select: { orderId: true },
          });

          if (stopWithOrder?.orderId) {
            await app.prisma.order.update({
              where: { id: stopWithOrder.orderId },
              data: { status: "FAILED" },
            });
          }

          // בדוק אם כל העצירות בוטלו → סמן את המסלול כ-FAILED
          const activeStops = await app.prisma.routeStop.count({
            where: {
              routeId,
              status: { notIn: ["SKIPPED", "COMPLETED"] },
            },
          });

          const totalStops = await app.prisma.routeStop.count({
            where: { routeId },
          });

          if (activeStops === 0 && totalStops > 0) {
            await app.prisma.route.update({
              where: { id: routeId },
              data: { status: "FAILED", completedAt: new Date() },
            });
          }
        }

        return { ok: true, stopId: stop.id, status: stop.status };
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return reply
            .code(400)
            .send({ error: "ValidationError", issues: err.errors });

        app.log.error(
          { err },
          "PATCH /routes/:routeId/stops/:stopId/status failed"
        );
        return reply.code(500).send({ error: "StopStatusUpdateFailed" });
      }
    }
  );

  // ========= Resequence stops =========
  app.post(
    "/routes/:routeId/stops/resequence",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        const { routeId } = z
          .object({
            routeId: z.coerce.number().int().positive(),
          })
          .parse(req.params as any);

        const { sequence } = z
          .object({
            sequence: z
              .array(
                z.object({
                  stopId: z.number().int().positive(),
                  seq: z.number().int().min(1),
                })
              )
              .min(1),
          })
          .parse(req.body);

        const ids = sequence.map((s) => s.stopId);
        const found = await app.prisma.routeStop.findMany({
          where: { id: { in: ids } },
        });
        if (
          found.length !== ids.length ||
          found.some((s) => s.routeId !== routeId)
        ) {
          return reply.code(400).send({ error: "StopsMismatchRoute" });
        }

        await app.prisma.$transaction(
          sequence.map((s) =>
            app.prisma.routeStop.update({
              where: { id: s.stopId },
              data: { seq: s.seq },
            })
          )
        );

        const stops = await app.prisma.routeStop.findMany({
          where: { routeId },
          orderBy: { seq: "asc" },
        });

        return { ok: true, routeId, stops };
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return reply
            .code(400)
            .send({ error: "ValidationError", issues: err.errors });

        app.log.error(
          { err },
          "POST /routes/:routeId/stops/resequence failed"
        );
        return reply
          .code(500)
          .send({ error: "StopsResequenceFailed" });
      }
    }
  );

  // ========= Unassign order from route (delete RouteStop) =========
  app.delete(
    "/routes/:routeId/stops/:stopId",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        const { routeId, stopId } = z
          .object({
            routeId: z.coerce.number().int().positive(),
            stopId: z.coerce.number().int().positive(),
          })
          .parse(req.params as any);

        const stop = await app.prisma.routeStop.findUnique({
          where: { id: stopId },
          select: { id: true, routeId: true, orderId: true },
        });

        if (!stop || stop.routeId !== routeId) {
          return reply.code(404).send({ error: "StopNotFound" });
        }

        await app.prisma.$transaction(async (tx) => {
          await tx.routeStop.delete({ where: { id: stopId } });
          if (stop.orderId) {
            await tx.order.update({
              where: { id: stop.orderId },
              data: { status: "PENDING" },
            });
          }
        });

        return reply.code(204).send();
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return reply
            .code(400)
            .send({ error: "ValidationError", issues: err.errors });

        app.log.error(
          { err },
          "DELETE /routes/:routeId/stops/:stopId failed"
        );
        return reply
          .code(500)
          .send({ error: "UnassignStopFailed" });
      }
    }
  );
}
