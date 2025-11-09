import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDistanceKm } from "../services/geodata/distance.service.js";

const bodySchema = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
});

export async function distanceRoutes(app: FastifyInstance) {
  app.post("/distance", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", issues: parsed.error.issues });
    }
    const { from, to } = parsed.data;
    const km = await getDistanceKm(from, to);
    return reply.send({ km });
  });
}
