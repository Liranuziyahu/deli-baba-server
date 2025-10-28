import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { log } from "console";

export default async function authRoutes(app: FastifyInstance) {
  const prisma = app.prisma;

  app.post("/auth/register", async (req, reply) => {
    const { email, password, name } = req.body as any;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(400).send({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash: hash, fullName: name } });
    reply.send({ id: user.id, email: user.email, name: user.name });
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password } = req.body as any;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({ id: user.id, email: user.email });
    reply.send({ token });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    console.log("Authenticated user:");
    return req.user;
  });
}
