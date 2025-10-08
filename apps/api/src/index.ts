import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import cors from "@fastify/cors";
dotenv.config();

const app = Fastify();

// Prisma על האפליקציה
declare module "fastify" {
  interface FastifyInstance { prisma: PrismaClient; }
}
app.decorate("prisma", new PrismaClient());

// רשום CORS (אפשר עם await top-level, או בתוך ready)
await app.register(cors, { origin: true });

// error handler ל-Zod
app.setErrorHandler((err, req, reply) => {
  if ((err as any).issues) return reply.code(400).send({ error: "ValidationError", issues: (err as any).issues });
  console.error(err);
  reply.code(500).send({ error: "InternalError" });
});

// root
app.get("/", async () => {
  const [users, orders, routes, stops] = await Promise.all([
    app.prisma.user.count(),
    app.prisma.order.count(),
    app.prisma.route.count(),
    app.prisma.routeStop.count(),
  ]);
  return { ok: true, users, orders, routes, stops };
});

// ראוטים
import usersRoutes from "./routes/users.ts";
import driversRoutes from "./routes/drivers.ts";
import ordersRoutes from "./routes/orders.ts";
import routesRoutes from "./routes/routes.ts";
import routeStopsRoutes from "./routes/routeStops.ts";

app.register(usersRoutes);
app.register(driversRoutes);
app.register(ordersRoutes);
app.register(routesRoutes);
app.register(routeStopsRoutes);

// סגירה נקייה + הדפסת ראוטים (אופציונלי)
app.addHook("onClose", async () => { await app.prisma.$disconnect(); });
process.on("SIGINT", () => app.close());
process.on("SIGTERM", () => app.close());
app.ready().then(() => console.log(app.printRoutes()));

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: "0.0.0.0" })
  .then(addr => console.log(`🚀 API on ${addr}`))
  .catch(err => { console.error(err); process.exit(1); });
