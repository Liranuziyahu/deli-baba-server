import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import cors from "@fastify/cors";
import fs from "fs";
import path from "path"; // ✅ נוספה שורה זו
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { FastifyStaticSwaggerOptions } from "@fastify/swagger";

// ROUTES
import usersRoutes from "./routes/users.ts";
import driversRoutes from "./routes/drivers.ts";
import ordersRoutes from "./routes/orders.ts";
import routesRoutes from "./routes/routes.ts";
import routeStopsRoutes from "./routes/routeStops.ts";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";

dotenv.config();

const app = Fastify({ logger: true });

// Prisma על האפליקציה
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: any;
  }
}
app.decorate("prisma", new PrismaClient());

// Auth Plugin (JWT)
await app.register(authPlugin);

// CORS
await app.register(cors, { origin: true });

// 🧩 Swagger (טעינת קובץ OpenAPI קיים + הוספת הגדרות אבטחה ל-UI)
const openapiPath = path.resolve("openapi", "openapi.yaml");
const swaggerOptions: FastifyStaticSwaggerOptions = {
  mode: "static",
  specification: {
    path: openapiPath,
    baseDir: path.resolve(),
  },
};

// @ts-ignore – מוסיפים הגדרות OpenAPI רק ל־UI (לא חלק מהטייפ הרגיל)
(swaggerOptions as any).openapi = {
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

await app.register(swagger, swaggerOptions);

// UI
await app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list", deepLinking: false },
});

// ⚙️ אופציונלי – לחשוף את ה־spec ישירות כ־JSON
app.get("/openapi.json", async (_, reply) => {
  const spec = fs.readFileSync(openapiPath, "utf8");
  reply.type("application/yaml").send(spec);
});

// error handler ל-Zod
app.setErrorHandler((err, req, reply) => {
  if ((err as any).issues) {
    return reply.code(400).send({ error: "ValidationError", issues: (err as any).issues });
  }
  req.log.error(err);
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

app.register(authRoutes);
app.register(usersRoutes);
app.register(driversRoutes);
app.register(ordersRoutes);
app.register(routesRoutes);
app.register(routeStopsRoutes);

// סגירה נקייה
app.addHook("onClose", async () => {
  await app.prisma.$disconnect();
});
process.on("SIGINT", () => app.close());
process.on("SIGTERM", () => app.close());

const port = Number(process.env.PORT || 3000);

try {
  await app.ready();
  const addr = await app.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 API on http://localhost:${port}`);
  console.log(`📘 Swagger docs → http://localhost:${port}/docs`);
  console.log(`📄 Spec JSON → http://localhost:${port}/openapi.json`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
