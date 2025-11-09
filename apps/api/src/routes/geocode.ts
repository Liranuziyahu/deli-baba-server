import { FastifyInstance } from "fastify";
import { z } from "zod";
import { geocodeAddress, geocodeBatch } from "../services/geodata/geocode.service";

const singleSchema = z.object({
  address: z.string().min(3, "Address is required and must be at least 3 characters long"),
});

const batchSchema = z.object({
  addresses: z.array(z.string().min(3)).min(1, "At least one address is required"),
});

export async function geocodeRoutes(app: FastifyInstance) {
  // 🔹 כתובת בודדת
  app.post(
    "/geocode",
    { preHandler: [app.authenticate] }, // 🛡️ דרישת JWT
    async (req, reply) => {
      const parsed = singleSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(parsed.error);

      const { address } = parsed.data;
      const coords = await geocodeAddress(address);
      if (!coords) return reply.code(404).send({ error: `Could not geocode "${address}"` });
      return reply.send(coords);
    }
  );

  // 🔹 כמה כתובות במקביל
  app.post(
    "/geocode/batch",
    { preHandler: [app.authenticate] }, // 🛡️ דרישת JWT
    async (req, reply) => {
      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(parsed.error);

      const { addresses } = parsed.data;
      const results = await geocodeBatch(addresses);
      return reply.send({ results });
    }
  );
}
