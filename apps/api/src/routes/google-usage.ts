import { FastifyInstance } from "fastify";
import { cache } from "../services/geodata/cache.service";

export async function googleUsageRoutes(app: FastifyInstance) {
  // 🛡️ כל הקריאות ל־google-usage ידרשו JWT תקין
  app.get(
    "/google-usage",
    { preHandler: [app.authenticate] }, // ✅ הוספת בדיקת JWT
    async (_, reply) => {
      const dateKey = new Date().toISOString().slice(0, 10);

      const [geo, dist] = await Promise.all([
        cache.get(`google_geocode_calls:${dateKey}`),
        cache.get(`google_distance_calls:${dateKey}`),
      ]);

      const geoCount = Number(geo || 0);
      const distCount = Number(dist || 0);
      const total = geoCount + distCount;

      const maxGeo = Number(process.env.GOOGLE_API_MAX_DAILY || 2500);
      const maxDist = Number(process.env.GOOGLE_API_MAX_DAILY || 2500);

      return reply.send({
        date: dateKey,
        limits: {
          geocode: maxGeo,
          distance: maxDist,
        },
        usage: {
          geocode: geoCount,
          distance: distCount,
          total,
        },
        remaining: {
          geocode: Math.max(0, maxGeo - geoCount),
          distance: Math.max(0, maxDist - distCount),
        },
      });
    }
  );
}
